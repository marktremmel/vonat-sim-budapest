import { tt, LANG } from "./i18n.js";
// The canvas overlay. Everything drawn in 2D over the finished scene:
// the hill and place labels, the inset map, the speed and brake read-outs
// and the banners. It reads the frame's state and writes nothing back.

export const LAYERS = [
  { key: "hills", label: tt("hegyek", "hills") },
  { key: "places", label: tt("települések", "towns and villages") },
  { key: "landmarks", label: tt("nevezetességek, templomok", "landmarks and churches") },
  { key: "all", label: tt("minden", "everything") },
  { key: "none", label: tt("semmi", "nothing") },
];

function project(vp, w) {
  const x = vp[0]*w[0] + vp[4]*w[1] + vp[8]*w[2] + vp[12];
  const y = vp[1]*w[0] + vp[5]*w[1] + vp[9]*w[2] + vp[13];
  const z = vp[3]*w[0] + vp[7]*w[1] + vp[11]*w[2] + vp[15];
  if (z <= 0.01) return null;
  return [x / z, y / z];
}

export function isAuthenticStreetOrSquare(name) {
  if (!name || typeof name !== "string") return false;
  const n = name.trim();
  if (n.length < 3) return false;
  // Reject statues, memorials, cemeteries, persons without street suffixes, shops, etc.
  if (/szobor|emlékmű|emléktábla|temető|parkoló|játszótér|óvoda|iskola|étterem|kávézó|gyógyszertár|orvosi|rendelő/i.test(n)) return false;
  // BKK stops / stations
  if (/[MH]$/.test(n) || /pályaudvar|vasútállomás|állomás|megálló/i.test(n)) return true;
  // Authentic street/square suffix
  // (\b is ASCII-only in JS: it never matched before "út", so every
  // Andrássy út and Váci út was rejected. Letters are tested with \p{L}.)
  return /(?<!\p{L})(utca|út|útja|körút|krt\.?|tér|tere|rakpart|rkp\.?|híd|fasor|sétány|sor|köz|árok|dűlő|lejtő|központ)(?!\p{L})/iu.test(n);
}

function drawStreetSign(c, W, H, s, streetName) {
  if (!streetName || state.bareLevel >= 1 || state.panel || !isAuthenticStreetOrSquare(streetName)) return;
  c.save();
  const padX = 14 * s, padY = 7 * s;
  c.font = `700 ${Math.round(13.5 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
  const text = streetName.toUpperCase();
  const tw = c.measureText(text).width;
  const pw = tw + padX * 2, ph = 26 * s;
  // Positioned elegantly at top-centre, directly below the mode bar, completely free of the settings panel
  const px = Math.round((W - pw) * 0.5), py = Math.round(48 * s);

  // Subtle drop shadow for realism
  c.shadowColor = "rgba(0, 0, 0, 0.40)";
  c.shadowBlur = 8 * s;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 3 * s;

  // Authentic Budapest enamel street plate: White gloss body, crisp black border, hairline inner line
  c.fillStyle = "rgba(248, 250, 252, 0.98)";
  c.beginPath();
  if (c.roundRect) c.roundRect(px, py, pw, ph, 4.5 * s);
  else c.rect(px, py, pw, ph);
  c.fill();

  // Reset shadow for crisp stroke and text
  c.shadowColor = "transparent";
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;

  c.strokeStyle = "#12161a";
  c.lineWidth = 2.2 * s;
  c.stroke();

  // Inner hairline border
  c.strokeStyle = "rgba(18, 22, 26, 0.55)";
  c.lineWidth = 0.9 * s;
  c.strokeRect(px + 2.8 * s, py + 2.8 * s, pw - 5.6 * s, ph - 5.6 * s);

  // Black sharp text
  c.fillStyle = "#12161a";
  c.textAlign = "center";
  c.fillText(text, px + pw * 0.5, py + ph - 8 * s);
  c.restore();
}

function drawTramHud(c, W, H, s, st, world) {
  const T = state.tram;
  const trams = window.__trams;
  if (!T || !trams) return;
  const r = trams.routes[T.ri];
  if (!r) return;
  const kmh = (T.v != null ? T.v : (T.manual ? (T.manualV || 0) : 9.0)) * 3.6;
  const bh = 82 * s;
  const g = c.createLinearGradient(0, H - bh, 0, H);
  g.addColorStop(0, "rgba(6,12,16,0)"); g.addColorStop(1, "rgba(6,12,16,.90)");
  c.fillStyle = g; c.fillRect(0, H - bh, W, bh);

  // Left card: Tram line badge + destination
  const badgeW = 48 * s, badgeH = 40 * s;
  const badgeX = 20 * s, badgeY = H - 68 * s;
  c.fillStyle = "rgba(245, 196, 20, 0.98)"; // BKK Tram Yellow
  c.beginPath();
  if (c.roundRect) c.roundRect(badgeX, badgeY, badgeW, badgeH, 6 * s);
  else c.fillRect(badgeX, badgeY, badgeW, badgeH);
  c.fill();
  c.fillStyle = "#111417";
  c.font = `800 ${Math.round(23 * s)}px "Archivo", system-ui, sans-serif`;
  c.textAlign = "center";
  c.fillText(r.ref, badgeX + badgeW * 0.5, badgeY + badgeH * 0.72);
  c.textAlign = "left";

  // Line destination and vehicle type
  c.fillStyle = "rgba(240,248,252,.98)";
  c.font = `700 ${Math.round(15 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
  c.fillText(`${r.to ? "→ " + r.to : tt("Budapest villamos", "Budapest tram")}`, badgeX + badgeW + 12 * s, badgeY + 16 * s);
  c.fillStyle = "rgba(150,180,196,.88)";
  c.font = `500 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
  if (state.paused) {
    c.fillStyle = "rgba(243,196,82,.98)";
    c.font = `700 ${Math.round(12 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillText(tt("⏸ SZÜNET (Space: folytatás)", "⏸ PAUSED (Space: resume)"), badgeX + badgeW + 12 * s, badgeY - 5 * s);
  }
  const mdlName = r.ref === "4" || r.ref === "6" ? "Combino Supra (54 m)" : r.ref === "1" ? "CAF Urbos 3 (56 m)" : "Tatra T5C5 / Ganz CSMG";
  c.fillText(`${mdlName} · ${kmh.toFixed(0)} km/h (max 50)`, badgeX + badgeW + 12 * s, badgeY + 34 * s);

  // Center card: Next stop and distance
  const nextStop = T.nextStop;
  if (nextStop) {
    const cx = Math.max(badgeX + badgeW + 280 * s, W * 0.40);
    c.fillStyle = "rgba(8,16,22,.72)";
    c.fillRect(cx - 10 * s, H - 70 * s, 260 * s, 46 * s);
    c.fillStyle = "rgba(63,203,210,.98)";
    c.font = `600 ${Math.round(14 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillText(nextStop.name || tt("Következő megálló", "Next stop"), cx, H - 48 * s);
    c.fillStyle = "rgba(200,220,230,.92)";
    c.font = `500 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
    const atStop = nextStop.dist <= 18;
    const distText = atStop
      ? (T.doors ? tt(`MEGÁLLÓBAN — AJTÓK NYITVA (${T.boarding || 12} utas)`, `AT STOP — DOORS OPEN (${T.boarding || 12} pax)`)
                 : tt("MEGÁLLÓBAN · E/D: ajtónyitás", "AT STOP · E/D: open doors"))
      : `${Math.round(nextStop.dist)} m · ${tt("következő", "next")}`;
    c.fillText(distText, cx, H - 30 * s);
  }

  // Right card: Controls & Driving Mode
  const rx = W - 290 * s;
  c.fillStyle = T.manual ? "rgba(69,217,131,.98)" : "rgba(243,196,82,.98)";
  c.font = `700 ${Math.round(12 * s)}px "IBM Plex Mono", monospace`;
  c.fillText(T.manual ? tt("VEZETŐI MÓD (KÉZI)", "DRIVER MODE (MANUAL)") : tt("MENETRENDI MÓD (AUTO)", "TIMETABLE MODE (AUTO)"), rx, H - 50 * s);

  if (T.manual) {
    const bw = 70 * s;
    const thr = T.throttle || 0, brk = T.brake || 0;
    c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(rx, H - 42 * s, bw, 6 * s);
    c.fillStyle = "rgba(69,217,131,.95)"; c.fillRect(rx, H - 42 * s, bw * thr, 6 * s);
    c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(rx + bw + 10 * s, H - 42 * s, bw, 6 * s);
    c.fillStyle = "rgba(255,114,100,.95)"; c.fillRect(rx + bw + 10 * s, H - 42 * s, bw * brk, 6 * s);
    c.font = `500 ${Math.round(9 * s)}px "IBM Plex Mono", monospace`;
    c.fillStyle = "rgba(150,180,196,.85)";
    c.fillText("GÁZ", rx, H - 28 * s);
    c.fillText("FÉK", rx + bw + 10 * s, H - 28 * s);
  } else {
    c.font = `400 ${Math.round(10.5 * s)}px "IBM Plex Mono", monospace`;
    c.fillStyle = "rgba(150,180,196,.85)";
    c.fillText(tt("W/S: kézi vezetés átvétele", "W/S: take manual control"), rx, H - 32 * s);
  }

  // Keybindings hint bar
  c.fillStyle = "rgba(150,180,196,.85)";
  c.font = `400 ${Math.round(10.5 * s)}px "IBM Plex Mono", monospace`;
  c.fillText(
    tt("W gáz · S fék · Space megállás · E ajtók · M módváltás · C fülke/külső · Esc vissza a vonathoz",
       "W throttle · S brake · Space stop · E doors · M mode · C cab/outside · Esc back to train"),
    20 * s, H - 14 * s
  );
}

export const CHAR_MODELS = [
  { id: 0, gender: "m", name: "Férfi #1 (Dzseki)", en: "Male #1 (Jacket)" },
  { id: 1, gender: "m", name: "Férfi #2 (Kabát)", en: "Male #2 (Coat)" },
  { id: 2, gender: "m", name: "Férfi #3 (Sportos)", en: "Male #3 (Casual)" },
  { id: 3, gender: "m", name: "Férfi #4 (Városi)", en: "Male #4 (Urban)" },
  { id: 4, gender: "m", name: "Férfi #5 (Klasszikus)", en: "Male #5 (Classic)" },
  { id: 5, gender: "m", name: "Férfi #6 (Elegáns)", en: "Male #6 (Smart)" },
  { id: 6, gender: "m", name: "Férfi #7 (Fiatal)", en: "Male #7 (Young)" },
  { id: 7, gender: "m", name: "Férfi #8 (Téli kabát)", en: "Male #8 (Winter Coat)" },
  { id: 8, gender: "m", name: "Férfi #9 (Üzletember)", en: "Male #9 (Business)" },
  { id: 9, gender: "m", name: "Férfi #10 (Kék ing)", en: "Male #10 (Shirt)" },
  { id: 10, gender: "m", name: "Férfi #11 (Kapucnis)", en: "Male #11 (Hoodie)" },
  { id: 11, gender: "m", name: "Férfi #12 (Modern)", en: "Male #12 (Modern)" },
  { id: 12, gender: "m", name: "Férfi #13 (Utazó)", en: "Male #13 (Traveler)" },
  { id: 13, gender: "m", name: "Férfi #14 (Inges)", en: "Male #14 (Casual)" },
  { id: 14, gender: "m", name: "Férfi #15 (Sportos)", en: "Male #15 (Athletic)" },
  { id: 15, gender: "f", name: "Nő #1 (Elegáns kabát)", en: "Female #1 (Elegant Coat)" },
  { id: 16, gender: "f", name: "Nő #2 (Tavaszi ruha)", en: "Female #2 (Spring Outfit)" },
  { id: 17, gender: "f", name: "Nő #3 (Városi szett)", en: "Female #3 (Urban Casual)" },
  { id: 18, gender: "f", name: "Nő #4 (Blézer)", en: "Female #4 (Blazer)" },
  { id: 19, gender: "f", name: "Nő #5 (Kosztüm)", en: "Female #5 (Smart Suit)" },
  { id: 20, gender: "f", name: "Nő #6 (Divatos)", en: "Female #6 (Fashion)" },
  { id: 21, gender: "f", name: "Nő #7 (Fiatalos)", en: "Female #7 (Young)" },
  { id: 22, gender: "f", name: "Nő #8 (Sál / Kabát)", en: "Female #8 (Scarf/Coat)" },
  { id: 23, gender: "f", name: "Nő #9 (Modern)", en: "Female #9 (Modern)" }
];

function drawHeroHud(c, W, H, s) {
  const p = state.person;
  if (!p) return;
  const vx = p.v ? p.v[0] : 0, vy = p.v ? p.v[1] : 0, vz = p.v ? p.v[2] : 0;
  const kmh = Math.hypot(vx, vz, vy) * 3.6;
  const demG = (window.SIM && SIM.demAt) ? SIM.demAt(p.x, p.n) : 105;
  const alt = Math.max(0, Math.round(p.y - demG));
  const isHero = p.heroAbilities !== false;
  const curModel = CHAR_MODELS[p.charIdx || 0] || CHAR_MODELS[0];

  // Speed and state HUD card
  c.fillStyle = "rgba(10, 18, 24, 0.88)";
  c.beginPath();
  if (c.roundRect) c.roundRect(16 * s, H - 132 * s, 250 * s, 76 * s, 6 * s);
  else c.fillRect(16 * s, H - 132 * s, 250 * s, 76 * s);
  c.fill();
  c.strokeStyle = isHero ? "rgba(63, 203, 210, 0.5)" : "rgba(120, 226, 160, 0.5)";
  c.lineWidth = 1 * s;
  c.stroke();

  c.fillStyle = isHero ? "rgba(63, 203, 210, 0.98)" : "rgba(120, 226, 160, 0.98)";
  c.font = `800 ${Math.round(32 * s)}px "Archivo", sans-serif`;
  c.fillText(Math.round(kmh), 28 * s, H - 84 * s);

  c.fillStyle = "rgba(150, 180, 196, 0.9)";
  c.font = `600 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
  c.fillText("km/h", 100 * s, H - 84 * s);

  c.fillStyle = "rgba(240, 248, 252, 0.95)";
  c.font = `700 ${Math.round(11.5 * s)}px "IBM Plex Sans", sans-serif`;
  const isHovering = p.flying && kmh < 6;
  const modeText = isHovering
    ? tt("🦸 Hancock Lebegés (Hover — E: robbanás)", "🦸 Hancock Hover (Airborne idle — E: blast)")
    : p.flying
    ? tt("🦸 Hancock Repülés (W előre, C süllyedés, E robbanás)", "🦸 Hancock Flight (W fly, C dive, E blast)")
    : (isHero ? tt("🦸 Hancock Hős (Földön — E: robbanás)", "🦸 Hancock Hero (Ground — E: blast)") : tt("🚶 Városi Séta (Gyalogos)", "🚶 City Stroll (Pedestrian)"));
  c.fillText(modeText, 28 * s, H - 114 * s);

  c.fillStyle = "rgba(180, 205, 220, 0.88)";
  c.font = `500 ${Math.round(10 * s)}px "IBM Plex Mono", monospace`;
  const charLabel = `${curModel.gender === "m" ? "👨" : "👩"} ${tt(curModel.name, curModel.en)}`;
  c.fillText(`${tt("Magasság", "Alt")}: ${alt} m · ${charLabel}`, 28 * s, H - 65 * s);

  // Bottom prompt & controls
  c.fillStyle = "rgba(63, 203, 210, 0.98)";
  c.font = `700 ${Math.round(13 * s)}px "IBM Plex Sans", sans-serif`;
  c.fillText(tt("Esc — menü / vissza a vonathoz", "Esc — menu / back to train"), 16 * s, H - 34 * s);
  c.fillStyle = "rgba(180, 205, 220, 0.85)";
  c.font = `500 ${Math.round(10.5 * s)}px "IBM Plex Mono", monospace`;
  const controlsHint = p.flying
    ? tt("WASD repülés 3D irányba · E szupererő robbanás · Space emelkedés · C / Ctrl süllyedés · V karakter · F nézet",
         "WASD 3D flight · E shockwave blast · Space ascend · C / Ctrl dive · V avatar · F camera")
    : (isHero
        ? tt("WASD mozgás · E szupererő robbanás / autók repítése · Space repülés · C süllyedés · Shift turbó · V karakter",
             "WASD move · E shockwave blast / blow up cars · Space fly · C dive · Shift turbo · V avatar")
        : tt("WASD séta · Space ugrás · Shift futás · V karakter (1-24) · F nézet",
             "WASD walk · Space jump · Shift run · V avatar (1-24) · F camera"));
  c.fillText(controlsHint, 16 * s, H - 18 * s);
}

function drawCarHud(c, W, H, s) {
  const car = state.car;
  const kmh = Math.abs(car.v) * 3.6;
  c.fillStyle = "rgba(8,16,22,.62)"; c.fillRect(16*s, H - 118*s, 220*s, 62*s);
  c.fillStyle = "rgba(240,248,252,.96)";
  c.font = `700 ${Math.round(34*s)}px "Archivo", system-ui, sans-serif`;
  c.fillText(kmh.toFixed(0), 28*s, H - 74*s);
  c.font = `500 ${Math.round(11*s)}px "IBM Plex Mono", monospace`;
  c.fillStyle = "rgba(150,180,196,.9)";
  c.fillText(`km/h${car.v < -0.3 ? tt(" · hátra", " · reverse") : ""}${car.onBridge ? tt(" · hídon", " · on a bridge") : ""}`, 100*s, H - 74*s);
  c.fillText(tt("autó", "car"), 28*s, H - 104*s);
  c.fillStyle = "rgba(150,180,196,.85)";
  c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
  c.fillText(tt("W gáz · S fék / hátra · A/D kormány · Space kézifék · C vezetőülés · görgő: távolság", "W throttle · S brake / reverse · A/D steer · Space handbrake · C driver's seat · wheel: distance"), 16*s, H - 16*s);
  c.fillStyle = "rgba(63,203,210,.95)";
  c.font = `600 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.fillText(tt("Esc — vissza a vonatra", "Esc — back to the train"), 16*s, H - 34*s);
}

function drawPlaneHud(c, W, H, s) {
  const pl = state.plane;
  const T = (window.SIM && SIM.PLANES && SIM.PLANES[pl.type]) || { name: pl.type };
  const spd = Math.hypot(pl.vel[0], pl.vel[1], pl.vel[2]) * 3.6;
  const g = window.SIM ? SIM.demAt(pl.p[0], -pl.p[2]) : 0;
  const agl = Math.round(pl.p[1] - (isFinite(g) ? g : 0));
  const hdg = Math.round(((pl.yaw * 180 / Math.PI) % 360 + 360) % 360);
  const vs = pl.vel[1];
  const lines = [[T.name, "#3fcbd2"], [`${Math.round(spd)} km/h`], [tt(`${agl} m a talaj felett · ${Math.round(pl.p[1])} m tszf`, `${agl} m above ground · ${Math.round(pl.p[1])} m ASL`)],
                 [`${tt("irány", "heading")} ${String(hdg).padStart(3, "0")}° · ${tt("emelkedés", "climb")} ${vs >= 0 ? "+" : ""}${vs.toFixed(1)} m/s`],
                 [`${pl.type === "heli" ? tt("kollektív", "collective") : tt("gáz", "throttle")} ${Math.round(pl.throttle * 100)}%` +
                  (pl.type === "gripen" && pl.throttle > 0.92 ? tt(" · UTÁNÉGETŐ", " · AFTERBURNER") : "") + (pl.ground ? tt(" · a földön", " · on the ground") : "")]];
  // bottom left, above the key help: the top left is the panel's
  const y0 = H - 58*s - lines.length * 20*s;
  c.fillStyle = "rgba(8,16,22,.62)"; c.fillRect(16*s, y0 - 22*s, 300*s, 14*s + lines.length * 20*s);
  lines.forEach(([l, col], i) => {
    c.fillStyle = col || "rgba(236,244,248,.95)";
    c.font = `${i === 0 ? 600 : 500} ${Math.round((i === 1 ? 17 : 12) * s)}px "IBM Plex Mono", monospace`;
    c.fillText(l, 28*s, y0 + i * 20*s);
  });
  if (pl.stall > 0.3 || pl.crashed > 0) {
    c.fillStyle = "rgba(255,90,80,.98)";
    c.font = `700 ${Math.round(22*s)}px "IBM Plex Mono", monospace`;
    c.textAlign = "center";
    c.fillText(pl.crashed > 0 ? tt("LEZUHANT — újra 400 m-en", "CRASHED — back at 400 m") : tt("ÁTESÉS — nyomd le az orrát, adj gázt", "STALL — nose down, add power"), W / 2, H * 0.3);
    c.textAlign = "left";
  }
  c.fillStyle = "rgba(150,180,196,.85)";
  c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
  c.fillText(pl.type === "heli"
    ? tt("W/S/A/D ciklikus · Q/E pedál · R/F kollektív · C pilótafülke · 1 2 3 gép", "W/S/A/D cyclic · Q/E pedals · R/F collective · C cockpit · 1 2 3 aircraft")
    : tt("W/S bólint · A/D dönt (a dőlés megmarad!) · Q/E oldalkormány · R/F gáz · Space fék a földön · C fülke · 1 2 3 gép",
         "W/S pitch · A/D roll (the bank stays in!) · Q/E rudder · R/F throttle · Space brakes on the ground · C cockpit · 1 2 3 aircraft"),
    16*s, H - 16*s);
  c.fillStyle = "rgba(63,203,210,.95)";
  c.font = `600 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.fillText(tt("Esc — vissza a vonatra", "Esc — back to the train"), 16*s, H - 34*s);
}

// The inset map (and the full map on Tab): the line, every other train,
// and where the camera is and which way it looks. Drawn in flight too.
function drawMap(c, W, H, s, st, world) {
  const { imgMap, routeData, mapMeta } = world;
  {
    const full = state.map;
    if (!full || !state.mapPin) state.mapPinCard = null;
    // The opened map has to fit the window in BOTH directions. Sized on width
    // alone it runs off the top and bottom of a tall window — the map here is
    // portrait, being sixty kilometres of river, so on any window taller than
    // it is wide the height is the binding constraint, not the width.
    let mw = full ? Math.min(W * 0.86, imgMap.width * s * 1.5) : 300 * s;
    let mh = mw * imgMap.height / imgMap.width;
    if (full && mh > H * 0.88) { mh = H * 0.88; mw = mh * imgMap.width / imgMap.height; }
    const mx = full ? (W - mw) / 2 : W - mw - 16 * s;
    const my = full ? (H - mh) / 2 : 16 * s;

    // Current player / focus position in world space
    const pWorldX = (state.person && state.person.active) ? state.person.x
                  : (state.car && state.car.active) ? state.car.x
                  : (state.plane && state.plane.active) ? state.plane.p[0]
                  : (state.tram && window.__trams && window.__trams.routes[state.tram.ri]) ? (window.__trams.at(window.__trams.routes[state.tram.ri], state.tram.s || 0).x)
                  : (st.camEye ? st.camEye[0] : 21205);

    const pWorldN = (state.person && state.person.active) ? state.person.n
                  : (state.car && state.car.active) ? state.car.n
                  : (state.plane && state.plane.active) ? -state.plane.p[2]
                  : (state.tram && window.__trams && window.__trams.routes[state.tram.ri]) ? (window.__trams.at(window.__trams.routes[state.tram.ri], state.tram.s || 0).n)
                  : (st.camEye ? -st.camEye[2] : 6040);

    const pImgX = pWorldX / mapMeta.metres_per_px;
    const pImgY = imgMap.height - pWorldN / mapMeta.metres_per_px;

    let zoom, srcX, srcY, viewW, viewH;
    if (full) {
      zoom = Math.max(1.0, Math.min(6.0, state.mapZoom || 1.0));
      viewW = imgMap.width / zoom;
      viewH = imgMap.height / zoom;
      // 1:1 pixel-accurate map panning centered directly around player's position
      const panX = state.mapPanX || 0;
      const panY = state.mapPanY || 0;
      const centerX = pImgX - (panX / mw) * viewW;
      const centerY = pImgY - (panY / mh) * viewH;
      srcX = Math.max(0, Math.min(imgMap.width - viewW, centerX - viewW * 0.5));
      srcY = Math.max(0, Math.min(imgMap.height - viewH, centerY - viewH * 0.5));
      // the pan, held to what the map can show: dragging past an edge used
      // to pile up pan that had to be dragged back before anything moved
      state.mapPanX = (pImgX - (srcX + viewW * 0.5)) / viewW * mw;
      state.mapPanY = (pImgY - (srcY + viewH * 0.5)) / viewH * mh;
    } else {
      // Inset minimap: crisp, high-detail overview framing player position!
      zoom = 1.4;
      viewW = imgMap.width / zoom;
      viewH = imgMap.height / zoom;
      srcX = Math.max(0, Math.min(imgMap.width - viewW, pImgX - viewW * 0.5));
      srcY = Math.max(0, Math.min(imgMap.height - viewH, pImgY - viewH * 0.5));
    }

    c.globalAlpha = full ? 0.98 : 0.88;
    c.fillStyle = "rgba(8,14,18,.92)";
    c.fillRect(mx - 4 * s, my - 4 * s, mw + 8 * s, mh + 8 * s);

    c.save();
    c.beginPath();
    if (c.roundRect) c.roundRect(mx, my, mw, mh, 4 * s);
    else c.rect(mx, my, mw, mh);
    c.clip();

    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(imgMap, srcX, srcY, viewW, viewH, mx, my, mw, mh);

    const toMap = (wx, wy) => [
      mx + ((wx / mapMeta.metres_per_px) - srcX) / viewW * mw,
      my + ((imgMap.height - wy / mapMeta.metres_per_px) - srcY) / viewH * mh
    ];
    const fromMap = (cx, cy) => [
      (srcX + (cx - mx) / mw * viewW) * mapMeta.metres_per_px,
      (imgMap.height - (srcY + (cy - my) / mh * viewH)) * mapMeta.metres_per_px
    ];
    state.mapTransform = { mx, my, mw, mh, toMap, fromMap, full, srcX, srcY, viewW, viewH };
    // Dynamic label and POI scale factor based on zoom
    const labelScale = Math.max(0.65, Math.min(1.15, 0.55 + 0.35 * Math.min(zoom, 3.0)));

    if (full) {
      const stopFontPx = Math.max(7, Math.min(11, 8.5 * s * labelScale));
      c.font = `600 ${stopFontPx.toFixed(1)}px "IBM Plex Sans", system-ui, sans-serif`;
      c.textAlign = "left"; c.fillStyle = "rgba(240,248,252,.95)";
      const MAJOR_STOPS = new Set(["Budapest-Nyugati", "Vác", "Nagymaros", "Verőce", "Szob", "Pilisvörösvár", "Esztergom", "Kőbánya-Kispest", "Lajosmizse"]);
      for (const stp of routeData.stops) {
        const isMajor = MAJOR_STOPS.has(stp.name);
        if (zoom < 1.35 && !isMajor) continue;
        const [px_, py_] = toMap(stp.xy[0], stp.xy[1]);
        if (px_ >= mx + 6 * s && px_ <= mx + mw - 6 * s && py_ >= my + 6 * s && py_ <= my + mh - 6 * s) {
          c.fillText(stp.name, px_ + 6 * s * labelScale, py_ + 3 * s * labelScale);
        }
      }
    }
    // Live trains on the line with interactive callout signboards
    state.hitMapTrains = [];
    const showFullTrainBox = full && zoom >= 1.45;
    for (const tr of st.traffic.trains) {
      if (tr.svc.id === "player") continue;
      const pts = tr.dir > 0 ? routeData.track_down : routeData.track_up;
      const f = (tr.m - pts[0][3]) / 10;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(f)));
      const [tx, ty] = toMap(pts[i][0], pts[i][1]);

      const trW = showFullTrainBox ? 112 * s * labelScale : (full ? 34 * s : 0);
      const trH = showFullTrainBox ? 22 * s * labelScale : (full ? 15 * s : 0);
      const trX = tx - trW * 0.5, trY = ty - (showFullTrainBox ? 28 : 20) * s * labelScale;
      state.hitMapTrains.push({ x: tx, y: ty, r: 16 * s, w: trW, h: trH, bx: trX, by: trY, train: tr });

      c.fillStyle = tr.stock === "FREIGHT" ? "rgba(214,150,96,.95)"
                  : tr.stock === "EC" ? "rgba(176,170,226,.95)"
                  : "rgba(120,226,206,.95)";
      c.beginPath(); c.arc(tx, ty, (full ? 3.8 : 2.4) * s * labelScale, 0, Math.PI * 2); c.fill();

      if (full) {
        if (showFullTrainBox) {
          // Pointer down to track point
          c.fillStyle = "rgba(63, 203, 210, 0.95)";
          c.beginPath();
          c.moveTo(tx, ty - 3 * s);
          c.lineTo(tx - 3 * s, trY + trH);
          c.lineTo(tx + 3 * s, trY + trH);
          c.closePath();
          c.fill();

          // Signboard container
          c.fillStyle = "rgba(10, 16, 22, 0.94)";
          c.beginPath();
          if (c.roundRect) c.roundRect(trX, trY, trW, trH, 3.5 * s);
          else c.fillRect(trX, trY, trW, trH);
          c.fill();
          c.strokeStyle = "rgba(63, 203, 210, 0.85)";
          c.lineWidth = 1.0 * s;
          c.stroke();

          // Train icon tag
          const tagW = 18 * s * labelScale;
          c.fillStyle = "rgba(63, 203, 210, 0.95)";
          c.fillRect(trX + 2.5 * s, trY + 2.5 * s, tagW, trH - 5 * s);
          c.fillStyle = "#0c141a";
          c.font = `800 ${Math.round(7.5 * s * labelScale)}px "Archivo", sans-serif`;
          c.textAlign = "center";
          c.fillText("🚆", trX + 2.5 * s + tagW * 0.5, trY + trH * 0.68);

          // Train name and boarding prompt
          c.textAlign = "left";
          c.fillStyle = "rgba(240, 248, 252, 0.95)";
          c.font = `700 ${Math.round(7.5 * s * labelScale)}px "IBM Plex Sans", sans-serif`;
          c.fillText(tr.name.slice(0, 14), trX + tagW + 6 * s, trY + trH * 0.44);

          c.fillStyle = "rgba(120, 226, 206, 0.92)";
          c.font = `500 ${Math.round(6.5 * s * labelScale)}px "IBM Plex Mono", monospace`;
          const trDest = tr.dir > 0 ? tt("Szob felé", "to Szob") : tt("Nyugati felé", "to Nyugati");
          c.fillText(`${trDest} [${tt("Felszállás", "Board")}]`, trX + tagW + 6 * s, trY + trH * 0.85);
        } else {
          // Compact badge when zoomed out
          c.fillStyle = "rgba(10, 16, 22, 0.88)";
          c.beginPath();
          if (c.roundRect) c.roundRect(trX, trY, trW, trH, 3 * s);
          else c.fillRect(trX, trY, trW, trH);
          c.fill();
          c.strokeStyle = "rgba(63, 203, 210, 0.7)";
          c.lineWidth = 0.8 * s;
          c.stroke();
          c.fillStyle = "rgba(240, 248, 252, 0.95)";
          c.font = `700 ${Math.round(7.5 * s)}px "Archivo", sans-serif`;
          c.textAlign = "center";
          c.fillText("🚆 " + tr.name.slice(0, 4), trX + trW * 0.5, trY + trH * 0.74);
        }
      }
    }


    // Live Tram badges on the map for all operating city lines
    state.hitMapTrams = [];
    const usedTramBoxes = [];
    const showFullTramBox = full && zoom >= 1.5;
    const trams = window.__trams;
    if (trams && trams.routes) {
      const tNow = state.hour * 3600;
      trams.routes.forEach((r, ri) => {
        for (let k = 0; ; k++) {
          const age = ((tNow - 4.5 * 3600 - r.phase) % r.head + r.head) % r.head + k * r.head;
          if (age > r.run) break;
          const pos = trams.at(r, trams.sAt(r, age));
          const [tx, ty] = toMap(pos.x, pos.n);

          const tmW = showFullTramBox ? 104 * s * labelScale : (full ? 22 * s : 0);
          const tmH = showFullTramBox ? 22 * s * labelScale : (full ? 14 * s : 0);
          const tmX = tx - tmW * 0.5, tmY = ty - (showFullTramBox ? 28 : 18) * s * labelScale;
          state.hitMapTrams.push({ x: tx, y: ty, r: 16 * s, w: tmW, h: tmH, bx: tmX, by: tmY, route: r, ri, dep: tNow - age });

          // Crisp circular vehicle marker with line number
          c.fillStyle = "rgba(245, 196, 20, 0.98)"; // BKK Tram Yellow
          c.beginPath(); c.arc(tx, ty, (full ? 4.5 : 2.5) * s, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "#12161a"; c.lineWidth = 1 * s; c.stroke();

          if (full) {
            c.fillStyle = "#111417";
            c.font = `800 ${Math.round(8 * s)}px "Archivo", sans-serif`;
            c.textAlign = "center";
            c.fillText(r.ref, tx, ty + 2.8 * s);

            if (showFullTramBox) {
              // Declutter callout signboards: draw if not overlapping another nearby tram signboard
              const overlaps = usedTramBoxes.some(([ux, uy]) => Math.hypot(ux - tx, uy - ty) < 70 * s * labelScale);
              if (!overlaps) {
                usedTramBoxes.push([tx, ty]);
                // Pointer down to vehicle dot
                c.fillStyle = "rgba(245, 196, 20, 0.95)";
                c.beginPath();
                c.moveTo(tx, ty - 4 * s);
                c.lineTo(tx - 3 * s, tmY + tmH);
                c.lineTo(tx + 3 * s, tmY + tmH);
                c.closePath();
                c.fill();

                // Tram callout box
                c.fillStyle = "rgba(16, 20, 24, 0.94)";
                c.beginPath();
                if (c.roundRect) c.roundRect(tmX, tmY, tmW, tmH, 3.5 * s);
                else c.fillRect(tmX, tmY, tmW, tmH);
                c.fill();
                c.strokeStyle = "rgba(245, 196, 20, 0.9)";
                c.lineWidth = 1.0 * s;
                c.stroke();

                // Yellow line number pill
                const pillW = 20 * s * labelScale;
                c.fillStyle = "rgba(245, 196, 20, 0.98)";
                c.fillRect(tmX + 2.5 * s, tmY + 2.5 * s, pillW, tmH - 5 * s);
                c.fillStyle = "#111417";
                c.font = `800 ${Math.round(8 * s * labelScale)}px "Archivo", sans-serif`;
                c.textAlign = "center";
                c.fillText(r.ref, tmX + 2.5 * s + pillW * 0.5, tmY + tmH * 0.68);

                // Tram destination & boarding prompt
                c.textAlign = "left";
                c.fillStyle = "rgba(245, 248, 252, 0.95)";
                c.font = `700 ${Math.round(7.2 * s * labelScale)}px "IBM Plex Sans", sans-serif`;
                const destStr = (r.to || (r.model ? r.model.name : "Villamos")).slice(0, 14);
                c.fillText(destStr, tmX + pillW + 5 * s, tmY + tmH * 0.44);

                c.fillStyle = "rgba(245, 196, 20, 0.92)";
                c.font = `500 ${Math.round(6.2 * s * labelScale)}px "IBM Plex Mono", monospace`;
                c.fillText(`[${tt("Felszállás", "Board")}]`, tmX + pillW + 5 * s, tmY + tmH * 0.85);
              }
            }
          }
        }
      });
    }

    // Interactive Map Pin & Tactical Spawner Card
    state.hitMapSpawnBtns = [];
    if (state.mapPin && full) {
      const [px, py] = toMap(state.mapPin.x, state.mapPin.y);
      // Glowing Map Pin
      c.fillStyle = "rgba(255, 60, 80, 0.98)";
      c.beginPath(); c.arc(px, py - 14 * s, 7 * s, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(px - 6 * s, py - 12 * s); c.lineTo(px, py); c.lineTo(px + 6 * s, py - 12 * s); c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(px, py - 14 * s, 2.5 * s, 0, Math.PI * 2); c.fill();

      // Sleek popup spawner card with character picker and spawn actions
      const cw = 250 * s, ch = 210 * s;
      let cx = px + 14 * s, cy = py - 95 * s;
      if (cx + cw > mx + mw - 10 * s) cx = px - cw - 14 * s;
      if (cx < mx + 10 * s) cx = mx + 10 * s;
      if (cy + ch > my + mh - 10 * s) cy = my + mh - ch - 10 * s;
      if (cy < my + 10 * s) cy = my + 10 * s;

      state.mapPinCard = { x: cx, y: cy, w: cw, h: ch };   // (input.js: a click on it is not a new pin)
      c.fillStyle = "rgba(10, 16, 22, 0.96)";
      c.beginPath();
      if (c.roundRect) c.roundRect(cx, cy, cw, ch, 8 * s);
      else c.fillRect(cx, cy, cw, ch);
      c.fill();
      c.strokeStyle = "rgba(63, 203, 210, 0.7)";
      c.lineWidth = 1.5 * s;
      c.stroke();

      // Location / street title
      c.font = `800 ${Math.round(11 * s)}px "Archivo", sans-serif`;
      c.fillStyle = "rgba(240, 248, 252, 0.98)";
      const locTitle = (state.mapPin.name || tt("Kijelölt helyszín", "Marked Location")).toUpperCase();
      c.fillText(`📍 ${locTitle.slice(0, 22)}`, cx + 12 * s, cy + 18 * s);

      // Close button [✕]
      const closeW = 20 * s, closeH = 18 * s;
      const closeX = cx + cw - closeW - 8 * s, closeY = cy + 4 * s;
      c.fillStyle = "rgba(255, 255, 255, 0.12)";
      c.fillRect(closeX, closeY, closeW, closeH);
      c.fillStyle = "rgba(240, 248, 255, 0.85)";
      c.font = `700 ${Math.round(10 * s)}px "IBM Plex Sans", sans-serif`;
      c.textAlign = "center";
      c.fillText("✕", closeX + closeW * 0.5, closeY + closeH * 0.72);
      state.hitMapSpawnBtns.push({ x: closeX, y: closeY, w: closeW, h: closeH, act: "close_pin" });

      // Character Selector Sub-Card
      const selIdx = state.selectedCharIdx !== undefined ? state.selectedCharIdx : (state.person ? (state.person.charIdx || 0) : 0);
      const curModel = CHAR_MODELS[selIdx] || CHAR_MODELS[0];
      const isMale = curModel.gender === "m";

      c.fillStyle = "rgba(255, 255, 255, 0.05)";
      c.fillRect(cx + 8 * s, cy + 24 * s, cw - 16 * s, 54 * s);
      c.strokeStyle = "rgba(255, 255, 255, 0.12)";
      c.strokeRect(cx + 8 * s, cy + 24 * s, cw - 16 * s, 54 * s);

      // Row 1: Left arrow, Model name / index, Right arrow
      const arrW = 24 * s, arrH = 22 * s;
      // [ < ] Prev
      c.fillStyle = "rgba(63, 203, 210, 0.2)";
      c.fillRect(cx + 12 * s, cy + 28 * s, arrW, arrH);
      c.fillStyle = "rgba(63, 203, 210, 0.95)";
      c.font = `700 ${Math.round(11 * s)}px "IBM Plex Sans", sans-serif`;
      c.textAlign = "center";
      c.fillText("◀", cx + 12 * s + arrW * 0.5, cy + 43 * s);
      state.hitMapSpawnBtns.push({ x: cx + 12 * s, y: cy + 28 * s, w: arrW, h: arrH, act: "char_prev" });

      // Model label
      c.fillStyle = "rgba(240, 248, 252, 0.95)";
      c.font = `700 ${Math.round(9.5 * s)}px "IBM Plex Sans", sans-serif`;
      const modelDisp = `${selIdx + 1}/24 · ${curModel.gender === "m" ? "👨" : "👩"} ${tt(curModel.name, curModel.en)}`;
      c.fillText(modelDisp, cx + cw * 0.5, cy + 42 * s);

      // [ > ] Next
      c.fillStyle = "rgba(63, 203, 210, 0.2)";
      c.fillRect(cx + cw - 12 * s - arrW, cy + 28 * s, arrW, arrH);
      c.fillStyle = "rgba(63, 203, 210, 0.95)";
      c.fillText("▶", cx + cw - 12 * s - arrW * 0.5, cy + 43 * s);
      state.hitMapSpawnBtns.push({ x: cx + cw - 12 * s - arrW, y: cy + 28 * s, w: arrW, h: arrH, act: "char_next" });

      // Row 2: Gender pills [👨 Férfi] [👩 Nő] and Tint Swatches
      c.textAlign = "left";
      // Male pill
      const gW = 54 * s, gH = 18 * s;
      c.fillStyle = isMale ? "rgba(63, 203, 210, 0.35)" : "rgba(255, 255, 255, 0.08)";
      c.fillRect(cx + 12 * s, cy + 54 * s, gW, gH);
      c.fillStyle = isMale ? "#3fcbd2" : "rgba(180, 200, 210, 0.7)";
      c.font = `600 ${Math.round(8.5 * s)}px "IBM Plex Sans", sans-serif`;
      c.fillText("👨 Férfi", cx + 18 * s, cy + 66.5 * s);
      state.hitMapSpawnBtns.push({ x: cx + 12 * s, y: cy + 54 * s, w: gW, h: gH, act: "char_male" });

      // Female pill
      c.fillStyle = !isMale ? "rgba(240, 90, 160, 0.35)" : "rgba(255, 255, 255, 0.08)";
      c.fillRect(cx + 70 * s, cy + 54 * s, gW, gH);
      c.fillStyle = !isMale ? "#f05aa0" : "rgba(180, 200, 210, 0.7)";
      c.fillText("👩 Nő", cx + 78 * s, cy + 66.5 * s);
      state.hitMapSpawnBtns.push({ x: cx + 70 * s, y: cy + 54 * s, w: gW, h: gH, act: "char_female" });

      // Tint Swatches: 5 circular shade options
      const tints = [
        { v: 1.0, col: "#3fcbd2" },
        { v: 1.18, col: "#f05050" },
        { v: 0.92, col: "#40d070" },
        { v: 0.75, col: "#606875" },
        { v: 1.25, col: "#f5c414" }
      ];
      const curTint = state.selectedCharTint !== undefined ? state.selectedCharTint : 1.0;
      tints.forEach((t, ti) => {
        const dotX = cx + 138 * s + ti * 18 * s;
        const dotY = cy + 63 * s;
        c.fillStyle = t.col;
        c.beginPath(); c.arc(dotX, dotY, 6 * s, 0, Math.PI * 2); c.fill();
        if (Math.abs(curTint - t.v) < 0.05) {
          c.strokeStyle = "#ffffff"; c.lineWidth = 1.5 * s; c.stroke();
        }
        state.hitMapSpawnBtns.push({ x: dotX - 8 * s, y: dotY - 8 * s, w: 16 * s, h: 16 * s, act: `tint_${t.v}` });
      });

      // Spawn Action Buttons (5 options)
      const btnH = 21 * s;
      const btns = [
        { id: "hero", label: tt("🦸 Hancock Hős (Repülés & Szupererő)", "🦸 Hancock Hero (Flight & Powers)"), col: "rgba(63,203,210,.95)" },
        { id: "walk", label: tt("🚶 Városi Séta (Karakter séta)", "🚶 City Stroll (Pedestrian walk)"), col: "rgba(120,226,160,.95)" },
        { id: "car", label: tt("🚗 Autó vezetése", "🚗 Drive a Car"), col: "rgba(243,196,82,.95)" },
        { id: "tram", label: tt("🚊 Legközelebbi villamos", "🚊 Nearest Tram"), col: "rgba(245,196,20,.95)" },
        { id: "plane", label: tt("✈️ Repülőgéppel ide", "✈️ Fly Aircraft here"), col: "rgba(180,180,240,.95)" },
      ];
      btns.forEach((b, bi) => {
        const by = cy + 82 * s + bi * (btnH + 4 * s);
        c.fillStyle = "rgba(255, 255, 255, 0.08)";
        c.fillRect(cx + 8 * s, by, cw - 16 * s, btnH);
        c.fillStyle = b.col;
        c.font = `600 ${Math.round(9.5 * s)}px "IBM Plex Sans", sans-serif`;
        c.fillText(b.label, cx + 14 * s, by + 14.5 * s);
        state.hitMapSpawnBtns.push({ x: cx + 8 * s, y: by, w: cw - 16 * s, h: btnH, act: b.id });
      });
    }

    // Budapest city landmarks for enhanced spatial awareness (full map mode)
    if (full) {
      // (These were typed in line 70's metres and stood 200-775 m off: the
      // castle in Pest. Now lat/lon, placed in whichever line is loaded.)
      const landmarks = [
        { name: tt("Országház", "Parliament"), ll: [47.50705, 19.04573], icon: "🏛️", prio: 1 },
        { name: tt("Budavári Palota", "Buda Castle"), ll: [47.49620, 19.03960], icon: "🏰", prio: 1 },
        { name: tt("Gellért-hegy", "Gellért Hill"), ll: [47.48700, 19.04670], icon: "⛰️", prio: 1 },
        { name: tt("Margitsziget", "Margaret Island"), ll: [47.52700, 19.04800], icon: "🌳", prio: 2 },
        { name: tt("Hősök tere", "Heroes' Sq."), ll: [47.51500, 19.07780], icon: "🌿", prio: 2 },
        { name: tt("Hűvösvölgy", "Hűvösvölgy"), ll: [47.54170, 18.96270], icon: "🚊", prio: 2 },
        { name: tt("Kelenföld", "Kelenföld"), ll: [47.46440, 19.02040], icon: "🏢", prio: 2 }
      ].map(lm => { const [x, n] = world.geo ? world.geo(lm.ll[0], lm.ll[1]) : [NaN, NaN]; return { ...lm, x, n }; })
       .filter(lm => isFinite(lm.x));
      const poiFontPx = Math.max(6.5, Math.min(10, 7.5 * s * labelScale));
      c.font = `600 ${poiFontPx.toFixed(1)}px "IBM Plex Sans", sans-serif`;
      const placedPois = [];
      for (const lm of landmarks) {
        if (zoom < 1.25 && lm.prio > 1) continue; // declutter lower-priority POIs when zoomed out
        const [lx, ly] = toMap(lm.x, lm.n);
        if (lx >= mx + 10 * s && lx <= mx + mw - 10 * s && ly >= my + 10 * s && ly <= my + mh - 10 * s) {
          const tag = (zoom >= 1.35) ? `${lm.icon} ${lm.name}` : lm.icon;
          const textW = c.measureText(tag).width;
          const boxW = textW + (zoom >= 1.35 ? 6 : 4) * s * labelScale;
          const boxH = (zoom >= 1.35 ? 12 : 11) * s * labelScale;
          // Collision avoidance: skip if overlapping another already placed POI
          const collides = placedPois.some(([px, py, pw, ph]) => Math.abs(px - lx) < (pw + boxW) * 0.5 && Math.abs(py - ly) < (ph + boxH) * 0.5);
          if (collides) continue;
          placedPois.push([lx, ly, boxW, boxH]);

          c.fillStyle = "rgba(10, 16, 22, 0.88)";
          c.fillRect(lx - boxW * 0.5, ly - boxH * 0.5, boxW, boxH);
          c.strokeStyle = "rgba(120, 200, 220, 0.4)";
          c.strokeRect(lx - boxW * 0.5, ly - boxH * 0.5, boxW, boxH);
          c.fillStyle = "rgba(240, 248, 255, 0.95)";
          c.textAlign = "center";
          c.fillText(tag, lx, ly + boxH * 0.32);
        }
      }
    }

    const [rawPx, rawPy] = toMap(st.camEye[0], -st.camEye[2]);
    const isOffScreen = rawPx < mx + 4 * s || rawPx > mx + mw - 4 * s || rawPy < my + 4 * s || rawPy > my + mh - 4 * s;
    const px_ = Math.max(mx + 12 * s, Math.min(mx + mw - 12 * s, rawPx));
    const py_ = Math.max(my + 12 * s, Math.min(my + mh - 12 * s, rawPy));

    const fwdV = st.fwd || [0, 0, -1];
    const fwdLen = Math.hypot(fwdV[0], fwdV[2]) || 1;
    // fwd[0] is East (+x), fwd[2] is South (+z, so -fwd[2] is North)
    const vx = fwdV[0] / fwdLen;
    const vy = -fwdV[2] / fwdLen;

    c.save();
    c.translate(px_, py_);
    // In canvas 2D, -y is North (up), +x is East (right)
    const angle = Math.atan2(-vy, vx);
    c.rotate(angle);

    if (isOffScreen) {
      // Pulsing radar ping for off-screen position (e.g. South Buda)
      const pulse = (Math.sin(performance.now() * 0.005) + 1) * 0.5;
      c.strokeStyle = `rgba(245, 196, 20, ${0.4 + pulse * 0.5})`;
      c.lineWidth = 1.5 * s;
      c.beginPath();
      c.arc(0, 0, (14 + pulse * 6) * s, 0, Math.PI * 2);
      c.stroke();
    } else {
      // Semi-transparent field-of-view vision cone
      c.fillStyle = "rgba(63, 203, 210, 0.22)";
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 26 * s, -0.42, 0.42);
      c.closePath();
      c.fill();
    }

    // Sharp glowing directional player arrow with border
    c.fillStyle = isOffScreen ? "rgba(245, 196, 20, 1.0)" : "rgba(63, 203, 210, 1.0)";
    c.strokeStyle = "rgba(8, 16, 24, 0.95)";
    c.lineWidth = 1.4 * s;
    c.beginPath();
    c.moveTo(11 * s, 0);
    c.lineTo(-6 * s, -6 * s);
    c.lineTo(-3 * s, 0);
    c.lineTo(-6 * s, 6 * s);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore(); // restore player arrow transform

    // Restore unclipped context for outer frame and HUD controls
    c.restore();

    // Map Border
    c.strokeStyle = "rgba(150, 180, 196, 0.6)";
    c.lineWidth = 1.5 * s;
    c.strokeRect(mx - 0.5, my - 0.5, mw + 1, mh + 1);

    if (full) {
      // Interactive Zoom and Pan control buttons on the map
      state.hitMapControls = [];
      const btnW = 32 * s, btnH = 26 * s;
      const ctlX = mx + mw - btnW - 14 * s;
      let ctlY = my + 14 * s;
      const ctlDefs = [
        { id: "zoom_in", label: "+", title: "Nagyítás / Zoom in" },
        { id: "reset", label: `${zoom.toFixed(1)}x`, title: "Alaphelyzet / Reset" },
        { id: "zoom_out", label: "−", title: "Kicsinyítés / Zoom out" },
        { id: "center", label: "🎯", title: "Középre / Center" },
      ];
      for (const d of ctlDefs) {
        c.fillStyle = "rgba(10, 16, 22, 0.92)";
        c.beginPath();
        if (c.roundRect) c.roundRect(ctlX, ctlY, btnW, btnH, 4 * s);
        else c.fillRect(ctlX, ctlY, btnW, btnH);
        c.fill();
        c.strokeStyle = "rgba(63, 203, 210, 0.75)";
        c.lineWidth = 1 * s;
        c.stroke();
        c.fillStyle = "#ffffff";
        c.font = `700 ${Math.round(11 * s)}px "IBM Plex Sans", sans-serif`;
        c.textAlign = "center";
        c.fillText(d.label, ctlX + btnW * 0.5, ctlY + btnH * 0.68);
        state.hitMapControls.push({ x: ctlX, y: ctlY, w: btnW, h: btnH, act: d.id });
        ctlY += btnH + 5 * s;
      }

      // Bottom guidance bar for dragging, zooming, and dropping pins
      c.fillStyle = "rgba(10, 16, 22, 0.92)";
      c.fillRect(mx, my + mh - 26 * s, mw, 26 * s);
      c.strokeStyle = "rgba(63, 203, 210, 0.4)";
      c.lineWidth = 1 * s;
      c.strokeRect(mx, my + mh - 26 * s, mw, 26 * s);
      c.fillStyle = "rgba(220, 240, 250, 0.92)";
      c.font = `600 ${Math.round(10 * s)}px "IBM Plex Sans", sans-serif`;
      c.textAlign = "center";
      c.fillText(tt("🖱️ Húzás: térkép mozgatása · Görgő: nagyítás · Kattintás: jelölő / beszállás · Tab: bezárás",
                    "🖱️ Drag: pan map · Wheel: zoom · Click: drop pin / board · Tab: close map"), mx + mw * 0.5, my + mh - 9 * s);
    } else {
      // Inset minimap: clean location & pan indicator pill
      const locName = pWorldN < 4000 ? tt("DÉL-BUDA / BUDAÖRS", "SOUTH BUDA / BUDAÖRS")
                    : pWorldN < 11000 ? tt("BUDAPEST", "BUDAPEST")
                    : pWorldN < 26000 ? tt("DUNAKESZI / GÖD", "DUNAKESZI / GÖD")
                    : pWorldN < 36000 ? tt("VÁC", "VÁC")
                    : tt("DUNAKANYAR", "DANUBE BEND");
      c.fillStyle = "rgba(10, 16, 22, 0.88)";
      c.beginPath();
      if (c.roundRect) c.roundRect(mx + 6 * s, my + mh - 22 * s, 175 * s, 17 * s, 3 * s);
      else c.fillRect(mx + 6 * s, my + mh - 22 * s, 175 * s, 17 * s);
      c.fill();
      c.strokeStyle = "rgba(63, 203, 210, 0.6)";
      c.lineWidth = 1 * s;
      c.stroke();
      c.fillStyle = "rgba(63, 203, 210, 0.98)";
      c.font = `700 ${Math.round(8.2 * s)}px "IBM Plex Sans", sans-serif`;
      c.textAlign = "left";
      c.fillText(`🗺️ ${locName} · [Tab]`, mx + 10 * s, my + mh - 10.5 * s);
    }

    c.globalAlpha = 1;
    c.textAlign = "left";
  }

}

export function drawHud(c, canvas, st, world) {
  const { imgMap, routeData, mapMeta } = world;
  const W = canvas.width, H = canvas.height, s = W / 1200;
  c.clearRect(0, 0, W, H);
  c.textBaseline = "alphabetic";
  const layer = LAYERS[state.layer].key;
  const used = [];
  // You cannot name a hill you cannot see. In fog the labels used to hang
  // in the murk over ridges that had completely dissolved.
  const fogK = st.pal.fog;
  const visible = d => Math.exp(-d * fogK) > 0.11;
  const place = (sx, sy, text, colour, dim) => {
    c.font = `600 ${Math.round(12*s)}px "IBM Plex Sans", system-ui, sans-serif`;
    const tw = c.measureText(text).width;
    if (used.some(u => Math.abs(u[0]-sx) < (tw+40)*s*0.5 && Math.abs(u[1]-sy) < 15*s))
      return false;
    used.push([sx, sy]);
    c.globalAlpha = dim;
    c.fillStyle = "rgba(8,14,18,.58)";
    c.fillRect(sx - 4*s, sy - 22*s, tw + 8*s, 16*s);
    c.strokeStyle = colour; c.lineWidth = 1*s;
    c.beginPath(); c.moveTo(sx, sy - 6*s); c.lineTo(sx, sy); c.stroke();
    c.fillStyle = colour;
    c.fillText(text, sx, sy - 10*s);
    c.globalAlpha = 1;
    return true;
  };

  if (layer === "places" || layer === "landmarks" || layer === "all") {
    const want = layer === "all"
      ? ["place", "landmark", "church", "public"]
      : layer === "places" ? ["place"] : ["landmark", "church", "public"];
    const col = { place: "rgba(255,236,190,.96)", landmark: "rgba(190,232,255,.96)",
                  church: "rgba(226,214,246,.94)", public: "rgba(214,238,214,.94)" };
    for (const pl of routeData.places) {
      if (!want.includes(pl.kind)) continue;
      const d = Math.hypot(pl.xy[0] - st.camEye[0], pl.xy[1] + st.camEye[2]);
      const cap = pl.kind === "place" ? (pl.rank <= 1 ? 14000 : pl.rank <= 3 ? 5000 : 2200)
                : pl.rank <= 1 ? 4200 : pl.rank <= 2 ? 2600 : 1500;
      if (d > cap || d < 60 || !visible(d)) continue;
      const pr = project(st.vp, [pl.xy[0], pl.h + 22, -pl.xy[1]]);
      if (!pr) continue;
      const sx = (pr[0]*0.5+0.5)*W, sy = (1-(pr[1]*0.5+0.5))*H;
      if (sx < 40*s || sx > W-40*s || sy < 30*s || sy > H*0.80) continue;
      place(sx, sy, pl.name, col[pl.kind], Math.max(0.35, 1 - d / cap));
    }
  }

  if (layer === "hills" || layer === "all") {
    c.font = `600 ${Math.round(12*s)}px "IBM Plex Sans", system-ui, sans-serif`;
    const peaks = routeData.peaks;
    for (const pk of peaks) {
      const d = Math.hypot(pk.xy[0] - st.camEye[0], pk.xy[1] + st.camEye[2]);
      if (d > 24000 || d < 220 || !visible(d)) continue;
      const rise = pk.ele - st.camEye[1];
      // from the ground a hill has to stand above the line of sight; from the
      // air (above it) every summit in range is named
      if (rise > 0 && Math.atan2(rise, d) < 0.012) continue;
      if (rise <= 0 && st.camEye[1] < pk.ele + 60) continue;
      const pr = project(st.vp, [pk.xy[0], pk.ele, -pk.xy[1]]);
      if (!pr) continue;
      const sx = (pr[0]*0.5+0.5)*W, sy = (1-(pr[1]*0.5+0.5))*H;
      if (sx < 40*s || sx > W-40*s || sy < 30*s || sy > H*0.72) continue;
      place(sx, sy, `${pk.name}  ${pk.ele|0}`, "rgba(236,244,248,.95)",
            Math.max(0.30, 1 - d / 26000));
    }
  }

  // U once: the names stay, everything else goes
  if (state.bareLevel === 1) return;
  // in the plane and the car the names were never drawn at all (the Pilis
  // from the air had no hill on it); now they are, under their own read-outs
  if (state.person && state.person.active) { drawHeroHud(c, W, H, s); drawStreetSign(c, W, H, s, state.currentStreet); drawMap(c, W, H, s, st, world); return; }
  if (state.plane && state.plane.active) { drawPlaneHud(c, W, H, s); drawStreetSign(c, W, H, s, state.currentStreet); drawMap(c, W, H, s, st, world); return; }
  if (state.car && state.car.active) { drawCarHud(c, W, H, s); drawStreetSign(c, W, H, s, state.currentStreet); drawMap(c, W, H, s, st, world); return; }
  if (state.tram) { drawTramHud(c, W, H, s, st, world); drawStreetSign(c, W, H, s, state.currentStreet); drawMap(c, W, H, s, st, world); return; }
  drawStreetSign(c, W, H, s, state.currentStreet);
  drawMap(c, W, H, s, st, world);

  // station banner — the stop was happening but was easy to miss
  {
    const d = st.driver;
    const next = st.driver.targetStop();
    const dist = next ? (next.km * 1000 - d.m) * st.route.dir : 1e9;
    let banner = null, tone = "rgba(63,203,210,.95)";
    if (d.dwell > 0) {
      banner = `${d.lastStop || ""} — ${d.doors ? tt("AJTÓK NYITVA", "DOORS OPEN") : tt("AJTÓZÁRÁS", "DOORS CLOSING")}`
             + `   ${d.boarding} ${tt("utas", "passengers")}   ${d.dwell.toFixed(0)} s`;
    } else if (next && dist < 900 && (d.v > 0.5 || !d.auto && dist > 30)) {
      banner = dist >= 0 ? `${next.name} ${Math.round(dist)} m — ${tt("készülj a megállásra", "prepare to stop")}`
                         : `${next.name}: ${tt(`${Math.round(-dist)} m-rel túl — állj meg!`, `${Math.round(-dist)} m past — stop!`)}`;
      tone = dist >= 0 ? "rgba(243,196,82,.95)" : "rgba(255,90,78,.95)";
    }
    // the vigilance warning has to be visible from outside the cab too
    if (st.driver.vigPenalty > 0) {
      banner = tt("ÉBER — kényszerfékezés · E a nyugtázás", "VIGILANCE — penalty brake · E to acknowledge");
      tone = "rgba(255,90,78,.95)";
    } else if (st.driver.vigWarn > 0) {
      banner = `${tt("ÉBER — nyugtázd (E)", "VIGILANCE — acknowledge (E)")} · ${(5 - st.driver.vigWarn).toFixed(1)} s`;
      tone = "rgba(243,196,82,.95)";
    }
    if (state.jumpedTo && (!state.jumpedToUntil || performance.now() < state.jumpedToUntil) && !banner) {
      banner = `${state.jumpedTo}  ·  , . ${tt("állomásról állomásra", "station to station")}`;
      tone = "rgba(140,190,240,.95)";
    }
    if (state.followIdx >= 0) {
      const list = st.traffic.trains.filter(t => t.svc.id !== "player");
      const f = list[state.followIdx];
      banner = f ? `${tt("Követés:", "Following")} ${f.name} · ${f.stock} · ${f.cars} ${tt("kocsi", "cars")}`
                   + ` — ${f.dir > 0 ? tt("kifelé", "outbound") : tt("Budapest felé", "to Budapest")}`
                   + `  ·  ${tt("F következő vonat, Esc fülke", "F next train, Esc cab")}` : null;
      tone = "rgba(140,190,240,.95)";
    } else if (state.followCarIdx >= 0 && st.traffic.roadTraffic && st.traffic.roadTraffic.vehicles.length) {
      const v = st.traffic.roadTraffic.vehicles[state.followCarIdx % st.traffic.roadTraffic.vehicles.length];
      banner = v ? `${tt("Jármű követése", "Following a vehicle")} (${v.type.kind}) · ${(v.v * 3.6).toFixed(0)} km/h · ${tt("V következő, Esc fülke", "V next, Esc cab")}` : null;
      tone = "rgba(120,220,180,.95)";
    } else if (state.followShipIdx >= 0 && st.traffic.riverTraffic) {
      const rt = st.traffic.riverTraffic;
      const allShips = [...(rt.ferries || []), ...(rt.ships || [])];
      const sh = allShips[state.followShipIdx % allShips.length];
      banner = sh ? `${tt("Követés:", "Following")} ${sh.name || (sh.type && sh.type.kind) || tt("hajó", "ship")} · ${(sh.v * 3.6).toFixed(0)} km/h · ${tt("B következő hajó, Esc fülke", "B next ship, Esc cab")}` : null;
      tone = "rgba(100,200,255,.95)";
    } else if (state.drone && state.drone.active) {
      banner = tt("DRÓN · WASD dönt · Q/E fordul · Space/Shift emelkedik/süllyed · ⇧D ki", "DRONE · WASD tilt · Q/E yaw · Space/Shift up/down · ⇧D exit");
      tone = "rgba(255,200,80,.95)";
    }
    if (banner) {
      c.font = `600 ${Math.round(17*s)}px "IBM Plex Sans", system-ui, sans-serif`;
      const tw = c.measureText(banner).width;
      const bx = (W - tw) / 2 - 18*s, by = H * 0.13;
      c.fillStyle = "rgba(8,18,26,.80)";
      c.fillRect(bx, by, tw + 36*s, 38*s);
      c.fillStyle = tone;
      c.fillRect(bx, by, 4*s, 38*s);
      c.fillStyle = "rgba(240,248,252,.97)";
      c.textAlign = "left";
      c.fillText(banner, bx + 18*s, by + 25*s);
    }
  }

  // FPV Drone HUD telemetry (Betaflight / DJI style OSD)
  if (state.drone && state.drone.active) {
    const dr = state.drone;
    const cx = W * 0.5, cy = H * 0.5;
    const spd = Math.hypot(dr.v[0], dr.v[1], dr.v[2]) * 3.6;
    const gH = st.demAt ? st.demAt(dr.p[0], dr.p[2]) : 100;
    const agl = Math.max(0, dr.p[1] - gH);
    const deg = Math.round(((dr.yaw * 180 / Math.PI) % 360 + 360) % 360);
    const roll = dr.roll || 0, pitch = dr.pitch || 0;

    // Artificial Horizon & Pitch Ladder
    c.save();
    c.translate(cx, cy);
    c.rotate(-roll);

    c.strokeStyle = "rgba(64,240,180,.80)";
    c.lineWidth = 1.8 * s;
    // Central horizon bar
    const pY = pitch * 120 * s;
    c.beginPath();
    c.moveTo(-60 * s, pY); c.lineTo(-20 * s, pY);
    c.moveTo(20 * s, pY); c.lineTo(60 * s, pY);
    // Pitch rungs (+10, +20, -10, -20 deg)
    for (const degR of [-20, -10, 10, 20]) {
      const rY = pY - (degR * Math.PI / 180) * 120 * s;
      const len = degR % 20 === 0 ? 34 * s : 22 * s;
      c.moveTo(-len, rY); c.lineTo(-8 * s, rY);
      c.moveTo(8 * s, rY); c.lineTo(len, rY);
      if (degR < 0) {
        c.moveTo(-len, rY); c.lineTo(-len, rY - 4 * s);
        c.moveTo(len, rY); c.lineTo(len, rY - 4 * s);
      }
    }
    c.stroke();
    c.restore();

    // Center Fixed Aircraft Reticle
    c.strokeStyle = "rgba(255,220,60,.90)";
    c.lineWidth = 2 * s;
    c.beginPath();
    c.arc(cx, cy, 6 * s, 0, Math.PI * 2);
    c.moveTo(cx - 24 * s, cy); c.lineTo(cx - 10 * s, cy);
    c.moveTo(cx + 10 * s, cy); c.lineTo(cx + 24 * s, cy);
    c.moveTo(cx, cy - 20 * s); c.lineTo(cx, cy - 8 * s);
    c.stroke();

    // Speed Left Box
    c.fillStyle = "rgba(4,12,18,.75)";
    c.fillRect(30 * s, H * 0.38, 110 * s, 85 * s);
    c.fillStyle = "rgba(64,240,180,.98)";
    c.font = `700 ${Math.round(22 * s)}px "Archivo", monospace`;
    c.fillText(`${spd.toFixed(0)}`, 42 * s, H * 0.38 + 32 * s);
    c.font = `500 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
    c.fillText("KM/H SPD", 42 * s, H * 0.38 + 52 * s);
    c.fillStyle = "rgba(240,240,240,.85)";
    c.fillText("4S 15.8V", 42 * s, H * 0.38 + 72 * s);

    // Altitude Right Box
    c.fillStyle = "rgba(4,12,18,.75)";
    c.fillRect(W - 140 * s, H * 0.38, 110 * s, 85 * s);
    c.fillStyle = "rgba(64,240,180,.98)";
    c.font = `700 ${Math.round(22 * s)}px "Archivo", monospace`;
    c.fillText(`${dr.p[1].toFixed(0)}m`, W - 128 * s, H * 0.38 + 32 * s);
    c.font = `500 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
    c.fillText(`AGL ${agl.toFixed(0)}m`, W - 128 * s, H * 0.38 + 52 * s);
    c.fillStyle = "rgba(255,200,60,.90)";
    c.fillText("AIRMODE", W - 128 * s, H * 0.38 + 72 * s);

    // Top Heading Banner & Crosshair status
    c.fillStyle = "rgba(4,12,18,.75)";
    c.fillRect(cx - 60 * s, 16 * s, 120 * s, 34 * s);
    c.fillStyle = "rgba(240,248,252,.98)";
    c.font = `600 ${Math.round(15 * s)}px "IBM Plex Mono", monospace`;
    c.textAlign = "center";
    c.fillText(`HDG ${String(deg).padStart(3, "0")}°`, cx, 39 * s);
    c.textAlign = "left";
  }
  
  // In the cab the desk already carries all of it; the strip over the desk
  // was the same numbers twice, on top of each other.
  if (st.inCab && state.pitch < -0.2) { drawMessages(c, H, s, st, 0); return; }

  // bottom bar. Cells laid out left to right at their measured widths, in
  // order of how much a driver needs them; a cell that does not fit is left
  // out rather than drawn over its neighbour (they used to sit at fixed x and
  // the weather, the debug line and the score overlapped at most widths).
  const bh = 74*s;
  const g = c.createLinearGradient(0, H-bh, 0, H);
  g.addColorStop(0, "rgba(6,12,16,0)"); g.addColorStop(1, "rgba(6,12,16,.84)");
  c.fillStyle = g; c.fillRect(0, H-bh, W, bh);

  const follow = state.followIdx >= 0
    ? st.traffic.trains.filter(t => t.svc.id !== "player")[state.followIdx]
    : null;
  const kmh = (follow ? follow.v : st.driver.v) * 3.6;
  const okm = st.route.officialKm(st.driver.m);
  const lim = st.route.limitAt(st.driver.m);
  const next = st.driver.targetStop();
  const DIM = "rgba(150,180,196,.9)", FAINT = "rgba(120,150,166,.8)", BRIGHT = "rgba(240,248,252,.95)";
  const F = (w, px, fam) => `${w} ${Math.round(px*s)}px ${fam === "m" ? '"IBM Plex Mono", monospace'
                            : fam === "a" ? '"Archivo", system-ui, sans-serif' : '"IBM Plex Sans", system-ui, sans-serif'}`;
  const tw = (txt, font) => { c.font = font; return c.measureText(txt).width; };
  // a cell: two lines (top, bottom), each [text, font, colour]
  const cells = [];
  const cell = (top, bot, extra) => cells.push({ top, bot, extra });

  // speed and limit
  cells.push({ custom: (x) => {
    c.fillStyle = BRIGHT; c.font = F(700, 38, "a");
    const t = kmh.toFixed(0); c.fillText(t, x, H - 20*s);
    const w0 = c.measureText(t).width;
    c.font = F(500, 11, "m"); c.fillStyle = DIM; c.fillText("km/h", x + w0 + 6*s, H - 20*s);
    c.fillStyle = kmh > lim + 2 ? "rgba(255,114,100,.95)" : DIM;
    c.fillText(`limit ${lim}`, x, H - 52*s);
    return Math.max(w0 + 40*s, tw(`limit ${lim}`, F(500, 11, "m")));
  }});
  // where to
  if (follow) cell([`${follow.name} → ${follow.dir > 0 ? tt("kifelé", "outbound") : "Budapest"}`, F(600, 15), BRIGHT],
                   [`${follow.cars} kocsi · km ${(follow.m/1000).toFixed(2)}`, F(400, 11, "m"), DIM]);
  else if (next) {
    const d = (next.km*1000 - st.driver.m) * st.route.dir;
    cell([next.name, F(600, 15), BRIGHT], [`${(d/1000).toFixed(2)} km · km ${okm.toFixed(1)} · ${fmtTime(state.hour)}`, F(400, 11, "m"), DIM]);
  }
  // controller: lever, traction and brake bars
  if (!follow) cells.push({ custom: (x) => {
    let w = 0;
    if (!st.driver.auto) {
      const L = st.driver.lever;
      const lab = st.driver.emergency ? "EB" : L > 0 ? `P${L}` : L < 0 ? `B${-L}` : "0";
      c.fillStyle = st.driver.emergency ? "rgba(255,90,80,.98)"
                  : L > 0 ? "rgba(69,217,131,.98)" : L < 0 ? "rgba(255,150,120,.98)" : BRIGHT;
      c.font = F(700, 18, "m"); c.fillText(lab, x, H - 28*s);
      w = 42*s;
      if (st.driver.slip > 0.2) {
        c.fillStyle = "rgba(255,200,60,.98)"; c.font = F(700, 10, "m"); c.fillText("SLIP", x, H - 12*s);
      }
    } else { c.font = F(500, 10, "m"); c.fillStyle = FAINT; c.fillText("AUTO", x, H - 12*s); }
    const bw = 76*s, bx = x + w;
    [["THR", st.driver.throttle, "rgba(69,217,131,.9)"], ["BRK", st.driver.brake, "rgba(255,114,100,.9)"]]
      .forEach(([lab, v, col], i) => {
        const y = H - 50*s + i*18*s;
        c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(bx, y, bw, 8*s);
        c.fillStyle = col; c.fillRect(bx, y, bw*Math.max(0,Math.min(1,v)), 8*s);
        c.fillStyle = FAINT; c.font = F(500, 9, "m"); c.fillText(lab, bx + bw + 5*s, y + 7.5*s);
      });
    return w + bw + 30*s;
  }});
  // timekeeping
  if (state.lateness != null && !follow) {
    const L = state.lateness, early = L < 0;
    const mm = Math.floor(Math.abs(L) / 60), ss = Math.floor(Math.abs(L) % 60);
    cell([`${early ? "−" : "+"}${mm}:${String(ss).padStart(2,"0")}`, F(600, 14, "m"),
          Math.abs(L) < 60 ? "rgba(69,217,131,.95)" : early ? "rgba(140,190,240,.95)" : "rgba(243,196,82,.95)"],
         [tt("menetrendhez", "to timetable"), F(400, 10, "m"), FAINT]);
  }
  // station work, or who is on board
  if (st.driver.dwell > 0)
    cell([`${st.driver.doors ? tt("ajtók nyitva", "doors open") : tt("ajtózárás", "doors closing")} · ${st.driver.dwell.toFixed(0)} s`, F(600, 13), "rgba(63,203,210,.95)"],
         [`${st.driver.boarding} ${tt("utas cserél", "passengers on and off")}`, F(400, 11, "m"), DIM]);
  else if (!follow) cell([`${st.driver.pax}`, F(600, 14, "m"), BRIGHT], [tt("utas", "passengers"), F(400, 10, "m"), FAINT]);
  // weather
  if (state.wx) {
    const w = state.wx;
    const p = w.precip.kind && w.precip.rate > 0.02 ? `${(LANG === "en" ? PRECIP_EN : PRECIP)[w.precip.kind]} ${(w.precip.rate * 100) | 0}%` : tt("száraz", "dry");
    cell([`${w.tempC.toFixed(0)}°C · ${compass(w.wind.from)} ${w.wind.speed.toFixed(0)} m/s`, F(400, 12, "m"), DIM],
         [`${p} · ${fmtVis(visibilityOf(st.pal.fog))}`, F(400, 10, "m"),
          w.precip.kind && w.precip.rate > 0.02 ? "rgba(120,190,226,.95)" : FAINT]);
  }
  // score, if the run is being scored
  if (st.state && st.state.score != null)
    cell([`${st.state.score}%`, F(600, 14, "m"), "#3fcbd2"], [st.state.mission ? tt("feladat", "mission") : tt("értékelés", "rating"), F(400, 10, "m"), FAINT]);
  // time compression / pause: only when it is not plain real time
  if (state.speedMul !== 1 || state.paused)
    cell([state.paused ? tt("SZÜNET", "PAUSED") : `×${state.speedMul}`, F(600, 14, "m"), "rgba(243,196,82,.95)"], [tt("idő", "time"), F(400, 10, "m"), FAINT]);

  // lay them out; the signal repeater owns the right end
  const right = W - 160*s;
  let x = 24*s;
  for (const k of cells) {
    let w;
    if (k.custom) {
      // measure by drawing off-screen is not possible; custom cells report
      // their own width, so draw them and check afterwards
      if (x > right - 60*s) break;
      w = k.custom(x);
    } else {
      w = Math.max(tw(k.top[0], k.top[1]), k.bot ? tw(k.bot[0], k.bot[1]) : 0);
      if (x + w > right) continue;
      c.font = k.top[1]; c.fillStyle = k.top[2]; c.fillText(k.top[0], x, H - 40*s);
      if (k.bot) { c.font = k.bot[1]; c.fillStyle = k.bot[2]; c.fillText(k.bot[0], x, H - 22*s); }
    }
    x += w + 26*s;
  }

  // EVM-120 cab repeat: the next signal's aspect, before you can see it
  {
    const asp = st.playerTrain ? st.playerTrain.aspect : 3;
    const cols = ["rgba(255,90,78,.95)", "rgba(243,196,82,.95)",
                  "rgba(243,196,82,.95)", "rgba(69,217,131,.95)",
                  "rgba(236,244,248,.95)"];
    const dist = st.traffic ? st.traffic.distanceToSignal(st.playerTrain) : 1e9;
    c.fillStyle = "rgba(255,255,255,.08)";
    c.fillRect(W - 146*s, H - 60*s, 128*s, 42*s);
    c.fillStyle = cols[asp];
    c.beginPath(); c.arc(W - 126*s, H - 39*s, 10*s, 0, 7); c.fill();
    c.fillStyle = "rgba(236,244,248,.95)";
    c.font = F(600, 12);
    c.fillText(ASPECT_NAME[asp], W - 108*s, H - 42*s);
    c.fillStyle = FAINT;
    c.font = F(400, 10, "m");
    c.fillText(dist < 9000 ? `${tt("jelző", "signal")} ${Math.round(dist)} m` : "—", W - 108*s, H - 27*s);
  }

  // the numbers only a developer wants: F3
  if (state.debugHud) {
    c.fillStyle = "rgba(120,150,166,.8)";
    c.font = F(400, 10, "m");
    c.fillText(`zoom ${state.zoom.toFixed(2)} · haze ×${state.fog.toFixed(2)} · exp ${state.exposure.toFixed(2)}`
               + ` · labels: ${LAYERS[state.layer].label} · ${st.fps.toFixed(0)} fps`
               + (state.dynRes < 1 ? ` · res ×${state.dynRes.toFixed(2)}` : ""), 24*s, H - bh - 6*s);
  }

  drawMessages(c, H, s, st, bh);
}

// score pop-ups (+50 on time …), above the strip on the left
function drawMessages(c, H, s, st, bh) {
  if (st.state && st.state.messages && st.state.messages.length) {
    // (under 1100 px the mode bar sits just above the strip, on the left)
    let msgY = H - bh - (innerWidth < 1100 ? 84 : 40) * s;
    for (const msg of st.state.messages) {
      const alpha = Math.min(1.0, msg.t);
      c.font = `600 ${Math.round(13*s)}px "IBM Plex Sans", system-ui, sans-serif`;
      const w = c.measureText(msg.text).width;
      c.fillStyle = `rgba(8,14,18,${alpha * 0.8})`;
      c.fillRect(24*s, msgY, w + 20*s, 26*s);
      c.fillStyle = msg.tone === "good" ? `rgba(69,217,131,${alpha})` : msg.tone === "bad" ? `rgba(255,114,100,${alpha})`
                  : `rgba(243,196,82,${alpha})`;
      c.fillText(msg.text, 34*s, msgY + 18*s);
      msgY -= 31*s;
    }
  }
}
