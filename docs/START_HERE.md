# Start here

For anyone picking this project up: the owner, a new contributor, or an LLM
session with no memory of earlier ones. Written 25 Sep 2026. It replaces
nothing; the older documents are still there (see "The other documents").

## What this is

**Dunakanyar Szimulátor** (repo `vonat-sim-budapest`) is a browser train simulator of Budapest's
suburban railways: line 70 (Nyugati–Vác–Szob), line 2 (Nyugati–Pilis–Esztergom) and S21 (Nyugati–Lajosmizse).
- It is built from OpenStreetMap and elevation data.
- It uses hand-written WebGL2, has no dependencies, and uses a Python bake pipeline.
- Live: https://marktremmel.github.io/vonat-sim-budapest/ (`?line=line2`, `?line=s21`).

Around the trains there is a whole region:
- Budapest streamed in tiles, with the city's real trees;
- road traffic, ships and aircraft;
- a drivable car and flyable planes;
- weather and seasons;
- missions, a photo mode, HU/EN.

## Current session

- **What to do next:** [ROADMAP.md](ROADMAP.md) has the stages, and [OWNER_BACKLOG.md](OWNER_BACKLOG.md) is the list of record.
- **The current session:** `SESSION_S19.md` (14 Oct, by Antigravity, rewritten after review: hero / on-foot mode with a blast, the map that opens and drops a pin, tram stop names, re-baked maps; §7 lists the eight bugs the review fixed).
- **Before it:** `SESSION_S18.md` (13 Oct: animated 3D pedestrian models, street furniture, picture tests, bus & horse models, Bzmot).
- **The one before:** `SESSION_S17.md` (12 Oct: Kopár-hágó tunnel, Pázmáneum, Nagykörút traffic fix, tram bar, graffiti).
- **27–28 Oct, pushed together on 28 Oct:** `LEAF_TREES.md` (near trees as leaves on wood, with crown light and per-leaf seasons), `FACADE_KIT.md` (making and cutting façade sheets, all prompts, depth and reflections), `FACADE_PLAN.md` (which family goes where: districts, towns, MÁV colonies; built), `STREET_DETAIL.md` (tram wires and poles, pavements and road texture, smoother ground, streams and ditches, stops, shelters, bins and fences from OSM, fewer labels, grass and crops). Also line 2's trains no longer drawn through each other, the passenger-view sky wobble, and idle and pacing platform people (`OWNER_BACKLOG.md` → "28 Oct").
- **The façade sheets themselves** (`art/facade_kit/`, 379 MB) are not in git: only the cut atlas in `web/data/` is. Keep a copy of `art/` outside the repo; the cutter needs it to rebuild the atlas.


## Read in this order

1. **This file.**
2. **[ROADMAP.md](ROADMAP.md)**: the feedback grouped into stages, and the recommended order.
3. **[OWNER_BACKLOG.md](OWNER_BACKLOG.md)**: every request the owner made, with its status. **This is the to-do list.** Pick work from here, and update it when you finish.
4. **[HISTORY.md](HISTORY.md)**: what happened when, and what was tried and reverted.
5. **`../NOTES.md` → Traps only** (items 1–16). Each one cost real time. Skip the rest of NOTES.md; it is the August history.
6. The rest when you need it. `../README.md` is the long explanation of each subsystem: accurate, but written as a narrative.

## Working rules (from the owner)

- **Git:** commit or push only after the owner has reviewed the running build and says so.
- **Accuracy:** from OSM/Overpass data. Don't invent buildings. If data is missing, say so.
- **Docs:** plain, verified statements. Say what was not checked. The owner reads them. Don't pad.
- **Assets:** the purchased packs are in `~/Downloads/` (GGBot cars, Designsoup stickers, "Textures and PSX models", cortino, utilizator2011).
  - Use and modify them freely.
  - Commit only the derived atlases and meshes, never the raw files.
  - Credit the authors in the README.
  - No "PSX look".
- **Style:** light pastel, low internal resolution, 16/32-bit feel. Present-day stock. Szob is the end of line 70. The browser, not an engine.
- **Language:** every UI string goes through `tt(hu, en)` (`web/src/i18n.js`) or `data-en` attributes.
- **Be kind to data servers:** Overpass mirrors and BP Fatár throttle. Cache everything under `data/raw/`.

## Build, run, test

    cd szob-fele
    python3 tools/build_sim.py        # flattens web/src into index.html (root) and dist/; ~1 s
    node tools/test_sim.mjs           # 28 headless checks; CI runs it (.github/workflows/test.yml)

- **Serve over HTTP** (the loader fetches `web/data/*`). `.claude/launch.json` has `pages-root` on port 8178, which serves the repo root the way GitHub Pages does.
- **Pages** serves the committed root `index.html` and `web/data/` as they are. Build before committing.
- **Preview-browser tricks:**
  - `SIM.step(n, ms)` steps frames in a hidden tab.
  - `SIM.demAt(x, north)` gives the ground height.
  - `SIM.kisvasut()`, `SIM.city()`.
  - The `look(T, E)` helper is in CLAUDE.md.
  - A hidden preview pane gives stale screenshots. Instead, read the canvas right after `SIM.step` in the same script (`drawImage` → `toDataURL`) and POST it to a small local receiver.

## How it fits together

**Frames (the #1 source of bugs).**
- Baked data is metres **east, north** from line 70's near-region SW corner.
- The WebGL world is x east, y up, **z = −north**.
- Each line has its own frame (`web/data/world_<line>.json`).
- Metres per degree come from `near.frame_lat`. Never from the window's middle (Trap 14).
- A heightmap pixel is sampled at its centre (Trap 12).

**Runtime** (`web/src/`; bundle order in `tools/build_sim.py ORDER`):

| file | owns |
| --- | --- |
| `main.js` | Boot, the frame loop, cameras, all draw passes, photo mode, the city-tile build callback. The big one (~3,900 lines). |
| `shaders.js` | All GLSL: terrain, track/buildings (`FACADE_GLSL`), vegetation (`VEG_VS`, `TREE_VS`, `VEG_FS`), water, sky, clouds, the post blit (DOF, motion blur, AO, grading), car models. |
| `foliage.js` | The near trees as leaves on wood: template mesh, transform-feedback placement, leaf shaders (`docs/LEAF_TREES.md`). The far trees and the shared placement and colours (`VEG_PLACE_GLSL`, `VEG_PAL_GLSL`) stay in `shaders.js`. |
| `route.js` | `Route` (the baked track by chainage) and `Driver` (train physics, master controller, brakes, EVM). `STOCKS`. |
| `traffic.js` | Timetabled trains and signals; `RoadTraffic` (cars); `RiverTraffic` (ships). |
| `trains.js` | Procedural train meshes (KISS, FLIRT, EC, freight, locos). |
| `geom.js` | Track, corridor, roads and bridges, buildings, stations, signals, people, city extras, park furniture. |
| `city.js` | Budapest tiles streamed within ~3.2 km of the camera. |
| `parts.js`, `landmarks.js`, `structures.js`, `catenary.js` | OSM 3D parts, hand models, towers/tanks/pylons, overhead line. |
| `car.js`, `aircraft.js`, `collide.js` | Drivable car, aircraft, solids for collisions. |
| `weather.js`, `clouds.js`, `env.js` | Weather situations and fronts, clouds, sun, seasons. |
| `kisvasut.js`, `easter.js`, `photofx.js` | Királyréti forest railway, Dobogókő heart and photo lights, photo stickers and effects. |
| `score.js`, `missions.js`, `panel.js`, `cab.js`, `hud.js`, `input.js`, `settings.js`, `tour.js`, `audio.js`, `i18n.js` | Game layer, UI, controls, Kilátás mode, synthesised sound, translation. |

**Data pipeline** (`tools/`; raw downloads in `data/raw/`, ~700 MB, not in git):

| step | tools | output |
| --- | --- | --- |
| Line alignment, profile | `line_alignment.py`, `build_*.py` | `data/*.json` |
| Terrain + land cover | `bake_world.py <line>` then `ground_filter.py <line>` | `web/data/height_near*.png`, `cover_near*.png`, `world*.json` |
| Route, stops, timetable | `bake_route.py` (**not for line 70**, HISTORY), `parse_timetable_pdf.py`, `line_runtimes.py` | `route*.json`, `timetable*.json` |
| Buildings and roads around a line | `bake_context.py <line>` | `context*.json` |
| Budapest city tiles | `fetch_city.sh` → `bake_city.py` (it then runs `bake_cityx.py` and `bake_trees.py`) | `web/data/city/t_i_j.json` |
| City extras (rails, trams, structures, pipes, solar, labels) | `fetch_cityx.sh`, `bake_cityx.py` | `x` in each city tile |
| Budapest's trees and park things (BP Fatár) | `fetch_bpfatar.py`, `bake_trees.py` | `tr`, `pk` in each city tile |
| Line extras outside the city | `q_linex_*.ql`, `bake_linex.py` | `extras*.json` |
| Real platforms and footbridges | `bake_platforms.py <line>` (downloads, then bakes; `--cached`) | `platforms`, `footbridges` in `extras*.json` |
| Banks and cuttings the DEM misses | `raise_profile.py <line>` (table `RAISES`; safe to rerun) | `route_<line>.json` patched in place, `raised` |
| Kisvasút | `q_kisvasut.ql`, `bake_kisvasut.py` | `kisvasut.json` |
| Assets from purchased packs | `bake_facades.py`, `bake_models.py`, `bake_stickers.py` | `facades.webp`, `models/cars.*`, `stickers*` |
| Announcements | `make_announcements.py` (macOS voice) | `audio/ann/*.m4a` |
| Whole-line scripts | `build_line2.sh`, `build_s21.sh` | everything for that line |

After rebaking a line's world, check that its frame and water fit are
unchanged, and rerun `ground_filter.py`.

## The other documents, and what each is for now

| file | use it for | trust |
| --- | --- | --- |
| `docs/START_HERE.md` | orientation | current |
| `docs/ROADMAP.md` | the stages ahead, the feedback deep dive, the recommended order | current (26 Sep) |
| `docs/SESSION_S18.md` | the model pipeline's first part: animated people | current (13 Oct) |
| `docs/WHERE_NEXT.md` | engine options, and a five-step plan to make the game easier to extend | current (Oct, S-17) |
| `docs/ASSET_GUIDE.md` | what assets to get, in what form and licence | current (Oct, S-17) |
| `docs/OWNER_BACKLOG.md` | every request and its status | current; keep it updated |
| `docs/UNIFIED_ENGINE_SPEC.md` | Unified "One World" multi-modal engine architecture (all train lines, trams 4/6, 1, 2, H5, vehicle hopping) | current specification |
| `docs/FEEDBACK_0925_IMPLEMENTATION_PLAN.md` | Actionable fixes and code diffs for 25 Sep prenight feedback items | current implementation guide |
| `docs/CODEBASE_AUDIT_AND_REVIEW.md` | Deep-dive code audit, 6 critical bugs, bottlenecks, and product evaluation | current audit |
| `docs/DARK_TIMELINE_DISASTER_SPEC.md` | "The Dark Timeline": geotechnical hill-moving physics, SimCity apocalypse scenarios & WebGL2 destruction engine | current specification |
| `docs/MODERN_VFX_PARTICLE_ENGINE_SPEC.md` | GPU-instanced VFX engine: blackbody fire, explosions, velocity-stretched sparks, curl-noise smoke & Web Audio synthesis | current specification & drop-in code |
| `docs/HISTORY.md` | what happened, what was reverted | current |
| `docs/SESSION_S13.md`, `docs/SESSION_S14.md` | the 26 Sep sessions' progress logs and where each stopped | current |
| `CLAUDE.md` (in `szob-fele/` and one level up, kept identical) | the session-by-session log with implementation detail. Its "Handoff" section at the top is the latest state | detailed; long |
| `NOTES.md` | **Traps** (read them); the rest is August history | Traps: current |
| `README.md` | public page and deep explanations of each subsystem | accurate; a long read |
| `REVIEW.md` | the 24 Sep review, what came of it, round 8/9 status tables | superseded by OWNER_BACKLOG for status |
| `TESTING.md` | console harness, known-good numbers, camera spots | partly dated (August numbers) |
| `LANDMARKS.md`, `DATA_SOURCES.md` | each landmark (reality vs data vs model); other data that could be used | 23 Sep |

## The S-12 specs (Gemini, 25 Sep)

The five documents written in S-12 (`UNIFIED_ENGINE_SPEC`, `DARK_TIMELINE_DISASTER_SPEC`,
`MODERN_VFX_PARTICLE_ENGINE_SPEC`, `FEEDBACK_0925_IMPLEMENTATION_PLAN`, `CODEBASE_AUDIT_AND_REVIEW`)
are proposals, not decisions: argue with them.
- The audit's seven bugs were fixed in S-13. Two of those fixes, the motion-blur pinch and the panel overlap, have not been seen on screen yet.
- Its two performance items are in ROADMAP Stage 0.
- The prenight plan's items are in the backlog with their status.
- A small version of the VFX engine is `web/src/vfx.js`.
- One World is ROADMAP Stage 5, with the frame question to settle first.

## Where to start next

[ROADMAP.md](ROADMAP.md) → "Recommended order". In short (26 Sep, after S-14):
1. **Stage 0:**
   - the owner looks at the 27 "built" rows;
   - two quick checks;
   - the leftover glitches;
   - the two performance items.
2. **Stage 1:** S21 with the north's care. That means an earthworks survey with `raise_profile.py`, then KÖKI, Kőbánya alsó, the Mexikói út depot, Zugló's colours, the airport.
3. **Then** life and props (Stage 2) or more to ride (Stage 4), whichever the owner prefers.

**Waiting on the owner:**
- the two Újpest spots;
- what "cars: models are slow" means.

**New in S-14:**
- tools: `raise_profile.py` and `bake_platforms.py`;
- in `geom.js`: `osmPlatformSections`, `buildFootbridges`, `setShoulders`, and the raised-stretch rules.
