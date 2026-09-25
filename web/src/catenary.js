// -------------------------------------------------------------- catenary
//
// The overhead line. Line 70 is electrified at 25 kV 50 Hz — the desk has a
// meter for it — and until now there was not a wire anywhere on it, which is
// the single largest thing missing from the view out of the cab.
//
// A mast every SPAN metres on the outside of each running line, a cantilever
// reaching over the track, a contact wire hung under a messenger, and
// droppers between the two. The detail that makes it read as a railway
// rather than a line of fence posts is the STAGGER: the contact wire is
// pulled alternately either side of the track centre so the pantograph wears
// evenly across its strip, so from the cab the wire visibly swings from one
// side to the other at every mast. Get that wrong and it looks like a
// telegraph line.
//
// Nothing here is baked. The masts follow the running lines, and the height
// of each one comes from the rail height at its own chainage, so the wire
// climbs and falls with the road and needs no data of its own.

const SPAN_PTS   = 6;        // route points between masts; they are 10 m apart
const CONTACT_H  = 5.50;     // contact wire above rail — the MÁV nominal
const MESSENGER_H = 6.90;    // messenger at the mast
const SAG        = 0.24;     // how far the messenger drops mid-span
const STAGGER    = 0.30;     // contact wire either side of the track centre
const MAST_H     = 8.30;
const MAST_OFF   = 3.35;     // track centre to mast centre
const PORTAL_MIN = 14.0;     // a yard this wide gets a portal, not a mast

const STEEL  = [0.35, 0.35, 0.34];
const STEEL2 = [0.28, 0.28, 0.27];
const WIRE   = [0.30, 0.27, 0.23];   // weathered copper, not black
// Wire radii. Thick enough to survive the low internal resolution (see the
// note in buildCatenary), but they were twice this, and contact wire,
// messenger and droppers together read as a bundle of black cables.
const R_CONTACT = 0.055, R_MESS = 0.05, R_DROP = 0.028;
const PORC   = [0.44, 0.29, 0.21];

/**
 * @param downPts,upPts  the two running lines, [east, north, railY, chainage]
 *                       every 10 m
 * @param yardSpan       m -> [offMin, offMax] of the yard tracks at that
 *                       chainage, or null where there is no yard. Where a
 *                       yard is wide the masts are replaced by a portal
 *                       across the whole formation, which is what MÁV does.
 */
export function buildCatenary(downPts, upPts, yardSpan) {
  const V = [], C = [];
  // world is x east, y up, z south — so north is negated on the way in, as
  // everywhere else that builds geometry from the (east, north) data
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };

  // A wire is 12 mm across and would be invisible drawn to scale, and a
  // single ribbon disappears whenever you see it edge on. Two ribbons in a
  // cross always present a face, which is the cheapest thing that reads from
  // every angle.
  // Wires are drawn THICKER than they are. A 12 mm contact wire is far below
  // one pixel of a 512 x 288 buffer at any distance at all, and a line that
  // covers a third of a pixel does not read as a line — it breaks into a
  // dotted rash, which is what the overhead line looked like down the middle
  // distance. Everything here is drawn at roughly the width it would need to
  // be to survive the sampling, which is a lie about the gauge of the wire
  // and the truth about what a wire looks like.
  const wire = (p0, p1, r, col) => {
    const dx = p1[0]-p0[0], dz = p1[2]-p0[2];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * r, nz = dx / L * r;
    quad([p0[0], p0[1]-r, p0[2]], [p1[0], p1[1]-r, p1[2]],
         [p1[0], p1[1]+r, p1[2]], [p0[0], p0[1]+r, p0[2]], col);
    quad([p0[0]-nx, p0[1], p0[2]-nz], [p1[0]-nx, p1[1], p1[2]-nz],
         [p1[0]+nx, p1[1], p1[2]+nz], [p0[0]+nx, p0[1], p0[2]+nz], col);
  };

  // A single-track line (line 2) bakes the same points for both directions:
  // wire it once, or it gets two sets of masts and two wires in one place.
  const single = upPts.length === downPts.length && upPts.length > 0
    && upPts[0][0] === downPts[0][0] && upPts[0][1] === downPts[0][1];
  for (const [pts, other] of single ? [[downPts, null]] : [[downPts, upPts], [upPts, downPts]]) {
    const isDown = pts === downPts;
    const n = pts.length;
    if (n < SPAN_PTS + 2) continue;
    let k = 0;
    for (let i = 0; i + SPAN_PTS < n; i += SPAN_PTS, k++) {
      const a = pts[i], b = pts[i + SPAN_PTS];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      if (!(L > 1)) continue;
      const fx = dx / L, fy = dy / L, nx = -fy, ny = fx;

      // Which side is the other running line on? The mast goes on the far
      // side of its own track, or it would stand between the two.
      let side = 1, best = 1e9;
      for (let j = Math.max(0, i - 12); other && j < Math.min(other.length, i + 12); j++) {
        const o = other[j];
        const d = Math.hypot(o[0] - a[0], o[1] - a[1]);
        if (d < best) {
          best = d;
          side = ((o[0]-a[0])*nx + (o[1]-a[1])*ny) > 0 ? -1 : 1;
        }
      }

      // a point at (offset across the track, height above rail) at either end
      const P = (p, off, up) => [p[0] + nx * off, p[2] + up, p[1] + ny * off];
      const stagA = (k % 2 ? 1 : -1) * STAGGER;
      const stagB = (k % 2 ? -1 : 1) * STAGGER;

      // ---- the mast, and the arm that reaches over the track
      const yard = yardSpan ? yardSpan(a[3]) : null;
      const wide = yard && (yard[1] - yard[0]) > PORTAL_MIN;
      if (!wide) {
        const o = side * MAST_OFF;
        // an H-section reads as two crossed plates; a box would be four
        // faces to say the same thing
        const foot = -0.30, top = MAST_H;
        quad(P(a, o - 0.16, foot), P(a, o + 0.16, foot),
             P(a, o + 0.11, top), P(a, o - 0.11, top), STEEL);
        const e = 0.15;
        quad([a[0] + nx*o - fx*e, a[2] + foot, a[1] + ny*o - fy*e],
             [a[0] + nx*o + fx*e, a[2] + foot, a[1] + ny*o + fy*e],
             [a[0] + nx*o + fx*e*0.7, a[2] + top, a[1] + ny*o + fy*e*0.7],
             [a[0] + nx*o - fx*e*0.7, a[2] + top, a[1] + ny*o - fy*e*0.7], STEEL2);
        // cantilever tube out to the track centre, and the registration arm
        // below it that actually holds the contact wire off to one side
        wire(P(a, o, MESSENGER_H + 0.55), P(a, 0, MESSENGER_H), 0.11, STEEL);
        wire(P(a, o * 0.55, CONTACT_H + 0.62), P(a, stagA, CONTACT_H + 0.05), 0.085, STEEL2);
        // the insulator, which is the one brown thing up there
        wire(P(a, o * 0.90, MESSENGER_H + 0.30), P(a, o * 0.72, MESSENGER_H + 0.18),
             0.085, PORC);
      } else {
        // A yard is too wide to reach across: a portal on legs outside the
        // whole formation — a keretszerkezet, which is what stands over the
        // Nyugati throat. The offsets are measured from the down line, so
        // the down line draws the structure and the up line only hangs its
        // own wire from it, or there would be two portals in the same place.
        const top = MAST_H + 0.9;
        if (isDown) {
          const o0 = yard[0] - 2.4, o1 = yard[1] + 2.4;
          for (const o of [o0, o1]) {
            quad(P(a, o - 0.19, -0.30), P(a, o + 0.19, -0.30),
                 P(a, o + 0.13, top), P(a, o - 0.13, top), STEEL);
          }
          wire(P(a, o0, top - 0.35), P(a, o1, top - 0.35), 0.14, STEEL);
          wire(P(a, o0, top - 1.15), P(a, o1, top - 1.15), 0.10, STEEL2);
        }
        wire(P(a, stagA, MESSENGER_H + 0.30), P(a, stagA, top - 1.15), 0.06, STEEL2);
      }

      // ---- the wires themselves
      wire(P(a, stagA, CONTACT_H), P(b, stagB, CONTACT_H), R_CONTACT, WIRE);
      // The messenger sags; the contact wire does not, which is the whole
      // point of hanging one under the other.
      const SEG = 3;
      for (let s = 0; s < SEG; s++) {
        const t0 = s / SEG, t1 = (s + 1) / SEG;
        const sag = (t) => MESSENGER_H - SAG * 4 * t * (1 - t);
        const at = (t) => {
          const p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t,
                     a[2] + (b[2]-a[2])*t, 0];
          return P(p, 0, sag(t));
        };
        wire(at(t0), at(t1), R_MESS, WIRE);
      }
      for (const t of [0.33, 0.66]) {
        const p = [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t,
                   a[2] + (b[2]-a[2])*t, 0];
        const top = MESSENGER_H - SAG * 4 * t * (1 - t);
        wire(P(p, 0, top), P(p, stagA + (stagB - stagA) * t, CONTACT_H), R_DROP, WIRE);
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

/** Wires over the station and yard tracks. Only the two running lines were
 *  wired, so at every station the overhead line stopped making sense: the
 *  loops and sidings under the portals had nothing over them. Each standard
 *  gauge yard track more than 6 m from the down line (the running lines are
 *  wired already) and inside the corridor gets a contact wire and a
 *  messenger; the portals over wide yards are what they hang from. */
export function buildYardWires(ways, railYAt) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };
  const wire = (p0, p1, r) => {
    const dx = p1[0]-p0[0], dz = p1[2]-p0[2];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * r, nz = dx / L * r;
    quad([p0[0], p0[1]-r, p0[2]], [p1[0], p1[1]-r, p1[2]], [p1[0], p1[1]+r, p1[2]], [p0[0], p0[1]+r, p0[2]], WIRE);
    quad([p0[0]-nx, p0[1], p0[2]-nz], [p1[0]-nx, p1[1], p1[2]-nz], [p1[0]+nx, p1[1], p1[2]+nz], [p0[0]+nx, p0[1], p0[2]+nz], WIRE);
  };
  for (const w of ways) {
    if (w.cls !== 0) continue;                       // rail only: not disused, not narrow gauge
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const a = w.pts[i], b = w.pts[i + 1];
      if (a[3] < 6 || b[3] < 6 || a[3] > 60 || b[3] > 60) continue;
      const ya = railYAt(a[2], a), yb = railYAt(b[2], b);
      wire([a[0], ya + CONTACT_H, a[1]], [b[0], yb + CONTACT_H, b[1]], R_CONTACT);
      wire([a[0], ya + MESSENGER_H, a[1]], [b[0], yb + MESSENGER_H, b[1]], R_MESS);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}
