# Testing Szob felé

What to check, how to check it, and what the answer should be. Written because
this project is largely *visual*, and a visual bug is easy to see and hard to
describe — so most of what follows turns "it looks wrong" into a number.

Two rules learned the hard way:

- **Look before measuring.** Four separate theories about the city speckle were
  each disproved by a careful measurement of the wrong thing. One screenshot at
  close range showed what it actually was in five seconds.
- **A truncated result is not a negative result.** A search that prints its
  first dozen hits and finds nothing has found nothing *in the first dozen
  hits*. Print counts.

---

## 1. Getting it running

    cd szob-fele
    python3 tools/build_sim.py          # ~0.3 s, writes dist/

`.claude/launch.json` starts a no-cache server on 8177 serving `dist/`. Open
`http://localhost:8177/`.

Rebuilding raw data is in the README. **The one command that must never be run
bare is `bake_world.py`** — without `SZOB_KM=0,63.6` it rebakes the Danube Bend
alone and silently moves the local frame that `route.json`, `context.json` and
the map are all expressed in. If it happens, rerun the whole chain:

    SZOB_KM=0,63.6 python3 tools/bake_world.py
    SZOB_KM=0,63.6 python3 tools/bake_route.py
    python3 tools/bake_context.py
    python3 tools/bake_map.py
    SZOB_KM=0,63.6 python3 tools/bake_timetable.py
    python3 tools/build_sim.py

---

### The headless checks

    node tools/test_sim.mjs             # under a second; exits 1 on a failure; CI runs it

No browser, no WebGL: the simulation modules (`route`, `traffic`, `score`,
`missions`, `collide`) are imported straight from `web/src` (the
`web/src/package.json` marks them as ES modules for node). It checks braking
distances (KISS 282 m, freight 648 m from 80 km/h on full service), a
hand-driven stop recorded where the train stood and a missed stop 60 m past
the mark, scoring, six simulated hours of traffic on lines 70, 2 and S21
with no train running into another, the collision world, and that every
mission's stops exist on its line. It does not set up single-track working,
which `main.js` works out from the yard layer.

A module that uses a name from another module without importing it works in
the flattened build and fails here. That is how `CAR_LEN` and `CAR_H` in
`traffic.js` were found.

## 2. The five-second checks

By hand, in the running sim:

| | | expect |
| --- | --- | --- |
| `,` and `.` | step between stations | the banner names the stop and clears itself after a few seconds |
| `shift+C` | free camera | detaches where you are; WASD, R/F up and down, shift to hurry |
| `U` | hide everything | panel and read-outs go; the corner button stays faintly visible |
| `O` | overhead line | masts and wire appear and disappear |
| `Tab` | the map | fits the window in **both** directions, whatever its shape |
| Beállítás → Élesség | internal resolution | 0.6 is chunky, 2.6 is nearly native; frame time barely moves |
| Beállítás → Animáció | the animator | clock, date and sky all drift on their own |
| Beállítás → Frontok | a moving front | rain on one side of the line, clear on the other |

---

## 3. The console harness

`window.SIM` is the handle. The useful parts:

    SIM.tick(t)            step one frame by hand at timestamp t; the ONLY way
                           to drive the sim in a hidden tab, where rAF never fires
    SIM.step(n, ms)        n frames, ms apart (50 ms is the most one frame
                           simulates; state.speedMul multiplies it)
    SIM.solids             the collision world: .at(x, y, n), .topAt(x, n),
                           .push(x, n, y, r), .count
    SIM.railDistAt(x, n)   {d, railY, m}: distance to the line, rail height, chainage
    SIM.demAt(x, y)        ground height anywhere — when something does not
                           appear, this is the first question
    SIM.coverAt(x, y)      land cover class (9 is water, 13 park)
    SIM.state              everything: .show.*, .front, .fly, .cine, .wx
    SIM.driver / .route / .traffic / .playerTrain
    SIM.dyn()              vertex counts of the per-frame meshes

### Drive the whole line, in four weathers, day and night

The standing regression. Should report `ok: true` and about 4–6 ms a frame.

```js
(() => {
  const s = window.SIM, bad = [];
  let t = performance.now();
  const step = n => { for (let i = 0; i < n; i++) { t += 16.7; s.tick(t); } };
  for (const wx of ["derult", "gomolyos", "zivatar", "havazas"]) {
    s.state.wxId = wx; window.__syncWx && window.__syncWx();
    for (const hour of [9, 22]) {
      s.state.hour = hour; s.traffic.seekTo(hour * 3600);
      for (const st of s.data.stops) {
        s.driver.m = st.km * 1000; s.playerTrain.m = s.driver.m; s.driver.v = 0;
        step(3);
        if (!isFinite(s.driver.m) || !isFinite(s.state.wx.gloom)) bad.push([wx, hour, st.name]);
      }
    }
  }
  s.state.speedMul = 16; s.driver.m = 500; s.playerTrain.m = 500;
  const t0 = performance.now(); step(600);
  return JSON.stringify({ ok: !bad.length, bad, boot: s.state.bootMs,
                          msPerFrame: +((performance.now() - t0) / 600).toFixed(2) });
})()
```

### Counting speckle

The instrument that eventually found the shimmer. It counts pixels that differ
sharply from **both** horizontal neighbours — a lone dot, which is what
z-fighting, a degenerate normal and an aliased grid all look like.

The stride matters: the world renders small and is point-upscaled, so one
internal pixel is a block several screen pixels wide. Comparing adjacent screen
pixels inside one block always reports zero, which is how this instrument lied
the first time it was used.

```js
(() => {
  const s = window.SIM;
  const cv = document.getElementById("gl"), gl = cv.getContext("webgl2");
  const W = cv.width, H = cv.height, p = new Uint8Array(W * H * 4);
  const sx = Math.max(1, Math.round(W / 690));      // one internal pixel
  let t = performance.now();
  const grab = () => { for (let i = 0; i < 6; i++) { t += 16.7; s.tick(t); }
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, p); };
  const speckle = () => { let n = 0, tot = 0;
    for (let y = 40; y < H - 40; y += 2) for (let x = sx; x < W - sx; x += sx) {
      const L = a => { const i = (y * W + a) * 4;
                       return p[i]*0.3 + p[i+1]*0.59 + p[i+2]*0.11; };
      const l = L(x), a = L(x - sx), c = L(x + sx); tot++;
      if ((l - a > 20 && l - c > 20) || (a - l > 20 && c - l > 20)) n++; }
    return +(n / tot * 100).toFixed(2); };
  const out = {};
  grab(); out.all = speckle();
  for (const k of ["polys", "boxes", "veg", "roads", "track", "catenary", "structs"]) {
    s.state.show[k] = false; grab(); out["without_" + k] = speckle();
    s.state.show[k] = true;
  }
  return JSON.stringify(out);
})()
```

**Read it as a subtraction.** Whichever layer's removal collapses the number
owns the artefact. On a clean build every figure should sit within a few
hundredths of `all`. The city walls measured 3.57 before the polygon normals
were fixed and 0.02 after.

*Freeze everything that moves first* — hold `driver.m` inside the tick loop,
and switch off `roads` if you are not testing them, since that toggle also
governs the road vehicles.

### Did that actually change anything?

Two frames separated by a controlled change, differenced per pixel. This is how
the cloud shadows on buildings were confirmed (10.5 luma of change under moving
cumulus against 0.15 under a clear sky, and 0.00 between two identical frames).

The control matters more than the measurement: **always take the null case**.
Two identical frames must differ by 0.00, or the instrument is measuring
something else — a moving train, a vehicle, the clock.

---

### Play a mission by script

Missions and the scorecard, without a human (the preview tab is usually
hidden, so `SIM.step`, not waiting):

    document.getElementById('mMission').click();
    document.querySelector('#missions .mc[data-id="m70-elso"]').click();
    const d = SIM.driver, S = SIM.state; S.speedMul = 4;
    const bot = () => { const st = d.targetStop(), dist = st ? (st.km*1000 - d.m) * SIM.route.dir : 1e9;
      const cap = Math.min(SIM.route.limitAt(d.m)/3.6 - 1, Math.sqrt(2*0.5*Math.max(0, dist - 3)));
      if (d.dwell > 0) return d.setLever(0);
      if (dist < 40 && d.v < 2) d.setLever(dist > 1.5 ? (d.v < 0.8 ? 2 : -1) : -4);
      else d.setLever(d.v < cap - 1 ? 5 : d.v > cap + 0.3 ? -5 : 0);
      if (d.vigWarn > 0 || d.vigT < 5) d.acknowledge(); };
    for (let i = 0; i < 6000 && !S.finished; i++) { bot(); SIM.step(1, 50); }
    S.run.result()          // mission 1 this way: three stops within 2 m, 100%, three stars

Use `d.targetStop()`, not `SIM.route.nextStop()`: the latter moves on to the
following station 30 m before the mark.

## 4. Known-good figures

Measured on Mark's machine, 24 Aug 2026. Treat as orders of magnitude.

| | |
| --- | --- |
| build | 0.3 s, ~420 KB of JS, 11.1 MB bundled |
| boot | 0.6–2 s, drifting up over a long session of reloads — not understood |
| frame | 4–6 ms of CPU at ×16 through the city |
| structures | 201 within 2.4 km |
| road ways | 6135, of which 17 cross the railway and 34 pass under it |
| polygons | 13132 footprints, 84331 triangles |
| boxes | 62957 |
| catenary | 254k vertices, 38 ms to build |
| speckle | ≤ 0.05% anywhere |

---

## 5. Where to point the camera

Things worth looking at, and what is wrong with them if it is wrong. Fly with
`shift+C`; the coordinates are the local frame, `SIM.state.fly.p = [x, y, -z]`.

| what | where | should be |
| --- | --- | --- |
| Nyugati trainshed | km 0.3, looking back | a vault along the building's own walls, hollow, glazed at the buffer end |
| the throat | km 0.5–1 | portals over the track groups, not 90 m gantries |
| Ferdinánd híd | km 0.54 | a deck **over** the throat, not sitting on it |
| Margitsziget | `[20900, 250, -7600]` | an island, green, dry, with buildings on it |
| the incinerator | km 10, 1.1 km east | a 120 m banded stack |
| Dunakeszi works | km 17.5, 200 m east | halls at 15–18 m, not 9 |
| the cement works | km 39, 650 m east | a 66 m chimney and tanks |
| Vác | km 31–34 | canopy, lamps, people, portals |
| the Bend | km 45–58 | the part that already works — use it as the reference |

---

## 6. Traps that have caught us

Full list in NOTES.md. The ones that cost most:

1. **Geometry built is not geometry drawn.** Grep for the `drawArrays` before
   debugging the maths.
2. **Check the bounding box of every raw file.** Not all of `data/raw` covers
   the same extent.
3. **`bake_route` sets the local frame.** Change the window and everything
   baked against the old origin is silently offset and still looks plausible.
4. **The DEM is a *surface* model.** "Ground" beside a city street is a roof.
5. **One flat scope, one namespace.** The bundler refuses duplicate top-level
   names now, which turns a blank screen into a one-line error.
6. **Sub-pixel detail is not detail.** Below one pixel a wire, a window or a
   road marking becomes noise. Draw it thicker or fade it to its own average.
