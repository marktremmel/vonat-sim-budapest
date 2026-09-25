// The collision world: every building footprint, building part and tall
// structure as a solid, from the same data the meshes are built from, in a
// 25 m grid so a query only looks at what is near. The car slides along
// walls, the plane and the drone crash into them, the helicopter can land
// on a roof.
//
// Coordinates are the baked frame: (east, north) in metres, heights in
// metres above the datum like everything else (y up).
//
// A solid is a polygon or a circle with a bottom (y0) and a top (y1). An
// arch or a part that starts above the ground (the Parliament's upper
// storeys over its gateways) has y0 above the street, and you can pass
// under it.

const CELL = 25;
const key = (i, j) => i * 65536 + j;

export class Solids {
  constructor() {
    this.grid = new Map();       // cell key -> [solid]
    this.byOwner = new Map();    // owner -> [solid]
    this.count = 0;
  }

  _insert(s, owner) {
    s.owner = owner;
    const i0 = Math.floor(s.minx / CELL), i1 = Math.floor(s.maxx / CELL);
    const j0 = Math.floor(s.minn / CELL), j1 = Math.floor(s.maxn / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4000) return;       // nothing is 1.5 km across
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      let a = this.grid.get(k); if (!a) this.grid.set(k, a = []);
      a.push(s);
    }
    let o = this.byOwner.get(owner); if (!o) this.byOwner.set(owner, o = []);
    o.push(s);
    this.count++;
  }

  /** pts: [[east, north], …] (any winding), from y0 to y1. */
  addPoly(pts, y0, y1, owner = "base") {
    if (pts.length < 3 || !(y1 > y0)) return;
    const n = pts.length;
    const xs = new Float32Array(n * 2);
    let minx = Infinity, maxx = -Infinity, minn = Infinity, maxn = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = pts[k][0], y = pts[k][1];
      xs[k * 2] = x; xs[k * 2 + 1] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < minn) minn = y; if (y > maxn) maxn = y;
    }
    this._insert({ poly: xs, minx, maxx, minn, maxn, y0, y1 }, owner);
  }
  /** A rotated box as baked (centre, half sizes along u and v, angle). */
  addBox(cx, cn, hu, hv, ang, y0, y1, owner = "base") {
    const c = Math.cos(ang), s = Math.sin(ang);
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
      [cx + u * hu * c - v * hv * s, cn + u * hu * s + v * hv * c]);
    this.addPoly(P, y0, y1, owner);
  }
  addCircle(x, n, r, y0, y1, owner = "base") {
    this._insert({ cx: x, cn: n, r, minx: x - r, maxx: x + r, minn: n - r, maxn: n + r, y0, y1 }, owner);
  }
  removeOwner(owner) {
    const list = this.byOwner.get(owner);
    if (!list) return;
    const gone = new Set(list);
    for (const s of list) {
      const i0 = Math.floor(s.minx / CELL), i1 = Math.floor(s.maxx / CELL);
      const j0 = Math.floor(s.minn / CELL), j1 = Math.floor(s.maxn / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = key(i, j), a = this.grid.get(k);
        if (!a) continue;
        const b = a.filter(q => !gone.has(q));
        if (b.length) this.grid.set(k, b); else this.grid.delete(k);
      }
    }
    this.count -= list.length;
    this.byOwner.delete(owner);
  }

  /** Solids whose cells a circle of radius r at (x, n) touches. */
  near(x, n, r = 0) {
    const out = new Set();
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((n - r) / CELL), j1 = Math.floor((n + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.grid.get(key(i, j));
      if (a) for (const s of a) out.add(s);
    }
    return out;
  }

  /** The solid at a point, or null. */
  at(x, y, n) {
    for (const s of this.near(x, n)) {
      if (y < s.y0 || y > s.y1) continue;
      if (x < s.minx || x > s.maxx || n < s.minn || n > s.maxn) continue;
      if (s.poly ? inside(s.poly, x, n) : Math.hypot(x - s.cx, n - s.cn) < s.r) return s;
    }
    return null;
  }
  /** The highest top under a point (a roof to land on), or -Infinity. */
  topAt(x, n) {
    let top = -Infinity;
    for (const s of this.near(x, n)) {
      if (x < s.minx || x > s.maxx || n < s.minn || n > s.maxn) continue;
      if (s.poly ? inside(s.poly, x, n) : Math.hypot(x - s.cx, n - s.cn) < s.r) top = Math.max(top, s.y1);
    }
    return top;
  }

  /**
   * A disc of radius r at height y (standing from y to y + tall) pushed out
   * of every solid it overlaps. Returns {x, n, hit, nx, nn}: where it may
   * be, whether it hit anything, and the wall's outward normal (for a slide
   * and a bounce).
   */
  push(x, n, y, r, tall = 1.5) {
    let hit = false, nx = 0, nn = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.near(x, n, r)) {
        if (y + tall < s.y0 || y > s.y1 - 0.3) continue;    // under an arch, or on top of it
        if (x < s.minx - r || x > s.maxx + r || n < s.minn - r || n > s.maxn + r) continue;
        let px, pn, d, ins;
        if (s.poly) {
          const c = closestOnPoly(s.poly, x, n);
          px = c[0]; pn = c[1]; d = c[2];
          ins = inside(s.poly, x, n);
        } else {
          const dx = x - s.cx, dn = n - s.cn, L = Math.hypot(dx, dn) || 1e-6;
          px = s.cx + dx / L * s.r; pn = s.cn + dn / L * s.r;
          d = Math.abs(L - s.r); ins = L < s.r;
        }
        if (!ins && d >= r) continue;
        // outward direction: from the wall to the centre, or through the wall if inside
        let ux = x - px, un = n - pn, L = Math.hypot(ux, un);
        if (L < 1e-6) { ux = 1; un = 0; L = 1; }
        ux /= L; un /= L;
        if (ins) { ux = -ux; un = -un; }
        const depth = ins ? d + r : r - d;
        x += ux * (depth + 0.01); n += un * (depth + 0.01);
        nx = ux; nn = un; hit = moved = true;
      }
      if (!moved) break;
    }
    return { x, n, hit, nx, nn };
  }
}

function inside(p, x, y) {
  let c = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function closestOnPoly(p, x, y) {
  let best = Infinity, bx = 0, by = 0;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = p[j * 2], ay = p[j * 2 + 1], ex = p[i * 2] - ax, ey = p[i * 2 + 1] - ay;
    const L2 = ex * ex + ey * ey || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2));
    const qx = ax + ex * t, qy = ay + ey * t, d = Math.hypot(x - qx, y - qy);
    if (d < best) { best = d; bx = qx; by = qy; }
  }
  return [bx, by, best];
}
