// -------------------------------------------------------------- landmarks
//
// Hand-modelled buildings, anchored to their own OSM footprint.
//
// Placement is the hard part of this, not the modelling. A landmark typed in
// as a latitude and longitude has three ways to go wrong — the projection
// origin drifts, the rotation picks up a sign error, or the building ends up
// on the wrong side of the line — and all three are silent. So nothing here
// carries a coordinate. The bake finds each building in OSM by name, takes
// the centre, principal axis and extent of its real footprint in exactly the
// frame everything else is baked in, and hands that over as an anchor. The
// geometry below is built in a local frame: u along the building's own long
// axis, v across it, w up from the ground under its centre.
//
// The consequence is that a landmark cannot be misplaced relative to the rest
// of the world, because it is placed by the same data as the rest of the
// world. If OSM moves the building, the model moves with it.

const LM_GLASS  = [0.30, 0.42, 0.46];
const LM_GLASSL = [0.52, 0.64, 0.68];
const LM_IRON   = [0.32, 0.30, 0.29];
const LM_STONE  = [0.78, 0.74, 0.65];
const LM_STONE2 = [0.66, 0.62, 0.55];
const LM_SLATE  = [0.29, 0.30, 0.32];
const LM_BRICK  = [0.48, 0.28, 0.21];
const LM_BRICK2 = [0.40, 0.23, 0.18];
const LM_CONC   = [0.62, 0.62, 0.60];
const LM_RUST   = [0.40, 0.27, 0.19];
const LM_ZINC   = [0.55, 0.58, 0.60];

// Deck top of each bridge model, in its own frame. A bridge is placed so its
// deck sits just under the road layer's deck (water + 8.5 m, geom.js), so the
// road — which the cars drive on — stays on top and the model supplies the
// piers, towers, chains and arches. Placed on the DEM instead, the model's
// deck floated a couple of metres off the real one: two bridges.
const BRIDGE_TOP = { lanchid: 12.0, megyeri: 14.8,
                     eszakivasut: 11.2, maria_valeria: 10.0 };

export function buildLandmarks(anchors, demAt, waterAt, railNear) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const tri = (a, b, c, col) => { push(a, col); push(b, col); push(c, col); };
  const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };

  for (const a of anchors || []) {
    const ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    let g = demAt(a.x, a.y);
    if (waterAt && BRIDGE_TOP[a.key] !== undefined)
      g = waterAt(a.y) + 8.5 - BRIDGE_TOP[a.key] - 0.08;
    // a railway bridge the player's line runs over carries the rails: its
    // deck goes at rail level, just under the ballast
    const rY = a.key === "eszakivasut" && railNear ? railNear(a.x, a.y) : null;
    if (rY !== null && isFinite(rY)) g = rY - BRIDGE_TOP[a.key] - 0.35;
    if (!isFinite(g)) continue;
    // u along the building's long axis, v across it, w up
    const P = (u, v, w) => [a.x + u * ca - v * sa, g + w, a.y + u * sa + v * ca];
    // a rectangular box in the local frame
    const box = (u0, u1, v0, v1, w0, w1, side, top) => {
      quad(P(u0,v0,w0), P(u1,v0,w0), P(u1,v0,w1), P(u0,v0,w1), side);
      quad(P(u1,v1,w0), P(u0,v1,w0), P(u0,v1,w1), P(u1,v1,w1), side);
      quad(P(u0,v1,w0), P(u0,v0,w0), P(u0,v0,w1), P(u0,v1,w1), side);
      quad(P(u1,v0,w0), P(u1,v1,w0), P(u1,v1,w1), P(u1,v0,w1), side);
      quad(P(u0,v0,w1), P(u1,v0,w1), P(u1,v1,w1), P(u0,v1,w1), top || side);
    };



    if (a.id && a.id.startsWith("pilis_")) {
      const type = a.type;
      if (type === "tunnel") {
        box(-20, 20, -7.5, 7.5, 0, 10, LM_STONE2, LM_STONE2);
      } else if (type === "bridge") {
        box(-50, 50, -6, 6, -5, 0, LM_BRICK, LM_BRICK);
      } else if (type === "historic") {
        box(-2.5, 2.5, -2.5, 2.5, 0, 8, LM_STONE, LM_STONE);
      }
      continue;
    }

    if (a.key === "nyugati") {
      // The Eiffel trainshed: a single iron and glass vault over the platforms,
      // 42 m of span and 25 m to the crown, with the famous glazed gable at the
      // buffer-stop end and the head building across the far one.
      const HL = Math.min(a.hu, 78);          // half length along the platforms
      const SP = 21.5, RISE = 25.0;           // half span, crown height
      const SEG = 14;
      const arc = (t) => {
        const th = Math.PI * t;
        return [-Math.cos(th) * SP, Math.sin(th) * RISE];
      };
      // the vault, alternating iron ribs and glazing so it reads as a shed
      for (let i = 0; i < SEG; i++) {
        const [v0, w0] = arc(i / SEG), [v1, w1] = arc((i + 1) / SEG);
        const bays = 11;
        for (let b = 0; b < bays; b++) {
          const u0 = -HL + (2 * HL) * b / bays, u1 = -HL + (2 * HL) * (b + 1) / bays;
          const rib = (b % 2) === 0;
          quad(P(u0, v0, w0), P(u1, v0, w0), P(u1, v1, w1), P(u0, v1, w1),
               rib ? LM_IRON : LM_GLASS);
        }
      }
      // the glazed gable over the tracks, with its arched ironwork
      for (let i = 0; i < SEG; i++) {
        const [v0, w0] = arc(i / SEG), [v1, w1] = arc((i + 1) / SEG);
        quad(P(-HL, v0, 0), P(-HL, v1, 0), P(-HL, v1, w1), P(-HL, v0, w0), LM_GLASSL);
        // radiating ribs
        quad(P(-HL - 0.6, v0 * 0.99, w0 * 0.99), P(-HL - 0.6, v1 * 0.99, w1 * 0.99),
             P(-HL - 0.6, v1 * 0.92, w1 * 0.92), P(-HL - 0.6, v0 * 0.92, w0 * 0.92), LM_IRON);
      }
      // side walls under the springing of the arch
      for (const s of [-1, 1])
        quad(P(-HL, s * SP, 0), P(HL, s * SP, 0), P(HL, s * SP, 5.5), P(-HL, s * SP, 5.5), LM_STONE2);
      // the head building across the far end, facing the Nagykörút
      box(HL, HL + 26, -SP - 12, SP + 12, 0, 19, LM_STONE, LM_SLATE);
      // its cornice and the two pavilion towers
      box(HL - 1, HL + 27, -SP - 13, SP + 13, 19, 21, LM_STONE2, LM_SLATE);
      for (const s of [-1, 1]) {
        box(HL + 2, HL + 22, s * (SP + 2), s * (SP + 12), 21, 30, LM_STONE, LM_SLATE);
        // a mansard cap, drawn as a short taper
        quad(P(HL + 2, s * (SP + 2), 30), P(HL + 22, s * (SP + 2), 30),
             P(HL + 18, s * (SP + 6), 37), P(HL + 6, s * (SP + 6), 37), LM_SLATE);
        quad(P(HL + 22, s * (SP + 2), 30), P(HL + 22, s * (SP + 12), 30),
             P(HL + 18, s * (SP + 8), 37), P(HL + 18, s * (SP + 6), 37), LM_SLATE);
        quad(P(HL + 2, s * (SP + 12), 30), P(HL + 2, s * (SP + 2), 30),
             P(HL + 6, s * (SP + 6), 37), P(HL + 6, s * (SP + 8), 37), LM_SLATE);
        // the clock face
        quad(P(HL + 8, s * (SP + 12.2), 24), P(HL + 16, s * (SP + 12.2), 24),
             P(HL + 16, s * (SP + 12.2), 28), P(HL + 8, s * (SP + 12.2), 28), [0.88,0.86,0.78]);
      }
      // ticket wings flanking the shed
      for (const s of [-1, 1])
        box(-HL * 0.5, HL, s * (SP + 1), s * (SP + 11), 0, 9.5, LM_STONE2, LM_SLATE);

    } else if (a.key === "westend") {
      // A mall: a long block along the tracks with a glazed barrel atrium
      // down its spine and a parking deck at one end.
      const HL = Math.min(a.hu, 190), HW = Math.min(a.hv, 62);
      box(-HL, HL, -HW, HW, 0, 21, [0.70,0.70,0.72], [0.42,0.43,0.45]);
      // shopfront glazing along the street side
      quad(P(-HL, -HW - 0.4, 1.5), P(HL, -HW - 0.4, 1.5),
           P(HL, -HW - 0.4, 8.0), P(-HL, -HW - 0.4, 8.0), LM_GLASS);
      // the atrium vault
      const SEG = 10, SP = HW * 0.42, RISE = 11;
      for (let i = 0; i < SEG; i++) {
        const t0 = i / SEG, t1 = (i + 1) / SEG;
        const v0 = -Math.cos(Math.PI * t0) * SP, v1 = -Math.cos(Math.PI * t1) * SP;
        const w0 = 21 + Math.sin(Math.PI * t0) * RISE;
        const w1 = 21 + Math.sin(Math.PI * t1) * RISE;
        quad(P(-HL * 0.75, v0, w0), P(HL * 0.75, v0, w0),
             P(HL * 0.75, v1, w1), P(-HL * 0.75, v1, w1), i % 2 ? LM_GLASSL : LM_ZINC);
      }
      // parking deck: open floors, so it reads as a structure not a slab
      for (let f = 0; f < 4; f++)
        box(HL * 0.55, HL, -HW, HW, 22 + f * 3.2, 22.6 + f * 3.2, LM_CONC, LM_CONC);

    } else if (a.key === "roundhouse") {
      // A running shed is a segment of an annulus around the turntable, with
      // one road per stall. The pit sits at the centre of that arc, which is
      // why the two are built together and never drift apart.
      const RI = 17, RO = 54, N = 16;
      const A0 = -Math.PI * 0.52, A1 = Math.PI * 0.52;
      for (let i = 0; i < N; i++) {
        const t0 = A0 + (A1 - A0) * i / N, t1 = A0 + (A1 - A0) * (i + 1) / N;
        const c0 = Math.cos(t0), s0 = Math.sin(t0);
        const c1 = Math.cos(t1), s1 = Math.sin(t1);
        const H = 11.5;
        // outer wall, inner wall with the stall opening, and the roof
        quad(P(c0*RO, s0*RO, 0), P(c1*RO, s1*RO, 0),
             P(c1*RO, s1*RO, H), P(c0*RO, s0*RO, H), LM_BRICK);
        quad(P(c1*RI, s1*RI, 0), P(c0*RI, s0*RI, 0),
             P(c0*RI, s0*RI, H), P(c1*RI, s1*RI, H),
             (i % 2) ? LM_BRICK2 : [0.16,0.15,0.14]);          // alternate doorways
        quad(P(c0*RI, s0*RI, H), P(c0*RO, s0*RO, H),
             P(c1*RO, s1*RO, H), P(c1*RI, s1*RI, H), LM_SLATE);
        // a smoke vent ridge along the roof
        quad(P(c0*(RI+RO)*0.5, s0*(RI+RO)*0.5, H), P(c1*(RI+RO)*0.5, s1*(RI+RO)*0.5, H),
             P(c1*(RI+RO)*0.5, s1*(RI+RO)*0.5, H + 1.6),
             P(c0*(RI+RO)*0.5, s0*(RI+RO)*0.5, H + 1.6), LM_IRON);
      }
      // end walls
      for (const [t, col] of [[A0, LM_BRICK2], [A1, LM_BRICK2]]) {
        const c = Math.cos(t), s = Math.sin(t);
        quad(P(c*RI, s*RI, 0), P(c*RO, s*RO, 0), P(c*RO, s*RO, 11.5), P(c*RI, s*RI, 11.5), col);
      }
      // the turntable: a pit and a girder bridge across it
      const RP = 12.5, PN = 24;
      for (let i = 0; i < PN; i++) {
        const t0 = i / PN * 6.28318, t1 = (i + 1) / PN * 6.28318;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        quad(P(c0*RP, s0*RP, 0), P(c1*RP, s1*RP, 0),
             P(c1*RP, s1*RP, -2.2), P(c0*RP, s0*RP, -2.2), LM_CONC);
        tri(P(0, 0, -2.2), P(c1*RP, s1*RP, -2.2), P(c0*RP, s0*RP, -2.2), [0.22,0.21,0.20]);
      }
      box(-RP, RP, -1.5, 1.5, -0.6, 0.9, LM_RUST, [0.30,0.28,0.26]);
      for (const s of [-1, 1])
        quad(P(-RP, s*1.6, 0.9), P(RP, s*1.6, 0.9), P(RP, s*1.6, 2.6), P(-RP, s*1.6, 2.6), LM_IRON);

    } else if (a.key === "viztorony" || a.key === "istvantelek") {
      // An octagonal brick water tower: shaft, a wider tank, a conical cap.
      const R = Math.max(4.5, Math.min(a.hu, a.hv) * 0.78);
      const N = 8, SH = 24, TK = 9;
      const pt = (i, r, w) => {
        const t = (i / N) * 6.28318 + 0.3927;
        return P(Math.cos(t) * r, Math.sin(t) * r, w);
      };
      for (let i = 0; i < N; i++) {
        quad(pt(i, R, 0), pt(i + 1, R, 0), pt(i + 1, R, SH), pt(i, R, SH),
             (i % 2) ? LM_BRICK : LM_BRICK2);
        quad(pt(i, R * 1.45, SH), pt(i + 1, R * 1.45, SH),
             pt(i + 1, R * 1.45, SH + TK), pt(i, R * 1.45, SH + TK), LM_BRICK);
        // the corbel under the tank
        quad(pt(i, R, SH - 1.2), pt(i + 1, R, SH - 1.2),
             pt(i + 1, R * 1.45, SH), pt(i, R * 1.45, SH), LM_STONE2);
        // conical roof
        tri(pt(i, R * 1.45, SH + TK), pt(i + 1, R * 1.45, SH + TK),
            P(0, 0, SH + TK + 6), LM_SLATE);
        // a window band on the tank
        quad(pt(i, R * 1.47, SH + 2.5), pt(i + 1, R * 1.47, SH + 2.5),
             pt(i + 1, R * 1.47, SH + 5.0), pt(i, R * 1.47, SH + 5.0), [0.15,0.16,0.18]);
      }

    } else if (a.key === "maria_valeria") {
      // Mária Valéria híd, Esztergom – Párkány (1895, rebuilt 2001): five
      // steel through-truss spans whose top chords arch over each span, on
      // stone piers. Length from its OSM way; the deck is the road layer's.
      const TR = [0.30, 0.40, 0.36], PIER = [0.72, 0.70, 0.64];
      const N = 5, SPAN = 2 * a.hu / N, DECK = 10.0;
      for (let i = 0; i < N; i++) {
        const x0 = -a.hu + i * SPAN, x1 = x0 + SPAN;
        if (i > 0) box(x0 - 3.5, x0 + 3.5, -7, 7, 0, DECK, PIER, PIER);
        const rise = i === 2 ? 17 : 13;                  // the middle span is the tallest
        const K = 10;
        for (const sg of [-1, 1]) {
          const v = sg * 6.2;
          for (let k = 0; k < K; k++) {
            const u0 = x0 + SPAN * k / K, u1 = x0 + SPAN * (k + 1) / K;
            const top = (u) => DECK + 3 + rise * Math.sin(Math.PI * (u - x0) / SPAN);
            quad(P(u0, v - 0.3, top(u0)), P(u1, v - 0.3, top(u1)),
                 P(u1, v + 0.3, top(u1)), P(u0, v + 0.3, top(u0)), TR);          // top chord
            quad(P(u0, v - 0.3, DECK), P(u1, v - 0.3, DECK),
                 P(u1, v + 0.3, DECK + 0.6), P(u0, v + 0.3, DECK + 0.6), TR);     // bottom chord
            // diagonals, alternating
            const [ua, ub] = k % 2 ? [u0, u1] : [u1, u0];
            quad(P(ua - 0.25, v, DECK), P(ua + 0.25, v, DECK),
                 P(ub + 0.25, v, top(ub)), P(ub - 0.25, v, top(ub)), TR);
          }
        }
        // cross bracing over the roadway
        for (let k = 1; k < 5; k++) {
          const u = x0 + SPAN * k / 5;
          const tp = DECK + 3 + rise * Math.sin(Math.PI * k / 5);
          quad(P(u - 0.25, -6.2, tp), P(u + 0.25, -6.2, tp), P(u + 0.25, 6.2, tp), P(u - 0.25, 6.2, tp), TR);
        }
      }

    } else if (a.key === "esztergom") {
      // Esztergom Basilica, on the Castle Hill above the Danube: the largest
      // church in Hungary. Position, direction and size from its OSM outline
      // (the anchor); the shape from the building — a long nave, a front
      // portico of eight columns between two bell towers, and over the
      // crossing a tall drum ringed with columns under a green copper dome,
      // about 100 m to the cross. Real proportions, drawn simply.
      const L = Math.max(50, a.hu), Wd = Math.max(20, Math.min(a.hv, 26));
      const STONE = [0.84, 0.80, 0.70], STONE_D = [0.70, 0.66, 0.58];
      const COPPER = [0.36, 0.56, 0.48], COPPER_D = [0.28, 0.44, 0.38];
      // nave and aisles
      box(-L, L * 0.62, -Wd, Wd, 0, 32, STONE, LM_SLATE);
      // the front: portico of eight columns and a pediment, at the -u end
      const fu = -L;
      box(fu - 7, fu, -Wd * 0.62, Wd * 0.62, 0, 3.5, STONE_D, STONE_D);        // steps
      for (let i = 0; i < 8; i++) {
        const v = -Wd * 0.55 + (Wd * 1.1) * i / 7;
        box(fu - 6.2, fu - 4.4, v - 0.9, v + 0.9, 3.5, 25, STONE, STONE);
      }
      box(fu - 7, fu, -Wd * 0.62, Wd * 0.62, 25, 29, STONE, STONE);           // entablature
      tri(P(fu - 7, -Wd * 0.62, 29), P(fu - 7, Wd * 0.62, 29), P(fu - 7, 0, 36), STONE_D);
      quad(P(fu - 7, -Wd * 0.62, 29), P(fu, -Wd * 0.62, 29), P(fu, 0, 36), P(fu - 7, 0, 36), LM_SLATE);
      quad(P(fu, Wd * 0.62, 29), P(fu - 7, Wd * 0.62, 29), P(fu - 7, 0, 36), P(fu, 0, 36), LM_SLATE);
      // two bell towers at the front corners, with small copper domes
      for (const sg of [-1, 1]) {
        const v0 = sg * Wd * 0.62, v1 = sg * (Wd + 2);
        box(fu, fu + 12, Math.min(v0, v1), Math.max(v0, v1), 0, 52, STONE, STONE);
        const cu = fu + 6, cv = (v0 + v1) / 2;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8 * 6.2832, t1 = (i + 1) / 8 * 6.2832;
          tri(P(cu + Math.cos(t0) * 5, cv + Math.sin(t0) * 5, 52),
              P(cu + Math.cos(t1) * 5, cv + Math.sin(t1) * 5, 52), P(cu, cv, 60), COPPER);
        }
      }
      // the drum and dome over the crossing, towards the apse end
      const du = L * 0.18, R0 = 17.5, N = 24;
      const ring = (i, r, w) => { const t = i / N * 6.2832; return P(du + Math.cos(t) * r, Math.sin(t) * r, w); };
      for (let i = 0; i < N; i++) {
        // drum, with a ring of columns as alternating light and shadow
        quad(ring(i, R0, 32), ring(i + 1, R0, 32), ring(i + 1, R0, 58), ring(i, R0, 58),
             (i % 2) ? STONE : STONE_D);
        quad(ring(i, R0 + 1.2, 58), ring(i + 1, R0 + 1.2, 58), ring(i + 1, R0 + 1.2, 61), ring(i, R0 + 1.2, 61), STONE);
        // the dome itself: five rings on a circular profile
        let prevR = R0, prevW = 61;
        for (let k = 1; k <= 5; k++) {
          const th = k / 5 * Math.PI * 0.5;
          const r = R0 * Math.cos(th), w = 61 + Math.sin(th) * 24;
          quad(ring(i, prevR, prevW), ring(i + 1, prevR, prevW), ring(i + 1, r, w), ring(i, r, w),
               (i % 3 === 0) ? COPPER_D : COPPER);
          prevR = r; prevW = w;
        }
        // lantern
        quad(ring(i, 3.2, 85), ring(i + 1, 3.2, 85), ring(i + 1, 3.2, 93), ring(i, 3.2, 93), STONE);
        tri(ring(i, 3.6, 93), ring(i + 1, 3.6, 93), P(du, 0, 98), COPPER);
      }
      // the cross
      box(du - 0.25, du + 0.25, -0.25, 0.25, 98, 103, [0.85, 0.72, 0.30]);
      box(du - 0.25, du + 0.25, -1.4, 1.4, 101, 101.6, [0.85, 0.72, 0.30]);
      // the apse
      for (let i = 0; i < 12; i++) {
        const t0 = -Math.PI / 2 + i / 12 * Math.PI, t1 = -Math.PI / 2 + (i + 1) / 12 * Math.PI;
        const ea = L * 0.62;
        quad(P(ea + Math.cos(t0) * Wd * 0.8, Math.sin(t0) * Wd * 0.8, 0),
             P(ea + Math.cos(t1) * Wd * 0.8, Math.sin(t1) * Wd * 0.8, 0),
             P(ea + Math.cos(t1) * Wd * 0.8, Math.sin(t1) * Wd * 0.8, 28),
             P(ea + Math.cos(t0) * Wd * 0.8, Math.sin(t0) * Wd * 0.8, 28), STONE);
        tri(P(ea + Math.cos(t0) * Wd * 0.8, Math.sin(t0) * Wd * 0.8, 28),
            P(ea + Math.cos(t1) * Wd * 0.8, Math.sin(t1) * Wd * 0.8, 28), P(ea, 0, 34), LM_SLATE);
      }

    } else if (a.key === "cementworks") {
      // The Váci cementgyár — Duna Dráva Cement, 356 m off the line at km 37,
      // and the most conspicuous thing on that side of the river.
      //
      // Anchored to its named `landuse=industrial` relation: centre, axis and
      // extent all come from the site polygon, so nothing here is a typed
      // coordinate. The PLANT is invented — OSM has the halls but nothing
      // about what stands on them, and a cement works without its preheater
      // tower is a shed. Mark's licence, and taken deliberately: the shapes
      // are what a dry-process works looks like from a train, at the sizes
      // the real one has, in the place the data puts it.
      //
      // The site is 1.7 km across because it takes in the quarry and the
      // stockyard; the plant proper is a couple of hundred metres, so it is
      // built to its own scale about the site's centre rather than stretched
      // to fill it.
      const CONC = [0.70, 0.68, 0.63], CONC2 = [0.60, 0.58, 0.54];
      const RUST2 = [0.44, 0.33, 0.25];
      // the preheater tower: 98 m, square, stepped in twice
      box(-16, 16, -14, 14, 0, 62, CONC, CONC2);
      box(-13, 13, -11, 11, 62, 84, CONC, CONC2);
      box(-9, 9, -8, 8, 84, 98, CONC2, [0.52,0.50,0.47]);
      // the stack beside it, banded
      for (let i = 0; i < 8; i++) {
        const w0 = i * 11, w1 = w0 + 11;
        box(30, 36, -3, 3, w0, w1, (i % 2) ? [0.78,0.76,0.71] : [0.58,0.24,0.19],
            CONC2);
      }
      // two rotary kilns, running away from the tower and tilted a little,
      // which is how a kiln is: it turns and the meal walks down it
      for (const off of [-22, 22]) {
        const SEG = 9;
        for (let i = 0; i < SEG; i++) {
          const u0 = 26 + i * 10, u1 = u0 + 10;
          const w0 = 26 - i * 1.1, w1 = w0 - 1.1;
          box(u0, u1, off - 3.2, off + 3.2, w0 - 3.2, w1 + 3.2,
              (i % 3 === 0) ? RUST2 : CONC2, CONC2);
        }
      }
      // clinker silos: four fat cylinders, drawn as octagons
      for (let k = 0; k < 4; k++) {
        const cu = -70 - (k % 2) * 34, cv = -30 + ((k / 2) | 0) * 60;
        const R = 15;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8 * Math.PI * 2, t1 = (i + 1) / 8 * Math.PI * 2;
          const p0 = [cu + Math.cos(t0) * R, cv + Math.sin(t0) * R];
          const p1 = [cu + Math.cos(t1) * R, cv + Math.sin(t1) * R];
          quad(P(p0[0], p0[1], 0), P(p1[0], p1[1], 0),
               P(p1[0], p1[1], 44), P(p0[0], p0[1], 44), i % 2 ? CONC : CONC2);
          tri(P(p0[0], p0[1], 44), P(p1[0], p1[1], 44), P(cu, cv, 47), CONC2);
        }
      }
      // the covered limestone store: a long barrel hall
      const HL = 96, HR = 26;
      for (let i = 0; i < 7; i++) {
        const t0 = Math.PI * i / 7, t1 = Math.PI * (i + 1) / 7;
        const v0 = 70 - Math.cos(t0) * HR, v1 = 70 - Math.cos(t1) * HR;
        const w0 = Math.sin(t0) * 20, w1 = Math.sin(t1) * 20;
        quad(P(-HL, v0, w0), P(HL, v0, w0), P(HL, v1, w1), P(-HL, v1, w1),
             (i % 2) ? [0.55,0.55,0.53] : [0.47,0.47,0.46]);
      }

    } else if (a.key === "futohaz") {
      // a plain running shed: a long hall with a shallow roof and end doors
      const HL = Math.max(18, a.hu), HW = Math.max(10, a.hv);
      box(-HL, HL, -HW, HW, 0, 9, LM_BRICK, LM_SLATE);
      quad(P(-HL - 0.3, -HW * 0.7, 0), P(-HL - 0.3, HW * 0.7, 0),
           P(-HL - 0.3, HW * 0.7, 6.5), P(-HL - 0.3, -HW * 0.7, 6.5), [0.16,0.15,0.14]);

    } else if (a.key === "carriageworks") {
      // Dunakeszi Járműjavító (Rolling stock manufacturing & repair plant):
      // Multiple parallel assembly workshop halls with sawtooth northlight roofs,
      // central traverser table pit, and passenger carriages parked outside.
      const CLAD = [0.62, 0.64, 0.68], ROOF_RIDGE = [0.42, 0.44, 0.48];
      const BRICK = [0.58, 0.38, 0.28], MAV_BLUE = [0.08, 0.24, 0.46];

      // 4 Main Assembly Workshop Halls with Sawtooth Gables
      for (let h = 0; h < 4; h++) {
        const v0 = -90 + h * 48, v1 = v0 + 38;
        box(-180, 180, v0, v1, 0, 13.5, (h % 2) ? CLAD : BRICK, ROOF_RIDGE);
        // Sawtooth roof ridge monitors along the length
        for (let r = -160; r <= 160; r += 24) {
          box(r - 8, r + 8, v0 + 4, v1 - 4, 13.5, 16.2, [0.72, 0.76, 0.80], [0.38, 0.42, 0.46]);
        }
      }
      // Central Traverser Pit (Tolópad)
      box(-16, 16, -110, 110, -0.4, 0.2, [0.32, 0.31, 0.30], [0.28, 0.27, 0.26]);
      // Traverser carriage bridge
      box(-14, 14, -12, 12, 0.1, 1.2, [0.82, 0.64, 0.18], [0.36, 0.36, 0.36]);

      // MÁV IC+ and Kiss passenger coaches on test tracks outside
      for (let c = 0; c < 5; c++) {
        const cx = 80 + (c % 3) * 32, cz = 115 + Math.floor(c / 3) * 22;
        box(cx - 12, cx + 12, cz - 1.4, cz + 1.4, 0.8, 4.2, MAV_BLUE, [0.78, 0.80, 0.82]);
        // White & yellow accent stripe
        box(cx - 11.5, cx + 11.5, cz - 1.45, cz + 1.45, 2.0, 2.6, [0.92, 0.88, 0.22], MAV_BLUE);
      }

    } else if (a.key === "samsung") {
      // Samsung SDI Göd Electric Vehicle Battery Gigafactory:
      // High-tech white & silver composite cleanroom halls, dark blue glass curtain
      // wall offices, automated high-bay warehouse towers, cooling towers, and tank farms.
      const CLEANROOM = [0.88, 0.90, 0.94], SILVER = [0.72, 0.74, 0.78];
      const BLUE_GLASS = [0.14, 0.28, 0.52], DARK_GREY = [0.32, 0.33, 0.35];

      // Main Cleanroom Battery Cell Production Mega-Hall (Block 1 & 2)
      box(-240, 240, -110, 90, 0, 24.0, CLEANROOM, SILVER);
      // Blue Glass Curtain-Wall Ribbon along administrative front
      box(-230, 230, -112, -108, 3.0, 22.0, BLUE_GLASS, CLEANROOM);

      // Automated High-Bay Warehouse (AS/RS Tower)
      box(-220, -100, 90, 180, 0, 38.0, SILVER, DARK_GREY);
      // Secondary Electrode & Module Assembly Hall
      box(-80, 230, 90, 170, 0, 20.0, CLEANROOM, SILVER);

      // Rooftop HVAC, scrubbers, and industrial air handling units
      for (let rx = -200; rx <= 200; rx += 50) {
        for (let rz = -70; rz <= 50; rz += 45) {
          box(rx - 8, rx + 8, rz - 6, rz + 6, 24.0, 27.5, DARK_GREY, [0.55, 0.56, 0.58]);
        }
      }

      // Nitrogen and chemical utility tanks
      for (let t = 0; t < 6; t++) {
        const tx = 160 + (t % 3) * 22, tz = -145 - Math.floor(t / 3) * 20;
        box(tx - 6, tx + 6, tz - 6, tz + 6, 0, 16.0, [0.82, 0.85, 0.88], [0.70, 0.72, 0.75]);
      }

    } else if (a.key === "hosok") {
      // Millenniumi emlékmű at Hősök tere:
      // Paved grand stone plaza, the 36 m Corinthian column carrying Archangel Gabriel,
      // the Seven Chieftains statue group, Hősök köve, and the two semicircular colonnades.
      const GOLD = [0.88, 0.76, 0.32], BRONZE = [0.32, 0.28, 0.24];
      const STONE = [0.82, 0.79, 0.72], STONE_D = [0.68, 0.65, 0.58];
      const PAVEMENT = [0.66, 0.65, 0.63];

      // Wide Paved Stone Plaza (Hősök tere square)
      box(-55, 55, -45, 45, 0, 0.4, PAVEMENT, STONE_D);

      // Hősök köve (Memorial Stone / Tomb of Unknown Soldier in front)
      box(-3.2, 3.2, 8.0, 13.0, 0.4, 1.35, STONE, STONE_D);

      // Stepped terrace base
      box(-16, 16, -12, 12, 0.4, 1.4, STONE, STONE);
      box(-12, 12, -8, 8, 1.4, 2.4, STONE_D, STONE);

      // Central Column Pedestal
      box(-3.5, 3.5, -3.5, 3.5, 2.4, 6.8, STONE, STONE_D);
      // Chieftains bronze statues around the pedestal
      for (let k = 0; k < 6; k++) {
        const ang = k / 6 * Math.PI * 2;
        const cx = Math.cos(ang) * 4.8, cy = Math.sin(ang) * 4.8;
        box(cx - 0.7, cx + 0.7, cy - 0.7, cy + 0.7, 2.4, 5.0, BRONZE, BRONZE);
      }

      // The Corinthian Column
      const N_COL = 8;
      for (let i = 0; i < N_COL; i++) {
        const t0 = i / N_COL * Math.PI * 2, t1 = (i + 1) / N_COL * Math.PI * 2;
        const r0 = 1.4, r1 = 1.05;
        const p0 = [Math.cos(t0) * r0, Math.sin(t0) * r0];
        const p1 = [Math.cos(t1) * r0, Math.sin(t1) * r0];
        const q0 = [Math.cos(t0) * r1, Math.sin(t0) * r1];
        const q1 = [Math.cos(t1) * r1, Math.sin(t1) * r1];
        quad(P(p0[0], p0[1], 6.8), P(p1[0], p1[1], 6.8),
             P(q1[0], q1[1], 36.5), P(q0[0], q0[1], 36.5),
             i % 2 ? STONE : STONE_D);
      }
      // Corinthian Capital
      box(-1.8, 1.8, -1.8, 1.8, 36.5, 38.6, STONE, GOLD);

      // Archangel Gabriel statue on top
      box(-0.6, 0.6, -0.6, 0.6, 38.6, 42.0, GOLD, GOLD);
      // Wings outstretched
      quad(P(-2.6, 0, 39.8), P(2.6, 0, 39.8),
           P(2.6, 0, 43.2), P(-2.6, 0, 43.2), GOLD);

      // The two semicircular colonnades behind the column
      for (const side of [-1, 1]) {
        const R_COL = 28.0;
        const NUM_SEGS = 7;
        const TH_FROM = Math.PI * 0.12, TH_TO = Math.PI * 0.46;
        for (let s = 0; s < NUM_SEGS; s++) {
          const t0 = TH_FROM + (TH_TO - TH_FROM) * (s / NUM_SEGS);
          const t1 = TH_FROM + (TH_TO - TH_FROM) * ((s + 1) / NUM_SEGS);
          const u0 = -Math.cos(t0) * R_COL, v0 = side * Math.sin(t0) * R_COL;
          const u1 = -Math.cos(t1) * R_COL, v1 = side * Math.sin(t1) * R_COL;
          box(Math.min(u0, u1) - 1.2, Math.max(u0, u1) + 1.2,
              Math.min(v0, v1) - 1.2, Math.max(v0, v1) + 1.2,
              0.4, 2.0, STONE_D, STONE);
          for (const radOff of [-1.1, 1.1]) {
            const cu = (u0 + u1) * 0.5 + radOff * Math.cos(t0);
            const cv = (v0 + v1) * 0.5 + side * radOff * Math.sin(t0);
            box(cu - 0.35, cu + 0.35, cv - 0.35, cv + 0.35, 2.0, 12.8, STONE, STONE_D);
          }
          box(Math.min(u0, u1) - 1.6, Math.max(u0, u1) + 1.6,
              Math.min(v0, v1) - 1.6, Math.max(v0, v1) + 1.6,
              12.8, 15.3, STONE, STONE_D);
          const mu = (u0 + u1) * 0.5, mv = (v0 + v1) * 0.5;
          box(mu - 0.4, mu + 0.4, mv - 0.4, mv + 0.4, 2.2, 5.4, BRONZE, BRONZE);
        }
      }
    } else if (a.key === "fellegvar") {
      // Visegrádi Fellegvár (High Castle Citadel perched on the mountain peak, km 43.0):
      // Medieval stone curtain walls, triangular keep, gate tower, and inner palace courtyard.
      const CASTLE = [0.72, 0.68, 0.62], CASTLE_D = [0.58, 0.54, 0.48];
      const ROOF = [0.56, 0.26, 0.18], WOOD = [0.42, 0.32, 0.22];

      // Stepped rocky foundation platform
      box(-55, 55, -35, 35, 0, 2.5, CASTLE_D, CASTLE_D);

      // Outer fortified curtain walls with crenellated battlements
      for (const side of [-1, 1]) {
        box(-50, 50, side * 30 - 2.2, side * 30 + 2.2, 2.0, 11.5, CASTLE, CASTLE_D);
        // Wall walk & battlements
        for (let bx = -46; bx <= 46; bx += 8) {
          box(bx - 2.0, bx + 2.0, side * 30 - 2.4, side * 30 + 2.4, 11.5, 13.0, CASTLE, CASTLE_D);
        }
      }
      box(-52, -48, -30, 30, 2.0, 12.0, CASTLE, CASTLE_D);
      box(48, 52, -30, 30, 2.0, 12.0, CASTLE, CASTLE_D);

      // Gate Tower with arched entrance
      box(-48, -34, -18, -4, 2.0, 19.5, CASTLE, ROOF);
      box(-49, -33, -15, -7, 2.0, 8.5, [0.18, 0.16, 0.15], CASTLE_D);

      // Triangular Upper Keep (Öregtorony)
      box(12, 46, -22, 22, 2.0, 24.0, CASTLE, ROOF);
      box(14, 44, -20, 20, 24.0, 29.5, ROOF, ROOF);

      // Palace Wing & Gothic residential halls
      box(-20, 15, -24, 8, 2.0, 16.5, CASTLE, ROOF);

      // Round bastion watchtowers at corners
      for (const [cx, cy] of [[-48, -28], [-48, 28], [48, -28], [48, 28]]) {
        const R = 5.5;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8 * Math.PI * 2, t1 = (i + 1) / 8 * Math.PI * 2;
          const p0 = [cx + Math.cos(t0) * R, cy + Math.sin(t0) * R];
          const p1 = [cx + Math.cos(t1) * R, cy + Math.sin(t1) * R];
          quad(P(p0[0], p0[1], 2.0), P(p1[0], p1[1], 2.0),
               P(p1[0], p1[1], 15.5), P(p0[0], p0[1], 15.5), (i % 2) ? CASTLE : CASTLE_D);
          tri(P(p0[0], p0[1], 15.5), P(p1[0], p1[1], 15.5), P(cx, cy, 20.0), ROOF);
        }
      }

    } else if (a.key === "salamon") {
      // Salamon-torony (Solomon's Keep on the Danube bank, km 42.8):
      // The iconic 6-storey hexagonal Romanesque residential keep tower with battlements.
      const STONE = [0.74, 0.70, 0.64], STONE_D = [0.60, 0.56, 0.50];
      const WOOD = [0.46, 0.35, 0.24], ROOF = [0.55, 0.24, 0.16];

      // Hexagonal 31m Keep Tower
      const R = 11.5;
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6 * Math.PI * 2, t1 = (i + 1) / 6 * Math.PI * 2;
        const p0 = [Math.cos(t0) * R, Math.sin(t0) * R];
        const p1 = [Math.cos(t1) * R, Math.sin(t1) * R];
        quad(P(p0[0], p0[1], 0), P(p1[0], p1[1], 0),
             P(p1[0], p1[1], 31.0), P(p0[0], p0[1], 31.0), (i % 2) ? STONE : STONE_D);

        // Romanesque paired arched windows on upper levels
        for (let fl = 12; fl <= 24; fl += 6) {
          const midX = (p0[0] + p1[0]) * 0.5, midY = (p0[1] + p1[1]) * 0.5;
          const winR = 1.1;
          quad(P(midX - winR, midY - winR, fl), P(midX + winR, midY + winR, fl),
               P(midX + winR, midY + winR, fl + 2.8), P(midX - winR, midY - winR, fl + 2.8),
               [0.15, 0.14, 0.14]);
        }
      }

      // Wooden defensive hoarding gallery & crenellated top
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6 * Math.PI * 2, t1 = (i + 1) / 6 * Math.PI * 2;
        const p0 = [Math.cos(t0) * (R + 1.2), Math.sin(t0) * (R + 1.2)];
        const p1 = [Math.cos(t1) * (R + 1.2), Math.sin(t1) * (R + 1.2)];
        quad(P(p0[0], p0[1], 28.5), P(p1[0], p1[1], 28.5),
             P(p1[0], p1[1], 33.5), P(p0[0], p0[1], 33.5), WOOD);
      }

      // Lower curtain wall and gatehouse
      box(-22, 22, -22, -18, 0, 8.5, STONE_D, STONE);
      box(-22, 22, 18, 22, 0, 8.5, STONE_D, STONE);
      box(-22, -18, -20, 20, 0, 8.5, STONE_D, STONE);

    } else if (a.key === "hulladek") {
      // Fővárosi Hulladékhasznosító Mű (Rákospalota Waste-to-Energy Incinerator, km 6.5):
      // The iconic 118m blue-and-yellow banded chimney stack and massive incineration boiler complex.
      const BLUE = [0.10, 0.48, 0.86], YELLOW = [0.96, 0.84, 0.12];
      const CONCRETE = [0.72, 0.74, 0.76], DARK_ROOF = [0.38, 0.40, 0.44];

      // Main Waste-to-Energy Boiler & Furnace Hall
      box(-38, 38, -28, 28, 0, 36.0, CONCRETE, DARK_ROOF);
      // Turbine & generator hall
      box(-35, 35, 28, 48, 0, 22.0, [0.60, 0.62, 0.65], DARK_ROOF);
      // Waste bunker & delivery truck ramp
      box(-65, -38, -25, 25, 0, 18.0, [0.52, 0.54, 0.56], DARK_ROOF);

      // Flue gas scrubber reactors (4 vertical towers)
      for (const [sx, sy] of [[-18, -38], [-6, -38], [6, -38], [18, -38]]) {
        box(sx - 3.2, sx + 3.2, sy - 3.2, sy + 3.2, 0, 28.0, [0.80, 0.82, 0.85], DARK_ROOF);
      }

      // The 118m Blue & Yellow Striped Chimney Stack
      const CHIM_X = 24.0, CHIM_Y = -12.0;
      const NUM_BANDS = 12;
      for (let b = 0; b < NUM_BANDS; b++) {
        const y0 = b * 9.8, y1 = (b + 1) * 9.8;
        const r0 = 5.4 - (b / NUM_BANDS) * 2.4;
        const r1 = 5.4 - ((b + 1) / NUM_BANDS) * 2.4;
        const bandCol = (b % 2 === 0) ? BLUE : YELLOW;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8 * Math.PI * 2, t1 = (i + 1) / 8 * Math.PI * 2;
          const p0 = [CHIM_X + Math.cos(t0) * r0, CHIM_Y + Math.sin(t0) * r0];
          const p1 = [CHIM_X + Math.cos(t1) * r0, CHIM_Y + Math.sin(t1) * r0];
          const q0 = [CHIM_X + Math.cos(t0) * r1, CHIM_Y + Math.sin(t0) * r1];
          const q1 = [CHIM_X + Math.cos(t1) * r1, CHIM_Y + Math.sin(t1) * r1];
          quad(P(p0[0], p0[1], y0), P(p1[0], p1[1], y0),
               P(q1[0], q1[1], y1), P(q0[0], q0[1], y1), bandCol);
        }
      }

    } else if (a.key === "ujpesteromu") {
      // Újpesti Erőmű (Thermal Cogeneration Power Plant, km 4.5):
      // Dual hyperbolic cooling towers, brick boiler house, turbine hall, and transformer yard.
      const COOL_COL = [0.68, 0.69, 0.71], BRICK = [0.62, 0.28, 0.22];

      // Dual Hyperbolic Cooling Towers
      for (const cx of [-35, 35]) {
        const cy = -15;
        const T_SEGS = 6;
        for (let s = 0; s < T_SEGS; s++) {
          const y0 = s * 8.0, y1 = (s + 1) * 8.0;
          const f0 = s / T_SEGS, f1 = (s + 1) / T_SEGS;
          const r0 = 14.0 - Math.sin(f0 * Math.PI * 0.8) * 4.5;
          const r1 = 14.0 - Math.sin(f1 * Math.PI * 0.8) * 4.5;
          for (let i = 0; i < 10; i++) {
            const t0 = i / 10 * Math.PI * 2, t1 = (i + 1) / 10 * Math.PI * 2;
            const p0 = [cx + Math.cos(t0) * r0, cy + Math.sin(t0) * r0];
            const p1 = [cx + Math.cos(t1) * r0, cy + Math.sin(t1) * r0];
            const q0 = [cx + Math.cos(t0) * r1, cy + Math.sin(t0) * r1];
            const q1 = [cx + Math.cos(t1) * r1, cy + Math.sin(t1) * r1];
            quad(P(p0[0], p0[1], y0), P(p1[0], p1[1], y0),
                 P(q1[0], q1[1], y1), P(q0[0], q0[1], y1), (i % 2) ? COOL_COL : [0.62, 0.63, 0.65]);
          }
        }
      }

      // Brick Boiler & Furnace Complex
      box(-42, 42, 12, 40, 0, 32.0, BRICK, [0.35, 0.36, 0.38]);
      // Dual brick smokestacks on roof
      for (const sx of [-18, 18]) {
        box(sx - 1.8, sx + 1.8, 24, 28, 32.0, 58.0, [0.55, 0.24, 0.18], [0.25, 0.25, 0.25]);
      }
      // High-voltage electrical substation switchyard
      box(-45, 45, 44, 62, 0, 0.6, [0.55, 0.56, 0.58], [0.55, 0.56, 0.58]);

    } else if (a.key === "szennyviz") {
      // Észak-Pesti Szennyvíztisztító Telep (North Pest Wastewater Treatment Plant, km 8.2):
      // 6 large circular clarifier water basins, egg-shaped digester domes, and control buildings.
      const RIM = [0.70, 0.72, 0.74], WATER_SURF = [0.15, 0.36, 0.42];
      const DIGESTER = [0.82, 0.84, 0.88];

      // 6 Circular Clarifier / Aeration Basins
      const BASINS = [[-42, -30], [0, -30], [42, -30], [-42, 18], [0, 18], [42, 18]];
      for (const [bx, by] of BASINS) {
        const R = 15.5;
        // Basin circular water plane & concrete rim
        for (let i = 0; i < 10; i++) {
          const t0 = i / 10 * Math.PI * 2, t1 = (i + 1) / 10 * Math.PI * 2;
          const p0 = [bx + Math.cos(t0) * R, by + Math.sin(t0) * R];
          const p1 = [bx + Math.cos(t1) * R, by + Math.sin(t1) * R];
          // Concrete retaining wall
          quad(P(p0[0], p0[1], 0), P(p1[0], p1[1], 0),
               P(p1[0], p1[1], 3.2), P(p0[0], p0[1], 3.2), RIM);
          // Water surface
          tri(P(bx, by, 2.6), P(p0[0], p0[1], 2.6), P(p1[0], p1[1], 2.6), WATER_SURF);
        }
        // Rotating scraper bridge arm across the basin
        quad(P(bx - R, by - 0.4, 3.4), P(bx + R, by - 0.4, 3.4),
             P(bx + R, by + 0.4, 3.4), P(bx - R, by + 0.4, 3.4), [0.88, 0.85, 0.20]);
      }

      // 2 Egg-shaped Anaerobic Digester Domes
      for (const dx of [-25, 25]) {
        const dy = 55;
        const D_RAD = 11.0;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8 * Math.PI * 2, t1 = (i + 1) / 8 * Math.PI * 2;
          const p0 = [dx + Math.cos(t0) * D_RAD, dy + Math.sin(t0) * D_RAD];
          const p1 = [dx + Math.cos(t1) * D_RAD, dy + Math.sin(t1) * D_RAD];
          quad(P(p0[0], p0[1], 0), P(p1[0], p1[1], 0),
               P(p1[0], p1[1], 18.0), P(p0[0], p0[1], 18.0), DIGESTER);
          tri(P(dx, dy, 24.0), P(p0[0], p0[1], 18.0), P(p1[0], p1[1], 18.0), DIGESTER);
        }
      }

    } else if (a.key === "megyeri") {
      // Megyeri híd: the deck and its piers are the road layer's, from the
      // OSM ways (geom.js). The model adds what the data does not carry: the
      // two 99 m pylons and their fans of stays, over the main (Pest-side)
      // channel. Where that channel is comes from the ground under the axis:
      // the longest run of river along it; the pylons stand 150 m either side
      // of its middle, which is the 300 m main span.
      const PYLON = [0.94, 0.95, 0.97], CABLE = [0.88, 0.90, 0.94], FOOT = [0.70, 0.71, 0.73];
      const wy = waterAt ? waterAt(a.y) : g;
      let best = [0, 0], run0 = null;
      for (let u = -a.hu; u <= a.hu + 10; u += 10) {
        const q = P(u, 0, 0);
        const wet = u <= a.hu && demAt(q[0], q[2]) < wy + 0.6;
        if (wet && run0 === null) run0 = u;
        if (!wet && run0 !== null) { if (u - run0 > best[1] - best[0]) best = [run0, u]; run0 = null; }
      }
      const mid = (best[0] + best[1]) / 2;
      const DECK = 14.8;
      for (const px of [mid - 150, mid + 150]) {
        box(px - 9, px + 9, -18, 18, 0, 8.0, FOOT, FOOT);
        const topH = 99.0;
        for (const sgn of [-1, 1]) {
          const legB = sgn * 15.0;
          quad(P(px - 3.0, legB - 2.2, 8.0), P(px + 3.0, legB - 2.2, 8.0),
               P(px + 2.0, 0, topH), P(px - 2.0, 0, topH), PYLON);
          quad(P(px - 3.0, legB + 2.2, 8.0), P(px + 3.0, legB + 2.2, 8.0),
               P(px + 2.0, 0, topH), P(px - 2.0, 0, topH), PYLON);
          quad(P(px - 3.0, legB - 2.2, 8.0), P(px - 3.0, legB + 2.2, 8.0),
               P(px - 2.0, 0, topH), P(px - 2.0, 0, topH), PYLON);
          quad(P(px + 3.0, legB + 2.2, 8.0), P(px + 3.0, legB - 2.2, 8.0),
               P(px + 2.0, 0, topH), P(px + 2.0, 0, topH), PYLON);
        }
        box(px - 3.0, px + 3.0, -16, 16, DECK - 3.2, DECK - 0.4, PYLON, PYLON);
        // the stays, a fan each way on both sides, anchored at the deck edge
        for (let k = 1; k <= 11; k++) {
          const reach = k * 13.0;
          const h = topH - 2 - (11 - k) * 3.2;
          for (const sgn of [-1, 1]) {
            const sideV = sgn * 15.5;
            for (const dir of [-1, 1]) {
              quad(P(px, 0, h), P(px, 0, h + 0.45),
                   P(px + dir * reach, sideV, DECK), P(px + dir * reach, sideV, DECK - 0.45), CABLE);
            }
          }
        }
      }

    } else if (a.key === "eszakivasut") {
      // Újpesti vasúti híd (Északi összekötő vasúti híd, km 7.2):
      // Continuous 1,080m green steel through-truss railway bridge extending firmly onto the Óbuda riverbank.
      const TRUSS = [0.18, 0.44, 0.28], PIER = [0.70, 0.68, 0.64], TRACK_BED = [0.38, 0.39, 0.40];
      // spans fitted to the OSM length of the bridge (the anchor's hu)
      const NUM_SPANS = Math.max(4, Math.round(2 * a.hu / 60));
      const SPAN_W = 2 * a.hu / NUM_SPANS;
      for (let s = 0; s < NUM_SPANS; s++) {
        const x0 = -a.hu + s * SPAN_W, x1 = x0 + SPAN_W;
        // Concrete River Pier at each span junction
        box(x0 - 5.0, x0 + 5.0, -7.5, 7.5, 0, 10.5, PIER, PIER);
        // Railway track deck
        box(x0, x1, -4.5, 4.5, 10.0, 11.2, TRACK_BED, TRACK_BED);

        // Steel Warren Through-Truss structure (top chords, bottom chords, diagonals)
        const trussH = 9.5;
        for (const sgn of [-1, 1]) {
          const tv = sgn * 4.4;
          // Bottom chord & top chord
          quad(P(x0, tv - 0.3, 10.5), P(x1, tv - 0.3, 10.5),
               P(x1, tv + 0.3, 10.5), P(x0, tv + 0.3, 10.5), TRUSS);
          quad(P(x0 + 6.0, tv - 0.3, 10.5 + trussH), P(x1 - 6.0, tv - 0.3, 10.5 + trussH),
               P(x1 - 6.0, tv + 0.3, 10.5 + trussH), P(x0 + 6.0, tv + 0.3, 10.5 + trussH), TRUSS);
          // Diagonal lattice cross-braces (Warren truss triangles)
          const N_BAYS = 4;
          for (let b = 0; b < N_BAYS; b++) {
            const bx0 = x0 + b * (SPAN_W / N_BAYS), bx1 = x0 + (b + 1) * (SPAN_W / N_BAYS);
            quad(P(bx0, tv, 10.5), P(bx0 + 0.6, tv, 10.5),
                 P(bx1, tv, 10.5 + trussH), P(bx1 - 0.6, tv, 10.5 + trussH), TRUSS);
            quad(P(bx1, tv, 10.5), P(bx1 + 0.6, tv, 10.5),
                 P(bx0, tv, 10.5 + trussH), P(bx0 - 0.6, tv, 10.5 + trussH), TRUSS);
          }
        }
        // Overhead wind bracing portal frames
        for (let bx = x0 + 10.0; bx <= x1 - 10.0; bx += 15.0) {
          quad(P(bx - 0.3, -4.4, 10.5 + trussH), P(bx + 0.3, -4.4, 10.5 + trussH),
               P(bx + 0.3, 4.4, 10.5 + trussH), P(bx - 0.3, 4.4, 10.5 + trussH), TRUSS);
        }
      }
      box(a.hu - 5, a.hu + 5, -7.5, 7.5, 0, 10.5, PIER, PIER);

    } else if (a.key === "arpadhid" || a.key === "margithid") {
      // Drawn by the road layer from their OSM ways, deck and piers: the
      // hand models here were straight lines laid across bridges that bend
      // (Margit híd turns 30° at the island), so there were two of each.

    } else if (a.key === "lanchid") {
      // Széchenyi Lánchíd (1849). The towers stand on the two pylons OSM maps
      // (bridge:support=pylon), 202 m apart, and the side spans are 89 m, so
      // the chains come down to abutments 380 m apart. The road on it is the
      // road layer's deck; this is the stone and the iron.
      const STONE = [0.80, 0.77, 0.70], STONE_D = [0.64, 0.61, 0.56], IRON = [0.24, 0.25, 0.27];
      const T = a.tw || 101, E = T + 89;
      box(-E, E, -8.5, 8.5, 10.4, 12.0, [0.45, 0.46, 0.48], [0.32, 0.33, 0.35]);
      for (const tx of [-T, T]) {
        // pier in the river, the two legs of the arch, the arch head and the
        // cornice with its crest
        box(tx - 13, tx + 13, -14, 14, 0, 11.0, STONE_D, STONE_D);
        box(tx - 7.5, tx + 7.5, -12.5, -4.8, 11.0, 42.0, STONE, STONE_D);
        box(tx - 7.5, tx + 7.5, 4.8, 12.5, 11.0, 42.0, STONE, STONE_D);
        box(tx - 7.5, tx + 7.5, -4.8, 4.8, 30.0, 42.0, STONE, STONE_D);
        // the round head of the archway
        for (let k = 0; k < 6; k++) {
          const a0 = k / 6 * Math.PI, a1 = (k + 1) / 6 * Math.PI;
          const v0 = -Math.cos(a0) * 4.8, v1 = -Math.cos(a1) * 4.8;
          const w0 = 26 + Math.sin(a0) * 4.0, w1 = 26 + Math.sin(a1) * 4.0;
          for (const e of [tx - 7.5, tx + 7.5])
            quad(P(e, v0, w0), P(e, v1, w1), P(e, v1, 30), P(e, v0, 30), STONE);
        }
        box(tx - 8.2, tx + 8.2, -13.2, 13.2, 42.0, 44.0, STONE_D, STONE_D);
        box(tx - 6.5, tx + 6.5, -10, 10, 44.0, 47.5, STONE, STONE);
      }
      // the chains: sag between the towers, straight down to the abutments
      for (const sgn of [-1, 1]) {
        const cv = sgn * 8.8;
        const N_SEGS = 40;
        const f = x => Math.abs(x) <= T ? 13.0 + Math.pow(x / T, 2) * 30.0
                                         : 43.0 - (Math.abs(x) - T) / 89 * 31.0;
        for (let i = 0; i < N_SEGS; i++) {
          const x0 = -E + (2 * E * i) / N_SEGS, x1 = -E + (2 * E * (i + 1)) / N_SEGS;
          const f0 = f(x0), f1 = f(x1);
          quad(P(x0, cv - 0.25, f0), P(x1, cv - 0.25, f1), P(x1, cv + 0.25, f1), P(x0, cv + 0.25, f0), IRON);
          quad(P(x0, cv, f0 - 0.9), P(x1, cv, f1 - 0.9), P(x1, cv, f1), P(x0, cv, f0), IRON);
          if (i % 2 === 0 && f0 > 13.2)
            quad(P(x0 - 0.1, cv, 12.0), P(x0 + 0.1, cv, 12.0), P(x0 + 0.1, cv, f0), P(x0 - 0.1, cv, f0), IRON);
        }
      }
      // the lions on their pedestals at both bridgeheads
      for (const bx of [-E + 4, E - 4])
        for (const by of [-10.5, 10.5])
          box(bx - 3.5, bx + 3.5, by - 1.8, by + 1.8, 12.0, 15.5, STONE_D, STONE);

    } else if (a.key === "portal") {
      // a road tunnel mouth (the Alagút under Castle Hill): a stone face
      // across the road with a dark arched opening; u runs into the tunnel
      const ST = [0.76, 0.72, 0.64], DARK = [0.06, 0.06, 0.07];
      const hw = a.hv;
      box(-1.5, 0.0, -hw - 3, -hw, 0, 11, ST, ST);
      box(-1.5, 0.0, hw, hw + 3, 0, 11, ST, ST);
      box(-1.5, 0.0, -hw - 3, hw + 3, 7.5, 11.5, ST, ST);
      quad(P(-0.2, -hw, 0), P(-0.2, hw, 0), P(-0.2, hw, 7.5), P(-0.2, -hw, 7.5), DARK);
      box(0, 30, -hw - 3, hw + 3, 7.5, 16, ST, [0.34, 0.40, 0.26]);   // the hill over it

    } else if (a.key === "bigwheel") {
      // The Budapest Eye on Erzsébet tér, 65 m (OSM height): a white rim on
      // an A-frame, gondolas round the outside. The wheel stands in the long
      // axis of its OSM footprint.
      const STEEL = [0.90, 0.91, 0.92], GOND = [0.86, 0.30, 0.26], BASE = [0.46, 0.47, 0.49];
      const H = a.h || 65, R = (H - 6) / 2, hub = 6 + R;
      box(-10, 10, -6, 6, 0, 2.2, BASE, BASE);
      const NS = 48;
      for (const vv of [-1.4, 1.4]) {
        for (let k = 0; k < NS; k++) {
          const t0 = k / NS * Math.PI * 2, t1 = (k + 1) / NS * Math.PI * 2;
          const u0 = Math.cos(t0) * R, w0 = hub + Math.sin(t0) * R;
          const u1 = Math.cos(t1) * R, w1 = hub + Math.sin(t1) * R;
          quad(P(u0, vv, w0), P(u1, vv, w1), P(u1 * 0.97, vv, hub + (w1 - hub) * 0.97), P(u0 * 0.97, vv, hub + (w0 - hub) * 0.97), STEEL);
          if (k % 2 === 0)                                  // the spokes
            quad(P(0, vv, hub - 0.2), P(0, vv, hub + 0.2), P(u0, vv, w0 + 0.15), P(u0, vv, w0 - 0.15), STEEL);
        }
      }
      for (let k = 0; k < 42; k++) {                         // gondolas, hanging
        const t = k / 42 * Math.PI * 2;
        const u = Math.cos(t) * (R + 1.2), w = hub + Math.sin(t) * (R + 1.2) - 2.4;
        box(u - 1.1, u + 1.1, -1.2, 1.2, w, w + 2.2, GOND, STEEL);
      }
      for (const vv of [-7, 7])                              // the A-frame
        for (const uu of [-13, 13])
          quad(P(uu - 0.7, vv, 2), P(uu + 0.7, vv, 2), P(0.5, vv * 0.25, hub), P(-0.5, vv * 0.25, hub), STEEL);
      box(-1.2, 1.2, -2.5, 2.5, hub - 1.2, hub + 1.2, STEEL, STEEL);

    } else if (a.key === "budavar") {
      // The dome of the royal palace over the Danube wing. The palace itself
      // is the OSM outline (bake_context gives it its real 24 m); OSM has no
      // part for the dome, so this is: a drum with columns, a ribbed copper-
      // green dome, a lantern and the crown and cross on top — about 60 m
      // over the courtyard.
      const DRUM = [0.78, 0.74, 0.64], DOMEC = [0.36, 0.50, 0.45], GOLD = [0.80, 0.66, 0.30];
      // the palace stands on the lowest ground under its outline (geom.js),
      // so the dome's base is that plus the 24 m of the wing
      let gg = g;
      for (let dx = -60; dx <= 60; dx += 20) for (let dy = -60; dy <= 60; dy += 20) {
        const d = demAt(a.x + dx, a.y + dy); if (isFinite(d)) gg = Math.min(gg, d);
      }
      const base = gg - g + 23.0;
      const N = 16, R1 = 13.5;
      // square base block the dome rises out of, and the drum
      box(-15, 15, -15, 15, 0, base + 3, DRUM, DRUM);
      for (let k = 0; k < N; k++) {
        const t0 = k / N * Math.PI * 2, t1 = (k + 1) / N * Math.PI * 2;
        const c0 = [Math.cos(t0) * R1, Math.sin(t0) * R1], c1 = [Math.cos(t1) * R1, Math.sin(t1) * R1];
        quad(P(c0[0], c0[1], base + 3), P(c1[0], c1[1], base + 3), P(c1[0], c1[1], base + 16), P(c0[0], c0[1], base + 16), DRUM);
        // columns standing proud of the drum
        box(c0[0] * 1.08 - 0.6, c0[0] * 1.08 + 0.6, c0[1] * 1.08 - 0.6, c0[1] * 1.08 + 0.6, base + 3, base + 15, [0.86, 0.83, 0.74]);
        // the dome, on a slightly pointed profile, with a rib on every seam
        const RINGS = 7;
        for (let r = 0; r < RINGS; r++) {
          const s0 = r / RINGS, s1 = (r + 1) / RINGS;
          const k0 = Math.cos(s0 * Math.PI * 0.5), k1 = Math.cos(s1 * Math.PI * 0.5);
          const h0 = base + 16 + Math.sin(s0 * Math.PI * 0.5) * 17, h1 = base + 16 + Math.sin(s1 * Math.PI * 0.5) * 17;
          const col = k % 2 ? DOMEC : [DOMEC[0] * 0.86, DOMEC[1] * 0.86, DOMEC[2] * 0.86];
          quad(P(c0[0] * k0, c0[1] * k0, h0), P(c1[0] * k0, c1[1] * k0, h0),
               P(c1[0] * k1, c1[1] * k1, h1), P(c0[0] * k1, c0[1] * k1, h1), col);
        }
      }
      // lantern, crown, cross
      box(-2.4, 2.4, -2.4, 2.4, base + 32, base + 38, DRUM, DOMEC);
      box(-1.4, 1.4, -1.4, 1.4, base + 38, base + 40.5, GOLD, GOLD);
      box(-0.25, 0.25, -0.25, 0.25, base + 40.5, base + 44, GOLD, GOLD);
      box(-1.2, 1.2, -0.25, 0.25, base + 42.4, base + 43, GOLD, GOLD);

    } else if (a.key === "diadaliv") {
      // Váci Diadalív (Stone Triumphal Arch of Vác, 1764, km 34.0):
      // Hungary's only Baroque stone triumphal arch.
      const ARCH = [0.82, 0.80, 0.74], ARCH_D = [0.65, 0.63, 0.58], GOLD = [0.86, 0.72, 0.20];
      // Stepped plinth base
      box(-6.5, 6.5, -4.2, 4.2, 0, 1.2, ARCH_D, ARCH_D);
      // Left and right stone arch piers
      box(-6.0, -2.4, -3.8, 3.8, 1.2, 11.5, ARCH, ARCH_D);
      box(2.4, 6.0, -3.8, 3.8, 1.2, 11.5, ARCH, ARCH_D);
      // Classical decorative pilasters
      for (const px of [-5.2, -3.2, 3.2, 5.2]) {
        for (const py of [-4.0, 4.0]) {
          box(px - 0.4, px + 0.4, py - 0.3, py + 0.3, 1.2, 11.8, ARCH, GOLD);
        }
      }
      // Arch vault header & entablature
      box(-6.2, 6.2, -4.0, 4.0, 11.5, 14.5, ARCH, ARCH_D);
      // Top attic pedestal with gilded inscription
      box(-4.5, 4.5, -2.8, 2.8, 14.5, 17.5, ARCH, GOLD);

    } else if (a.key === "parlament") {
      // Országház (Hungarian Parliament Building on the Danube bank):
      // Symmetrical neo-Gothic facade, central 96m dome and spire, and copper pavilion roofs.
      const GOTHIC = [0.84, 0.82, 0.76], GOTHIC_D = [0.68, 0.66, 0.60];
      const COPPER = [0.28, 0.56, 0.46], GOLD = [0.90, 0.76, 0.24];
      // Main central palace block
      box(-130, 130, -32, 32, 0, 26.0, GOTHIC, COPPER);
      // Symmetrical north and south chamber wings
      box(-125, -60, -40, 40, 0, 28.0, GOTHIC, COPPER);
      box(60, 125, -40, 40, 0, 28.0, GOTHIC, COPPER);
      // Central 96m Parliament Dome & Spire
      const D_RAD = 16.0;
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12 * Math.PI * 2, t1 = (i + 1) / 12 * Math.PI * 2;
        const p0 = [Math.cos(t0) * D_RAD, Math.sin(t0) * D_RAD];
        const p1 = [Math.cos(t1) * D_RAD, Math.sin(t1) * D_RAD];
        quad(P(p0[0], p0[1], 26.0), P(p1[0], p1[1], 26.0),
             P(p1[0], p1[1], 52.0), P(p0[0], p0[1], 52.0), (i % 2) ? GOTHIC : GOTHIC_D);
        tri(P(0, 0, 78.0), P(p0[0], p0[1], 52.0), P(p1[0], p1[1], 52.0), COPPER);
      }
      // Top Lantern & Spire needle
      box(-1.2, 1.2, -1.2, 1.2, 78.0, 96.0, GOLD, GOLD);

    } else if (a.key === "bazilika") {
      // Szent István-bazilika (St. Stephen's Basilica, 96m dome & twin bell towers):
      const STONE = [0.82, 0.78, 0.72], COPPER = [0.26, 0.54, 0.44];
      box(-38, 38, -26, 26, 0, 28.0, STONE, COPPER);
      // Twin front bell towers
      box(-36, -20, 26, 42, 0, 68.0, STONE, COPPER);
      box(20, 36, 26, 42, 0, 68.0, STONE, COPPER);
      // Central 96m Drum Dome
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10 * Math.PI * 2, t1 = (i + 1) / 10 * Math.PI * 2;
        const p0 = [Math.cos(t0) * 14.0, Math.sin(t0) * 14.0];
        const p1 = [Math.cos(t1) * 14.0, Math.sin(t1) * 14.0];
        quad(P(p0[0], p0[1], 28.0), P(p1[0], p1[1], 28.0),
             P(p1[0], p1[1], 58.0), P(p0[0], p0[1], 58.0), STONE);
        tri(P(0, 0, 84.0), P(p0[0], p0[1], 58.0), P(p1[0], p1[1], 58.0), COPPER);
      }
      box(-1.5, 1.5, -1.5, 1.5, 84.0, 96.0, [0.88, 0.75, 0.22], [0.88, 0.75, 0.22]);

    } else if (a.key === "gellert") {
      // Gellért-hegy & Szabadság-szobor (Citadel Fortress & 14m Liberty Statue):
      const CLIFF = [0.55, 0.52, 0.46], BRONZE = [0.22, 0.38, 0.30], BASE = [0.80, 0.78, 0.74];
      // Rocky bluff plateau
      box(-75, 75, -55, 55, 0, 35.0, CLIFF, [0.42, 0.48, 0.36]);
      // Habsburg Citadella stone fortress walls
      box(-60, 60, -40, 40, 35.0, 44.0, [0.70, 0.66, 0.60], [0.55, 0.52, 0.48]);
      // Liberty Statue (Szabadság-szobor) Stone Pedestal (26m)
      box(-3.5, 3.5, -3.5, 3.5, 44.0, 70.0, BASE, BASE);
      // 14m Bronze Female Figure holding palm leaf aloft
      box(-1.2, 1.2, -1.2, 1.2, 70.0, 84.0, BRONZE, BRONZE);
      // Palm leaf held aloft by both hands
      quad(P(-3.0, 0, 80.0), P(3.0, 0, 80.0), P(3.0, 0, 86.0), P(-3.0, 0, 86.0), [0.28, 0.46, 0.36]);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}

// ------------------------------------------------------------ trainsheds
//
// Nyugati Pályaudvar Eiffel Hall:
// Hollow interior with arched wrought-iron lattice trusses, glass gables,
// raised passenger platforms (peronok), buffer stops with red lanterns,
// and waiting passenger silhouettes.

const SHED_IRON  = [0.28, 0.27, 0.26];
const SHED_GLAZE = [0.42, 0.52, 0.55];
const SHED_GABLE = [0.50, 0.60, 0.63];
const SHED_STONE = [0.62, 0.58, 0.52];
const ROOF_METAL = [0.60, 0.62, 0.64];
const PERON_COL  = [0.68, 0.66, 0.64];
const PERON_EDGE = [0.88, 0.80, 0.22];
const PERSON_COL = [0.14, 0.15, 0.17];

export function buildTrainsheds(sheds) {
  const V = [], C = [];
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => { push(a,col); push(b,col); push(c,col);
                                      push(a,col); push(c,col); push(d,col); };

  for (const s of sheds || []) {
    const P = (u, v, w) => [s.c[0] + s.fx * u + s.nx * v, s.railY + w,
                            s.c[1] + s.fy * u + s.ny * v];

    const vc = (s.vLo + s.vHi) / 2;
    const half = Math.max(16, Math.min(23, (s.vHi - s.vLo) / 2 + 4));
    const SPRING = Math.max(7.5, s.eave - s.railY);
    const RISE = Math.max(11, Math.min(17, half * 0.80));
    const u0 = s.u0 + 26, u1 = s.u1;
    if (!(u1 - u0 > 30)) continue;

    // Nyugati's hall is PITCHED, not a barrel: two iron-and-glass slopes to a
    // ridge that carries a raised lantern. The street front is the famous
    // part — a wall of glass in an iron grid under the gable, between two
    // stone towers with slate caps and a clock each, with stone wings running
    // off along the Nagykörút.
    const BAYS = Math.max(8, Math.round((u1 - u0) / 9.5));
    const CROWN = SPRING + RISE;
    const LANT = 2.6, LW = half * 0.16;      // lantern height and half width
    // cross-section, left edge to right: [v, w]
    const prof = [[vc - half, SPRING], [vc - LW, CROWN - RISE * LW / half],
                  [vc - LW, CROWN - RISE * LW / half + LANT], [vc + LW, CROWN - RISE * LW / half + LANT],
                  [vc + LW, CROWN - RISE * LW / half], [vc + half, SPRING]];
    for (let i = 0; i < prof.length - 1; i++) {
      const [v0, w0] = prof[i], [v1, w1] = prof[i + 1];
      const vertical = Math.abs(v1 - v0) < 0.01;
      // The real roof is pale grey sheet metal with the glazing in a band
      // up by the ridge, not dark stripes all over (see the aerial photos).
      for (let b = 0; b < BAYS; b++) {
        const f0 = u0 + (u1 - u0) * b / BAYS, f1 = u0 + (u1 - u0) * (b + 1) / BAYS;
        if (vertical) {
          quad(P(f0, v0, w0), P(f0, v1, w1), P(f1, v1, w1), P(f1, v0, w0), SHED_GLAZE);
          continue;
        }
        // split the slope: metal below, glass band above (towards the ridge)
        const hi = Math.abs(v0 - vc) < Math.abs(v1 - vc) ? 0 : 1;   // which end is the ridge
        const vm = v0 + (v1 - v0) * (hi ? 0.62 : 0.38), wm = w0 + (w1 - w0) * (hi ? 0.62 : 0.38);
        const [la, lb] = hi ? [[v0, w0], [vm, wm]] : [[vm, wm], [v1, w1]];   // metal part
        const [ga, gb] = hi ? [[vm, wm], [v1, w1]] : [[v0, w0], [vm, wm]];   // glass part
        quad(P(f0, la[0], la[1]), P(f0, lb[0], lb[1]), P(f1, lb[0], lb[1]), P(f1, la[0], la[1]), ROOF_METAL);
        quad(P(f0, ga[0], ga[1]), P(f0, gb[0], gb[1]), P(f1, gb[0], gb[1]), P(f1, ga[0], ga[1]),
             (b % 3) ? SHED_GLAZE : SHED_IRON);
      }
    }
    // the gable ends: glass in an iron grid. Mullions every 2.6 m, transoms
    // every 3 m, drawn as thin iron strips just proud of the glass.
    for (const [ue, out] of [[u0, -1], [u1, 1]]) {
      const topAt = (v) => {
        for (let i = 0; i < prof.length - 1; i++) {
          const [v0, w0] = prof[i], [v1, w1] = prof[i + 1];
          if (v >= Math.min(v0, v1) && v <= Math.max(v0, v1) && Math.abs(v1 - v0) > 0.01)
            return w0 + (w1 - w0) * (v - v0) / (v1 - v0);
        }
        return SPRING;
      };
      const N = 24;
      for (let k = 0; k < N; k++) {
        const va = vc - half + 2 * half * k / N, vb = vc - half + 2 * half * (k + 1) / N;
        quad(P(ue, va, 0), P(ue, vb, 0), P(ue, vb, topAt(vb)), P(ue, va, topAt(va)), SHED_GABLE);
      }
      const e = ue + out * 0.12;
      for (let v = vc - half; v <= vc + half + 0.01; v += 2.6)
        quad(P(e, v - 0.14, 0), P(e, v + 0.14, 0), P(e, v + 0.14, topAt(v)), P(e, v - 0.14, topAt(v)), SHED_IRON);
      for (let w = 3; w < CROWN; w += 3) {
        let vl = vc - half, vr = vc + half;
        if (w > SPRING) { const d = half * (w - SPRING) / RISE; vl = vc - half + d; vr = vc + half - d; }
        if (vr - vl < 1) break;
        quad(P(e, vl, w - 0.12), P(e, vr, w - 0.12), P(e, vr, w + 0.12), P(e, vl, w + 0.12), SHED_IRON);
      }
      // the stone frame round the gable
      quad(P(e, vc - half - 0.6, SPRING - 0.4), P(e, vc, CROWN + LANT - 0.4),
           P(e, vc, CROWN + LANT + 1.0), P(e, vc - half - 0.6, SPRING + 1.0), SHED_STONE);
      quad(P(e, vc, CROWN + LANT - 0.4), P(e, vc + half + 0.6, SPRING - 0.4),
           P(e, vc + half + 0.6, SPRING + 1.0), P(e, vc, CROWN + LANT + 1.0), SHED_STONE);
    }

    // the two towers at the street front and the wings along the körút
    const box = (ua, ub, va, vb, wa, wb, side, top) => {
      quad(P(ua, va, wa), P(ub, va, wa), P(ub, va, wb), P(ua, va, wb), side);
      quad(P(ub, vb, wa), P(ua, vb, wa), P(ua, vb, wb), P(ub, vb, wb), side);
      quad(P(ua, vb, wa), P(ua, va, wa), P(ua, va, wb), P(ua, vb, wb), side);
      quad(P(ub, va, wa), P(ub, vb, wa), P(ub, vb, wb), P(ub, va, wb), side);
      quad(P(ua, va, wb), P(ub, va, wb), P(ub, vb, wb), P(ua, vb, wb), top || side);
    };
    const SLATE = [0.24, 0.26, 0.29], CLOCK = [0.92, 0.90, 0.82];
    // The two pavilions stand right against the corners of the hall front,
    // about eaves-high in stone, under dark mansard domes with a small
    // cupola on top — not tall detached towers.
    const TW = 7.0, TH = SPRING + RISE * 0.45;
    for (const sg of [-1, 1]) {
      const vIn = vc + sg * (half - 0.5), vOut = vc + sg * (half - 0.5 + 2 * TW);
      const va = Math.min(vIn, vOut), vb = Math.max(vIn, vOut), vm = (va + vb) / 2;
      box(u0 - 3, u0 + 12, va, vb, 0, TH, SHED_STONE, SHED_STONE);
      box(u0 - 3.4, u0 + 12.4, va - 0.4, vb + 0.4, TH - 1.2, TH, [0.70, 0.66, 0.58]);   // cornice
      // mansard dome: steep lower slope, flatter upper, then a cupola
      const cu = u0 + 4.5, r0 = TW + 0.2, rl = 7.9;
      const cap = [[cu - rl, vm - r0], [cu + rl, vm - r0], [cu + rl, vm + r0], [cu - rl, vm + r0]];
      for (let k = 0; k < 4; k++) {
        const [pa, pb] = [cap[k], cap[(k + 1) % 4]];
        const mid = (q, f) => [cu + (q[0] - cu) * f, vm + (q[1] - vm) * f];
        const ma = mid(pa, 0.72), mb = mid(pb, 0.72), na = mid(pa, 0.3), nb = mid(pb, 0.3);
        quad(P(pa[0], pa[1], TH), P(pb[0], pb[1], TH), P(mb[0], mb[1], TH + 6), P(ma[0], ma[1], TH + 6), SLATE);
        quad(P(ma[0], ma[1], TH + 6), P(mb[0], mb[1], TH + 6), P(nb[0], nb[1], TH + 8.5), P(na[0], na[1], TH + 8.5), SLATE);
      }
      box(cu - 1.6, cu + 1.6, vm - 1.6, vm + 1.6, TH + 8.5, TH + 11.5, SHED_STONE, SLATE);   // cupola
      box(cu - 0.2, cu + 0.2, vm - 0.2, vm + 0.2, TH + 11.5, TH + 14, SLATE);            // spire
      // clock on the street face
      quad(P(u0 - 3.1, vm - 1.5, TH - 5.6), P(u0 - 3.1, vm + 1.5, TH - 5.6),
           P(u0 - 3.1, vm + 1.5, TH - 2.6), P(u0 - 3.1, vm - 1.5, TH - 2.6), CLOCK);
      // the wing, three storeys with a slate roof
      const wIn = sg > 0 ? vb : va, wOut = wIn + sg * 34;
      box(u0, u0 + 14, Math.min(wIn, wOut), Math.max(wIn, wOut), 0, 15, SHED_STONE, SLATE);
      for (let fl = 0; fl < 3; fl++)
        for (let v = Math.min(wIn, wOut) + 2; v < Math.max(wIn, wOut) - 1.5; v += 3.4)
          quad(P(u0 - 0.08, v, 3 + fl * 4), P(u0 - 0.08, v + 1.4, 3 + fl * 4),
               P(u0 - 0.08, v + 1.4, 5.4 + fl * 4), P(u0 - 0.08, v, 5.4 + fl * 4), [0.20, 0.24, 0.28]);
    }

    // stone side ranges the length of the hall, where the footprint's own
    // walls used to be: booking halls on one side, offices on the other
    for (const sg of [-1, 1]) {
      const va = vc + sg * (half + 0.8), vb = va + sg * 13;
      box(u0 + 14, u1, Math.min(va, vb), Math.max(va, vb), 0, 13, SHED_STONE, SLATE);
      const face = Math.max(Math.abs(va - vc), Math.abs(vb - vc)) * sg + vc + sg * 0.08;
      for (let fl = 0; fl < 2; fl++)
        for (let u = u0 + 16; u < u1 - 2; u += 3.6)
          quad(P(u, face, 3 + fl * 4.5), P(u + 1.5, face, 3 + fl * 4.5),
               P(u + 1.5, face, 5.8 + fl * 4.5), P(u, face, 5.8 + fl * 4.5), [0.20, 0.24, 0.28]);
    }

    // iron columns along both sides of the hall
    for (const v of [vc - half, vc + half]) {
      for (let b = 0; b <= BAYS; b += 2) {
        const f = u0 + (u1 - u0) * b / BAYS;
        quad(P(f - 0.45, v - 0.55, 0), P(f + 0.45, v - 0.55, 0),
             P(f + 0.45, v + 0.55, SPRING), P(f - 0.45, v + 0.55, SPRING), SHED_IRON);
      }
    }

    // Concrete Platforms (Peronok) inside the Grand Hall
    // Tracks are spaced at 5.25m intervals; platforms sit midway between them.
    const PLATFORM_OFFS = [-7.875, -2.625, 2.625, 7.875];
    const pw = 1.10;
    for (const poff of PLATFORM_OFFS) {
      const pv = vc + poff;
      const pu0 = u0 + 4.5, pu1 = u1 - 6.0;
      // Raised platform top surface (0.55m standard European low-floor boarding)
      quad(P(pu0, pv - pw, 0.55), P(pu1, pv - pw, 0.55),
           P(pu1, pv + pw, 0.55), P(pu0, pv + pw, 0.55), PERON_COL);
      // Platform vertical side walls
      quad(P(pu0, pv - pw, 0), P(pu1, pv - pw, 0),
           P(pu1, pv - pw, 0.55), P(pu0, pv - pw, 0.55), [0.55, 0.54, 0.52]);
      quad(P(pu1, pv + pw, 0), P(pu0, pv + pw, 0),
           P(pu0, pv + pw, 0.55), P(pu1, pv + pw, 0.55), [0.55, 0.54, 0.52]);
      // Tactile yellow platform safety border lines
      quad(P(pu0, pv - pw, 0.56), P(pu1, pv - pw, 0.56),
           P(pu1, pv - pw + 0.16, 0.56), P(pu0, pv - pw + 0.16, 0.56), PERON_EDGE);
      quad(P(pu0, pv + pw - 0.16, 0.56), P(pu1, pv + pw - 0.16, 0.56),
           P(pu1, pv + pw, 0.56), P(pu0, pv + pw, 0.56), PERON_EDGE);

      // Departure Timetable Information Totems
      for (const tu of [pu0 + 14.0, pu0 + 52.0, pu0 + 90.0]) {
        // Dark steel totem pillar
        quad(P(tu - 0.25, pv - 0.35, 0.55), P(tu + 0.25, pv - 0.35, 0.55),
             P(tu + 0.25, pv + 0.35, 0.55), P(tu - 0.25, pv + 0.35, 0.55), [0.15, 0.16, 0.18]);
        quad(P(tu - 0.25, pv - 0.35, 0.55), P(tu + 0.25, pv - 0.35, 0.55),
             P(tu + 0.25, pv - 0.35, 3.2), P(tu - 0.25, pv - 0.35, 3.2), [0.15, 0.16, 0.18]);
        // Amber LED Departure Screen
        quad(P(tu - 0.28, pv - 0.32, 2.3), P(tu + 0.28, pv - 0.32, 2.3),
             P(tu + 0.28, pv - 0.32, 3.0), P(tu - 0.28, pv - 0.32, 3.0), [0.96, 0.82, 0.18]);
      }

      // Waiting Passenger Silhouettes & Platform Benches (GoldenEye 007 detailed sprites)
      for (let k = 0; k < 18; k++) {
        const uPos = pu0 + 6.0 + k * 6.5 + ((k * 13) % 4.5);
        const vPos = pv + ((k % 2 === 0) ? -0.42 : 0.42);
        const pose = k % 4;

        if (pose === 0) {
          // Commuter with briefcase, coat collar and hat
          const pH = 1.78;
          // Legs (trousers)
          quad(P(uPos - 0.14, vPos - 0.08, 0.55), P(uPos + 0.14, vPos - 0.08, 0.55),
               P(uPos + 0.14, vPos - 0.08, 1.25), P(uPos - 0.14, vPos - 0.08, 1.25), [0.12, 0.13, 0.15]);
          quad(P(uPos - 0.14, vPos + 0.08, 0.55), P(uPos + 0.14, vPos + 0.08, 0.55),
               P(uPos + 0.14, vPos + 0.08, 1.25), P(uPos - 0.14, vPos + 0.08, 1.25), [0.12, 0.13, 0.15]);
          // Torso & Overcoat
          quad(P(uPos - 0.22, vPos, 1.25), P(uPos + 0.22, vPos, 1.25),
               P(uPos + 0.22, vPos, 1.95), P(uPos - 0.22, vPos, 1.95), [0.16, 0.17, 0.19]);
          quad(P(uPos, vPos - 0.18, 1.25), P(uPos, vPos + 0.18, 1.25),
               P(uPos, vPos + 0.18, 1.95), P(uPos, vPos - 0.18, 1.95), [0.16, 0.17, 0.19]);
          // Head & Hat
          quad(P(uPos - 0.11, vPos, 1.95), P(uPos + 0.11, vPos, 1.95),
               P(uPos + 0.11, vPos, 2.25), P(uPos - 0.11, vPos, 2.25), [0.14, 0.15, 0.17]);
          quad(P(uPos - 0.16, vPos, 2.22), P(uPos + 0.16, vPos, 2.22),
               P(uPos + 0.16, vPos, 2.32), P(uPos - 0.16, vPos, 2.32), [0.10, 0.10, 0.12]);
          // Leather Briefcase
          quad(P(uPos + 0.26, vPos + 0.08, 0.65), P(uPos + 0.46, vPos + 0.08, 0.65),
               P(uPos + 0.46, vPos + 0.08, 1.05), P(uPos + 0.26, vPos + 0.08, 1.05), [0.36, 0.22, 0.14]);

        } else if (pose === 1) {
          // Traveler checking glowing smartphone with rolling suitcase
          const pH = 1.72;
          // Legs
          quad(P(uPos - 0.12, vPos, 0.55), P(uPos + 0.12, vPos, 0.55),
               P(uPos + 0.12, vPos, 1.20), P(uPos - 0.12, vPos, 1.20), [0.14, 0.15, 0.18]);
          // Jacket & Arms held forward
          quad(P(uPos - 0.20, vPos, 1.20), P(uPos + 0.20, vPos, 1.20),
               P(uPos + 0.20, vPos, 1.88), P(uPos - 0.20, vPos, 1.88), [0.20, 0.22, 0.25]);
          // Head
          quad(P(uPos - 0.10, vPos, 1.88), P(uPos + 0.10, vPos, 1.88),
               P(uPos + 0.10, vPos, 2.18), P(uPos - 0.10, vPos, 2.18), [0.14, 0.15, 0.17]);
          // Glowing Smartphone screen dot
          quad(P(uPos + 0.12, vPos, 1.55), P(uPos + 0.18, vPos, 1.55),
               P(uPos + 0.18, vPos, 1.62), P(uPos + 0.12, vPos, 1.62), [0.25, 0.85, 0.95]);
          // Red Rolling Suitcase with telescopic handle
          quad(P(uPos - 0.48, vPos - 0.10, 0.55), P(uPos - 0.24, vPos - 0.10, 0.55),
               P(uPos - 0.24, vPos + 0.10, 0.55), P(uPos - 0.48, vPos + 0.10, 0.55), [0.68, 0.18, 0.15]);
          quad(P(uPos - 0.48, vPos - 0.10, 0.55), P(uPos - 0.24, vPos - 0.10, 0.55),
               P(uPos - 0.24, vPos - 0.10, 1.25), P(uPos - 0.48, vPos - 0.10, 1.25), [0.68, 0.18, 0.15]);
          quad(P(uPos - 0.38, vPos - 0.10, 1.25), P(uPos - 0.34, vPos - 0.10, 1.25),
               P(uPos - 0.34, vPos - 0.10, 1.60), P(uPos - 0.38, vPos - 0.10, 1.60), [0.45, 0.46, 0.48]);

        } else if (pose === 2) {
          // Platform bench with wooden slats and seated passenger
          quad(P(uPos - 0.75, pv - 0.30, 0.92), P(uPos + 0.75, pv - 0.30, 0.92),
               P(uPos + 0.75, pv + 0.30, 0.92), P(uPos - 0.75, pv + 0.30, 0.92), [0.46, 0.32, 0.20]);
          quad(P(uPos - 0.75, pv, 0.92), P(uPos + 0.75, pv, 0.92),
               P(uPos + 0.75, pv, 1.38), P(uPos - 0.75, pv, 1.38), [0.46, 0.32, 0.20]);
          // Seated figure (thighs + torso + head)
          quad(P(uPos - 0.18, pv - 0.15, 0.92), P(uPos + 0.18, pv - 0.15, 0.92),
               P(uPos + 0.18, pv + 0.15, 0.92), P(uPos - 0.18, pv + 0.15, 0.92), [0.15, 0.16, 0.18]);
          quad(P(uPos - 0.16, pv, 0.92), P(uPos + 0.16, pv, 0.92),
               P(uPos + 0.16, pv, 1.65), P(uPos - 0.16, pv, 1.65), [0.18, 0.19, 0.22]);
          quad(P(uPos - 0.10, pv, 1.65), P(uPos + 0.10, pv, 1.65),
               P(uPos + 0.10, pv, 1.95), P(uPos - 0.10, pv, 1.95), [0.14, 0.15, 0.17]);

        } else {
          // Waiting pair in conversation (two distinct figures)
          for (const [offU, col] of [[-0.22, [0.22, 0.24, 0.28]], [0.22, [0.16, 0.17, 0.20]]]) {
            quad(P(uPos + offU - 0.12, vPos, 0.55), P(uPos + offU + 0.12, vPos, 0.55),
                 P(uPos + offU + 0.12, vPos, 1.25), P(uPos + offU - 0.12, vPos, 1.25), [0.12, 0.13, 0.15]);
            quad(P(uPos + offU - 0.18, vPos, 1.25), P(uPos + offU + 0.18, vPos, 1.25),
                 P(uPos + offU + 0.18, vPos, 1.92), P(uPos + offU - 0.18, vPos, 1.92), col);
            quad(P(uPos + offU - 0.10, vPos, 1.92), P(uPos + offU + 0.10, vPos, 1.92),
                 P(uPos + offU + 0.10, vPos, 2.22), P(uPos + offU - 0.10, vPos, 2.22), [0.14, 0.15, 0.17]);
          }
        }
      }
    }

    // Buffer Stops (Ütközőbakok) at the track buffer heads
    const TRACK_OFFS = [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5];
    for (const toff of TRACK_OFFS) {
      const tv = vc + toff;
      const bu = u0 + 4.0;
      // Steel buffer stop body
      quad(P(bu - 0.6, tv - 1.25, 0), P(bu + 0.6, tv - 1.25, 0),
           P(bu + 0.6, tv + 1.25, 0), P(bu - 0.6, tv + 1.25, 0), [0.24, 0.22, 0.20]);
      quad(P(bu + 0.6, tv - 1.25, 0), P(bu + 0.6, tv - 1.25, 1.35),
           P(bu + 0.6, tv + 1.25, 1.35), P(bu + 0.6, tv + 1.25, 0), [0.35, 0.32, 0.30]);
      // Buffer stop beam
      quad(P(bu + 0.7, tv - 1.2, 0.75), P(bu + 0.7, tv - 1.2, 1.25),
           P(bu + 0.7, tv + 1.2, 1.25), P(bu + 0.7, tv + 1.2, 0.75), [0.82, 0.22, 0.18]);
      // Red Stop Lantern
      quad(P(bu + 0.75, tv - 0.16, 1.35), P(bu + 0.75, tv + 0.16, 1.35),
           P(bu + 0.75, tv + 0.16, 1.65), P(bu + 0.75, tv - 0.16, 1.65), [0.92, 0.12, 0.10]);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}
