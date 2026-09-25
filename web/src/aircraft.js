import { carGeometry } from "./car.js";

// Things in the air: a few light aircraft and a helicopter going about their
// business over the corridor, and a plane you can fly yourself (shift+P).
//
// World frame as everywhere else: x east, y up, z SOUTH. Nothing here is data:
// there is no airfield on this line, so the traffic is invented, and says so.

// ------------------------------------------------------------- AI traffic
export class AirTraffic {
  constructor(demAt) {
    this.demAt = demAt;
    this.craft = [];
    // light aircraft and helicopters low enough to notice, and airliners at
    // cruise height on the airways over the Bend, with contrails
    const kinds = ["cessna", "cessna", "cessna", "cessna", "cessna", "cessna",
                   "heli", "heli", "jet", "jet", "jet"];
    kinds.forEach((kind, i) => this.craft.push({
      kind, p: [0, 0, 0], yaw: i * 1.3, pitch: 0, roll: 0,
      v: kind === "heli" ? 38 : kind === "jet" ? 235 : 52,
      alt: kind === "heli" ? 160 + i * 20 : kind === "jet" ? 9000 + i * 400 : 250 + i * 70,
      wp: null, placed: false, seed: i * 17 + 3, rotor: 0,
    }));
  }

  /** Keep them within a few kilometres of the camera: a plane that has flown
   *  off to Győr is as good as one that never existed. */
  step(dt, cam) {
    for (const a of this.craft) {
      if (a.kind === "jet") {
        // straight across the sky on an airway, and re-placed on the far
        // side when it has gone
        if (!a.placed || Math.hypot(a.p[0] - cam[0], a.p[2] - cam[2]) > 60000) {
          const ang = Math.random() * Math.PI * 2;
          a.p = [cam[0] - Math.sin(ang) * 45000 + (Math.random() - 0.5) * 20000, a.alt,
                 cam[2] + Math.cos(ang) * 45000 + (Math.random() - 0.5) * 20000];
          a.yaw = ang; a.placed = true;
        }
        a.p[0] += Math.sin(a.yaw) * a.v * dt; a.p[2] -= Math.cos(a.yaw) * a.v * dt;
        continue;
      }
      if (!a.placed || Math.hypot(a.p[0] - cam[0], a.p[2] - cam[2]) > 7000) {
        const ang = Math.random() * Math.PI * 2, r = 700 + Math.random() * 2500;
        a.p = [cam[0] + Math.cos(ang) * r, 0, cam[2] + Math.sin(ang) * r];
        a.p[1] = this.ground(a.p) + a.alt;
        a.placed = true; a.wp = null;
      }
      if (!a.wp || Math.hypot(a.wp[0] - a.p[0], a.wp[2] - a.p[2]) < 300) {
        const ang = Math.random() * Math.PI * 2, r = 600 + Math.random() * 2800;
        a.wp = [cam[0] + Math.cos(ang) * r, 0, cam[2] + Math.sin(ang) * r];
      }
      // steer towards the waypoint with a bank proportional to the turn
      const want = Math.atan2(a.wp[0] - a.p[0], -(a.wp[2] - a.p[2]));
      let d = want - a.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const rate = Math.max(-0.18, Math.min(0.18, d * 0.6));
      a.yaw += rate * dt;
      a.roll += (rate * (a.kind === "heli" ? 1.2 : 2.6) - a.roll) * Math.min(1, dt * 1.5);
      // hold height above the ground ahead, climbing gently over hills
      const ahead = [a.p[0] + Math.sin(a.yaw) * 400, 0, a.p[2] - Math.cos(a.yaw) * 400];
      const gy = Math.max(this.ground(a.p), this.ground(ahead));
      const vy = Math.max(-4, Math.min(4, (gy + a.alt - a.p[1]) * 0.08));
      a.pitch = Math.atan2(vy, a.v);
      a.p[0] += Math.sin(a.yaw) * a.v * dt;
      a.p[2] -= Math.cos(a.yaw) * a.v * dt;
      a.p[1] += vy * dt;
      a.rotor += dt * (a.kind === "heli" ? 28 : 60);
    }
  }
  ground(p) {
    const g = this.demAt(p[0], -p[2]);
    return isFinite(g) ? g : 110;
  }
}

// ------------------------------------------------------------ your plane
//
// Three aircraft (1 / 2 / 3 while flying). Fixed-wing ones fly on body
// rates: the stick pitches and rolls the aeroplane about its own axes, so a
// banked aeroplane pulled back turns rather than climbs, a bank stays in
// until you take it out, a turn costs height unless you pull, and below the
// stall speed the nose drops and a wing goes. They can land: touch down
// level, slow and gently and you roll out on the ground; anything harder is
// a crash and a restart at 400 m. The helicopter hovers on its collective.
//
//   Cessna 172   — stalls at ~88 km/h, cruises at 200, forgiving.
//   JAS 39 Gripen — what the Hungarian Air Force flies (a fighter was asked
//                   for; Hungary's is the Gripen, not the F-16): 230 km/h
//                   stall, well over 1000 km/h with the afterburner (full
//                   throttle), and it rolls very fast.
//   H135 helicopter — collective R/F, cyclic W/S/A/D, pedals Q/E.
export const PLANES = {
  cessna: { name: "Cessna 172", vStall: 24, thrust: 5.0, drag: 0.00105, roll: 1.3, pitch: 0.75,
            yawR: 0.35, liftV: 30, start: 45 },
  gripen: { name: "JAS 39 Gripen", vStall: 64, thrust: 26, ab: 1.7, drag: 0.00048, roll: 3.4, pitch: 1.2,
            yawR: 0.30, liftV: 85, start: 180 },
  heli:   { name: "H135 helikopter", heli: true, start: 0 },
};
export const PLANE_ORDER = ["cessna", "gripen", "heli"];

export function makePlane(at, yaw, type = "cessna") {
  const T = PLANES[type] || PLANES.cessna;
  return { type, p: [at[0], at[1], at[2]], vel: [Math.sin(yaw) * T.start, 0, -Math.cos(yaw) * T.start],
           yaw, pitch: 0, roll: 0, throttle: T.heli ? 0.62 : 0.7, active: true, cockpit: false,
           stall: 0, crashed: 0, prop: 0, ground: false, drift: 0 };
}

// the tops of buildings and structures (collide.js Solids.topAt), set for
// the step by stepPlane: a roof is ground you can land on, a wall is not
let roofAt = null;
export function stepPlane(pl, keys, dt, demAt, topAt = null) {
  roofAt = topAt;
  const T = PLANES[pl.type] || PLANES.cessna;
  return T.heli ? stepHeli(pl, keys, dt, demAt) : stepWing(pl, T, keys, dt, demAt);
}

function stepWing(pl, T, keys, dt, demAt) {
  const k = (c) => keys.has(c);
  const pitchIn = (k("KeyS") || k("ArrowDown") ? 1 : 0) - (k("KeyW") || k("ArrowUp") ? 1 : 0);
  const rollIn = (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0);
  const yawIn = (k("KeyE") ? 1 : 0) - (k("KeyQ") ? 1 : 0);
  if (k("KeyR")) pl.throttle = Math.min(1, pl.throttle + dt * 0.45);
  if (k("KeyF")) pl.throttle = Math.max(0, pl.throttle - dt * 0.45);

  const speed = Math.hypot(pl.vel[0], pl.vel[1], pl.vel[2]);
  const ctl = Math.min(1, speed / (T.vStall * 1.3));       // soft when slow
  const liftK = Math.min(1.3, (speed / T.liftV) ** 2);
  // body rates -> Euler rates (so pulling in a bank turns)
  const q = pitchIn * T.pitch * ctl, p = rollIn * T.roll * ctl, r = yawIn * T.yawR * ctl;
  const sr = Math.sin(pl.roll), cr = Math.cos(pl.roll), cpt = Math.max(0.2, Math.cos(pl.pitch));
  pl.roll += (p + (q * sr + r * cr) * Math.tan(pl.pitch)) * dt;
  pl.pitch += (q * cr - r * sr) * dt;
  pl.yaw += ((q * sr + r * cr) / cpt) * dt;
  // the lift vector tilted by the bank turns the aeroplane on its own
  pl.yaw += Math.sin(pl.roll) * 9.81 / Math.max(speed, 15) * Math.min(1, liftK) * dt * (pl.ground ? 0 : 1);
  if (pl.roll > Math.PI) pl.roll -= 2 * Math.PI;
  if (pl.roll < -Math.PI) pl.roll += 2 * Math.PI;
  pl.pitch = Math.max(-1.45, Math.min(1.45, pl.pitch));

  // the stall: nose down, and a wing drops
  pl.stall = speed < T.vStall && !pl.ground ? Math.min(1, pl.stall + dt * 1.5) : Math.max(0, pl.stall - dt);
  if (pl.stall > 0.4) {
    pl.pitch -= 0.6 * dt;
    if (!pl.drift) pl.drift = Math.random() < 0.5 ? -1 : 1;
    pl.roll += pl.drift * 0.7 * dt;
  } else pl.drift = 0;

  const cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
  const nose = [Math.sin(pl.yaw) * cp, sp, -Math.cos(pl.yaw) * cp];
  const ab = T.ab && pl.throttle > 0.92 ? T.ab : 1;       // afterburner
  const thrust = pl.throttle * T.thrust * ab;
  // drag, plus the extra drag of a hard turn
  const drag = T.drag * speed * speed * (1 + 1.4 * Math.abs(q) * ctl) + (pl.ground ? 0.8 + (k("Space") ? 4 : 0) : 0);
  const fwdAcc = thrust - drag - 9.81 * sp;
  const vAlong = Math.max(0, speed + fwdAcc * dt);
  const target = [nose[0] * vAlong, nose[1] * vAlong, nose[2] * vAlong];
  const align = Math.min(1, dt * 2.0 * liftK);
  for (let i = 0; i < 3; i++) pl.vel[i] += (target[i] - pl.vel[i]) * align;
  // what the wing does not hold up falls: in a bank the lift leans over and
  // the aeroplane sinks unless you pull (the old version held height in any
  // bank, which is what made it feel too easy)
  if (!pl.ground) pl.vel[1] -= 9.81 * 1.6 * (1 - Math.min(1, liftK) * Math.max(0, Math.cos(pl.roll))) * dt;
  for (let i = 0; i < 3; i++) pl.p[i] += pl.vel[i] * dt;
  pl.prop += dt * (20 + pl.throttle * 60);
  groundContact(pl, T, demAt, speed);
  if (pl.crashed > 0) pl.crashed -= dt;
  return nose;
}

function stepHeli(pl, keys, dt, demAt) {
  const k = (c) => keys.has(c);
  // collective on R/F: 0.62 is about a hover
  if (k("KeyR")) pl.throttle = Math.min(1, pl.throttle + dt * 0.35);
  if (k("KeyF")) pl.throttle = Math.max(0, pl.throttle - dt * 0.35);
  const pitchT = ((k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0)) * -0.32;
  const rollT = ((k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0)) * 0.30;
  const yawIn = (k("KeyE") ? 1 : 0) - (k("KeyQ") ? 1 : 0);
  // attitude follows the cyclic, with some lag; the pedals turn it
  pl.pitch += (pitchT - pl.pitch) * Math.min(1, dt * 1.6);
  pl.roll += (rollT - pl.roll) * Math.min(1, dt * 1.6);
  pl.yaw += yawIn * 0.9 * dt;
  // rotor thrust along the tilted mast
  const lift = pl.throttle / 0.62 * 9.81;
  const fwd = [Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)], right = [Math.cos(pl.yaw), 0, Math.sin(pl.yaw)];
  const tx = -Math.sin(pl.pitch) * lift, tz = Math.sin(pl.roll) * lift;
  const acc = [fwd[0] * tx + right[0] * tz, lift * Math.cos(pl.pitch) * Math.cos(pl.roll) - 9.81, fwd[2] * tx + right[2] * tz];
  for (let i = 0; i < 3; i++) pl.vel[i] += (acc[i] - pl.vel[i] * (i === 1 ? 0.35 : 0.06)) * dt;
  for (let i = 0; i < 3; i++) pl.p[i] += pl.vel[i] * dt;
  pl.prop += dt * 30;
  pl.rotor = pl.prop;
  const speed = Math.hypot(pl.vel[0], pl.vel[1], pl.vel[2]);
  groundContact(pl, { vStall: 30, heli: true }, demAt, speed);
  if (pl.crashed > 0) pl.crashed -= dt;
  const cp = Math.cos(pl.pitch);
  return [Math.sin(pl.yaw) * cp, -Math.sin(pl.pitch) * 0.3, -Math.cos(pl.yaw) * cp];
}

// Touching the ground: a landing if it was gentle, a crash if it was not.
function groundContact(pl, T, demAt, speed) {
  let g = demAt(pl.p[0], -pl.p[2]);
  if (!isFinite(g)) return;
  const clear = T.heli ? 1.3 : 1.5;
  // Buildings, chimneys, masts. Coming in over the top of one is a roof to
  // land on (the helicopter, gently); being below its top inside it means
  // you flew into the side of it.
  const roof = roofAt ? roofAt(pl.p[0], -pl.p[2]) : -Infinity;
  if (roof > g) {
    if (pl.p[1] < roof - 2.5) {
      crash(pl, T, g, "Épületnek ütköztél");
      return;
    }
    g = roof;
  }
  if (pl.p[1] < g + clear) {
    const gentle = pl.vel[1] > (T.heli ? -3.5 : -4.5) && Math.abs(pl.roll) < 0.3
                   && (T.heli || (pl.pitch > -0.12 && speed < T.vStall * 1.8));
    if (gentle || pl.ground) {
      pl.p[1] = g + clear; pl.vel[1] = Math.max(0, pl.vel[1]);
      pl.ground = true; pl.roll *= 0.8;
      if (!T.heli) pl.pitch = Math.max(pl.pitch, -0.02);
    } else crash(pl, T, g, "Lezuhantál");
  } else if (pl.p[1] > g + clear + 0.8) pl.ground = false;
}
// a crash: a message (main.js shows pl.crashWhy), and a restart 400 m up
function crash(pl, T, g, why) {
  pl.crashed = 2.5; pl.ground = false; pl.crashWhy = why; pl.crashes = (pl.crashes || 0) + 1;
  pl.p[1] = g + 400; pl.pitch = 0; pl.roll = 0; pl.stall = 0;
  const v0 = T.heli ? 0 : (PLANES[pl.type] || PLANES.cessna).start;
  pl.vel = [Math.sin(pl.yaw) * v0, 0, -Math.cos(pl.yaw) * v0];
}

// --------------------------------------------------------------- geometry
const WHITE = [0.90, 0.91, 0.92], RED = [0.72, 0.12, 0.10], BLUE = [0.10, 0.28, 0.58],
      DARKG = [0.10, 0.11, 0.13], PROP = [0.18, 0.18, 0.19], YEL = [0.92, 0.72, 0.12];

export function buildAircraft(air, plane, car = null) {
  const V = [], C = [], N = [];
  const push = (p, col) => { V.push(p[0], p[1], p[2]); C.push(col[0], col[1], col[2]); };
  const quad = (a, b, c, d, col) => {
    push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col);
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    for (let i = 0; i < 6; i++) N.push(nx / L, ny / L, nz / L);
  };
  // local frame: f forward, r right, u up, rotated by yaw, pitch, roll
  const frame = (a) => {
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw), cp = Math.cos(a.pitch), sp = Math.sin(a.pitch);
    const cr = Math.cos(a.roll), sr = Math.sin(a.roll);
    const f = [sy * cp, sp, -cy * cp];
    const r0 = [cy, 0, sy], u0 = [-sy * sp, cp, cy * sp];
    const r = [r0[0]*cr - u0[0]*sr, r0[1]*cr - u0[1]*sr, r0[2]*cr - u0[2]*sr];
    const u = [r0[0]*sr + u0[0]*cr, r0[1]*sr + u0[1]*cr, r0[2]*sr + u0[2]*cr];
    return (x, y, z) => [a.p[0] + f[0]*z + r[0]*x + u[0]*y,
                         a.p[1] + f[1]*z + r[1]*x + u[1]*y,
                         a.p[2] + f[2]*z + r[2]*x + u[2]*y];
  };
  const box = (P, x0, x1, y0, y1, z0, z1, col, top) => {
    quad(P(x0,y0,z0), P(x1,y0,z0), P(x1,y1,z0), P(x0,y1,z0), col);
    quad(P(x1,y0,z1), P(x0,y0,z1), P(x0,y1,z1), P(x1,y1,z1), col);
    quad(P(x0,y0,z1), P(x0,y0,z0), P(x0,y1,z0), P(x0,y1,z1), col);
    quad(P(x1,y0,z0), P(x1,y0,z1), P(x1,y1,z1), P(x1,y1,z0), col);
    quad(P(x0,y1,z0), P(x1,y1,z0), P(x1,y1,z1), P(x0,y1,z1), top || col);
    quad(P(x0,y0,z1), P(x1,y0,z1), P(x1,y0,z0), P(x0,y0,z0), col);
  };
  const cessna = (a, stripe) => {
    const P = frame(a);
    box(P, -0.6, 0.6, -0.7, 0.7, -3.4, 2.2, WHITE);            // fuselage
    box(P, -0.55, 0.55, -0.1, 0.62, 0.1, 1.6, DARKG);           // cabin glass
    box(P, -0.45, 0.45, -0.45, 0.45, 2.2, 2.9, WHITE);          // cowling
    box(P, -0.62, 0.62, -0.25, 0.05, -3.2, 1.6, stripe);        // cheat line
    box(P, -5.5, 5.5, 0.62, 0.78, -0.1, 1.5, WHITE, stripe);   // high wing
    box(P, -0.12, 0.12, 0.2, 1.8, -4.4, -3.4, stripe);          // fin
    box(P, -1.9, 1.9, 0.1, 0.22, -4.4, -3.6, WHITE);            // tailplane
    const ang = a.prop || a.rotor || 0;                        // propeller blur
    const c = Math.cos(ang) * 0.95, s = Math.sin(ang) * 0.95;
    quad(P(-c, -s, 2.95), P(c, s, 2.95), P(c + 0.08, s, 2.96), P(-c + 0.08, -s, 2.96), PROP);
    for (const x of [-1.1, 1.1]) box(P, x - 0.08, x + 0.08, -1.35, -0.7, 0.4, 0.7, DARKG); // gear
  };
  const heli = (a) => {
    const P = frame(a);
    box(P, -0.9, 0.9, -0.9, 0.9, -1.2, 2.2, BLUE);
    box(P, -0.8, 0.8, -0.2, 0.8, 1.2, 2.4, DARKG);
    box(P, -0.2, 0.2, 0.0, 0.4, -6.5, -1.2, BLUE);
    box(P, -0.08, 0.08, 0.2, 1.4, -6.6, -6.0, YEL);
    const ang = a.rotor;
    for (let i = 0; i < 2; i++) {
      const t = ang + i * Math.PI / 2;
      const c = Math.cos(t) * 5.2, s = Math.sin(t) * 5.2;
      quad(P(-c - s * 0.03, 1.25, -s + c * 0.03), P(c - s * 0.03, 1.25, s + c * 0.03),
           P(c + s * 0.03, 1.25, s - c * 0.03), P(-c + s * 0.03, 1.25, -s - c * 0.03), PROP);
    }
    for (const x of [-0.9, 0.9]) box(P, x - 0.06, x + 0.06, -1.3, -1.2, -1.0, 1.6, DARKG);
  };
  // world z is south; the frame above is already in world axes
  const jet = (a) => {
    // an airliner at ten kilometres is a few pixels; drawn large enough to
    // register, and its contrail — which is what you actually see — long
    const P = frame(a), S = 3.0;
    box(P, -2 * S, 2 * S, -2 * S, 2 * S, -20 * S, 20 * S, WHITE);
    box(P, -18 * S, 18 * S, -0.3 * S, 0.3 * S, -3 * S, 5 * S, WHITE);
    box(P, -0.3 * S, 0.3 * S, 0, 7 * S, -20 * S, -14 * S, WHITE);
    const TRAIL = [1.5, 1.5, 1.55];
    for (const x of [-7 * S, 7 * S]) {
      const n0 = P(x, 0, -20 * S), n1 = P(x, 0, -6000);
      const up = [0, 25, 0];
      quad(n0, n1, [n1[0] + up[0], n1[1] + up[1], n1[2]], [n0[0], n0[1] + 4, n0[2]], TRAIL);
    }
  };
  for (const a of air.craft) {
    if (a.kind === "jet") jet(a);
    else if (a.kind === "heli") heli(a);
    else cessna(a, a.seed % 2 ? RED : BLUE);
  }
  const gripen = (a) => {
    const P = frame(a), G = [0.52, 0.55, 0.58], G2 = [0.40, 0.43, 0.46];
    box(P, -0.7, 0.7, -0.8, 0.7, -6.5, 6.0, G);               // fuselage
    box(P, -0.5, 0.5, 0.5, 1.05, 2.4, 4.6, DARKG);             // canopy
    box(P, -0.35, 0.35, -0.4, 0.35, 6.0, 7.4, G2);             // nose cone
    // the delta, as two tapered slabs, and the canards
    for (const sg of [-1, 1]) {
      quad(P(sg * 0.7, -0.1, 1.5), P(sg * 4.3, -0.1, -4.8), P(sg * 4.3, 0.0, -6.0), P(sg * 0.7, 0.0, -6.0), G);
      quad(P(sg * 0.7, 0.0, -6.0), P(sg * 4.3, 0.0, -6.0), P(sg * 4.3, -0.1, -4.8), P(sg * 0.7, -0.1, 1.5), G2);
      quad(P(sg * 0.7, 0.3, 3.6), P(sg * 2.2, 0.3, 2.4), P(sg * 2.2, 0.35, 1.9), P(sg * 0.7, 0.35, 1.9), G);
    }
    quad(P(0, 0.7, -2.6), P(0, 3.2, -5.6), P(0, 3.2, -6.4), P(0, 0.7, -6.4), G);   // fin
    quad(P(0, 0.7, -6.4), P(0, 3.2, -6.4), P(0, 3.2, -5.6), P(0, 0.7, -2.6), G2);
    const burn = a.throttle > 0.92;
    box(P, -0.45, 0.45, -0.45, 0.45, -7.4, -6.5, burn ? [1.6, 0.9, 0.4] : DARKG);
  };
  if (car && !car.cockpit) carGeometry(car, quad);
  if (plane && plane.active && !plane.cockpit) {
    if (plane.type === "gripen") gripen(plane);
    else if (plane.type === "heli") heli(plane);
    else cessna(plane, YEL);
  }
  return { verts: new Float32Array(V), cols: new Float32Array(C),
           nrms: new Float32Array(N), count: V.length / 3 };
}
