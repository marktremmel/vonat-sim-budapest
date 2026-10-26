import { FBuf } from "./engine.js";
// Budapest's trams (tools/bake_trams.py → data/trams.json): lines 1, 2, 3, 4,
// 6, 56 and 61 on their OSM routes, one relation per direction. The first
// step of the "one world" plan (docs/UNIFIED_ENGINE_SPEC.md): the city's tram
// tracks were drawn, and nothing ran on them.
//
// Each route runs a cycle that is the same every day: out at 9 m/s (about
// 32 km/h, a fair average for a Budapest tram between stops), 20 s at each
// stop, and at the end the tram leaves the scene; the next one is already
// coming. The headway is per line (4/6 every 4 min, 1 every 6, the rest
// every 8–10). Positions come from the clock, so they need no simulation and
// agree after a jump in time.
//
// Models, all BKV yellow with a white band: a Siemens Combino (4/6, 54 m,
// six sections), a CAF Urbos (1, 56 m), and the older two- and three-section
// cars elsewhere. Built each frame within 3 km of the camera, as the trains.
import { metresPerDegree } from "./city.js";

const TRAM_HEADWAY = { "4": 240, "6": 240, "1": 360, "2": 540, "3": 480, "56": 600, "61": 600 };
const TRAM_MODEL = {   // [sections, section length, articulation gap, height]
  "4": [6, 8.85, 0.25, 3.35], "6": [6, 8.85, 0.25, 3.35], "1": [5, 11.0, 0.3, 3.4],
  "2": [2, 13.0, 0.4, 3.3], "3": [2, 13.5, 0.4, 3.3], "56": [3, 11.0, 0.35, 3.35], "61": [3, 11.0, 0.35, 3.35],
};
const TRAM_YEL = [0.96, 0.76, 0.08], TRAM_WHITE = [0.92, 0.92, 0.90], TRAM_WIN = [0.10, 0.12, 0.15],
      TRAM_ROOF = [0.62, 0.63, 0.64], TRAM_SKIRT = [0.20, 0.20, 0.22], TRAM_LAMP = [2.2, 2.1, 1.8],
      TRAM_DOOR = [0.16, 0.19, 0.22], TRAM_BOGIE = [0.12, 0.12, 0.13];
const TRAM_V_CRUISE = 9.0, TRAM_DWELL = 20;

export class Trams {
  /** @param coverIsWater (x, north) → true over the river (the cover raster) */
  constructor(data, near, demAt, waterAt, coverIsWater) {
    window.__trams = this;
    const [mlat, mlon] = metresPerDegree(near.frame_lat ?? (near.south + near.north) / 2);
    this.routes = [];
    for (const r of data.routes || []) {
      const pts = r.pts.map(([la, lo]) => [(lo - near.west) * mlon, (la - near.south) * mlat]);
      // resample to 5 m, so the height follows the ground and the bridges
      const P = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
        for (let k = 0; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      P.push(pts[pts.length - 1]);
      const cum = [0];
      for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      // height: the ground, or over the river a deck (the road bridges'
      // plateau, water + 9.2 m), ramped at 5% either side. Only 1, 4 and 6
      // cross the Danube; the others must not be lifted over city ponds.
      // (This used to test boxes typed in line 70's metres, so on line 2
      // and S21, whose frames differ by kilometres, the trams crossed the
      // river on its bed.)
      const crossesDanube = r.ref === "1" || r.ref === "4" || r.ref === "6";
      this.demAt = demAt;
      this.waterAt = waterAt;
      const ys = P.map(([x, n]) => {
        const g = demAt(x, n);
        return crossesDanube && coverIsWater(x, n) ? Math.max(g + 0.7, waterAt(n) + 9.2) : g + 0.7;
      });
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] - 0.25);
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.max(ys[i], ys[i + 1] - 0.25);
      }
      if (ys.some(y => !isFinite(y))) continue;
      const len = cum[cum.length - 1];
      // the run: stops by distance, and the time it reaches and leaves each
      const stops = (r.stops || []).filter(s => s > 5 && s < len - 5);
      // every stop with its OSM name (tools/bake_trams.py), termini included;
      // `stops` above, which times the run, leaves out the two ends. (The
      // names were a typed list matched by index, a stop or two out of step.)
      const names = r.stop_names || [];
      const stopList = (r.stops || []).map((sd, i) => ({ s: sd, name: names[i] || r.to || "" }));
      const events = [];                                // [t, s] breakpoints
      let t = 0, s = 0;
      for (const st of stops) {
        t += (st - s) / TRAM_V_CRUISE; s = st; events.push([t, s]);
        t += TRAM_DWELL; events.push([t, s]);
      }
      t += (len - s) / TRAM_V_CRUISE; events.push([t, len]);
      this.routes.push({ ref: r.ref, to: r.to, P, cum, ys, len, run: t, events: [[0, 0], ...events],
                         stops, stopList,
                         head: TRAM_HEADWAY[r.ref] || 600, model: TRAM_MODEL[r.ref] || TRAM_MODEL["2"],
                         phase: (r.ref.charCodeAt(0) * 37 + r.len) % 600 });
    }
  }
  at(r, s) {
    s = Math.max(0, Math.min(r.len, s));
    let lo = 1, hi = r.cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (r.cum[m] < s) lo = m + 1; else hi = m; }
    const i = lo, u = (s - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]);
    const a = r.P[i - 1], b = r.P[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * u, n: a[1] + dy * u, y: r.ys[i - 1] + (r.ys[i] - r.ys[i - 1]) * u, fx: dx / L, fn: dy / L };
  }
  /** where along its route a tram that set out `age` seconds ago is */
  sAt(r, age) {
    const E = r.events;
    let lo = 0, hi = E.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (E[m][0] <= age) lo = m; else hi = m; }
    const [t0, s0] = E[lo], [t1, s1] = E[hi];
    return t1 > t0 ? s0 + (s1 - s0) * Math.min(1, (age - t0) / (t1 - t0)) : s0;
  }
  /** The tram on the road nearest (x, n) at time t: { ri, dep, dist }, dep
   *  being when it set out (so its place later is sAt(route, t - dep)).
   *  With onlyRoute (a route index, a list of them, or a test of
   *  (ri, dep)), only those count. */
  nearest(t, x, n, onlyRoute = -1) {
    const ok = typeof onlyRoute === "function" ? onlyRoute
      : Array.isArray(onlyRoute) ? (ri) => onlyRoute.includes(ri)
      : (ri) => onlyRoute < 0 || ri === onlyRoute;
    const day0 = 4.5 * 3600;
    if (t < day0 || t > 24 * 3600) return null;
    let best = null;
    this.routes.forEach((r, ri) => {
      if (!ok(ri)) return;
      for (let k = 0; ; k++) {
        const age = ((t - day0 - r.phase) % r.head + r.head) % r.head + k * r.head;
        if (age > r.run) break;
        if (!ok(ri, t - age)) continue;
        const q = this.at(r, this.sAt(r, age));
        const d = Math.hypot(q.x - x, q.n - n);
        if (!best || d < best.dist) best = { ri, dep: t - age, dist: d };
      }
    });
    return best;
  }
  /** Every tram near (cx, cn) at time t (seconds of the day), as a mesh. */
  build(t, cx, cn, reach = 3000, night = 0) {
    const V = new FBuf(), C = new FBuf();
    const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
    const day0 = 4.5 * 3600, day1 = 24 * 3600;           // trams run from 4:30 to midnight
    if (t < day0 || t > day1) return { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };
    for (const r of this.routes) {
      // quick reject: is any of this route near the camera?
      const mid = r.P[(r.P.length / 2) | 0];
      if (Math.hypot(mid[0] - cx, mid[1] - cn) > reach + r.len * 0.5) continue;
      const [sec, secL, gap, H] = r.model;
      for (let k = 0; ; k++) {
        const age = ((t - day0 - r.phase) % r.head + r.head) % r.head + k * r.head;
        if (age > r.run) break;
        const front = this.sAt(r, age);
        const q0 = this.at(r, front);
        if (Math.hypot(q0.x - cx, q0.n - cn) > reach) continue;
        for (let j = 0; j < sec; j++) {
          const s1 = front - j * (secL + gap), s0 = s1 - secL;
          if (s0 < 0) break;
          const a = this.at(r, s0), b = this.at(r, s1);
          const nx = -a.fn, nn = a.fx, W = 1.2;
          const P = (q, o, up) => [q.x + nx * o, q.y + up, q.n + nn * o];
          const band = (y0, y1, col) => {
            quad(P(a, -W, y0), P(b, -W, y0), P(b, -W, y1), P(a, -W, y1), col);
            quad(P(a, W, y0), P(b, W, y0), P(b, W, y1), P(a, W, y1), col);
          };
          // a piece of the side between two fractions of the section (u0..u1
          // along it), at one height range, on both sides
          const piece = (u0, u1, y0, y1, col, inset = 0) => {
            const A = this.at(r, s0 + secL * u0), Bq = this.at(r, s0 + secL * u1);
            for (const sg of [-1, 1]) {
              const w = sg * (W - inset);
              quad(P(A, w, y0), P(Bq, w, y0), P(Bq, w, y1), P(A, w, y1), col);
            }
          };
          band(0.30, 0.55, TRAM_SKIRT);
          band(0.55, 1.05, TRAM_YEL);
          band(1.05, 1.18, TRAM_WHITE);
          // the window band: panes with yellow pillars between them, and two
          // doors a section (dark glass to the floor, framed in yellow). One
          // continuous black stripe read as a toy.
          const bays = Math.max(3, Math.round(secL / 1.75));
          const doorAt = new Set([1, bays - 2]);
          for (let k2 = 0; k2 < bays; k2++) {
            const u0 = k2 / bays, u1 = (k2 + 1) / bays, gap = 0.09 / secL * 1.75;
            if (doorAt.has(k2)) {
              piece(u0, u1, 1.05, 2.35, TRAM_YEL);
              piece(u0 + gap, u1 - gap, 0.62, 2.25, TRAM_DOOR, -0.01);
              piece((u0 + u1) / 2 - 0.004, (u0 + u1) / 2 + 0.004, 0.62, 2.25, TRAM_SKIRT, -0.02);
            } else {
              piece(u0, u1, 1.18, 2.35, TRAM_YEL);
              piece(u0 + gap, u1 - gap, 1.28, 2.25, TRAM_WIN, -0.01);
            }
          }
          band(2.35, H - 0.25, TRAM_YEL);
          quad(P(a, -W, H - 0.25), P(b, -W, H - 0.25), P(b, -W * 0.8, H), P(a, -W * 0.8, H), TRAM_ROOF);
          quad(P(a, W, H - 0.25), P(b, W, H - 0.25), P(b, W * 0.8, H), P(a, W * 0.8, H), TRAM_ROOF);
          quad(P(a, -W * 0.8, H), P(b, -W * 0.8, H), P(b, W * 0.8, H), P(a, W * 0.8, H), TRAM_ROOF);
          // a bogie under each end of the section: dark, inset, with a wheel
          // line; and a roof box (the traction equipment) on every other one
          for (const uc of [0.2, 0.8]) {
            piece(uc - 0.07, uc + 0.07, 0.05, 0.45, TRAM_BOGIE, 0.25);
            piece(uc - 0.05, uc - 0.01, 0.05, 0.35, TRAM_SKIRT, 0.2);
            piece(uc + 0.01, uc + 0.05, 0.05, 0.35, TRAM_SKIRT, 0.2);
          }
          if (j % 2 === 1) {
            const R0 = this.at(r, s0 + secL * 0.3), R1 = this.at(r, s0 + secL * 0.7);
            quad(P(R0, -0.7, H + 0.02), P(R1, -0.7, H + 0.02), P(R1, -0.7, H + 0.4), P(R0, -0.7, H + 0.4), TRAM_ROOF);
            quad(P(R0, 0.7, H + 0.02), P(R1, 0.7, H + 0.02), P(R1, 0.7, H + 0.4), P(R0, 0.7, H + 0.4), TRAM_ROOF);
            quad(P(R0, -0.7, H + 0.4), P(R1, -0.7, H + 0.4), P(R1, 0.7, H + 0.4), P(R0, 0.7, H + 0.4), TRAM_SKIRT);
          }
          // ends: the cab faces at the two ends, dark bellows between sections
          const end = (q, col) => quad(P(q, -W, 0.3), P(q, W, 0.3), P(q, W, H - 0.25), P(q, -W, H - 0.25), col);
          end(b, j === 0 ? TRAM_YEL : TRAM_SKIRT);
          end(a, j === sec - 1 ? TRAM_YEL : TRAM_SKIRT);
          if (j === 0) {
            const f = this.at(r, s1 + 0.02);
            quad(P(f, -W * 0.9, 1.25), P(f, W * 0.9, 1.25), P(f, W * 0.9, 2.45), P(f, -W * 0.9, 2.45), TRAM_WIN);
            const lc = [TRAM_LAMP[0] * (0.4 + night), TRAM_LAMP[1] * (0.4 + night), TRAM_LAMP[2] * (0.4 + night)];
            for (const o of [-0.8, 0.8]) quad(P(f, o - 0.14, 0.75), P(f, o + 0.14, 0.75), P(f, o + 0.14, 0.95), P(f, o - 0.14, 0.95), lc);
            // the pantograph over the leading section
            const m = this.at(r, s1 - secL * 0.5);
            quad(P(m, -0.6, H + 0.05), P(m, 0.6, H + 0.05), P(m, 0.6, H + 0.65), P(m, -0.6, H + 0.65), TRAM_SKIRT);
          }
        }
      }
    }

    // (A 139 m stone viaduct at a fixed 238 m used to stand here, typed in
    // line 70's metres. OSM's "Nagyhíd" on the 56/61 is a 3.7 m bridge over
    // a ditch, ways 1354687146/7: the track stays on the ground.)

    // Danube Tram Bridges (Árpád híd, Rákóczi híd, Margit híd, Petőfi híd):
    // Realistic elevated bridge deck, cornices, railings, and river piers
    const bridgeCols = { deck: [0.44, 0.46, 0.48], dark: [0.28, 0.30, 0.32], rail: [0.18, 0.20, 0.22], pier: [0.55, 0.54, 0.50] };
    const builtBridgeSegments = new Set();
    for (const r of this.routes) {
      if (r.ref !== "1" && r.ref !== "4" && r.ref !== "6") continue;
      const P = r.P, ys = r.ys;
      for (let i = 1; i < P.length; i++) {
        const p0 = P[i - 1], p1 = P[i];
        const mx = (p0[0] + p1[0]) * 0.5, mn = (p0[1] + p1[1]) * 0.5;
        if (Math.hypot(mx - cx, mn - cn) > reach + 120) continue;
        const g0 = this.demAt ? this.demAt(p0[0], p0[1]) : 100;
        const g1 = this.demAt ? this.demAt(p1[0], p1[1]) : 100;
        const elev0 = ys[i - 1] - g0, elev1 = ys[i] - g1;
        // On bridge if elevated above ground by >= 2.0m (over river)
        if (elev0 > 2.0 && elev1 > 2.0) {
          const segKey = `${Math.round(mx / 8)},${Math.round(mn / 8)}`;
          if (builtBridgeSegments.has(segKey)) continue;
          builtBridgeSegments.add(segKey);

          const dx = p1[0] - p0[0], dn = p1[1] - p0[1], L = Math.hypot(dx, dn) || 1;
          const fx = dx / L, fn = dn / L;
          const nx = -fn, nn = fx;
          const w = 2.6;
          const y0 = ys[i - 1] - 0.20, y1 = ys[i] - 0.20;
          const q0 = (off, up) => [p0[0] + nx * off, y0 + up, p0[1] + nn * off];
          const q1 = (off, up) => [p1[0] + nx * off, y1 + up, p1[1] + nn * off];

          // Deck top
          quad(q0(-w, 0), q1(-w, 0), q1(w, 0), q0(w, 0), bridgeCols.deck);
          // Deck sides / cornices
          quad(q0(-w, -1.2), q1(-w, -1.2), q1(-w, 0), q0(-w, 0), bridgeCols.dark);
          quad(q0(w, 0), q1(w, 0), q1(w, -1.2), q0(w, -1.2), bridgeCols.dark);
          // Steel safety railings
          quad(q0(-w - 0.05, 0), q1(-w - 0.05, 0), q1(-w - 0.05, 1.05), q0(-w - 0.05, 1.05), bridgeCols.rail);
          quad(q0(w + 0.05, 1.05), q1(w + 0.05, 1.05), q1(w + 0.05, 0), q0(w + 0.05, 0), bridgeCols.rail);

          // River piers every ~35 m
          if (i % 7 === 0) {
            const riverBed = (this.waterAt ? this.waterAt(mn) - 4.5 : 94);
            const pw = 1.6, pl = 1.6;
            const pierPt = (ox, oz, up) => [mx + nx * ox + fx * oz, up, mn + nn * ox + fn * oz];
            quad(pierPt(-pw, -pl, riverBed), pierPt(pw, -pl, riverBed), pierPt(pw, -pl, y0 - 1.2), pierPt(-pw, -pl, y0 - 1.2), bridgeCols.pier);
            quad(pierPt(pw, pl, riverBed), pierPt(-pw, pl, riverBed), pierPt(-pw, pl, y0 - 1.2), pierPt(pw, pl, y0 - 1.2), bridgeCols.pier);
            quad(pierPt(pw, -pl, riverBed), pierPt(pw, pl, riverBed), pierPt(pw, pl, y0 - 1.2), pierPt(pw, -pl, y0 - 1.2), bridgeCols.dark);
            quad(pierPt(-pw, pl, riverBed), pierPt(-pw, -pl, riverBed), pierPt(-pw, -pl, y0 - 1.2), pierPt(-pw, pl, y0 - 1.2), bridgeCols.dark);
          }
        }
      }
    }

    return { verts: V.arr(), cols: C.arr(), count: V.length / 3 };
  }
}
