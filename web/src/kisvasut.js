// The Királyréti Erdei Vasút: Kismaros – Szokolya – Királyrét, 760 mm gauge,
// eleven kilometres up the valley into the Börzsöny (tools/bake_kisvasut.py
// → data/kisvasut.json). Its train runs on its own: an Mk48 diesel, green
// with the orange-framed grille and yellow-and-black chevrons, and three
// green coaches with the orange band, the last one open-sided (the summer
// coach). Up and back all day, 15 minutes at each end, 18 km/h.

const LOCO = [0.13, 0.27, 0.17], ORANGE = [0.86, 0.36, 0.08], YELLOW = [0.92, 0.76, 0.10],
      BLACK = [0.07, 0.07, 0.08], ROOF = [0.34, 0.40, 0.34], WIN = [0.10, 0.12, 0.14],
      COACH = [0.16, 0.30, 0.19], FRAME = [0.10, 0.10, 0.11];

export class Kisvasut {
  constructor(data, demAt) {
    // [[east, north], …], resampled to 5 m so the height follows the ground
    // between OSM's nodes (a straight can be hundreds of metres long)
    this.pts = [];
    const src = data.pts;
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1], b = src[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
      for (let k = 0; k < n; k++) this.pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    this.pts.push(src[src.length - 1]);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++)
      this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i][0] - this.pts[i - 1][0], this.pts[i][1] - this.pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this.stops = data.stops || [];                     // [{name, s}]
    // the rail height: the ground smoothed over ±20 m so the train does not
    // bob over a 26 m DEM, but never below the ground itself (the line runs
    // along valley sides, where an average sinks into the hill)
    const raw = this.pts.map(p => demAt(p[0], p[1]));
    this.ys = raw.map((r, i) => {
      let s = 0, n = 0;
      for (let k = Math.max(0, i - 4); k <= Math.min(raw.length - 1, i + 4); k++)
        if (isFinite(raw[k])) { s += raw[k]; n++; }
      return n ? Math.max(s / n, isFinite(r) ? r : -1e9) + 0.35 : NaN;
    });
  }
  at(s) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 1, hi = this.cum.length - 1;           // first i with cum[i] >= s
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cum[m] < s) lo = m + 1; else hi = m; }
    const i = lo;
    const u = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
    const a = this.pts[i - 1], b = this.pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * u, n: a[1] + dy * u, y: this.ys[i - 1] + (this.ys[i] - this.ys[i - 1]) * u,
             fx: dx / L, fn: dy / L };
  }
  /** Where the train is at time t (seconds of the day): position of its
   *  front along the line, and which way it faces. */
  where(t) {
    const run = this.len / 5.0, dwell = 900, cycle = 2 * (run + dwell);
    const day0 = 8.5 * 3600, day1 = 18.5 * 3600;          // it runs in daylight
    const tt = Math.max(day0, Math.min(day1, t)) - day0;
    const c = tt % cycle;
    if (c < dwell) return { s: 0, dir: 1, v: 0 };
    if (c < dwell + run) return { s: (c - dwell) * 5.0, dir: 1, v: 5 };
    if (c < 2 * dwell + run) return { s: this.len, dir: -1, v: 0 };
    return { s: this.len - (c - 2 * dwell - run) * 5.0, dir: -1, v: 5 };
  }
  /** The track (static): 760 mm on a narrow ballast bed. */
  track() {
    const V = [], C = [];
    const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
    for (let s = 0; s + 2 <= this.len; s += 2) {
      const a = this.at(s), b = this.at(s + 2);
      if (!isFinite(a.y) || !isFinite(b.y)) continue;
      const nx = -a.fn, nn = a.fx;
      const P = (q, o, up) => [q.x + nx * o, q.y + up, q.n + nn * o];
      // a low bank: the top a hand above the ground, the shoulders into it
      quad(P(a, -1.0, -0.12), P(b, -1.0, -0.12), P(b, 1.0, -0.12), P(a, 1.0, -0.12), [0.40, 0.37, 0.32]);
      quad(P(a, -1.9, -0.9), P(b, -1.9, -0.9), P(b, -1.0, -0.12), P(a, -1.0, -0.12), [0.36, 0.33, 0.28]);
      quad(P(a, 1.0, -0.12), P(b, 1.0, -0.12), P(b, 1.9, -0.9), P(a, 1.9, -0.9), [0.36, 0.33, 0.28]);
      for (const g of [-0.38, 0.38])
        quad(P(a, g - 0.04, 0.02), P(b, g - 0.04, 0.02), P(b, g + 0.04, 0.02), P(a, g + 0.04, 0.02), [0.30, 0.25, 0.22]);
    }
    return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
  }
  /** The train at time t. */
  train(t) {
    const { s, dir } = this.where(t);
    const V = [], C = [];
    const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
    // a box between two chainages, width w, from y0 to y1 above the rail
    const box = (s0, s1, w, y0, y1, col, top) => {
      const a = this.at(s0), b = this.at(s1);
      if (!isFinite(a.y) || !isFinite(b.y)) return;
      const nx = -a.fn, nn = a.fx;
      const P = (q, o, up) => [q.x + nx * o, q.y + up, q.n + nn * o];
      quad(P(a, -w, y0), P(b, -w, y0), P(b, -w, y1), P(a, -w, y1), col);
      quad(P(a, w, y0), P(b, w, y0), P(b, w, y1), P(a, w, y1), col);
      quad(P(a, -w, y0), P(a, w, y0), P(a, w, y1), P(a, -w, y1), col);
      quad(P(b, -w, y0), P(b, w, y0), P(b, w, y1), P(b, -w, y1), col);
      quad(P(a, -w, y1), P(b, -w, y1), P(b, w, y1), P(a, w, y1), top || col);
    };
    // the loco leads going up; coming down it is at the front again (it runs round)
    const f = s, back = -dir;                           // chainage of the front, and "backwards"
    const S = (d) => f + back * d;                      // a point d metres behind the front
    const seg = (d0, d1) => dir > 0 ? [S(d1), S(d0)] : [S(d0), S(d1)];
    // Mk48: bonnet in front, cab behind, 6.8 m
    let [a, b] = seg(0, 4.3); box(a, b, 1.0, 0.45, 2.05, LOCO, ROOF);
    [a, b] = seg(0, 0.12); box(a, b, 0.62, 0.9, 1.9, ORANGE);                 // the grille's frame
    [a, b] = seg(0, 0.18); box(a, b, 1.05, 0.25, 0.62, YELLOW);               // buffer beam
    [a, b] = seg(0.02, 0.2); box(a, b, 0.3, 0.26, 0.6, BLACK);
    [a, b] = seg(4.3, 6.8); box(a, b, 1.05, 0.45, 2.9, LOCO, ROOF);
    [a, b] = seg(4.6, 6.5); box(a, b, 1.07, 1.75, 2.45, WIN);
    [a, b] = seg(0.4, 6.4); box(a, b, 0.95, 0.12, 0.45, FRAME);
    // three coaches, 10 m each, half a metre apart
    for (let k = 0; k < 3; k++) {
      const c0 = 7.3 + k * 10.5, c1 = c0 + 10;
      [a, b] = seg(c0, c1);
      const open = k === 2;
      box(a, b, 1.05, 0.2, 0.55, FRAME);
      box(a, b, 1.08, 0.55, 1.35, COACH);
      box(a, b, 1.09, 1.0, 1.12, ORANGE);                                     // the orange band
      if (!open) box(a, b, 1.06, 1.35, 2.35, WIN);
      else for (let p = 0; p <= 4; p++) { const [q0, q1] = seg(c0 + p * 2.4, c0 + p * 2.4 + 0.18); box(q0, q1, 1.05, 1.35, 2.35, COACH); }
      box(a, b, 1.12, 2.35, 2.62, ROOF);
    }
    return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
  }
}
