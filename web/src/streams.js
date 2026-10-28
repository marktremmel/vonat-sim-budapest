import { FBuf } from "./engine.js";
// Streams, ditches and small canals (tools/bake_streams.py → data/streams.json,
// from OSM waterway=stream/ditch/drain/canal; culverts and tunnels left out):
// the Rákos-patak, the Szilas-patak, the Ördög-árok, the ditches along the
// fields. Until now only the Danube and the lakes were water.
//
// Each is drawn as a strip of water between two muddy banks that darken
// towards it, laid on the ground a little above it (as the roads are). It is
// NOT dug into the terrain: the heightmap is 25 m a pixel and cannot hold a
// two-metre channel, so from low down the banks read as a ditch by their
// colour, not by a real drop.
//
// There are 3,500 km of them, so the meshes are cut into 1 km chunks and only
// those near the camera are built (two a frame at most) and kept.
import { metresPerDegree } from "./city.js";

// The water's colour is a marker: TRACK_FS shades it as water (sky in it at a
// glancing angle, a sun glint, a slow ripple). Keep the two in step.
export const STREAM_WATER = [0.090, 0.150, 0.160];
const STREAM_MUD = [0.30, 0.26, 0.19], STREAM_BANK = [0.29, 0.35, 0.19];
const STREAM_CHUNK = 1000;
// [water half-width, bank width] by kind: stream, ditch/drain, canal
const STREAM_SIZE = [[0.8, 1.3], [0.45, 0.8], [2.2, 1.6]];

export class Streams {
  /** @param coverIsWater (x, north) → true over a lake or the river */
  constructor(data, near, demAt, coverIsWater) {
    const [mlat, mlon] = metresPerDegree(near.frame_lat ?? (near.south + near.north) / 2);
    this.demAt = demAt; this.coverIsWater = coverIsWater;
    this.chunks = new Map();          // key → [{ kind, hw, bw, pts }]
    this.built = new Map();           // key → mesh (whatever build() returned)
    this.names = data.names || {};
    const W = (near.east - near.west) * mlon, N = (near.north - near.south) * mlat;
    (data.ways || []).forEach(([kind, wd, flat], wi) => {
      // undo the delta coding; lat/lon in 1e-5 degrees from (lat0, lon0)
      let la = 0, lo = 0;
      const P = [];
      for (let i = 0; i < flat.length; i += 2) {
        la += flat[i]; lo += flat[i + 1];
        const x = (data.lon0 + lo * 1e-5 - near.west) * mlon, n = (data.lat0 + la * 1e-5 - near.south) * mlat;
        P.push([x, n]);
      }
      // only what lies in this line's near region (where the ground is known)
      if (!P.some(([x, n]) => x > 0 && n > 0 && x < W && n < N)) return;
      // resample to 8 m so the strip follows the ground
      const R = [];
      for (let i = 1; i < P.length; i++) {
        const a = P[i - 1], b = P[i], k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8));
        for (let j = 0; j < k; j++) R.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
      }
      R.push(P[P.length - 1]);
      const [hw0, bw] = STREAM_SIZE[kind] || STREAM_SIZE[1];
      const hw = wd > 0 ? Math.min(6, wd / 20) : hw0;
      // cut into runs by chunk (each run keeps one point of overlap)
      let run = null, key = null;
      for (let i = 0; i < R.length; i++) {
        const k = Math.floor(R[i][0] / STREAM_CHUNK) + "," + Math.floor(R[i][1] / STREAM_CHUNK);
        if (k !== key) {
          if (run) run.pts.push(R[i]);
          key = k; run = { kind, hw, bw, pts: i ? [R[i - 1], R[i]] : [R[i]], wi };
          if (!this.chunks.has(k)) this.chunks.set(k, []);
          this.chunks.get(k).push(run);
        } else run.pts.push(R[i]);
      }
    });
  }

  /** The mesh of one chunk: [verts, cols] as the track program takes them. */
  buildChunk(runs) {
    const V = new FBuf(), C = new FBuf(), demAt = this.demAt;
    const push = (x, y, n, c) => { V.push(x, y, -n); C.push(c[0], c[1], c[2]); };
    for (const { hw, bw, pts } of runs) {
      if (pts.length < 2) continue;
      // per-point normals (mitred), heights, and the five offsets of the
      // cross-section: bank, mud edge, water, water, mud edge, bank
      const off = [-hw - bw, -hw - 0.25, -hw, hw, hw + 0.25, hw + bw];
      const col = [STREAM_BANK, STREAM_MUD, STREAM_WATER, STREAM_WATER, STREAM_MUD, STREAM_BANK];
      const rows = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const wet = this.coverIsWater(p[0], p[1]);
        return off.map((o) => {
          const x = p[0] + nx * o, n = p[1] + ny * o, g = demAt(x, n);
          // the water lies a little lower than its banks
          return [x, g + (Math.abs(o) <= hw + 0.01 ? 0.10 : 0.18), n, wet || !isFinite(g)];
        });
      });
      for (let i = 0; i + 1 < rows.length; i++) {
        const A = rows[i], B = rows[i + 1];
        for (let j = 0; j + 1 < off.length; j++) {
          if (A[j][3] || B[j][3]) continue;           // in a lake or the river: its water is there
          const a0 = A[j], a1 = A[j + 1], b0 = B[j], b1 = B[j + 1];
          const c0 = col[j], c1 = col[j + 1];
          // the water band is one colour (the marker), the banks shade across
          push(a0[0], a0[1], a0[2], c0); push(a1[0], a1[1], a1[2], c1); push(b1[0], b1[1], b1[2], c1);
          push(a0[0], a0[1], a0[2], c0); push(b1[0], b1[1], b1[2], c1); push(b0[0], b0[1], b0[2], c0);
        }
      }
    }
    return { verts: V.arr(), cols: C.arr(), count: V.length / 3 };
  }

  /** Call every frame: builds chunks within R of (cx, cn), at most two a
   *  frame, nearest first; frees those past R + 800 m. */
  update(cx, cn, R, make, free) {
    const want = [];
    const k0x = Math.floor(cx / STREAM_CHUNK), k0y = Math.floor(cn / STREAM_CHUNK), r = Math.ceil(R / STREAM_CHUNK);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const k = (k0x + i) + "," + (k0y + j);
      if (!this.chunks.has(k) || this.built.has(k)) continue;
      const d = Math.hypot((k0x + i + 0.5) * STREAM_CHUNK - cx, (k0y + j + 0.5) * STREAM_CHUNK - cn);
      if (d < R) want.push([d, k]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, k] of want.slice(0, 2)) {
      const m = this.buildChunk(this.chunks.get(k));
      this.built.set(k, m.count ? make(m) : null);
    }
    for (const [k, m] of this.built) {
      const [i, j] = k.split(",").map(Number);
      if (Math.hypot((i + 0.5) * STREAM_CHUNK - cx, (j + 0.5) * STREAM_CHUNK - cn) > R + 800) {
        if (m) free(m);
        this.built.delete(k);
      }
    }
  }
  each(fn) { for (const m of this.built.values()) if (m) fn(m); }
}
