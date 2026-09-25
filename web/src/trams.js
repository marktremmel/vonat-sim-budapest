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
      TRAM_ROOF = [0.62, 0.63, 0.64], TRAM_SKIRT = [0.20, 0.20, 0.22], TRAM_LAMP = [2.2, 2.1, 1.8];
const TRAM_V_CRUISE = 9.0, TRAM_DWELL = 20;

export class Trams {
  /** @param coverIsWater (x, north) → true over the river (the cover raster) */
  constructor(data, near, demAt, waterAt, coverIsWater) {
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
      // plateau, water + 8.9 m), ramped at 5% either side
      const ys = P.map(([x, n]) => {
        const g = demAt(x, n);
        return coverIsWater(x, n) ? Math.max(g, waterAt(n) + 8.9) : g + 0.3;
      });
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] - 0.25);
        for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.max(ys[i], ys[i + 1] - 0.25);
      }
      if (ys.some(y => !isFinite(y))) continue;
      const len = cum[cum.length - 1];
      // the run: stops by distance, and the time it reaches and leaves each
      const stops = (r.stops || []).filter(s => s > 5 && s < len - 5);
      const events = [];                                // [t, s] breakpoints
      let t = 0, s = 0;
      for (const st of stops) {
        t += (st - s) / TRAM_V_CRUISE; s = st; events.push([t, s]);
        t += TRAM_DWELL; events.push([t, s]);
      }
      t += (len - s) / TRAM_V_CRUISE; events.push([t, len]);
      this.routes.push({ ref: r.ref, to: r.to, P, cum, ys, len, run: t, events: [[0, 0], ...events],
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
  /** Every tram near (cx, cn) at time t (seconds of the day), as a mesh. */
  build(t, cx, cn, reach = 3000, night = 0) {
    const V = [], C = [];
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
          band(0.30, 0.55, TRAM_SKIRT);
          band(0.55, 1.05, TRAM_YEL);
          band(1.05, 1.18, TRAM_WHITE);
          band(1.18, 2.35, TRAM_WIN);
          band(2.35, H - 0.25, TRAM_YEL);
          quad(P(a, -W, H - 0.25), P(b, -W, H - 0.25), P(b, -W * 0.8, H), P(a, -W * 0.8, H), TRAM_ROOF);
          quad(P(a, W, H - 0.25), P(b, W, H - 0.25), P(b, W * 0.8, H), P(a, W * 0.8, H), TRAM_ROOF);
          quad(P(a, -W * 0.8, H), P(b, -W * 0.8, H), P(b, W * 0.8, H), P(a, W * 0.8, H), TRAM_ROOF);
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
    return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
  }
}
