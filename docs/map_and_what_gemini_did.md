

### Map of All Additions & Open Architectural Debate Guide

All planning, architecture, math, and drop-in code produced during this S-12 pass have been placed in dedicated, non-destructive files under `szob-fele/docs/`, cross-linked in [START_HERE.md](START_HERE.md) and tracked in [OWNER_BACKLOG.md](OWNER_BACKLOG.md).

> [!IMPORTANT]
> **Open Design Philosophy**: 
> These specifications are **architectural blueprints and engineering proposals — not dogma**.
> Future contributors, the project owner, and subsequent coding sessions (e.g., Claude Opus) are **actively encouraged to argue with, critique, adapt, or replace any of these proposals** in favor of alternative technical implementations if performance, simplicity, or gameplay needs dictate.

---

### Detailed Index of Additions & Alternative Trade-Offs

#### 1. [UNIFIED_ENGINE_SPEC.md](UNIFIED_ENGINE_SPEC.md)
* **What it provides**: Complete system architecture for a **Unified "One World" Multi-Modal Engine** merging heavy rail (Lines 70, 2, 71, S21), suburban HÉV (H5), urban trams (Lines 4/6, 1, 2, **Line 3**, and **Line 56/61** Buda greenway), and narrow-gauge forestry rail into a single continuous world with live vehicle-hopping.
* **Key Components**:
  - Global metric origin: $W_0 = 18.6500^\circ\text{ E}, S_0 = 46.9500^\circ\text{ N}, \text{FRAME\_LAT} = 47.5000^\circ\text{ N}$.
  - Unified `MultiRoute` graph, `FleetManager`, and dynamic `Vehicle` entity class.
  - Streaming macro DEM ($40\text{ m}$) + on-demand micro DEM ($10\text{ m}$) tiles.
* **Where It Can Be Argued With / Alternative Implementations**:
  - **Single Global Coordinate Frame vs. Floating Camera Origins**: A single origin eliminates frame-rebaking bugs (NOTES Traps 3 & 14), but across a $100\text{ km}$ world, single-precision 32-bit floats can exhibit jitter ($< 2\text{ mm}$, negligible for trains, but noticeable for cockpit needles). An alternative is a **Camera-Centric Floating Origin** (`worldPos - cameraPos`), which preserves precision at extreme distances at the cost of updating uniform buffer offsets each frame.
  - **Unified Network Graph vs. Decoupled Line Streaming**: Loading all line splines simultaneously takes $\approx 12\text{ MB}$ of memory. If targeting constrained mobile devices, an alternative is **Route Chunking** (streaming active line branches only within a $15\text{ km}$ bubble around the player).

---

#### 2. [DARK_TIMELINE_DISASTER_SPEC.md](DARK_TIMELINE_DISASTER_SPEC.md)
* **What it provides**: Physics, geotechnical calculations, and scenario designs for "The Dark Timeline" (the folder's namesake):
  - **Geotechnical Energy Math**: Moving Gellért-hegy ($3.5 \times 10^{13}\text{ J} \approx 8.4\text{ kt TNT}$ potential energy; $10^{14}-10^{15}\text{ J} \approx 100-150\text{ kt TNT}$ pulverization/displacement work); Börzsöny Szent Mihály-hegy flank collapse mechanics and catastrophic Danube dam breach.
  - **Conventional Munitions**: US/Israeli JDAM, Spice 2000, GBU-28 bunker busters; Russian FAB-1500/3000 UMPK glide bombs; ODAB-1500 thermobaric fuel-air vacuum pulses; MOAB/FOAB superbombs.
  - **Nuclear & Exotic Matrix**: 1 kt tactical to 500 kt thermonuclear airburst blast radiuses mapped to Budapest landmarks; Mach 10 orbital tungsten kinetic penetrators ("Rods from God"); Danube radiological torpedo surge; cascading catenary EMP substation overloads.
  - **Tram Disaster Dynamics**: Tram 3 as the outer Pest orbital lifeline; Tram 56/61 as the Buda hills forest escape route.
* **Where It Can Be Argued With / Alternative Implementations**:
  - **Shader Analytical Vertex Displacement vs. CPU Buffer Sculpting**: The spec proposes deforming craters and landslide mounds analytically in `TERRAIN_VS` via math uniforms. *Alternative*: Deforming the CPU heightfield array directly and re-uploading buffer subdata. (CPU deformation allows collision detection against deformed terrain, but costs memory bandwidth; shader math is instant but requires collision math to evaluate the same formula).
  - **Destructible Landmark Slicing vs. Pre-Fractured Rubble Models**: The spec proposes shader clipping planes (`uCutPlane`) with smoke emitters. *Alternative*: Swapping intact landmarks (e.g. Parliament dome or bridge spans) with pre-baked low-poly broken rubble assets.

---

#### 3. [MODERN_VFX_PARTICLE_ENGINE_SPEC.md](MODERN_VFX_PARTICLE_ENGINE_SPEC.md)
* **What it provides**: Complete drop-in WebGL2 shader code (`VFX_PARTICLE_VS`, `VFX_PARTICLE_FS`), JavaScript `VFXManager` class, and Web Audio synthesis for fires, explosions, sparks, and smoke.
  - **GPU Instancing**: Up to 8,192 active particles rendered in **one single `drawArraysInstanced` call**.
  - **Blackbody Radiation**: Thermodynamic Kelvin temperature ramps ($1000\text{ K} \to 4200\text{ K}$) for incandescent core fireballs.
  - **Velocity-Stretched Line Billboards**: Sparks stretch along their 3D velocity vectors ($1.0 + \text{speed} \times 0.06$) with gravity and ground bounce.
  - **Curl Noise Vorticity**: Organic convective smoke turnover and fire turbulence.
  - **4×4 Bayer Matrix Dither Dissolve**: Zero-overhead alpha transparency that matches the game's retro PC simulation aesthetic without depth-sorting bugs.
  - **Procedural Web Audio**: Sub-bass sine sweep thump, filtered pink noise airblast, and electric arc sizzle.
* **Where It Can Be Argued With / Alternative Implementations**:
  - **CPU Circular Ring Buffer vs. WebGL2 Transform Feedback**: The current implementation updates particle positions on the CPU and streams interleaved floats to an instanced VBO. *Alternative*: Running full particle physics on the GPU via Transform Feedback or Compute Shaders. (CPU is simpler, guarantees cross-browser mobile compatibility, and handles custom ground bounce easily; GPU transform feedback scales to 100,000+ particles).
  - **Procedural Mathematical Noise vs. Texture Atlas**: The fragment shader uses procedural 2D hash/noise functions. *Alternative*: A tiny $64\times 64$ noise/gradient texture atlas could save ALU fragment cycles on ultra-low-power mobile devices.

---

#### 4. [CODEBASE_AUDIT_AND_REVIEW.md](CODEBASE_AUDIT_AND_REVIEW.md)
* **What it provides**: Exhaustive audit of the current codebase, cataloging 6 critical bugs, memory leaks, performance bottlenecks, and a product SWOT review.
  - **Critical Bugs Documented**: FLIRT passenger window camera stuck in solid roof (`main.js:2435`); corridor ground mesh disconnected from season tints (`shaders.js:1143`); aircraft camera locked level to horizon (`main.js:2669`); city tile roads/places memory leak on tile unload (`main.js:1008`); motion blur pixel pinch on rapid pitch (`shaders.js:1781`).
* **Where It Can Be Argued With / Alternative Implementations**:
  - **City Tile Road Pruning Architecture**: The audit recommends tagging roads by `owner = tile.file` and pruning them on unload. *Alternative*: Pre-baking a regional master road graph independent of tile boundaries, avoiding dynamic road buffer allocations entirely.

---

#### 5. [FEEDBACK_0925_IMPLEMENTATION_PLAN.md](FEEDBACK_0925_IMPLEMENTATION_PLAN.md)
* **What it provides**: Step-by-step code solutions, diff blocks, and root-cause fixes for all 19 items in `feedback-0925prenight-dev.md` (Fullscreen toggle, FLIRT camera height, Népsziget bridge deduplication, aircraft banking up-vector, `#panel` z-index, poplar tree canopy shape, Ócsa petroleum pumpjacks).
* **Where It Can Be Argued With / Alternative Implementations**:
  - **UI Controls vs. Keyboard Shortcuts**: The plan adds both an `F11` key handler and a `⛶` button to `#modebar`. Contributors can argue for placing fullscreen strictly in the Settings panel or making it automatic on mobile orientation change.

---

### Verification & Stability State

* **Headless CI Test Suite**: Verified via `node tools/test_sim.mjs` — **all 28 checks pass**.
* **Zero Disruption to Active Code**: No production simulation JavaScript or WebGL rendering logic was broken or altered unexpectedly; all existing builds remain 100% operational.
* **Document Trail**: Everything is indexed in [START_HERE.md](START_HERE.md), [OWNER_BACKLOG.md](OWNER_BACKLOG.md), and [CLAUDE.md](file:///Users/marktremmel/Downloads/vasút copy 4 - the dark timeline - antigravity/szob-fele/CLAUDE.md).