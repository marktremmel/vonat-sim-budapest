import { tt } from "./i18n.js";
// The scorecard of a run. Five things a driver is judged on, each 0..100:
//
//   pontosság   punctuality: lateness at each call against the booked path
//   megállás    stop accuracy: metres from the stop mark; a missed stop is 0
//   biztonság   safety: signals passed at danger, overspeed, vigilance brakes
//   kényelem    comfort: hard acceleration and braking, the emergency brake
//   energia     energy: net traction energy per tonne-km (the ED brake's
//               feedback counts back)
//
// Only what you drive yourself is scored. Distance run on the automatic
// driver is counted, and a run with more than a tenth of it on automatic is
// "assisted": it gets its card but no stars and no personal best.

const W = { punct: 0.30, stop: 0.25, safety: 0.25, comfort: 0.10, energy: 0.10 };
export const CATS = [
  ["punct", tt("Pontosság", "Punctuality")], ["stop", tt("Megállás", "Stopping")], ["safety", tt("Biztonság", "Safety")],
  ["comfort", tt("Kényelem", "Comfort")], ["energy", tt("Energia", "Energy")],
];
export const starsFor = total => total >= 88 ? 3 : total >= 72 ? 2 : total >= 55 ? 1 : 0;
const clamp100 = x => Math.max(0, Math.min(100, x));

export class RunScore {
  constructor(driver) {
    this.driver = driver;
    this.ev = driver.events.length;         // events before this run are not ours
    this.e0 = driver.eTr; this.r0 = driver.eRegen;
    this.calls = [];                        // {name, late}
    this.stops = [];                        // {name, err} or {name, miss: true}
    this.spads = 0; this.evm = 0; this.emerg = 0;
    this.overPts = 0; this.overT = 0;       // overspeed: penalty points, and the current stretch
    this.harsh = 0; this.jerks = 0;
    this.manualM = 0; this.autoM = 0;
    this.aLast = 0; this.jerkCool = 0;
    this.wasEmerg = false; this.wasVig = false;
    this.messages = [];                     // {text, t}
  }
  say(text, t = 4, tone = "") { this.messages.push({ text, t, tone }); }

  /** Every running frame. limit in km/h. */
  step(dt, limit) {
    const d = this.driver;
    if (dt <= 0) return;
    const dm = d.v * dt;
    if (d.auto) { this.autoM += dm; this.aLast = d.aEff; this.pullEvents(true); return; }
    this.manualM += dm;
    // overspeed: a grace of 3 km/h, then points by the second and by how far over
    const over = d.v * 3.6 - limit;
    if (over > 3) {
      this.overPts += dt * (1 + over / 5);
      if (this.overT === 0) this.say(tt(`Sebességtúllépés: ${Math.round(d.v * 3.6)} km/h, szabad ${Math.round(limit)}`, `Overspeed: ${Math.round(d.v * 3.6)} km/h, limit ${Math.round(limit)}`), 3, "bad");
      this.overT += dt;
    } else this.overT = 0;
    // comfort: more than 1.2 m/s² either way is felt in the aisle; a sudden
    // change of acceleration (jerk) spills the coffee
    if (Math.abs(d.aEff) > 1.2 && d.v > 0.5) this.harsh += dt;
    const jerk = (d.aEff - this.aLast) / dt;
    this.aLast = d.aEff;
    this.jerkCool -= dt;
    if (Math.abs(jerk) > 3.0 && d.v > 1 && this.jerkCool <= 0) { this.jerks++; this.jerkCool = 1.5; }
    if (d.emergency && !this.wasEmerg && d.v > 1) { this.emerg++; this.say(tt("Vészfékezés", "Emergency brake"), 3, "bad"); }
    this.wasEmerg = d.emergency;
    if (d.vigPenalty > 0 && !this.wasVig) { this.evm++; this.say(tt("Éberségi kényszerfékezés (EVM)", "Vigilance penalty brake (EVM)"), 5, "bad"); }
    this.wasVig = d.vigPenalty > 0;
    this.pullEvents(false);
  }
  pullEvents(auto) {
    const E = this.driver.events;
    for (; this.ev < E.length; this.ev++) {
      const e = E[this.ev];
      if (e.auto || auto) continue;
      if (e.type === "stop") {
        this.stops.push({ name: e.name, err: e.err });
        const a = Math.abs(e.err);
        this.say(a < 2 ? `${e.name}: ${tt("pontosan a jelnél", "right on the mark")}` : `${e.name}: ${a.toFixed(0)} m ${e.err > 0 ? tt("rövid", "short") : tt("túlfutás", "overrun")}`, 4,
                 a < 5 ? "good" : a > 15 ? "bad" : "");
      } else if (e.type === "miss") {
        this.stops.push({ name: e.name, miss: true });
        this.say(`${e.name}: ${tt("kihagytad a megállót!", "you missed the stop!")}`, 6, "bad");
      }
    }
  }
  spad() { if (!this.driver.auto) { this.spads++; this.say(tt("Megállj-t mutató jelző meghaladása!", "Signal passed at danger!"), 8, "bad"); } }
  onCall(name, late) {
    if (this.driver.auto) return;
    this.calls.push({ name, late });
    const m = Math.round(late / 60);
    this.say(Math.abs(late) < 60 ? `${name}: ${tt("menetrend szerint", "on time")}` : `${name}: ${m > 0 ? "+" : ""}${m} min`, 3.5,
             Math.abs(late) < 60 ? "good" : late > 180 ? "bad" : "");
  }

  categories() {
    const d = this.driver;
    const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    // punctuality: a minute either way is on time; five minutes late is 0;
    // early is only half as bad (you wait, but you should not have run early)
    const punct = avg(this.calls.map(c => {
      const l = c.late > 0 ? c.late : -c.late * 0.5;
      return clamp100(100 - Math.max(0, l - 60) / 240 * 100);
    }));
    // stops: within 2 m is perfect, 30 m is nothing
    const stop = avg(this.stops.map(s => s.miss ? 0 : clamp100(100 - Math.max(0, Math.abs(s.err) - 2) / 28 * 100)));
    const safety = this.derailed ? 0 : clamp100(100 - 60 * this.spads - 25 * this.evm - 1.5 * this.overPts);
    const comfort = clamp100(100 - 4 * this.harsh - 3 * this.jerks - 20 * this.emerg);
    // energy per tonne-km, Wh; a gentle EMU run is ~15, a thrashed one 40+
    const km = this.manualM / 1000;
    let energy = null;
    if (km > 0.5) {
      const wh = Math.max(0, (d.eTr - this.e0) - (d.eRegen - this.r0)) / 3600 / (d.s.massT * km);
      this.whtkm = wh;
      energy = clamp100(100 - Math.max(0, wh - 15) / 30 * 100);
    }
    return { punct, stop, safety, comfort, energy };
  }
  result() {
    const c = this.categories();
    let tot = 0, w = 0;
    for (const [k] of CATS) if (c[k] != null) { tot += c[k] * W[k]; w += W[k]; }
    const total = w ? Math.round(tot / w) : 0;
    const auto = this.autoM > 0.1 * (this.autoM + this.manualM), short = this.manualM < 500;
    const assisted = auto || short;
    const why = this.derailed ? tt("A kisiklás nem kap csillagot.", "No stars for a derailment.")
              : auto ? tt("Az automata vezetett — ez a menet nem kap csillagot.", "The automatic driver drove — no stars for this run.")
              : short ? tt("Fél kilométernél rövidebb menet nem kap csillagot.", "No stars for a run under half a kilometre.") : "";
    return { cats: c, total, assisted, why, stars: assisted || this.derailed ? 0 : starsFor(total),
             km: this.manualM / 1000, whtkm: this.whtkm };
  }
}
