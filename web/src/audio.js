// Everything here is synthesised. No samples ship with the build, which keeps
// it small and lets the line respond continuously instead of crossfading clips.
export class Sound {
  constructor() {
    this.ctx = null; this.on = false; this.nodes = {};
    this.rate = 1;          // game time multiplier
    this.timers = new Set();
    this.vol = 0.7;
    this.samples = {};
  }

  async loadSample(name, url) {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
    }
    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      this.samples[name] = await this.ctx.decodeAudioData(ab);
    } catch (e) {
      console.warn("Failed to load sample:", url, e);
    }
  }

  playSample(name, vol = 1.0) {
    if (!this.on || !this.samples[name] || !this.ctx || !this.nodes.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.samples[name];
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(this.nodes.master);
    src.start();
  }

  /** Transients are events per unit of *game* distance, so at 16x they fire
   *  sixteen times as often and the rhythm runs away. Above a walking pace of
   *  time compression we simply stop firing them, and any already queued are
   *  cancelled so nothing arrives late once the rate drops back. */
  setRate(mul) {
    if (mul === this.rate) return;
    this.rate = mul;
    if (mul > 2) this.clearPending();
  }
  clearPending() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }
  get transientsAllowed() { return this.on && this.rate <= 2; }

  start() {
    if (this.ctx) { this.ctx.resume(); this.on = true; return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.nodes.master = master;

    // Load samples
    this.loadSample("szignal_mav", "data/audio/mav-szignal.mp3");
    this.loadSample("szignal_99", "data/audio/máv-bent-99_Spec_Szignal.mp3");
    this.loadSample("bemondo_10perc", "data/audio/s70személyvonatindulgödönátvácra10percmulva.mp3");
    
    // ---- rolling noise: wheels on rail, broadband, speed driven
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const roll = ctx.createBufferSource();
    roll.buffer = noiseBuf; roll.loop = true;
    const rollFilt = ctx.createBiquadFilter();
    rollFilt.type = "bandpass"; rollFilt.frequency.value = 300; rollFilt.Q.value = 0.7;
    const rollGain = ctx.createGain(); rollGain.gain.value = 0;
    roll.connect(rollFilt).connect(rollGain).connect(master);
    roll.start();

    // ---- traction: a stack of sawtooths that rise with speed
    const tract = ctx.createGain(); tract.gain.value = 0;
    const tfilt = ctx.createBiquadFilter();
    tfilt.type = "lowpass"; tfilt.frequency.value = 1600;
    tract.connect(tfilt).connect(master);
    const oscs = [];
    for (const mult of [1, 2, 3.02]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = 60 * mult;
      const g = ctx.createGain(); g.gain.value = 1 / (mult * 2.2);
      o.connect(g).connect(tract); o.start();
      oscs.push({ o, mult });
    }

    // ---- cicadas: banded noise, gated in bursts
    const cic = ctx.createBufferSource();
    cic.buffer = noiseBuf; cic.loop = true;
    const cicFilt = ctx.createBiquadFilter();
    cicFilt.type = "bandpass"; cicFilt.frequency.value = 5200; cicFilt.Q.value = 9;
    const cicGain = ctx.createGain(); cicGain.gain.value = 0;
    cic.connect(cicFilt).connect(cicGain).connect(master);
    cic.start();

    // ---- wind past the cab
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf; wind.loop = true;
    const windFilt = ctx.createBiquadFilter();
    windFilt.type = "lowpass"; windFilt.frequency.value = 700;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    wind.connect(windFilt).connect(windGain).connect(master);
    wind.start();

    // ---- precipitation: broadband hiss, shaped to the kind of thing falling
    const rain = ctx.createBufferSource();
    rain.buffer = noiseBuf; rain.loop = true;
    const rainFilt = ctx.createBiquadFilter();
    rainFilt.type = "bandpass"; rainFilt.frequency.value = 1400; rainFilt.Q.value = 0.5;
    const rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rain.connect(rainFilt).connect(rainGain).connect(master);
    rain.start();

    // ---- the weather's own wind, which blows whether or not you are moving
    const gust = ctx.createBufferSource();
    gust.buffer = noiseBuf; gust.loop = true;
    const gustFilt = ctx.createBiquadFilter();
    gustFilt.type = "bandpass"; gustFilt.frequency.value = 260; gustFilt.Q.value = 0.6;
    const gustGain = ctx.createGain(); gustGain.gain.value = 0;
    gust.connect(gustFilt).connect(gustGain).connect(master);
    gust.start();

    // ---- flange squeal: a narrow resonance that only appears on tight
    // curves, which on this line means the Dömösi bend and Zebegény
    const squeal = ctx.createBufferSource();
    squeal.buffer = noiseBuf; squeal.loop = true;
    const sqFilt = ctx.createBiquadFilter();
    sqFilt.type = "bandpass"; sqFilt.frequency.value = 3000; sqFilt.Q.value = 26;
    const sqFilt2 = ctx.createBiquadFilter();
    sqFilt2.type = "bandpass"; sqFilt2.frequency.value = 4600; sqFilt2.Q.value = 30;
    const sqGain = ctx.createGain(); sqGain.gain.value = 0;
    squeal.connect(sqFilt).connect(sqGain).connect(master);
    sqFilt.connect(sqFilt2); sqFilt2.connect(sqGain);
    squeal.start();

    // ---- VVVF: a modern IGBT drive switches at a carrier frequency that
    // steps up in stages as the motor accelerates, and you hear the steps
    const vvGain = ctx.createGain(); vvGain.gain.value = 0;
    const vvFilt = ctx.createBiquadFilter();
    vvFilt.type = "bandpass"; vvFilt.frequency.value = 900; vvFilt.Q.value = 3.5;
    vvGain.connect(vvFilt).connect(master);
    const vvOscs = [];
    for (const mult of [1, 2, 3]) {
      const o = ctx.createOscillator();
      o.type = mult === 1 ? "square" : "sine";
      o.frequency.value = 300 * mult;
      const g = ctx.createGain(); g.gain.value = 1 / (mult * mult * 1.6);
      o.connect(g).connect(vvGain); o.start();
      vvOscs.push({ o, mult });
    }

    // ---- horn.
    // The first attempt was two tones sounding together with a lot of
    // harmonic content, which is exactly what a road vehicle does — hence
    // "sounds like a truck". A train horn is two chambers fed from the same
    // reservoir: the lower one speaks first because it takes less pressure
    // to start, and the upper one comes in on top a fraction later. That
    // rising two-part attack is the whole character of it. There is also a
    // lot of air: a good part of what you hear is the flow itself, not the
    // tone, and that is what stops it sounding like a synthesiser.
    const hornGain = ctx.createGain(); hornGain.gain.value = 0;
    const hornLo = ctx.createGain(); hornLo.gain.value = 0;
    const hornHi = ctx.createGain(); hornHi.gain.value = 0;
    hornLo.connect(hornGain); hornHi.connect(hornGain);
    // a shelf takes the fizz off the top so it is a horn, not a buzzer
    const hornTone = ctx.createBiquadFilter();
    hornTone.type = "lowpass"; hornTone.frequency.value = 3400; hornTone.Q.value = 0.7;
    hornGain.connect(hornTone).connect(master);
    const hornOscs = [];
    // A Stadler is tuned to a minor third: B flat 4 at 466 Hz and D flat 5
    // at 554. Both chambers sound together — that chord is the sound, and
    // pitching it as a fifth an octave down was most of why it read as a
    // road vehicle rather than a train.
    for (const [f0, bus] of [[466, hornLo], [554, hornHi]]) {
      for (const h of [1, 2, 3.01, 4.02, 5.03]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f0 * h;
        const g = ctx.createGain();
        // a real horn's second harmonic is nearly as strong as its first
        g.gain.value = (h === 1 ? 0.40 : h === 2 ? 0.34 : 0.16 / (h - 1.6));
        o.connect(g).connect(bus); o.start();
        hornOscs.push({ o, f0, h });
      }
    }
    // The légsíp — the air whistle. A FLIRT's horn switch has four
    // positions: forward sounds both chambers together, which is the normal
    // warning; left and right sound the deep or the high one alone; and
    // pulled back it gives the whistle, which is quiet on purpose. It is for
    // warning somebody close by at low speed without frightening them, and
    // it sounds like a pan pipe rather than a horn — a breathy, almost pure
    // tone with a lot of air in it.
    const sipGain = ctx.createGain(); sipGain.gain.value = 0;
    sipGain.connect(master);
    const sipOsc = ctx.createOscillator();
    sipOsc.type = "sine"; sipOsc.frequency.value = 1720;
    const sipOscG = ctx.createGain(); sipOscG.gain.value = 0.5;
    sipOsc.connect(sipOscG).connect(sipGain); sipOsc.start();
    const sipAir = ctx.createBufferSource();
    sipAir.buffer = noiseBuf; sipAir.loop = true;
    const sipAirF = ctx.createBiquadFilter();
    sipAirF.type = "bandpass"; sipAirF.frequency.value = 1780; sipAirF.Q.value = 7;
    const sipAirG = ctx.createGain(); sipAirG.gain.value = 0.85;
    sipAir.connect(sipAirF).connect(sipAirG).connect(sipGain);
    sipAir.start();

    // the air behind the tone
    const hornAir = ctx.createBufferSource();
    hornAir.buffer = noiseBuf; hornAir.loop = true;
    const hornAirF = ctx.createBiquadFilter();
    hornAirF.type = "bandpass"; hornAirF.frequency.value = 1500; hornAirF.Q.value = 0.8;
    const hornAirG = ctx.createGain(); hornAirG.gain.value = 0;
    hornAir.connect(hornAirF).connect(hornAirG).connect(hornGain);
    hornAir.start();

    // ---- FPV Drone quadcopter brushless motors
    const droneGain = ctx.createGain(); droneGain.gain.value = 0;
    droneGain.connect(master);
    const droneOscs = [];
    for (const mult of [1.0, 2.0, 3.01, 4.02]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 240 * mult;
      const g = ctx.createGain();
      g.gain.value = 0.28 / (mult * mult);
      o.connect(g).connect(droneGain);
      o.start();
      droneOscs.push({ o, mult });
    }

    this.nodes = { master, rollGain, rollFilt, tract, oscs, cicGain, cicFilt,
                   windGain, windFilt, noiseBuf, rainGain, rainFilt,
                   gustGain, gustFilt, sqGain, sqFilt, sqFilt2,
                   vvGain, vvFilt, vvOscs, hornGain, hornOscs,
                   hornLo, hornHi, hornAirG, sipGain, sipOsc,
                   droneGain, droneOscs };
    this.on = true;
    master.gain.linearRampToValueAtTime(1.9 * this.vol, ctx.currentTime + 1.2);
  }

  /** Modulate FPV drone brushless motor pitch and volume */
  updateDrone(active, throttle = 0, speed = 0) {
    if (!this.on || !this.nodes || !this.nodes.droneGain) return;
    const g = this.nodes.droneGain.gain;
    const t = this.ctx.currentTime;
    if (!active) {
      g.setTargetAtTime(0, t, 0.05);
      return;
    }
    const targetGain = 0.16 + Math.min(0.20, throttle * 0.14 + speed * 0.003);
    g.setTargetAtTime(targetGain, t, 0.04);
    const baseFreq = 220 + throttle * 280 + Math.min(180, speed * 4.5);
    for (const d of this.nodes.droneOscs) {
      d.o.frequency.setTargetAtTime(baseFreq * d.mult, t, 0.03);
    }
  }

  /** Master level, 0..1. The bed is a lot of continuous noise and being able
   *  to pull it down is more use than any amount of fiddling with balance. */
  setVolume(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.ctx && this.on)
      this.nodes.master.gain.setTargetAtTime(1.9 * this.vol,
                                             this.ctx.currentTime, 0.08);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.clearPending();
    this.nodes.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
  }

  /** the four wheelsets of two adjacent bogies crossing a joint or a point */
  bogiePair(v, gain = 0.5) {
    if (!this.transientsAllowed || !this.ctx) return;
    const axle = 2.6 / Math.max(v, 4);        // seconds between axles of a bogie
    const bogie = 17.0 / Math.max(v, 4);      // and between the bogies
    for (const d of [0, axle, bogie, bogie + axle]) {
      const id = setTimeout(() => {
        this.timers.delete(id);
        this.click(gain * (0.75 + Math.random() * 0.4), 115 + Math.random() * 55);
      }, d * 1000);
      this.timers.add(id);
    }
  }

  // one impulse — a rail joint, a point, a bump
  click(gain = 0.4, freq = 140) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.06);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    o.connect(g).connect(this.nodes.master);
    o.start(t); o.stop(t + 0.1);
  }

  hiss(dur = 0.9, gain = 0.20) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.nodes.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f).connect(g).connect(this.nodes.master);
    s.start(t); s.stop(t + dur);
  }

  // the two-note station chime
  chime() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    [[0, 784], [0.28, 1046]].forEach(([d, hz]) => {
      const t = ctx.currentTime + d;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 1.1);
      o.connect(g).connect(this.nodes.master);
      o.start(t); o.stop(t + 1.15);
    });
  }

  /** A short chirp built from two swept sine partials. Not a recording of a
   *  particular species, just something small in the trees. */
  bird() {
    if (!this.transientsAllowed || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 2200 + Math.random() * 2200;
    const notes = 1 + (Math.random() * 3 | 0);
    for (let i = 0; i < notes; i++) {
      const t0 = t + i * (0.09 + Math.random() * 0.07);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      const f0 = base * (0.85 + Math.random() * 0.4);
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.7 : 0.6),
                                               t0 + 0.06);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.075);
      o.connect(g).connect(this.nodes.master);
      o.start(t0); o.stop(t0 + 0.09);
    }
  }

  /**
   * The weather bed. Rain on the roof and glass of a cab is a broad hiss with
   * most of its energy around a kilohertz; snow is very nearly silent, which
   * is the whole character of driving in it, so the level collapses rather
   * than changing colour. Wind is separate from the wind of your own passage
   * and gusts on its own clock.
   *   kind — see PRECIP in weather.js · rate 0..1 · windSpeed m/s · gust factor
   */
  weather(kind, rate, windSpeed, gustFactor, speed) {
    if (!this.on || !this.ctx) return;
    const n = this.nodes, t = this.ctx.currentTime;
    const snow = kind === 2, hail = kind === 5, drizzle = kind === 4;
    // a wet windscreen at 100 km/h is much louder than the same rain standing
    const drive = 1 + Math.min(1.6, speed / 26);
    // rain is not a steady hiss — it comes in waves as the cells pass over
    const swell = 0.78 + 0.22 * Math.sin(t * 0.19) * Math.sin(t * 0.061 + 2.3);
    const level = kind === 0 ? 0
                : snow ? rate * 0.006 * drive
                : drizzle ? rate * 0.030 * drive
                : hail ? rate * 0.130 * drive
                       : rate * 0.092 * drive;
    // fall away quickly when it stops; a long tail on a stopped shower is
    // what made it sound stuck to the situation rather than to the weather
    const cur = n.rainGain.gain.value;
    n.rainGain.gain.setTargetAtTime(level * swell, t,
                                    level * swell < cur ? 0.09 : 0.30);
    n.rainFilt.frequency.setTargetAtTime(
      (snow ? 500 : hail ? 3200 : 900 + rate * 1400) * (0.9 + 0.2 * swell),
      t, 0.5);
    n.rainFilt.Q.setTargetAtTime(hail ? 1.2 : 0.5, t, 0.3);

    // gusts: a slow random walk on top of the mean, so it breathes
    const g = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.073 + 1.7);
    const w = Math.max(0, windSpeed - 1.5) / 20;
    n.gustGain.gain.setTargetAtTime(
      w * w * (0.10 + 0.28 * g * (gustFactor - 1)), t, 0.5);
    n.gustFilt.frequency.setTargetAtTime(180 + windSpeed * 22 + g * 90, t, 0.6);
  }

  /**
   * Thunder. The crack is what reaches you along the straight line and the
   * rumble is the rest of the channel arriving late and off the hillsides, so
   * distance does two things at once: it delays the sound and it strips the
   * top off it. Under a kilometre you get the crack; at ten you get only the
   * roll.  distanceKm — how far the strike was
   */
  thunder(distanceKm) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx, d = Math.max(0.2, distanceKm);
    const near = Math.max(0, 1 - d / 4);
    const t0 = ctx.currentTime;
    const level = Math.min(1, 3.2 / (d + 1.2));

    // the crack: a short burst with the top still on it
    if (near > 0.02) {
      const s = ctx.createBufferSource();
      s.buffer = this.nodes.noiseBuf;
      s.playbackRate.value = 0.9 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 300 + (1 - near) * 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.55 * near * level, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.35);
      s.connect(f).connect(g).connect(this.nodes.master);
      s.start(t0); s.stop(t0 + 0.4);
    }
    // the roll: long, low, and modulated so it comes in waves
    const dur = 2.4 + d * 0.55 + Math.random() * 1.5;
    const s2 = ctx.createBufferSource();
    s2.buffer = this.nodes.noiseBuf;
    s2.loop = true; s2.playbackRate.value = 0.35 + Math.random() * 0.2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420 / (1 + d * 0.28), t0);
    lp.frequency.exponentialRampToValueAtTime(70 / (1 + d * 0.1), t0 + dur);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t0);
    g2.gain.linearRampToValueAtTime(0.42 * level, t0 + 0.10 + d * 0.05);
    for (let i = 1; i < 5; i++) {
      const tt = t0 + dur * (i / 5);
      g2.gain.linearRampToValueAtTime(0.42 * level * (0.25 + Math.random() * 0.7)
                                      * (1 - i / 5.5), tt);
    }
    g2.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    s2.connect(lp).connect(g2).connect(this.nodes.master);
    s2.start(t0); s2.stop(t0 + dur + 0.05);
  }

  /** The horn. Held rather than triggered, because that is how it is used.
   *  The low chamber speaks first and the high one joins it about a tenth of
   *  a second later — the "buu-beee" — and on release the pressure falls
   *  away, so the pitch sags a little as it dies. */
  setHorn(on, mode = 0) {
    if (!this.on || !this.ctx) return;
    if (on === this._horn && mode === this._hornMode) return;
    this._horn = on; this._hornMode = mode;
    const n = this.nodes, t = this.ctx.currentTime;
    const set = (p, v, at, tc) => {
      p.cancelScheduledValues(at);
      p.setValueAtTime(p.value, at);
      p.setTargetAtTime(v, at, tc);
    };
    // 0 both · 1 deep only · 2 high only · 3 the whistle
    if (on && mode === 3) {
      set(n.hornGain.gain, 0.0001, t, 0.04);
      set(n.hornLo.gain, 0.0, t, 0.03);
      set(n.hornHi.gain, 0.0, t, 0.03);
      set(n.sipGain.gain, 0.075, t, 0.045);
      n.sipOsc.frequency.cancelScheduledValues(t);
      n.sipOsc.frequency.setValueAtTime(1620, t);
      n.sipOsc.frequency.setTargetAtTime(1735, t, 0.07);
      return;
    }
    set(n.sipGain.gain, 0.0, t, 0.05);
    if (on) {
      set(n.hornGain.gain, 0.42, t, 0.012);
      // both chambers together: the minor third is the horn. The high one
      // is a hair behind only because it takes marginally more pressure to
      // start, not as a deliberate sequence.
      set(n.hornLo.gain, mode === 2 ? 0.0 : 1.0, t, 0.018);
      set(n.hornHi.gain, mode === 1 ? 0.0 : 0.92, t + 0.025, 0.022);
      set(n.hornAirG.gain, 0.055, t, 0.05);
      for (const { o, f0, h } of n.hornOscs) {
        // it starts a shade flat and pulls up to pitch as pressure builds
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(f0 * h * 0.972, t);
        o.frequency.setTargetAtTime(f0 * h, t, 0.09);
      }
    } else {
      set(n.sipGain.gain, 0.0, t, 0.05);
      set(n.hornGain.gain, 0.0001, t, 0.075);
      set(n.hornHi.gain, 0.0, t, 0.050);
      set(n.hornLo.gain, 0.0, t + 0.02, 0.065);
      set(n.hornAirG.gain, 0.0, t, 0.06);
      for (const { o, f0, h } of n.hornOscs) {
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(o.frequency.value, t);
        o.frequency.setTargetAtTime(f0 * h * 0.955, t, 0.11);
      }
    }
  }

  /** Flange squeal. A wheelset in a tight curve runs the flange against the
   *  rail and the whole wheel rings; it needs speed and curvature together,
   *  so it comes and goes through the Bend rather than droning. */
  setCurve(v, curvature) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, n = this.nodes;
    // measured over the Bend: the tightest curve here is about 1.3 per km,
    // i.e. a 760 m radius, so the threshold has to sit well below that
    const tight = Math.max(0, curvature - 0.00055) / 0.00090;
    const level = Math.min(1, tight) * Math.min(1, Math.max(0, v - 6) / 16);
    n.sqGain.gain.setTargetAtTime(level * level * 0.055, t, 0.25);
    n.sqFilt.frequency.setTargetAtTime(2400 + v * 22, t, 0.4);
    n.sqFilt2.frequency.setTargetAtTime(3900 + v * 30, t, 0.4);
  }

  /** speed m/s, throttle 0..1, sunAlt radians, dayOfYear, inCutting 0..1 */
  update(v, throttle, brake, sunAlt, day, dt, paused) {
    if (!this.on || !this.ctx) return;
    if (paused) {
      const t0 = this.ctx.currentTime;
      this.nodes.rollGain.gain.setTargetAtTime(0, t0, 0.15);
      this.nodes.windGain.gain.setTargetAtTime(0, t0, 0.15);
      this.nodes.tract.gain.setTargetAtTime(0, t0, 0.15);
      return;
    }
    const n = this.nodes, t = this.ctx.currentTime, k = 0.12;
    const set = (p, x) => p.setTargetAtTime(x, t, k);

    const sp = Math.min(v / 33, 1.4);
    // the bed was too loud and too flat; make it mostly speed and let it
    // fall away to almost nothing when standing
    set(n.rollGain.gain, 0.012 + sp * sp * 0.30);
    n.rollFilt.frequency.setTargetAtTime(150 + v * 26, t, k);
    // wind was inaudible under the rolling noise: brighter, and stronger
    // wind was overpowering everything; keep it as a hint at speed only
    set(n.windGain.gain, Math.pow(Math.max(0, sp - 0.45), 2.0) * 0.10);
    n.windFilt.frequency.setTargetAtTime(520 + v * 42, t, k);

    // traction sings under power and falls away when coasting
    const load = throttle * Math.max(0.15, 1 - v / 40);
    set(n.tract.gain, load * 0.085);
    for (const { o, mult } of n.oscs)
      o.frequency.setTargetAtTime((55 + v * 7.5) * mult, t, k);

    // VVVF: the carrier steps up in stages and then goes synchronous, which
    // is the rising staircase you hear leaving a platform in a Stadler
    if (n.vvGain) {
      const kmh = v * 3.6;
      const carrier = kmh < 12 ? 300 + kmh * 12
                    : kmh < 24 ? 600 + (kmh - 12) * 8
                    : kmh < 38 ? 1200 + (kmh - 24) * 6
                               : 1284 + kmh * 5.5;
      for (const { o, mult } of n.vvOscs)
        o.frequency.setTargetAtTime(carrier * mult, t, 0.09);
      n.vvFilt.frequency.setTargetAtTime(Math.min(5200, carrier * 1.5), t, 0.12);
      // loudest under power at low speed, gone by line speed
      const vv = load * Math.max(0, 1 - kmh / 95);
      set(n.vvGain.gain, vv * 0.030);
    }

    // cicadas: high summer, daylight, and quieter once you are moving fast
    const summer = day > 150 && day < 260 ? 1 : (day > 120 && day < 285 ? 0.4 : 0);
    const warm = Math.max(0, Math.min(1, (sunAlt * 57.3 - 8) / 30));
    set(n.cicGain.gain, summer * warm * 0.05 * (1 - Math.min(0.75, sp * 0.6)));
    n.cicFilt.frequency.setTargetAtTime(4600 + Math.sin(t * 0.7) * 700, t, 0.4);
  }
}
