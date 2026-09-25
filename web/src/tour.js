// Kilátás: the line as something to look at, not only to drive.
//
// Two things. The places: every notable thing the baked data knows about —
// the landmarks, castles and ruins, the named summits, towns, stations — with
// a weight for how much it matters, so that as the train goes by the most
// notable one in view gets a caption: what it is, how far, which side. And
// the director: an automatic camera that cuts between shots of the train
// every twenty seconds or so, for watching the Bend and the Pilis go by.

const LANDMARK_NAME = {
  fellegvar: "Visegrádi Fellegvár", salamon: "Salamon-torony", esztergom: "Esztergomi Bazilika",
  parlament: "Országház", bazilika: "Szent István-bazilika", lanchid: "Széchenyi lánchíd",
  margithid: "Margit híd", arpadhid: "Árpád híd", megyeri: "Megyeri híd",
  eszakivasut: "Északi összekötő vasúti híd", maria_valeria: "Mária Valéria híd",
  hosok: "Hősök tere", gellert: "Gellért-hegy", diadaliv: "Váci Diadalív",
  cementworks: "Váci cementgyár", hulladek: "Hulladékhasznosító Mű",
  bigwheel: "Budapest Eye óriáskerék", budavar: "Budavári Palota",
};

/** [{name, x, y, w}] in the route's (east, north) frame; w is importance. */
export function buildPOIs(routeData, landmarks) {
  const out = [];
  for (const a of landmarks || []) {
    const nm = LANDMARK_NAME[a.key] || (a.key === "viztorony" ? a.name : null);
    if (nm) out.push({ name: nm, x: a.x, y: a.y, w: a.key === "viztorony" ? 1.2 : 3.0, lm: true });
  }
  for (const p of routeData.peaks || []) {
    if (p.ele >= 330) out.push({ name: `${p.name} (${Math.round(p.ele)} m)`, x: p.xy[0], y: p.xy[1],
                                 w: 1.0 + (p.ele - 330) / 250, far: true });
  }
  for (const p of routeData.places || []) {
    if (p.rank > 2) continue;
    out.push({ name: p.name, x: p.xy[0], y: p.xy[1],
               w: p.kind === "place" ? (p.rank === 0 ? 2.2 : p.rank === 1 ? 1.7 : 1.0)
                  : p.kind === "landmark" ? 1.6 : 0.7 });           // parks, works, schools
  }
  // de-duplicate by name, keeping the heaviest
  const best = new Map();
  for (const p of out) if (!best.has(p.name) || best.get(p.name).w < p.w) best.set(p.name, p);
  return [...best.values()];
}

/** The most notable place near the train that has not been shown lately. */
export function pickPOI(pois, x, y, fx, fy, now, shown) {
  let best = null, bs = 0;
  for (const p of pois) {
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    const reach = p.far ? 9000 : 3500;
    if (d > reach || d < 60) continue;
    if (shown.has(p.name) && now - shown.get(p.name) < 180) continue;
    // ahead and beside counts for more than behind: you are about to see it
    const ahead = (dx * fx + dy * fy) / d;
    const s = p.w / (1 + d / (p.far ? 3000 : 1200)) * (0.6 + 0.4 * Math.max(0, ahead));
    if (s > bs) { bs = s; best = { p, d, side: (fx * dy - fy * dx) > 0 ? "balra" : "jobbra" }; }
  }
  return bs > 0.35 ? best : null;
}

// ---------------------------------------------------------------- director
const SHOTS = ["chase", "window", "trackside", "drone", "chase_low", "window"];

export function stepDirector(dir, dt, st) {
  const { state, route, driver, demAt } = st;
  dir.t -= dt;
  const m = driver.m, sd = route.dir;
  const p = route.at(m), tg = route.tangent(m);
  const fx = tg[0] * sd, fy = tg[1] * sd;
  if (dir.t <= 0) {
    dir.i = (dir.i + 1) % SHOTS.length;
    dir.shot = SHOTS[dir.i];
    dir.t = 16 + Math.random() * 8;
    dir.side = Math.random() < 0.5 ? 1 : -1;
    // reset whatever the last shot set
    state.follow = false; state.fly = null; state.passenger = null; state.zoom = 1;
    if (dir.shot === "chase") { state.follow = true; state.yaw = dir.side * (0.35 + Math.random() * 0.5); state.pitch = -0.14; state.zoom = 0.9; }
    if (dir.shot === "chase_low") { state.follow = true; state.yaw = dir.side * 2.5; state.pitch = -0.05; state.zoom = 1.3; }
    if (dir.shot === "window") { state.passenger = { car: 2, side: dir.side }; state.yaw = dir.side * Math.PI / 2; state.pitch = -0.04; }
    if (dir.shot === "trackside") {
      // stand beside the line a few hundred metres ahead and watch it come
      const q = route.at(m + sd * (180 + driver.v * 12));
      const g = demAt(q[0] + fy * dir.side * 16, q[1] - fx * dir.side * 16);
      dir.fix = [q[0] + fy * dir.side * 16, (isFinite(g) ? g : q[2]) + 2.2, q[1] - fx * dir.side * 16];
    }
    if (dir.shot === "drone") dir.ang = Math.atan2(fy, fx) + dir.side * 1.2;
  }
  const look = (E, T) => {
    state.fly = { p: [E[0], E[1], -E[2]], speed: 0 };
    const dx = T[0] - E[0], dz = -(T[2] - E[2]);
    state.yaw = Math.atan2(dx, -dz);
    state.pitch = (T[1] - E[1]) / Math.max(1, Math.hypot(dx, dz));
  };
  const target = [p[0] - fx * 40, p[2] + 3, p[1] - fy * 40];      // mid-train
  if (dir.shot === "trackside" && dir.fix) {
    // once the train has gone well past, it is time for the next shot
    const back = ((dir.fix[0] - p[0]) * fx + (dir.fix[2] - p[1]) * fy);
    if (back < -260) dir.t = 0;
    look(dir.fix, target);
  } else if (dir.shot === "drone") {
    dir.ang += dt * 0.05 * dir.side;
    const R = 170;
    look([p[0] + Math.cos(dir.ang) * R, p[2] + 75, p[1] + Math.sin(dir.ang) * R], target);
  } else if (dir.shot === "window") {
    state.yaw = dir.side * Math.PI / 2 + Math.sin(performance.now() * 0.00015) * 0.35;
  }
}
