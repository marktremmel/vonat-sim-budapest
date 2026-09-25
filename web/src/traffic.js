import { CAR_LEN, CAR_H } from "./trains.js";
import { demRidge } from "./geom.js";
import { LANG } from "./i18n.js";

// Everything that moves and is not you: the other services and their
// block working, the road vehicles, and the shipping on the Danube.
// ==================================================================
//  Traffic: block occupancy, signal aspects, and the other services
// ==================================================================

export const ASPECT = { STOP: 0, CAUTION: 1, EXPECT_80: 2, CLEAR: 3, CALL_ON: 4 };
export const ASPECT_NAME = LANG === "en" ? ["Stop", "Expect stop", "80", "Clear", "Call-on"]
                                         : ["Megállj", "Számíts megállj", "80", "Szabad", "Hívójelzés"];

// A KISS is six cars; the other services are what actually runs this line.
export const SERVICES = [
  { id: "S70",  label: "S70 Szob",        dir: +1, cars: 6, col: [0.05,0.42,0.45],
    pattern: "all",   stock: "KISS" },
  { id: "Z70",  label: "Z70 Szob",        dir: +1, cars: 4, col: [0.10,0.34,0.58],
    pattern: "zonal", stock: "FLIRT" },
  { id: "S70u", label: "S70 Budapest",    dir: -1, cars: 6, col: [0.05,0.42,0.45],
    pattern: "all",   stock: "KISS" },
  { id: "EC",   label: "EC Hungária",     dir: -1, cars: 7, col: [0.22,0.26,0.35],
    pattern: "ec",    stock: "EC" },
  { id: "ECd",  label: "EC Metropolitan", dir: +1, cars: 7, col: [0.22,0.26,0.35],
    pattern: "ec",    stock: "EC" },
  { id: "Frt",  label: "tehervonat",      dir: +1, cars: 16, col: [0.30,0.25,0.22],
    pattern: "none",  stock: "FREIGHT" },
];

export class Traffic {
  constructor(route, signalsDown, timetable) {
    this.route = route;
    // one signal chain per direction, at the same chainages
    this.sig = signalsDown.map(s => s.m).sort((a, b) => a - b);
    // Where OSM has few signals (S21: 5 in 73 km) a block is tens of
    // kilometres long and every train queues behind the one ahead. Gaps over
    // 3.5 km get intermediate automatic-block signals, about 2.5 km apart.
    {
      const end = route.r.track_down[route.r.track_down.length - 1][3];
      const s0 = [0, ...this.sig, end], out = [];
      for (let i = 0; i + 1 < s0.length; i++) {
        const a = s0[i], b = s0[i + 1];
        if (i > 0) out.push(a);
        if (b - a > 3500) {
          const n = Math.round((b - a) / 2500);
          for (let k = 1; k < n; k++) out.push(Math.round(a + (b - a) * k / n));
        }
      }
      this.sig = [...new Set(out)].sort((a, b) => a - b);
    }
    this.trains = [];
    this.nextId = 0;
    this.services = (timetable && timetable.services) || [];
    this.holds = new Set();       // signal chainages the dispatcher is holding
    // The dispatcher game (main.js startDispatch). prefer[i]: the direction
    // single-track section i goes to next (0: first come, first served);
    // late: seconds of lateness at every departure, summed; delayed: service
    // id -> seconds it enters late; breakdown: {m, dir, after, dur} — the
    // first train that way past m after `after` stands there for dur seconds.
    this.prefer = [];
    this.late = { sum: 0, n: 0 };
    this.delayed = new Map();
    this.breakdown = null;
    this.cursor = 0;
    this.clock = 0;
    this.pending = [];
  }
  seekTo(seconds) {
    this.clock = seconds;
    this.cursor = 0;
    this.pending = [];
    while (this.cursor < this.services.length
           && this.services[this.cursor].enter_s < seconds - 120) this.cursor++;
  }
  blockOf(m) {
    let lo = 0, hi = this.sig.length - 1;
    if (m < this.sig[0]) return -1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1;
                      if (this.sig[mid] <= m) lo = mid; else hi = mid - 1; }
    return lo;
  }
  occupied(dir, except) {
    const set = new Set();
    for (const t of this.trains) {
      if (t.dir !== dir || t === except) continue;
      const head = t.m, tail = t.m - t.dir * t.length;
      const a = this.blockOf(Math.min(head, tail)), b = this.blockOf(Math.max(head, tail));
      for (let i = a; i <= b; i++) set.add(i);
    }
    return set;
  }
  // The aspect of signal j for trains running in `dir`. ONE function, used by
  // the trains and by the dispatcher's board alike — the board used to work
  // its lamps out with its own formula, one block out, so it showed red
  // where trains had green. Signal j at sig[j]: going down (dir > 0) it
  // protects block j, going up it protects block j - 1.
  signalAspect(j, dir, occ) {
    if (j < 0 || j >= this.sig.length) return ASPECT.CLEAR;
    occ = occ || this.occupied(dir);
    if (this.holds.has(Math.round(this.sig[j]))) return ASPECT.STOP;
    const prot = dir > 0 ? j : j - 1;
    if (occ.has(prot)) return ASPECT.STOP;
    if (occ.has(prot + dir)) return ASPECT.CAUTION;
    return ASPECT.CLEAR;
  }
  // what the lamp at chainage m shows for `dir`: the block, and on single
  // track the section beyond it if an opposing train has it
  signalAspectAt(m, dir, occ) {
    const j = this.sig.indexOf(m);
    let a = this.signalAspect(j >= 0 ? j : this.blockOf(m), dir, occ);
    if (this.single && this.single.length) {
      this.single.forEach(([sa, sb], i) => {
        const entry = dir > 0 ? sa : sb;
        const d = (entry - m) * dir;
        const c = this.claim[i];
        if (d >= -5 && d < 400 && c && c.dir !== dir) a = ASPECT.STOP;
      });
    }
    return a;
  }
  // the next signal ahead of a train, as an index into sig
  signalAhead(train) {
    const here = this.blockOf(train.m);
    return train.dir > 0 ? here + 1 : here;
  }
  // aspect of the signal protecting the block a train at m is about to enter
  aspectFor(train) {
    train.singleStopM = this.single ? this.singleStop(train) : null;
    if (train.singleStopM != null) return ASPECT.STOP;
    const occ = this.occupied(train.dir, train);
    return this.signalAspect(this.signalAhead(train), train.dir, occ);
  }
  // ---- single-track working (line 2 beyond Pilisvörösvár). `sections` are
  // the chainage ranges with one track; the rest has two (double track or a
  // station's loop). A train may enter a section only when no train of the
  // other direction is in it or has claimed it; whoever gets within 900 m of
  // a free section first claims it, and the other waits at the end of its
  // loop, at the exit signal. Before this, trains of both directions ran on
  // the one track and drove through each other.
  setSingleTrack(sections) {
    this.single = sections || [];
    this.claim = this.single.map(() => null);
    this.prefer = this.single.map(() => 0);
  }
  sectionAhead(t) {
    if (!this.single || !this.single.length) return -1;
    let best = -1, bd = 1e9;
    this.single.forEach(([a, b], i) => {
      const entry = t.dir > 0 ? a : b;
      const d = (entry - t.m) * t.dir;
      if (d > -1 && d < bd) { bd = d; best = i; }
    });
    return bd < 900 ? best : -1;
  }
  inSection(t, i) {
    const [a, b] = this.single[i];
    const lo = Math.min(t.m, t.m - t.dir * t.length), hi = Math.max(t.m, t.m - t.dir * t.length);
    return hi > a && lo < b;
  }
  updateSingle() {
    if (!this.single || !this.single.length) return;
    this.single.forEach((sec, i) => {
      const inside = this.trains.filter(t => this.inSection(t, i));
      if (inside.length) {
        this.claim[i] = { dir: inside[0].dir, t: inside[0] };
        if (this.prefer[i] === inside[0].dir) this.prefer[i] = 0;      // the order has been carried out
        return;
      }
      const c = this.claim[i];
      // a claim lapses when its train is no longer on its way in
      if (c && (!this.trains.includes(c.t) || this.sectionAhead(c.t) !== i)) this.claim[i] = null;
    });
    // first come, first served, nearest first
    const want = [];
    for (const t of this.trains) {
      const i = this.sectionAhead(t);
      if (i >= 0 && !this.inSection(t, i)) {
        const [a, b] = this.single[i];
        want.push({ t, i, d: ((t.dir > 0 ? a : b) - t.m) * t.dir });
      }
    }
    want.sort((x, y) => x.d - y.d);
    for (const w of want)
      if (!this.claim[w.i] && (!this.prefer[w.i] || this.prefer[w.i] === w.t.dir))
        this.claim[w.i] = { dir: w.t.dir, t: w.t };
  }
  // the exit signal at the end of the loop, if it is at danger for this train
  singleStop(t) {
    const i = this.sectionAhead(t);
    if (i < 0 || this.inSection(t, i)) return null;
    const c = this.claim[i];
    if (!c || c.dir === t.dir) return null;
    const [a, b] = this.single[i];
    return (t.dir > 0 ? a : b) - t.dir * 25;
  }
  distanceToSignal(train) {
    if (train.singleStopM != null) return Math.max(0, (train.singleStopM - train.m) * train.dir);
    const here = this.blockOf(train.m);
    const idx = train.dir > 0 ? here + 1 : here;
    if (idx < 0 || idx >= this.sig.length) return 1e9;
    return Math.abs(this.sig[idx] - train.m);
  }
  // Services now enter when the timetable says they do, not on a loop.
  spawn(seconds) {
    const COL = { KISS: [0.05, 0.42, 0.45], FLIRT: [0.10, 0.34, 0.58],
                  EC: [0.20, 0.24, 0.34], FREIGHT: [0.30, 0.25, 0.22] };
    while (this.cursor < this.services.length
           && this.services[this.cursor].enter_s <= seconds)
      this.pending.push(this.services[this.cursor++]);
    // A service whose entry is occupied waits until it is clear — it used to
    // be dropped, so with your own train standing at Nyugati no down train
    // ever left all morning. It gives up after twenty minutes.
    const still = [];
    for (const s of this.pending) {
      const m0 = s.enter * 1000;
      const late = this.delayed.get(s.id) || 0;
      if (seconds < s.enter_s + late) { still.push(s); continue; }
      if (seconds - s.enter_s - late > 1200) continue;
      if (this.trains.some(t => Math.abs(t.m - m0) < 420 ||
          (t.dir === s.dir && Math.abs(t.m - m0) < 900))) { still.push(s); continue; }
      // a service that starts inside a single-track section waits while a
      // train of the other direction has that section
      if (this.single && this.single.length) {
        const i = this.single.findIndex(([a, b]) => m0 > a && m0 < b);
        if (i >= 0) {
          const c = this.claim[i];
          const other = this.trains.some(t => t.dir !== s.dir && this.inSection(t, i));
          if (other || (c && c.dir !== s.dir && this.trains.includes(c.t))) { still.push(s); continue; }
        }
      }
      this.trains.push({
        id: s.id, svc: { id: s.name, pattern: "tt" }, name: s.name,
        dir: s.dir, m: m0, v: 0,
        length: s.cars * CAR_LEN[s.stock], carLen: CAR_LEN[s.stock],
        carH: CAR_H[s.stock], cars: s.cars, col: COL[s.stock] || COL.KISS,
        calls: s.calls, callIdx: 0, dwell: 0, aspect: ASPECT.CLEAR,
        stock: s.stock, loco: s.loco,
        // fixed at spawn: a freight's make-up must not change as it moves
        seed: (Math.random() * 2147483647) | 0,
      });
      if (this.trains.length > 16) {
        const i = this.trains.findIndex(t => t.svc.id !== "player");
        if (i >= 0) this.trains.splice(i, 1);
      }
    }
    this.pending = still;
  }
  stopsFor(svc) {
    if (svc.pattern === "all") return this.route.stops;
    if (svc.pattern === "zonal")
      return this.route.stops.filter(s => /Vác$|Verőce|Kismaros|Nagymaros|Zebegény|Szob/.test(s.name));
    if (svc.pattern === "ec")
      return this.route.stops.filter(s => /^(Vác|Nagymaros-Visegrád|Szob)$/.test(s.name));
    return [];
  }
  step(dt, seconds, playerTrain) {
    this.clock = seconds;
    this.spawn(seconds);
    this.updateSingle();
    for (const t of this.trains) {
      if (t === playerTrain) continue;
      t.aspect = this.aspectFor(t);
      if (t.dwell > 0) {
        t.dwell -= dt; t.v = 0;
        // hold until the booked departure, so an early train waits rather
        // than running ahead of its path
        const c = t.calls[t.callIdx - 1];
        if (c && seconds < c[2]) t.dwell = Math.max(t.dwell, 1);
        if (c && t.dwell <= 0) {
          t.late = seconds - c[2];                           // late (s) leaving
          this.late.sum += Math.max(0, t.late); this.late.n++;
        }
        continue;
      }
      // a failed unit: stands where it failed until it is fixed
      const bd = this.breakdown;
      if (bd && !bd.train && t.dir === bd.dir && seconds > bd.after
          && (t.m - bd.m) * t.dir >= 0 && (t.m - bd.m) * t.dir < 80) { bd.train = t; t.failT = bd.dur; }
      if (t.failT > 0) { t.failT -= dt; t.v = 0; continue; }
      const lim = this.route.limitAt(t.m) / 3.6;
      let cap = Math.min(lim, t.stock === "FREIGHT" ? 27 : 36);
      if (t.aspect === ASPECT.STOP) {
        const d = Math.max(0, this.distanceToSignal(t) - 25);
        cap = Math.min(cap, Math.sqrt(2 * 0.7 * d));
      } else if (t.aspect === ASPECT.CAUTION) {
        cap = Math.min(cap, 22);
      }
      const next = t.calls[t.callIdx];
      if (next && next[3]) {
        const d = (next[0] * 1000 - t.m) * t.dir;
        if (d > 0 && d < 2600)
          cap = Math.min(cap, Math.sqrt(2 * 0.6 * Math.max(0, d - 6)));
      }
      // something on the line (the car you drive, stopped on a crossing):
      // seen from 700 m, and then it is the emergency brake
      let eb = false;
      if (this.obstacleM != null) {
        const d = (this.obstacleM - t.m) * t.dir;
        if (d > 0 && d < 700) { cap = Math.min(cap, Math.sqrt(2 * 1.2 * Math.max(0, d - 15))); eb = true; }
      }
      // standing at a red (not at a platform, not broken down): what the
      // dispatcher game scores
      if (t.v < 0.3 && cap < 0.5) this.late.wait = (this.late.wait || 0) + dt;
      const a = t.v < cap ? 0.8 : eb ? -1.3 : -1.1;
      t.v = Math.max(0, t.v + a * dt);
      if (!eb || a > 0) t.v = Math.min(cap, t.v);
      t.m += t.dir * t.v * dt;
      if (next) {
        const d = (next[0] * 1000 - t.m) * t.dir;
        if (d < 16 && (t.v < 1.6 || !next[3])) {
          if (next[3]) { t.v = 0; t.m = next[0] * 1000; t.dwell = 22; }
          t.callIdx++;
        } else if (d < -60) { t.callIdx++; }
      }
    }
    // A service that has made its last call is finished: it goes to the
    // sidings. It used to stand at the Nyugati buffers for ever — the signal
    // before it at danger, so it never ran off the end — and since nothing
    // may spawn within 420 m of another train, the next departure from
    // Nyugati was silently dropped, all day.
    const lo = this.route.m0 - 600, hi = this.route.m1 + 600;
    this.trains = this.trains.filter(t =>
      t === playerTrain || (t.m > lo && t.m < hi
        && !(t.calls && t.callIdx >= t.calls.length && t.dwell <= 0)));
  }
}

// ------------------------------------------------------------ road traffic
//
// The booms have been dropping since the crossing pass and protecting nothing.
// This puts vehicles on the OSM road ways near the line and makes them stop at
// a closed crossing, queue behind each other, and go again when it lifts.
//
// Vehicles live on a road way parameterised by arc length, which makes all of
// it one-dimensional: following the vehicle in front, stopping short of a
// gate, and rejoining are the same comparison of two distances along the way.
// Where a way crosses the railway is worked out once at load.

// `cls` is the widest road class the type belongs on — 0 is 11 m of main
// road and 6 is a 3.2 m track. A bus does not use a farm track and a lorry
// is rare on a village street, which is most of what "not always on the
// road" turned out to mean.
const VEH = [
  { len: 4.55, wid: 1.80, hi: 1.50, kind: "car",       v: 16.0, cls: 6, w: 24 },
  { len: 3.95, wid: 1.72, hi: 1.46, kind: "hatchback", v: 15.0, cls: 6, w: 26 },
  { len: 4.65, wid: 1.88, hi: 1.72, kind: "suv",       v: 15.5, cls: 6, w: 20 },
  { len: 4.45, wid: 1.86, hi: 1.28, kind: "sports",    v: 19.0, cls: 4, w: 10 },
  { len: 3.30, wid: 1.55, hi: 1.44, kind: "small",     v: 13.5, cls: 6, w: 16 },
  { len: 5.40, wid: 2.00, hi: 2.55, kind: "van",       v: 13.0, cls: 5, w: 12 },
  { len: 12.0, wid: 2.55, hi: 3.15, kind: "bus",       v: 12.0, cls: 3, w:  6 },
  { len: 16.5, wid: 2.55, hi: 3.90, kind: "lorry",     v: 11.5, cls: 2, w:  4 },
  { len: 2.10, wid: 0.75, hi: 1.55, kind: "biker",     v: 16.5, cls: 6, w: 12 },
  { len: 1.80, wid: 0.55, hi: 1.65, kind: "bike",      v: 5.2,  cls: 6, w:  8 },
];
// class index → carriageway width, matching what bake_context.py wrote
const ROAD_W = [11.0, 8.5, 7.5, 6.5, 5.5, 3.6, 3.2];

function pickVehicle(cls) {
  let total = 0;
  for (const t of VEH) if (cls <= t.cls) total += t.w;
  let r = Math.random() * total;
  for (const t of VEH) {
    if (cls > t.cls) continue;
    r -= t.w;
    if (r <= 0) return t;
  }
  return VEH[0];
}
const CAR_COLS = [
  [0.72,0.73,0.75], [0.16,0.17,0.19], [0.55,0.13,0.12], [0.14,0.26,0.46],
  [0.70,0.68,0.60], [0.20,0.36,0.26], [0.62,0.52,0.16], [0.38,0.39,0.42],
];

export class RoadTraffic {
  /** ways: [{cls, pts}] in metres east/north. crossings: the barrier list.
   *  trackAt(m) gives the down line's [east, north, elev] at a chainage. */
  constructor(ways, crossings, trackAt, demAt, cap = 900) {
    this.demAt = demAt;
    this.cap = cap;
    this.ways = [];
    this.vehicles = [];
    // only roads a vehicle could plausibly be on, and long enough to drive
    for (const w of ways) {
      if (w.cls > 5 || w.pts.length < 3) continue;
      const cum = [0];
      for (let i = 1; i < w.pts.length; i++)
        cum.push(cum[i-1] + Math.hypot(w.pts[i][0] - w.pts[i-1][0],
                                       w.pts[i][1] - w.pts[i-1][1]));
      if (cum[cum.length-1] < 90) continue;
      // lanes per direction: a one-way street's lanes all run one way
      const lanes = w.lanes || (w.cls <= 2 ? 2 : 1);
      const lpd = w.oneway ? lanes : Math.max(1, Math.floor(lanes / 2));
      const hw = Math.max(ROAD_W[w.cls] || 6, (w.lanes || 0) * 3.25) * 0.5;
      this.ways.push({ pts: w.pts, cum, len: cum[cum.length-1], cls: w.cls, bridge: w.bridge, src: w,
                       gates: [], lanes, lpd, oneway: !!w.oneway, hw });
    }
    // where each way meets a crossing that actually has a barrier
    this.gates = [];
    for (let ci = 0; ci < crossings.length; ci++) {
      const x = crossings[ci];
      if (!x.barrier || x.barrier === "no") continue;
      const p = trackAt(x.m);
      for (let wi = 0; wi < this.ways.length; wi++) {
        const w = this.ways[wi];
        // Closest approach to each SEGMENT, not to each vertex. A straight
        // road crossing a railway usually has no vertex anywhere near the
        // crossing, so matching vertices found almost nothing.
        let bestS = -1, bestD = 13;
        for (let i = 1; i < w.pts.length; i++) {
          const a = w.pts[i-1], b = w.pts[i];
          const ex = b[0] - a[0], ez = b[1] - a[1];
          const ll = ex*ex + ez*ez;
          if (ll < 1e-6) continue;
          let u = ((p[0]-a[0])*ex + (p[1]-a[1])*ez) / ll;
          u = Math.max(0, Math.min(1, u));
          const qx = a[0] + ex*u, qz = a[1] + ez*u;
          const d = Math.hypot(qx - p[0], qz - p[1]);
          if (d < bestD) { bestD = d; bestS = w.cum[i-1] + u * Math.sqrt(ll); }
        }
        if (bestS >= 0) w.gates.push({ s: bestS, m: x.m, ci });
      }
    }
    for (const w of this.ways) w.gates.sort((a, b) => a.s - b.s);
    this.withGates = this.ways.filter(w => w.gates.length);

    // Junctions. OSM ways that meet share a node, but the bake simplifies
    // every polyline, so the shared vertex is often gone from one side: a
    // side street tees into the middle of a straight segment. So an end is
    // matched to the nearest point on any other way's SEGMENTS within 2.5 m
    // (the same lesson as the level crossings). Segments are bucketed on a
    // 40 m grid. `w.links[0|1]` lists, for the start and end of way w,
    // [way index, arc length along it] where a vehicle can carry on.
    this.cell = 40; this.grid = new Map();
    this.ways.forEach((w, wi) => this.index(wi));
    for (let wi = 0; wi < this.ways.length; wi++) this.link(wi);
  }
  gk(i, j) { return i * 100003 + j; }
  index(wi) {
    const w = this.ways[wi], cell = this.cell;
    for (let k = 1; k < w.pts.length; k++) {
      const a = w.pts[k - 1], b = w.pts[k];
      const i0 = Math.floor(Math.min(a[0], b[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const j0 = Math.floor(Math.min(a[1], b[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const kk = this.gk(i, j);
        if (!this.grid.has(kk)) this.grid.set(kk, []);
        this.grid.get(kk).push([wi, k]);
      }
    }
  }
  link(wi) {
    const w = this.ways[wi], cell = this.cell;
    w.links = [0, w.pts.length - 1].map(k => {
      const p = w.pts[k], best = new Map();
      const cand = this.grid.get(this.gk(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) || [];
      for (const [wj, kj] of cand) {
        if (wj === wi) continue;
        const u = this.ways[wj], a = u.pts[kj - 1], b = u.pts[kj];
        const ex = b[0] - a[0], ez = b[1] - a[1], ll = ex * ex + ez * ez;
        if (ll < 1e-6) continue;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / ll));
        const d = Math.hypot(a[0] + ex * t - p[0], a[1] + ez * t - p[1]);
        if (d < 2.5 && (!best.has(wj) || d < best.get(wj)[1]))
          best.set(wj, [u.cum[kj - 1] + t * Math.sqrt(ll), d]);
      }
      return [...best].map(([wj, [sAt]]) => [wj, sAt]);
    });
  }
  /** Roads arriving later (the city tiles): indexed, linked, and the ways
   *  already there whose ends touch them re-linked, so traffic flows from
   *  the line's streets into the city's. Ways are never removed — a dropped
   *  tile's streets simply stop being drawn; vehicles there are culled. */
  addWays(ways) {
    const first = this.ways.length;
    for (const w of ways) {
      if (w.cls > 5 || w.pts.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < w.pts.length; i++)
        cum.push(cum[i-1] + Math.hypot(w.pts[i][0] - w.pts[i-1][0], w.pts[i][1] - w.pts[i-1][1]));
      if (cum[cum.length-1] < 40) continue;
      const lanes = w.lanes || (w.cls <= 2 ? 2 : 1);
      const lpd = w.oneway ? lanes : Math.max(1, Math.floor(lanes / 2));
      const hw = Math.max(ROAD_W[w.cls] || 6, (w.lanes || 0) * 3.25) * 0.5;
      this.ways.push({ pts: w.pts, cum, len: cum[cum.length-1], cls: w.cls, bridge: w.bridge, src: w,
                       gates: [], lanes, lpd, oneway: !!w.oneway, hw });
    }
    const touched = new Set();
    for (let wi = first; wi < this.ways.length; wi++) {
      this.index(wi);
      for (const p of this.ways[wi].pts)
        for (const [wj] of this.grid.get(this.gk(Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell))) || [])
          if (wj < first) touched.add(wj);
    }
    for (let wi = first; wi < this.ways.length; wi++) this.link(wi);
    for (const wj of touched) this.link(wj);
  }

  /** A vehicle has reached an end of its way: carry on into a joining way,
   *  weighted towards the bigger road and away from turning back the way it
   *  came, or turn round only if the end is a genuine dead end. */
  turnAtEnd(v, atEnd) {
    const w = this.ways[v.wi];
    const opts = w.links[atEnd ? 1 : 0];
    // (the next piece of the same big road is by far the likeliest: a car
    // on Váci út stays on Váci út, it does not dive into a car park)
    const CW = [10, 9, 6, 3, 0.9, 0.08, 0.02];
    const choices = [];
    for (const [wj, sAt] of opts) {
      const u = this.ways[wj];
      if (u.cls > v.type.cls) continue;            // a bus does not take a farm track
      const base = (CW[u.cls] || 0.02) * (u.cls === w.cls ? 2.5 : 1);
      if (sAt < u.len - 3) choices.push({ wj, s: sAt, dir: 1, w: base });
      if (sAt > 3 && !u.oneway) choices.push({ wj, s: sAt, dir: -1, w: base });
    }
    if (!choices.length) {                          // dead end
      // a one-way cannot be driven back up: the vehicle leaves the scene and
      // the streamer replaces it somewhere else
      if (w.oneway) { v.gone = true; return; }
      v.dir = -v.dir; v.s = atEnd ? w.len : 0; return;
    }
    let r = Math.random() * choices.reduce((a, c) => a + c.w, 0);
    let c = choices[choices.length - 1];
    for (const o of choices) { r -= o.w; if (r <= 0) { c = o; break; } }
    v.wi = c.wj; v.s = c.s + c.dir * 0.5; v.dir = c.dir;
    v.v = Math.min(v.v, 6);                          // slow for the turn
  }

  /**
   * Vehicles are streamed around the camera rather than scattered over every
   * way in range. The first version picked a way, then a random point along
   * the whole of it, so on a five-kilometre road almost every vehicle landed
   * somewhere you could not see and the visible stretch stayed empty.
   *
   * Now each way is reduced to its closest point to the camera, and a vehicle
   * is placed within a band around that point. Anything that drifts outside
   * the radius is recycled rather than tracked — there is no reason to
   * simulate a bus forty kilometres away, and a bicycle that leaves the view
   * and never comes back is exactly as lifelike as one that does.
   */
  populate(cx, cz, radius) {
    const near = [];
    for (let wi = 0; wi < this.ways.length; wi++) {
      const w = this.ways[wi];
      // closest approach of this way to the camera, and where along it
      let bd = 1e12, bs = 0;
      const stride = Math.max(1, (w.pts.length / 24) | 0);
      for (let i = 0; i < w.pts.length; i += stride) {
        const d = Math.hypot(w.pts[i][0] - cx, w.pts[i][1] - cz);
        if (d < bd) { bd = d; bs = w.cum[i]; }
      }
      if (bd < radius) near.push({ wi, s: bs, d: bd });
    }
    if (!near.length) { this.vehicles.length = 0; return; }
    // A road's share of the traffic is not one vehicle per way. The 12 that
    // runs beside the line carries far more than the cul-de-sac behind the
    // church, and picking a way uniformly gave them the same — which is why
    // the main road read as empty while the side streets had cars on them.
    // Weight by class, and by how much of the way is actually near you.
    // 0 motorway/trunk · 1 primary · 2 secondary · 3 tertiary
    // 4 unclassified/residential · 5 service. A village has forty residential
    // ways and two primaries, so a gentle weighting still leaves the main
    // road empty and every back lane busy; it has to be steep.
    //
    // It is vehicles per kilometre of road, not per way: in the city a
    // boulevard is a string of short ways and there are thousands of side
    // streets and service lanes, so even a steep per-way weight left most
    // cars on the back streets and car-park aisles while Váci út stood
    // empty. The weight is now the length of road near you times how many
    // vehicles a kilometre of that class carries.
    const PER_KM = [44, 34, 20, 9, 1.0, 0.08, 0];
    let wTotal = 0, perKm = 0;
    for (const o of near) {
      const w = this.ways[o.wi];
      perKm += (PER_KM[w.cls] || 0.05) * Math.min(w.len, 1040) / 1000;
      const lanes = Math.max(1, Math.min(4, w.lanes || 1));
      o.weight = (PER_KM[w.cls] || 0.05)
               * Math.min(w.len, 1040) / 1000
               * (0.6 + 0.4 * lanes)
               * (w.gates.length ? 2.0 : 1)
               * (1.4 - Math.min(1.0, o.d / radius));   // nearer roads first
      wTotal += o.weight;
    }
    const pickWay = () => {
      let r = Math.random() * wTotal;
      for (const o of near) { r -= o.weight; if (r <= 0) return o; }
      return near[near.length - 1];
    };
    const byWay = new Map(near.map(o => [o.wi, o]));
    // drop anything that has wandered out of range or off a way we dropped
    this.vehicles = this.vehicles.filter(v => {
      const o = byWay.get(v.wi);
      if (!o) return false;
      return Math.abs(v.s - o.s) < radius * 1.2;
    });
    // roads with a crossing on them are the interesting ones and there are
    // only a couple, so they get a share out of proportion to their number
    // How many: what that much road of those classes carries. (It was 90 plus
    // five per way, which asked for hundreds more than the big roads could
    // take, and the rest spilled into the side streets.)
    const want = Math.min(this.cap, Math.round(40 + perKm * 3.6));
    let guard = 0;
    while (this.vehicles.length < want && guard++ < 3000) {
      const o = pickWay();
      const w = this.ways[o.wi];
      // within a band around the nearest point, not anywhere on the way
      // in a band around the point nearest the camera, not the whole way
      const band = Math.min(520, w.len * 0.5);
      const s = o.s + (Math.random() * 2 - 1) * band;
      if (s < 0 || s > w.len) continue;
      // room for it: a way holds about one vehicle per 16 m of its length,
      // and nothing is spawned on top of another — overlapping spawns have a
      // negative gap that neither can open, which is how 69 cars ended up
      // parked on a 129 m street
      const onWay = this.vehicles.filter(u => u.wi === o.wi);
      if (onWay.length >= Math.max(1, w.len / 16)) continue;
      if (onWay.some(u => Math.abs(u.s - s) < 14)) continue;
      const type = pickVehicle(w.cls);
      this.vehicles.push({
        wi: o.wi, s, dir: w.oneway || Math.random() < 0.5 ? 1 : -1,
        v: type.v * (0.7 + Math.random() * 0.3), type,
        col: CAR_COLS[(Math.random() * CAR_COLS.length) | 0],
        want: type.v * (0.75 + Math.random() * 0.45),
      });
    }
  }

  /** closed: a Set of crossing indices whose booms are down.
   *
   *  Each way is one-dimensional, so a vehicle's world is two lists: the
   *  vehicles going its way, sorted by arc length, and the ones coming
   *  towards it. Following means looking up the next one in its own list.
   *  The first version looked only at the adjacent vehicle in one combined
   *  list and skipped it if it was oncoming, so a car with an oncoming one
   *  between it and the car ahead drove straight through the car ahead.
   *
   *  Overtaking. On a road wide enough for two lanes (see `place`), a vehicle
   *  held up by a slower one pulls into the other lane when the oncoming lane
   *  is clear for as far as the pass needs, goes by, and pulls back in once
   *  it has a car length and a gap in hand. If something appears the other
   *  way it gives up and drops back. Not near a closed crossing, and never a
   *  bus or lorry. `v.lane` is the lateral position, 1 in its own lane and
   *  -1 in the other, eased so the move across is visible.
   */
  step(dt, closed) {
    const turning = [];
    const byWay = new Map();
    for (const v of this.vehicles) {
      if (!byWay.has(v.wi)) byWay.set(v.wi, { up: [], down: [] });
      byWay.get(v.wi)[v.dir > 0 ? "up" : "down"].push(v);
    }
    for (const [wi, g] of byWay) {
      const w = this.ways[wi];
      const twoLane = w.lpd >= 2 || ((w.hw * 2) > 5.2 && w.cls <= 4 && !w.oneway);
      // with a second lane in our own direction a pass needs no gap in the
      // oncoming traffic, and a one-way has none
      const ownLane = w.lpd >= 2;
      g.up.sort((a, b) => a.s - b.s);
      g.down.sort((a, b) => b.s - a.s);      // both lists now run front-to-back reversed
      for (const [same, other] of [[g.up, g.down], [g.down, g.up]]) {
        // same[] is sorted in travel order, so the vehicle ahead of same[i]
        // is same[i+1]; `ahead` skips anything we are in the middle of passing
        for (let i = 0; i < same.length; i++) {
          const v = same[i];
          if (v.lane === undefined) v.lane = 1;
          const fwd = (x) => (x.s - v.s) * v.dir;   // distance ahead along travel
          let cap = v.want;

          let ahead = null, aheadGap = 1e9;
          for (let j = i + 1; j < same.length; j++) {
            const u = same[j];
            const gap = fwd(u) - (v.type.len + u.type.len) * 0.5 - 2.5;
            if (gap > 120) break;
            // while passing, only a vehicle also out in our lane counts
            if (v.passing && u === v.passing) continue;
            if (v.passing && u.lane > 0 && gap > -2) continue;
            // and one out in the other lane passing us is not in our way
            if (!v.passing && u.lane < 0) continue;
            ahead = u; aheadGap = gap; break;
          }

          // oncoming traffic within `look` metres, in the lane we might use
          const oncomingWithin = (look) => {
            if (ownLane) return false;
            for (const u of other) {
              const d = fwd(u);
              if (d > -5 && d < look && u.lane > -0.2) return true;
            }
            return false;
          };

          let gateAhead = false, gateNear = false;
          for (const gt of w.gates) {
            const d = (gt.s - v.s) * v.dir - 7.0;
            if (d > -3 && d < 260) gateNear = true;
            if (!closed.has(gt.ci)) continue;
            if (d < -3 || d > 140) continue;
            cap = Math.min(cap, Math.sqrt(Math.max(0, d) * 2 * 1.9));
            gateAhead = true;
          }

          // decide to pull out
          const canPass = twoLane && !gateNear && (ownLane || v.type.len < 10) && v.type.kind !== "bike";
          if (!v.passing && canPass && ahead && aheadGap < 26
              && ahead.v < v.want - 3.0 && ahead.lane > 0.5) {
            v.blocked = (v.blocked || 0) + dt;
            // the pass needs the gap, the other vehicle, a car length and the
            // distance the oncoming lane closes while we do it
            const need = (aheadGap + ahead.type.len + v.type.len + 14) * 2.2 + 40;
            if (v.blocked > 2.5 && !oncomingWithin(need)) {
              v.passing = ahead; v.blocked = 0;
            }
          } else if (!v.passing) v.blocked = 0;

          if (v.passing) {
            const p = v.passing;
            const lead = fwd(p) * -1 - (v.type.len + p.type.len) * 0.5;   // how far we are past it
            cap = Math.max(cap, v.want * 1.18);
            if (!this.vehicles.includes(p) || lead > 8) {
              v.passing = null;                                  // done: pull back in
            } else if (oncomingWithin(70) && lead < 0) {
              v.passing = null; cap = Math.min(cap, p.v * 0.9);  // abort and drop back
            }
          }
          if (ahead && !v.passing)
            cap = Math.min(cap, Math.max(0, Math.sqrt(Math.max(0, aheadGap) * 2 * 2.2)));
          else if (ahead && v.passing && aheadGap < 30)
            cap = Math.min(cap, Math.max(0, Math.sqrt(Math.max(0, aheadGap) * 2 * 2.2)));

          // the car you drive: whatever is within 2.5 m of our line ahead
          if (this.obstacles && this.obstacles.length) {
            const q = this.place(v);
            for (const o of this.obstacles) {
              const dx = o.x - q.x, dn = o.n - q.z;
              const along = dx * q.fx + dn * q.fz, side = Math.abs(dx * q.fz - dn * q.fx);
              if (along > 0 && along < 60 && side < 2.6)
                cap = Math.min(cap, Math.sqrt(2 * 3.0 * Math.max(0, along - v.type.len * 0.5 - 3.5)));
            }
          }
          const a = v.v < cap ? 2.2 : -3.4;
          v.v = Math.max(0, Math.min(cap, v.v + a * dt));
          v.s += v.dir * v.v * dt;
          const laneTo = v.passing ? -1 : 1;
          v.lane += Math.max(-dt * 0.9, Math.min(dt * 0.9, laneTo - v.lane));

          // Two vehicles spawned on top of each other have a negative gap and
          // neither can open it, so the whole road behind them stops for ever.
          // Anything stationary with nothing shut in front of it gets moved on.
          if (v.v < 0.05) {
            v.stuck = (v.stuck || 0) + dt;
            if (v.stuck > 12 && !gateAhead) { v.s += v.dir * 9; v.stuck = 0; }
          } else v.stuck = 0;
          if (v.s < 0 || v.s > w.len) {
            v.s = Math.max(0, Math.min(w.len, v.s));
            v.passing = null; v.lane = 1; turning.push(v);
          }
        }
      }
    }
    for (const v of turning) this.turnAtEnd(v, v.s >= this.ways[v.wi].len - 0.01);
    if (turning.some(v => v.gone)) this.vehicles = this.vehicles.filter(v => !v.gone);
  }

  /** world position and heading of a vehicle */
  place(v) {
    const w = this.ways[v.wi];
    let i = 1;
    while (i < w.cum.length - 1 && w.cum[i] < v.s) i++;
    const s0 = w.cum[i-1], s1 = w.cum[i];
    const u = s1 > s0 ? (v.s - s0) / (s1 - s0) : 0;
    const a = w.pts[i-1], b = w.pts[i];
    const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    // Lateral position from the real lanes. v.lane is 1 in the kerb lane of
    // our direction and -1 one lane further out: the oncoming lane on a
    // two-lane road, our own second lane on a wider one.
    const W = this.ways[v.wi];
    const laneW = (W.hw * 2) / W.lanes;
    const lp = (1 - (v.lane === undefined ? 1 : v.lane)) * 0.5;
    // a single-lane two-way road: everyone uses the middle
    const lane = W.lanes === 1 && !W.oneway ? 0 : W.hw - (lp + 0.5) * laneW;
    const offx = -dz / L * lane * v.dir, offz = dx / L * lane * v.dir;
    return { x: x + offx, z: z + offz, fx: dx / L * v.dir, fz: dz / L * v.dir, i, u };
  }
}

/** Geometry for everything currently on the road, near the camera. */
/**
 * @param reach  how far vehicles are drawn. From the cab, 560 m is generous —
 *               you are two metres above the rail and a car at 600 m is two
 *               pixels. From the chase view, and much more from the free
 *               camera, you are looking down a whole valley and the cars stop
 *               dead in a circle around you, which is what Mark saw. The
 *               caller passes a reach that grows with how high the camera is.
 */
export function buildRoadTraffic(rt, camX, camZ, demAt, night, reach, surfaceAt, models, snowy) {
  const V = [], C = [];
  // Cars with a textured model (models/cars.json, tools/bake_models.py) are
  // not built here: they go out as instances, one list per model, of
  // [x, y, z, heading, length, atlas cell, 0, 0]. Only their lamps are drawn
  // here, at night. Buses, lorries and bikes stay as they were.
  const inst = models ? models.map(() => []) : null;
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => {
    push(a, col); push(b, col); push(c, col);
    push(a, col); push(c, col); push(d, col);
  };
  const GLASSV = night > 0.5 ? [0.10, 0.11, 0.13] : [0.09, 0.11, 0.14];
  const TYRE = [0.10, 0.10, 0.11];
  const HEAD = [1.9 * (0.35 + night), 1.85 * (0.35 + night), 1.6 * (0.35 + night)];
  const TAIL = [1.5 * (0.35 + night), 0.10, 0.09];
  const WHITE = [0.86, 0.88, 0.90];

  for (const v of rt.vehicles) {
    // A car at half a kilometre is three pixels. Simulating it is cheap;
    // rebuilding its geometry every frame is not, so cull before place().
    const w0 = rt.ways[v.wi];
    const p0 = w0.pts[Math.min(w0.pts.length - 1, (v.s / w0.len * (w0.pts.length - 1)) | 0)];
    const R = reach || 560;
    if (Math.abs(p0[0] - camX) > R + 60 || Math.abs(p0[1] - camZ) > R + 60) continue;
    const q = rt.place(v);
    if (Math.hypot(q.x - camX, q.z - camZ) > R) continue;

    // Elevation: on ground roads use demRidge + offset; on bridges ride the elevated deck
    let y = surfaceAt ? surfaceAt(q.x, q.z) : demRidge(demAt, q.x, q.z) + 0.345;
    // The road mesh is flat between its points; the ground under the car is
    // not. In a dip the car sat under the drawn road and vanished from above,
    // so it rides the higher of the two: the ground, or the road's chord.
    if (surfaceAt && q.i != null) {
      const ys = w0.ys || (w0.ys = []);
      const a = w0.pts[q.i - 1], b = w0.pts[q.i];
      if (ys[q.i - 1] == null) ys[q.i - 1] = surfaceAt(a[0], a[1]);
      if (ys[q.i] == null) ys[q.i] = surfaceAt(b[0], b[1]);
      const chord = ys[q.i - 1] + (ys[q.i] - ys[q.i - 1]) * q.u;
      if (isFinite(chord)) y = Math.max(y, chord);
    }
    if (w0.bridge === 3) {
      // an underpass: the road is dug below the line (geom.js underpassDip)
      y = w0.src && w0.src.floorAt ? w0.src.floorAt(q.x, q.z)
        : demRidge(demAt, q.x, q.z) + 0.345 + (rt.dipAt ? rt.dipAt(q.x, q.z) : 0);
    } else if (w0.bridge && w0.src && w0.src.deckAt) {
      // the same deck the bridge mesh was built on (geom.js buildRoads)
      y = w0.src.deckAt(q.x, q.z) + 0.05;
    }
    if (!isFinite(y)) continue;
    const t = v.type;
    const hw = t.wid * 0.5, hl = t.len * 0.5;
    const fx = q.fx, fz = q.fz, rx = -fz, rz = fx;
    const P = (along, across, up) => [
      q.x + fx * along + rx * across, y + up, q.z + fz * along + rz * across];

    if (inst) {
      if (v.mdl === undefined) {
        const cand = [];
        models.forEach((m, i) => { if (m.kinds.includes(t.kind)) cand.push(i); });
        v.mdl = cand.length ? cand[(Math.random() * cand.length) | 0] : -1;
        if (v.mdl >= 0) v.skinK = Math.random();
      }
      if (v.mdl >= 0) {
        const m = models[v.mdl];
        const pool = snowy && m.snow.length ? m.snow : m.skins;
        const cell = pool[Math.min(pool.length - 1, (v.skinK * pool.length) | 0)];
        inst[v.mdl].push(q.x, y, -q.z, Math.atan2(fx, fz), t.len, cell, 0, 0);
        if (night > 0.05) {
          for (const sg of [-1, 1]) {
            quad(P(hl + 0.02, sg * hw * 0.62 - 0.16, 0.55), P(hl + 0.02, sg * hw * 0.62 + 0.16, 0.55),
                 P(hl + 0.02, sg * hw * 0.62 + 0.16, 0.75), P(hl + 0.02, sg * hw * 0.62 - 0.16, 0.75), HEAD);
            quad(P(-hl - 0.02, sg * hw * 0.62 + 0.14, 0.62), P(-hl - 0.02, sg * hw * 0.62 - 0.14, 0.62),
                 P(-hl - 0.02, sg * hw * 0.62 - 0.14, 0.78), P(-hl - 0.02, sg * hw * 0.62 + 0.14, 0.78), TAIL);
          }
        }
        continue;
      }
    }

    if (t.kind === "bike") {
      quad(P(-hl, 0, 0.25), P(hl, 0, 0.25), P(hl, 0, 1.05), P(-hl, 0, 1.05), TYRE);
      quad(P(-0.25, -0.22, 1.05), P(0.25, -0.22, 1.05),
           P(0.25, 0.22, 1.70), P(-0.25, 0.22, 1.70), v.col);
      continue;
    }

    if (t.kind === "bus") {
      // A full-size 12 m transit bus: BKK Sky Blue or Volánbusz Yellow livery,
      // panoramic side window ribbons, large windscreen and roof AC pods
      const busCol = (v.wi % 3 === 0) ? [0.05, 0.46, 0.78] : (v.wi % 3 === 1) ? [0.92, 0.74, 0.12] : v.col;
      const roofH = t.hi, winLo = 1.05, winHi = 2.65;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        // lower skirt
        quad(P(-hl, o, 0.28), P(hl, o, 0.28), P(hl, o, winLo), P(-hl, o, winLo), busCol);
        // window band
        quad(P(-hl * 0.96, o, winLo), P(hl * 0.94, o, winLo),
             P(hl * 0.94, o, winHi), P(-hl * 0.96, o, winHi), GLASSV);
        // roof cove
        quad(P(-hl, o, winHi), P(hl, o, winHi), P(hl, o, roofH), P(-hl, o, roofH), WHITE);
        // wheels: front and rear axles
        for (const wx of [-hl * 0.58, hl * 0.62])
          quad(P(wx - 0.44, o * 1.02, 0.05), P(wx + 0.44, o * 1.02, 0.05),
               P(wx + 0.44, o * 1.02, 0.88), P(wx - 0.44, o * 1.02, 0.88), TYRE);
      }
      // roof, front and rear
      quad(P(-hl, -hw, roofH), P(hl, -hw, roofH), P(hl, hw, roofH), P(-hl, hw, roofH), WHITE);
      // roof AC pod
      quad(P(-1.5, -hw * 0.6, roofH + 0.02), P(1.8, -hw * 0.6, roofH + 0.02),
           P(1.8, hw * 0.6, roofH + 0.32), P(-1.5, hw * 0.6, roofH + 0.32), [0.78, 0.79, 0.80]);
      // front windscreen & destination board
      quad(P(hl, -hw, winLo), P(hl, hw, winLo), P(hl, hw, winHi + 0.1), P(hl, -hw, winHi + 0.1), GLASSV);
      quad(P(hl, -hw, 0.28), P(hl, hw, 0.28), P(hl, hw, winLo), P(hl, -hw, winLo), busCol);
      quad(P(hl, -hw, winHi + 0.1), P(hl, hw, winHi + 0.1), P(hl, hw, roofH), P(hl, -hw, roofH), [0.12, 0.13, 0.14]);
      // rear
      quad(P(-hl, -hw, 0.28), P(-hl, hw, 0.28), P(-hl, hw, roofH), P(-hl, -hw, roofH), busCol);
    } else if (t.kind === "biker") {
      // Motorcyclist with detailed motorcycle, wheels, handlebars, and rider in helmet & jacket
      const BIKE_CHASSIS = [0.18, 0.18, 0.20], HELMET = v.col, JACKET = [0.16, 0.22, 0.32];
      const CHROME = [0.82, 0.84, 0.88];
      // Front and rear wheels
      for (const wx of [-hl * 0.65, hl * 0.65]) {
        quad(P(wx - 0.30, 0, 0.05), P(wx + 0.30, 0, 0.05),
             P(wx + 0.30, 0, 0.65), P(wx - 0.30, 0, 0.65), TYRE);
      }
      // Fuel tank & central bike frame
      quad(P(-hl * 0.4, -0.18, 0.45), P(hl * 0.3, -0.18, 0.45),
           P(hl * 0.3, 0.18, 0.45), P(-hl * 0.4, 0.18, 0.45), BIKE_CHASSIS);
      quad(P(-hl * 0.2, -0.18, 0.45), P(hl * 0.2, -0.18, 0.45),
           P(hl * 0.2, -0.18, 0.85), P(-hl * 0.2, -0.18, 0.85), v.col);
      quad(P(hl * 0.2, 0.18, 0.45), P(-hl * 0.2, 0.18, 0.45),
           P(-hl * 0.2, 0.18, 0.85), P(hl * 0.2, 0.18, 0.85), v.col);
      quad(P(-hl * 0.2, -0.18, 0.85), P(hl * 0.2, -0.18, 0.85),
           P(hl * 0.2, 0.18, 0.85), P(-hl * 0.2, 0.18, 0.85), v.col);
      // Handlebars
      quad(P(hl * 0.25, -0.36, 0.88), P(hl * 0.25, 0.36, 0.88),
           P(hl * 0.25, 0.36, 0.94), P(hl * 0.25, -0.36, 0.94), CHROME);
      // Rider Body & Legs (leaned forward)
      quad(P(-hl * 0.35, -0.22, 0.65), P(hl * 0.05, -0.22, 0.75),
           P(hl * 0.05, 0.22, 0.75), P(-hl * 0.35, 0.22, 0.65), JACKET);
      quad(P(-hl * 0.35, -0.20, 0.75), P(0, -0.20, 1.25),
           P(0, 0.20, 1.25), P(-hl * 0.35, 0.20, 0.75), JACKET);
      // Helmet with dark visor
      quad(P(-0.15, -0.16, 1.25), P(0.15, -0.16, 1.25),
           P(0.15, 0.16, 1.25), P(-0.15, 0.16, 1.25), HELMET);
      quad(P(-0.14, -0.14, 1.25), P(0.14, -0.14, 1.25),
           P(0.14, -0.14, 1.55), P(-0.14, -0.14, 1.55), HELMET);
      quad(P(0.14, 0.14, 1.25), P(-0.14, 0.14, 1.25),
           P(-0.14, 0.14, 1.55), P(0.14, 0.14, 1.55), HELMET);
      quad(P(0.15, -0.14, 1.30), P(0.15, 0.14, 1.30),
           P(0.15, 0.14, 1.48), P(0.15, -0.14, 1.48), [0.08, 0.09, 0.10]);
    } else if (t.kind === "hatchback") {
      // Sloped rear tailgate hatchback
      const bonnet = hl * 0.30, cowl = hl * 0.25, rearCowl = -hl * 0.30, tailgate = -hl * 0.88;
      const waistH = 0.76, roofH = t.hi;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        quad(P(-hl, o, 0.24), P(hl, o, 0.24), P(hl, o, waistH), P(-hl, o, waistH), v.col);
        quad(P(rearCowl, o * 0.94, waistH), P(cowl, o * 0.94, waistH),
             P(cowl * 0.6, o * 0.84, roofH), P(rearCowl * 0.85, o * 0.84, roofH), GLASSV);
        for (const wx of [-hl * 0.62, hl * 0.62])
          quad(P(wx - 0.32, o * 1.02, 0.05), P(wx + 0.32, o * 1.02, 0.05),
               P(wx + 0.32, o * 1.02, 0.60), P(wx - 0.32, o * 1.02, 0.60), TYRE);
      }
      quad(P(bonnet, -hw, waistH), P(hl, -hw, waistH * 0.86), P(hl, hw, waistH * 0.86), P(bonnet, hw, waistH), v.col);
      quad(P(cowl * 0.4, -hw * 0.88, roofH), P(bonnet, -hw * 0.94, waistH),
           P(bonnet, hw * 0.94, waistH), P(cowl * 0.4, hw * 0.88, roofH), GLASSV);
      quad(P(rearCowl * 0.7, -hw * 0.85, roofH), P(cowl * 0.4, -hw * 0.85, roofH),
           P(cowl * 0.4, hw * 0.85, roofH), P(rearCowl * 0.7, hw * 0.85, roofH), v.col);
      // Slanted rear tailgate glass
      quad(P(tailgate, -hw * 0.90, waistH), P(rearCowl * 0.7, -hw * 0.85, roofH),
           P(rearCowl * 0.7, hw * 0.85, roofH), P(tailgate, hw * 0.90, waistH), GLASSV);
      quad(P(-hl, -hw, 0.24), P(tailgate, -hw, waistH), P(tailgate, hw, waistH), P(-hl, hw, 0.24), v.col);
      quad(P(hl, -hw, 0.24), P(hl, hw, 0.24), P(hl, hw, waistH * 0.86), P(hl, -hw, waistH * 0.86), v.col);
    } else if (t.kind === "suv") {
      // Tall chunky SUV / Crossover with roof rails
      const bonnet = hl * 0.35, cowl = hl * 0.30, rearCowl = -hl * 0.75;
      const waistH = 0.92, roofH = t.hi;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        quad(P(-hl, o, 0.32), P(hl, o, 0.32), P(hl, o, waistH), P(-hl, o, waistH), v.col);
        quad(P(rearCowl, o * 0.95, waistH), P(cowl, o * 0.95, waistH),
             P(cowl * 0.7, o * 0.88, roofH), P(rearCowl, o * 0.88, roofH), GLASSV);
        for (const wx of [-hl * 0.65, hl * 0.65])
          quad(P(wx - 0.40, o * 1.02, 0.05), P(wx + 0.40, o * 1.02, 0.05),
               P(wx + 0.40, o * 1.02, 0.76), P(wx - 0.40, o * 1.02, 0.76), TYRE);
      }
      quad(P(bonnet, -hw, waistH), P(hl, -hw, waistH * 0.92), P(hl, hw, waistH * 0.92), P(bonnet, hw, waistH), v.col);
      quad(P(cowl * 0.5, -hw * 0.90, roofH), P(bonnet, -hw * 0.96, waistH),
           P(bonnet, hw * 0.96, waistH), P(cowl * 0.5, hw * 0.90, roofH), GLASSV);
      quad(P(rearCowl, -hw * 0.88, roofH), P(cowl * 0.5, -hw * 0.88, roofH),
           P(cowl * 0.5, hw * 0.88, roofH), P(rearCowl, hw * 0.88, roofH), v.col);
      quad(P(-hl * 0.95, -hw * 0.92, waistH), P(rearCowl, -hw * 0.88, roofH),
           P(rearCowl, hw * 0.88, roofH), P(-hl * 0.95, hw * 0.92, waistH), GLASSV);
      quad(P(-hl, -hw, 0.32), P(-hl, hw, 0.32), P(-hl, hw, waistH), P(-hl, -hw, waistH), v.col);
      quad(P(hl, -hw, 0.32), P(hl, hw, 0.32), P(hl, hw, waistH * 0.92), P(hl, -hw, waistH * 0.92), v.col);
      // Silver roof rack bars
      for (const ro of [-hw * 0.75, hw * 0.75]) {
        quad(P(rearCowl + 0.2, ro, roofH + 0.08), P(cowl * 0.3, ro, roofH + 0.08),
             P(cowl * 0.3, ro, roofH + 0.14), P(rearCowl + 0.2, ro, roofH + 0.14), [0.85, 0.87, 0.90]);
      }
    } else if (t.kind === "sports") {
      // Low-slung aerodynamic sports car with rear spoiler
      const bonnet = hl * 0.40, cowl = hl * 0.32, rearCowl = -hl * 0.42, boot = -hl * 0.85;
      const waistH = 0.65, roofH = t.hi;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        quad(P(-hl, o, 0.18), P(hl, o, 0.18), P(hl, o, waistH), P(-hl, o, waistH), v.col);
        quad(P(rearCowl, o * 0.92, waistH), P(cowl, o * 0.92, waistH),
             P(cowl * 0.4, o * 0.80, roofH), P(rearCowl * 0.7, o * 0.80, roofH), GLASSV);
        for (const wx of [-hl * 0.66, hl * 0.66])
          quad(P(wx - 0.35, o * 1.02, 0.05), P(wx + 0.35, o * 1.02, 0.05),
               P(wx + 0.35, o * 1.02, 0.58), P(wx - 0.35, o * 1.02, 0.58), TYRE);
      }
      quad(P(bonnet, -hw, waistH), P(hl, -hw, waistH * 0.75), P(hl, hw, waistH * 0.75), P(bonnet, hw, waistH), v.col);
      quad(P(0, -hw * 0.84, roofH), P(bonnet, -hw * 0.92, waistH),
           P(bonnet, hw * 0.92, waistH), P(0, hw * 0.84, roofH), GLASSV);
      quad(P(rearCowl * 0.7, -hw * 0.80, roofH), P(0, -hw * 0.80, roofH),
           P(0, hw * 0.80, roofH), P(rearCowl * 0.7, hw * 0.80, roofH), v.col);
      quad(P(boot, -hw * 0.88, waistH), P(rearCowl * 0.7, -hw * 0.80, roofH),
           P(rearCowl * 0.7, hw * 0.80, roofH), P(boot, hw * 0.88, waistH), GLASSV);
      quad(P(-hl, -hw, waistH * 0.85), P(boot, -hw, waistH), P(boot, hw, waistH), P(-hl, hw, waistH * 0.85), v.col);
      // Rear Wing Spoiler
      quad(P(-hl * 0.92, -hw * 0.85, waistH + 0.28), P(-hl * 0.75, -hw * 0.85, waistH + 0.28),
           P(-hl * 0.75, hw * 0.85, waistH + 0.28), P(-hl * 0.92, hw * 0.85, waistH + 0.28), [0.15, 0.15, 0.16]);
    } else if (t.kind === "small") {
      // Small city minicar (Trabant / Fiat style)
      const bonnet = hl * 0.25, cowl = hl * 0.20, rearCowl = -hl * 0.75;
      const waistH = 0.72, roofH = t.hi;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        quad(P(-hl, o, 0.22), P(hl, o, 0.22), P(hl, o, waistH), P(-hl, o, waistH), v.col);
        quad(P(rearCowl, o * 0.92, waistH), P(cowl, o * 0.92, waistH),
             P(cowl * 0.7, o * 0.84, roofH), P(rearCowl, o * 0.84, roofH), GLASSV);
        for (const wx of [-hl * 0.60, hl * 0.60])
          quad(P(wx - 0.28, o * 1.02, 0.05), P(wx + 0.28, o * 1.02, 0.05),
               P(wx + 0.28, o * 1.02, 0.52), P(wx - 0.28, o * 1.02, 0.52), TYRE);
      }
      quad(P(bonnet, -hw, waistH), P(hl, -hw, waistH * 0.90), P(hl, hw, waistH * 0.90), P(bonnet, hw, waistH), v.col);
      quad(P(cowl * 0.4, -hw * 0.86, roofH), P(bonnet, -hw * 0.92, waistH),
           P(bonnet, hw * 0.92, waistH), P(cowl * 0.4, hw * 0.86, roofH), GLASSV);
      // Contrasting white/cream roof
      quad(P(rearCowl, -hw * 0.84, roofH), P(cowl * 0.4, -hw * 0.84, roofH),
           P(cowl * 0.4, hw * 0.84, roofH), P(rearCowl, hw * 0.84, roofH), WHITE);
      quad(P(-hl * 0.92, -hw * 0.88, waistH), P(rearCowl, -hw * 0.84, roofH),
           P(rearCowl, hw * 0.84, roofH), P(-hl * 0.92, hw * 0.88, waistH), GLASSV);
      quad(P(-hl, -hw, 0.22), P(-hl, hw, 0.22), P(-hl, hw, waistH), P(-hl, -hw, waistH), v.col);
    } else if (t.kind === "car") {
      // Aerodynamic passenger car: bonnet, raked windscreen, roof, rear windscreen & boot
      const bonnet = hl * 0.32, cowl = hl * 0.28, rearCowl = -hl * 0.34, boot = -hl * 0.68;
      const waistH = 0.78, roofH = t.hi;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        // lower side body
        quad(P(-hl, o, 0.25), P(hl, o, 0.25), P(hl, o, waistH), P(-hl, o, waistH), v.col);
        // side glass
        quad(P(rearCowl, o * 0.94, waistH), P(cowl, o * 0.94, waistH),
             P(cowl * 0.6, o * 0.84, roofH), P(rearCowl * 0.8, o * 0.84, roofH), GLASSV);
        // wheels
        for (const wx of [-hl * 0.64, hl * 0.64])
          quad(P(wx - 0.34, o * 1.02, 0.05), P(wx + 0.34, o * 1.02, 0.05),
               P(wx + 0.34, o * 1.02, 0.62), P(wx - 0.34, o * 1.02, 0.62), TYRE);
      }
      // bonnet / hood
      quad(P(bonnet, -hw, waistH), P(hl, -hw, waistH * 0.88), P(hl, hw, waistH * 0.88), P(bonnet, hw, waistH), v.col);
      // windscreen
      quad(P(rearCowl * 0.2, -hw * 0.88, roofH), P(bonnet, -hw * 0.94, waistH),
           P(bonnet, hw * 0.94, waistH), P(rearCowl * 0.2, hw * 0.88, roofH), GLASSV);
      // roof
      quad(P(rearCowl * 0.8, -hw * 0.85, roofH), P(rearCowl * 0.2, -hw * 0.85, roofH),
           P(rearCowl * 0.2, hw * 0.85, roofH), P(rearCowl * 0.8, hw * 0.85, roofH), v.col);
      // rear window
      quad(P(boot, -hw * 0.92, waistH), P(rearCowl * 0.8, -hw * 0.85, roofH),
           P(rearCowl * 0.8, hw * 0.85, roofH), P(boot, hw * 0.92, waistH), GLASSV);
      // boot lid
      quad(P(-hl, -hw, waistH * 0.92), P(boot, -hw, waistH), P(boot, hw, waistH), P(-hl, hw, waistH * 0.92), v.col);
      // front and rear bumpers
      quad(P(hl, -hw, 0.25), P(hl, hw, 0.25), P(hl, hw, waistH * 0.88), P(hl, -hw, waistH * 0.88), v.col);
      quad(P(-hl, -hw, 0.25), P(-hl, hw, 0.25), P(-hl, hw, waistH * 0.92), P(-hl, -hw, waistH * 0.92), v.col);
    } else {
      // Lorry / Van
      const body = t.hi - 0.50, roof = t.hi;
      const cabFrom = t.kind === "lorry" ? hl - 2.8 : -hl * 0.3;
      for (const sgn of [-1, 1]) {
        const o = sgn * hw;
        quad(P(-hl, o, 0.28), P(hl, o, 0.28), P(hl, o, body), P(-hl, o, body), v.col);
        quad(P(cabFrom, o, body), P(hl, o, body), P(hl, o, roof), P(cabFrom, o, roof), GLASSV);
        if (t.kind === "lorry") {
          quad(P(-hl, o, body), P(cabFrom, o, body),
               P(cabFrom, o, roof - 0.15), P(-hl, o, roof - 0.15), [0.70,0.71,0.72]);
        }
        for (const wx of [-hl * 0.66, hl * 0.66])
          quad(P(wx - 0.38, o * 1.02, 0.06), P(wx + 0.38, o * 1.02, 0.06),
               P(wx + 0.38, o * 1.02, 0.72), P(wx - 0.38, o * 1.02, 0.72), TYRE);
      }
      quad(P(-hl, -hw, roof), P(hl, -hw, roof), P(hl, hw, roof), P(-hl, hw, roof),
           t.kind === "lorry" ? [0.72,0.73,0.74] : v.col);
      quad(P(hl, -hw, 0.28), P(hl, hw, 0.28), P(hl, hw, body), P(hl, -hw, body), v.col);
      quad(P(-hl, -hw, 0.28), P(-hl, hw, 0.28), P(-hl, hw, body), P(-hl, -hw, body), v.col);
    }

    // lamps: white headlights forward, red taillights back
    for (const lx of [-hw * 0.66, hw * 0.66]) {
      quad(P(hl, lx - 0.16, 0.46), P(hl, lx + 0.16, 0.46),
           P(hl, lx + 0.16, 0.68), P(hl, lx - 0.16, 0.68), HEAD);
      quad(P(-hl, lx - 0.16, 0.48), P(-hl, lx + 0.16, 0.48),
           P(-hl, lx + 0.16, 0.68), P(-hl, lx - 0.16, 0.68),
           v.v < 1.0 ? [TAIL[0] * 1.7, TAIL[1], TAIL[2]] : TAIL);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3, inst };
}

// ----------------------------------------------------------- river traffic
//
// The Danube through the Bend is a working waterway, and from a train window
// the barge convoys are as much a part of it as the road. Nothing about the
// river is shipped as data, so the fairway is derived at load from the land
// cover raster that is already baked: at every kilometre along the line, cast
// a ray out to each side, measure how far the water class runs, and if the
// span is wide enough to be a river rather than a pond, take its midpoint.
// The result is a real centreline down the middle of the actual water.

export function danubeLane(trackPts, coverAt, demAt) {
  const raw = [];
  const step = 400;
  const m0 = trackPts[0][3], m1 = trackPts[trackPts.length-1][3];
  const at = (m) => {
    const f = (m - m0) / 10;
    const i = Math.max(0, Math.min(trackPts.length - 2, Math.floor(f)));
    const u = f - i, a = trackPts[i], b = trackPts[i+1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1])];
  };
  for (let m = m0 + step; m < m1 - step; m += step) {
    const p = at(m), q = at(m + 20);
    const dx = q[0]-p[0], dy = q[1]-p[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy/L, ny = dx/L;
    let best = null;
    for (const sg of [-1, 1]) {
      // walk out until water starts, then until it ends
      let a = -1, b = -1;
      for (let d = 30; d < 2600; d += 15) {
        const wet = coverAt(p[0] + nx*sg*d, p[1] + ny*sg*d) === 9;
        if (wet && a < 0) a = d;
        else if (!wet && a >= 0) { b = d; break; }
      }
      if (a < 0) continue;
      if (b < 0) b = 2600;
      const span = b - a;
      if (span < 160) continue;                 // a pond, a backwater, a lake
      if (!best || span > best.span) best = { span, mid: (a + b) / 2, sg };
    }
    if (!best) continue;
    raw.push([p[0] + nx*best.sg*best.mid, p[1] + ny*best.sg*best.mid, best.span]);
  }
  if (raw.length < 4) return null;
  // smooth: the raster is 26 m per pixel and the midpoint jitters with it
  const pts = [];
  for (let i = 0; i < raw.length; i++) {
    let sx = 0, sy = 0, sw = 0, n = 0;
    for (let k = Math.max(0, i-2); k <= Math.min(raw.length-1, i+2); k++) {
      sx += raw[k][0]; sy += raw[k][1]; sw += raw[k][2]; n++;
    }
    pts.push([sx/n, sy/n, sw/n]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]));
  return { pts, cum, len: cum[cum.length-1] };
}

const VESSEL = [
  // a pushed convoy: the pusher is short and blunt, the barges are the length
  { kind: "convoy", len: 76, wid: 11.0, v: 4.2, w: 34 },
  { kind: "cruise", len: 110, wid: 11.4, v: 5.4, w: 22 },
  { kind: "cargo",  len: 82, wid: 9.6,  v: 4.6, w: 26 },
  { kind: "launch", len: 14, wid: 3.6,  v: 7.5, w: 18 },
];

export class RiverTraffic {
  constructor(lane) {
    this.lane = lane;
    this.ships = [];
    this.ferries = [];
    if (!lane) return;
    // a working river, not a regatta
    const n = Math.max(4, Math.round(lane.len / 4500));
    for (let i = 0; i < n; i++) {
      let r = Math.random() * VESSEL.reduce((a, v) => a + v.w, 0), type = VESSEL[0];
      for (const v of VESSEL) { r -= v.w; if (r <= 0) { type = v; break; } }
      this.ships.push({
        s: Math.random() * lane.len, dir: Math.random() < 0.5 ? 1 : -1,
        type, v: type.v * (0.85 + Math.random() * 0.3),
        // upstream is slower than down; the Danube runs about 4 km/h here
        seed: (Math.random() * 1e6) | 0,
      });
    }
  }
  /** The Nagymaros–Visegrád ferry, which is a real fixture and runs straight
   *  across the fairway a few hundred metres from the line. Its path is the
   *  river's own width at that point, taken perpendicular to the lane. */
  addFerry(nearX, nearZ, name) {
    const L = this.lane;
    if (!L) return;
    let bi = 1, bd = 1e12;
    for (let i = 1; i < L.pts.length; i++) {
      const d = Math.hypot(L.pts[i][0] - nearX, L.pts[i][1] - nearZ);
      if (d < bd) { bd = d; bi = i; }
    }
    const a = L.pts[bi-1], b = L.pts[bi];
    const dx = b[0]-a[0], dz = b[1]-a[1], n = Math.hypot(dx, dz) || 1;
    const w = b[2] * 0.46;
    // if the fairway does not reach here, there is nothing to cross
    if (!(w > 20)) return;
    this.ferries.push({
      name, x: b[0], z: b[1], nx: -dz/n, nz: dx/n, halfW: Math.max(140, w),
      u: Math.random() * 2 - 1, dir: Math.random() < 0.5 ? 1 : -1,
      wait: Math.random() * 60, v: 0,
    });
  }

  step(dt) {
    if (!this.lane) return;
    for (const f of this.ferries) {
      if (f.wait > 0) { f.wait -= dt; f.v = 0; }
      else {
        // slow away from the ramp, full speed across, slow into the far ramp
        const dEnd = (f.dir > 0 ? (1 - f.u) : (f.u + 1)) * f.halfW;
        const cap = Math.min(4.2, Math.sqrt(Math.max(0, dEnd) * 2 * 0.5) + 0.4);
        f.v = Math.min(cap, f.v + 0.6 * dt);
        f.u += f.dir * (f.v / f.halfW) * dt;
        if (f.u >= 1) { f.u = 1; f.dir = -1; f.wait = 90; f.v = 0; }
        if (f.u <= -1) { f.u = -1; f.dir = 1; f.wait = 90; f.v = 0; }
      }
    }
    for (const sh of this.ships) {
      const drift = sh.dir > 0 ? 1.10 : 0.78;    // with the current, or against
      sh.s += sh.dir * sh.v * drift * dt;
      if (sh.s < 0) { sh.s = 0; sh.dir = 1; }
      if (sh.s > this.lane.len) { sh.s = this.lane.len; sh.dir = -1; }
    }
  }
  place(sh) {
    const L = this.lane;
    let i = 1;
    while (i < L.cum.length - 1 && L.cum[i] < sh.s) i++;
    const s0 = L.cum[i-1], s1 = L.cum[i];
    const u = s1 > s0 ? (sh.s - s0) / (s1 - s0) : 0;
    const a = L.pts[i-1], b = L.pts[i];
    const x = a[0] + (b[0]-a[0])*u, z = a[1] + (b[1]-a[1])*u;
    const dx = b[0]-a[0], dz = b[1]-a[1];
    const n = Math.hypot(dx, dz) || 1;
    // keep to the right of the fairway, as river rules require
    const off = (a[2] + (b[2]-a[2])*u) * 0.16 * sh.dir;
    return { x: x - dz/n * off, z: z + dx/n * off, fx: dx/n * sh.dir, fz: dz/n * sh.dir };
  }
}

export function buildRiverTraffic(rt, camX, camZ, waterY, night) {
  const V = [], C = [];
  if (!rt || !rt.lane) return { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };
  const push = (p, col) => { V.push(p[0], p[1], -p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => {
    push(a, col); push(b, col); push(c, col);
    push(a, col); push(c, col); push(d, col);
  };
  const HULL = [0.20, 0.20, 0.22], DECK = [0.34, 0.31, 0.27];
  const WHITE = [0.84, 0.86, 0.88], WIN = night > 0.4 ? [1.5, 1.32, 0.86] : [0.10, 0.12, 0.15];
  const RUST = [0.32, 0.24, 0.19];
  const NAVG = [0.2, 1.7, 0.35], NAVR = [1.7, 0.15, 0.12];

  for (const sh of rt.ships) {
    const q = rt.place(sh);
    if (Math.hypot(q.x - camX, q.z - camZ) > 6000) continue;
    const t = sh.type, hl = t.len * 0.5, hw = t.wid * 0.5;
    const fx = q.fx, fz = q.fz, rx = -fz, rz = fx;
    const P = (along, across, up) => [
      q.x + fx*along + rx*across, waterY + up, q.z + fz*along + rz*across];
    // hull: a shallow box with a raked bow, sitting low in the water
    const draft = -0.7, free = t.kind === "launch" ? 0.9 : 1.9;
    const bow = hl - t.len * 0.10;
    for (const sgn of [-1, 1]) {
      quad(P(-hl, sgn*hw, draft), P(bow, sgn*hw, draft),
           P(bow, sgn*hw, free), P(-hl, sgn*hw, free), t.kind === "cruise" ? WHITE : HULL);
      quad(P(bow, sgn*hw, draft), P(hl, sgn*hw*0.25, draft),
           P(hl, sgn*hw*0.25, free), P(bow, sgn*hw, free), t.kind === "cruise" ? WHITE : HULL);
    }
    quad(P(-hl, -hw, draft), P(bow, -hw, draft), P(bow, hw, draft), P(-hl, hw, draft), HULL);
    quad(P(-hl, -hw, free), P(bow, -hw, free), P(bow, hw, free), P(-hl, hw, free), DECK);
    quad(P(bow, -hw, free), P(hl, -hw*0.25, free), P(hl, hw*0.25, free), P(bow, hw, free), DECK);
    quad(P(-hl, -hw, draft), P(-hl, hw, draft), P(-hl, hw, free), P(-hl, -hw, free), HULL);

    if (t.kind === "cruise") {
      // three decks of cabins, a long window band on each
      for (let d = 0; d < 3; d++) {
        const y0 = free + d * 2.5, y1 = y0 + 2.5;
        for (const sgn of [-1, 1]) {
          quad(P(-hl*0.94, sgn*hw*0.96, y0), P(hl*0.86, sgn*hw*0.96, y0),
               P(hl*0.86, sgn*hw*0.96, y0 + 0.7), P(-hl*0.94, sgn*hw*0.96, y0 + 0.7), WHITE);
          quad(P(-hl*0.94, sgn*hw*0.96, y0 + 0.7), P(hl*0.86, sgn*hw*0.96, y0 + 0.7),
               P(hl*0.86, sgn*hw*0.96, y0 + 1.9), P(-hl*0.94, sgn*hw*0.96, y0 + 1.9), WIN);
          quad(P(-hl*0.94, sgn*hw*0.96, y0 + 1.9), P(hl*0.86, sgn*hw*0.96, y0 + 1.9),
               P(hl*0.86, sgn*hw*0.96, y1), P(-hl*0.94, sgn*hw*0.96, y1), WHITE);
        }
        for (const ee of [-hl*0.94, hl*0.86])
          quad(P(ee, -hw*0.96, y0), P(ee, hw*0.96, y0),
               P(ee, hw*0.96, y1), P(ee, -hw*0.96, y1), WHITE);
        quad(P(-hl*0.94, -hw*0.96, y1), P(hl*0.86, -hw*0.96, y1),
             P(hl*0.86, hw*0.96, y1), P(-hl*0.94, hw*0.96, y1), WHITE);
      }
    } else if (t.kind === "convoy" || t.kind === "cargo") {
      // open holds with coamings, and the wheelhouse right aft
      const hold = free + 1.5;
      for (const sgn of [-1, 1])
        quad(P(-hl*0.72, sgn*hw*0.92, free), P(hl*0.80, sgn*hw*0.92, free),
             P(hl*0.80, sgn*hw*0.92, hold), P(-hl*0.72, sgn*hw*0.92, hold), RUST);
      for (const ee of [-hl*0.72, hl*0.80])
        quad(P(ee, -hw*0.92, free), P(ee, hw*0.92, free),
             P(ee, hw*0.92, hold), P(ee, -hw*0.92, hold), RUST);
      const laden = (sh.seed % 3) !== 0;
      quad(P(-hl*0.70, -hw*0.88, laden ? hold - 0.25 : free + 0.2),
           P(hl*0.78, -hw*0.88, laden ? hold - 0.25 : free + 0.2),
           P(hl*0.78, hw*0.88, laden ? hold - 0.25 : free + 0.2),
           P(-hl*0.70, hw*0.88, laden ? hold - 0.25 : free + 0.2),
           laden ? [0.28,0.24,0.18] : [0.14,0.13,0.12]);
      // wheelhouse
      const wx0 = -hl*0.96, wx1 = -hl*0.76;
      for (const sgn of [-1, 1]) {
        quad(P(wx0, sgn*2.4, free), P(wx1, sgn*2.4, free),
             P(wx1, sgn*2.4, free + 1.2), P(wx0, sgn*2.4, free + 1.2), WHITE);
        quad(P(wx0, sgn*2.4, free + 1.2), P(wx1, sgn*2.4, free + 1.2),
             P(wx1, sgn*2.4, free + 3.0), P(wx0, sgn*2.4, free + 3.0), WIN);
      }
      for (const ee of [wx0, wx1])
        quad(P(ee, -2.4, free), P(ee, 2.4, free), P(ee, 2.4, free + 3.0), P(ee, -2.4, free + 3.0), WHITE);
      quad(P(wx0, -2.4, free + 3.0), P(wx1, -2.4, free + 3.0),
           P(wx1, 2.4, free + 3.0), P(wx0, 2.4, free + 3.0), WHITE);
    } else {
      // a launch: a cabin and not much else
      for (const sgn of [-1, 1])
        quad(P(-2.2, sgn*hw*0.8, free), P(2.2, sgn*hw*0.8, free),
             P(2.2, sgn*hw*0.8, free + 1.5), P(-2.2, sgn*hw*0.8, free + 1.5), WIN);
      quad(P(-2.2, -hw*0.8, free + 1.5), P(2.2, -hw*0.8, free + 1.5),
           P(2.2, hw*0.8, free + 1.5), P(-2.2, hw*0.8, free + 1.5), WHITE);
    }
    // navigation lights: green to starboard, red to port, as they must be
    const lz = free + (t.kind === "cruise" ? 7.6 : 3.2);
    quad(P(bow*0.9, hw*0.9, lz), P(bow*0.9 + 0.5, hw*0.9, lz),
         P(bow*0.9 + 0.5, hw*0.9, lz + 0.5), P(bow*0.9, hw*0.9, lz + 0.5),
         [NAVG[0]*(0.3+night), NAVG[1]*(0.3+night), NAVG[2]*(0.3+night)]);
    quad(P(bow*0.9, -hw*0.9, lz), P(bow*0.9 + 0.5, -hw*0.9, lz),
         P(bow*0.9 + 0.5, -hw*0.9, lz + 0.5), P(bow*0.9, -hw*0.9, lz + 0.5),
         [NAVR[0]*(0.3+night), NAVR[1]*(0.3+night), NAVR[2]*(0.3+night)]);
    // wake: a pale wedge trailing astern, on the water surface
    if (sh.v > 0.5) {
      const wake = [0.72, 0.78, 0.80];
      quad(P(-hl, -hw*0.5, 0.06), P(-hl - t.len*0.9, -hw*2.4, 0.05),
           P(-hl - t.len*0.9, hw*2.4, 0.05), P(-hl, hw*0.5, 0.06), wake);
    }
  }

  // the ferry: a blunt open deck with a wheelhouse to one side and, more
  // often than not, a couple of cars sitting on it
  for (const f of (rt.ferries || [])) {
    if (Math.hypot(f.x - camX, f.z - camZ) > 6000) continue;
    const cx = f.x + f.nx * f.halfW * f.u, cz = f.z + f.nz * f.halfW * f.u;
    const fx = f.nx * f.dir, fz = f.nz * f.dir, rx = -fz, rz = fx;
    const P = (a2, b2, u2) => [cx + fx*a2 + rx*b2, waterY + u2, cz + fz*a2 + rz*b2];
    const hl = 17, hw = 5.4, free = 1.3;
    for (const sgn of [-1, 1]) {
      quad(P(-hl, sgn*hw, -0.5), P(hl, sgn*hw, -0.5),
           P(hl, sgn*hw, free), P(-hl, sgn*hw, free), [0.22,0.26,0.30]);
    }
    for (const ee of [-hl, hl])
      quad(P(ee, -hw, -0.5), P(ee, hw, -0.5), P(ee, hw, free), P(ee, -hw, free),
           [0.20,0.23,0.27]);
    quad(P(-hl, -hw, free), P(hl, -hw, free), P(hl, hw, free), P(-hl, hw, free),
         [0.30,0.29,0.28]);
    quad(P(-hl, -hw, -0.5), P(hl, -hw, -0.5), P(hl, hw, -0.5), P(-hl, hw, -0.5),
         [0.16,0.16,0.18]);
    // wheelhouse on the starboard side
    for (const sgn of [-1, 1])
      quad(P(-2.0, hw*0.55 + sgn*0.9, free), P(2.0, hw*0.55 + sgn*0.9, free),
           P(2.0, hw*0.55 + sgn*0.9, free + 2.4), P(-2.0, hw*0.55 + sgn*0.9, free + 2.4),
           WIN);
    quad(P(-2.0, hw*0.55 - 0.9, free + 2.4), P(2.0, hw*0.55 - 0.9, free + 2.4),
         P(2.0, hw*0.55 + 0.9, free + 2.4), P(-2.0, hw*0.55 + 0.9, free + 2.4), WHITE);
    // a car or two on the deck
    for (let i = 0; i < 2; i++) {
      const cxo = -8 + i * 8;
      const col = i ? [0.55,0.15,0.13] : [0.72,0.73,0.75];
      for (const sgn of [-1, 1])
        quad(P(cxo - 2.1, sgn*0.9 - 1.6, free + 0.3), P(cxo + 2.1, sgn*0.9 - 1.6, free + 0.3),
             P(cxo + 2.1, sgn*0.9 - 1.6, free + 1.6), P(cxo - 2.1, sgn*0.9 - 1.6, free + 1.6), col);
      quad(P(cxo - 2.1, -0.7 - 1.6, free + 1.6), P(cxo + 2.1, -0.7 - 1.6, free + 1.6),
           P(cxo + 2.1, 0.7 - 1.6, free + 1.6), P(cxo - 2.1, 0.7 - 1.6, free + 1.6), col);
    }
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
}
