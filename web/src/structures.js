// ------------------------------------------------------------ structures
//
// The freestanding things: chimneys, silos, tanks, water towers, lattice
// masts, yard lighting. None of these existed in this project's data until
// the day someone noticed that every context query filters on
// `["building"]` — a chimney is not a building, it is a `man_made=chimney`,
// so the corridor's whole vertical vocabulary had simply never been asked
// for. There are 201 of them within 2.4 km of the line.
//
// They matter out of proportion to their footprint. A works reads as a works
// because of its chimney; the Rákospalota incinerator's 120 m stack and the
// FŐTÁV chimney at 203 m are landmarks of this railway that you can see for
// ten minutes at a time, and neither was there.
//
// Heights are the honest part and the guessed part both. Seven of the
// forty-three chimneys carry a `height` tag and those are used as given. For
// the rest the height comes from the kind and then from the size of the site
// the thing stands in — a chimney in a 1.4 km² cement works is not the
// chimney of a boiler house behind a school. `bake_context.py` does that
// reasoning; by the time it reaches here a structure is a position, a height
// and a radius.

const CLS_CHIMNEY = 0, CLS_SILO = 1, CLS_TANK = 2, CLS_WATER = 3,
      CLS_LATTICE = 4, CLS_LIGHT = 5, CLS_CRANE = 6, CLS_PYLON = 7, CLS_TV = 8;

const ST_BRICK  = [0.42, 0.29, 0.24];
const ST_BAND   = [0.72, 0.71, 0.68];
const ST_CONC   = [0.63, 0.62, 0.59];
const ST_STEEL  = [0.44, 0.45, 0.46];
const ST_STEEL2 = [0.32, 0.33, 0.34];
const ST_PAINT  = [0.55, 0.20, 0.16];
const ST_RED    = [0.62, 0.16, 0.13];   // the aviation red of a mast
const ST_WHITE  = [0.80, 0.79, 0.76];
const ST_CABLE  = [0.22, 0.23, 0.25];
const ST_INSUL  = [0.86, 0.88, 0.90];

export function unpackStructures(b64, count) {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dv = new DataView(raw.buffer);
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = i * 14;
    out.push({ x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true),
               h: dv.getUint16(o + 8, true) / 10,
               r: dv.getUint16(o + 10, true) / 10,
               cls: dv.getUint16(o + 12, true) });
  }
  return out;
}

export function buildStructures(list, demAt) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };

  // A drum: n sides, tapering from r0 at w0 to r1 at w1. Eight sides is
  // enough — these are seen from hundreds of metres and the facets are what
  // give a cylinder its shading under flat lighting anyway.
  const drum = (x, z, g, r0, r1, w0, w1, col, n = 8, bands = 0) => {
    const P = (k, r, w) => [x + Math.cos(k) * r, g + w, z + Math.sin(k) * r];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      if (bands > 0) {
        // painted bands up a chimney, which is most of how you read its height
        for (let s = 0; s < bands; s++) {
          const t0 = s / bands, t1 = (s + 1) / bands;
          const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
          const wa = w0 + (w1 - w0) * t0, wb = w0 + (w1 - w0) * t1;
          quad(P(a, ra, wa), P(b, ra, wa), P(b, rb, wb), P(a, rb, wb),
               (s % 2 && s > bands - 5) ? ST_PAINT : col);
        }
      } else {
        quad(P(a, r0, w0), P(b, r0, w0), P(b, r1, w1), P(a, r1, w1), col);
      }
    }
    // cap, so a tank is not an open pipe seen from a hillside
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
      push(P(a, r1, w1), col); push(P(b, r1, w1), col);
      push([x, g + w1, z], col);
    }
  };

  // Four legs drawing in toward the top with cross bracing — a lattice mast
  // reads by its taper and by being see-through, so the bracing is drawn as
  // separate thin diagonals rather than a solid skin.
  // A radio mast, which is a different animal from a chimney and was being
  // drawn as one. Four legs drawing in toward the top, cross bracing on every
  // face, and — the thing that makes it read at any distance — the aviation
  // banding: alternate sections red and white up the whole height. The legs
  // and the bracing are separate thin quads, so the sky comes through it, and
  // seeing through it is half of what says "mast" rather than "tower".
  const lattice = (x, z, g, r0, r1, h, banded) => {
    const leg = (k) => [Math.cos(k), Math.sin(k)];
    const K = [0.25, 0.75, 1.25, 1.75].map(v => v * Math.PI);
    const SEG = Math.max(6, Math.round(h / 5));
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG, t1 = (s + 1) / SEG;
      const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
      const wa = h * t0, wb = h * t1;
      // seven bands is the usual marking on a tall mast; short ones stay grey
      const col = banded ? (Math.floor(s * 7 / SEG) % 2 ? ST_WHITE : ST_RED) : ST_STEEL;
      const brace = banded ? col : ST_STEEL2;
      for (let i = 0; i < 4; i++) {
        const [cx, cz] = leg(K[i]);
        const [nx2, nz2] = leg(K[(i + 1) % 4]);
        const wdt = Math.max(0.07, r0 * 0.09);
        quad([x + cx*ra - wdt, g + wa, z + cz*ra], [x + cx*ra + wdt, g + wa, z + cz*ra],
             [x + cx*rb + wdt, g + wb, z + cz*rb], [x + cx*rb - wdt, g + wb, z + cz*rb], col);
        // the diagonal, drawn both ways so the bracing reads as a lattice
        // rather than as a spiral
        const d = (s % 2) ? [nx2, nz2, cx, cz] : [cx, cz, nx2, nz2];
        quad([x + d[0]*ra, g + wa, z + d[1]*ra], [x + d[2]*rb, g + wb, z + d[3]*rb],
             [x + d[2]*rb, g + wb + 0.16, z + d[3]*rb], [x + d[0]*ra, g + wa + 0.16, z + d[1]*ra],
             brace);
        // a horizontal ring at each section joint
        quad([x + cx*rb, g + wb - 0.09, z + cz*rb], [x + nx2*rb, g + wb - 0.09, z + nz2*rb],
             [x + nx2*rb, g + wb + 0.09, z + nz2*rb], [x + cx*rb, g + wb + 0.09, z + cz*rb],
             brace);
      }
    }
    // the aerials at the top, which is the point of the whole thing
    if (banded) {
      const tip = g + h;
      quad([x - 0.10, tip, z], [x + 0.10, tip, z],
           [x + 0.10, tip + h * 0.14, z], [x - 0.10, tip + h * 0.14, z], ST_WHITE);
      for (const o of [-1, 1]) {
        quad([x + o * r1 * 1.9, tip - h * 0.06, z - 0.1],
             [x + o * r1 * 1.9, tip - h * 0.06, z + 0.1],
             [x, tip - h * 0.02, z + 0.1], [x, tip - h * 0.02, z - 0.1], ST_STEEL);
      }
    }
  };

  // each pylon's line direction: from its two nearest neighbours (50–380 m)
  {
    const py = (list || []).filter(s => s.cls === CLS_PYLON);
    for (const s of py) {
      const nb = py.filter(o => o !== s).map(o => ({ o, d: Math.hypot(o.x - s.x, o.y - s.y) }))
                   .filter(n => n.d >= 50 && n.d <= 380).sort((a, b) => a.d - b.d).slice(0, 2);
      let dx = 0, dy = 0;
      for (const { o, d } of nb) {
        let ux = (o.x - s.x) / d, uy = (o.y - s.y) / d;
        if (ux * dx + uy * dy < 0) { ux = -ux; uy = -uy; }        // both neighbours, one direction
        dx += ux; dy += uy;
      }
      const L = Math.hypot(dx, dy);
      if (L > 1e-3) { s.ax = dx / L; s.ay = dy / L; }
    }
  }
  for (const s of list || []) {
    const g = demAt(s.x, s.y);
    if (!isFinite(g)) continue;
    const gy = g - 0.6;
    switch (s.cls) {
      case CLS_CHIMNEY:
        // tapered, brick below and banded above — the banding is the aircraft
        // marking on the tall ones and simply how a stack looks on the rest
        drum(s.x, s.y, gy, s.r * 1.35, s.r * 0.78, 0, s.h,
             s.h > 55 ? ST_CONC : ST_BRICK, 8, s.h > 40 ? 10 : 0);
        break;
      case CLS_SILO:
        drum(s.x, s.y, gy, s.r, s.r, 0, s.h, ST_CONC, 10);
        drum(s.x, s.y, gy, s.r * 1.06, s.r * 0.55, s.h, s.h + s.r * 0.5, ST_STEEL, 10);
        break;
      case CLS_TANK:
        drum(s.x, s.y, gy, s.r, s.r, 0, s.h, ST_BAND, 12);
        drum(s.x, s.y, gy, s.r * 1.02, s.r * 0.72, s.h, s.h + s.r * 0.18, ST_BAND, 12);
        break;
      case CLS_WATER: {
        // a shaft with the tank sitting on it, which is the silhouette that
        // says water tower from two kilometres away
        const shaft = s.h * 0.62;
        drum(s.x, s.y, gy, s.r * 0.42, s.r * 0.38, 0, shaft, ST_CONC, 8);
        drum(s.x, s.y, gy, s.r * 0.55, s.r, shaft, shaft + s.h * 0.10, ST_CONC, 10);
        drum(s.x, s.y, gy, s.r, s.r * 0.92, shaft + s.h * 0.10, s.h, ST_BAND, 10);
        break;
      }
      case CLS_CRANE: {
        // a shipyard / harbour portal crane (Népsziget): a four-legged portal,
        // the machinery house on top and a long jib raised at an angle —
        // rusty, because the yard is not what it was
        const RUST = [0.46, 0.30, 0.20], CAB = [0.62, 0.52, 0.30];
        const a = ((s.x * 0.013 + s.y * 0.007) % (Math.PI * 2));
        const ca = Math.cos(a), sa = Math.sin(a);
        const P = (u, v, h) => [s.x + u * ca - v * sa, gy + h, s.y + u * sa + v * ca];
        const beam = (p0, p1, w, col) => {
          quad([p0[0] - w, p0[1], p0[2]], [p1[0] - w, p1[1], p1[2]], [p1[0] + w, p1[1], p1[2]], [p0[0] + w, p0[1], p0[2]], col);
          quad([p0[0], p0[1], p0[2] - w], [p1[0], p1[1], p1[2] - w], [p1[0], p1[1], p1[2] + w], [p0[0], p0[1], p0[2] + w], col);
        };
        const legH = 9;
        for (const [u, v] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) beam(P(u, v, 0), P(u * 0.4, v * 0.4, legH), 0.35, RUST);
        beam(P(-3, -3, legH * 0.5), P(3, 3, legH * 0.5), 0.2, RUST);
        beam(P(3, -3, legH * 0.5), P(-3, 3, legH * 0.5), 0.2, RUST);
        const hy = legH;
        quad(P(-2, -1.6, hy), P(2, -1.6, hy), P(2, -1.6, hy + 4), P(-2, -1.6, hy + 4), CAB);
        quad(P(2, 1.6, hy), P(-2, 1.6, hy), P(-2, 1.6, hy + 4), P(2, 1.6, hy + 4), CAB);
        quad(P(-2, -1.6, hy + 4), P(2, -1.6, hy + 4), P(2, 1.6, hy + 4), P(-2, 1.6, hy + 4), RUST);
        quad(P(2, -1.6, hy), P(2, 1.6, hy), P(2, 1.6, hy + 4), P(2, -1.6, hy + 4), CAB);
        quad(P(-2, 1.6, hy), P(-2, -1.6, hy), P(-2, -1.6, hy + 4), P(-2, 1.6, hy + 4), CAB);
        const L = Math.max(18, s.h * 1.2);
        beam(P(1.5, 0, hy + 2), P(1.5 + L * 0.72, 0, hy + 2 + L * 0.69), 0.45, RUST);  // jib
        beam(P(-1.5, 0, hy + 4), P(1.5 + L * 0.72, 0, hy + 2 + L * 0.69), 0.08, ST_CABLE);
        beam(P(1.5 + L * 0.72, 0, hy + 2 + L * 0.69), P(1.5 + L * 0.72, 0, hy + 2 + L * 0.69 - 12), 0.05, ST_CABLE);
        break;
      }
      case CLS_LATTICE:
        // anything over 25 m carries the red and white; a 15 m watchtower in
        // the woods does not
        lattice(s.x, s.y, gy, Math.max(1.6, s.r), Math.max(0.6, s.r * 0.34),
                s.h, s.h > 25);
        break;
      case CLS_LIGHT: {
        // a yard lighting mast: a pole and a head of floods on top
        drum(s.x, s.y, gy, 0.30, 0.18, 0, s.h, ST_STEEL2, 6);
        quad([s.x - 1.5, gy + s.h, s.y - 0.5], [s.x + 1.5, gy + s.h, s.y - 0.5],
             [s.x + 1.5, gy + s.h + 0.9, s.y - 0.5], [s.x - 1.5, gy + s.h + 0.9, s.y - 0.5],
             ST_STEEL);
        quad([s.x - 1.5, gy + s.h, s.y + 0.5], [s.x + 1.5, gy + s.h, s.y + 0.5],
             [s.x + 1.5, gy + s.h + 0.9, s.y + 0.5], [s.x - 1.5, gy + s.h + 0.9, s.y + 0.5],
             ST_STEEL);
        break;
      }
      case CLS_TV: {
        // A concrete TV tower (the Határ út tower, Széchenyi-hegy): a tapering
        // shaft, a two-storey pod of dark glass and railings about two
        // thirds up, and a red and white antenna mast to the top
        const H = s.h, r = Math.max(3.2, s.r);
        drum(s.x, s.y, gy, r, r * 0.72, 0, H * 0.64, ST_CONC, 12);
        drum(s.x, s.y, gy, r * 0.72, r * 2.3, H * 0.64, H * 0.67, ST_CONC, 16);
        drum(s.x, s.y, gy, r * 2.3, r * 2.3, H * 0.67, H * 0.71, [0.16, 0.19, 0.21], 16);
        drum(s.x, s.y, gy, r * 2.4, r * 2.4, H * 0.71, H * 0.715, ST_STEEL2, 16);
        drum(s.x, s.y, gy, r * 2.0, r * 2.0, H * 0.715, H * 0.75, [0.16, 0.19, 0.21], 16);
        drum(s.x, s.y, gy, r * 2.1, r * 0.8, H * 0.75, H * 0.77, ST_CONC, 16);
        drum(s.x, s.y, gy, r * 0.55, r * 0.35, H * 0.77, H * 0.82, ST_CONC, 10);
        for (let b = 0; b < 6; b++)
          drum(s.x, s.y, gy, 0.9, 0.8, H * (0.82 + b * 0.03), H * (0.82 + (b + 1) * 0.03),
               b % 2 ? ST_WHITE : ST_RED, 8);
        break;
      }
      case CLS_PYLON: {
        // High-voltage transmission pylon: steel lattice tower with 2 tiers of
        // wide cantilever crossarms, vertical ceramic insulator strings and top
        // peak. The arms stand ACROSS the line (s.ax, s.ay: the line's
        // direction here, from the neighbouring pylons); they were always
        // east–west, so on a north–south line every pylon stood side-on.
        const r0 = Math.max(3.2, s.r * 0.9), rWaist = 1.15, rTop = 0.85;
        const waistH = s.h * 0.65;
        lattice(s.x, s.y, gy, r0, rWaist, waistH, false);
        lattice(s.x, s.y, gy + waistH, rWaist, rTop, s.h - waistH, false);
        const fx = s.ax || 0, fy = s.ay || 1;             // along the line
        const qx = -fy, qy = fx;                            // across it: the arms
        const A = (u, y, v) => [s.x + qx * u + fx * v, y, s.y + qy * u + fy * v];
        const arm = (w, y, t, th) => {
          quad(A(-w, y, -t), A(w, y, -t), A(w, y + th, -t), A(-w, y + th, -t), ST_STEEL);
          quad(A(-w, y, t), A(w, y, t), A(w, y + th, t), A(-w, y + th, t), ST_STEEL);
        };
        const yArm1 = gy + s.h * 0.74, wArm1 = 8.2;
        arm(wArm1, yArm1, 0.25, 0.9);
        for (const sgn of [-1, 1]) {
          for (const t of [-0.15, 0.15])
            quad(A(sgn * wArm1, yArm1, t), A(sgn * rWaist, gy + waistH + 1.0, t),
                 A(sgn * rWaist, gy + waistH + 1.2, t), A(sgn * wArm1, yArm1 + 0.2, t), ST_STEEL2);
          const p = A(sgn * (wArm1 - 0.5), 0, 0);
          drum(p[0], p[2], yArm1 - 1.8, 0.12, 0.12, 0, 1.8, ST_INSUL, 6);
        }
        const yArm2 = gy + s.h * 0.88, wArm2 = 5.6;
        arm(wArm2, yArm2, 0.22, 0.8);
        for (const sgn of [-1, 1]) {
          const p = A(sgn * (wArm2 - 0.4), 0, 0);
          drum(p[0], p[2], yArm2 - 1.8, 0.12, 0.12, 0, 1.8, ST_INSUL, 6);
        }
        // Earth wire peak
        const tipY = gy + s.h + 2.8;
        quad(A(-0.12, gy + s.h, 0), A(0.12, gy + s.h, 0), A(0.12, tipY, 0), A(-0.12, tipY, 0), ST_STEEL);
        break;
      }
    }
  }

  // Connect adjacent power pylons with high-voltage catenary transmission cables
  const pylons = (list || []).filter(s => s.cls === CLS_PYLON);
  const cableQuad = (p0, p1, thick, col) => {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * thick, nz = dx / L * thick;
    quad([p0[0] - nx, p0[1], p0[2] - nz], [p1[0] - nx, p1[1], p1[2] - nz],
         [p1[0] + nx, p1[1], p1[2] + nz], [p0[0] + nx, p0[1], p0[2] + nz], col);
  };
  for (let i = 0; i < pylons.length; i++) {
    const pA = pylons[i];
    const gA = demAt(pA.x, pA.y);
    if (!isFinite(gA)) continue;
    const nbrs = [];
    for (let j = i + 1; j < pylons.length; j++) {
      const pB = pylons[j];
      const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      if (dist >= 50 && dist <= 380) nbrs.push({ p: pB, d: dist });
    }
    nbrs.sort((a, b) => a.d - b.d);
    for (const { p: pB, d: dist } of nbrs.slice(0, 2)) {
      const gB = demAt(pB.x, pB.y);
      if (!isFinite(gB)) continue;
      const sag = dist * dist * 0.00016 + 1.2;
      const SEGS = 6;
      const att = (p, g, flip) => {
        const qx = -(p.ay || 1) * flip, qy = (p.ax || 0) * flip;
        return [[-7.7, 0.74], [7.7, 0.74], [-5.2, 0.88], [5.2, 0.88]]
          .map(([u, f]) => [p.x + qx * u, g + p.h * f - 1.8, p.y + qy * u])
          .concat([[p.x, g + p.h + 2.8, p.y]]);
      };
      // the same side of both pylons: flip B if its "across" points the other way
      const sameSide = ((pA.ay || 1) * (pB.ay || 1) + (pA.ax || 0) * (pB.ax || 0)) >= 0 ? 1 : -1;
      const pointsA = att(pA, gA, 1), pointsB = att(pB, gB, sameSide);
      for (let k = 0; k < pointsA.length; k++) {
        const ptA = pointsA[k], ptB = pointsB[k];
        for (let s = 0; s < SEGS; s++) {
          const t0 = s / SEGS, t1 = (s + 1) / SEGS;
          const s0 = 4.0 * t0 * (1.0 - t0) * sag, s1 = 4.0 * t1 * (1.0 - t1) * sag;
          const x0 = ptA[0] + (ptB[0] - ptA[0]) * t0, y0 = ptA[1] + (ptB[1] - ptA[1]) * t0 - s0, z0 = ptA[2] + (ptB[2] - ptA[2]) * t0;
          const x1 = ptA[0] + (ptB[0] - ptA[0]) * t1, y1 = ptA[1] + (ptB[1] - ptA[1]) * t1 - s1, z1 = ptA[2] + (ptB[2] - ptA[2]) * t1;
          cableQuad([x0, y0, z0], [x1, y1, z1], 0.07, ST_CABLE);
        }
      }
    }
  }

  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}
