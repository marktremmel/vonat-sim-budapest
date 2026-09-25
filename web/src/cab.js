import { tt } from "./i18n.js";
// The driver's desk. Drawn flat over the scene the way EasyLine and the
// DOS-era simulators did it — pillars, a roof edge, and a console you read
// rather than a modelled interior you fly through.
export function drawInstruments(c, canvas, st) {
  const W = canvas.width, H = canvas.height, s = W / 1200;

  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "rgba(34,39,45,0.85)");
  bg.addColorStop(1, "rgba(19,23,28,0.90)");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(140,165,182,.18)"; c.lineWidth = 2;
  c.strokeRect(1, 1, W - 2, H - 2);
  const cy = H * 0.5;

  // Add subtle dirt/reflection overlay to simulate glass
  c.fillStyle = "rgba(255,255,255,0.02)";
  c.fillRect(0, 0, W, H * 0.15);
  c.fillStyle = "rgba(255,255,255,0.01)";
  c.fillRect(0, H * 0.15, W, H * 0.25);

  // Laid out on a grid in a 1200 x 293 logical desk (the canvas is 2048 x 500).
  // Five columns, nothing shared: speed, controller, brake pipe, signal and
  // trip, switches. It had grown panels at fixed fractions that overlapped.
  const X = v => v * s, Y = v => v * s;

  // ---- speedometer
  dial(c, X(140), Y(146), Y(116), st.kmh, st.limit, s);

  // ---- the controller: lever position, traction and brake effort
  {
    const x = X(280);
    c.fillStyle = "rgba(140,170,190,.8)";
    c.font = `500 ${Math.round(12*s)}px "IBM Plex Mono", monospace`;
    c.fillText(tt("KONTROLLER", "CONTROLLER"), x, Y(46));
    const lv = st.lever;
    c.fillStyle = lv == null ? "rgba(150,180,196,.85)" : lv === "EB" ? "rgba(255,90,80,1)"
                : lv[0] === "P" ? "rgba(69,217,131,1)" : lv[0] === "B" ? "rgba(255,150,120,1)" : "rgba(236,244,248,1)";
    c.font = `700 ${Math.round(30*s)}px "IBM Plex Mono", monospace`;
    c.fillText(lv == null ? "AUTO" : lv, x, Y(80));
    bar(c, x, Y(100), X(118), s, st.throttle, "rgba(69,217,131,.92)", "VONÓ");
    bar(c, x, Y(122), X(118), s, st.brake, "rgba(255,114,100,.92)", "FÉK");
    // catenary volts: 25 kV 50 Hz, and it sags when the whole line is pulling
    const y = Y(150);
    c.fillStyle = "rgba(12,15,19,.95)";
    roundRect(c, x, y, X(170), Y(46), 3*s); c.fill();
    c.strokeStyle = "rgba(130,160,180,.35)"; c.lineWidth = 1.2*s;
    roundRect(c, x, y, X(170), Y(46), 3*s); c.stroke();
    c.fillStyle = "rgba(150,180,196,.8)";
    c.font = `400 ${Math.round(10*s)}px "IBM Plex Mono", monospace`;
    c.fillText(tt("FELSŐVEZETÉK", "CATENARY"), x + 9*s, y + 14*s);
    c.fillStyle = st.kv < 21 ? "rgba(243,196,82,.95)" : "rgba(120,226,206,.95)";
    c.font = `600 ${Math.round(20*s)}px "IBM Plex Mono", monospace`;
    c.fillText(`${st.kv.toFixed(1)} kV`, x + 9*s, y + 37*s);
    c.fillStyle = "rgba(140,170,190,.8)";
    c.font = `400 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
    c.fillText(`${st.pax} ${tt("utas", "pax")}`, x, Y(226));
  }

  // ---- brake pipe pressure, the second dial a driver actually watches
  dialSmall(c, X(555), Y(140), Y(72), st.pipe != null ? st.pipe : 5.0 - st.brake * 1.6, 6.0, "bar", s);
  c.fillStyle = "rgba(140,170,190,.7)";
  c.font = `400 ${Math.round(10*s)}px "IBM Plex Mono", monospace`;
  c.textAlign = "center"; c.fillText("FŐLÉGVEZETÉK", X(555), Y(236)); c.textAlign = "left";

  // ---- EVM-120 cab repeat
  const ex = X(660), eW = X(236);
  c.fillStyle = "rgba(10,13,17,.92)";
  roundRect(c, ex, Y(30), eW, Y(78), 5*s); c.fill();
  c.strokeStyle = "rgba(120,150,170,.35)"; c.lineWidth = 1*s; c.stroke();
  const aspCol = ["rgba(255,84,72,1)", "rgba(243,196,82,1)", "rgba(243,196,82,1)",
                  "rgba(69,217,131,1)", "rgba(240,246,250,1)"][st.aspect] || "#888";
  c.fillStyle = aspCol;
  c.beginPath(); c.arc(ex + 28*s, Y(69), 14*s, 0, 7); c.fill();
  c.fillStyle = "rgba(220,235,245,.95)";
  c.font = `600 ${Math.round(19*s)}px "IBM Plex Sans", system-ui, sans-serif`;
  c.fillText(st.aspectName, ex + 52*s, Y(66));
  c.fillStyle = "rgba(140,170,190,.85)";
  c.font = `400 ${Math.round(12*s)}px "IBM Plex Mono", monospace`;
  c.fillText("EVM-120", ex + 52*s, Y(86));

  // ---- the trip strip
  const ty = Y(120);
  c.fillStyle = "rgba(10,13,17,.92)";
  roundRect(c, ex, ty, eW, Y(112), 5*s); c.fill();
  c.strokeStyle = "rgba(120,150,170,.35)"; c.stroke();
  c.fillStyle = "rgba(200,225,238,.95)";
  c.font = `600 ${Math.round(17*s)}px "IBM Plex Sans", system-ui, sans-serif`;
  let nm = st.nextName;
  while (nm.length > 4 && c.measureText(nm).width > eW - 20*s) nm = nm.slice(0, -2) + "…";
  c.fillText(nm, ex + 12*s, ty + 26*s);
  c.font = `400 ${Math.round(14*s)}px "IBM Plex Mono", monospace`;
  c.fillStyle = "rgba(150,180,196,.9)";
  c.fillText(st.nextDist, ex + 12*s, ty + 50*s);
  c.fillText(`km ${st.km}   ${st.clock}`, ex + 12*s, ty + 72*s);
  if (st.lateText) {
    c.fillStyle = st.lateCol;
    c.font = `600 ${Math.round(16*s)}px "IBM Plex Mono", monospace`;
    c.fillText(st.lateText, ex + 12*s, ty + 98*s);
  }

  // ---- the switch panel. Labelled, and each one does something. The rects
  // are recorded in canvas pixels so a click on the desk can be resolved
  // back to a switch: the instrument face is one quad with a known UV, so
  // the ray hits it, the UV gives a pixel, and the pixel gives a switch.
  st.hits = [];
  const SW = [
    { id: "feny",  label: tt("FÉNY", "LIGHTS"),  on: st.lights > 0, val: tt(["KI","TOMP","TÁVOL"], ["OFF","DIP","MAIN"])[st.lights] },
    { id: "torlo", label: tt("TÖRLŐ", "WIPER"), on: st.wiper > 0, val: tt(["KI","LASSÚ","GYORS"], ["OFF","SLOW","FAST"])[st.wiper] },
    { id: "kurt",  label: tt("KÜRT", "HORN"),  on: st.horn,
      val: tt(["MINDKETTŐ", "MÉLY", "MAGAS", "LÉGSÍP"], ["BOTH", "LOW", "HIGH", "WHISTLE"])[st.hornMode || 0] },
    { id: "eber",  label: tt("ÉBER", "VIGIL."),  on: st.vigilance || st.vigAck,
      val: st.vigilance ? tt("NYUGTÁZ", "ACK!") : st.vigAck ? tt("NYUGTÁZVA", "ACKED") : "OK",
      alarm: st.vigilance },
    { id: "ajto",  label: tt("AJTÓ", "DOORS"),  on: st.doors, val: st.doors ? tt("NYITVA", "OPEN") : tt("ZÁRVA", "SHUT") },
    { id: "homok", label: tt("HOMOK", "SAND"), on: st.sand, val: st.sand ? tt("SZÓR", "ON") : tt("KI", "OFF") },
  ];
  // two across, three down, in the right-hand column
  const swW = X(128), swH = Y(60), gap = X(8);
  const bx0 = X(912), by0 = Y(30);
  SW.forEach((sw, i) => {
    const col = i % 2, row = (i / 2) | 0;
    const x = bx0 + col * (swW + gap), y = by0 + row * (swH + gap);
    st.hits.push({ id: sw.id, x, y, w: swW, h: swH });
    const flash = sw.alarm && (Math.floor(st.clockMs / 320) % 2 === 0);
    c.fillStyle = flash ? "rgba(120,58,20,1)" : "rgba(16,20,25,1)";
    roundRect(c, x, y, swW, swH, 4*s); c.fill();
    c.strokeStyle = sw.on ? "rgba(63,203,210,.65)" : "rgba(90,110,124,.35)";
    c.lineWidth = 1.4*s; roundRect(c, x, y, swW, swH, 4*s); c.stroke();
    // the tell-tale
    c.fillStyle = sw.alarm ? (flash ? "rgba(255,196,82,1)" : "rgba(90,60,30,1)")
               : sw.on ? "rgba(69,217,131,.95)" : "rgba(58,68,76,1)";
    c.beginPath(); c.arc(x + 16*s, y + swH/2, 7*s, 0, 7); c.fill();
    c.fillStyle = "rgba(196,216,230,.95)";
    c.font = `600 ${Math.round(15*s)}px "IBM Plex Mono", monospace`;
    c.fillText(sw.label, x + 31*s, y + 25*s);
    c.fillStyle = sw.on ? "rgba(63,203,210,.9)" : "rgba(130,150,164,.75)";
    c.font = `400 ${Math.round(12*s)}px "IBM Plex Mono", monospace`;
    c.fillText(sw.val, x + 31*s, y + 44*s);
  });
}

function dialSmall(c, x, y, R, v, vmax, unit, s) {
  c.fillStyle = "rgba(10,13,17,.95)";
  c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  c.strokeStyle = "rgba(130,160,180,.4)"; c.lineWidth = 1.4*s;
  c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke();
  const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
  c.strokeStyle = "rgba(170,195,212,.75)";
  for (let i = 0; i <= 6; i++) {
    const a = a0 + (i / 6) * (a1 - a0);
    c.lineWidth = 1.4*s;
    c.beginPath();
    c.moveTo(x + Math.cos(a)*(R - 11*s), y + Math.sin(a)*(R - 11*s));
    c.lineTo(x + Math.cos(a)*(R - 3*s), y + Math.sin(a)*(R - 3*s));
    c.stroke();
  }
  const a = a0 + Math.max(0, Math.min(1, v / vmax)) * (a1 - a0);
  c.strokeStyle = "rgba(150,200,235,.95)"; c.lineWidth = 2.4*s; c.lineCap = "round";
  c.beginPath(); c.moveTo(x, y);
  c.lineTo(x + Math.cos(a)*(R - 14*s), y + Math.sin(a)*(R - 14*s)); c.stroke();
  c.lineCap = "butt";
  c.fillStyle = "rgba(140,170,190,.85)";
  c.font = `400 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.textAlign = "center";
  c.fillText(unit, x, y + R * 0.62);
  c.textAlign = "left";
}

function bar(c, x, y, w, s, v, col, label) {
  c.fillStyle = "rgba(255,255,255,.10)";
  roundRect(c, x, y, w, 12*s, 2*s); c.fill();
  c.fillStyle = col;
  roundRect(c, x, y, w * Math.max(0, Math.min(1, v)), 12*s, 2*s); c.fill();
  c.fillStyle = "rgba(140,170,190,.8)";
  c.font = `500 ${Math.round(12*s)}px "IBM Plex Mono", monospace`;
  c.fillText(label, x + w + 8*s, y + 10*s);
}

function dial(c, x, y, R, kmh, limit, s) {
  c.fillStyle = "rgba(10,13,17,.95)";
  c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  c.strokeStyle = "rgba(130,160,180,.45)"; c.lineWidth = 1.6*s;
  c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke();
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, vmax = 140;
  // the line limit as a red arc
  if (limit) {
    c.strokeStyle = "rgba(255,84,72,.55)"; c.lineWidth = 4*s;
    c.beginPath();
    c.arc(x, y, R - 7*s, a0 + (limit/vmax)*(a1-a0), a1);
    c.stroke();
  }
  c.strokeStyle = "rgba(180,205,220,.8)";
  for (let v = 0; v <= vmax; v += 10) {
    const a = a0 + (v/vmax)*(a1-a0);
    const big = v % 20 === 0;
    c.lineWidth = big ? 2*s : 1*s;
    c.beginPath();
    c.moveTo(x + Math.cos(a)*(R - (big ? 15 : 10)*s), y + Math.sin(a)*(R - (big ? 15 : 10)*s));
    c.lineTo(x + Math.cos(a)*(R - 4*s), y + Math.sin(a)*(R - 4*s));
    c.stroke();
    if (big && v % 40 === 0) {
      c.fillStyle = "rgba(190,214,228,.85)";
      c.font = `500 ${Math.round(14*s)}px "IBM Plex Mono", monospace`;
      c.textAlign = "center";
      c.fillText(String(v), x + Math.cos(a)*(R - 27*s), y + Math.sin(a)*(R - 24*s));
      c.textAlign = "left";
    }
  }
  const a = a0 + (Math.min(kmh, vmax)/vmax)*(a1-a0);
  c.strokeStyle = "rgba(255,96,84,.95)"; c.lineWidth = 3*s; c.lineCap = "round";
  c.beginPath(); c.moveTo(x - Math.cos(a)*R*0.16, y - Math.sin(a)*R*0.16);
  c.lineTo(x + Math.cos(a)*(R - 18*s), y + Math.sin(a)*(R - 18*s)); c.stroke();
  c.lineCap = "butt";
  c.fillStyle = "rgba(200,225,238,.95)";
  c.beginPath(); c.arc(x, y, 4.5*s, 0, 7); c.fill();
  c.fillStyle = "rgba(230,242,250,.96)";
  c.font = `700 ${Math.round(30*s)}px "IBM Plex Mono", monospace`;
  c.textAlign = "center";
  c.fillText(String(Math.round(kmh)), x, y + R*0.62);
  c.font = `400 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.fillStyle = "rgba(140,170,190,.8)";
  c.fillText("km/h", x, y + R*0.62 + 12*s);
  c.textAlign = "left";
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r); c.closePath();
}


// --------------------------------------------------------- cab geometry
// Built fresh each frame in the train's own frame of reference, so it rides
// with the vehicle and stays put when you turn your head.
export function buildCab(eye, fwd, right, up) {
  const V = [], C = [], U = [];
  const P = (r, u, f) => [
    eye[0] + right[0]*r + up[0]*u + fwd[0]*f,
    eye[1] + right[1]*r + up[1]*u + fwd[1]*f,
    eye[2] + right[2]*r + up[2]*u + fwd[2]*f,
  ];
  const quad = (a, b, c2, d, col, uv) => {
    const pts = [a, b, c2, a, c2, d];
    const uvs = uv ? [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]]
                   : [[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1],[-1,-1]];
    pts.forEach((p, i) => {
      V.push(p[0], p[1], p[2]);
      C.push(col[0], col[1], col[2]);
      U.push(uvs[i][0], uvs[i][1]);
    });
  };
  const dark = [0.115, 0.125, 0.135];
  const mid  = [0.185, 0.200, 0.215];
  const desk = [0.145, 0.155, 0.170];

  // The eye sat almost on the console. Push the whole cab forward and drop
  // the desk so there is room to sit in it.
  const HW = 1.52, TOP = 0.86, BOT = -1.45, FRONT = 2.15, BACK = -1.25;
  const DESK_Y = -0.80, DESK_F = 1.05, SILL = -0.66;

  // windscreen surround: header, two pillars, and a sill that reaches the
  // desk. Without the sill there is a gap you can see the world through.
  quad(P(-HW, TOP, FRONT), P(HW, TOP, FRONT), P(HW, 0.56, FRONT), P(-HW, 0.56, FRONT), mid);
  for (const sg of [-1, 1]) {
    quad(P(sg*HW, TOP, FRONT), P(sg*(HW-0.26), TOP, FRONT),
         P(sg*(HW-0.26), SILL, FRONT), P(sg*HW, SILL, FRONT), mid);
  }
  quad(P(-HW, SILL, FRONT), P(HW, SILL, FRONT),
       P(HW, DESK_Y, FRONT), P(-HW, DESK_Y, FRONT), mid);
  // and close the corner between the sill and the side walls
  for (const sg of [-1, 1]) {
    quad(P(sg*HW, SILL, FRONT), P(sg*HW, DESK_Y, FRONT),
         P(sg*HW, DESK_Y, DESK_F), P(sg*HW, SILL, DESK_F), mid);
  }
  // roof and rear
  quad(P(-HW, TOP, FRONT), P(HW, TOP, FRONT), P(HW, TOP, BACK), P(-HW, TOP, BACK), dark);
  quad(P(HW, TOP, BACK), P(-HW, TOP, BACK), P(-HW, BOT, BACK), P(HW, BOT, BACK), dark);
  // side walls with a window opening
  for (const sg of [-1, 1]) {
    const x = sg * HW;
    quad(P(x, TOP, FRONT), P(x, TOP, BACK), P(x, 0.38, BACK), P(x, 0.38, FRONT), mid);
    quad(P(x, -0.34, FRONT), P(x, -0.34, BACK), P(x, BOT, BACK), P(x, BOT, FRONT), mid);
    quad(P(x, 0.38, -0.10), P(x, 0.38, -0.36), P(x, -0.34, -0.36), P(x, -0.34, -0.10), mid);
  }
  // floor
  quad(P(-HW, BOT, FRONT), P(HW, BOT, FRONT), P(HW, BOT, BACK), P(-HW, BOT, BACK), dark);
  // desk: a sloped console with the instruments on its face
  quad(P(-HW, DESK_Y, FRONT), P(HW, DESK_Y, FRONT),
       P(HW, DESK_Y, DESK_F), P(-HW, DESK_Y, DESK_F), desk);
  // stand the instrument face up a little so a short glance down finds it
  // A 3 m wide face only 0.5 m deep squashes the texture 6:1 and the labels
  // turn to mush. Make it deeper and match the canvas aspect to it.
  const faceA = P(-HW, DESK_Y, DESK_F), faceB = P(HW, DESK_Y, DESK_F);
  const faceC = P(HW, -1.16, 0.42), faceD = P(-HW, -1.16, 0.42);
  quad(faceA, faceB, faceC, faceD, desk, [[0,0],[1,0],[1,1],[0,1]]);
  quad(P(-HW, -1.16, 0.42), P(HW, -1.16, 0.42),
       P(HW, BOT, 0.36), P(-HW, BOT, 0.36), dark);

  return { verts: new Float32Array(V), cols: new Float32Array(C),
           uvs: new Float32Array(U), count: V.length / 3,
           // the instrument face, so a click can be turned into a pixel:
           // p = A + u*(B-A) + v*(D-A), and the canvas is the same u,v
           face: [faceA, faceB, faceC, faceD] };
}
