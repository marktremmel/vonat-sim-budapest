// Particles: fire, smoke, sparks and vapour, as camera-facing quads drawn in
// one instanced call (VFX_VS / VFX_FS in shaders.js). A small version of the
// engine proposed in docs/MODERN_VFX_PARTICLE_ENGINE_SPEC.md: a fixed pool,
// CPU physics, no allocation per frame, blackbody colour for fire, and a
// dithered edge like the trees'.
//
// Used for: a plane crash (fireball, sparks, a wreck that burns and smokes),
// the Gripen's afterburner, vapour off the wingtips in a hard pull.
//
// Types: 0 smoke, 1 fire, 2 spark, 3 fireball, 4 vapour.
export const VFX_MAX = 3072;
const VFX_STRIDE = 12;     // pos xyz, size, vel xyz, life 0..1, type, rot, seed, temp

export class Particles {
  constructor() {
    this.n = 0;
    this.p = new Float32Array(VFX_MAX * 16);   // x y z vx vy vz age life s0 s1 type rot rotv seed temp grav
    this.out = new Float32Array(VFX_MAX * VFX_STRIDE);
    this.count = 0;
    this.emitters = [];                         // {x, y, z, until, rate, kind, acc}
  }
  spawn(type, x, y, z, vx, vy, vz, s0, s1, life, temp = 2000, grav = 0) {
    if (this.n >= VFX_MAX) return;
    const o = this.n++ * 16, P = this.p;
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = vx; P[o + 4] = vy; P[o + 5] = vz;
    P[o + 6] = 0; P[o + 7] = life; P[o + 8] = s0; P[o + 9] = s1; P[o + 10] = type;
    P[o + 11] = Math.random() * 6.283; P[o + 12] = (Math.random() - 0.5) * 2.0;
    P[o + 13] = Math.random(); P[o + 14] = temp; P[o + 15] = grav;
  }
  /** A fireball with sparks and a column of smoke, at world (x, y, z). */
  explode(x, y, z, scale = 1) {
    const R = Math.random;
    for (let i = 0; i < 26 * scale; i++) {
      const a = R() * 6.283, e = R() * 1.2, v = (6 + R() * 16) * scale;
      this.spawn(3, x, y + 1, z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 4, Math.sin(a) * Math.cos(e) * v,
                 4 * scale, (13 + R() * 9) * scale, 1.2 + R() * 1.3, 4200, 2.0);
    }
    for (let i = 0; i < 40 * scale; i++) {
      const a = R() * 6.283, v = 18 + R() * 40;
      this.spawn(2, x, y + 1, z, Math.cos(a) * v, 8 + R() * 26, Math.sin(a) * v, 0.35, 0.1, 0.8 + R() * 1.4, 3000, -14);
    }
    for (let i = 0; i < 18 * scale; i++)
      this.spawn(0, x + (R() - 0.5) * 8, y + 2, z + (R() - 0.5) * 8, (R() - 0.5) * 3, 3 + R() * 4, (R() - 0.5) * 3,
                 6 * scale, (24 + R() * 12) * scale, 7 + R() * 5, 600, 1.2);
  }
  /** Something that keeps burning: flames and a smoke plume for `secs`. */
  burn(x, y, z, secs = 30) { this.emitters.push({ x, y, z, until: secs, acc: 0 }); }
  step(dt, wind = [1.5, 0, -0.8]) {
    const R = Math.random;
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.until -= dt;
      if (e.until <= 0) { this.emitters.splice(i, 1); continue; }
      const fade = Math.min(1, e.until / 8);
      e.acc += dt * 18 * fade;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(1, e.x + (R() - 0.5) * 4, e.y + 0.3, e.z + (R() - 0.5) * 4, (R() - 0.5), 3 + R() * 3, (R() - 0.5),
                   1.6, 3.6, 0.7 + R() * 0.6, 2300, 1.5);
        if (R() < 0.7)
          this.spawn(0, e.x + (R() - 0.5) * 3, e.y + 3, e.z + (R() - 0.5) * 3, wind[0] * 0.6, 5 + R() * 3, wind[2] * 0.6,
                     4, 20 + R() * 12, 9 + R() * 6, 600, 1.2);
      }
    }
    // integrate, and drop the dead by moving the last one into the hole
    const P = this.p;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      P[o + 6] += dt;
      if (P[o + 6] >= P[o + 7]) {
        const l = --this.n * 16;
        for (let k = 0; k < 16; k++) P[o + k] = P[l + k];
        i--; continue;
      }
      const t = P[o + 10];
      // smoke keeps climbing on its buoyancy (drag 0.985 held it to 0.4 m/s:
      // a blob, not a column); sparks fly; fire and vapour slow quickly
      const drag = t === 2 ? 0.995 : t === 0 ? 0.993 : 0.96;
      const d = Math.pow(drag, dt * 60);
      P[o + 3] *= d; P[o + 5] *= d; P[o + 4] = P[o + 4] * d + P[o + 15] * dt;
      if (t === 0 || t === 4) { P[o + 3] += (wind[0] - P[o + 3]) * dt * 0.3; P[o + 5] += (wind[2] - P[o + 5]) * dt * 0.3; }
      P[o] += P[o + 3] * dt; P[o + 1] += P[o + 4] * dt; P[o + 2] += P[o + 5] * dt;
      P[o + 11] += P[o + 12] * dt;
    }
    // pack for the GPU
    const O = this.out;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16, w = i * VFX_STRIDE, life = P[o + 6] / P[o + 7];
      O[w] = P[o]; O[w + 1] = P[o + 1]; O[w + 2] = P[o + 2];
      O[w + 3] = P[o + 8] + (P[o + 9] - P[o + 8]) * Math.sin(life * 1.5708);
      O[w + 4] = P[o + 3]; O[w + 5] = P[o + 4]; O[w + 6] = P[o + 5]; O[w + 7] = life;
      O[w + 8] = P[o + 10]; O[w + 9] = P[o + 11]; O[w + 10] = P[o + 13]; O[w + 11] = P[o + 14];
    }
    this.count = this.n;
  }
}

// A starling murmuration: a homage to the one the owner once saw over
// Kispest, hundreds of birds drawing huge shifting shapes in the sky at dusk.
// A few hundred boids: each steers toward the flock's centre, matches its
// neighbours' heading (sampled, not all pairs), keeps a little apart, and
// the centre itself wanders on a slow figure so the whole cloud folds and
// stretches. Drawn by the particle program as small dark birds (type 5).
export class Murmuration {
  constructor(x, y, z, n = 900) {
    this.home = [x, y, z];
    this.b = new Float32Array(n * 6);            // x y z vx vy vz
    this.n = n; this.t = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      this.b[o] = x + (Math.random() - 0.5) * 260; this.b[o + 1] = y + (Math.random() - 0.5) * 50;
      this.b[o + 2] = z + (Math.random() - 0.5) * 200;
      this.b[o + 3] = (Math.random() - 0.5) * 10; this.b[o + 4] = 0; this.b[o + 5] = (Math.random() - 0.5) * 10;
    }
  }
  step(dt) {
    this.t += dt;
    const t = this.t, B = this.b, n = this.n, [hx, hy, hz] = this.home;
    // the centre: a slow wandering loop 300 m across, rising and falling
    const cx = hx + Math.sin(t * 0.07) * 160 + Math.sin(t * 0.19) * 60;
    const cy = hy + Math.sin(t * 0.11) * 25;
    const cz = hz + Math.cos(t * 0.05) * 140 + Math.cos(t * 0.23) * 50;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      // weak pull to the centre (strong made a tight 30 m ball, not a cloud)
      let ax = (cx - B[o]) * 0.0035, ay = (cy - B[o + 1]) * 0.012, az = (cz - B[o + 2]) * 0.0035;
      // a few neighbours by index (the flock is well mixed, so it serves)
      for (let k = 1; k <= 6; k++) {
        const j = ((i + k * 37) % n) * 6;
        const dx = B[j] - B[o], dy = B[j + 1] - B[o + 1], dz = B[j + 2] - B[o + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        ax += (B[j + 3] - B[o + 3]) * 0.08; ay += (B[j + 4] - B[o + 4]) * 0.08; az += (B[j + 5] - B[o + 5]) * 0.08;
        if (d2 < 90) { ax -= dx * 0.25; ay -= dy * 0.25; az -= dz * 0.25; }
      }
      // a ripple through the flock: the waves of turning that run across it
      const w = Math.sin(t * 0.7 + B[o] * 0.012 + B[o + 2] * 0.009) * 9;
      ax += w * 0.35; az -= w * 0.25; ay += Math.cos(t * 0.5 + B[o] * 0.01) * 1.5;
      B[o + 3] += ax * dt; B[o + 4] += ay * dt; B[o + 5] += az * dt;
      const sp = Math.hypot(B[o + 3], B[o + 4], B[o + 5]), lim = 17;
      if (sp > lim) { const k = lim / sp; B[o + 3] *= k; B[o + 4] *= k; B[o + 5] *= k; }
      B[o] += B[o + 3] * dt; B[o + 1] += B[o + 4] * dt; B[o + 2] += B[o + 5] * dt;
    }
  }
  /** write the birds into a particle output buffer after `from` entries */
  pack(out, from, max) {
    const B = this.b; let c = from;
    for (let i = 0; i < this.n && c < max; i++, c++) {
      const o = i * 6, w = c * 12;
      out[w] = B[o]; out[w + 1] = B[o + 1]; out[w + 2] = B[o + 2]; out[w + 3] = 1.4;      // (a starling is 0.4 m; drawn larger so the cloud reads)
      out[w + 4] = B[o + 3]; out[w + 5] = B[o + 4]; out[w + 6] = B[o + 5]; out[w + 7] = 0.5;
      out[w + 8] = 5; out[w + 9] = 0; out[w + 10] = (i % 7) / 7; out[w + 11] = 0;
    }
    return c;
  }
}
