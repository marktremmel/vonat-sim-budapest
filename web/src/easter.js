// Dobogókő, the "heart chakra of the world" (so the Pilis legend goes): a
// big red heart hanging over the summit, beating — lub-dub, about once a
// second — and turning slowly. An easter egg; the owner's idea.
//
// A heart curve in slices front to back, each slice scaled on a circle, so
// it is puffy rather than a cut-out. Built fresh every frame it is in view,
// a few hundred triangles.

/** Photo mode's placed lamps, as small glowing bulbs (world coordinates). */
export function buildBulbs(list, lvl) {
  const V = [], C = [], N = [];
  const g = 2.5 + lvl * 2;
  for (const p of list) {
    const r = 0.35;
    const faces = [[[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[0,0,1],[1,0,0]],
                   [[0,-1,0],[1,0,0],[0,0,1]], [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[0,1,0],[1,0,0]]];
    for (const [n, a, b] of faces) {
      const c = [p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r];
      const q = (s, t) => [c[0] + (a[0] * s + b[0] * t) * r, c[1] + (a[1] * s + b[1] * t) * r, c[2] + (a[2] * s + b[2] * t) * r];
      for (const v of [q(-1,-1), q(1,-1), q(1,1), q(-1,-1), q(1,1), q(-1,1)]) {
        V.push(...v); N.push(...n); C.push(1.0 * g, 0.82 * g, 0.55 * g);
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), nrms: new Float32Array(N), count: V.length / 3 };
}

export function buildHeart(cx, cy, cz, t) {
  const V = [], C = [], N = [];
  // lub-dub: two beats close together, then a rest
  const ph = (t * 1.05) % 1;
  const beat = Math.exp(-Math.pow((ph - 0.08) / 0.05, 2)) * 0.16 + Math.exp(-Math.pow((ph - 0.28) / 0.06, 2)) * 0.10;
  const S = 0.62 * (1 + beat), rot = t * 0.35;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const heart = (a) => [16 * Math.pow(Math.sin(a), 3),
                        13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)];
  const RING = 36, SL = 9;
  const P = (a, k) => {
    const z = k / (SL - 1) * 2 - 1;                    // -1 … 1 front to back
    const sc = Math.sqrt(Math.max(0, 1 - z * z * 0.92));
    const [x, y] = heart(a);
    const lx = x * sc * S, ly = y * sc * S, lz = z * 7.5 * S;
    return [cx + lx * cr + lz * sr, cy + ly, cz - lx * sr + lz * cr];
  };
  const glow = 1.2 + beat * 5;                         // brighter on the beat (the bloom takes it)
  const col = (k) => [0.95 * glow, (0.10 + k * 0.01) * glow, (0.16) * glow];
  const push = (p, n, c) => { V.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(c[0], c[1], c[2]); };
  const tri = (a, b, c, cl) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const L = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / L, n[1] / L, n[2] / L];
    push(a, n, cl); push(b, n, cl); push(c, n, cl);
  };
  for (let k = 0; k < SL - 1; k++)
    for (let i = 0; i < RING; i++) {
      const a0 = i / RING * Math.PI * 2, a1 = (i + 1) / RING * Math.PI * 2;
      const p00 = P(a0, k), p10 = P(a1, k), p01 = P(a0, k + 1), p11 = P(a1, k + 1);
      tri(p00, p10, p11, col(k)); tri(p00, p11, p01, col(k));
    }
  // the two end caps, fans from the middle
  for (const k of [0, SL - 1]) {
    const mid = P(0, k); mid[1] = cy + 2 * S;         // roughly the heart's middle
    for (let i = 0; i < RING; i++) {
      const a0 = i / RING * Math.PI * 2, a1 = (i + 1) / RING * Math.PI * 2;
      if (k === 0) tri(mid, P(a1, k), P(a0, k), col(0)); else tri(mid, P(a0, k), P(a1, k), col(8));
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), nrms: new Float32Array(N), count: V.length / 3 };
}
