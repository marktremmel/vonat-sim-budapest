// The canvas overlay. Everything drawn in 2D over the finished scene:
// the hill and place labels, the inset map, the speed and brake read-outs
// and the banners. It reads the frame's state and writes nothing back.

export const LAYERS = [
  { key: "hills", label: "hills" },
  { key: "places", label: "towns and villages" },
  { key: "landmarks", label: "landmarks and churches" },
  { key: "all", label: "everything" },
  { key: "none", label: "nothing" },
];

function project(vp, w) {
  const x = vp[0]*w[0] + vp[4]*w[1] + vp[8]*w[2] + vp[12];
  const y = vp[1]*w[0] + vp[5]*w[1] + vp[9]*w[2] + vp[13];
  const z = vp[3]*w[0] + vp[7]*w[1] + vp[11]*w[2] + vp[15];
  if (z <= 0.01) return null;
  return [x / z, y / z];
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
  c.fillText(`km/h${car.v < -0.3 ? " · hátra" : ""}${car.onBridge ? " · hídon" : ""}`, 100*s, H - 74*s);
  c.fillText("autó", 28*s, H - 104*s);
  c.fillStyle = "rgba(150,180,196,.85)";
  c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
  c.fillText("W gáz · S fék / hátra · A/D kormány · Space kézifék · C vezetőülés · görgő: távolság", 16*s, H - 16*s);
  c.fillStyle = "rgba(63,203,210,.95)";
  c.font = `600 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.fillText("Esc — vissza a vonatra", 16*s, H - 34*s);
}

function drawPlaneHud(c, W, H, s) {
  const pl = state.plane;
  const T = (window.SIM && SIM.PLANES && SIM.PLANES[pl.type]) || { name: pl.type };
  const spd = Math.hypot(pl.vel[0], pl.vel[1], pl.vel[2]) * 3.6;
  const g = window.SIM ? SIM.demAt(pl.p[0], -pl.p[2]) : 0;
  const agl = Math.round(pl.p[1] - (isFinite(g) ? g : 0));
  const hdg = Math.round(((pl.yaw * 180 / Math.PI) % 360 + 360) % 360);
  const vs = pl.vel[1];
  const lines = [[T.name, "#3fcbd2"], [`${Math.round(spd)} km/h`], [`${agl} m a talaj felett · ${Math.round(pl.p[1])} m tszf`],
                 [`irány ${String(hdg).padStart(3, "0")}° · emelkedés ${vs >= 0 ? "+" : ""}${vs.toFixed(1)} m/s`],
                 [`${pl.type === "heli" ? "kollektív" : "gáz"} ${Math.round(pl.throttle * 100)}%` +
                  (pl.type === "gripen" && pl.throttle > 0.92 ? " · UTÁNÉGETŐ" : "") + (pl.ground ? " · a földön" : "")]];
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
    c.fillText(pl.crashed > 0 ? "LEZUHANT — újra 400 m-en" : "ÁTESÉS — nyomd le az orrát, adj gázt", W / 2, H * 0.3);
    c.textAlign = "left";
  }
  c.fillStyle = "rgba(150,180,196,.85)";
  c.font = `400 ${Math.round(10.5*s)}px "IBM Plex Mono", monospace`;
  c.fillText(pl.type === "heli"
    ? "W/S/A/D ciklikus · Q/E pedál · R/F kollektív · C pilótafülke · 1 2 3 gép"
    : "W/S bólint · A/D dönt (a dőlés megmarad!) · Q/E oldalkormány · R/F gáz · Space fék a földön · C fülke · 1 2 3 gép",
    16*s, H - 16*s);
  c.fillStyle = "rgba(63,203,210,.95)";
  c.font = `600 ${Math.round(13*s)}px "IBM Plex Mono", monospace`;
  c.fillText("Esc — vissza a vonatra", 16*s, H - 34*s);
}

// The inset map (and the full map on Tab): the line, every other train,
// and where the camera is and which way it looks. Drawn in flight too.
function drawMap(c, W, H, s, st, world) {
  const { imgMap, routeData, mapMeta } = world;
  {
    const full = state.map;
    // The opened map has to fit the window in BOTH directions. Sized on width
    // alone it runs off the top and bottom of a tall window — the map here is
    // portrait, being sixty kilometres of river, so on any window taller than
    // it is wide the height is the binding constraint, not the width.
    let mw = full ? Math.min(W * 0.86, imgMap.width * s * 1.5) : 300 * s;
    let mh = mw * imgMap.height / imgMap.width;
    if (full && mh > H * 0.88) { mh = H * 0.88; mw = mh * imgMap.width / imgMap.height; }
    const mx = full ? (W - mw) / 2 : W - mw - 16 * s;
    const my = full ? (H - mh) / 2 : 16 * s;
    c.globalAlpha = full ? 0.97 : 0.82;
    c.fillStyle = "rgba(8,14,18,.9)";
    c.fillRect(mx - 5*s, my - 5*s, mw + 10*s, mh + 10*s);
    c.drawImage(imgMap, mx, my, mw, mh);
    c.strokeStyle = "rgba(150,180,196,.5)"; c.lineWidth = 1*s;
    c.strokeRect(mx - 5*s, my - 5*s, mw + 10*s, mh + 10*s);
    const toMap = (wx, wy) => [
      mx + wx / mapMeta.metres_per_px / imgMap.width * mw,
      my + (1 - wy / (mapMeta.metres_per_px * imgMap.height)) * mh,
    ];
    if (full) {
      c.font = `600 ${Math.round(10.5*s)}px "IBM Plex Sans", system-ui, sans-serif`;
      c.textAlign = "left"; c.fillStyle = "rgba(240,248,252,.95)";
      for (const stp of routeData.stops) {
        const [px_, py_] = toMap(stp.xy[0], stp.xy[1]);
        c.fillText(stp.name, px_ + 7*s, py_ + 3.5*s);
      }
    }
    // every other service on the line, so they can actually be found
    for (const tr of st.traffic.trains) {
      if (tr.svc.id === "player") continue;
      const pts = tr.dir > 0 ? routeData.track_down : routeData.track_up;
      const f = (tr.m - pts[0][3]) / 10;
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(f)));
      const [tx, ty] = toMap(pts[i][0], pts[i][1]);
      c.fillStyle = tr.stock === "FREIGHT" ? "rgba(214,150,96,.95)"
                  : tr.stock === "EC" ? "rgba(176,170,226,.95)"
                  : "rgba(120,226,206,.95)";
      c.beginPath(); c.arc(tx, ty, (full ? 3.6 : 2.6) * s, 0, 7); c.fill();
      if (full) {
        c.font = `500 ${Math.round(9*s)}px "IBM Plex Mono", monospace`;
        c.fillText(tr.name, tx + 6*s, ty + 3*s);
      }
    }
    const [px_, py_] = toMap(st.camEye[0], -st.camEye[2]);
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

    // Semi-transparent field-of-view vision cone
    c.fillStyle = "rgba(63, 203, 210, 0.22)";
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 26 * s, -0.42, 0.42);
    c.closePath();
    c.fill();

    // Sharp glowing directional player arrow with border
    c.fillStyle = "rgba(63, 203, 210, 1.0)";
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
    c.restore();

    c.globalAlpha = 1;
    c.textAlign = "left";
  }

}

export function drawHud(c, canvas, st, world) {
  const { imgMap, routeData, mapMeta } = world;
  const W = canvas.width, H = canvas.height, s = W / 1200;
  c.clearRect(0, 0, W, H);
  c.textBaseline = "alphabetic";
  if (state.plane && state.plane.active) { drawPlaneHud(c, W, H, s); drawMap(c, W, H, s, st, world); return; }
  if (state.car && state.car.active) { drawCarHud(c, W, H, s); drawMap(c, W, H, s, st, world); return; }

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
      if (Math.atan2(rise, d) < 0.012) continue;
      const pr = project(st.vp, [pk.xy[0], pk.ele, -pk.xy[1]]);
      if (!pr) continue;
      const sx = (pr[0]*0.5+0.5)*W, sy = (1-(pr[1]*0.5+0.5))*H;
      if (sx < 40*s || sx > W-40*s || sy < 30*s || sy > H*0.72) continue;
      place(sx, sy, `${pk.name}  ${pk.ele|0}`, "rgba(236,244,248,.95)",
            Math.max(0.30, 1 - d / 26000));
    }
  }

  drawMap(c, W, H, s, st, world);

  // station banner — the stop was happening but was easy to miss
  {
    const d = st.driver;
    const next = st.route.nextStop(d.m);
    const dist = next ? (next.km * 1000 - d.m) * st.route.dir : 1e9;
    let banner = null, tone = "rgba(63,203,210,.95)";
    if (d.dwell > 0) {
      banner = `${d.lastStop || ""} — ${d.doors ? "DOORS OPEN" : "DOORS CLOSING"}`
             + `   ${d.boarding} passengers   ${d.dwell.toFixed(0)} s`;
    } else if (next && dist < 900 && d.v > 0.5) {
      banner = `${next.name} in ${Math.round(dist)} m — prepare to stop`;
      tone = "rgba(243,196,82,.95)";
    }
    // the vigilance warning has to be visible from outside the cab too
    if (st.driver.vigPenalty > 0) {
      banner = "ÉBER — kényszerfékezés · E a nyugtázás";
      tone = "rgba(255,90,78,.95)";
    } else if (st.driver.vigWarn > 0) {
      banner = `ÉBER — nyugtázd (E) · ${(5 - st.driver.vigWarn).toFixed(1)} s`;
      tone = "rgba(243,196,82,.95)";
    }
    if (state.jumpedTo && (!state.jumpedToUntil || performance.now() < state.jumpedToUntil) && !banner) {
      banner = `${state.jumpedTo}  ·  , . to step between stations`;
      tone = "rgba(140,190,240,.95)";
    }
    if (state.followIdx >= 0) {
      const list = st.traffic.trains.filter(t => t.svc.id !== "player");
      const f = list[state.followIdx];
      banner = f ? `Following ${f.name} · ${f.stock} · ${f.cars} cars`
                   + ` — ${f.dir > 0 ? "to Szob" : "to Budapest"}`
                   + `  ·  F next train, ESC cab` : null;
      tone = "rgba(140,190,240,.95)";
    } else if (state.followCarIdx >= 0 && st.traffic.roadTraffic && st.traffic.roadTraffic.vehicles.length) {
      const v = st.traffic.roadTraffic.vehicles[state.followCarIdx % st.traffic.roadTraffic.vehicles.length];
      banner = v ? `Following road ${v.type.kind.toUpperCase()} · ${(v.v * 3.6).toFixed(0)} km/h · V next vehicle, ESC cab` : null;
      tone = "rgba(120,220,180,.95)";
    } else if (state.followShipIdx >= 0 && st.traffic.riverTraffic) {
      const rt = st.traffic.riverTraffic;
      const allShips = [...(rt.ferries || []), ...(rt.ships || [])];
      const sh = allShips[state.followShipIdx % allShips.length];
      banner = sh ? `Following ${sh.name || (sh.type && sh.type.kind.toUpperCase()) || "VESSEL"} · ${(sh.v * 3.6).toFixed(0)} km/h · B next ship, ESC cab` : null;
      tone = "rgba(100,200,255,.95)";
    } else if (state.drone && state.drone.active) {
      banner = `DRONE FPV · WASD pitch/roll · Q/E yaw · Space/Shift thrust · Shift+D exit`;
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
  
  // Gamification overlay (Score & Messages)
  if (state.gamificationActive) {
    const gx = 24 * s;
    const gy = 100 * s;
    
    // Draw Score
    c.fillStyle = "rgba(8,14,18,.75)";
    c.fillRect(gx, gy, 200 * s, 44 * s);
    c.fillStyle = "rgba(240,248,252,.98)";
    c.font = `700 ${Math.round(24 * s)}px "Archivo", system-ui, sans-serif`;
    c.fillText(String(state.score).padStart(6, "0"), gx + 16 * s, gy + 32 * s);
    c.fillStyle = "rgba(63,203,210,.95)";
    c.font = `600 ${Math.round(12 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
    c.fillText("SCORE", gx + 130 * s, gy + 30 * s);

    // Draw Messages
    if (state.messages && state.messages.length > 0) {
      for (let i = 0; i < state.messages.length; i++) {
        const msg = state.messages[i];
        const alpha = Math.min(1.0, msg.t);
        c.fillStyle = msg.text.startsWith("+") 
          ? `rgba(69,217,131,${alpha})` 
          : `rgba(255,114,100,${alpha})`;
        c.font = `600 ${Math.round(16 * s)}px "IBM Plex Sans", system-ui, sans-serif`;
        c.fillText(msg.text, gx, gy + 64 * s + i * 22 * s);
      }
    }
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
  const next = st.route.nextStop(st.driver.m);
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
  if (follow) cell([`${follow.name} → ${follow.dir > 0 ? "Szob" : "Budapest"}`, F(600, 15), BRIGHT],
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
         ["menetrendhez", F(400, 10, "m"), FAINT]);
  }
  // station work, or who is on board
  if (st.driver.dwell > 0)
    cell([`${st.driver.doors ? "ajtók nyitva" : "ajtózárás"} · ${st.driver.dwell.toFixed(0)} s`, F(600, 13), "rgba(63,203,210,.95)"],
         [`${st.driver.boarding} utas cserél`, F(400, 11, "m"), DIM]);
  else if (!follow) cell([`${st.driver.pax}`, F(600, 14, "m"), BRIGHT], ["utas", F(400, 10, "m"), FAINT]);
  // weather
  if (state.wx) {
    const w = state.wx;
    const p = w.precip.kind && w.precip.rate > 0.02 ? `${PRECIP[w.precip.kind]} ${(w.precip.rate * 100) | 0}%` : "száraz";
    cell([`${w.tempC.toFixed(0)}°C · ${compass(w.wind.from)} ${w.wind.speed.toFixed(0)} m/s`, F(400, 12, "m"), DIM],
         [`${p} · ${fmtVis(visibilityOf(st.pal.fog))}`, F(400, 10, "m"),
          w.precip.kind && w.precip.rate > 0.02 ? "rgba(120,190,226,.95)" : FAINT]);
  }
  // score, if the run is being scored
  if (st.state && st.state.score != null)
    cell([`${st.state.score}`, F(600, 14, "m"), "#3fcbd2"], ["pont", F(400, 10, "m"), FAINT]);
  // time compression / pause: only when it is not plain real time
  if (state.speedMul !== 1 || state.paused)
    cell([state.paused ? "SZÜNET" : `×${state.speedMul}`, F(600, 14, "m"), "rgba(243,196,82,.95)"], ["idő", F(400, 10, "m"), FAINT]);

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
    c.fillText(dist < 9000 ? `jelző ${Math.round(dist)} m` : "—", W - 108*s, H - 27*s);
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
    let msgY = H - bh - 40*s;
    for (const msg of st.state.messages) {
      const alpha = Math.min(1.0, msg.t);
      c.font = `600 ${Math.round(13*s)}px "IBM Plex Sans", system-ui, sans-serif`;
      const w = c.measureText(msg.text).width;
      c.fillStyle = `rgba(8,14,18,${alpha * 0.8})`;
      c.fillRect(24*s, msgY, w + 20*s, 26*s);
      c.fillStyle = msg.text.startsWith("+") ? `rgba(69,217,131,${alpha})` : `rgba(255,114,100,${alpha})`;
      c.fillText(msg.text, 34*s, msgY + 18*s);
      msgY -= 31*s;
    }
  }
}
