#!/usr/bin/env node
// Headless checks of the simulation: no browser, no WebGL. The modules in
// web/src are plain ES modules; the ones tested here (route, traffic, score,
// missions, collide) need nothing from the page.
//
//     node tools/test_sim.mjs            # from szob-fele/, exits 1 on a failure
//
// What it checks, and why each one matters:
//   1. braking distances of the stocks are in the range measured on 22 Sep
//      (a physics change that breaks them breaks every stop);
//   2. driving by hand, a stop is recorded where the train stood, and one
//      overrun by more than 30 m is a missed stop (it used to be snapped);
//   3. a clean run scores three stars, a signal passed at danger does not;
//   4. six hours of timetabled traffic on each line: no two trains ever in
//      the same place on the same track;
//   5. the collision world pushes a disc out of a building and finds roofs;
//   6. the daily challenge is the same all day and different the next.
import { readFileSync } from "node:fs";
import { Route, Driver, STOCKS } from "../web/src/route.js";
import { Traffic } from "../web/src/traffic.js";
import { RunScore } from "../web/src/score.js";
import { dailyMission, MISSIONS } from "../web/src/missions.js";
import { Solids } from "../web/src/collide.js";

let failed = 0;
const ok = (cond, what, detail = "") => {
  console.log(`${cond ? "  ok " : "FAIL "} ${what}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
};
const load = f => JSON.parse(readFileSync(new URL(`../web/data/${f}`, import.meta.url)));

// ---------------------------------------------------------------- 1. brakes
{
  const route = new Route(load("route.json"));
  for (const [name, lo, hi] of [["KISS", 220, 340], ["FREIGHT", 520, 780]]) {
    const d = new Driver(route, STOCKS[name]);
    d.auto = false; d.m = route.startM + 3000; d.v = 80 / 3.6; d.callsAt = new Set();
    d.setLever(-8); const m0 = d.m;
    for (let i = 0; i < 20000 && d.v > 0; i++) d.step(0.05);
    const dist = (d.m - m0) * route.dir;
    ok(dist > lo && dist < hi, `${name} service brake from 80 km/h`, `${dist.toFixed(0)} m`);
  }
}

// ------------------------------------------------------ 2. stopping by hand
{
  const route = new Route(load("route.json"));
  const st = route.stops[3];
  const drive = (stopShort) => {
    const d = new Driver(route, STOCKS.FLIRT);
    d.auto = false; d.m = st.km * 1000 - 600 * route.dir; d.v = 15;
    d.stopIdx = route.stops.indexOf(st);
    for (let i = 0; i < 4000 && !d.events.length; i++) {
      const togo = (st.km * 1000 - d.m) * route.dir - stopShort;
      // brake to stand `stopShort` metres before the mark
      d.setLever(d.v * d.v / (2 * Math.max(0.5, togo)) > 0.55 ? -6 : 0);
      if (togo < 0.5 && d.v > 0) d.setLever(-8);
      d.step(0.05);
    }
    return [d.events[0], (st.km * 1000 - d.m) * route.dir];
  };
  const [e1, stood] = drive(3);
  ok(e1 && e1.type === "stop" && Math.abs(e1.err - stood) < 0.01 && Math.abs(stood) < 30,
     "a hand-driven stop is recorded where the train stood",
     e1 ? `${e1.type} ${e1.err != null ? e1.err.toFixed(1) + " m, stood " + stood.toFixed(1) + " m short" : ""}` : "no event");
  const [e2] = drive(-60);
  ok(e2 && e2.type === "miss", "running 60 m past the mark is a missed stop", e2 ? e2.type : "no event");
}

// ------------------------------------------------------------- 3. scoring
{
  const route = new Route(load("route.json"));
  const d = new Driver(route, STOCKS.FLIRT); d.auto = false;
  const run = new RunScore(d);
  for (let i = 0; i < 1600; i++) { d.v = 15; d.m += 0.75; d.eTr += 2e5; run.step(0.05, 80); }
  d.events.push({ type: "stop", name: "A", err: 0.8 });
  run.step(0.05, 80);
  run.onCall("A", 20);
  const good = run.result();
  ok(good.stars === 3, "a clean run is three stars", `${good.total}%`);
  run.spad(); run.spad();
  const bad = run.result();
  ok(bad.stars < 3 && bad.cats.safety < 50, "two signals passed at danger cost the stars", `${bad.total}%, safety ${bad.cats.safety}`);
}

// ------------------------------------------- 4. traffic never overlaps itself
for (const [line, suffix] of [["line 70", ""], ["line 2", "_line2"], ["S21", "_s21"]]) {
  const rd = load(`route${suffix}.json`);
  const route = new Route(rd);
  const traffic = new Traffic(route, rd.signals, load(`timetable${suffix}.json`));
  const player = { dir: 1, m: route.m0 - 5000, v: 0, length: 150, cars: 6, svc: { id: "player", pattern: "all" }, aspect: 3 };
  traffic.trains.push(player);
  const t0 = 6 * 3600; traffic.seekTo(t0);
  let worst = Infinity, pair = "", maxN = 0;
  for (let s = 0; s < 6 * 3600; s += 0.5) {
    traffic.step(0.5, t0 + s, player);
    const T = traffic.trains.filter(t => t !== player);
    maxN = Math.max(maxN, T.length);
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j];
      if (a.dir !== b.dir) continue;                    // (the two directions run on two tracks here)
      const gap = Math.abs(a.m - b.m) - ((a.dir > 0 ? (a.m > b.m ? a : b) : (a.m < b.m ? a : b)).length || 120);
      if (gap < worst) { worst = gap; pair = `${a.name} / ${b.name} at km ${(a.m / 1000).toFixed(1)}`; }
    }
  }
  ok(worst > -1, `${line}: 6 h of traffic, no train runs into another`, `closest ${worst.toFixed(0)} m (${pair}), up to ${maxN} trains`);
}

// ------------------------------------------------------- 5. collision world
{
  const S = new Solids();
  S.addBox(100, 100, 10, 5, 0, 0, 20);                 // 20 × 10 m, 20 m tall
  const r = S.push(100, 104, 1, 1);                     // a disc 1 m inside the north wall
  ok(r.hit && Math.abs(r.n - 106) < 0.1, "a disc inside a wall is pushed out through the nearest side", `n = ${r.n.toFixed(2)}`);
  ok(!S.push(100, 120, 1, 1).hit, "a disc clear of the building is left alone");
  ok(!S.push(100, 104, 25, 1).hit, "a disc above the roof is not stopped by the walls");
  ok(S.topAt(95, 98) === 20 && S.topAt(130, 98) === -Infinity, "roof height under a point");
  S.addPoly([[200, 0], [210, 0], [210, 10], [200, 10]], 0, 5, "tile");
  S.removeOwner("tile");
  ok(!S.at(205, 1, 5), "a tile's solids go with the tile");
}

// ----------------------------------------------------------- 6. daily challenge
{
  const a = dailyMission(new Date(2026, 8, 25, 8)), b = dailyMission(new Date(2026, 8, 25, 22));
  const days = new Set();
  for (let i = 0; i < 14; i++) { const m = dailyMission(new Date(2026, 8, 1 + i)); days.add(m.title + m.wx + m.hour); }
  ok(a.id === b.id && a.wx === b.wx && a.hour === b.hour, "the daily challenge is the same all day", `${a.title}, ${a.wx}, ${a.hour}`);
  ok(days.size >= 10, "and varies from day to day", `${days.size} different in 14 days`);
  const lines = new Set(MISSIONS.map(m => m.line));
  for (const m of MISSIONS) {
    const rd = load(m.line === "line70" ? "route.json" : `route_${m.line}.json`);
    const names = new Set(rd.stops.map(s => s.name));
    ok(names.has(m.from) && names.has(m.to), `mission "${m.title}": its stops are on ${m.line}`);
  }
  void lines;
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
