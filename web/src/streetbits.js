import { FBuf } from "./engine.js";
// The street's small things in Budapest (tools/bake_streetbits.py →
// data/streetbits.json, all from OSM): bus and tram stop shelters and signs,
// the raised stop platforms, litter bins, benches, recycling bins, fences,
// hedges and guard rails. Simple coloured shapes in the track program, built
// in 1 km chunks round the camera (as streams.js), at most two a frame.
//
// What is a guess: a shelter mapped only as a point (or as `shelter=yes` on
// the stop) is 4 × 1.5 m and faces the nearest road; colours are typical
// BKK ones, not per stop; fences are one height (1.25 m) and drawn solid.
import { metresPerDegree } from "./city.js";

const SB_CHUNK = 1000;
const SB_STEEL = [0.30, 0.32, 0.33], SB_GLASS = [0.58, 0.66, 0.70], SB_ROOF = [0.22, 0.24, 0.26],
      SB_BKK = [0.10, 0.27, 0.56], SB_WHITE = [0.86, 0.87, 0.86], SB_BIN = [0.18, 0.26, 0.22],
      SB_WOOD = [0.42, 0.30, 0.19], SB_FENCE = [0.40, 0.44, 0.40], SB_FENCE_TOP = [0.30, 0.33, 0.30],
      SB_HEDGE = [0.17, 0.29, 0.13], SB_HEDGE_TOP = [0.22, 0.35, 0.16], SB_RAIL = [0.62, 0.63, 0.62],
      SB_PLAT = [0.52, 0.51, 0.49], SB_KERB = [0.62, 0.61, 0.58], SB_TRAMSIGN = [0.92, 0.70, 0.10];
const SB_RECYCLE = [[0.20, 0.42, 0.22], [0.86, 0.72, 0.14], [0.18, 0.36, 0.62]];

export class StreetBits {
  /** @param isRoad (x, north) → true on a road's carriageway
   *  @param railDist (x, north) → metres to this line's own track */
  constructor(data, near, demAt, isRoad, railDist) {
    const [mlat, mlon] = metresPerDegree(near.frame_lat ?? (near.south + near.north) / 2);
    this.demAt = demAt; this.isRoad = isRoad; this.railDist = railDist;
    const X = (lo) => (data.lon0 + lo * 1e-5 - near.west) * mlon, Nn = (la) => (data.lat0 + la * 1e-5 - near.south) * mlat;
    this.chunks = new Map(); this.built = new Map();
    const put = (x, n, item) => {
      const k = Math.floor(x / SB_CHUNK) + "," + Math.floor(n / SB_CHUNK);
      if (!this.chunks.has(k)) this.chunks.set(k, []);
      this.chunks.get(k).push(item);
    };
    const p = data.p || [];
    for (let i = 0; i < p.length; i += 6) {
      const x = X(p[i + 2]), n = Nn(p[i + 1]);
      put(x, n, { t: "p", kind: p[i], x, n, ang: p[i + 3], len: p[i + 4] / 10, wid: p[i + 5] / 10 });
    }
    for (const f of data.l || []) {
      let la = 0, lo = 0;
      const P = [];
      for (let i = 1; i < f.length; i += 2) { la += f[i]; lo += f[i + 1]; P.push([X(lo), Nn(la)]); }
      // a line goes into the chunk of each of its points (so a long fence is
      // in every chunk it crosses), split into runs per chunk
      let run = null, key = null;
      for (let i = 0; i < P.length; i++) {
        const k = Math.floor(P[i][0] / SB_CHUNK) + "," + Math.floor(P[i][1] / SB_CHUNK);
        if (f[0] === 4) { if (i === 0) put(P[0][0], P[0][1], { t: "l", kind: 4, pts: P }); continue; }
        if (k !== key) {
          if (run) run.pts.push(P[i]);
          key = k; run = { t: "l", kind: f[0], pts: i ? [P[i - 1], P[i]] : [P[i]] };
          put(P[i][0], P[i][1], run);
        } else run.pts.push(P[i]);
      }
    }
  }

  buildChunk(items) {
    const V = new FBuf(), C = new FBuf(), demAt = this.demAt;
    const push = (q, c) => { V.push(q[0], q[1], -q[2]); C.push(c[0], c[1], c[2]); };
    const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
    // the pavement's height: the road beside is laid on the highest ground
    // round it (geom.js demRidge), so the furniture must not stand lower
    const base = (x, n) => Math.max(demAt(x, n), demAt(x + 4, n), demAt(x - 4, n), demAt(x, n + 4), demAt(x, n - 4)) + 0.30;
    // an upright box round (x, n) turned by ang (radians, from east toward
    // north), half sizes hu (along) and hv (across), from y0 to y1 over g
    const box = (x, n, g, ang, hu, hv, y0, y1, col, top) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      const P = (u, v, h) => [x + c * u - s * v, g + h, n + s * u + c * v];
      const k = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
      for (let i = 0; i < 4; i++) {
        const [u0, v0] = k[i], [u1, v1] = k[(i + 1) % 4];
        quad(P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1), col);
      }
      quad(P(-hu, -hv, y1), P(hu, -hv, y1), P(hu, hv, y1), P(-hu, hv, y1), top || col);
    };
    // which way is the road from (x, n): the angle (as box's) of the side
    // facing it, or null
    const roadward = (x, n) => {
      for (const r of [4, 7, 11]) for (let a = 0; a < 8; a++) {
        const t = a * Math.PI / 4;
        if (this.isRoad(x + Math.cos(t) * r, n + Math.sin(t) * r)) return t;
      }
      return null;
    };
    for (const it of items) {
      if (it.t === "p") {
        const { kind, x, n } = it;
        const g = base(x, n);
        if (!isFinite(g)) continue;
        const h = Math.sin(x * 12.9898 + n * 78.233) * 43758.5453 % 1;
        if (kind <= 2 && this.isRoad(x, n)) continue;           // not in the carriageway
        if (kind === 0) {                                       // a litter bin on a post
          box(x, n, g, 0, 0.04, 0.04, 0, 0.55, SB_STEEL);
          box(x, n, g, h * 3, 0.22, 0.22, 0.45, 1.0, SB_BIN, SB_STEEL);
        } else if (kind === 1) {                                // a bench
          const ang = it.ang >= 0 ? Math.PI / 2 - it.ang * Math.PI / 180 : h * Math.PI;
          box(x, n, g, ang, 0.85, 0.05, 0.0, 0.42, SB_STEEL);
          box(x, n, g, ang, 0.9, 0.22, 0.42, 0.47, SB_WOOD);
          box(x - Math.sin(ang) * 0.2, n + Math.cos(ang) * 0.2, g, ang, 0.9, 0.03, 0.55, 0.85, SB_WOOD);
        } else if (kind === 2) {                                // three recycling bins
          const ang = h * Math.PI;
          for (let j = 0; j < 3; j++)
            box(x + Math.cos(ang) * (j - 1) * 1.6, n + Math.sin(ang) * (j - 1) * 1.6, g, ang, 0.7, 0.7, 0, 1.5, SB_RECYCLE[j]);
        } else if (kind === 3 || kind === 4) {                  // a stop sign: pole and plate
          box(x, n, g, 0, 0.04, 0.04, 0, 2.9, SB_STEEL);
          const t = roadward(x, n), ang = t == null ? 0 : t;      // (the plate faces along the road)
          box(x, n, g, ang, 0.30, 0.02, 2.2, 2.85, kind === 4 ? SB_TRAMSIGN : SB_BKK, SB_WHITE);
        } else if (kind === 5) {                                // a shelter
          const L = it.len > 1.5 ? Math.min(it.len, 14) : 4, W = it.wid > 0.8 ? Math.min(it.wid, 3) : 1.5;
          // the long side's angle: OSM's outline, else across the road
          let ang, t = roadward(x, n);
          if (it.ang >= 0) {
            ang = Math.PI / 2 - it.ang * Math.PI / 180;
            // face the road: of the two long sides, the open one is roadward
            if (t != null && Math.cos(t - (ang + Math.PI / 2)) < 0) ang += Math.PI;
          } else ang = t == null ? h * Math.PI : t - Math.PI / 2;
          const c = Math.cos(ang), s = Math.sin(ang), hu = L / 2, hv = W / 2;
          const P = (u, v, y) => [x + c * u - s * v, g + y, n + s * u + c * v];
          // back wall (glass with a steel band), two side panes, four posts,
          // the roof slab, a bench along the back; the roadward side (v = +hv) open
          quad(P(-hu, -hv, 0.1), P(hu, -hv, 0.1), P(hu, -hv, 2.3), P(-hu, -hv, 2.3), SB_GLASS);
          quad(P(-hu, -hv + 0.02, 0.9), P(hu, -hv + 0.02, 0.9), P(hu, -hv + 0.02, 1.05), P(-hu, -hv + 0.02, 1.05), SB_STEEL);
          for (const su of [-1, 1]) quad(P(su * hu, -hv, 0.1), P(su * hu, hv * 0.2, 0.1), P(su * hu, hv * 0.2, 2.3), P(su * hu, -hv, 2.3), SB_GLASS);
          for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
            box(x + c * su * hu - s * sv * hv, n + s * su * hu + c * sv * hv, g, ang, 0.05, 0.05, 0, 2.4, SB_STEEL);
          box(x, n, g, ang, hu + 0.15, hv + 0.2, 2.4, 2.55, SB_ROOF);
          box(x + s * (hv - 0.35), n - c * (hv - 0.35), g, ang, hu * 0.7, 0.2, 0.42, 0.47, SB_WOOD);
          // the name board on one end
          box(x + c * (hu - 0.3) - s * hv * 0.6, n + s * (hu - 0.3) + c * hv * 0.6, g, ang, 0.03, 0.35, 2.55, 2.85, SB_BKK, SB_WHITE);
        }
        continue;
      }
      const P = it.pts;
      if (it.kind === 4) {                                      // a stop platform, as its outline
        if (P.length < 3 || this.railDist(P[0][0], P[0][1]) < 30) continue;
        let cx = 0, cn = 0;
        for (const q of P) { cx += q[0]; cn += q[1]; }
        cx /= P.length; cn /= P.length;
        const top = base(cx, cn) + 0.08;
        if (!isFinite(top)) continue;
        for (let i = 0; i + 1 < P.length; i++) {
          const a = P[i], b = P[i + 1];
          quad([cx, top, cn], [cx, top, cn], [a[0], top, a[1]], [b[0], top, b[1]], SB_PLAT);
          quad([a[0], demAt(a[0], a[1]) - 0.3, a[1]], [b[0], demAt(b[0], b[1]) - 0.3, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], SB_KERB);
        }
        continue;
      }
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b[0] - a[0], dn = b[1] - a[1], L = Math.hypot(dx, dn);
        if (L < 0.2 || L > 400) continue;
        const ga = demAt(a[0], a[1]), gb = demAt(b[0], b[1]);
        if (!isFinite(ga) || !isFinite(gb)) continue;
        const nx = -dn / L, nn = dx / L;
        const Q = (p, g, o, y) => [p[0] + nx * o, g + y, p[1] + nn * o];
        if (it.kind === 0) {                                    // fence: a panel with a top rail
          quad(Q(a, ga, 0, -0.4), Q(b, gb, 0, -0.4), Q(b, gb, 0, 1.1), Q(a, ga, 0, 1.1), SB_FENCE);
          quad(Q(a, ga, 0, 1.1), Q(b, gb, 0, 1.1), Q(b, gb, 0, 1.25), Q(a, ga, 0, 1.25), SB_FENCE_TOP);
        } else if (it.kind === 1) {                             // hedge
          for (const o of [-0.4, 0.4]) quad(Q(a, ga, o, -0.3), Q(b, gb, o, -0.3), Q(b, gb, o, 1.3), Q(a, ga, o, 1.3), SB_HEDGE);
          quad(Q(a, ga, -0.4, 1.3), Q(b, gb, -0.4, 1.3), Q(b, gb, 0.4, 1.3), Q(a, ga, 0.4, 1.3), SB_HEDGE_TOP);
        } else if (it.kind === 2) {                             // guard rail on short posts
          quad(Q(a, ga, 0, 0.45), Q(b, gb, 0, 0.45), Q(b, gb, 0, 0.75), Q(a, ga, 0, 0.75), SB_RAIL);
          for (let t = 0; t < L; t += 4) {
            const px = a[0] + dx / L * t, pn = a[1] + dn / L * t, g = ga + (gb - ga) * t / L;
            box(px, pn, g, 0, 0.06, 0.06, -0.2, 0.7, SB_STEEL);
          }
        } else if (it.kind === 3) {                             // a stop platform drawn as a line: a 2.4 m strip
          const mx = (a[0] + b[0]) / 2, mn = (a[1] + b[1]) / 2;
          if (this.railDist(mx, mn) < 30) continue;
          const ya = base(a[0], a[1]) + 0.08, yb = base(b[0], b[1]) + 0.08;
          quad(Q(a, ya, -1.2, 0), Q(b, yb, -1.2, 0), Q(b, yb, 1.2, 0), Q(a, ya, 1.2, 0), SB_PLAT);
          for (const o of [-1.2, 1.2]) quad(Q(a, ga - 0.3, o, 0), Q(b, gb - 0.3, o, 0), Q(b, yb, o, 0), Q(a, ya, o, 0), SB_KERB);
        }
      }
    }
    return { verts: V.arr(), cols: C.arr(), count: V.length / 3 };
  }

  update(cx, cn, R, make, free) {
    const want = [];
    const k0x = Math.floor(cx / SB_CHUNK), k0y = Math.floor(cn / SB_CHUNK), r = Math.ceil(R / SB_CHUNK);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const k = (k0x + i) + "," + (k0y + j);
      if (!this.chunks.has(k) || this.built.has(k)) continue;
      const d = Math.hypot((k0x + i + 0.5) * SB_CHUNK - cx, (k0y + j + 0.5) * SB_CHUNK - cn);
      if (d < R) want.push([d, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, k] of want.slice(0, 2)) {
      const m = this.buildChunk(this.chunks.get(k));
      this.built.set(k, m.count ? make(m) : null);
    }
    for (const [k, m] of this.built) {
      const [i, j] = k.split(",").map(Number);
      if (Math.hypot((i + 0.5) * SB_CHUNK - cx, (j + 0.5) * SB_CHUNK - cn) > R + 700) {
        if (m) free(m);
        this.built.delete(k);
      }
    }
  }
  each(fn) { for (const m of this.built.values()) if (m) fn(m); }
}
