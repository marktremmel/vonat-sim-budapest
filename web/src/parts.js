// OSM 3D building parts ("Simple 3D Buildings"). Where mappers have modelled
// a building part by part — the Parliament in 112 of them, the Bazilika in
// 16, Matthias Church's tower, the Opera — each part is a footprint with its
// own height, min_height, roof shape and colours, and this draws exactly
// that. It replaces the hand models for the buildings the data covers
// (bake_context.py drops the model and the plain outline).
//
// Roof shapes: flat; pyramidal and cone (apex over the centroid); dome, round
// and onion (rings on a circular profile, the onion bulging past the wall);
// everything else (gabled, hipped, mansard …) as a hipped roof on the part's
// principal axis, which is what most of them look like from a train.

const WALL_DEF = [0.80, 0.75, 0.64], ROOF_DEF = [0.34, 0.35, 0.37], DOME_DEF = [0.40, 0.52, 0.48];

export function buildParts(parts, demAt) {
  const V = [], C = [], N = [], I = [];
  let info = [0, 0, 0, 0];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]);
                             I.push(info[0], info[1], info[2], info[3]); };
  const tri = (a, b, c, col) => {
    push(a, col); push(b, col); push(c, col);
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = -(b[2]-a[2]);
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = -(c[2]-a[2]);
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    for (let i = 0; i < 3; i++) N.push(nx / L, ny / L, nz / L);
  };
  const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
  if (!parts || !parts.length) return { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };

  // One ground for a whole building. Parts that touch are one building, and
  // the terrain is a surface model, so under a 120 m wide Parliament the
  // "ground" in the middle can be half-way up the roof: the lowest ground
  // round the edge of the whole cluster is the street.
  const P = parts.map(p => {
    const pts = [];
    for (let i = 0; i < p.p.length; i += 2) pts.push([p.x + p.p[i] / 10, p.y + p.p[i + 1] / 10]);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return { ...p, pts, bb: [x0, y0, x1, y1] };
  });
  const parent = P.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const grid = new Map();
  P.forEach((p, i) => {
    const k = Math.floor(p.x / 150) + "," + Math.floor(p.y / 150);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const j of grid.get((Math.floor(p.x / 150) + dx) + "," + (Math.floor(p.y / 150) + dy)) || []) {
        const a = p.bb, b = P[j].bb;
        if (a[0] < b[2] + 3 && b[0] < a[2] + 3 && a[1] < b[3] + 3 && b[1] < a[3] + 3) {
          const ra = find(i), rb = find(j); if (ra !== rb) parent[ra] = rb;
        }
      }
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const cl = new Map();
  P.forEach((p, i) => { const r = find(i); const b = cl.get(r) || [1e9, 1e9, -1e9, -1e9];
    cl.set(r, [Math.min(b[0], p.bb[0]), Math.min(b[1], p.bb[1]), Math.max(b[2], p.bb[2]), Math.max(b[3], p.bb[3])]); });
  const groundOf = new Map();
  // (the lower quartile of the ring, not its minimum: on Castle Hill the
  // minimum is at the foot of the slope and Matthias Church sank into the
  // plateau it stands on)
  for (const [r, b] of cl) {
    const v = [];
    const m = 8;
    for (let t = 0; t <= 1; t += 0.125) {
      v.push(demAt(b[0] - m + (b[2] - b[0] + 2 * m) * t, b[1] - m), demAt(b[0] - m + (b[2] - b[0] + 2 * m) * t, b[3] + m),
             demAt(b[0] - m, b[1] - m + (b[3] - b[1] + 2 * m) * t), demAt(b[2] + m, b[1] - m + (b[3] - b[1] + 2 * m) * t));
    }
    const f = v.filter(isFinite).sort((a, c) => a - c);
    groundOf.set(r, f.length ? [f[Math.floor(f.length * 0.5)], f[0]] : [NaN, NaN]);
  }

  P.forEach((p, i) => {
    const [g0, gLow] = groundOf.get(find(i));
    if (!isFinite(g0)) return;
    const pts = p.pts, n = pts.length;
    let ext = 0;
    for (const q of pts) ext = Math.max(ext, Math.hypot(q[0] - p.x, q[1] - p.y));
    const span = p.h - p.mh;
    const shape = p.rs;
    const pointy = shape === "pyramidal" || shape === "cone";
    const domed = shape === "dome" || shape === "round" || shape === "onion";
    let rh = p.rh > 0 ? p.rh : 0;
    if (!rh && shape !== "flat" && shape !== "skillion") {
      rh = pointy ? (span > 2.5 * ext ? span * 0.85 : Math.min(span * 0.6, Math.max(3, ext * 1.4)))
         : domed ? Math.min(span, ext * (shape === "onion" ? 1.5 : 1.0))
         : Math.min(span * 0.4, Math.max(2.5, ext * 0.45));
    }
    rh = Math.min(rh, span);
    // a part standing on the ground reaches down to the lowest ground round
    // the building, so the downhill side does not float
    const base = p.mh > 0.5 ? g0 + p.mh : Math.max(gLow, g0 - 12), eave = g0 + p.h - rh, top = g0 + p.h;
    const seed = ((i * 2654435761) >>> 0) % 997 / 997;
    const wc = p.wc || WALL_DEF;
    const rc = p.rc || (domed ? DOME_DEF : ROOF_DEF);
    // the façade shader's windows: storeys from the part's own base
    info = [base, eave - base, 1, seed];         // tall stone-framed windows, own colour
    if (eave - base > 0.25)
      for (let k = 0; k < n; k++) {
        const a = pts[k], b = pts[(k + 1) % n];
        quad([a[0], base, a[1]], [b[0], base, b[1]], [b[0], eave, b[1]], [a[0], eave, a[1]], wc);
      }
    info = [0, 0, 0, 0];
    if (rh < 0.2) {
      for (let k = 0; k + 2 < p.t.length; k += 3) {
        const a = pts[p.t[k]], b = pts[p.t[k + 1]], c = pts[p.t[k + 2]];
        tri([a[0], top, a[1]], [b[0], top, b[1]], [c[0], top, c[1]], rc);
      }
      return;
    }
    if (pointy) {
      for (let k = 0; k < n; k++) {
        const a = pts[k], b = pts[(k + 1) % n];
        tri([a[0], eave, a[1]], [b[0], eave, b[1]], [p.x, top, p.y], rc);
      }
      return;
    }
    if (domed) {
      const R = 6, onion = shape === "onion";
      let prev = pts, prevY = eave;
      for (let r = 1; r <= R; r++) {
        const t = r / R;
        // onion: swells to 1.25 of the wall a third of the way up, then draws in
        const k = onion ? (t < 0.35 ? 1 + 0.25 * Math.sin(t / 0.35 * Math.PI * 0.5) : 1.25 * Math.cos((t - 0.35) / 0.65 * Math.PI * 0.5))
                        : Math.cos(t * Math.PI * 0.5);
        const y = eave + (onion ? t : Math.sin(t * Math.PI * 0.5)) * rh;
        const ring = pts.map(q => [p.x + (q[0] - p.x) * k, p.y + (q[1] - p.y) * k]);
        const sh = 0.9 + t * 0.16;
        const col = [rc[0] * sh, rc[1] * sh, rc[2] * sh];
        for (let j = 0; j < n; j++) {
          const a = prev[j], b = prev[(j + 1) % n], c = ring[(j + 1) % n], d = ring[j];
          quad([a[0], prevY, a[1]], [b[0], prevY, b[1]], [c[0], y, c[1]], [d[0], y, d[1]], col);
        }
        prev = ring; prevY = y;
      }
      return;
    }
    // hipped (gabled, mansard and the rest): the ring drawn in to a ridge on
    // the principal axis
    let sxx = 0, syy = 0, sxy = 0;
    for (const q of pts) { const dx = q[0] - p.x, dy = q[1] - p.y; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ca = Math.cos(ang), sa = Math.sin(ang);
    let umax = 0, vmax = 0;
    for (const q of pts) {
      const dx = q[0] - p.x, dy = q[1] - p.y;
      umax = Math.max(umax, Math.abs(dx * ca + dy * sa)); vmax = Math.max(vmax, Math.abs(-dx * sa + dy * ca));
    }
    const lim = Math.max(0, umax - vmax);
    const ridge = pts.map(q => {
      const dx = q[0] - p.x, dy = q[1] - p.y;
      const u = Math.max(-lim, Math.min(lim, dx * ca + dy * sa));
      return [p.x + u * ca, p.y + u * sa];
    });
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n], c = ridge[(k + 1) % n], d = ridge[k];
      quad([a[0], eave, a[1]], [b[0], eave, b[1]], [c[0], top, c[1]], [d[0], top, d[1]], rc);
    }
  });
  return { verts: new Float32Array(V), cols: new Float32Array(C), nrms: new Float32Array(N),
           info: new Float32Array(I), count: V.length / 3 };
}
