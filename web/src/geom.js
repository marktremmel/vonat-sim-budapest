import { norm } from "./engine.js";

// Everything that is built once and drawn as a mesh: the track, the
// corridor, roads, buildings, yard tracks, stations, signals, crossings
// and the people on the platforms.
// ---------------------------------------------------------------- track mesh
export function buildTrack(route, pts, opts = {}) {
  const V = [], C = [];
  const railGauge = 1.435, railTop = 0.16, ballastTop = 2.6, ballastBot = 4.6;
  const colBallast = [0.34, 0.31, 0.28], colSleeper = [0.26, 0.22, 0.19],
        colRail = [0.42, 0.40, 0.40];
  const push = (p, c) => { V.push(p[0], p[1], p[2]); C.push(c[0], c[1], c[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const dir = norm([q[0]-p[0], 0, q[1]-p[1]]);
    const rt = [ -dir[2], 0, dir[0] ];
    // world z runs south, so the north component is negated on the way out
    const P = (pt, off, dy) => [pt[0] + rt[0]*off, pt[2] + dy, -(pt[1] + rt[2]*off)];
    // ballast shoulder
    quad(P(p,-ballastBot,-0.65), P(q,-ballastBot,-0.65), P(q,-ballastTop,0.0), P(p,-ballastTop,0.0), colBallast);
    quad(P(p,-ballastTop,0.0), P(q,-ballastTop,0.0), P(q,ballastTop,0.0), P(p,ballastTop,0.0), colSleeper);
    quad(P(p,ballastTop,0.0), P(q,ballastTop,0.0), P(q,ballastBot,-0.65), P(p,ballastBot,-0.65), colBallast);
    for (const s of [-1, 1]) {
      const o = s * railGauge / 2;
      quad(P(p,o-0.04,0.0), P(q,o-0.04,0.0), P(q,o-0.04,railTop), P(p,o-0.04,railTop), colRail);
      quad(P(p,o-0.04,railTop), P(q,o-0.04,railTop), P(q,o+0.04,railTop), P(p,o+0.04,railTop), colRail);
      quad(P(p,o+0.04,railTop), P(q,o+0.04,railTop), P(q,o+0.04,0.0), P(p,o+0.04,0.0), colRail);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

// ------------------------------------------------------------- earthworks
// The DEM knows nothing about the railway, so left alone the ground either
// swallows the track or leaves it floating. This lays a formation over the
// terrain: ballast crown, a stone ditch each side, then a slope that blends
// back to the DEM — which becomes an embankment where the ground is low and a
// cutting where it is high, without having to decide which.
const FORMATION = [
  [-24.0, null, 2], [-16.0, null, 2], [-10.5, -2.05, 2], [-8.0, -2.05, 1],
  [-6.4, -1.70, 1], [-5.0, -0.20, 1], [-4.6, 0.00, 0], [0.0, 0.06, 0],
  [4.6, 0.00, 0], [5.0, -0.20, 1], [6.4, -1.70, 1], [8.0, -2.05, 1],
  [10.5, -2.05, 2], [16.0, null, 2], [24.0, null, 2],
];
const SKIRT_FROM = 10.5, SKIRT_TO = 24.0;
const FORM_COL = [
  [0.35, 0.32, 0.29],   // 0 ballast
  [0.46, 0.44, 0.41],   // 1 ditch, stone lined
  [0.33, 0.40, 0.24],   // 2 grass slope
];

// Must stay in step with `coverColour` in the terrain shader, and it was two
// short: park and sand were added to the bake and to the shader but not here,
// so the corridor clamped them to 12 and drew every park beside the line in
// the dark grey of railway ballast.
export const COVER_COL = [
  [0.42,0.46,0.29],[0.16,0.28,0.15],[0.31,0.37,0.22],[0.45,0.52,0.28],
  [0.55,0.51,0.29],[0.37,0.45,0.26],[0.48,0.46,0.26],[0.46,0.42,0.38],
  [0.40,0.39,0.38],[0.20,0.30,0.34],[0.52,0.49,0.45],[0.34,0.42,0.33],
  [0.36,0.33,0.30],[0.30,0.45,0.24],[0.72,0.68,0.55],[0.80,0.75,0.60],
];

// One surface near the line, instead of two fighting each other.
//
// The terrain rings sample the 25.7 m DEM on a 17 m grid; the old formation
// ribbon sat on top of that and the two disagreed by whatever the interpolation
// happened to do, which is every bit of clipping seen so far. This builds a
// single high-resolution corridor — ballast, ditch, bank, then natural ground
// out to 100 m — and the terrain shader discards everything inside 86 m, so
// there is nothing left to poke through.
// The corridor is built along the DOWN line, and the terrain discards itself
// wherever the cover raster says it is within 86 m of EITHER running line.
// The two lines part by up to 29 m at the stations, so a point can be 86 m
// from the up line — terrain gone — and 115 m from the down line, which is
// outside a corridor that stopped at 100. That band was simply missing: holes
// in the ground beside the platforms, which is what Mark saw where the two
// layers meet. The corridor now reaches past anything the raster can discard
// (it only records distance out to 90 m), with margin.
const CORRIDOR = [
  -124, -100, -76, -60, -46, -34, -24, -16, -10.5, -8.0, -6.4, -5.0, -4.6,
  0,
  4.6, 5.0, 6.4, 8.0, 10.5, 16, 24, 34, 46, 60, 76, 100, 124,
];
export const CORRIDOR_HALF = 124.0;
const SKIRT_IN = 10.5, SKIRT_OUT = 46.0;

function corridorHeight(off, top, dem) {
  const a = Math.abs(off);
  if (a <= 4.6) return top + (a < 1 ? 0.06 : 0.0);
  if (a <= 5.0) return top - 0.20;
  if (a <= 6.4) return top - 1.70;
  if (a <= SKIRT_IN) return top - 2.05;
  if (a >= SKIRT_OUT) return dem;
  let t = (a - SKIRT_IN) / (SKIRT_OUT - SKIRT_IN);
  t = t * t * (3 - 2 * t);
  const h = (top - 2.05) * (1 - t) + dem * t;
  const ceiling = top + 0.4 + (a - 12.0) * 0.85;      // a cutting wall may not
  return Math.min(h, ceiling);                        // climb across the rails
}

function corridorColour(off, coverAt, cx, cy) {
  const a = Math.abs(off);
  if (a <= 4.6) return FORM_COL[0];
  if (a <= 8.0) return FORM_COL[1];
  const cls = coverAt(cx, cy) | 0;
  let cover = COVER_COL[Math.min(COVER_COL.length - 1, cls)] || FORM_COL[2];
  // residential: the same patchwork of gardens and yards the terrain shader
  // draws (TERRAIN_FS), so the strip beside the line matches what is beyond it
  if (cls === 7) {
    const px = Math.floor(cx / 14), pz = Math.floor(-cy / 17);
    const h1 = ((Math.sin(px * 127.1 + pz * 311.7) * 43758.5453) % 1 + 1) % 1;
    const city = Math.max(0, Math.min(1, (16000 - cy) / 5000));
    const P = h1 < 0.45 ? [0.33,0.44,0.22] : h1 < 0.62 ? [0.42,0.40,0.25]
            : h1 < 0.78 ? [0.22,0.33,0.16] : [0.47,0.45,0.42];
    cover = P.map((v, i) => v + ([0.47,0.45,0.42][i] - v) * city * 0.75);
  }
  if (a >= 24) return cover;
  const t = (a - 8.0) / 16.0;
  return [FORM_COL[2][0]*(1-t) + cover[0]*t,
          FORM_COL[2][1]*(1-t) + cover[1]*t,
          FORM_COL[2][2]*(1-t) + cover[2]*t];
}

/** @param bridges  [[m0, m1], ...] chainage ranges on a bridge: no corridor
 *                  there, or the formation becomes a dam across the river
 *  @param unders   roads passing under the line (prepareUnderpasses): the
 *                  corridor digs a cutting to their floor, rows are densified
 *                  to 2 m around each crossing so the cutting has edges, and a
 *                  deck carries the track over it */
export function buildCorridor(pts, demAt, coverAt, stride = 1, bridges = [], unders = []) {
  const nLat = CORRIDOR.length;
  // where each underpass crosses the line: the chainage of the track point
  // nearest to the road, and the road's direction there
  const cross = [];
  for (const u of unders) {
    let best = 1e9, bi = -1, bj = 0;
    for (let j = 0; j < u.pts.length; j++) {
      for (let i = 0; i < pts.length; i += 2) {
        const d = Math.abs(pts[i][0] - u.pts[j][0]) + Math.abs(pts[i][1] - u.pts[j][1]);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }
    if (bi < 0 || best > 200) continue;
    const q0 = u.pts[Math.max(0, bj - 1)], q1 = u.pts[Math.min(u.pts.length - 1, bj + 1)];
    const t0 = pts[Math.max(0, bi - 1)], t1 = pts[Math.min(pts.length - 1, bi + 1)];
    const rx = q1[0] - q0[0], ry = q1[1] - q0[1], tx = t1[0] - t0[0], ty = t1[1] - t0[1];
    const sin = Math.abs(rx * ty - ry * tx) / ((Math.hypot(rx, ry) * Math.hypot(tx, ty)) || 1);
    cross.push({ u, m: pts[bi][3], half: (u.hw + 3) / Math.max(0.35, sin) });
  }
  // densified sample points: every 2 m within 40 m of a crossing
  const P = [];
  for (let i = 0; i < pts.length; i += stride) {
    P.push(pts[i]);
    const nx = pts[Math.min(pts.length - 1, i + stride)];
    if (nx === pts[i]) continue;
    const near = cross.some(c => Math.abs(pts[i][3] - c.m) < c.half + 40 || Math.abs(nx[3] - c.m) < c.half + 40);
    if (!near) continue;
    const L = nx[3] - pts[i][3], n = Math.floor(L / 2);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      P.push([pts[i][0] + (nx[0] - pts[i][0]) * f, pts[i][1] + (nx[1] - pts[i][1]) * f,
              pts[i][2] + (nx[2] - pts[i][2]) * f, pts[i][3] + L * f]);
    }
  }
  const distSeg = (x, y, poly) => {
    let b = 1e9;
    for (let k = 0; k + 1 < poly.length; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[k + 1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return b;
  };
  const rows = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[Math.min(P.length - 1, i + 1)], o = P[Math.max(0, i - 1)];
    const dx = q[0] - o[0], dy = q[1] - o[1];
    const L = Math.hypot(dx, dy) || 1;
    const rx = -dy / L, ry = dx / L;
    const top = p[2] - 0.05;
    const row = new Float64Array(nLat * 4);
    const cs = cross.filter(c => Math.abs(p[3] - c.m) < c.half + 60);
    for (let j = 0; j < nLat; j++) {
      const off = CORRIDOR[j];
      const wx = p[0] + rx * off, wy = p[1] + ry * off;
      let h = corridorHeight(off, top, demAt(wx, wy));
      // the cutting: inside the road's width the ground goes down to its floor
      for (const c of cs) {
        const d = distSeg(wx, wy, c.u.pts);
        if (d < c.u.hw + 1.2) h = Math.min(h, c.u.floorAt(wx, wy) - 0.38);
        else if (d < c.u.hw + 6) h = Math.min(h, Math.max(c.u.floorAt(wx, wy) - 0.38, h - (c.u.hw + 6 - d) * 1.4));
      }
      row[j*4] = wx; row[j*4+1] = h;
      row[j*4+2] = wy; row[j*4+3] = off;
    }
    rows.push(row);
  }
  const V = [], C = [];
  const onBridge = (m) => bridges.some(([b0, b1]) => m >= b0 - 10 && m <= b1 + 10);
  for (let i = 0; i < rows.length - 1; i++) {
    const A = rows[i], B = rows[i + 1];
    if (onBridge(P[i][3])) continue;
    for (let j = 0; j < nLat - 1; j++) {
      const off = (A[j*4+3] + A[(j+1)*4+3]) * 0.5;
      const col = corridorColour(off, coverAt, A[j*4], A[j*4+2]);
      const pick = [[A,j],[B,j],[A,j+1],[A,j+1],[B,j],[B,j+1]];
      for (const [R, jj] of pick) {
        V.push(R[jj*4], R[jj*4+1], -R[jj*4+2]);
        C.push(col[0], col[1], col[2]);
      }
    }
  }
  // a deck under the track across each cutting: slab, girders, abutments
  const quad = (a, b, c, d, col) => { for (const k of [a, b, c, a, c, d]) { V.push(k[0], k[1], -k[2]); C.push(col[0], col[1], col[2]); } };
  const DECK = [0.46, 0.45, 0.43], GIRD = [0.36, 0.36, 0.37], ABUT = [0.55, 0.54, 0.51];
  const at = (m) => {
    const f = (m - pts[0][3]) / ((pts[pts.length - 1][3] - pts[0][3]) / (pts.length - 1));
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const u = f - i, a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u,
             rx: -(b[1] - a[1]) / L, ry: (b[0] - a[0]) / L };
  };
  for (const c of cross) {
    const m0 = c.m - c.half, m1 = c.m + c.half, N = Math.max(2, Math.ceil((m1 - m0) / 3));
    for (let k = 0; k < N; k++) {
      const a = at(m0 + (m1 - m0) * k / N), b = at(m0 + (m1 - m0) * (k + 1) / N);
      const W = (p, o, up) => [p.x + p.rx * o, p.z - 0.05 + up, p.y + p.ry * o];
      quad(W(a, -4.4, 0), W(b, -4.4, 0), W(b, 4.4, 0), W(a, 4.4, 0), DECK);            // ballast deck
      quad(W(a, -4.4, -1.6), W(b, -4.4, -1.6), W(b, 4.4, -1.6), W(a, 4.4, -1.6), GIRD);   // soffit
      for (const sg of [-1, 1]) {
        quad(W(a, sg * 4.4, -1.6), W(b, sg * 4.4, -1.6), W(b, sg * 4.4, 1.0), W(a, sg * 4.4, 1.0), GIRD);  // edge girder / parapet
      }
    }
    // abutments at each end, down to the road floor
    for (const mm of [m0, m1]) {
      const p = at(mm), fl = c.u.floorAt(p.x, p.y) - 0.4;
      const W = (o, y) => [p.x + p.rx * o, y, p.y + p.ry * o];
      quad(W(-5.5, fl), W(5.5, fl), W(5.5, p.z - 1.6), W(-5.5, p.z - 1.6), ABUT);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

// ------------------------------------------------------------------ roads
const ROAD_COL = [
  [0.26, 0.26, 0.27], [0.28, 0.27, 0.27], [0.30, 0.29, 0.28],
  [0.31, 0.30, 0.29], [0.33, 0.32, 0.31], [0.34, 0.33, 0.31],
  [0.42, 0.38, 0.31],
];

const KERB_COL = [0.52, 0.51, 0.48];
const MARK_COL = [0.80, 0.78, 0.70];

// The terrain mesh is a triangle grid at ~17 m; a road sampled only at its own
// vertices sinks under those triangles on uneven ground. Take the highest DEM
// value in a small neighbourhood so the carriageway always sits on top.
export function demRidge(demAt, x, y) {
  let m = -1e9;
  for (const [dx, dy] of [[0,0],[9,0],[-9,0],[0,9],[0,-9],[6,6],[-6,6],[6,-6],[-6,-6]])
    m = Math.max(m, demAt(x + dx, y + dy));
  return m;
}

/**
 * @param waterAt  metres above sea level of the river at a given northing, or
 *                 null. A bridge over water cannot take its deck height from
 *                 the ground beneath it, because the ground beneath it is the
 *                 river bed: Margit híd came out laid along the bottom of the
 *                 Danube. Where the span is over water the deck clears the
 *                 water instead, and the abutment wall becomes a pier.
 */
/** The height of a road surface at a point: the corridor grade near the
 *  railway, the ground (ridge-sampled) elsewhere, plus the asphalt's lift.
 *  buildRoads lays the road on exactly this, and vehicles must drive on it
 *  too — they used the raw DEM, which is why near the line a car sat half
 *  under the road. */
export function roadSurfaceAt(demAt, railDistAt, x, y) {
  const dem = demRidge(demAt, x, y);
  if (!railDistAt) return dem + 0.345;
  const r = railDistAt(x, y);
  if (!r || !isFinite(r.d)) return dem + 0.345;
  const lift = r.d < 6.0 ? 0.14 : r.d < 12.0 ? 0.24 : 0.345;
  if (r.d > SKIRT_OUT || !isFinite(r.railY)) return dem + lift;
  return corridorHeight(r.d, r.railY - 0.05, dem) + lift;
}

/** How far an underpass (`bridge === 3`) is dug below the ground at a point:
 *  5.6 m under the formation at the track, easing to nothing 55 m out.
 *  `railDistAt` returns {d, railY}; this used to treat it as a number, so
 *  isFinite() was always false and no underpass was ever dug. */
export function underpassDip(railDistAt, x, y) {
  const r = railDistAt ? railDistAt(x, y) : null;
  const d = r && typeof r === "object" ? r.d : r;
  if (!isFinite(d) || d > 55) return 0;
  const t = d / 55, e = 1 - t * t * (3 - 2 * t);      // smooth to zero
  return -5.6 * e;
}

/**
 * Roads that pass under the railway (`bridge === 3`: tagged tunnel, below
 * layer 0, or crossing a railway bridge). Each gets a FLOOR: the natural
 * ground either side of the line (sampled 45–95 m out, where the corridor no
 * longer levels it to the rails), but never less than 6.6 m under the rail —
 * so under a line on an embankment the road stays on the ground, and under a
 * line at grade (Dózsa György út) it is dug. `way.floorAt(x, y)` eases from
 * the ordinary road surface 62 m out down to that floor 12 m from the rail;
 * the road mesh, the cars and the corridor's cutting all use it.
 */
export function prepareUnderpasses(ways, widths, demAt, railDistAt) {
  const out = [];
  if (!railDistAt) return out;
  for (const w of ways) {
    if (w.bridge !== 3 || w.pts.length < 2) continue;
    const hw = (w.lanes ? Math.max(widths[w.cls] || 6, w.lanes * 3.25) : (widths[w.cls] || 6)) * 0.5;
    let railY = NaN, closest = 1e9, natural = 1e9;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
        const r = railDistAt(x, y);
        if (!r || !isFinite(r.d)) continue;
        if (r.d < closest) { closest = r.d; railY = r.railY; }
        if (r.d > 45 && r.d < 95) natural = Math.min(natural, demAt(x, y));
      }
    }
    if (!isFinite(railY) || closest > 30) continue;
    if (natural > 1e8) natural = railY;
    const floor = Math.min(natural, railY - 6.6);
    const surf = (x, y) => roadSurfaceAt(demAt, railDistAt, x, y);
    w.floorAt = (x, y) => {
      const r = railDistAt(x, y);
      const d = r && isFinite(r.d) ? r.d : 999;
      let t = Math.max(0, Math.min(1, (d - 12) / 50));
      t = t * t * (3 - 2 * t);
      return surf(x, y) * t + (floor + 0.345) * (1 - t);
    };
    out.push({ pts: w.pts, hw, floorAt: w.floorAt, railY, floor });
  }
  return out;
}

export function buildRoads(ways, widths, demAt, waterAt, railDistAt) {
  // Where a road runs near the line it must sit on the CORRIDOR, not on the
  // raw DEM. The corridor is graded to rail level and the DEM is not, so the
  // two surfaces disagree by anything up to a couple of metres — and where
  // they happen to agree to within a few centimetres, which is most of a
  // level crossing, they z-fight and the whole approach fizzes with speckle.
  // That was the noise Mark photographed. Same profile function the corridor
  // itself is built from, so by construction there is nothing to fight.
  const groundAt = (x, y) => {
    const dem = demRidge(demAt, x, y);
    if (!railDistAt) return dem;
    const r = railDistAt(x, y);
    if (!r || !isFinite(r.d) || r.d > SKIRT_OUT || !isFinite(r.railY)) return dem;
    return corridorHeight(r.d, r.railY - 0.05, dem);
  };
  // and the road is laid thinner over the ballast than it is out in a field,
  // because at a crossing the asphalt is flush with the railhead
  const liftAt = (x, y) => {
    if (!railDistAt) return 0.345;
    const r = railDistAt(x, y);
    if (!r || !isFinite(r.d)) return 0.345;
    return r.d < 6.0 ? 0.14 : r.d < 12.0 ? 0.24 : 0.345;
  };
  // a road is a carriageway, a kerb strip either side, and on anything above
  // tertiary a broken centre line. Segments are split so they follow the
  // ground instead of bridging over it.
  const V = [], C = [], streetLamps = [];
  // a quad from four world points, for the bridges, which do not follow the
  // ground and so cannot use the strip helper
  const quad = (a, b, c, d, col) => {
    for (const k of [a, b, c, a, c, d]) {
      V.push(k[0], k[1], -k[2]);
      C.push(col[0], col[1], col[2]);
    }
  };
  const strip = (ax, ay, bx, by, o0, o1, lift, col) => {
    const dx = bx - ax, dy = by - ay;
    const L = Math.hypot(dx, dy);
    if (L < 0.3) return;
    const nx = -dy / L, ny = dx / L;
    const P = (x, y, o) => [x + nx * o,
                            groundAt(x + nx * o, y + ny * o)
                              + (lift < 0
                                 ? liftAt(x + nx * o, y + ny * o) + (lift + 1)
                                 : lift),
                            y + ny * o];
    const q = [P(ax, ay, o0), P(ax, ay, o1), P(bx, by, o1), P(bx, by, o0)];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      V.push(q[k][0], q[k][1], -q[k][2]);
      C.push(col[0], col[1], col[2]);
    }
  };
  // a cap at each end of every way: without them T-junctions leave a notch
  // and a village reads as a pile of disconnected sticks
  const cap = (x, y, r, lift, col) => {
    const N = 6, base = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2;
      base.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    const cy_ = groundAt(x, y) + (lift < 0 ? liftAt(x, y) + (lift + 1) : lift);
    for (let i = 0; i < N; i++) {
      const p1 = base[i], p2 = base[(i + 1) % N];
      for (const q of [[x, y], p1, p2]) {
        V.push(q[0], cy_, -q[1]);
        C.push(col[0], col[1], col[2]);
      }
    }
  };
  // A long bridge arrives as a chain of short ways — Margit híd is eight of
  // them, 11 m to 230 m — and decking each one flat off its own ends built a
  // staircase across the river and a step at every overpass. Bridge ways that
  // touch are one structure, and each structure gets ONE deck function:
  //   * a plateau high enough for what it crosses — the river (water + 8.5 m,
  //     which the landmark models are built to), the railway (7.4 m over the
  //     lowest ground under it: 6.1 m gauge and the girder) or a road (5.2 m);
  //   * ramps from each free end down to the road surface there, at 6 % or
  //     steeper if the structure is short, so the deck meets its approaches
  //     instead of hanging a metre over them.
  // Vehicles drive on the same function (way.deckAt), so a car on Margit híd
  // is on Margit híd and not in the Danube under it.
  const surfAt = (x, y) => groundAt(x, y) + liftAt(x, y);
  {
    const br = ways.filter(w => w.bridge && w.bridge !== 3 && w.pts.length > 1);
    const parent = br.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const bucket = new Map();
    const ends = [];                                    // [x, y, wayIndex]
    br.forEach((w, i) => {
      for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) {
        ends.push([p[0], p[1], i]);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const k = (Math.round(p[0] / 12) + dx) + "," + (Math.round(p[1] / 12) + dy);
          for (const j of bucket.get(k) || []) {
            const q = br[j];
            const near = [q.pts[0], q.pts[q.pts.length - 1]].some(r => Math.hypot(r[0] - p[0], r[1] - p[1]) < 12);
            if (near) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
          }
        }
        const k0 = Math.round(p[0] / 12) + "," + Math.round(p[1] / 12);
        if (!bucket.has(k0)) bucket.set(k0, []);
        bucket.get(k0).push(i);
      }
    });
    const groups = new Map();
    br.forEach((w, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
    // an end is free when no other way of the structure ends within 12 m
    for (const e of ends) {
      e.free = true;
      for (let dx = -1; dx <= 1 && e.free; dx++) for (let dy = -1; dy <= 1 && e.free; dy++) {
        const k = (Math.round(e[0] / 12) + dx) + "," + (Math.round(e[1] / 12) + dy);
        for (const j of bucket.get(k) || []) {
          if (j === e[2]) continue;
          const q = br[j];
          if ([q.pts[0], q.pts[q.pts.length - 1]].some(r => Math.hypot(r[0] - e[0], r[1] - e[1]) < 12)) { e.free = false; break; }
        }
      }
    }
    const endsOf = new Map();
    for (const e of ends) if (e.free) { const g = find(e[2]); if (!endsOf.has(g)) endsOf.set(g, []); endsOf.get(g).push(e); }
    for (const [g, idx] of groups) {
      const gw = idx.map(i => br[i]);
      // free ends: not within 12 m of another way's end in the same structure
      const free = endsOf.get(g) || [];
      let lowest = 1e9, wet = -1e9, rail = false, len = 0, railTop = -1e9;
      const railPts = [];
      for (const w of gw) {
        for (let i = 0; i < w.pts.length; i++) {
          const q = w.pts[i];
          lowest = Math.min(lowest, demAt(q[0], q[1]));
          if (i) len += Math.hypot(q[0] - w.pts[i - 1][0], q[1] - w.pts[i - 1][1]);
        }
        if (w.bridge === 2) {
          rail = true;
          // clearance over the RAILS, not over the lowest ground: at the
          // Nyugati throat the ground under Ferdinánd híd was below the rails
          // and the deck came out at train-roof height
          if (railDistAt) for (let i = 0; i + 1 < w.pts.length; i++) {
            const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
            const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
            for (let k = 0; k <= n; k++) {
              const r = railDistAt(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
              if (r && r.d < 14 && isFinite(r.railY)) {
                railTop = Math.max(railTop, r.railY);
                railPts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
              }
            }
          }
        }
        if (waterAt) {
          const wy = waterAt(w.pts[Math.floor(w.pts.length / 2)][1]);
          const low = Math.min(...w.pts.map(q => demAt(q[0], q[1])));
          if (isFinite(wy) && low < wy + 0.5) wet = Math.max(wet, wy + 8.5);
        }
      }
      // a single way this long is a mis-tagged road, not a bridge; a group can
      // be long (Megyeri híd with its viaducts is 1.9 km, and the ramps at
      // Margit híd join it to the embankment flyovers)
      if (gw.some(w => { let L = 0; for (let i = 1; i < w.pts.length; i++) L += Math.hypot(w.pts[i][0] - w.pts[i-1][0], w.pts[i][1] - w.pts[i-1][1]); return L > 2000; })) continue;
      if (len > 9000) continue;
      const isWet = wet > -1e8;
      const gE = free.map(e => {
        const h = surfAt(e[0], e[1]);
        // over water the bank is often a roof in the surface model: keep the
        // ramp within reason of the deck
        return isWet ? Math.max(wet - 9, Math.min(wet + 1.5, h)) : h;
      });
      const H = isWet ? wet
              : Math.max(rail ? Math.max(lowest + 7.4, railTop + 8.2) : lowest + 5.2,
                         gE.length ? Math.max(...gE) + 0.2 : lowest + 5.2);
      const pts = gw.flatMap(w => w.pts);
      const K = free.map((e, i) => {
        const dmax = Math.max(...pts.map(q => Math.hypot(q[0] - e[0], q[1] - e[1])));
        // over the railway the deck must be at full height BEFORE it reaches
        // the tracks: OSM often maps only the span as the bridge, its ramps
        // being ordinary road, so the ramp has to happen inside it
        const toRail = railPts.length ? Math.min(...railPts.map(q => Math.hypot(q[0] - e[0], q[1] - e[1]))) - 6 : 1e9;
        return Math.max(0.06, (H - gE[i]) / Math.max(10, Math.min(dmax * 0.45, toRail)));
      });
      const deckAt = (x, y) => {
        let h = H;
        for (let i = 0; i < free.length; i++)
          h = Math.min(h, gE[i] + K[i] * Math.hypot(x - free[i][0], y - free[i][1]));
        return h;
      };
      for (const w of gw) { w.deckAt = deckAt; w.wet = isWet; w.waterY = isWet ? wet - 8.5 : null; }
    }
  }

  for (const way of ways) {
    const { cls, pts, bridge, lanes, oneway } = way;
    // 3.25 m a lane where OSM says how many, the class default otherwise
    const hw = lanes ? Math.max(widths[cls], lanes * 3.25) * 0.5 : widths[cls] * 0.5;
    const col = ROAD_COL[cls];
    const paved = cls <= 4;

    if (bridge && bridge !== 3) {
      const deckAt = way.deckAt;
      if (!deckAt) continue;
      // the deck, cut every 8 m so the ramps bend with the function
      const P = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(L / 8));
        for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
      }
      P.push(pts[pts.length - 1]);
      let run = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, ay] = P[i], [bx, by] = P[i + 1];
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 0.2) continue;
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        const y0 = deckAt(ax, ay), y1 = deckAt(bx, by);
        const A = (o, up) => [ax + nx * o, y0 + up, ay + ny * o];
        const B = (o, up) => [bx + nx * o, y1 + up, by + ny * o];
        quad(A(-hw, 0), B(-hw, 0), B(hw, 0), A(hw, 0), col);
        // the girder under it, which is what you see from a train passing below
        quad(A(-hw, 0), B(-hw, 0), B(-hw, -1.3), A(-hw, -1.3), [0.44, 0.44, 0.46]);
        quad(B(hw, 0), A(hw, 0), A(hw, -1.3), B(hw, -1.3), [0.44, 0.44, 0.46]);
        quad(A(-hw, -1.3), B(-hw, -1.3), B(hw, -1.3), A(hw, -1.3), [0.34, 0.34, 0.36]);
        // parapets, where the deck is off the ground
        const gA = groundAt(ax, ay), gB = groundAt(bx, by);
        if (y0 - gA > 1.2 || y1 - gB > 1.2) {
          for (const sg of [-1, 1]) {
            const o = sg * hw;
            quad(A(o, 0), B(o, 0), B(o, 1.05), A(o, 1.05), [0.62, 0.62, 0.63]);
            quad(A(o - sg * 0.22, 0), B(o - sg * 0.22, 0),
                 B(o - sg * 0.22, 1.05), A(o - sg * 0.22, 1.05), [0.58, 0.58, 0.60]);
          }
        }
        // piers: in the river every ~65 m, over land every ~26 m where the
        // deck is high enough to need one — but never on the railway
        run += L;
        const spacing = way.wet ? 65 : 26;
        if (run >= spacing) {
          run = 0;
          const top = y1 - 1.3;
          const gnd = way.wet ? Math.min(groundAt(bx, by), way.waterY) - 3 : groundAt(bx, by) - 0.5;
          const rd = railDistAt ? railDistAt(bx, by) : null;
          const onRail = rd && isFinite(rd.d) && rd.d < 5.5;
          if (top - gnd > 3 && !onRail) {
            const ux = (bx - ax) / L, uy = (by - ay) / L;
            const tw = way.wet ? 2.6 : 0.8, pw = way.wet ? hw * 0.8 : Math.min(hw * 0.7, 3);
            const PC = way.wet ? [0.60, 0.58, 0.54] : [0.56, 0.56, 0.55];
            const c = (a, o, y) => [bx + ux * a + nx * o, y, by + uy * a + ny * o];
            quad(c(-tw, -pw, gnd), c(tw, -pw, gnd), c(tw, -pw, top), c(-tw, -pw, top), PC);
            quad(c(tw, pw, gnd), c(-tw, pw, gnd), c(-tw, pw, top), c(tw, pw, top), PC);
            quad(c(-tw, pw, gnd), c(-tw, -pw, gnd), c(-tw, -pw, top), c(-tw, pw, top), PC);
            quad(c(tw, -pw, gnd), c(tw, pw, gnd), c(tw, pw, top), c(tw, -pw, top), PC);
          }
        }
      }
      continue;
    }

    // A road that passes UNDER the railway has to be dug, not drawn on the
    // ground: the corridor grades the ground to rail level, so a road left on
    // the surface climbs over the track — which is what Dózsa György út did,
    // cars and all. `bridge === 3` marks the ways OSM tags as tunnel or
    // layer<0 within 40 m of the line. They drop to 5.6 m below the formation
    // at the closest approach and come back up over about fifty metres, which
    // is roughly the ramp a real underpass takes.
    if (bridge === 3 && railDistAt) {
      const floorAt = way.floorAt || ((x, y) => demRidge(demAt, x, y) + 0.345 + underpassDip(railDistAt, x, y));
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i+1];
        const L = Math.hypot(bx-ax, by-ay);
        if (L < 0.3) continue;
        const steps = Math.max(1, Math.round(L / 4));       // follow the ramp
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const x0 = ax + (bx-ax)*t0, y0 = ay + (by-ay)*t0;
          const x1 = ax + (bx-ax)*t1, y1 = ay + (by-ay)*t1;
          const nx = -(y1-y0), ny = (x1-x0);
          const nl = Math.hypot(nx, ny) || 1;
          const ux = nx/nl, uy = ny/nl;
          const g0 = floorAt(x0, y0), g1 = floorAt(x1, y1);
          const P = (x, y, g, o) => [x + ux*o, g, y + uy*o];
          quad(P(x0,y0,g0,-hw), P(x1,y1,g1,-hw), P(x1,y1,g1,hw), P(x0,y0,g0,hw), col);
          // retaining walls up to the ground beside it — the corridor's
          // surface near the line, not the raw terrain — so it reads as a cutting
          for (const sg of [-1, 1]) {
            const o = sg * (hw + 0.2);
            const s0 = surfAt(x0 + ux*o, y0 + uy*o), s1 = surfAt(x1 + ux*o, y1 + uy*o);
            if (s0 - g0 < 0.6 && s1 - g1 < 0.6) continue;
            quad(P(x0,y0,g0 - 0.3,o), P(x1,y1,g1 - 0.3,o),
                 P(x1,y1,s1,o), P(x0,y0,s0,o), [0.50,0.49,0.47]);
          }
        }
      }
      continue;
    }

    cap(pts[0][0], pts[0][1], hw, -1, col);
    cap(pts[pts.length-1][0], pts[pts.length-1][1], hw, -1, col);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.5 || L > 600) continue;
      const steps = Math.max(1, Math.min(24, Math.round(L / 18)));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const x0 = ax + (bx - ax) * t0, y0 = ay + (by - ay) * t0;
        const x1 = ax + (bx - ax) * t1, y1 = ay + (by - ay) * t1;
        // Tiled, never stacked — the same rule the train bodies follow, and
        // for the same reason. The centre line used to be a ribbon floating
        // 3.5 cm above the carriageway, which at a kilometre is far below
        // what the depth buffer can separate, so every distant road fizzed
        // with z-fighting. Mark photographed it. The carriageway is now cut
        // into lateral bands at ONE height and the line is one of the bands,
        // so there is nothing coplanar left to fight.
        // one mark between every pair of lanes: the centre of a two-way road
        // solid on a main road, the lane lines between same-direction lanes
        // dashed. Each mark is a band cut out of the carriageway, not laid
        // on it (see above).
        const nl = paved ? Math.max(1, lanes || (cls <= 2 ? 2 : 1)) : 1;
        const marks = [];
        for (let li = 1; li < nl; li++) {
          const o = -hw + 2 * hw * li / nl;
          const centre = !oneway && li * 2 === nl;
          if (centre ? (cls <= 2 || k % 2 === 0) : (k % 2 === 0 && cls <= 3)) marks.push(o);
        }
        let from = -hw;
        for (const o of marks) {
          strip(x0, y0, x1, y1, from, o - 0.13, -1, col);
          strip(x0, y0, x1, y1, o - 0.13, o + 0.13, -1, MARK_COL);
          from = o + 0.13;
        }
        strip(x0, y0, x1, y1, from, hw, -1, col);
        if (paved) {
          // the kerbs are laterally clear of the carriageway, so they may sit
          // lower without ever overlapping it
          strip(x0, y0, x1, y1, -hw - 0.9, -hw, -1.07, KERB_COL);
          strip(x0, y0, x1, y1, hw, hw + 0.9, -1.07, KERB_COL);
        }
      }
    }

    // Street lighting: place 3D street lamp posts along the road verges
    if (paved && cls <= 4 && pts.length >= 2) {
      const isUrban = pts[0][1] < 17000 || cls <= 2;
      const lampPitch = isUrban ? 40.0 : 80.0;
      let acc = Math.abs((pts[0][0] * 17.3 + pts[0][1] * 31.7) % lampPitch);
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const segL = Math.hypot(bx - ax, by - ay);
        if (segL < 1.0) continue;
        const nx = -(by - ay) / segL, ny = (bx - ax) / segL;
        while (acc < segL) {
          const t = acc / segL;
          const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
          const side = ((i + Math.floor(acc / lampPitch)) % 2 === 0) ? 1 : -1;
          const lx = px + nx * (hw + 0.9) * side, ly = py + ny * (hw + 0.9) * side;
          const gY = demRidge(demAt, lx, ly) + 0.35;
          if (isFinite(gY)) {
            const lampH = isUrban ? 8.8 : 7.2;
            const armX = lx - nx * 1.2 * side, armY = ly - ny * 1.2 * side;
            streetLamps.push([armX, gY + lampH - 0.2, armY]);

            // Solid 3D steel lamp post (crossed vertical planes for 360-degree visibility)
            const POST = [0.26, 0.28, 0.31], HOOD = [0.20, 0.21, 0.23];
            const pw = 0.16;
            quad([lx - pw, gY, ly], [lx + pw, gY, ly],
                 [lx + pw, gY + lampH, ly], [lx - pw, gY + lampH, ly], POST);
            quad([lx, gY, ly - pw], [lx, gY, ly + pw],
                 [lx, gY + lampH, ly + pw], [lx, gY + lampH, ly - pw], POST);

            // Overhanging cantilever arm reaching toward the road
            quad([lx, gY + lampH - 0.25, ly], [armX, gY + lampH - 0.05, armY],
                 [armX, gY + lampH + 0.10, armY], [lx, gY + lampH + 0.10, ly], POST);
            // Luminaire hood housing
            quad([armX - 0.35, gY + lampH - 0.05, armY - 0.35], [armX + 0.35, gY + lampH - 0.05, armY - 0.35],
                 [armX + 0.35, gY + lampH + 0.10, armY + 0.35], [armX - 0.35, gY + lampH + 0.10, armY + 0.35], HOOD);
          }
          acc += lampPitch;
        }
        acc -= segL;
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3, lamps: streetLamps };
}

// -------------------------------------------------------------- buildings
export function unpackBuildings(b64, count) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  const out = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const o = i * 18;
    out[i * 8 + 0] = dv.getFloat32(o, true);
    out[i * 8 + 1] = dv.getFloat32(o + 4, true);
    out[i * 8 + 2] = dv.getUint16(o + 8, true) * 0.1;
    out[i * 8 + 3] = dv.getUint16(o + 10, true) * 0.1;
    out[i * 8 + 4] = dv.getUint16(o + 12, true) / 65535 * Math.PI;
    out[i * 8 + 5] = dv.getUint16(o + 14, true) * 0.1;
    out[i * 8 + 6] = raw[o + 16];       // class
    out[i * 8 + 7] = raw[o + 17];       // flat roof
  }
  return out;
}

/**
 * Buildings big enough that a bounding box is visibly wrong get their real
 * footprint. An L-shaped block of flats, a station with wings, a row of
 * factory halls — all of them read as one rotated rectangle otherwise, which
 * is most of what keeps a city looking like a diagram of a city.
 *
 * The footprint is already triangulated at bake time (ear clipping, so it is
 * correct on concave shapes), and the geometry is built once at load and
 * bucketed into kilometre cells so only what is in range gets drawn.
 */
export function unpackPolyBuildings(b64, count, colours) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  const out = [];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cx = dv.getFloat32(o, true), cy = dv.getFloat32(o + 4, true);
    const h = dv.getUint16(o + 8, true) * 0.1;
    const cls = raw[o + 10], roof = raw[o + 11];
    const npts = raw[o + 12], ntri = raw[o + 13];
    const rh = dv.getUint16(o + 14, true) * 0.01;
    o += 16;
    const pts = [];
    for (let k = 0; k < npts; k++) {
      pts.push([cx + dv.getInt16(o, true) * 0.1, cy + dv.getInt16(o + 2, true) * 0.1]);
      o += 4;
    }
    const tri = [];
    for (let k = 0; k < ntri; k++) { tri.push([raw[o], raw[o+1], raw[o+2]]); o += 3; }
    out.push({ cx, cy, h, cls, roof, rh, pts, tri });
  }
  // OSM building:colour / roof:colour, where mapped (bake_context osm_colour)
  for (const [i, wall, roofC] of colours || []) {
    if (!out[i]) continue;
    if (wall) out[i].wallCol = wall;
    if (roofC) out[i].roofCol = roofC;
  }
  return out;
}

const POLY_WALL = [
  [0.72,0.68,0.60], [0.86,0.83,0.75], [0.74,0.70,0.58], [0.56,0.55,0.53],
  [0.68,0.66,0.62], [0.63,0.64,0.66], [0.52,0.48,0.43], [0.66,0.66,0.64],
  [0.78,0.76,0.70], [0.74,0.69,0.58],
  [0.30,0.36,0.40], [0.74,0.74,0.72], [0.60,0.61,0.60], [0.70,0.66,0.58],
  [0.78,0.78,0.76],
];
const POLY_ROOF_FLAT = [0.34, 0.34, 0.33];
const POLY_ROOF_TILE = [0.40, 0.23, 0.17];

/**
 * @param sheds  indices of polygons whose roof is drawn elsewhere. A big
 *               `building=train_station` gets a barrel vault here, and over
 *               a 122 m footprint that is a tunnel rather than a trainshed —
 *               so its walls are drawn as any other building's and the vault
 *               is built from the tracks instead, in `buildTrainsheds`.
 */
export function buildPolyBuildings(polys, demAt, sheds) {
  const V = [], C = [], N = [], I = [], cells = new Map();
  // Per-vertex building info for the façade shader: [ground y, wall height,
  // class, seed]. Without it the shader measured storeys from a fixed 95 m
  // above sea level, so no row of windows sat on a floor.
  let info = [0, 0, 0, 0];
  // Every triangle carries its own normal, worked out from its own three
  // corners. It used to be left to the fragment shader's screen derivatives,
  // and on a wall seen at a shallow angle those are noise — which is why the
  // whole city fizzed with blue and white speckle. A wall knows which way it
  // faces; there is no reason to make the screen guess.
  const push = (x, y, z, col) => { V.push(x, y, -z); C.push(col[0], col[1], col[2]);
                                   I.push(info[0], info[1], info[2], info[3]); };
  const tri = (a, b, c, col) => {
    push(a[0],a[1],a[2],col); push(b[0],b[1],b[2],col); push(c[0],c[1],c[2],col);
    // world z runs south, so the z components are negated before the cross
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = -(b[2]-a[2]);
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = -(c[2]-a[2]);
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    for (let i = 0; i < 3; i++) N.push(nx, ny, nz);
  };
  const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };

  // sorted into kilometre cells so a range of the buffer can be drawn
  const order = polys.map((p, i) => i).sort((i, j) => {
    const a = polys[i], b = polys[j];
    const ka = (Math.floor(a.cy / 1000) << 12) + Math.floor(a.cx / 1000);
    const kb = (Math.floor(b.cy / 1000) << 12) + Math.floor(b.cx / 1000);
    return ka - kb;
  });

  for (const oi of order) {
    const B = polys[oi];
    // a trainshed's footprint is drawn whole by `buildTrainsheds` — its walls
    // here stood in front of the glazed street front
    if (sheds && sheds.has(oi)) continue;
    const key = Math.floor(B.cx / 1000) + "," + Math.floor(B.cy / 1000);
    const start = V.length / 3;
    // one ground level for the whole footprint, or a long hall shears — and
    // it is the LOWEST point under it, or the downhill wall floats
    let gmin = demAt(B.cx, B.cy), gmax = gmin;
    for (let k = 0; k < B.pts.length; k += Math.max(1, (B.pts.length / 12) | 0)) {
      const d = demAt(B.pts[k][0], B.pts[k][1]);
      gmin = Math.min(gmin, d); gmax = Math.max(gmax, d);
    }
    // and inside the footprint, halfway to each corner: the terrain between
    // the corners can stand higher than any of them (Buda Castle's edge)
    for (let k = 0; k < B.pts.length; k += Math.max(1, (B.pts.length / 8) | 0)) {
      const d = demAt((B.pts[k][0] + B.cx) * 0.5, (B.pts[k][1] + B.cy) * 0.5);
      gmax = Math.max(gmax, d);
    }
    if (gmax - gmin > 1.5) gmax += 1.0;
    const g = gmin - 0.8;
    // walls from the lowest ground to the height over the HIGHEST ground: on
    // Castle Hill a house measured up from the foot of the slope was buried
    // by its own uphill side
    const slopeLift = Math.min(gmax - gmin, 30);
    const wall = B.wallCol || POLY_WALL[Math.min(B.cls, POLY_WALL.length - 1)];
    const shade = 0.86 + ((oi * 2654435761) % 1000) / 1000 * 0.28;
    const wc = [wall[0]*shade, wall[1]*shade, wall[2]*shade];
    const roof = (sheds && sheds.has(oi)) ? 0 : B.roof;
    const eave = g + slopeLift + Math.max(2.5, B.h - (roof && roof !== 5 ? B.rh : 0));
    const n = B.pts.length;
    const seed = ((oi * 2654435761) >>> 0) % 997 / 997;
    // a negative seed tells the façade shader the wall colour is OSM's own,
    // not to be replaced by its palette
    info = [g, eave - g, B.cls, B.wallCol ? -(seed + 0.001) : seed];
    // roofs vary: Pest is terracotta, weathered brown and grey slate
    const RT = [[0.40,0.23,0.17], [0.46,0.27,0.19], [0.33,0.24,0.20], [0.30,0.31,0.33], [0.38,0.30,0.26]];
    const rt = B.roofCol || RT[Math.floor(seed * 5 * 7.3) % 5];

    for (let i = 0; i < n; i++) {
      const a = B.pts[i], b = B.pts[(i + 1) % n];
      quad([a[0], g, a[1]], [b[0], g, b[1]],
           [b[0], eave, b[1]], [a[0], eave, a[1]], wc);
    }

    if (roof === 5) {
      // open to the sky (a ruin): the walls only, and their top
    } else if (roof === 0) {
      for (const [i, j, k] of B.tri)
        tri([B.pts[i][0], eave, B.pts[i][1]], [B.pts[j][0], eave, B.pts[j][1]],
            [B.pts[k][0], eave, B.pts[k][1]], B.roofCol || POLY_ROOF_FLAT);
    } else if (roof === 4) {
      // A dome, and a dome is not a cone. Rings of the footprint drawn in
      // toward the centre on a circular profile, so it bulges instead of
      // tapering — which is the whole difference between the Biodóm and a
      // circus tent.
      // A dome is about as tall as it is deep, not three times the roof
      // height OSM happens to carry. Cap it against the footprint so a
      // 200 m hall does not grow a 60 m circus tent.
      let ext = 0;
      for (const q of B.pts)
        ext = Math.max(ext, Math.hypot(q[0] - B.cx, q[1] - B.cy));
      const RINGS = 5, RISE = Math.max(4, Math.min(ext * 0.42, B.h * 0.85));
      let prev = B.pts;
      for (let r = 1; r <= RINGS; r++) {
        const t = r / RINGS;
        const k = Math.cos(t * Math.PI * 0.5);          // shrink on a circle
        const lift = Math.sin(t * Math.PI * 0.5) * RISE;
        const ring = B.pts.map(q => [B.cx + (q[0]-B.cx)*k, B.cy + (q[1]-B.cy)*k]);
        const shade = 0.86 + t * 0.22;
        const dc = B.roofCol || [0.52, 0.58, 0.56];                 // copper green, unless OSM says
        const col = [dc[0]*shade, dc[1]*shade, dc[2]*shade];
        for (let i = 0; i < n; i++) {
          const a2 = prev[i], b2 = prev[(i + 1) % n];
          const c2 = ring[i], d2 = ring[(i + 1) % n];
          const y0 = eave + (r === 1 ? 0 : Math.sin((r-1)/RINGS * Math.PI * 0.5) * RISE);
          quad([a2[0], y0, a2[1]], [b2[0], y0, b2[1]],
               [d2[0], eave + lift, d2[1]], [c2[0], eave + lift, c2[1]], col);
        }
        prev = ring;
      }

    } else if (roof === 3 || roof === 6) {
      // 3: a trainshed, one barrel vault with glazing. 6: an OSM round roof
      // on a big footprint (a tram depot, a market hall), which is a row of
      // low vaults side by side, not one hangar (Újpesti Kocsiszín, the Határ
      // út depot). Both along the footprint's own long axis: it was the
      // world-axis bounding box, so a building standing at 45° grew a vault
      // half again its size.
      let sxx = 0, syy = 0, sxy = 0;
      for (const q of B.pts) { const dx = q[0] - B.cx, dy = q[1] - B.cy; sxx += dx*dx; syy += dy*dy; sxy += dx*dy; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const ax = [Math.cos(th), Math.sin(th)], ay = [-Math.sin(th), Math.cos(th)];
      let e0 = 1e9, e1 = -1e9, c0 = 1e9, c1 = -1e9;
      for (const q of B.pts) {
        const dx = q[0] - B.cx, dy = q[1] - B.cy;
        const a = dx * ax[0] + dy * ax[1], c = dx * ay[0] + dy * ay[1];
        e0 = Math.min(e0, a); e1 = Math.max(e1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
      }
      const W = c1 - c0;
      const NV = roof === 6 ? Math.max(1, Math.round(W / 14)) : 1;
      const SEG = roof === 6 ? 6 : 9;
      const roofTint = B.roofCol || [0.46, 0.47, 0.48];
      for (let v = 0; v < NV; v++) {
        const halfSpan = W / NV * 0.5, mid = c0 + (v + 0.5) * W / NV;
        const rise = roof === 6 ? Math.min(4.5, halfSpan * 0.55) : Math.max(4, Math.min(18, halfSpan * 0.62));
        const P = (o, y, e) => [B.cx + ax[0] * e + ay[0] * (mid + o), y, B.cy + ax[1] * e + ay[1] * (mid + o)];
        for (let sIdx = 0; sIdx < SEG; sIdx++) {
          const t0 = sIdx / SEG, t1 = (sIdx + 1) / SEG;
          const a0 = Math.PI * t0, a1 = Math.PI * t1;
          const o0 = -Math.cos(a0) * halfSpan, o1 = -Math.cos(a1) * halfSpan;
          const y0 = eave + Math.sin(a0) * rise, y1 = eave + Math.sin(a1) * rise;
          if (roof === 6) {
            const sh = 0.9 + 0.12 * Math.sin(a0 + 0.3);
            quad(P(o0, y0, e0), P(o1, y1, e0), P(o1, y1, e1), P(o0, y0, e1),
                 [roofTint[0] * sh, roofTint[1] * sh, roofTint[2] * sh]);
          } else {
            // Alternating iron ribs and glazing along the length, so it reads
            // as a shed rather than as a grey hull dropped over the tracks.
            const BAYS = Math.max(6, Math.round((e1 - e0) / 12));
            for (let b = 0; b < BAYS; b++) {
              const f0 = e0 + (e1 - e0) * b / BAYS, f1 = e0 + (e1 - e0) * (b + 1) / BAYS;
              const rib = (b % 2) === 0;
              quad(P(o0, y0, f0), P(o1, y1, f0), P(o1, y1, f1), P(o0, y0, f1),
                   rib ? [0.30, 0.29, 0.28] : [0.42, 0.52, 0.55]);
            }
          }
          // the gable at each end
          for (const ee of [e0, e1])
            quad(P(o0, y0, ee), P(o1, y1, ee), P(o1, eave, ee), P(o0, eave, ee),
                 roof === 6 ? [0.66, 0.64, 0.60] : [0.50, 0.60, 0.63]);
        }
      }
    } else {
      // a generic hip: the ring drawn in toward the centroid and lifted, which
      // works on any shape including a concave one
      // On a house the ring pulls in half way and the roof reads as a hip. On
      // a big block that makes one enormous pyramid, and a Pest block is not
      // that: it is a pitched roof about seven metres deep round the street
      // edge, with the courtyard (or a flat middle) inside. So the inset is a
      // fixed depth, capped at half way, and the top is flat.
      let ext = 0;
      for (const q of B.pts) ext += Math.hypot(q[0] - B.cx, q[1] - B.cy);
      ext /= n;
      const k = roof === 2 ? 0.02 : Math.max(0.55, 1 - 7.5 / Math.max(ext, 1));
      const big = k > 0.56;
      const ridge = eave + (big ? Math.min(B.rh, 4.2) : B.rh);
      const inner = B.pts.map(q => [B.cx + (q[0]-B.cx)*k, B.cy + (q[1]-B.cy)*k]);
      for (let i = 0; i < n; i++) {
        const a = B.pts[i], b = B.pts[(i + 1) % n];
        const ia = inner[i], ib = inner[(i + 1) % n];
        quad([a[0], eave, a[1]], [b[0], eave, b[1]],
             [ib[0], ridge, ib[1]], [ia[0], ridge, ia[1]], rt);
      }
      const top = big ? [0.16, 0.16, 0.17] : [rt[0]*1.1, rt[1]*1.1, rt[2]*1.1];
      for (const [i, j, kk] of B.tri)
        tri([inner[i][0], ridge, inner[i][1]], [inner[j][0], ridge, inner[j][1]],
            [inner[kk][0], ridge, inner[kk][1]], top);
    }
    const cnt = V.length / 3 - start;
    const cell = cells.get(key);
    if (cell) { cell.count += cnt; }
    else cells.set(key, { start, count: cnt,
                          cx: Math.floor(B.cx/1000), cy: Math.floor(B.cy/1000) });
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), info: new Float32Array(I),
           nrms: new Float32Array(N), count: V.length / 3,
           cells: [...cells.values()] };
}

/**
 * Every other track: the throat at Nyugati, the whole of Rákosrendező, and
 * the loops and sidings at each station. Only the two running lines were ever
 * drawn, so a fourteen-road throat was bare ballast with two rails down the
 * middle of it — which is most of why the Budapest end read as a country
 * branch rather than the approach to a terminus.
 *
 * Each point carries the chainage and offset from the down line, worked out
 * at bake time. Inside the corridor a yard is graded to rail level, so the
 * height comes from the route profile; outside it, from the ground.
 */
export function unpackRails(b64, count) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  const ways = [];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cls = raw[o]; const n = dv.getUint16(o + 2, true); o += 4;
    const pts = [];
    for (let k = 0; k < n; k++) {
      pts.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true),
                dv.getFloat32(o + 8, true), dv.getUint16(o + 12, true)]);
      o += 14;
    }
    ways.push({ cls, pts });
  }
  return ways;
}

export function buildYardTracks(ways, demAt, railYAt) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };
  // a siding is not a running line: greyer ballast, duller rail, and the
  // disused ones are more weed than stone
  const COL = [
    { bal: [0.36,0.33,0.30], rail: [0.40,0.38,0.37] },   // rail
    { bal: [0.34,0.32,0.28], rail: [0.38,0.36,0.35] },   // narrow gauge
    { bal: [0.34,0.35,0.26], rail: [0.31,0.28,0.24] },   // disused
    { bal: [0.32,0.36,0.25], rail: [0.28,0.26,0.22] },   // abandoned
  ];
  for (const w of ways) {
    const c = COL[w.cls] || COL[0];
    const gauge = w.cls === 1 ? 0.76 : 1.435;
    const bw = w.cls === 1 ? 1.5 : 2.4;                  // ballast half width
    const yOf = (p) => (p[3] < 110 ? railYAt(p[2]) : demAt(p[0], p[1]));
    for (let i = 0; i < w.pts.length - 1; i++) {
      const a = w.pts[i], b = w.pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (L < 0.4 || L > 400) continue;
      const nx = -dy / L, ny = dx / L;
      const ya = yOf(a), yb = yOf(b);
      if (!isFinite(ya) || !isFinite(yb)) continue;
      const P = (p, y, o, up) => [p[0] + nx * o, y + up, p[1] + ny * o];
      quad(P(a, ya, -bw, 0.02), P(b, yb, -bw, 0.02),
           P(b, yb, bw, 0.02), P(a, ya, bw, 0.02), c.bal);
      for (const sg of [-1, 1]) {
        const o = sg * gauge * 0.5;
        quad(P(a, ya, o - 0.07, 0.06), P(b, yb, o - 0.07, 0.06),
             P(b, yb, o + 0.07, 0.06), P(a, ya, o + 0.07, 0.06), c.rail);
      }
    }

    // Static Parked Freight & Passenger Rakes on Marshalling Yard Sidings
    // (Rákosrendező, Istvántelek, Dunakeszi, Vác)
    if (w.cls === 0 || w.cls === 2) {
      let trackLen = 0;
      const cum = [0];
      for (let i = 0; i < w.pts.length - 1; i++) {
        const segL = Math.hypot(w.pts[i+1][0] - w.pts[i][0], w.pts[i+1][1] - w.pts[i][1]);
        trackLen += segL;
        cum.push(trackLen);
      }
      const midPt = w.pts[Math.floor(w.pts.length / 2)];
      if (trackLen >= 90 && midPt[3] >= 11 && midPt[3] <= 180) {
        const seed = Math.sin(w.pts[0][0] * 12.9898 + w.pts[0][1] * 78.233) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        if (rnd <= 0.54) {
          const rakeType = Math.floor(rnd * 10) % 4;
          const wagonLen = rakeType === 2 ? 23.5 : (rakeType === 1 ? 15.0 : (rakeType === 3 ? 19.5 : 13.5));
          const numWagons = Math.min(7, Math.max(2, Math.floor((trackLen - 28) / (wagonLen + 0.6))));

          const ptAtS = (s) => {
            let i = 1;
            while (i < cum.length - 1 && cum[i] < s) i++;
            const s0 = cum[i-1], s1 = cum[i];
            const u = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
            const a = w.pts[i-1], b = w.pts[i];
            const x = a[0] + (b[0]-a[0])*u, y = a[1] + (b[1]-a[1])*u;
            const dx = b[0]-a[0], dy = b[1]-a[1], L = Math.hypot(dx, dy) || 1;
            const ya = yOf(a), yb = yOf(b);
            const elev = ya + (yb - ya)*u + 0.15;
            // how far this point of the siding is from the running line
            const off = a[3] + (b[3] - a[3]) * u;
            return { x, y, nx: -dy/L, ny: dx/L, fx: dx/L, fy: dy/L, elev, off };
          };

          let distAcc = 14.0 + (rnd * 12.0);
          for (let wg = 0; wg < numWagons; wg++) {
            const pFront = ptAtS(distAcc);
            const pBack = ptAtS(distAcc + wagonLen);
            const pMid = ptAtS(distAcc + wagonLen * 0.5);
            distAcc += wagonLen + 0.6;
            if (!isFinite(pFront.elev) || !isFinite(pBack.elev)) continue;
            // A siding picked by its middle can run in to the main line at
            // its ends (a turnout): a wagon there stood on the running line,
            // in the way of every train (seen before Rákosrendező).
            if (Math.min(pFront.off, pBack.off, pMid.off) < 9) continue;

            const hw = 1.42;
            const yBase = pMid.elev + 0.45;
            const F = (o, up) => [pFront.x + pFront.nx * o, yBase + up, pFront.y + pFront.ny * o];
            const B = (o, up) => [pBack.x + pBack.nx * o, yBase + up, pBack.y + pBack.ny * o];

            // Bogies
            const BOGIE_COL = [0.18, 0.18, 0.19];
            const pB1 = ptAtS(distAcc - wagonLen + 2.5);
            const pB2 = ptAtS(distAcc - 2.5);
            for (const pb of [pB1, pB2]) {
              const B1 = (o, up) => [pb.x + pb.nx*o - pb.fx*1.1, pb.elev + up, pb.y + pb.ny*o - pb.fy*1.1];
              const B2 = (o, up) => [pb.x + pb.nx*o + pb.fx*1.1, pb.elev + up, pb.y + pb.ny*o + pb.fy*1.1];
              quad(B1(-0.75, 0.35), B2(-0.75, 0.35), B2(0.75, 0.35), B1(0.75, 0.35), BOGIE_COL);
            }

            if (rakeType === 0) {
              // Eaos Open Gondola
              const BODY = [0.46, 0.22, 0.16], INT = [0.22, 0.21, 0.20];
              quad(F(-hw, 0), B(-hw, 0), B(-hw, 2.6), F(-hw, 2.6), BODY);
              quad(B(hw, 0), F(hw, 0), F(hw, 2.6), B(hw, 2.6), BODY);
              quad(F(hw, 0), F(-hw, 0), F(-hw, 2.6), F(hw, 2.6), BODY);
              quad(B(-hw, 0), B(hw, 0), B(hw, 2.6), B(-hw, 2.6), BODY);
              quad(F(-hw + 0.1, 2.2), B(-hw + 0.1, 2.2), B(hw - 0.1, 2.2), F(hw - 0.1, 2.2), INT);
            } else if (rakeType === 1) {
              // Zacns Chemical Tanker
              const TANK = [0.66, 0.68, 0.72], CHASSIS = [0.18, 0.18, 0.18];
              quad(F(-hw, 0), B(-hw, 0), B(hw, 0), F(hw, 0), CHASSIS);
              const SEG = 8, R = 1.35;
              for (let s = 0; s < SEG; s++) {
                const a0 = s / SEG * Math.PI * 2, a1 = (s + 1) / SEG * Math.PI * 2;
                const u0 = Math.cos(a0) * R, w0 = 1.45 + Math.sin(a0) * R;
                const u1 = Math.cos(a1) * R, w1 = 1.45 + Math.sin(a1) * R;
                quad(F(u0, w0), B(u0, w0), B(u1, w1), F(u1, w1), (s % 2) ? TANK : [0.58, 0.60, 0.64]);
              }
            } else if (rakeType === 2) {
              // Bhv Retro MÁV Blue Passenger Carriage
              const MAV_BLUE = [0.08, 0.22, 0.44], ROOF = [0.60, 0.62, 0.64];
              const CREAM = [0.86, 0.82, 0.72], GLASS = [0.12, 0.14, 0.18];
              quad(F(-hw, 0), B(-hw, 0), B(-hw, 1.2), F(-hw, 1.2), MAV_BLUE);
              quad(B(hw, 0), F(hw, 0), F(hw, 1.2), B(hw, 1.2), MAV_BLUE);
              quad(F(-hw, 1.2), B(-hw, 1.2), B(-hw, 2.3), F(-hw, 2.3), CREAM);
              quad(B(hw, 1.2), F(hw, 1.2), F(hw, 2.3), B(hw, 2.3), CREAM);
              quad(F(-hw - 0.01, 1.4), B(-hw - 0.01, 1.4), B(-hw - 0.01, 2.1), F(-hw - 0.01, 2.1), GLASS);
              quad(B(hw + 0.01, 1.4), F(hw + 0.01, 1.4), F(hw + 0.01, 2.1), B(hw + 0.01, 2.1), GLASS);
              quad(F(-hw, 2.3), B(-hw, 2.3), B(0, 3.2), F(0, 3.2), ROOF);
              quad(F(0, 3.2), B(0, 3.2), B(hw, 2.3), F(hw, 2.3), ROOF);
              quad(F(hw, 0), F(-hw, 0), F(-hw, 3.0), F(hw, 3.0), MAV_BLUE);
              quad(B(-hw, 0), B(hw, 0), B(hw, 3.0), B(-hw, 3.0), MAV_BLUE);
            } else {
              // Container Flat Sggrss with 40ft container
              const CONT_COL = (wg % 3 === 0) ? [0.28, 0.52, 0.74] : ((wg % 3 === 1) ? [0.82, 0.40, 0.14] : [0.14, 0.46, 0.28]);
              quad(F(-hw, 0), B(-hw, 0), B(hw, 0), F(hw, 0), [0.18, 0.18, 0.19]);
              const chw = 1.30;
              quad(F(-chw, 0.2), B(-chw, 0.2), B(-chw, 2.8), F(-chw, 2.8), CONT_COL);
              quad(B(chw, 0.2), F(chw, 0.2), F(chw, 2.8), B(chw, 2.8), CONT_COL);
              quad(F(-chw, 2.8), B(-chw, 2.8), B(chw, 2.8), F(chw, 2.8), CONT_COL);
              quad(F(chw, 0.2), F(-chw, 0.2), F(-chw, 2.8), F(chw, 2.8), CONT_COL);
              quad(B(-chw, 0.2), B(chw, 0.2), B(chw, 2.8), B(-chw, 2.8), CONT_COL);
            }
          }
        }
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

export function unpackRoads(b64, count, hasLanes = false) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  const ways = [];
  let o = 0;
  for (let i = 0; i < count; i++) {
    const cls = raw[o], bridge = raw[o + 1];
    let lanes = 0, oneway = 0, n;
    if (hasLanes) { lanes = raw[o + 2]; oneway = raw[o + 3]; n = dv.getUint16(o + 4, true); o += 6; }
    else { n = dv.getUint16(o + 2, true); o += 4; }
    const pts = [];
    for (let k = 0; k < n; k++) {
      pts.push([dv.getFloat32(o, true), dv.getFloat32(o + 4, true)]);
      o += 8;
    }
    ways.push({ cls, pts, bridge, lanes, oneway });
  }
  return ways;
}

export const WALL_TOP = 0.70;

export function boxMesh() {
  // walls to WALL_TOP, then a hipped roof to 1.0 — a flat slab reads as a
  // concrete block, and a roof is most of what makes a village legible
  const W_ = WALL_TOP, r = 0.18;
  const f = [
    [[-1,0,-1],[1,0,-1],[1,W_,-1],[-1,W_,-1]],
    [[1,0,1],[-1,0,1],[-1,W_,1],[1,W_,1]],
    [[-1,0,1],[-1,0,-1],[-1,W_,-1],[-1,W_,1]],
    [[1,0,-1],[1,0,1],[1,W_,1],[1,W_,-1]],
    [[-1,W_,-1],[1,W_,-1],[r,1,-r],[-r,1,-r]],
    [[1,W_,1],[-1,W_,1],[-r,1,r],[r,1,r]],
    [[-1,W_,1],[-1,W_,-1],[-r,1,-r],[-r,1,r]],
    [[1,W_,-1],[1,W_,1],[r,1,r],[r,1,-r]],
    [[-r,1,-r],[r,1,-r],[r,1,r],[-r,1,r]],
  ];
  const v = [];
  for (const q of f) for (const k of [0,1,2,0,2,3]) v.push(...q[k]);
  return new Float32Array(v);
}


// -------------------------------------------------------------- stations
// MÁV has not published a track diagram we can read, so platform sides are
// inferred: the platform goes on the far side of the running line from its
// neighbour, which is where a side platform actually sits. Lengths are set by
// what calls there — a KISS is 156 m, so nothing shorter than that is honest.
export function buildStations(stops, downPts, upPts, demAt, majors) {
  const V = [], C = [], boards = [], lamps = [];
  const PLAT_H = 0.55, INNER = 1.75, OUTER = 5.6;
  const topCol = [0.60, 0.59, 0.57], faceCol = [0.44, 0.43, 0.42];
  const idxAt = m => Math.max(1, Math.min(downPts.length - 2,
    Math.round((m - downPts[0][3]) / 10)));

  for (const st of stops) {
    const m = st.km * 1000;
    if (m < downPts[0][3] + 200 || m > downPts[downPts.length - 1][3] - 200) continue;
    const i = idxAt(m);
    const p = downPts[i], q = downPts[i + 1];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const L = Math.hypot(dx, dy) || 1;
    const fx = dx / L, fy = dy / L, rx = -fy, ry = fx;

    // which side is the other running line on?
    let best = 1e9, sign = 1;
    for (let k = Math.max(0, i - 60); k < Math.min(upPts.length, i + 60); k++) {
      const u = upPts[k];
      const d = Math.hypot(u[0] - p[0], u[1] - p[1]);
      if (d < best) {
        best = d;
        sign = ((u[0] - p[0]) * rx + (u[1] - p[1]) * ry) > 0 ? -1 : 1;
      }
    }
    const major = majors.has(st.name);
    const half = (major ? 210 : 165) / 2;

    // sweep the deck along the actual alignment: Kismaros is on a curve and a
    // straight slab there sits at an angle to its own platform road
    const i0 = idxAt(m - half), i1 = idxAt(m + half);
    // the second platform belongs on the far side of the other running line;
    // mirroring the first one puts it straight through the tracks
    const sides = major ? [[sign, INNER, OUTER], [-sign, 8.6, 12.4]]
                        : [[sign, INNER, OUTER]];
    for (const [sg, inner, outer] of sides) {
      const a0 = inner * sg, a1 = outer * sg;
      const rail = [];
      for (let k = i0; k <= i1; k++) {
        const c = downPts[k], d = downPts[Math.min(downPts.length - 1, k + 1)];
        const ex = d[0] - c[0], ey = d[1] - c[1];
        const el = Math.hypot(ex, ey) || 1;
        const nx = -ey / el, ny = ex / el;
        rail.push([c[0] + nx * a0, c[1] + ny * a0,
                   c[0] + nx * a1, c[1] + ny * a1, c[2] + PLAT_H]);
      }
      const push = (x, h, z, col) => { V.push(x, h, -z); C.push(col[0], col[1], col[2]); };
      for (let k = 0; k < rail.length - 1; k++) {
        const a = rail[k], b = rail[k + 1];
        push(a[0], a[4], a[1], topCol); push(b[0], b[4], b[1], topCol);
        push(a[2], a[4], a[3], topCol);
        push(a[2], a[4], a[3], topCol); push(b[0], b[4], b[1], topCol);
        push(b[2], b[4], b[3], topCol);
        for (const [ux, uy, vx, vy] of [[a[0],a[1],b[0],b[1]], [b[2],b[3],a[2],a[3]]]) {
          const lo = Math.min(a[4], b[4]) - PLAT_H - 0.45;
          push(ux, a[4], uy, faceCol); push(vx, b[4], vy, faceCol);
          push(vx, lo, vy, faceCol);
          push(ux, a[4], uy, faceCol); push(vx, lo, vy, faceCol);
          push(ux, lo, uy, faceCol);
        }
      }
      // ---- furniture
      //
      // A platform with nothing on it is a slab of concrete, and ours were
      // exactly that. What you actually see going through a Hungarian station
      // is the canopy first — a flat deck on a single row of columns down the
      // back of the platform — and then the lamp posts marching away from it.
      //
      // The canopy sits over the middle of the platform, where the doors of a
      // stopping train come to rest, not over the whole length: a 210 m
      // platform with 210 m of roof looks like a shed.
      const quad4 = (a, b, c, d, col) => {
        push(a[0], a[1], a[2], col); push(b[0], b[1], b[2], col);
        push(c[0], c[1], c[2], col);
        push(a[0], a[1], a[2], col); push(c[0], c[1], c[2], col);
        push(d[0], d[1], d[2], col);
      };
      // a point across the platform: t = 0 at the track edge, 1 at the back
      const across = (r, t, up) => [r[0] + (r[2] - r[0]) * t, r[4] + up,
                                    r[1] + (r[3] - r[1]) * t];
      const ROOF = [0.52, 0.53, 0.54], ROOF_U = [0.40, 0.40, 0.39];
      const POST = [0.36, 0.36, 0.35], LAMP_OFF = [0.44, 0.44, 0.43];
      const cMid = (rail.length - 1) / 2;
      // A village halt has a shelter, not a train shed: 30 m of roof there
      // against 90 m at a station where a six-car set stands.
      const cHalf = major ? 4.5 : 1.5;
      for (let k = 0; k < rail.length - 1; k++) {
        const inCanopy = Math.abs(k + 0.5 - cMid) <= cHalf;
        if (inCanopy) {
          const a = rail[k], b = rail[k + 1];
          // The roof falls toward the track, where the gutter would be, and
          // is highest at the back — the way round that keeps it clear of a
          // double-decker's roof line at the platform edge.
          const HI = 4.15, LO = 3.80;
          quad4(across(a, 0.02, LO), across(b, 0.02, LO),
                across(b, 0.98, HI), across(a, 0.98, HI), ROOF);
          quad4(across(a, 0.02, LO - 0.16), across(b, 0.02, LO - 0.16),
                across(b, 0.98, HI - 0.16), across(a, 0.98, HI - 0.16), ROOF_U);
          // the fascia, which is what gives it an edge seen from the side
          quad4(across(a, 0.02, LO), across(b, 0.02, LO),
                across(b, 0.02, LO - 0.16), across(a, 0.02, LO - 0.16), ROOF_U);
          // one column per bay, at the back of the platform
          const c0 = across(a, 0.88, 0), c1 = across(a, 0.88, HI - 0.20);
          const w = 0.11;
          quad4([c0[0]-w, c0[1], c0[2]], [c0[0]+w, c0[1], c0[2]],
                [c1[0]+w, c1[1], c1[2]], [c1[0]-w, c1[1], c1[2]], POST);
          quad4([c0[0], c0[1], c0[2]-w], [c0[0], c0[1], c0[2]+w],
                [c1[0], c1[1], c1[2]+w], [c1[0], c1[1], c1[2]-w], POST);
        }
        // lamp posts the length of the platform, and closer together than
        // the canopy columns because they have to light the far end too
        if (k % 3 === 1 && !inCanopy) {
          const r = rail[k];
          const b0 = across(r, 0.80, 0), b1 = across(r, 0.80, 4.40);
          const w = 0.07;
          quad4([b0[0]-w, b0[1], b0[2]], [b0[0]+w, b0[1], b0[2]],
                [b1[0]+w, b1[1], b1[2]], [b1[0]-w, b1[1], b1[2]], POST);
          quad4([b0[0], b0[1], b0[2]-w], [b0[0], b0[1], b0[2]+w],
                [b1[0], b1[1], b1[2]+w], [b1[0], b1[1], b1[2]-w], POST);
          // the head, which the dark version of is what a lamp looks like by
          // day; it is lit from the platform's dynamic pass after dark
          const h0 = across(r, 0.62, 4.30), h1 = across(r, 0.86, 4.44);
          quad4([h0[0], h0[1], h0[2]-0.22], [h1[0], h1[1], h1[2]-0.22],
                [h1[0], h1[1], h1[2]+0.22], [h0[0], h0[1], h0[2]+0.22], LAMP_OFF);
          lamps.push([(h0[0] + h1[0]) / 2, (h0[1] + h1[1]) / 2 - 0.03,
                      (h0[2] + h1[2]) / 2]);
        }
      }

      const mid = rail[Math.max(0, Math.floor(rail.length * 0.32))];
      boards.push({ name: st.name, x: (mid[0] + mid[2]) / 2,
                    y: (mid[1] + mid[3]) / 2, h: mid[4] + 1.15,
                    ang: Math.atan2(fx, fy) });
    }
  }
  // the world has to stop somewhere; say so rather than just ending
  for (const [m, text, dir] of [
      [downPts[downPts.length - 1][3] - 120, "SZLOVÁKIA — a pálya folytatódik", 1],
      [downPts[0][3] + 120, "BUDAPEST — a pálya folytatódik", -1]]) {
    const i = idxAt(m);
    const p = downPts[i], q = downPts[i + 1];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const el = Math.hypot(ex, ey) || 1;
    const fx = ex / el, fy = ey / el, nx = -fy, ny = fx;
    const gate = [0.30, 0.32, 0.34];
    const push = (x, h, z) => { V.push(x, h, -z); C.push(gate[0], gate[1], gate[2]); };
    const bar = (o0, o1, y0, y1) => {
      const c0 = [p[0] + nx * o0, p[1] + ny * o0], c1 = [p[0] + nx * o1, p[1] + ny * o1];
      for (const [a, b] of [[c0, c1]]) {
        push(a[0], y0, a[1]); push(b[0], y0, b[1]); push(b[0], y1, b[1]);
        push(a[0], y0, a[1]); push(b[0], y1, b[1]); push(a[0], y1, a[1]);
      }
    };
    const g = p[2];
    bar(-9.0, -8.2, g, g + 7.4);
    bar(8.2, 9.0, g, g + 7.4);
    bar(-9.0, 9.0, g + 7.0, g + 7.4);
    boards.push({ name: text, x: p[0] + nx * 0.0, y: p[1] + ny * 0.0,
                  h: g + 5.6, ang: Math.atan2(fx, fy) });
  }
  return { mesh: { verts: new Float32Array(V), cols: new Float32Array(C),
                   count: V.length / 3 }, boards, lamps };
}

/**
 * The lit side of a platform lamp. The post and the shade are static — they
 * are there at noon too — so only the light itself is rebuilt, and only when
 * the darkness has moved enough to see. Authored above 1.0 so the bloom is
 * what makes it read as a light rather than a white rectangle, which is the
 * same trick the train lamps and lit windows use.
 */
export function buildPlatformLamps(lamps, night) {
  const V = [], C = [];
  if (!(night > 0.02)) return { verts: new Float32Array(V), cols: new Float32Array(C), count: 0 };
  const k = Math.min(1, night);
  const platCol = [0.55 + 1.85 * k, 0.50 + 1.55 * k, 0.36 + 0.95 * k];
  const streetCol = [0.70 + 2.50 * k, 0.55 + 1.90 * k, 0.25 + 0.90 * k];

  for (const [x, y, z] of lamps) {
    const isStreet = (y > 105.0 || (y % 100) > 6.0);
    const r = isStreet ? 0.55 : 0.26, h = isStreet ? 0.35 : 0.20;
    const col = isStreet ? streetCol : platCol;
    const P = (dx, dy, dz) => { V.push(x + dx, y + dy, -(z + dz));
                                C.push(col[0], col[1], col[2]); };
    const face = (ax, az, bx, bz) => {
      P(ax, 0, az); P(bx, 0, bz); P(bx, -h, bz);
      P(ax, 0, az); P(bx, -h, bz); P(ax, -h, az);
    };
    face(-r, -r,  r, -r); face( r, -r,  r,  r);
    face( r,  r, -r,  r); face(-r,  r, -r, -r);
    P(-r, -h, -r); P(r, -h, -r); P(r, -h, r);
    P(-r, -h, -r); P(r, -h, r); P(-r, -h, r);
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

export function boardAtlas(names, W = 512, H = 64) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H * names.length;
  const x = c.getContext("2d");
  names.forEach((n, i) => {
    const y = i * H;
    x.fillStyle = "#0d2438"; x.fillRect(0, y, W, H);
    x.fillStyle = "#e8f1f6"; x.fillRect(0, y + 3, W, 2);
    x.fillRect(0, y + H - 5, W, 2);
    let size = 40;
    x.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    while (x.measureText(n).width > W - 34 && size > 14) {
      size -= 2;
      x.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
    }
    x.fillStyle = "#f2f8fb";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(n, W / 2, y + H / 2 + 1);
  });
  return c;
}

/**
 * People on the platforms. Flat dark silhouettes, which is all you can see of
 * somebody standing on a platform two hundred metres away with the sky behind
 * them — and a platform with nobody on it reads as closed.
 *
 * How many depends on the place and the hour: a Budapest terminus at eight in
 * the morning is not Szob at eleven at night. They are placed by hashing the
 * platform position so they do not swim about between frames, and they face
 * the track, because everybody does.
 */
export function buildPlatformPeople(stops, downPts, upPts, demAt, hour, majors, rainy = false) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };
  const at = (pts, m) => {
    const f = (m - pts[0][3]) / 10;
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const u = f - i, a = pts[i], b = pts[i + 1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]), a[2] + u*(b[2]-a[2])];
  };
  const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  // the shape of a working day: two peaks, a quiet middle, nothing at night
  const h = ((hour % 24) + 24) % 24;
  const rush = Math.exp(-Math.pow((h - 7.6) / 1.5, 2)) + Math.exp(-Math.pow((h - 16.8) / 1.9, 2));
  const day = h > 5 && h < 23 ? 0.30 + 0.70 * rush : 0.04;
  // A crowd that reads as people, not posts: legs, a body, arms, a head with
  // hair or a hat, sometimes a bag, a backpack or an umbrella; children and
  // older people; mostly dark winter-ish coats with some colour among them.
  // Each is a handful of small boxes, turned to face roughly the track.
  const COATS = [[0.10,0.10,0.12], [0.16,0.15,0.18], [0.08,0.11,0.16], [0.22,0.17,0.13],
                 [0.13,0.17,0.15], [0.26,0.25,0.27], [0.55,0.14,0.12], [0.80,0.62,0.22],
                 [0.20,0.34,0.58], [0.72,0.66,0.55], [0.36,0.44,0.28], [0.85,0.85,0.83]];
  const LEGS = [[0.10,0.11,0.14], [0.16,0.20,0.30], [0.24,0.22,0.20], [0.12,0.12,0.12], [0.34,0.30,0.26]];
  const SKIN = [[0.86,0.68,0.55], [0.78,0.58,0.44], [0.62,0.45,0.33], [0.45,0.31,0.22], [0.90,0.74,0.62]];
  const HAIR = [[0.10,0.08,0.07], [0.30,0.20,0.12], [0.62,0.48,0.28], [0.70,0.70,0.68], [0.20,0.14,0.10]];
  const box = (cx, cy, cz, fx, fy, hw, hd, h0, h1, col) => {
    // a box centred on (cx, cz) facing (fx, fy): hw across, hd along the facing
    const rx = -fy, ry = fx;
    const P = (a, b, y) => [cx + rx * a + fx * b, y, cz + ry * a + fy * b];
    const c = [P(-hw,-hd,h0), P(hw,-hd,h0), P(hw,hd,h0), P(-hw,hd,h0)];
    const t = [P(-hw,-hd,h1), P(hw,-hd,h1), P(hw,hd,h1), P(-hw,hd,h1)];
    for (let k = 0; k < 4; k++) quad(c[k], c[(k+1)%4], t[(k+1)%4], t[k], col);
    quad(t[0], t[1], t[2], t[3], col);
  };
  const person = (x, y, g, fx, fy, r, i) => {
    const kid = r(1) < 0.10, old = !kid && r(2) < 0.18;
    const H = kid ? 1.05 + r(3) * 0.25 : (1.58 + r(3) * 0.30) * (old ? 0.96 : 1);
    const W = (kid ? 0.16 : 0.20 + r(4) * 0.06) * (r(5) < 0.2 ? 1.2 : 1);
    const coat = COATS[Math.floor(r(6) * COATS.length)];
    const legs = LEGS[Math.floor(r(7) * LEGS.length)];
    const skin = SKIN[Math.floor(r(8) * SKIN.length)];
    const hair = old ? [0.72,0.72,0.70] : HAIR[Math.floor(r(9) * HAIR.length)];
    const skirt = !kid && r(10) < 0.22;
    const legH = H * 0.47, bodyH = H * 0.33, headH = H * 0.13;
    const lean = old ? 0.06 : 0;
    if (skirt) box(x, g, y, fx, fy, W * 0.95, W * 0.6, g + legH * 0.45, g + legH, coat);
    for (const sd of [-1, 1]) {                                   // legs
      const lx = x + (-fy) * sd * W * 0.45, ly = y + fx * sd * W * 0.45;
      box(lx, g, ly, fx, fy, W * 0.36, W * 0.4, g, g + legH, skirt ? skin : legs);
    }
    const bx = x + fx * lean, by = y + fy * lean;
    box(bx, g, by, fx, fy, W, W * 0.62, g + legH, g + legH + bodyH, coat);      // body
    for (const sd of [-1, 1]) {                                   // arms
      const ax = bx + (-fy) * sd * W * 1.18, ay = by + fx * sd * W * 1.18;
      box(ax, g, ay, fx, fy, W * 0.2, W * 0.28, g + legH + bodyH * 0.05, g + legH + bodyH * 0.95, coat);
    }
    const hx = bx + fx * lean, hy = by + fy * lean, h0 = g + legH + bodyH;
    box(hx, g, hy, fx, fy, W * 0.46, W * 0.5, h0, h0 + headH, skin);            // head
    if (r(11) < 0.16) {                                           // a hat
      box(hx, g, hy, fx, fy, W * 0.56, W * 0.6, h0 + headH * 0.85, h0 + headH * 1.2, r(12) < 0.5 ? coat : [0.12,0.12,0.13]);
    } else {
      box(hx - fx * W * 0.08, g, hy - fy * W * 0.08, fx, fy, W * 0.5, W * 0.46, h0 + headH * 0.7, h0 + headH * 1.08, hair);
    }
    const extra = r(13);
    if (extra < 0.22 && !kid) {                                   // backpack
      box(bx - fx * W * 0.85, g, by - fy * W * 0.85, fx, fy, W * 0.72, W * 0.3, g + legH + bodyH * 0.25, g + legH + bodyH * 0.95, [0.16 + r(14)*0.5, 0.18, 0.22]);
    } else if (extra < 0.45 && !kid) {                            // a bag at the side
      const sd = r(15) < 0.5 ? -1 : 1;
      box(bx + (-fy) * sd * W * 1.5, g, by + fx * sd * W * 1.5, fx, fy, W * 0.16, W * 0.55, g + legH * 0.75, g + legH * 1.2, [0.22,0.17,0.12]);
    } else if (extra < 0.52 && !kid) {                            // a suitcase on wheels
      box(bx + fx * W * 1.6, g, by + fy * W * 1.6, fx, fy, W * 0.6, W * 0.35, g, g + 0.6, [0.18 + r(16)*0.6, 0.20, 0.30]);
    }
    if (rainy && r(17) < 0.55 && !kid) {                           // an umbrella
      const uc = r(18) < 0.6 ? [0.08,0.08,0.10] : COATS[Math.floor(r(19) * COATS.length)];
      box(hx, g, hy, fx, fy, 0.03, 0.03, h0, h0 + headH + 0.35, [0.15,0.15,0.15]);
      const top = h0 + headH + 0.35;
      const P = (a, b, yy) => [hx + (-fy) * a + fx * b, yy, hy + fx * a + fy * b];
      quad(P(-0.5,-0.5,top - 0.12), P(0.5,-0.5,top - 0.12), P(0,0,top + 0.12), P(0,0,top + 0.12), uc);
      quad(P(0.5,-0.5,top - 0.12), P(0.5,0.5,top - 0.12), P(0,0,top + 0.12), P(0,0,top + 0.12), uc);
      quad(P(0.5,0.5,top - 0.12), P(-0.5,0.5,top - 0.12), P(0,0,top + 0.12), P(0,0,top + 0.12), uc);
      quad(P(-0.5,0.5,top - 0.12), P(-0.5,-0.5,top - 0.12), P(0,0,top + 0.12), P(0,0,top + 0.12), uc);
    }
  };

  for (let si = 0; si < stops.length; si++) {
    const st = stops[si];
    const m = st.km * 1000;
    if (m < downPts[0][3] + 30 || m > downPts[downPts.length-1][3] - 30) continue;
    const big = majors && majors.has(st.name);
    const n = Math.round((big ? 38 : 15) * day);
    const half = big ? 100 : 78;
    const p0 = at(downPts, m - 10), p1 = at(downPts, m + 10);
    const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx/L, uy = dy/L, nx = -uy, ny = ux;
    const c = at(downPts, m);
    for (let i = 0; i < n; i++) {
      const r = (k) => hash(si * 71.3 + i * 13.7 + k * 3.917);
      const along = (r(20) - 0.5) * 2 * half;
      const side = r(21) < 0.5 ? -1 : 1;
      const off = side * (6.4 + r(22) * 3.4);
      const x = c[0] + ux * along + nx * off, y = c[1] + uy * along + ny * off;
      const g = c[2] + 0.55;
      // most face the track, some the other way or along the platform
      const face = r(23);
      let fx = -nx * side, fy = -ny * side;
      if (face > 0.72) { fx = ux * (face > 0.86 ? 1 : -1); fy = uy * (face > 0.86 ? 1 : -1); }
      else if (face > 0.62) { fx = -fx; fy = -fy; }
      person(x, y, g, fx, fy, r, i);
      // now and then a pair or a family standing together
      if (r(24) < 0.18) person(x + ux * 0.8, y + uy * 0.8, g, fx, fy, (k) => r(k + 40), i);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

// -------------------------------------------------------- signal geometry
const LAMP = [
  [0.95, 0.16, 0.12],   // stop
  [0.98, 0.76, 0.16],   // caution
  [0.98, 0.76, 0.16],   // 80
  [0.24, 0.92, 0.42],   // clear
  [0.92, 0.94, 0.96],   // call-on
];

export function buildSignals(sigs, downPts, upPts, aspectOf) {
  const V = [], C = [];
  const post = [0.20, 0.20, 0.20], head = [0.10, 0.10, 0.11];
  const at = (pts, m) => {
    const f = (m - pts[0][3]) / 10;
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const u = f - i, a = pts[i], b = pts[i + 1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]), a[2] + u*(b[2]-a[2])];
  };
  const box = (cx, cy, cz, hx, hy, hz, col) => {
    const P = [
      [cx-hx,cy-hy,cz-hz],[cx+hx,cy-hy,cz-hz],[cx+hx,cy+hy,cz-hz],[cx-hx,cy+hy,cz-hz],
      [cx-hx,cy-hy,cz+hz],[cx+hx,cy-hy,cz+hz],[cx+hx,cy+hy,cz+hz],[cx-hx,cy+hy,cz+hz]];
    const f = [[0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0]];
    for (const q of f) for (const k of [0,1,2,0,2,3]) {
      V.push(P[q[k]][0], P[q[k]][1], -P[q[k]][2]);
      C.push(col[0], col[1], col[2]);
    }
  };
  for (const [dirIdx, pts] of [[0, downPts], [1, upPts]]) {
    const dir = dirIdx === 0 ? 1 : -1;
    if (!pts || pts.length === 0) continue;
    for (const m of sigs) {
      if (m < pts[0][3] + 20 || m > pts[pts.length-1][3] - 20) continue;
      const a = at(pts, m - 10), b = at(pts, m + 10);
      const dx = b[0]-a[0], dy = b[1]-a[1];
      const L = Math.hypot(dx, dy) || 1;
      const side = dir > 0 ? 1 : -1;
      const nx = -dy/L * 3.6 * side, ny = dx/L * 3.6 * side;
      const p = at(pts, m);
      const x = p[0] + nx, z = p[1] + ny, g = p[2];
      box(x, g + 2.1, z, 0.14, 2.1, 0.14, post);
      box(x, g + 4.5, z, 0.42, 0.85, 0.42, head);
      // the lamp has to sit proud of the head, facing the track, or it is
      // simply hidden inside the box
      const fx = -nx / 3.6 * 0.42, fz = -ny / 3.6 * 0.42;
      const col = LAMP[aspectOf(m, dir)];
      box(x + fx, g + 4.85, z + fz, 0.26, 0.26, 0.26, col);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}


// ------------------------------------------------- level crossing furniture
// 68 crossings, with the barrier type OSM records for each: full, half,
// double half, or none. The booms drop when a train is close enough.
export function buildCrossings(crossings, downPts, demAt, trains) {
  const V = [], C = [];
  const at = (m) => {
    const f = (m - downPts[0][3]) / 10;
    const i = Math.max(0, Math.min(downPts.length - 2, Math.floor(f)));
    const u = f - i, a = downPts[i], b = downPts[i + 1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]), a[2] + u*(b[2]-a[2])];
  };
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const beam = (a, b, w, up, col) => {
    const q = [[a[0]-w[0], a[1]-up, a[2]-w[1]], [b[0]-w[0], b[1]-up, b[2]-w[1]],
               [b[0]+w[0], b[1]+up, b[2]+w[1]], [a[0]+w[0], a[1]+up, a[2]+w[1]]];
    for (const k of [0,1,2,0,2,3]) push(q[k], col);
  };
  const post = [0.30, 0.31, 0.32], red = [0.80, 0.16, 0.12], white = [0.88, 0.88, 0.86];
  const lampR = [0.95, 0.20, 0.15], lampOff = [0.20, 0.16, 0.16];

  for (const x of crossings) {
    const m = x.m;
    if (m < downPts[0][3] + 20 || m > downPts[downPts.length-1][3] - 20) continue;
    const barrier = x.barrier;
    if (!barrier || barrier === "no") continue;      // unprotected: nothing to draw
    const a = at(m - 10), b = at(m + 10);
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const L = Math.hypot(dx, dy) || 1;
    const fx = dx/L, fy = dy/L, nx = -fy, ny = fx;
    const p = at(m);
    // is anything coming?
    let close = false;
    for (const t of trains) {
      const d = Math.abs(t.m - m);
      if (d < 900 && t.v > 1) { close = true; break; }
    }
    const drop = close ? 1 : 0;

    for (const sg of [-1, 1]) {
      const bx = p[0] + nx * sg * 9.5, bz = p[1] + ny * sg * 9.5;
      const g = p[2];
      // post
      beam([bx - 0.14, g, bz - 0.14], [bx + 0.14, g, bz + 0.14], [0.14, 0.14], 1.6, post);
      // the boom: spans ACROSS THE ROAD (along the track tangent direction fx, fy)
      // when closed (drop=1), and stands upright (vertical in y) when open (drop=0).
      const len = (barrier === "full") ? 7.6 : 4.8;
      const boomDir = (sg > 0) ? -1 : 1;
      const tipX = bx + fx * boomDir * len * drop;
      const tipZ = bz + fy * boomDir * len * drop;
      const tipY = g + 1.5 + (1 - drop) * 4.6;
      for (let seg = 0; seg < 5; seg++) {
        const t0 = seg / 5, t1 = (seg + 1) / 5;
        const p0 = [bx + (tipX - bx) * t0, g + 1.5 + (tipY - (g + 1.5)) * t0, bz + (tipZ - bz) * t0];
        const p1 = [bx + (tipX - bx) * t1, g + 1.5 + (tipY - (g + 1.5)) * t1, bz + (tipZ - bz) * t1];
        beam(p0, p1, [nx * 0.09, ny * 0.09], 0.09, seg % 2 ? white : red);
      }
      // warning signal lamps facing approaching road traffic (facing along nx * sg)
      for (const side of [-1, 1]) {
        const lx = bx + fx * side * 0.55, lz = bz + fy * side * 0.55;
        beam([lx - 0.16, g + 2.5, lz], [lx + 0.16, g + 2.5, lz], [0.16, 0.16], 0.16,
             close && (Math.floor(performance.now() / 500) % 2 === (side > 0 ? 0 : 1))
               ? lampR : lampOff);
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

/**
 * Buffer stops. Only where the track data actually says a road ends: a way
 * whose last point has no other way's point within three metres, and which is
 * within reach of the start of the route — which is Nyugati, the one terminus
 * on this line.
 *
 * The restriction matters. There are thirty such ends in the first kilometre
 * and most of them are not buffer stops at all: twelve share a chainage of
 * 145 m, which is the edge of the extraction box, and a way clipped by a
 * bounding box looks exactly like a way that stops. Drawing a buffer stop at
 * every dead end would put one across the middle of the throat.
 */
export function buildBufferStops(ends) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };
  const RED = [0.52, 0.11, 0.09], WHITE = [0.80, 0.79, 0.76];
  const STEEL = [0.33, 0.33, 0.32], SLEEPER = [0.26, 0.22, 0.19];

  for (const e of ends || []) {
    // f points back down the track, the way a train arrives from
    const fx = e.fx, fy = e.fy, nx = -fy, ny = fx;
    const y = e.y;
    // u along the track from the very end, v across it, w up from rail
    const P = (u, v, w) => [e.x + fx * u + nx * v, y + w, e.z + fy * u + ny * v];

    // the sleeper baulks it stands on, and the two rails run into them
    quad(P(0.0, -1.5, 0.05), P(2.6, -1.5, 0.05), P(2.6, 1.5, 0.05), P(0.0, 1.5, 0.05), SLEEPER);
    // the frame: two raking legs and the beam across
    for (const sg of [-1, 1]) {
      const v = sg * 0.78;
      quad(P(0.15, v - 0.09, 0.05), P(1.85, v - 0.09, 0.05),
           P(0.55, v - 0.09, 1.02), P(0.15, v - 0.09, 1.02), STEEL);
      quad(P(0.15, v + 0.09, 0.05), P(1.85, v + 0.09, 0.05),
           P(0.55, v + 0.09, 1.02), P(0.15, v + 0.09, 1.02), STEEL);
    }
    // The face a driver sees, in the red and white bars that mean "the track
    // ends here". Tiled, not stacked: nothing is coplanar with anything.
    const BARS = 5;
    for (let i = 0; i < BARS; i++) {
      const v0 = -1.02 + 2.04 * i / BARS, v1 = -1.02 + 2.04 * (i + 1) / BARS;
      quad(P(0.10, v0, 0.62), P(0.10, v1, 0.62), P(0.10, v1, 1.18), P(0.10, v0, 1.18),
           (i % 2) ? WHITE : RED);
      quad(P(0.30, v0, 0.62), P(0.30, v1, 0.62), P(0.30, v1, 1.18), P(0.30, v0, 1.18),
           (i % 2) ? RED : WHITE);
    }
    quad(P(0.10, -1.02, 1.18), P(0.30, -1.02, 1.18),
         P(0.30, 1.02, 1.18), P(0.10, 1.02, 1.18), STEEL);
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}


/**
 * The city's extras (tools/bake_cityx.py): every railway and tram line, the
 * pipelines above ground, and solar farms, as one coloured mesh per tile.
 * Stretches within 6 m of this line's own track are left out (they are our
 * own rails, already drawn). Solar panels carry the marker colour SOLAR,
 * which TRACK_FS turns into dark glass that catches the sun.
 */
export const SOLAR = [0.020, 0.030, 0.050];
export function buildCityExtras(x, tx, demAt, waterAt, railDistAt) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
  const BALLAST = [0.36, 0.33, 0.30], RAIL = [0.30, 0.29, 0.28], TRAMBED = [0.32, 0.32, 0.33];
  const pts = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(tx(a[i], a[i + 1])); return o; };
  for (const [kind, bridge, flat] of x.rails || []) {
    const P = pts(flat);
    const gauge = kind === 1 ? 1.0 : 1.435, bw = kind === 2 ? 1.6 : kind === 1 ? 1.9 : 2.7;
    const yOf = (p) => {
      const g = demAt(p[0], p[1]);
      if (bridge) return Math.max(g + 6, waterAt(p[1]) + 10);
      return g + (kind === 2 ? 0.38 : 0.34);
    };
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (railDistAt) { const r = railDistAt(mx, my); if (r && r.d < 6) continue; }
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      const ya = yOf(a), yb = yOf(b);
      if (!isFinite(ya) || !isFinite(yb)) continue;
      const Q = (p, y, o, up) => [p[0] + nx * o, y + up, p[1] + ny * o];
      quad(Q(a, ya, -bw, 0), Q(b, yb, -bw, 0), Q(b, yb, bw, 0), Q(a, ya, bw, 0), kind === 2 ? TRAMBED : BALLAST);
      for (const sg of [-1, 1]) {
        const o = sg * gauge / 2;
        quad(Q(a, ya, o - 0.07, 0.07), Q(b, yb, o - 0.07, 0.07), Q(b, yb, o + 0.07, 0.07), Q(a, ya, o + 0.07, 0.07), RAIL);
      }
      if (bridge) {   // a deck edge and a pier now and then
        for (const sg of [-1, 1])
          quad(Q(a, ya, sg * bw, -1.2), Q(b, yb, sg * bw, -1.2), Q(b, yb, sg * bw, 0.1), Q(a, ya, sg * bw, 0.1), [0.40, 0.38, 0.36]);
      }
    }
  }
  // pipelines on their supports, 1.6 m up
  const PIPE = [0.62, 0.62, 0.60], SUP = [0.40, 0.40, 0.41];
  for (const flat of x.pipes || []) {
    const P = pts(flat);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * 0.3, ny = dx / L * 0.3;
      const ga = demAt(a[0], a[1]) + 1.6, gb = demAt(b[0], b[1]) + 1.6;
      quad([a[0] - nx, ga, a[1] - ny], [b[0] - nx, gb, b[1] - ny], [b[0] - nx, gb + 0.55, b[1] - ny], [a[0] - nx, ga + 0.55, a[1] - ny], PIPE);
      quad([a[0] + nx, ga, a[1] + ny], [b[0] + nx, gb, b[1] + ny], [b[0] + nx, gb + 0.55, b[1] + ny], [a[0] + nx, ga + 0.55, a[1] + ny], PIPE);
      quad([a[0] - nx, ga + 0.55, a[1] - ny], [b[0] - nx, gb + 0.55, b[1] - ny], [b[0] + nx, gb + 0.55, b[1] + ny], [a[0] + nx, ga + 0.55, a[1] + ny], PIPE);
      for (let t = 0; t < L; t += 8) {
        const px = a[0] + dx / L * t, py = a[1] + dy / L * t, g = demAt(px, py);
        quad([px - 0.15, g, py], [px + 0.15, g, py], [px + 0.15, g + 1.6, py], [px - 0.15, g + 1.6, py], SUP);
      }
    }
  }
  // solar farms: rows of panels facing south, tilted 25°, 5.5 m apart
  const inside = (poly, x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
    return c;
  };
  for (const flat of x.solar || []) {
    const P = pts(flat);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if ((x1 - x0) * (y1 - y0) > 4e6) continue;          // no 2 km² farms in one tile
    for (let y = y0 + 2; y < y1; y += 5.5)
      for (let xx = x0 + 1; xx < x1; xx += 3.2) {
        if (!inside(P, xx + 1.6, y + 1)) continue;
        const g = demAt(xx + 1.6, y + 1);
        if (!isFinite(g)) continue;
        // south edge low (y is north), north edge raised
        quad([xx, g + 0.6, y], [xx + 3.0, g + 0.6, y], [xx + 3.0, g + 1.75, y + 2.4], [xx, g + 1.75, y + 2.4], SOLAR);
      }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}
