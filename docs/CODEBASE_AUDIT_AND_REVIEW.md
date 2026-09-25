# Codebase Audit, Architectural Deep Dive & Product Review
*Dunakanyar Szimulátor (MÁV Line 70, Line 2, S21, and Budapest Agglomeration)*
*Date: 25 September 2026*

---

## 1. Executive Summary

*Dunakanyar Szimulátor* is a masterclass in artisanal, dependency-free web engineering. It avoids heavy 3D game engines (Unity, Unreal, Godot, Three.js, Babylon.js) in favor of raw WebGL2, vanilla ES modules, and a Python offline data baking pipeline.

It bridges two traditionally separate worlds:
1. **Hard Geographic & Operational Data**: OpenStreetMap geometries, SRTM elevation grids, Budapest BP Fatár tree registries (304,000 trees), and official MÁV timetables.
2. **Evocative Late-90s Simulation Aesthetics**: Crisp pixel dither, ordered 4×4 Bayer matrix shading, multi-layered cloud decks, and pure procedural Web Audio sound synthesis.

However, as features rapidly accumulated over successive passes (S-1 through S-11), technical debt, architectural anomalies, memory leaks, and subtle rendering/camera bugs emerged. This document provides a comprehensive audit of the code, catalogs real bugs and performance bottlenecks, and charts the strategic path toward the Unified "One World" engine.

---

## 2. Codebase Architecture & Anatomy

### 2.1. File Hierarchy & Separation of Concerns

```
szob-fele/
├── web/
│   ├── index.html            Shell, UI markup, modal dialogs, bootstrap loader
│   ├── src/                  Modular ES6 simulation source (flattened at build)
│   │   ├── main.js           Engine lifecycle, frame loop, cameras, render passes (~3,600 LOC)
│   │   ├── shaders.js        All GLSL shader programs (Terrain, Track, Facades, Sky, Clouds, Post) (~2,500 LOC)
│   │   ├── geom.js           Procedural meshes (track, ballast corridor, platforms, people, bridges) (~1,900 LOC)
│   │   ├── traffic.js        AI railway timetable, block signalling, single-track loops, road traffic (~1,400 LOC)
│   │   ├── landmarks.js      Hand-modelled architectural monuments anchored to OSM polygons (~1,300 LOC)
│   │   ├── audio.js          Synthesized sound engine (VVVF inverters, horns, flange squeal, joint clicks) (~570 LOC)
│   │   ├── route.js          Spline interpolation, tractive effort, Davis resistance, brakes, EVM (~340 LOC)
│   │   ├── trains.js         Multi-car rolling stock meshes (KISS, FLIRT, V43, 1116, M44, freight) (~620 LOC)
│   │   ├── city.js           Dynamic Budapest tile streaming (540 tiles, 1km grid)
│   │   ├── kisvasut.js       Királyréti 760mm narrow-gauge Mk48 diesel forestry railway
│   │   ├── aircraft.js       AI light aircraft/jets and player flyable aircraft (Cessna, Gripen, Heli)
│   │   ├── car.js            Drivable player automobile and surface snapping physics
│   │   ├── collide.js        25m spatial hash grid for polygon collision and roof landing
│   │   ├── score.js          Driving score evaluator (punctuality, comfort, stopping accuracy)
│   │   ├── missions.js       Licence grades, scenario missions, daily challenge
│   │   └── cab.js / hud.js   Desk instrument rendering, 2D overlay graphics, EVM repeater
│   └── data/                 Baked runtime assets (JSON descriptors + PNG height/cover maps)
├── tools/                    Offline Python survey & bake pipeline
│   ├── build_sim.py          Flat bundler with top-level namespace clash detection
│   ├── bake_world.py         SRTM elevation & land-cover raster generator
│   ├── ground_filter.py      Morphological opening to eliminate buildings from DEM surface model
│   ├── bake_context.py       OSM building/road classifier and spatial extractor
│   ├── bake_city.py          Budapest urban tile subdivider (t_i_j.json)
│   ├── bake_trees.py         BP Fatár tree cadastre converter
│   └── test_sim.mjs          Headless Node.js automated test suite (28 CI checks)
└── docs/                     Architectural and operational documentation
```

### 2.2. The Build & Flattening Pipeline (`tools/build_sim.py`)
Rather than relying on Webpack or Rollup, `build_sim.py` reads `ORDER` array in `web/src/`, strips `import`/`export` keywords with regular expressions, rewrites `S.NAME` to `NAME`, scans for duplicate top-level identifiers to prevent scope pollution, and inlines the script into `dist/szob-fele.html` and `index.html`.

*Architectural Fragility*: Because every module collapses into **one flat global scope**, no two modules can share a top-level `const`, `let`, or `function` name. Past crashes occurred when `catenary.js` and `structures.js` both defined `STEEL`.

---

## 3. Bug Hunt & Technical Anomalies

### 3.1. [CRITICAL BUG] FLIRT Passenger Camera Sits in Roof Emptiness
*   **File**: `web/src/main.js` (Lines 2434–2442)
*   **Symptoms**: Pressing `Y` (Passenger window seat) while driving the MÁV 415 FLIRT shows an empty void or solid ceiling with no windows.
*   **Root Cause**:
    ```javascript
    const carLen = 25.0; // Hardcoded to KISS car length (FLIRT is 18.5 m!)
    const mc = driver.m - route.dir * (carLen * ps.car + carLen * 0.5 + 1.5);
    eye = [c[0] + rx * off, c[2] + 3.15, -(c[1] + ry * off)]; // Hardcoded to KISS upper deck!
    ```
    In `trains.js`, FLIRT's single-deck window band runs from $1.22\text{ m}$ to $2.22\text{ m}$ above the rail, with a roof chamfer at $3.80\text{ m}$. At $c[2] + 3.15\text{ m}$, the camera floats into the solid ceiling shell, looking out into nothingness.
*   **Fix**: Derive `carLen` and `eye.y` dynamically from `CAR_LEN[driver.stock.stock]` and set FLIRT eye level to $c[2] + 1.75\text{ m}$.

---

### 3.2. [RENDER BUG] Corridor Ground Color Disconnected from Seasons
*   **File**: `web/src/shaders.js` (Line 1143) & `web/src/main.js` (Line 2751)
*   **Symptoms**: Changing the season to autumn or winter turns the distant mountains brown/copper, but the ground directly next to the train remains bright summer green.
*   **Root Cause**: The track corridor mesh ($124\text{ m}$ wide on each side of the line) is rendered using `TRACK_VS` and `TRACK_FS`. While `TERRAIN_FS` modulates its base color using the `uniform vec4 uSeason;` vector, `TRACK_FS` **completely lacks the `uSeason` uniform**. Vertices use fixed vertex colors from static `COVER_COL`, so ground beside the train never reacts to seasons.
*   **Fix**: Add `uniform vec4 uSeason;` to `TRACK_FS` and multiply ground fragments by seasonal autumn/winter/spring tint curves matching `TERRAIN_FS`.

---

### 3.3. [FLIGHT DYNAMICS BUG] Aircraft Camera Locked Level to Horizon
*   **File**: `web/src/main.js` (Line 2669)
*   **Symptoms**: Banking or rolling the plane with `A`/`D` causes the aircraft mesh to roll, but the cockpit view and outside world never tilt, making aerobatic flight and tight turns disorienting.
*   **Root Cause**:
    ```javascript
    const view = M4.lookAt(camEye, at, [0, 1, 0]);
    ```
    The look-at matrix hardcodes world-up `[0, 1, 0]` for every view in the game, ignoring the flight physics roll parameter `pl.roll` from `aircraft.js`.
*   **Fix**: Compute `camUp` by rotating `[0, 1, 0]` around the camera forward vector by `pl.roll`.

---

### 3.4. [MEMORY LEAK] City Tile Roads and Places Never Pruned
*   **File**: `web/src/main.js` (Lines 1008–1010, 1025–1030, 1059–1060)
*   **Symptoms**: Memory usage steadily climbs after flying or driving across Budapest for extended periods; frame times gradually degrade.
*   **Root Cause**: When a city tile is loaded, `roadTraffic.addWays(keep)`, `addDriveWays(keep)`, and `routeData.places.push(...)` append data to global arrays. When a tile is dropped out of camera range ($> 4.4\text{ km}$), `free()` releases the WebGL VAOs and removes solids from `Solids`, but **never removes the ways from `roadTraffic.ways` or `routeData.places`**. Roads accumulate indefinitely in the simulation loop.
*   **Fix**: Tag road segments with `owner = tile.file` and prune them in the tile free callback.

---

### 3.5. [POST-PROCESSING ARTIFACT] Motion Blur "Pixel Pinch" on Rapid Pitch
*   **File**: `web/src/shaders.js` (Lines 1781–1796)
*   **Symptoms**: Tilting the camera rapidly up and down causes pixels to violently pinch and smear together toward the center.
*   **Root Cause**: The motion blur reprojection computes:
    ```glsl
    vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0);
    wp /= wp.w;
    vec4 pp = uPrevVP * wp;
    vec2 vel = (vUv - (pp.xy / pp.w * 0.5 + 0.5)) * uFx.x;
    ```
    When `dz == 1.0` (sky background) or when `pp.w <= 0.0` (world point behind previous camera frustum), $pp.xy / pp.w$ yields extreme or inverted values, generating massive velocity vectors across the screen.
*   **Fix**: Clamp `vel = vec2(0.0)` whenever `dz >= 0.9999` or `pp.w <= 0.001`.

---

### 3.6. [UI OVERLAP BUG] Sightseeing / Modebar Collides with Settings Tabs
*   **File**: `web/index.html` (Lines 85, 267, 391)
*   **Symptoms**: On small viewports or touch devices, the settings tab in `#panel` cannot be clicked because the camera mode buttons sit directly on top.
*   **Root Cause**: `#modebar` has `z-index: 7` while `#panel` has `z-index: 5`. When the modebar wraps, it intercepts pointer events intended for `#tabs`.
*   **Fix**: Increase `#panel` to `z-index: 15` and add left margin to prevent horizontal collision.

---

### 3.7. [LOGIC OVERSIGHT] Line S21 Operating Incorrect Rolling Stock
*   **File**: `szob-fele/web/data/timetable_s21.json` & `web/src/route.js`
*   **Symptoms**: Line S21 runs an electric Stadler FLIRT all the way to Lajosmizse.
*   **Reality**: Kőbánya-Kispest to Lajosmizse is **non-electrified single-track diesel territory**. In reality, MÁV operates the **Class 416 (Metrovagonmash RA-V "Uzsgyi")** two-car diesel multiple unit (as seen in owner feedback images 48 & 49) or classic M41 "Csörgő" locomotive-hauled trains.

---

## 4. Performance & Bottleneck Analysis

### 4.1. Garbage Collection Thrashing in the Frame Loop
In `main.js` (lines 2785–2825), the following dynamic meshes are rebuilt every single frame:
*   `buildSignals()` allocates dynamic arrays and a `new Float32Array`.
*   `buildTrains()` allocates quad lists, normal vectors, and typed arrays.
*   `buildRoadTraffic()` allocates geometry for 200+ vehicles.

*Impact*: Millions of short-lived float allocations per minute trigger periodic V8 minor GC collections, visible as subtle 10–15 ms micro-stutters when driving through dense traffic.
*Optimization*: Pre-allocate static ring buffers (`Float32Array(MAX_VERTICES)`) and populate them in-place with offset pointers.

### 4.2. Unrolled Streetlight Loop in Fragment Shaders
`STREETLIGHT_GLSL` loops up to 48 times per fragment in `TERRAIN_FS`, `TRACK_FS`, and `MODEL_FS`:
```glsl
for (int i = 0; i < 48; i++) {
  if (i >= uSLn) break;
  ...
}
```
*Impact*: On mobile GPUs (Apple A-series, Qualcomm Adreno, Mali), dynamic unrolled loops with distance calculations across full-screen geometry cause substantial fillrate thermal throttling at night.
*Optimization*: Reduce active light count on lower quality presets (`uSLn = 12` on mobile/low quality, `uSLn = 48` on high quality).

---

## 5. Product Evaluation: Strengths, Weaknesses & Strategic Opportunities

### 5.1. Strengths (What Makes the Sim Great)
*   **Geographic Integrity**: The railway alignment is real, the stations are at their true kilometer posts, and the heights correspond to real topography.
*   **Atmospheric Audio Engineering**: Synthesizing the Stadler FLIRT $B\flat_4 / D\flat_5$ minor-third horn, the frequency-stepped VVVF traction hum, and curve flange squeal from pure oscillators without loading audio samples is a stroke of genius.
*   **Balanced Visual Styling**: The ordered 4×4 dither, procedural façades, and physical cloud decks create a warm, nostalgic aesthetic that sets it apart from generic commercial simulators.
*   **Deep Physics**: Master controller, electrodynamic vs. air brake propagation lag, Davis aerodynamic drag with headwind vectors, and EVM-120 vigilance create legitimate train handling depth.

### 5.2. Weaknesses (Friction Points)
*   **Line Fragmentation**: Having to select `?line=line2` or `?line=s21` and reload the page fractures the experience. Budapest's railway network is deeply interconnected.
*   **Sparse Rural Landscaping**: Beyond the railway corridor and Budapest city tiles, countryside areas occasionally feel empty due to strict query bounds.
*   **UI Discoverability**: Key bindings and features are rich, but without a dedicated full-screen mode or clear touch HUD icons, new users can feel lost.

### 5.3. Strategic Opportunities (The Future Roadmap)
1.  **The Unified "One World" Multi-Modal Engine**: Merging all lines into one seamless world using the master coordinate frame defined in `UNIFIED_ENGINE_SPEC.md`.
2.  **Budapest Urban Trams (Lines 4/6, 1, 2)**: Bringing the yellow Combinos and CAFs to life along the Grand Boulevard and Árpád Bridge.
3.  **Authentic S21 Diesel Experience**: Introducing the MÁV 416 "Uzsgyi" diesel railcar with authentic diesel rumble synthesis.
4.  **Interactive 3D Cab Switches**: Allowing players to reach out and toggle the desk switches (horns, lights, wipers, reverser) directly.

---

## 6. Actionable Handoff Guide

| Priority | Task | File Target | Difficulty |
| :--- | :--- | :--- | :--- |
| **P0** | Add Fullscreen Toggle (`F11` and `⛶` button) | `web/index.html`, `web/src/input.js` | 15 mins |
| **P0** | Fix FLIRT Passenger Window Camera Height & Car Length | `web/src/main.js:2435` | 10 mins |
| **P0** | Add `uSeason` to `TRACK_FS` for seasonal corridor ground color | `web/src/shaders.js:1143`, `web/src/main.js` | 20 mins |
| **P0** | Fix UI `#panel` z-index collision with `#modebar` | `web/index.html:85,267,391` | 10 mins |
| **P1** | Add aircraft banking roll to camera `uVP` up-vector | `web/src/main.js:2669` | 15 mins |
| **P1** | Fix motion blur reprojection pinch on rapid pitch | `web/src/shaders.js:1784` | 10 mins |
| **P1** | Refine tree shader poplar shape and trunk contrast | `web/src/shaders.js:1528,1670` | 20 mins |
| **P2** | Deduplicate Északi összekötő bridge & deepen underwater piers | `tools/bake_context.py`, `web/src/landmarks.js:780` | 30 mins |
| **P2** | Model MÁV 416 "Uzsgyi" diesel railcar for Line S21 | `web/src/trains.js`, `web/src/audio.js` | 2 hours |
| **P3** | Implement Unified "One World" Engine architecture | See `docs/UNIFIED_ENGINE_SPEC.md` | Multi-phase |
