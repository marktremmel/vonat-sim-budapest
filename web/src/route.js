// The line itself: the geometry a train runs on, and what it costs to
// move along it. Route interpolates the baked alignment; Driver is the
// physics and the automatic driving.
// ------------------------------------------------------------------- route
export class Route {
  constructor(r, dir = 1) {
    this.r = r;
    this.setDirection(dir);
  }
  // +1 runs Vác to Szob on the down line, -1 runs Szob to Budapest on the up
  setDirection(dir) {
    this.dir = dir;
    this.pts = dir > 0 ? this.r.track_down : this.r.track_up;
    this.m0 = this.pts[0][3];
    this.m1 = this.pts[this.pts.length - 1][3];
    this.step = (this.m1 - this.m0) / (this.pts.length - 1);
    this.stops = this.r.stops
      .filter(s => s.km * 1000 >= this.m0 && s.km * 1000 <= this.m1)
      .sort((a, b) => (a.km - b.km) * dir);
  }
  get startM() { return this.dir > 0 ? this.m0 + 60 : this.m1 - 60; }
  // a service terminates at its last booked call, not at the border gate
  get endM() {
    const last = this.stops[this.stops.length - 1];
    return last ? last.km * 1000 : (this.dir > 0 ? this.m1 - 5 : this.m0 + 5);
  }
  at(m) {
    const t = Math.max(this.m0, Math.min(this.m1, m));
    const f = (t - this.m0) / this.step;
    const i = Math.min(this.pts.length - 2, Math.floor(f));
    const u = f - i, a = this.pts[i], b = this.pts[i + 1];
    return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])];
  }
  // plan direction only: [east, north]. The old version returned
  // [dx, dheight, dy] and the caller read component 1 as north, which pinned
  // the camera to due west wherever the line turned.
  tangent(m) {
    const a = this.at(m - 10), b = this.at(m + 10);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    return L < 1e-6 ? [1, 0] : [dx / L, dy / L];
  }
  /** Curvature, 1/radius in 1/m, from the turn in the tangent over 60 m.
   *  The Bend has curves down to about 300 m radius, which is 0.0033. */
  curvatureAt(m) {
    const a = this.tangent(m - 30), b = this.tangent(m + 30);
    let dth = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
    while (dth > Math.PI) dth -= 2 * Math.PI;
    while (dth < -Math.PI) dth += 2 * Math.PI;
    return Math.abs(dth) / 60;
  }
  gradientAt(m) {
    const a = this.at(m - 10), b = this.at(m + 10);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return (b[2] - a[2]) / L;
  }
  // limits are [chainage, kmh] change points
  limitAt(m) {
    const L = this.r.limits;
    let v = L[0][1];
    for (const [mm, vv] of L) { if (mm > m) break; v = vv; }
    return v;
  }
  gradeAt(m) {
    const G = this.r.grades;
    const i = Math.max(0, Math.min(G.length - 1, Math.round((m - G[0][0]) / 100)));
    return G[i][1];
  }
  officialKm(m) {
    // a line whose kilometrage is not one straight run (line 2) carries a
    // piecewise table from its mapped km posts
    const T = this.r.official_km_table;
    if (T && T.length > 1) {
      if (m <= T[0][0]) return T[0][1] + (m - T[0][0]) / 1000;
      for (let i = 1; i < T.length; i++)
        if (m <= T[i][0]) return T[i-1][1] + (T[i][1] - T[i-1][1]) * (m - T[i-1][0]) / Math.max(1e-6, T[i][0] - T[i-1][0]);
      return T[T.length-1][1] + (m - T[T.length-1][0]) / 1000;
    }
    const { a, b } = this.r.official_km_fit;
    return (m - a) / (1000 + b);
  }
  nextStop(m) {
    return this.stops.find(s => (s.km * 1000 - m) * this.dir > 30) || null;
  }
}

// ----------------------------------------------------------------- physics
export const KISS = {
  name: "MÁV 815", massT: 344, pCont: 4.0e6, teStart: 4.0e5,
  vMax: 160 / 3.6, lengthM: 155.88, bServ: 0.9, bEmerg: 1.25, rot: 1.08, cdA: 10,
  // share of the weight on driven axles; electrodynamic brake; how fast the
  // brake cylinders follow the handle (s) — a multiple unit's EP brake is quick
  driven: 0.42, ed: true, tauApply: 1.4, tauRelease: 2.2, stock: "KISS", cars: 6,
};
// The other things you can drive. Figures are round numbers of the right
// size, not type-sheet values.
export const STOCKS = {
  KISS,
  FLIRT: { name: "MÁV 415 FLIRT", massT: 158, pCont: 2.6e6, teStart: 2.0e5,
           vMax: 160 / 3.6, lengthM: 74, bServ: 1.0, bEmerg: 1.35, rot: 1.08, cdA: 8,
           driven: 0.5, ed: true, tauApply: 1.3, tauRelease: 2.0, stock: "FLIRT", cars: 4 },
  // a V43 and five coaches: one driven vehicle, and an air brake that has to
  // travel down the brake pipe, so it bites late and lets go later
  EC:    { name: "V43 + 5 kocsi", massT: 80 + 5 * 48, pCont: 2.9e6, teStart: 2.5e5,
           vMax: 120 / 3.6, lengthM: 19.5 + 5 * 26.4, bServ: 0.75, bEmerg: 1.1, rot: 1.06, cdA: 11,
           driven: 80 / 320, ed: false, tauApply: 3.2, tauRelease: 6.0, stock: "EC", cars: 6 },
  FREIGHT: { name: "V43 + tehervonat", massT: 80 + 20 * 60, pCont: 2.9e6, teStart: 2.8e5,
           vMax: 80 / 3.6, lengthM: 19.5 + 20 * 14.5, bServ: 0.45, bEmerg: 0.7, rot: 1.05, cdA: 18,
           driven: 80 / 1280, ed: false, tauApply: 6.0, tauRelease: 14.0, stock: "FREIGHT", cars: 21 },
};
export const LEVER_MAX = 8;

export function tractive(s, v) { return v < 0.5 ? s.teStart : Math.min(s.teStart, s.pCont / v); }
/** Davis-style: a constant rolling term plus an aerodynamic one. The
 *  aerodynamic term is in *air* speed, not ground speed, so a headwind on
 *  the open stretch below Zebegény really does cost you time and a tailwind
 *  really does push. headwind is metres per second of air coming at you. */
export function resistance(s, v, headwind = 0) {
  const air = v + headwind;
  return 0.0015 * s.massT * 1000 * 9.80665
       + 0.5 * 1.2 * s.cdA * air * Math.abs(air);
}

export class Driver {
  constructor(route, stock) {
    this.route = route; this.s = stock;
    this.m = route.startM; this.v = 0; this.throttle = 0; this.brake = 0;
    this.headwind = 0;
    // adhesion: 1 on dry rail, less on wet or snow, restored by sanding
    this.adhesion = 1; this.sand = false;
    // EVM-120 vigilance: the driver has to acknowledge periodically or the
    // brake goes on. Counts only while actually driving.
    this.vigT = 40; this.vigWarn = 0; this.vigPenalty = 0; this.vigAck = 0;
    this.auto = true; this.dwell = 0; this.stopIdx = 0; this.t = 0;
    this.departed = false;
    this.pax = 120; this.boarding = 0; this.lastStop = null;
    this.terminated = false; this.layover = 0;
    this.doors = 0;            // 0 shut, 1 open
    // The master controller: one lever, B8 … B1, 0, P1 … P8, and the
    // emergency position beyond B8. The lever is what you set; throttle and
    // brake are what the train is actually doing, and they lag it — traction
    // ramps up at a jerk limit, the air brake follows its cylinders.
    this.lever = 0; this.emergency = false;
    this.bcp = 0;              // brake cylinder pressure, 0..1 of full service
    this.edb = 0;              // electrodynamic brake share, 0..1
    this.slip = 0;             // wheel slip under power, 0..1, for HUD and sound
    // for the scorecard (score.js): what happened, in order, and running
    // totals of traction energy, energy fed back by the ED brake (J), and
    // the actual acceleration (m/s², from the speed change)
    this.events = [];
    // the stops this train calls at, by name (null: all of them). A G70, an
    // EC or a freight runs through the rest.
    this.callsAt = null;
    this.eTr = 0; this.eRegen = 0; this.aEff = 0;
  }
  setLever(n) {
    this.lever = Math.max(-LEVER_MAX, Math.min(LEVER_MAX, n));
    if (this.lever > -LEVER_MAX) this.emergency = this.emergency && this.v > 0.3;
  }
  /** manual driving: turn the lever position into what the train does */
  controls(dt) {
    const s = this.s;
    const want = this.emergency ? 0 : Math.max(0, this.lever) / LEVER_MAX;
    const demand = this.emergency ? 1.0 : Math.max(0, -this.lever) / LEVER_MAX;
    // traction: 0.35 of full per second up, quick to shed
    const up = 0.35 * dt, down = 1.4 * dt;
    this.throttle += Math.max(-down, Math.min(up, want - this.throttle));
    // electrodynamic brake: quick, but it fades out below ~10 km/h, where the
    // motors stop generating, and the air brake has to take over
    // (the emergency brake is pure air: the ED brake drops out and the
    // cylinders go to full)
    const edAvail = s.ed && !this.emergency ? Math.min(1, Math.max(0, (this.v - 1.5) / 1.5)) : 0;
    this.edb += Math.max(-1.2 * dt, Math.min(0.9 * dt, demand * edAvail - this.edb));
    // air brake: the cylinders fill towards what the ED brake is not giving
    const airWant = Math.max(0, demand - this.edb);
    const tau = airWant > this.bcp ? s.tauApply * (this.emergency ? 0.6 : 1) : s.tauRelease;
    this.bcp += (airWant - this.bcp) * Math.min(1, dt / tau);
    this.brake = Math.min(1, this.edb + this.bcp);
  }

  /** The stop the train is working towards: the one it will call at next,
   *  and it stays that stop until the train has called there or run 30 m
   *  past it (nextStop moves on 30 m short, which is no use to a driver
   *  braking for the mark). Stops this train runs through are skipped. */
  targetStop() {
    const R = this.route;
    let st = R.stops[this.stopIdx];
    while (st && this.callsAt && !this.callsAt.has(st.name)) st = R.stops[++this.stopIdx];
    return st || null;
  }
  /** The next stop this train calls at, at least 30 m ahead. */
  nextStop(m) {
    const R = this.route;
    return R.stops.find(s => (s.km * 1000 - m) * R.dir > 30 && (!this.callsAt || this.callsAt.has(s.name))) || null;
  }
  // a rough demand model: the bigger the place, the more people, and more of
  // them get off as you come back toward Budapest
  callAt(stop) {
    const big = /Vác|Szob|Nagymaros|Kismaros|Verőce/.test(stop.name);
    const off = Math.round(this.pax * (big ? 0.22 : 0.10) * (0.6 + Math.random() * 0.8));
    const on = Math.round((big ? 55 : 18) * (0.5 + Math.random()));
    this.pax = Math.max(0, Math.min(1200, this.pax - off + on));
    this.boarding = off + on;
    this.lastStop = stop.name;
    // 18 s to open, exchange and shut, plus a second per four people
    return Math.max(24, 18 + this.boarding / 4);
  }
  // fastest speed we may be doing here and still stop / slow in time
  envelope(m) {
    const R = this.route, s = this.s;
    const dir = R.dir;
    let cap = Math.min(R.limitAt(m) / 3.6, s.vMax);
    const look = 3200;
    for (let d = 40; d < look; d += 40) {
      const mm = m + d * dir;
      const tgt = Math.min(R.limitAt(mm) / 3.6, s.vMax);
      cap = Math.min(cap, Math.sqrt(tgt * tgt + 2 * s.bServ * 0.85 * d));
    }
    const st = this.nextStop(m);
    if (st) {
      // aim to be stopped a few metres short: braking to exactly zero at the
      // stop mark leaves a couple of km/h on and the train sails through
      const d = (st.km * 1000 - m) * dir - 6;
      if (d > 0 && d < look) cap = Math.min(cap, Math.sqrt(2 * s.bServ * 0.72 * d));
      else if (d <= 0) cap = 0;
    }
    // a signal at danger ahead (set from the block and single-track working
    // each frame): the automatic driver stops at it and waits
    if (this.signalStop != null) {
      const d = (this.signalStop - m) * dir - 4;
      cap = Math.min(cap, d > 0 ? Math.sqrt(2 * s.bServ * 0.72 * d) : 0);
    }
    return cap;
  }
  /** ÉBER: the driver says they are still there. */
  acknowledge() {
    this.vigT = 40; this.vigWarn = 0; this.vigAck = 1.2;
    if (this.v < 0.4) this.vigPenalty = 0;
  }

  step(dt) {
    const s = this.s, R = this.route;
    if (this.terminated) { this.layover -= dt; this.v = 0; this.t += dt; return; }
    if (this.dwell > 0) {
      this.dwell -= dt; this.v = 0; this.t += dt;
      this.doors = this.dwell > 6 ? 1 : 0;
      if (this.dwell <= 0) { this.departed = true; this.doors = 0; }
      return;
    }
    this.doors = 0;
    if (!this.auto) this.controls(dt);
    if (this.auto) {
      const cap = this.envelope(this.m);
      const err = cap - this.v;
      this.throttle = Math.max(0, Math.min(1, err / 3.0));
      this.brake = Math.max(0, Math.min(1, (-err - 0.15) / 2.2));
      if (this.brake > 0.02) this.throttle = 0;
    }
    const m = s.massT * 1000 * s.rot;
    // Wheel slip: the driven axles can only put down adhesion x their share
    // of the weight. Past that the wheels spin and the effort collapses to
    // what they can hold, less a bit — sand buys most of it back.
    const gripT = Math.max(0.3, Math.min(1, this.adhesion + (this.sand ? 0.30 : 0)));
    const fMax = 0.33 * gripT * (s.driven || 0.4) * s.massT * 1000 * 9.80665;
    let fTr = tractive(s, this.v) * this.throttle;
    if (fTr > fMax) { this.slip = Math.min(1, this.slip + dt * 3); fTr = fMax * (1 - 0.25 * this.slip); }
    else this.slip = Math.max(0, this.slip - dt * 2);
    const f = fTr
            - resistance(s, this.v, this.headwind || 0)
            - s.massT * 1000 * 9.80665 * R.gradeAt(this.m) * R.dir / 1000;
    // Wet rail costs you brake, snow costs more, and sand buys it back. This
    // is the point of the weather: it changes how far you need to stop in.
    const grip = Math.max(0.42, Math.min(1, this.adhesion + (this.sand ? 0.34 : 0)));
    let a = f / m - this.brake * s.bServ * grip;
    if (this.vigPenalty > 0) a -= s.bEmerg * 0.75 * grip;
    if (this.emergency) a -= (s.bEmerg - s.bServ) * grip * Math.min(1, this.bcp);
    const v0 = this.v;
    this.v = Math.max(0, this.v + a * dt);
    this.v = Math.min(this.v, s.vMax);
    this.aEff = dt > 0 ? (this.v - v0) / dt : 0;
    this.eTr += fTr * v0 * dt;
    if (s.ed) this.eRegen += Math.min(this.edb, this.brake) * s.bServ * grip * m * v0 * dt * 0.75;
    this.m += R.dir * this.v * dt;
    this.t += dt;

    if (this.vigAck > 0) this.vigAck -= dt;
    // vigilance: 40 s of running, then 5 s to acknowledge before the brake
    if (!this.auto && this.v > 1) {
      this.vigT -= dt;
      if (this.vigT <= 0) {
        this.vigWarn += dt;
        if (this.vigWarn > 5) this.vigPenalty = 1;
      }
    } else if (this.auto) { this.vigT = 40; this.vigWarn = 0; this.vigPenalty = 0; }
    if (this.vigPenalty > 0 && this.v < 0.4) {
      this.vigPenalty = 0; this.vigT = 40; this.vigWarn = 0;
    }

    const st = this.targetStop();
    if (st) {
      const d = (st.km * 1000 - this.m) * R.dir;
      if (this.auto) {
        if (d < 45 && d > -25) {
          // final approach: hold the brake on and settle onto the mark
          this.throttle = 0; this.brake = Math.max(this.brake, 0.75);
          if (this.v < 1.4 || d < 1.0) {
            this.v = 0;
            this.m = st.km * 1000;
            this.brake = 0;
            this.dwell = this.callAt(st);
            this.stopIdx++;
            this.departed = false;
            this.events.push({ type: "stop", name: st.name, err: 0, auto: true });
          }
        } else if (d < -45) { this.stopIdx++; }
      } else {
        // Driving yourself, the train stops where YOU stop it (it used to be
        // pulled onto the mark from 45 m short, which made every stop
        // "perfect"). Stood still within 30 m of the mark: the doors open,
        // and how far off it was goes on the scorecard. Past it by more than
        // 30 m: the stop is missed.
        if (this.v < 0.05 && Math.abs(d) < 30) {
          this.v = 0; this.brake = 0;
          this.dwell = this.callAt(st);
          this.stopIdx++;
          this.departed = false;
          this.events.push({ type: "stop", name: st.name, err: d });
        } else if (d < -30) {
          this.stopIdx++;
          this.events.push({ type: "miss", name: st.name });
        }
      }
    }
    if ((this.m - R.endM) * R.dir >= 0) {
      this.m = R.endM; this.v = 0;
      if (!this.terminated) { this.terminated = true; this.layover = 100; }
    }
  }
}
