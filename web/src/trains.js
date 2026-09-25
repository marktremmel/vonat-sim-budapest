// The rolling stock. Four classes, told apart by silhouette.
// --------------------------------------------------------- train geometry
//
// Four classes, told apart by silhouette, because that is all you get from a
// moving cab. KISS: tall and flat-roofed, two rows of windows between the
// bogies and one mezzanine row over them. FLIRT: long, low, flat, articulated.
// EC: a locomotive and a rake of coaches at one height. FREIGHT: a locomotive
// and a mixture of wagons.
//
// Panels are TILED, never stacked. An earlier version drew the windows and
// doors as quads floating a centimetre proud of the body side, which z-fights
// at anything past a hundred metres and turned a container into a field of
// speckle. Every surface here is cut into abutting pieces instead, so nothing
// is ever coplanar with anything else.

export const CAR_LEN = { KISS: 25.0, FLIRT: 18.5, EC: 26.4, FREIGHT: 14.5 };
export const CAR_H   = { KISS: 4.60, FLIRT: 4.12, EC: 4.05, FREIGHT: 3.90 };
const LOCO_LEN = 19.5;

// How much of its own length a vehicle gives up to the gap at each end. A
// Stadler unit is close-coupled with a gangway and reads as one train; screw
// couplings and buffers leave a real gap you can see daylight through.
const COUPLE = { KISS: 0.494, FLIRT: 0.494, EC: 0.481, FREIGHT: 0.472 };

// MÁV liveries. The suburban Stadlers are white over blue with yellow doors —
// the doors are the most recognisable thing about them at any distance.
const LIVERY = {
  KISS: { upper: [0.90,0.92,0.94], lower: [0.06,0.33,0.66], door: [0.97,0.78,0.10],
          skirt: [0.40,0.42,0.45], roof: [0.34,0.36,0.38] },
  FLIRT:{ upper: [0.90,0.92,0.94], lower: [0.08,0.36,0.68], door: [0.97,0.78,0.10],
          skirt: [0.40,0.42,0.45], roof: [0.36,0.38,0.40] },
  EC:   { upper: [0.74,0.77,0.81], lower: [0.13,0.20,0.36], door: [0.62,0.66,0.70],
          skirt: [0.22,0.23,0.26], roof: [0.36,0.37,0.39] },
  // V43: blue body over a grey lower band, and a yellow cab front
  LOCO: { upper: [0.18,0.40,0.66], lower: [0.52,0.54,0.54], door: [0.92,0.70,0.12],
          skirt: [0.20,0.20,0.22], roof: [0.32,0.33,0.35] },
  // ÖBB 1116 Taurus: the Budapest-bound freights on line 2 (red, grey roof)
  LOCO_1116: { upper: [0.70,0.12,0.12], lower: [0.70,0.12,0.12], door: [0.86,0.86,0.86],
          skirt: [0.20,0.20,0.22], roof: [0.40,0.41,0.43] },
  // the M44 shunting diesel of the Esztergom – Kertváros trips (colours approximate)
  LOCO_M44: { upper: [0.20,0.34,0.58], lower: [0.20,0.34,0.58], door: [0.92,0.72,0.14],
          skirt: [0.18,0.18,0.19], roof: [0.30,0.31,0.32] },
  FREIGHT:{ upper:[0.34,0.30,0.26], lower:[0.28,0.24,0.20], door:[0.34,0.30,0.26],
          skirt: [0.15,0.14,0.13], roof: [0.30,0.28,0.26] },
};
const GLASS_DAY = [0.18, 0.28, 0.38];
const GLASS     = [0.06, 0.09, 0.12];
const GLASS_LIT = [0.95, 0.88, 0.66];    // above the others, so it blooms at night
const METAL = [0.30, 0.31, 0.33];
const DARK  = [0.13, 0.13, 0.14];
const HEADLAMP = [2.4, 2.3, 2.0];
const TAILLAMP = [1.8, 0.12, 0.10];

/** A cheap, stable per-vehicle random. Seeded from the train's own identity
 *  and the vehicle's index in the rake — never from its position, which
 *  changes every frame and made a freight train shuffle its own wagons. */
function vehRnd(seed, k, salt) {
  let h = (seed * 374761393 + k * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** @param hollow  draw `player` too, without its window glass — passenger
 *                 mode sits inside it and looks out through real openings */
export function buildTrains(traffic, downPts, upPts, player, night = 0, hollow = false, sideOf = null) {
  const V = [], C = [], N = [];
  const glass = [
    GLASS_DAY[0] * (1.0 - night) + GLASS_LIT[0] * night,
    GLASS_DAY[1] * (1.0 - night) + GLASS_LIT[1] * night,
    GLASS_DAY[2] * (1.0 - night) + GLASS_LIT[2] * night,
  ];
  const at0 = (pts, m) => {
    const f = (m - pts[0][3]) / 10;
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const u = f - i, a = pts[i], b = pts[i + 1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]), a[2] + u*(b[2]-a[2])];
  };
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => {
    if (!col) return;                       // a hollow window
    push(a, col); push(b, col); push(c, col);
    push(a, col); push(c, col); push(d, col);
    // points are [east, up, north]; world z is -north
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = -(b[2]-a[2]);
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = -(c[2]-a[2]);
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= L; ny /= L; nz /= L; }
    for (let i = 0; i < 6; i++) N.push(nx, ny, nz);
  };

  for (const t of traffic.trains) {
    if (t === player && !hollow) continue;
    const tGlass = (t === player && hollow) ? null : glass;
    const pts0 = t.dir > 0 ? downPts : upPts;
    // on a single-track line a train crossing another is on the loop track:
    // sideOf(t, m) gives its offset from the running line there (metres,
    // + to the left), so the two do not stand in each other
    const pts = pts0;
    const at = sideOf && t !== player ? (P, m) => {
      const q = at0(P, m), off = sideOf(t, m);
      if (!off) return q;
      const q2 = at0(P, m + 2);
      const dx = q2[0] - q[0], dy = q2[1] - q[1], L = Math.hypot(dx, dy) || 1;
      return [q[0] - dy / L * off, q[1] + dx / L * off, q[2]];
    } : at0;
    const stock = t.stock || "KISS";
    const hauled = stock === "EC" || stock === "FREIGHT";
    const unitLen = CAR_LEN[stock] || 26;
    const tSeed = t.seed || (t.id ? t.id.length * 7919 : 12345);

    let cursor = t.m;
    for (let k = 0; k < t.cars; k++) {
      const isLoco = hauled && k === 0;
      const L = isLoco ? LOCO_LEN : unitLen;
      const c = cursor - t.dir * L * 0.5;
      cursor -= t.dir * L;
      if (c < pts[0][3] + 5 || c > pts[pts.length-1][3] - 5) continue;

      const half = L * (isLoco ? 0.48 : COUPLE[stock]);
      const a = at(pts, c - half), b = at(pts, c + half);
      const dx = b[0]-a[0], dy = b[1]-a[1];
      const seglen = Math.hypot(dx, dy) || 1;
      const ux = dx/seglen, uy = dy/seglen, nx = -uy, ny = ux;
      const g = (a[2] + b[2]) / 2;
      const P = (along, off, up) => [
        a[0] + ux * (along + half) + nx * off,
        g + up,
        a[1] + uy * (along + half) + ny * off,
      ];
      const frontEnd = k === 0 ? t.dir : 0;
      const rearEnd = k === t.cars - 1 ? -t.dir : 0;

      if (isLoco) buildLoco(quad, P, half, stock, tGlass, night, t.loco);
      else if (stock === "FREIGHT")
        buildWagon(quad, P, half, tSeed, k);
      else buildCoach(quad, P, half, stock, k, t.cars, frontEnd, rearEnd, tGlass, night);

      // gangway: what makes a Stadler unit read as one train rather than a
      // line of separate boxes
      if ((stock === "KISS" || stock === "FLIRT") && k < t.cars - 1) {
        const gy0 = 0.85, gy1 = 3.10, gw = 0.92, ext = L * (0.5 - COUPLE[stock]) + 0.02;
        for (const sgn of [-1, 1])
          quad(P(-half - ext, sgn*gw, gy0), P(-half, sgn*gw, gy0),
               P(-half, sgn*gw, gy1), P(-half - ext, sgn*gw, gy1), DARK);
        quad(P(-half - ext, -gw, gy1), P(-half, -gw, gy1),
             P(-half, gw, gy1), P(-half - ext, gw, gy1), DARK);
      }
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C),
           nrms: new Float32Array(N), count: V.length / 3 };
}

/** One side of a body, cut into abutting horizontal bands over a longitudinal
 *  span. `bands` is [[y0, y1, colour], ...] from the bottom up. */
function panel(quad, P, o, x0, x1, bands) {
  if (x1 - x0 < 0.02) return;
  for (const [y0, y1, col] of bands) {
    if (y1 - y0 < 0.01 || !col) continue;
    quad(P(x0, o, y0), P(x1, o, y0), P(x1, o, y1), P(x0, o, y1), col);
  }
}

function buildCoach(quad, P, half, stock, k, cars, frontEnd, rearEnd, glass, night) {
  const liv = LIVERY[stock];
  const SEAT_BLUE = [0.12, 0.32, 0.62], FLOOR_GREY = [0.32, 0.33, 0.35];
  const W = 1.42, Wt = 1.06;
  const doubleDeck = stock === "KISS";
  const floor = doubleDeck ? 0.62 : (stock === "FLIRT" ? 0.60 : 1.05);
  const roofHi = CAR_H[stock];
  // A KISS roof is one continuous line at full height, nose to tail. What is
  // single-level over the bogies is the floor inside, not the roof: there the
  // car shows one row of windows at mezzanine height instead of two. An
  // earlier version dropped the roof to 3.78 m over the ends, which put a
  // hump on every car.
  const endTop = roofHi;
  const step = doubleDeck ? half * 0.56 : half;
  const nose = (frontEnd || rearEnd) ? (stock === "FLIRT" ? 1.30 : 1.05) : 0;
  const e0 = -half + (rearEnd ? nose : 0);
  const e1 =  half - (frontEnd ? nose : 0);

  // window bands, and where the blue gives way to the white
  const loWin = doubleDeck ? [1.08, 1.88] : [floor + 0.62, floor + 1.62];
  const hiWin = doubleDeck ? [2.72, 3.48] : null;
  const beltY = doubleDeck ? 2.10 : loWin[1] + 0.12;

  // doors sit in the single-deck sections of a KISS, at the ends of anything else
  const dHalf = 0.66;
  const doors = doubleDeck ? [-step - 1.15, step + 1.15]
                           : [-half * 0.66, half * 0.66];
  const spans = [];
  {
    let x = e0;
    for (const d of doors.slice().sort((p, q) => p - q)) {
      const a0 = d - dHalf, a1 = d + dHalf;
      if (a1 <= e0 + 0.1 || a0 >= e1 - 0.1) continue;
      if (a0 > x) spans.push([x, a0, false]);
      spans.push([Math.max(x, a0), Math.min(a1, e1), true]);
      x = Math.min(a1, e1);
    }
    if (x < e1) spans.push([x, e1, false]);
  }

  for (const sgn of [-1, 1]) {
    const o = sgn * W, ot = sgn * Wt;
    // skirt, tucked in below the floor, all the way along
    quad(P(e0, o*0.80, 0.34), P(e1, o*0.80, 0.34),
         P(e1, o, floor), P(e0, o, floor), liv.skirt);

    for (const [x0, x1, isDoor] of spans) {
      // the roof is not flat on a double-decker, so the body is cut at the
      // step and the top band of each piece follows the roof it sits under
      const pieces = doubleDeck
        ? [[x0, Math.min(x1, -step)], [Math.max(x0, -step), Math.min(x1, step)],
           [Math.max(x0, step), x1]]
        : [[x0, x1]];
      for (let pi = 0; pi < pieces.length; pi++) {
        const [px0, px1] = pieces[pi];
        if (px1 - px0 < 0.02) continue;
        const high = doubleDeck && pi === 1;
        const top = (high ? roofHi : endTop) - 0.32;
        if (isDoor) {
          panel(quad, P, o, px0, px1, [
            [floor - 0.28, floor + 0.70, liv.door],
            [floor + 0.70, floor + 1.72, glass],
            [floor + 1.72, top, liv.door]]);
        } else if (high) {
          panel(quad, P, o, px0, px1, [
            [floor, loWin[0], liv.lower],
            [loWin[0], loWin[1], glass],
            [loWin[1], beltY, liv.lower],
            [beltY, hiWin[0], liv.upper],
            [hiWin[0], hiWin[1], glass],
            [hiWin[1], top, liv.upper]]);
        } else if (doubleDeck) {
          // over a bogie: one mezzanine row, between the two decks' rows
          panel(quad, P, o, px0, px1, [
            [floor, beltY, liv.lower],
            [beltY, 2.30, liv.upper],
            [2.30, 3.06, glass],
            [3.06, top, liv.upper]]);
        } else {
          panel(quad, P, o, px0, px1, [
            [floor, loWin[0], liv.lower],
            [loWin[0], loWin[1], glass],
            [loWin[1], beltY, liv.lower],
            [beltY, top, liv.upper]]);
        }
        // roof chamfer and roof panel over this piece
        const rt = high ? roofHi : endTop;
        quad(P(px0, o, rt - 0.32), P(px1, o, rt - 0.32),
             P(px1, ot, rt), P(px0, ot, rt), liv.roof);
        quad(P(px0, -Wt, rt), P(px1, -Wt, rt), P(px1, Wt, rt), P(px0, Wt, rt), liv.roof);
      }
    }
  }

  // Interior Saloon: Passenger Floor & MÁV Blue Seating Rows
  quad(P(e0 + 0.5, -W * 0.90, floor), P(e1 - 0.5, -W * 0.90, floor),
       P(e1 - 0.5, W * 0.90, floor), P(e0 + 0.5, W * 0.90, floor), FLOOR_GREY);

  // the upper deck of a KISS: its own floor and its own seats, over the
  // double-deck section between the bogies
  if (doubleDeck) {
    const UF = 2.30;
    quad(P(-step + 0.2, -W * 0.92, UF), P(step - 0.2, -W * 0.92, UF),
         P(step - 0.2, W * 0.92, UF), P(-step + 0.2, W * 0.92, UF), FLOOR_GREY);
    for (let sx = -step + 1.6; sx <= step - 1.6; sx += 1.6)
      for (const sv of [-W * 0.52, W * 0.52]) {
        const sw = 0.38;
        quad(P(sx - 0.25, sv - sw, UF + 0.44), P(sx + 0.25, sv - sw, UF + 0.44),
             P(sx + 0.25, sv + sw, UF + 0.44), P(sx - 0.25, sv + sw, UF + 0.44), SEAT_BLUE);
        quad(P(sx + 0.24, sv - sw, UF + 0.44), P(sx + 0.24, sv + sw, UF + 0.44),
             P(sx + 0.24, sv + sw, UF + 0.96), P(sx + 0.24, sv - sw, UF + 0.96), SEAT_BLUE);
      }
  }
  const seatStep = 1.6;
  for (let sx = e0 + 2.4; sx <= e1 - 2.4; sx += seatStep) {
    // Left and right seating bays across the central aisle
    for (const sv of [-W * 0.52, W * 0.52]) {
      const sw = 0.38;
      // Seat cushion
      quad(P(sx - 0.25, sv - sw, floor + 0.44), P(sx + 0.25, sv - sw, floor + 0.44),
           P(sx + 0.25, sv + sw, floor + 0.44), P(sx - 0.25, sv + sw, floor + 0.44), SEAT_BLUE);
      // Seat backrest
      quad(P(sx + 0.24, sv - sw, floor + 0.44), P(sx + 0.24, sv + sw, floor + 0.44),
           P(sx + 0.24, sv + sw, floor + 0.96), P(sx + 0.24, sv - sw, floor + 0.96), SEAT_BLUE);
    }
  }

  for (const [ee, out] of [[e0, -1], [e1, 1]]) {
    const isCab = (out < 0 ? rearEnd : frontEnd) !== 0;
    const topH = doubleDeck ? endTop : roofHi;
    if (isCab) cabEnd(quad, P, ee, out, W, Wt, topH, floor, liv, nose, glass, night, stock);
    else {
      quad(P(ee, -W, floor - 0.4), P(ee, W, floor - 0.4),
           P(ee, W, topH - 0.32), P(ee, -W, topH - 0.32), DARK);
      quad(P(ee, -W, topH - 0.32), P(ee, W, topH - 0.32),
           P(ee, Wt, topH), P(ee, -Wt, topH), liv.roof);
    }
  }

  // underfloor: seen from a low camera beside an embankment, an open one
  // is a window straight into the car
  quad(P(e0, -W*0.82, floor - 0.30), P(e1, -W*0.82, floor - 0.30),
       P(e1, W*0.82, floor - 0.30), P(e0, W*0.82, floor - 0.30), DARK);
  bogies(quad, P, half, stock === "FLIRT" ? "jacobs" : "end", W);
  if ((k === 0 || k === cars - 1) && (stock === "KISS" || stock === "FLIRT"))
    pantograph(quad, P, half * 0.15, doubleDeck ? CAR_H[stock] : CAR_H[stock]);
}

function cabEnd(quad, P, ee, out, W, Wt, topH, floor, liv, nose, glass, night, stock = "KISS") {
  const tip = ee + out * nose;
  const wTip = W * 0.72, wTipT = Wt * 0.62;
  quad(P(ee, -Wt, topH), P(ee, Wt, topH),
       P(tip, wTipT, topH - 0.55), P(tip, -wTipT, topH - 0.55), liv.roof);
  quad(P(ee + out * nose * 0.18, -wTip * 1.02, topH - 0.62),
       P(ee + out * nose * 0.18, wTip * 1.02, topH - 0.62),
       P(tip, wTipT * 1.02, topH - 1.55), P(tip, -wTipT * 1.02, topH - 1.55), glass);
  const front = stock === "LOCO" ? liv.door : liv.upper;
  quad(P(tip, -wTip, topH - 1.55), P(tip, wTip, topH - 1.55),
       P(tip, wTip, floor - 0.32), P(tip, -wTip, floor - 0.32), front);
  for (const sgn of [-1, 1])
    quad(P(ee, sgn * W, floor - 0.32), P(tip, sgn * wTip, floor - 0.32),
         P(tip, sgn * wTip, topH - 0.9), P(ee, sgn * W, topH - 0.9), front);
  quad(P(tip, -wTip, floor - 0.32), P(tip, wTip, floor - 0.32),
       P(tip, wTip, 0.38), P(tip, -wTip, 0.38), DARK);

  // ---- Train-Specific 3D Driver's Cockpit & Interior Architecture
  const cabBack = ee - out * (stock === "LOCO" || stock === "EC" ? 1.4 : 1.8);
  const deskFront = ee + out * nose * (stock === "LOCO" || stock === "EC" ? 0.35 : 0.45);
  const SEAT_CHARCOAL = [0.18, 0.20, 0.24];

  if (stock === "LOCO" || stock === "EC") {
    // V43 Szili / Classic Hungarian Locomotive Cab
    const V43_GREEN = [0.20, 0.26, 0.20], GAUGE_BG = [0.88, 0.85, 0.68], LEVER_RED = [0.82, 0.18, 0.14];
    const WHEEL_DARK = [0.12, 0.12, 0.14];
    // Rear machine room partition wall & door
    quad(P(cabBack, -W * 0.95, floor), P(cabBack, W * 0.95, floor),
         P(cabBack, W * 0.95, topH - 0.2), P(cabBack, -W * 0.95, topH - 0.2), [0.28, 0.30, 0.32]);
    quad(P(cabBack + out * 0.02, -0.38, floor), P(cabBack + out * 0.02, 0.38, floor),
         P(cabBack + out * 0.02, 0.38, floor + 1.80), P(cabBack + out * 0.02, -0.38, floor + 1.80), [0.38, 0.40, 0.42]);
    // Heavy steel driver console
    quad(P(ee - out * 0.12, -W * 0.68, floor + 0.74), P(deskFront, -wTip * 0.72, floor + 0.74),
         P(deskFront, wTip * 0.72, floor + 0.74), P(ee - out * 0.12, W * 0.68, floor + 0.74), V43_GREEN);
    // Angled instrument hood
    quad(P(deskFront, -wTip * 0.70, floor + 0.74), P(deskFront + out * 0.18, -wTip * 0.65, floor + 1.02),
         P(deskFront + out * 0.18, wTip * 0.65, floor + 1.02), P(deskFront, wTip * 0.70, floor + 0.74), V43_GREEN);
    // Circular analog dials & pressure gauges (Speedometer, Brake pipe, Catenary Voltage)
    for (const gx of [-0.35, -0.12, 0.12, 0.35]) {
      quad(P(deskFront + out * 0.04, gx - 0.08, floor + 0.78), P(deskFront + out * 0.14, gx - 0.08, floor + 0.96),
           P(deskFront + out * 0.14, gx + 0.08, floor + 0.96), P(deskFront + out * 0.04, gx + 0.08, floor + 0.78), GAUGE_BG);
    }
    // Rotary Throttle Controller Wheel
    quad(P(ee + out * 0.08, -0.28, floor + 0.76), P(ee + out * 0.22, -0.28, floor + 0.76),
         P(ee + out * 0.22, -0.10, floor + 0.76), P(ee + out * 0.08, -0.10, floor + 0.76), WHEEL_DARK);
    // Knorr D2 Train Brake Valve Handle
    quad(P(ee + out * 0.10, 0.22, floor + 0.76), P(ee + out * 0.20, 0.22, floor + 0.76),
         P(ee + out * 0.20, 0.26, floor + 0.94), P(ee + out * 0.10, 0.26, floor + 0.94), LEVER_RED);
  } else {
    // Stadler KISS & FLIRT Modern Digital Glass Cockpit
    const DESK_DARK = [0.15, 0.16, 0.18], SCREEN_BLUE = [0.10, 0.52, 0.92], SCREEN_GREEN = [0.14, 0.82, 0.35];
    const LEVER_GOLD = [0.92, 0.78, 0.18];
    // Rear cab partition with large saloon observation glass
    quad(P(cabBack, -W * 0.95, floor), P(cabBack, W * 0.95, floor),
         P(cabBack, W * 0.95, topH - 0.2), P(cabBack, -W * 0.95, topH - 0.2), [0.24, 0.26, 0.29]);
    quad(P(cabBack + out * 0.02, -0.55, floor + 0.90), P(cabBack + out * 0.02, 0.55, floor + 0.90),
         P(cabBack + out * 0.02, 0.55, floor + 1.90), P(cabBack + out * 0.02, -0.55, floor + 1.90), [0.32, 0.44, 0.56]);
    // Curved ergonomic dashboard desk
    quad(P(ee - out * 0.15, -W * 0.74, floor + 0.78), P(deskFront, -wTip * 0.80, floor + 0.78),
         P(deskFront, wTip * 0.80, floor + 0.78), P(ee - out * 0.15, W * 0.74, floor + 0.78), DESK_DARK);
    quad(P(deskFront, -wTip * 0.76, floor + 0.78), P(deskFront + out * 0.22, -wTip * 0.72, floor + 1.06),
         P(deskFront + out * 0.22, wTip * 0.72, floor + 1.06), P(deskFront, wTip * 0.76, floor + 0.78), DESK_DARK);
    // Dual widescreen MFDs
    quad(P(deskFront + out * 0.05, -0.52, floor + 0.82), P(deskFront + out * 0.18, -0.52, floor + 1.02),
         P(deskFront + out * 0.18, -0.06, floor + 1.02), P(deskFront + out * 0.05, -0.06, floor + 0.82), SCREEN_BLUE);
    quad(P(deskFront + out * 0.05, 0.06, floor + 0.82), P(deskFront + out * 0.18, 0.06, floor + 1.02),
         P(deskFront + out * 0.18, 0.52, floor + 1.02), P(deskFront + out * 0.05, 0.52, floor + 0.82), SCREEN_GREEN);
    // Left-hand traction controller lever
    quad(P(ee + out * 0.10, -0.34, floor + 0.80), P(ee + out * 0.22, -0.34, floor + 0.80),
         P(ee + out * 0.22, -0.28, floor + 1.00), P(ee + out * 0.10, -0.28, floor + 1.00), LEVER_GOLD);
  }

  // Driver's Seat
  const seatX = ee - out * (stock === "LOCO" || stock === "EC" ? 0.48 : 0.65);
  quad(P(seatX - 0.24, -0.24, floor + 0.52), P(seatX + 0.24, -0.24, floor + 0.52),
       P(seatX + 0.24, 0.24, floor + 0.52), P(seatX - 0.24, 0.24, floor + 0.52), SEAT_CHARCOAL);
  quad(P(seatX - out * 0.20, -0.22, floor + 0.52), P(seatX - out * 0.20, 0.22, floor + 0.52),
       P(seatX - out * 0.20, 0.22, floor + 1.25), P(seatX - out * 0.20, -0.22, floor + 1.25), SEAT_CHARCOAL);
  quad(P(seatX - out * 0.21, -0.14, floor + 1.25), P(seatX - out * 0.21, 0.14, floor + 1.25),
       P(seatX - out * 0.21, 0.14, floor + 1.48), P(seatX - out * 0.21, -0.14, floor + 1.48), SEAT_CHARCOAL);
  // Lamps. A train shows two white low and one white high at the leading end
  // and two red low at the trailing one; both ends carry both, and the colour
  // is chosen by which way the vehicle faces. They are authored above 1.0, so
  // it is the bloom that makes them read as lights rather than white squares.
  const lead = out > 0;
  const lampCol = lead ? HEADLAMP : TAILLAMP;
  const boost = 0.55 + night * 0.9;
  const lc = [lampCol[0]*boost, lampCol[1]*boost, lampCol[2]*boost];
  const ly = floor + 0.10;
  for (const lx of [-wTip * 0.72, wTip * 0.72])
    quad(P(tip, lx - 0.19, ly), P(tip, lx + 0.19, ly),
         P(tip, lx + 0.19, ly + 0.30), P(tip, lx - 0.19, ly + 0.30), lc);
  if (lead)
    quad(P(tip, -0.22, topH - 1.78), P(tip, 0.22, topH - 1.78),
         P(tip, 0.22, topH - 1.52), P(tip, -0.22, topH - 1.52), lc);
}

function bogies(quad, P, half, kind, W) {
  const spots = kind === "jacobs" ? [-half * 0.96, half * 0.96]
                                  : [-half * 0.62, half * 0.62];
  for (const bp of spots) {
    for (const sgn of [-1, 1]) {
      const o = sgn * W * 0.74;
      // cut into abutting pieces so the wheels do not float on the frame
      panel(quad, P, o, bp - 1.45, bp - 1.41, [[0.08, 0.98, DARK]]);
      panel(quad, P, o, bp - 1.41, bp - 0.49, [[0.08, 0.98, METAL]]);
      panel(quad, P, o, bp - 0.49, bp + 0.49, [[0.08, 0.98, DARK]]);
      panel(quad, P, o, bp + 0.49, bp + 1.41, [[0.08, 0.98, METAL]]);
      panel(quad, P, o, bp + 1.41, bp + 1.45, [[0.08, 0.98, DARK]]);
    }
    quad(P(bp - 1.45, -W * 0.74, 0.98), P(bp + 1.45, -W * 0.74, 0.98),
         P(bp + 1.45, W * 0.74, 0.98), P(bp - 1.45, W * 0.74, 0.98), DARK);
  }
}

// A pantograph is not a fixed shape: it reaches until it touches the wire,
// which is why the same unit rides with the arms further out under a low
// bridge than on plain line. Ours extends to just under the contact wire's
// nominal 5.5 m above rail, so a KISS at 4.60 m to the roof folds its arms
// down and a lower loco stretches them. Before there was an overhead line to
// meet, this was a fixed 1.62 m and every pantograph on the railway now stood
// clean through the wire.
const PAN_TOP = 5.46;

function pantograph(quad, P, x, roofY) {
  const up = Math.max(0.85, PAN_TOP - roofY);
  quad(P(x - 1.9, -0.62, roofY), P(x + 1.9, -0.62, roofY),
       P(x + 1.9, 0.62, roofY), P(x - 1.9, 0.62, roofY), METAL);
  quad(P(x - 1.7, -0.05, roofY + 0.06), P(x - 1.5, -0.05, roofY + 0.06),
       P(x + 0.2, 0.05, roofY + up), P(x + 0.0, 0.05, roofY + up), METAL);
  quad(P(x + 1.7, 0.05, roofY + 0.06), P(x + 1.5, 0.05, roofY + 0.06),
       P(x + 0.0, -0.05, roofY + up), P(x + 0.2, -0.05, roofY + up), METAL);
  quad(P(x - 0.16, -0.92, roofY + up), P(x + 0.16, -0.92, roofY + up),
       P(x + 0.16, 0.92, roofY + up + 0.04), P(x - 0.16, 0.92, roofY + up + 0.04), METAL);
}

// A V43-ish machine: cobalt blue with a yellow warning front, roof equipment,
// a cab at each end. It is what pulls everything on this line that is not a
// multiple unit.
function buildLoco(quad, P, half, stock, glass, night, loco) {
  const liv = LIVERY["LOCO_" + loco] || LIVERY.LOCO;
  const W = 1.48, Wt = 1.20, roofY = 4.28, floor = 1.15;
  const nose = 1.15;
  const e0 = -half + nose, e1 = half - nose;
  for (const sgn of [-1, 1]) {
    const o = sgn * W, ot = sgn * Wt;
    quad(P(e0, o*0.80, 0.34), P(e1, o*0.80, 0.34),
         P(e1, o, floor), P(e0, o, floor), liv.skirt);
    // the side, cut into louvre bays rather than overlaid with them
    const bays = 7;
    for (let i = 0; i < bays; i++) {
      const x0 = e0 + (e1 - e0) * (i / bays), x1 = e0 + (e1 - e0) * ((i + 1) / bays);
      const grille = i % 2 === 1;
      panel(quad, P, o, x0, x1, [
        [floor, floor + 0.80, liv.lower],
        [floor + 0.80, roofY - 0.95, grille ? DARK : liv.upper],
        [roofY - 0.95, roofY - 0.42, liv.upper]]);
    }
    quad(P(e0, o, roofY - 0.42), P(e1, o, roofY - 0.42),
         P(e1, ot, roofY), P(e0, ot, roofY), liv.roof);
  }
  quad(P(e0, -Wt, roofY), P(e1, -Wt, roofY), P(e1, Wt, roofY), P(e0, Wt, roofY), liv.roof);
  for (const [ee, out] of [[e0, -1], [e1, 1]])
    cabEnd(quad, P, ee, out, W, Wt, roofY, floor, liv, nose, glass, night, "LOCO");
  bogies(quad, P, half, "end", W);
  pantograph(quad, P, -half * 0.34, roofY);
  pantograph(quad, P, half * 0.34, roofY);
}

// A freight rake is not one wagon repeated. Six types, chosen from a stable
// per-train seed and the wagon's index, so a train keeps its make-up from
// frame to frame — seeding from chainage made it reshuffle as it moved.
function buildWagon(quad, P, half, tSeed, k) {
  const r0 = vehRnd(tSeed, k, 1);
  const kind = Math.floor(r0 * 6);        // 0 hopper 1 tank 2 box 3 flat 4 grain 5 timber
  const W = 1.44, deck = 1.18;
  quad(P(-half, -W*0.9, deck - 0.34), P(half, -W*0.9, deck - 0.34),
       P(half, W*0.9, deck - 0.34), P(-half, W*0.9, deck - 0.34), DARK);
  for (const sgn of [-1, 1])
    quad(P(-half, sgn*W*0.9, deck - 0.34), P(half, sgn*W*0.9, deck - 0.34),
         P(half, sgn*W*0.9, deck), P(-half, sgn*W*0.9, deck), DARK);
  bogies(quad, P, half, "end", W);

  const rust = [0.36,0.26,0.19], grey = [0.40,0.41,0.43];
  if (kind === 0 || kind === 5) {
    // open hopper, sides sloping in to the discharge. Loaded with coal or
    // ballast, or running empty with the floor showing.
    const top = 3.30, wTop = W, wBot = W * 0.34;
    const body = kind === 5 ? [0.30,0.33,0.36] : rust;
    // The sides and the ends have to meet on the same rectangle, or the
    // corner is open and you can see straight into the wagon from behind.
    const hx = half * 0.94;
    for (const sgn of [-1, 1])
      quad(P(-hx, sgn*wBot, deck), P(hx, sgn*wBot, deck),
           P(hx, sgn*wTop, top), P(-hx, sgn*wTop, top), body);
    for (const [ee, sx] of [[-hx, -1], [hx, 1]])
      quad(P(ee, -wBot, deck), P(ee, wBot, deck),
           P(ee, wTop, top), P(ee, -wTop, top),
           [body[0]*0.86, body[1]*0.86, body[2]*0.86]);
    // the sloping end walls that funnel to the discharge, inside the box
    for (const [ee, sx] of [[-hx, 1], [hx, -1]])
      quad(P(ee, -wBot, deck), P(ee, wBot, deck),
           P(ee + sx*1.5, wTop, top), P(ee + sx*1.5, -wTop, top),
           [body[0]*0.72, body[1]*0.72, body[2]*0.72]);
    const loaded = vehRnd(tSeed, k, 2) > 0.42;
    const lvl = loaded ? top - 0.22 : deck + 0.12;
    quad(P(-hx, -wTop*0.96, lvl), P(hx, -wTop*0.96, lvl),
         P(hx, wTop*0.96, lvl), P(-hx, wTop*0.96, lvl),
         loaded ? (kind === 5 ? [0.30,0.22,0.14] : [0.09,0.085,0.08]) : [0.16,0.15,0.14]);
    // floor, so there is no hole underneath either
    quad(P(-hx, -wBot, deck), P(hx, -wBot, deck),
         P(hx, wBot, deck), P(-hx, wBot, deck), [0.14,0.13,0.12]);
  } else if (kind === 1) {
    // tank barrel, faceted so flat shading has something to work with
    const cy = deck + 1.30, r = 1.28, n = 8;
    const tint = vehRnd(tSeed, k, 3);
    const base = tint > 0.66 ? [0.62,0.60,0.56] : tint > 0.33 ? [0.24,0.26,0.29]
                                                              : [0.34,0.20,0.17];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const y0 = cy + Math.sin(a0) * r, z0 = Math.cos(a0) * r * 1.05;
      const y1 = cy + Math.sin(a1) * r, z1 = Math.cos(a1) * r * 1.05;
      const sh = 0.60 + 0.40 * Math.abs(Math.cos(a0));
      quad(P(-half*0.90, z0, y0), P(half*0.90, z0, y0),
           P(half*0.90, z1, y1), P(-half*0.90, z1, y1),
           [base[0]*sh, base[1]*sh, base[2]*sh]);
    }
    for (const ee of [-half*0.90, half*0.90])
      quad(P(ee, -r*1.05, cy - r), P(ee, r*1.05, cy - r),
           P(ee, r*1.05, cy + r), P(ee, -r*1.05, cy + r),
           [base[0]*0.5, base[1]*0.5, base[2]*0.5]);
    quad(P(-0.55, -0.42, cy + r), P(0.55, -0.42, cy + r),
         P(0.55, 0.42, cy + r + 0.34), P(-0.55, 0.42, cy + r + 0.34), METAL);
  } else if (kind === 4) {
    // covered grain hopper: a ridged roof with loading hatches along the top
    const top = 3.55, wB = W * 0.42;
    for (const sgn of [-1, 1])
      panel(quad, P, sgn*W, -half*0.94, half*0.94,
            [[deck, top - 0.55, grey], [top - 0.55, top - 0.30, [0.30,0.31,0.33]]]);
    for (const sgn of [-1, 1])
      quad(P(-half*0.94, sgn*W, top - 0.30), P(half*0.94, sgn*W, top - 0.30),
           P(half*0.94, sgn*0.16, top), P(-half*0.94, sgn*0.16, top),
           [grey[0]*1.1, grey[1]*1.1, grey[2]*1.1]);
    for (const ee of [-half*0.94, half*0.94])
      quad(P(ee, -W, deck), P(ee, W, deck), P(ee, W, top - 0.30), P(ee, -W, top - 0.30),
           [grey[0]*0.85, grey[1]*0.85, grey[2]*0.85]);
    // gable ends, or the roof ridge is open at both ends
    for (const ee of [-half*0.94, half*0.94])
      quad(P(ee, -W, top - 0.30), P(ee, W, top - 0.30),
           P(ee, 0.16, top), P(ee, -0.16, top),
           [grey[0]*0.8, grey[1]*0.8, grey[2]*0.8]);
    for (let i = 0; i < 3; i++) {
      const hx = -half*0.6 + i * half*0.6;
      quad(P(hx - 0.34, -0.30, top), P(hx + 0.34, -0.30, top),
           P(hx + 0.34, 0.30, top + 0.16), P(hx - 0.34, 0.30, top + 0.16), METAL);
    }
    // discharge hoppers slung under the frame
    for (const hx of [-half*0.5, half*0.5])
      quad(P(hx - 0.8, -wB, deck - 0.34), P(hx + 0.8, -wB, deck - 0.34),
           P(hx + 0.8, wB, deck - 0.34), P(hx - 0.8, wB, deck - 0.34), DARK);
  } else if (kind === 2) {
    // container flat: one 40 ft box, two 20 ft, or running empty
    const COLS = [[0.55,0.20,0.16], [0.16,0.32,0.50], [0.62,0.52,0.16],
                  [0.20,0.42,0.28], [0.52,0.52,0.54], [0.30,0.30,0.32]];
    const load = vehRnd(tSeed, k, 4);
    const spans = load < 0.18 ? []
                : load < 0.55 ? [[-half*0.92, -0.25], [0.25, half*0.92]]
                              : [[-half*0.92, half*0.92]];
    for (let i = 0; i < spans.length; i++) {
      const [x0, x1] = spans[i];
      const col = COLS[Math.floor(vehRnd(tSeed, k, 10 + i) * COLS.length)];
      const dim = [col[0]*0.84, col[1]*0.84, col[2]*0.84];
      const cw = W * 0.86, top = deck + 2.55;
      // corrugations are TILED strips, not quads floating proud of the side
      const ribs = Math.max(4, Math.round((x1 - x0) / 0.55));
      for (const sgn of [-1, 1]) {
        for (let rr = 0; rr < ribs; rr++) {
          const a0 = x0 + (x1 - x0) * rr / ribs, a1 = x0 + (x1 - x0) * (rr + 1) / ribs;
          panel(quad, P, sgn*cw, a0, a1, [[deck, top, rr % 2 ? dim : col]]);
        }
      }
      for (const ee of [x0, x1])
        quad(P(ee, -cw, deck), P(ee, cw, deck), P(ee, cw, top), P(ee, -cw, top), dim);
      quad(P(x0, -cw, top), P(x1, -cw, top), P(x1, cw, top), P(x0, cw, top),
           [col[0]*1.08, col[1]*1.08, col[2]*1.08]);
      quad(P(x0, -cw, deck), P(x1, -cw, deck), P(x1, cw, deck), P(x0, cw, deck),
           [col[0]*0.55, col[1]*0.55, col[2]*0.55]);
    }
    if (!spans.length)
      quad(P(-half*0.94, -W*0.86, deck), P(half*0.94, -W*0.86, deck),
           P(half*0.94, W*0.86, deck), P(-half*0.94, W*0.86, deck), [0.26,0.24,0.22]);
  } else {
    // sided box wagon, sliding doors in the middle
    const top = 3.45;
    const body = vehRnd(tSeed, k, 5) > 0.5 ? [0.36,0.28,0.22] : [0.30,0.33,0.30];
    const doorCol = [body[0]*0.78, body[1]*0.78, body[2]*0.78];
    for (const sgn of [-1, 1])
      for (const [a0, a1, isD] of [[-half*0.94, -1.6, false], [-1.6, 1.6, true],
                                   [1.6, half*0.94, false]])
        panel(quad, P, sgn*W, a0, a1, [[deck, top, isD ? doorCol : body]]);
    for (const ee of [-half*0.94, half*0.94])
      quad(P(ee, -W, deck), P(ee, W, deck), P(ee, W, top), P(ee, -W, top),
           [body[0]*0.86, body[1]*0.86, body[2]*0.86]);
    quad(P(-half*0.94, -W, top), P(half*0.94, -W, top),
         P(half*0.94, W, top), P(-half*0.94, W, top), [0.30,0.30,0.31]);
    quad(P(-half*0.94, -W, deck), P(half*0.94, -W, deck),
         P(half*0.94, W, deck), P(-half*0.94, W, deck), [0.16,0.15,0.14]);
  }
}
