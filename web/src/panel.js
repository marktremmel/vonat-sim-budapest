import { tt } from "./i18n.js";
// The dispatcher's board: the whole line at once, the way a Domino panel or
// a SimSig screen shows it. Kilometres left to right.
//
// What it shows is what the simulation does, read from the same functions:
//   * the track as it is — two running lines on double track; on a single-
//     track line (line 2 beyond Óbuda) one line, opening into two at each
//     passing loop, from the same loop ranges the trains use (Traffic.single);
//   * every signal lit by Traffic.signalAspectAt, the function the trains
//     obey (the board used to compute its own, one block out);
//   * a single-track section claimed by a train is drawn in that train's
//     direction colour, so you can see who has the road and who waits;
//   * every train with its name, speed and lateness.
// Everything is labelled from the route's own stops, so it reads right on
// every line (it said "70 · VÁC – SZOB" on all of them, and on line 2 its
// kilometre scale ran to 999).
export const PANEL = { pad: 54, gap: 40 };

export function panelLayout(canvas, route, view) {
  const W = canvas.width, H = canvas.height, s = W / 1200;
  const left = PANEL.pad * s * 1.6, right = W - PANEL.pad * s;
  const mid = H * 0.46;
  const z = (view && view.zoom) || 1, pan = (view && view.pan) || 0;
  const pts = route.r.track_down;
  const kmA = pts[0][3] / 1000, kmB = pts[pts.length - 1][3] / 1000;
  const span = (kmB - kmA) / z;
  const centre = kmA + (kmB - kmA) * 0.5 + pan;
  let km0 = centre - span / 2, km1 = centre + span / 2;
  if (km0 < kmA) { km1 += kmA - km0; km0 = kmA; }
  if (km1 > kmB) { km0 -= km1 - kmB; km1 = kmB; }
  km0 = Math.max(km0, kmA);
  return {
    s, W, H, left, right, mid, km0, km1,
    x: km => left + (km - km0) / (km1 - km0) * (right - left),
    yDown: mid - PANEL.gap * s,
    yUp: mid + PANEL.gap * s,
  };
}

const DIR_COL = { 1: "rgba(120,226,206,.95)", "-1": "rgba(243,196,82,.95)" };

export function drawPanel(c, canvas, st) {
  const { route, traffic, driver, clockSec } = st;
  const L = panelLayout(canvas, route, st.view);
  const { s, W, H } = L;
  const stops = route.r.stops.slice().sort((a, b) => a.km - b.km);
  const first = stops[0] ? stops[0].name : "", last = stops.length ? stops[stops.length - 1].name : "";
  const single = traffic.single || [];
  const isSingle = single.length > 0;
  const inSingle = km => single.findIndex(([a, b]) => km * 1000 > a && km * 1000 < b);

  c.fillStyle = "rgba(6,11,16,.965)";
  c.fillRect(0, 0, W, H);

  // title and clock
  c.textAlign = "left";
  c.fillStyle = "rgba(63,203,210,.95)";
  c.font = `700 ${Math.round(19*s)}px "Archivo", system-ui, sans-serif`;
  c.fillText(tt("Forgalomirányítás", "Dispatcher"), L.left, 40*s);
  c.fillStyle = "rgba(130,160,178,.85)";
  c.font = `400 ${Math.round(11*s)}px "IBM Plex Mono", monospace`;
  c.fillText(`${first} – ${last}` + (isSingle ? tt(" · egyvágányú szakaszokkal", " · with single-track sections") : tt(" · kétvágányú", " · double track")), L.left, 58*s);
  const hh = String(Math.floor(clockSec/3600)%24).padStart(2,"0");
  const mm = String(Math.floor(clockSec%3600/60)).padStart(2,"0");
  const ss = String(Math.floor(clockSec%60)).padStart(2,"0");
  c.textAlign = "right";
  c.fillStyle = "rgba(236,244,248,.96)";
  c.font = `600 ${Math.round(26*s)}px "IBM Plex Mono", monospace`;
  c.fillText(`${hh}:${mm}:${ss}`, L.right, 50*s);
  // the dispatcher game: time left, and your lateness against the automatic
  const D = st.dispatching;
  if (D) {
    c.font = `600 ${Math.round(12*s)}px "IBM Plex Mono", monospace`;
    c.fillStyle = "rgba(255,224,138,.95)";
    c.fillText(tt(`hátra ${Math.ceil(D.left / 60)} perc  ·  várakozás pirosnál: te ${Math.round(D.mine / 60)}′  ·  automatika ${Math.round(D.auto / 60)}′`,
                  `${Math.ceil(D.left / 60)} min left  ·  waiting at red: you ${Math.round(D.mine / 60)}′  ·  automatic ${Math.round(D.auto / 60)}′`),
               L.right, 72*s);
    if (D.broken && D.broken.failT > 0) {
      c.fillStyle = "rgba(255,114,100,.95)";
      c.fillText(tt(`${D.broken.name} meghibásodott a km ${(D.broken.m / 1000).toFixed(1)}-nél · még ${Math.ceil(D.broken.failT / 60)} perc`,
                   `${D.broken.name} failed at km ${(D.broken.m / 1000).toFixed(1)} · ${Math.ceil(D.broken.failT / 60)} min more`), L.right, 90*s);
    }
  }
  c.textAlign = "left";

  // kilometre scale (chainage from the first station)
  c.strokeStyle = "rgba(90,120,138,.22)"; c.lineWidth = 1*s;
  c.fillStyle = "rgba(110,140,158,.75)";
  c.font = `400 ${Math.round(9.5*s)}px "IBM Plex Mono", monospace`;
  const kmStep = (L.km1 - L.km0) > 30 ? 5 : (L.km1 - L.km0) > 12 ? 2 : 1;
  for (let km = Math.ceil(L.km0 / kmStep) * kmStep; km <= L.km1; km += kmStep) {
    const x = L.x(km);
    c.beginPath(); c.moveTo(x, L.yDown - 50*s); c.lineTo(x, L.yUp + 50*s); c.stroke();
    c.fillText(String(km), x + 3*s, L.yDown - 54*s);
  }

  // the track
  const TRACK = "rgba(216,232,240,.85)";
  const line = (x0, y0, x1, y1, col, w) => {
    c.strokeStyle = col; c.lineWidth = w * s;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  };
  if (!isSingle) {
    line(L.left, L.yDown, L.right, L.yDown, TRACK, 2);
    line(L.left, L.yUp, L.right, L.yUp, TRACK, 2);
    c.fillStyle = "rgba(120,150,168,.8)";
    c.font = `500 ${Math.round(9.5*s)}px "IBM Plex Mono", monospace`;
    c.fillText(`→ ${last.toUpperCase()}`, L.left, L.yDown - 10*s);
    c.fillText(`← ${first.toUpperCase()}`, L.left, L.yUp + 18*s);
  } else {
    // two lines where there are two tracks, one where there is one; a
    // single-track section someone has claimed is drawn in their colour
    const sorted = single.slice().sort((a, b) => a[0] - b[0]);
    st.hitSections = [];
    let at = L.km0 * 1000;
    const dbl = (a, b) => {
      const x0 = L.x(Math.max(L.km0, a / 1000)), x1 = L.x(Math.min(L.km1, b / 1000));
      if (x1 <= x0) return;
      line(x0, L.yDown, x1, L.yDown, TRACK, 2);
      line(x0, L.yUp, x1, L.yUp, TRACK, 2);
    };
    sorted.forEach(([a, b]) => {
      const i = single.indexOf(single.find(q => q[0] === a && q[1] === b));
      if (a > at) dbl(at, a);
      const x0 = L.x(Math.max(L.km0, a / 1000)), x1 = L.x(Math.min(L.km1, b / 1000));
      if (x1 > x0) {
        // the turnouts into and out of the section
        line(x0, L.yDown, x0 + 8*s, L.mid, TRACK, 1.6);
        line(x0, L.yUp, x0 + 8*s, L.mid, TRACK, 1.6);
        line(x1 - 8*s, L.mid, x1, L.yDown, TRACK, 1.6);
        line(x1 - 8*s, L.mid, x1, L.yUp, TRACK, 1.6);
        const cl = traffic.claim && traffic.claim[i];
        line(x0 + 8*s, L.mid, x1 - 8*s, L.mid, cl ? DIR_COL[cl.dir] : TRACK, cl ? 3.2 : 2);
        // the dispatcher's order for this section: who goes next
        const pf = traffic.prefer && traffic.prefer[i];
        const xm = (x0 + x1) / 2;
        if (pf) {
          c.fillStyle = DIR_COL[pf];
          c.font = `700 ${Math.round(15*s)}px "IBM Plex Sans", system-ui, sans-serif`;
          c.textAlign = "center";
          c.fillText(pf > 0 ? "▶" : "◀", xm, L.mid - 8*s);
          c.textAlign = "left";
        } else if (x1 - x0 > 18*s) {
          c.fillStyle = "rgba(170,196,210,.45)";
          c.font = `600 ${Math.round(11*s)}px "IBM Plex Sans", system-ui, sans-serif`;
          c.textAlign = "center"; c.fillText("⇄", xm, L.mid - 7*s); c.textAlign = "left";
        }
        st.hitSections.push({ x0, x1, y: L.mid, i });
      }
      at = Math.max(at, b);
    });
    if (at < L.km1 * 1000) dbl(at, L.km1 * 1000);
    c.fillStyle = "rgba(120,150,168,.8)";
    c.font = `500 ${Math.round(9.5*s)}px "IBM Plex Mono", monospace`;
    c.fillText(`→ ${last.toUpperCase()}`, L.left, L.yDown - 10*s);
    c.fillText(`← ${first.toUpperCase()}`, L.left, L.yUp + 18*s);
  }

  // stations and halts: a station name in bold where the track has a loop
  // or more (anything the double/loop ranges cover on single track, or the
  // bigger ones on double track), a halt in plain
  const big = new Set(["Budapest-Nyugati", "Vác", "Szob", "Nagymaros-Visegrád", "Verőce",
                       "Göd", "Dunakeszi", "Esztergom", "Dorog", "Pilisvörösvár", "Piliscsaba",
                       "Rákospalota-Újpest", "Esztergom-Kertváros", "Leányvár"]);
  for (const stp of stops) {
    if (stp.km < L.km0 - 0.2 || stp.km > L.km1 + 0.2) continue;
    const x = L.x(stp.km);
    const loop = isSingle ? inSingle(stp.km) < 0 : big.has(stp.name);
    c.fillStyle = loop ? "rgba(236,244,248,.9)" : "rgba(150,180,196,.6)";
    c.fillRect(x - 1*s, L.yDown - 6*s, 2*s, (L.yUp - L.yDown) + 12*s);
    c.save();
    c.translate(x + 3*s, L.yUp + 32*s); c.rotate(Math.PI/4);
    c.fillStyle = loop ? "rgba(243,224,150,.95)" : "rgba(150,180,196,.85)";
    c.font = `${loop ? 600 : 400} ${Math.round(10.5*s)}px "IBM Plex Sans", sans-serif`;
    c.fillText(stp.name, 0, 0);
    c.restore();
  }

  // signals, lit by what the trains obey
  const occD = traffic.occupied(1), occU = traffic.occupied(-1);
  const COL = ["rgba(255,84,72,1)", "rgba(243,196,82,1)", "rgba(243,196,82,1)",
               "rgba(69,217,131,1)", "rgba(236,244,248,1)"];
  st.hitSignals = [];
  for (const m of traffic.sig) {
    const km = m / 1000;
    if (km < L.km0 || km > L.km1) continue;
    const x = L.x(km);
    for (const [dir, y, off] of [[1, L.yDown, -1], [-1, L.yUp, 1]]) {
      const a = traffic.signalAspectAt(m, dir, dir > 0 ? occD : occU);
      const cy = y + off * 15*s;
      c.strokeStyle = "rgba(150,180,196,.5)"; c.lineWidth = 1*s;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, cy); c.stroke();
      c.fillStyle = COL[a];
      c.beginPath(); c.arc(x, cy, 3.8*s, 0, 7); c.fill();
      if (traffic.holds.has(Math.round(m))) {
        c.strokeStyle = "rgba(255,84,72,.95)"; c.lineWidth = 1.6*s;
        c.beginPath(); c.arc(x, cy, 6.6*s, 0, 7); c.stroke();
      }
      st.hitSignals.push({ x, y: cy, r: 9*s, m, dir });
    }
  }

  // trains: on their own line, or on the middle line inside a single section
  st.hitTrains = [];
  const labels = [];
  for (const t of traffic.trains) {
    const isPlayer = t.svc && t.svc.id === "player";
    const km = t.m / 1000;
    if (km < L.km0 - 0.6 || km > L.km1 + 0.6) continue;
    const onSingle = isSingle && inSingle(km) >= 0;
    const y = onSingle ? L.mid : t.dir > 0 ? L.yDown : L.yUp;
    const x = L.x(km);
    const len = Math.max(10*s, (t.length / 1000) / (L.km1 - L.km0) * (L.right - L.left) * 2.4);
    const x0 = t.dir > 0 ? x - len : x, x1 = t.dir > 0 ? x : x + len;
    c.fillStyle = isPlayer ? "rgba(63,203,210,.98)" : DIR_COL[t.dir];
    c.fillRect(x0, y - 5*s, x1 - x0, 10*s);
    // the leading end, as a point
    c.beginPath();
    const tip = t.dir > 0 ? x1 : x0, back = t.dir > 0 ? x1 - 4*s : x0 + 4*s;
    c.moveTo(tip + t.dir * 5*s, y); c.lineTo(back + t.dir * 4*s, y - 5*s); c.lineTo(back + t.dir * 4*s, y + 5*s);
    c.fill();
    if (isPlayer) {
      c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 2*s;
      c.strokeRect(x0 - 2*s, y - 8*s, (x1 - x0) + 4*s, 16*s);
    }
    // waiting at a red: a small red bar in front of it
    if (t.aspect === 0 && t.v < 0.5 && t.dwell <= 0) {
      c.fillStyle = "rgba(255,84,72,.95)";
      c.fillRect(tip + t.dir * 8*s - 1.5*s, y - 9*s, 3*s, 18*s);
    }
    const late = isPlayer ? st.lateness : t.late;
    const lateTxt = late == null ? "" : Math.abs(late) < 60 ? " ·0'" : ` ·${late > 0 ? "+" : "−"}${Math.round(Math.abs(late) / 60)}'`;
    labels.push({ t, isPlayer, x: t.dir > 0 ? x0 - 6*s : x1 + 6*s, y, dir: t.dir,
                  txt: `${isPlayer ? "◆ " : ""}${t.name || "S70"} ${(t.v*3.6)|0}${lateTxt}` });
    st.hitTrains.push({ x0: Math.min(x0,x1), x1: Math.max(x0,x1),
                        y0: y - 9*s, y1: y + 9*s, train: t });
  }
  // labels above or below the line, alternating, so crossing trains do not
  // print over each other
  labels.sort((a, b) => a.x - b.x);
  labels.forEach((lb, i) => {
    c.fillStyle = lb.isPlayer ? "rgba(63,203,210,1)" : "rgba(210,230,240,.92)";
    c.font = `600 ${Math.round(10*s)}px "IBM Plex Mono", monospace`;
    c.textAlign = lb.dir > 0 ? "right" : "left";
    const dy = lb.y === L.mid ? (lb.dir > 0 ? -12 : 20) : 3.6;
    c.fillText(lb.txt, lb.x, lb.y + dy * s);
  });
  c.textAlign = "left";

  // legend and what is coming
  const ly = H - 132*s;
  c.fillStyle = "rgba(120,150,168,.8)";
  c.font = `500 ${Math.round(10*s)}px "IBM Plex Mono", monospace`;
  c.fillText(tt("KÖVETKEZŐ INDULÁSOK", "NEXT DEPARTURES"), L.left, ly);
  const upcoming = traffic.services.slice(traffic.cursor, traffic.cursor + 6);
  upcoming.forEach((sv, i) => {
    const t = sv.enter_s;
    const y = ly + (18 + i * 14) * s;
    c.fillStyle = "rgba(200,222,234,.9)";
    c.font = `400 ${Math.round(11*s)}px "IBM Plex Mono", monospace`;
    c.fillText(`${String(Math.floor(t/3600)%24).padStart(2,"0")}:${String(Math.floor(t%3600/60)).padStart(2,"0")}`, L.left, y);
    c.fillStyle = DIR_COL[sv.dir];
    c.fillText(`${sv.name}`, L.left + 50*s, y);
    c.fillStyle = "rgba(150,180,196,.85)";
    c.fillText(sv.dir > 0 ? `${first} → ${last}` : `${last} → ${first}`, L.left + 110*s, y);
  });
  const gx = L.left + 470*s;
  const leg = [
    [DIR_COL[1], tt(`→ ${last} felé`, `→ to ${last}`)], [DIR_COL[-1], tt(`← ${first} felé`, `← to ${first}`)], ["rgba(63,203,210,.98)", tt("◆ a te vonatod", "◆ your train")],
    ["rgba(255,84,72,1)", tt("piros jelző / vár", "red signal / waiting")], ["rgba(243,196,82,1)", tt("sárga: a következő piros", "yellow: next is red")], ["rgba(69,217,131,1)", tt("szabad", "clear")],
  ];
  if (isSingle) leg.push(["rgba(236,244,248,.85)", tt("egy vágány: a színe azé, aki lefoglalta", "single track: coloured by who holds it")]);
  leg.forEach(([col, txt], i) => {
    const y = ly + (i % 4) * 16*s, x = gx + Math.floor(i / 4) * 260*s;
    c.fillStyle = col; c.fillRect(x, y - 7*s, 14*s, 7*s);
    c.fillStyle = "rgba(170,196,210,.9)";
    c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
    c.fillText(txt, x + 20*s, y);
  });

  c.fillStyle = "rgba(110,140,158,.8)";
  c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
  c.textAlign = "right";
  c.fillText((isSingle ? tt("szakaszra kattintva: ki megy előbb (▶ ◀)  ·  ", "click a section: who goes first (▶ ◀)  ·  ") : "")
           + tt("jelző: tartás  ·  vonat: követés  ·  görgő, húzás: nagyítás  ·  Q: bezár", "signal: hold  ·  train: follow  ·  wheel, drag: zoom  ·  Q: close"), L.right, H - 24*s);
  c.textAlign = "left";
  return L;
}
