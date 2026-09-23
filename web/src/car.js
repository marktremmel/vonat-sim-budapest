// A car you drive yourself (shift+A, or "Autó" on the mode bar): anywhere,
// on the roads of the line and of the city tiles. It rides the same road
// surfaces the traffic does — the terrain-graded road, a bridge deck where it
// is on a bridge (way.deckAt), an underpass floor where it is in one
// (way.floorAt) — and stops at the river's edge rather than driving in.
//
// Arcade physics: a bicycle model (the front wheels steer, the car turns
// about the rear axle), engine force falling off with speed, drag, brakes,
// reverse, a handbrake. World frame as everywhere: x east, y up, z SOUTH;
// yaw 0 faces north, forward is [sin yaw, 0, −cos yaw].

export function makeCar(x, north, yaw) {
  return { x, n: north, y: 0, yaw, v: 0, steer: 0, active: true, cockpit: false,
           pitch: 0, roll: 0, wheel: 0, onBridge: false, bump: 0 };
}

const WHEELBASE = 2.65, VMAX = 50, VREV = 9;

/**
 * @param surf (x, north) => {y, water} — the drivable surface at a point and
 *             whether it is river
 */
export function stepCar(car, keys, dt, surf) {
  const k = c => keys.has(c);
  const up = k("KeyW") || k("ArrowUp"), down = k("KeyS") || k("ArrowDown");
  const left = k("KeyA") || k("ArrowLeft"), right = k("KeyD") || k("ArrowRight");
  const hand = k("Space");
  let acc = 0;
  if (up) acc = car.v < -0.3 ? 9 : 3.6 * (1 - Math.max(0, car.v) / VMAX);
  if (down) acc = car.v > 0.3 ? -9 : -2.2 * (1 + car.v / VREV);
  acc -= Math.sign(car.v) * (0.25 + 0.0009 * car.v * car.v);
  if (hand) acc -= Math.sign(car.v) * 11;
  const v0 = car.v;
  car.v += acc * dt;
  if (!up && !down && Math.sign(car.v) !== Math.sign(v0)) car.v = 0;   // coast to a stop, not backwards
  car.v = Math.max(-VREV, Math.min(VMAX, car.v));
  // steering: less lock at speed, returns to centre when let go
  const lock = 0.60 / (1 + Math.abs(car.v) / 14);
  const want = (right ? 1 : 0) - (left ? 1 : 0);
  car.steer += (want * lock - car.steer) * Math.min(1, dt * (want ? 3.5 : 5));
  const yawRate = car.v / WHEELBASE * Math.tan(car.steer) * (hand ? 1.6 : 1);
  car.yaw += yawRate * dt;
  const fx = Math.sin(car.yaw), fy = Math.cos(car.yaw);        // east, north
  const nx = car.x + fx * car.v * dt, nn = car.n + fy * car.v * dt;
  const s1 = surf(nx, nn);
  if (!isFinite(s1.y)) { car.v = 0; return; }
  // a wall of ground more than a kerb high, or the river: stop dead
  const step = s1.y - car.y;
  if (car.y && (s1.water || step > 2.6 && Math.abs(car.v) > 0.2)) {
    car.v *= -0.15; return;
  }
  car.x = nx; car.n = nn;
  car.y = car.y ? car.y + (s1.y - car.y) * Math.min(1, dt * 14) : s1.y;
  car.onBridge = !!s1.bridge;
  // pitch and roll from the ground under the wheels, for the look of it
  const sf = surf(car.x + fx * 1.4, car.n + fy * 1.4).y, sb = surf(car.x - fx * 1.4, car.n - fy * 1.4).y;
  const sr = surf(car.x + fy * 0.8, car.n - fx * 0.8).y, sl = surf(car.x - fy * 0.8, car.n + fx * 0.8).y;
  if (isFinite(sf) && isFinite(sb)) car.pitch += (Math.atan2(sf - sb, 2.8) - car.pitch) * Math.min(1, dt * 8);
  if (isFinite(sr) && isFinite(sl)) car.roll += (Math.atan2(sl - sr, 1.6) - car.roll) * Math.min(1, dt * 8);
  car.wheel += car.v * dt / 0.32;
}

/** The car's geometry, pushed through quad(a, b, c, d, colour) in world
 *  coordinates (x east, y up, z south). */
export function carGeometry(car, quad) {
  const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
  const cp = Math.cos(car.pitch), sp = Math.sin(car.pitch);
  const f = [sy * cp, sp, -cy * cp];                  // forward
  const r = [cy, 0, sy];                              // right
  const u = [-sy * sp, cp, cy * sp];                  // up
  const P = (x, yy, z) => [car.x + r[0] * x + u[0] * yy + f[0] * z,
                           car.y + 0.05 + r[1] * x + u[1] * yy + f[1] * z,
                           -car.n + r[2] * x + u[2] * yy + f[2] * z];
  const box = (x0, x1, y0, y1, z0, z1, col, top) => {
    quad(P(x0,y0,z0), P(x1,y0,z0), P(x1,y1,z0), P(x0,y1,z0), col);
    quad(P(x1,y0,z1), P(x0,y0,z1), P(x0,y1,z1), P(x1,y1,z1), col);
    quad(P(x0,y0,z1), P(x0,y0,z0), P(x0,y1,z0), P(x0,y1,z1), col);
    quad(P(x1,y0,z0), P(x1,y0,z1), P(x1,y1,z1), P(x1,y1,z0), col);
    quad(P(x0,y1,z0), P(x1,y1,z0), P(x1,y1,z1), P(x0,y1,z1), top || col);
  };
  const BODY = [0.62, 0.10, 0.09], GLASS = [0.10, 0.13, 0.17], TYRE = [0.07, 0.07, 0.08],
        LAMP = [1.6, 1.5, 1.2], TAIL = [1.3, 0.1, 0.08], TRIM = [0.18, 0.18, 0.19];
  box(-0.88, 0.88, 0.32, 0.95, -2.1, 2.1, BODY);                // lower body
  box(-0.80, 0.80, 0.95, 1.45, -1.3, 0.75, GLASS, BODY);        // cabin
  box(-0.82, 0.82, 1.45, 1.50, -1.2, 0.65, BODY);               // roof skin
  box(-0.89, 0.89, 0.30, 0.42, -2.12, 2.12, TRIM);              // bumpers line
  for (const x of [-0.62, 0.62]) {
    box(x - 0.18, x + 0.18, 0.62, 0.78, 2.08, 2.13, LAMP);
    box(x - 0.18, x + 0.18, 0.66, 0.80, -2.13, -2.08, TAIL);
  }
  for (const z of [-1.35, 1.35]) for (const x of [-0.84, 0.84]) {
    box(x - 0.13, x + 0.13, 0.0, 0.64, z - 0.32, z + 0.32, TYRE);
  }
}
