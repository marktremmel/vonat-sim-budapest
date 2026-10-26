// A derailment as a physical event (Oct 2026). Until now over-speeding in a
// curve stopped the run with a message; here the cars leave the track.
//
// Each car is two particles, its two ends, in plan (east, north), moved by
// position-based dynamics: the body keeps its length, couplers hold the gap
// between neighbours (one may tear), cars do not pass through each other, and
// a car still on the rails is held to the track until it is pulled more than
// half a metre off it. Free cars run straight on, which is outside the curve,
// and slow by friction: on the rails the emergency brake, off them the ground,
// harder sideways than lengthways while the bogies dig in.
//
// Across the car the body is a box rolling on the ground: on its bogies it is
// stable; a kick at the moment of derailment and the sideways slide trip it;
// past the tipping angle (about 32° for a KISS, top-heavy) gravity takes it
// over onto its side, where it lands, bounces a little and slides. A hard one
// can roll on to its roof. Heights come from `ground(e, n)`: the track bed,
// the embankment's slope and then the terrain (`trackGround`).
//
// Not modelled: cars climbing over each other, bogies tearing off, damage to
// the track, the overhead line or anything the wreck hits.
//
// The car poses are written to `poses`, which trains.js buildTrains draws the
// player's train from (`t.wreck`). Impacts and scraping are left in `events`
// for main.js to turn into dust, sparks, sound and camera shake.

const WRECK_G = 9.81;
const WRECK_W = 1.42;           // half the body width

/** The ground a wreck slides on, near the track at chainage `m`: the ballast
 *  top beside the rails, a 1:1.5 embankment slope down to the terrain, or up
 *  out of a cutting. Also the distance from the track (sparks on steel). */
export function trackGround(route, m, demAt, span = 700) {
  const pts = [];
  for (let s = m - span; s <= m + span; s += 4) pts.push(route.at(s));
  // the segments in 25 m cells, each filed under every cell within 30 m of it
  const C = 25, cells = new Map(), key = (i, j) => i * 65536 + j;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const i0 = Math.floor((Math.min(a[0], b[0]) - 30) / C), i1 = Math.floor((Math.max(a[0], b[0]) + 30) / C);
    const j0 = Math.floor((Math.min(a[1], b[1]) - 30) / C), j1 = Math.floor((Math.max(a[1], b[1]) + 30) / C);
    for (let x = i0; x <= i1; x++) for (let y = j0; y <= j1; y++) {
      const k = key(x, y); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i);
    }
  }
  const all = pts.map((_, i) => i).slice(1);
  const near = (e, n) => {
    let best = 1e9, y = pts[0][2];
    // far from the track (no cell), every tenth segment is near enough
    const list = cells.get(key(Math.floor(e / C), Math.floor(n / C))) || all.filter(i => i % 10 === 1);
    for (const i of list) {
      const a = pts[i - 1], b = pts[i];
      const ex = b[0] - a[0], ey = b[1] - a[1], ll = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((e - a[0]) * ex + (n - a[1]) * ey) / ll));
      const d = Math.hypot(a[0] + ex * t - e, a[1] + ey * t - n);
      if (d < best) { best = d; y = a[2] + (b[2] - a[2]) * t; }
    }
    return [best, y];
  };
  const fn = (e, n) => {
    const [d, rail] = near(e, n);
    fn.dist = d;
    const bed = rail - 0.3;
    if (d < 3.2) return bed;
    const g = demAt(e, n);
    if (!isFinite(g)) return bed;
    const slope = (d - 3.2) * 0.66;
    return g < bed ? Math.max(g, bed - slope) : Math.min(g, bed + slope);
  };
  fn.dist = 0;
  return fn;
}

export class TrainWreck {
  /**
   * @param route   Route (at, tangent) of the player's direction
   * @param dir     +1 / -1, the direction of travel in chainage
   * @param layout  trains.js carLayout(): [{c, half, H}] front car first
   * @param v       speed at derailment, m/s
   * @param ground  (east, north) → height; `ground.dist` after a call
   * @param opts    { severity 0..1+, outward: [e, n] unit, seed }
   */
  constructor(route, dir, layout, v, ground, opts = {}) {
    this.route = route; this.dir = dir; this.ground = ground;
    // where the flange climbed: each car that reaches it still going well
    // over the curve's speed goes off too (`holdToRail`)
    this.m0 = layout[0].c + dir * layout[0].half;
    this.v0 = v; this.out = opts.outward || [0, 0]; this.sev = Math.max(0, opts.severity ?? 0.3);
    this.events = [];
    this.cascade = opts.derail !== false;
    let seed = opts.seed ?? (Math.random() * 1e9) | 0;
    this.rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const R = this.rnd, sev = Math.max(0, opts.severity ?? 0.3);
    const out = opts.outward || [0, 0];
    this.cars = layout.map((L, k) => {
      const s0 = L.c + L.half, s1 = L.c - L.half;         // particle 0: the higher-chainage end
      const p = [s0, s1].map(s => {
        const q = route.at(s), t = route.tangent(s);
        return { e: q[0], n: q[1], ve: t[0] * dir * v, vn: t[1] * dir * v, s, oe: q[0], on: q[1] };
      });
      const ax = [p[0].e - p[1].e, p[0].n - p[1].n], al = Math.hypot(ax[0], ax[1]) || 1;
      // which way is "outward" across this car: + is its left (local +y)
      const side = Math.sign(out[0] * -ax[1] / al + out[1] * ax[0] / al) || 1;
      const c = { p, half: L.half, H: L.H, onRail: k > 0, side,
                  roll: 0, rollV: 0, y: null, vy: 0, face: true, slid: 0,
                  muLong: 0.28 + R() * 0.12, muLat: 0.65 + R() * 0.25, muSide: 0.5 + R() * 0.15 };
      if (k === 0 && opts.derail !== false) this.kick(c, 1);
      else if (k === 0) c.onRail = true;
      return c;
    });
    // couplers: car k's rear end to car k+1's front end, in the travel sense
    this.joints = [];
    for (let k = 0; k + 1 < this.cars.length; k++) {
      const a = this.cars[k].p[dir > 0 ? 1 : 0], b = this.cars[k + 1].p[dir > 0 ? 0 : 1];
      this.joints.push({ a, b, k, rest: Math.hypot(a.e - b.e, a.n - b.n), broken: false });
    }
    this.poses = this.cars.map(() => ({ x: 0, y: 0, n: 0, ux: 1, uy: 0, cr: 1, sr: 0, cp: 1, sp: 0, H: 4 }));
    this.t = 0; this.still = 0; this.settled = false;
    this.writePoses();
  }

  step(dt) {
    if (this.settled || !(dt > 0)) return;
    // fixed steps: the constraints' corrections become speeds over the step,
    // and over a very short one that is an explosion
    const h = 1 / 120;
    this.acc = Math.min((this.acc || 0) + dt, 0.25);
    if (this.acc < h) return;
    while (this.acc >= h) { this.sub(h); this.acc -= h; this.t += h; }
    let moving = false;
    for (const c of this.cars)
      for (const q of c.p) if (Math.hypot(q.ve, q.vn) > 0.08) moving = true;
    for (const c of this.cars) if (Math.abs(c.rollV) > 0.05 || Math.abs(c.vy) > 0.2) moving = true;
    this.still = moving ? 0 : this.still + dt;   // (dt: near enough)
    if (this.still > 0.6 || this.t > 40) this.settled = true;
    this.writePoses();
  }

  sub(h) {
    const R = this.rnd, cars = this.cars;
    // 1. friction, and the brakes of the cars still on the rails
    for (const c of cars) {
      const [a, b] = c.p;
      let ux = a.e - b.e, uy = a.n - b.n; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      const onSide = Math.abs(c.roll) > 0.9;
      const grounded = !c.air;
      for (const q of c.p) {
        q.oe = q.e; q.on = q.n;
        if (!grounded && !c.onRail) { q.e += q.ve * h; q.n += q.vn * h; continue; }
        let va = q.ve * ux + q.vn * uy, vl = -q.ve * uy + q.vn * ux;
        if (c.onRail) { va -= Math.sign(va) * Math.min(Math.abs(va), 1.4 * h); vl = 0; }
        else {
          const ml = onSide ? c.muSide : c.muLong, mt = onSide ? c.muSide : c.muLat;
          va -= Math.sign(va) * Math.min(Math.abs(va), ml * WRECK_G * h);
          vl -= Math.sign(vl) * Math.min(Math.abs(vl), mt * WRECK_G * h);
        }
        q.ve = va * ux - vl * uy; q.vn = va * uy + vl * ux;
        q.e += q.ve * h; q.n += q.vn * h;
      }
    }
    // 2. constraints
    for (let it = 0; it < 6; it++) {
      for (const c of cars) this.keepLength(c.p[0], c.p[1], c.half * 2, 1);
      for (const j of this.joints) {
        if (j.broken) continue;
        const d = Math.hypot(j.a.e - j.b.e, j.a.n - j.b.n);
        // a coupler pulled 1.2 m past its length tears, once in a while
        if (it === 0 && d > j.rest + 1.2 && R() < 0.05) { j.broken = true; this.events.push({ kind: "tear", e: j.a.e, n: j.a.n }); continue; }
        this.keepLength(j.a, j.b, j.rest, 0.8);
      }
      // a folded pair stays a V, never one car on top of the other
      for (let k = 0; k + 1 < cars.length; k++) {
        const A = cars[k], B = cars[k + 1];
        this.keepApart(A.p, B.p, (A.half + B.half) * 0.42);
      }
      // the bodies, as three points each, keep a car's width apart
      for (let k = 0; k < cars.length; k++)
        for (let l = k + 2; l < cars.length; l++) this.bodiesApart(cars[k], cars[l]);
      for (const c of cars) if (c.onRail) this.holdToRail(c);
    }
    // 3. velocities from the moves; across the car, the roll; the height
    for (const c of cars) {
      for (const q of c.p) { q.ve = (q.e - q.oe) / h; q.vn = (q.n - q.on) / h; }
      this.rollStep(c, h);
    }
  }

  keepLength(a, b, L, k) {
    const dx = b.e - a.e, dy = b.n - a.n, d = Math.hypot(dx, dy) || 1e-6;
    const f = (d - L) / d * 0.5 * k;
    a.e += dx * f; a.n += dy * f; b.e -= dx * f; b.n -= dy * f;
  }
  keepApart(pa, pb, min) {
    const ae = (pa[0].e + pa[1].e) / 2, an = (pa[0].n + pa[1].n) / 2;
    const be = (pb[0].e + pb[1].e) / 2, bn = (pb[0].n + pb[1].n) / 2;
    const dx = be - ae, dy = bn - an, d = Math.hypot(dx, dy) || 1e-6;
    if (d >= min) return;
    const f = (min - d) / d * 0.25;
    for (const q of pa) { q.e -= dx * f; q.n -= dy * f; }
    for (const q of pb) { q.e += dx * f; q.n += dy * f; }
  }
  bodiesApart(A, B) {
    const pts = c => { const [a, b] = c.p; return [[a, 1, 0], [b, 0, 1], [null, 0.5, 0.5]].map(([_, wa, wb]) =>
      [a.e * wa + b.e * (1 - wa), a.n * wa + b.n * (1 - wa), wa]); };
    const pa = pts(A), pb = pts(B), min = WRECK_W * 2;
    for (const x of pa) for (const y of pb) {
      const dx = y[0] - x[0], dy = y[1] - x[1], d = Math.hypot(dx, dy) || 1e-6;
      if (d >= min) continue;
      const f = (min - d) / d * 0.25;
      // spread each push over the two ends by where the point is along the car
      A.p[0].e -= dx * f * x[2]; A.p[0].n -= dy * f * x[2]; A.p[1].e -= dx * f * (1 - x[2]); A.p[1].n -= dy * f * (1 - x[2]);
      B.p[0].e += dx * f * y[2]; B.p[0].n += dy * f * y[2]; B.p[1].e += dx * f * (1 - y[2]); B.p[1].n += dy * f * (1 - y[2]);
    }
  }
  /** The flange climbs: the car is thrown to the outside and starts to go
   *  over, by how hard it was going (`f`, its speed over the first car's). */
  kick(c, f) {
    const R = this.rnd, sev = this.sev * f * f, out = this.out;
    c.onRail = false;
    c.rollV = -c.side * (0.55 + 1.6 * sev + R() * 0.7) * f;
    const push = (1.0 + 2 * sev + R()) * f;
    for (const q of c.p) { q.ve += out[0] * push; q.vn += out[1] * push; }
    this.events.push({ kind: "derail", e: c.p[0].e, n: c.p[0].n });
  }
  holdToRail(c) {
    // reaching the point where the first car went off, still fast: off too
    const front = c.p[this.dir > 0 ? 0 : 1];
    if (this.cascade && (front.s - this.m0) * this.dir > 0) {
      const sp = Math.hypot(front.ve, front.vn);
      if (sp > this.v0 * 0.72) { this.kick(c, sp / this.v0); return; }
    }
    let off = 0;
    for (const q of c.p) {
      const r = this.route;
      for (let i = 0; i < 2; i++) {
        const t = r.tangent(q.s), a = r.at(q.s);
        q.s += (q.e - a[0]) * t[0] + (q.n - a[1]) * t[1];
      }
      const a = r.at(q.s), t = r.tangent(q.s);
      off = Math.max(off, Math.abs(-(q.e - a[0]) * t[1] + (q.n - a[1]) * t[0]));
      q._a = a;
    }
    // pulled sideways past half a metre: the wheels are off
    if (off > 0.5) { c.onRail = false; this.events.push({ kind: "derail", e: c.p[0].e, n: c.p[0].n }); return; }
    for (const q of c.p) { q.e = q._a[0]; q.n = q._a[1]; }
  }

  /** Across the car: a box (width 2W, height H) on the ground. */
  rollStep(c, h) {
    const W = WRECK_W, Hh = c.H * 0.5;
    const [a, b] = c.p;
    let ux = a.e - b.e, uy = a.n - b.n; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
    const ve = (a.ve + b.ve) / 2, vn = (a.vn + b.vn) / 2;
    const vlat = -ve * uy + vn * ux;                       // along the car's left (+y)
    // the lowest corner of the section, and whether a whole face is down
    const cr = Math.cos(c.roll), sr = Math.sin(c.roll);
    const cs = [[W, Hh], [-W, Hh], [W, -Hh], [-W, -Hh]].map(([y, z]) => [y * cr - z * sr, y * sr + z * cr]);
    cs.sort((p, q) => p[1] - q[1]);
    // the ground under the ends, and the height the body would rest at
    const g0 = c.onRail ? this.route.at(a.s)[2] : this.ground(a.e, a.n);
    const g1 = c.onRail ? this.route.at(b.s)[2] : this.ground(b.e, b.n);
    const rest = (g0 + g1) / 2 - cs[0][1];
    if (c.y === null) c.y = rest;
    // in the air (thrown by a blast) it turns freely; on the ground it rocks
    // on its lowest corner, or lies on a face
    c.air = c.y > rest + 0.15;
    const face = !c.air && cs[1][1] - cs[0][1] < 0.04;
    const Ic = (4 * W * W + c.H * c.H) / 12 + W * W + Hh * Hh;
    let acc = face || c.air ? 0 : WRECK_G * cs[0][0] / Ic;
    // the slide trips it: friction at the wheels pulls the bottom back
    if (!c.air && !c.onRail && Math.abs(c.roll) < 1.0 && Math.abs(vlat) > 1.2)
      acc += -Math.sign(vlat) * (Math.abs(vlat) - 1.2) * 0.32;
    if (face && !this.wasFace(c) && Math.abs(c.rollV) > 0.6) {
      // landing on a side or the roof: a thump, a bounce, a cloud
      const hit = Math.abs(c.rollV);
      this.events.push({ kind: "land", e: (a.e + b.e) / 2, n: (a.n + b.n) / 2, strength: hit, car: c });
      c.rollV *= -0.12;
      // the body goes on sliding, and the bounce costs some of its speed
      for (const q of c.p) { q.ve *= 0.8; q.vn *= 0.8; }
    }
    c.face = face;
    c.rollV += acc * h;
    if (face) c.rollV *= Math.pow(0.02, h);               // a face on the ground: it stays put
    else if (!c.air) c.rollV *= Math.pow(0.7, h);
    const dr = c.rollV * h;
    c.roll += dr;
    if (c.roll > Math.PI) c.roll -= 2 * Math.PI; else if (c.roll < -Math.PI) c.roll += 2 * Math.PI;
    // rolling over the ground carries the body sideways (not as speed)
    if (!face && !c.air && !c.onRail) {
      const sh = -dr * 1.1;
      for (const q of c.p) { q.e += -uy * sh; q.n += ux * sh; }
    }
    // pitch follows the ground; in the air it keeps its tumble
    if (c.air) c.pitch = (c.pitch || 0) + (c.pitchV || 0) * h;
    else { c.pitch = Math.atan2(g0 - g1, c.half * 2); c.pitchV = 0; }
    c.vy -= WRECK_G * h;
    c.y += c.vy * h;
    if (c.y <= rest) {
      if (c.vy < -4) this.events.push({ kind: "land", e: (a.e + b.e) / 2, n: (a.n + b.n) / 2, strength: -c.vy * 0.35, car: c });
      c.y = rest; c.vy = c.vy < -4 ? -c.vy * 0.15 : 0;
    }
    // scraping: steel on the rails and ballast throws sparks, earth throws dust
    const sp = Math.hypot(ve, vn);
    if (!c.onRail && !c.air && sp > 1.0 && c.vy === 0) {
      c.slid += sp * h;
      if (c.slid > 3) {
        c.slid = 0;
        const mid = [(a.e + b.e) / 2, (a.n + b.n) / 2];
        this.ground(mid[0], mid[1]);
        this.events.push({ kind: "scrape", e: mid[0], n: mid[1], y: c.y - Hh * 0.6, speed: sp,
                           steel: this.ground.dist < 4, ve, vn });
      }
    }
  }

  /** A blast at (x, n): every car within `R` is thrown away from it, up and
   *  over, the nearer the harder (hero mode's shockwave, main.js). */
  blast(x, n, R, power = 1) {
    const rnd = this.rnd;
    for (const c of this.cars) {
      const [a, b] = c.p;
      const me = (a.e + b.e) / 2, mn = (a.n + b.n) / 2, d = Math.hypot(me - x, mn - n);
      if (d > R) continue;
      const f = (1 - d / R) * power, dx = (me - x) / (d || 1), dy = (mn - n) / (d || 1);
      c.onRail = false;
      // the nearer end is pushed harder, so the car also slews round
      for (const q of c.p) {
        const dq = Math.hypot(q.e - x, q.n - n), fq = Math.max(0, 1 - dq / R) * power;
        const v = 5 + 17 * fq + rnd() * 3;
        q.ve += dx * v; q.vn += dy * v;
      }
      let ux = a.e - b.e, uy = a.n - b.n; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
      const across = -dx * uy + dy * ux;                    // the push along the car's left
      c.vy = Math.max(c.vy, 3 + 9 * f + rnd() * 2);
      c.rollV = -Math.sign(across || 1) * (1.5 + 5 * f + rnd() * 1.5);
      c.pitchV = (rnd() - 0.5) * 1.6 * f;
      this.events.push({ kind: "derail", e: me, n: mn });
    }
    this.settled = false; this.still = 0;
  }
  wasFace(c) { return c.face; }

  writePoses() {
    for (let k = 0; k < this.cars.length; k++) {
      const c = this.cars[k], P = this.poses[k], [a, b] = c.p;
      let ux = a.e - b.e, uy = a.n - b.n; const L = Math.hypot(ux, uy) || 1;
      P.x = (a.e + b.e) / 2; P.n = (a.n + b.n) / 2;
      P.ux = ux / L; P.uy = uy / L; P.H = c.H;
      P.cr = Math.cos(c.roll); P.sr = Math.sin(c.roll);
      P.cp = Math.cos(c.pitch || 0); P.sp = Math.sin(c.pitch || 0);
      P.y = c.y ?? 0;                        // the body's middle
    }
  }
}
