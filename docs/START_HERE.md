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

## Read in this order

1. **This file.**
2. **[OWNER_BACKLOG.md](OWNER_BACKLOG.md)**: every request the owner made, with its status. **This is the to-do list.** Pick work from here, and update it when you finish.
3. **[HISTORY.md](HISTORY.md)**: what happened when, and what was tried and reverted.
4. **`../NOTES.md` → Traps only** (items 1–14). Each one cost real time. Skip the rest of NOTES.md; it is the August history.
5. The rest when you need it. `../README.md` is the long explanation of each subsystem: accurate, but written as a narrative.

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
| `main.js` | Boot, the frame loop, cameras, all draw passes, photo mode, the city-tile build callback. The big one (~3,600 lines). |
| `shaders.js` | All GLSL: terrain, track/buildings (`FACADE_GLSL`), vegetation (`VEG_VS`, `TREE_VS`, `VEG_FS`), water, sky, clouds, the post blit (DOF, motion blur, AO, grading), car models. |
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
| `docs/OWNER_BACKLOG.md` | what to do next | current; keep it updated |
| `docs/HISTORY.md` | what happened, what was reverted | current |
| `CLAUDE.md` (in `szob-fele/` and one level up, kept identical) | the session-by-session log with implementation detail. Its "Handoff" section at the top is the latest state | detailed; long |
| `NOTES.md` | **Traps** (read them); the rest is August history | Traps: current |
| `README.md` | public page and deep explanations of each subsystem | accurate; a long read |
| `REVIEW.md` | the 24 Sep review, what came of it, round 8/9 status tables | superseded by OWNER_BACKLOG for status |
| `TESTING.md` | console harness, known-good numbers, camera spots | partly dated (August numbers) |
| `LANDMARKS.md`, `DATA_SOURCES.md` | each landmark (reality vs data vs model); other data that could be used | 23 Sep |

## Where to start next

The owner's own priorities as of 25 Sep, from OWNER_BACKLOG.md:
1. **S21 details:** Zugló, Kőbánya alsó, KÖKI, Mexikói út, the ügyészség tower, Bosnyák tér, the airport, Egis/Richter. The owner annotated these in images 28–47.
2. **S21 stock:** a diesel railcar (MÁV-START 416, per the photos), not a FLIRT.
3. **Things built but never looked at:** pylons, Újpest vaults, Dunakeszi tó, Népsziget, MÁV-telep, cars under roads from above.
4. **Purchased models:** village houses, street props (traffic lights, bus stops), farm buildings.
5. **Cameras:** the cab lookout (not a grey box) and the flight cockpit.
6. **AI cars:** more free off-road, with a timeout.
7. **New lines:** trams 1 and 4/6, H5, Keleti–Kelenföld–Háros, one world.
