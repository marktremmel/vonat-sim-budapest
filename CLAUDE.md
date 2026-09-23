# Szob felé: orientation for a fresh session

Browser train simulator of MÁV line 70 (Budapest-Nyugati → Vác → Szob), built
from OpenStreetMap + SRTM data. Hand-rolled WebGL2, no dependencies, Python
bake pipeline. Everything lives in `szob-fele/`. The rest of this folder is
reference material (photos, PDFs, timetables, Sketchfab zips, audio).

Written 22 Sep 2026 from reading the code, diffing the backup copies and
running the build. Where a claim was checked by running the code, it says so.

## Read in this order

1. This file: where things are, what is broken, and what the owner wants.
2. `szob-fele/NOTES.md` → **Traps** section. Every entry cost real time.
3. `szob-fele/README.md`: how each subsystem works and the known-gaps list.
   It is accurate up to 24 Aug 00:24. Nothing after that is documented there
   (see "Lineage").
4. `szob-fele/TESTING.md`: console harness, known-good numbers, camera spots.
5. `szob-fele/LANDMARKS.md` and `szob-fele/DATA_SOURCES.md`: the landmarks, and the data behind them.

## What the owner cares about (from their own words)

- **Accuracy from OSM/Overpass data is the point**, but they like the
  landmark models (Parliament, bridges…) and want them kept and improved.
  What they called "weird buildings" was mostly the panelház misclassification.
- They want **line 2 (Budapest–Pilis–Esztergom)** working properly, and more lines later.
- They want to **ship to GitHub Pages** eventually.
- Wishlist: realistic train controls; road traffic that **overtakes**;
  ships and small planes; train models that match the real **KISS** (MÁV 815
  double-decker) and **FLIRT** (MÁV 415/5341). "The train has a hump on its back."
- Distrusts flowery docs. Verify before documenting (memory note
  `docs-must-match-code`). Plain statements, limitation stated.

## Lineage: four copies in ~/Downloads

| folder | state |
| --- | --- |
| `vasút/` | Original Claude sessions, ends 24 Aug ~08:00. OSM-only landmarks (4 water towers, cement works, carriage works). |
| `vasút backup 0824_17h_good Enough/` | After Gemini's daytime work. Adds drone/orbit cameras, follow-car/ship modes, more traffic, audio, and **15 hand-typed landmarks**. |
| `vasút copy/`, `vasút copy 2-frissítve-0824este/`, `vasút copy 3 - prep for deployment/` (this one) | Identical source. Evening work: lines 2 and 71, `settings.js`, dynamic data fetch, end-of-run modal. |

`web/data/` for **line 70 is byte-identical** between the good backup and this
copy (route, world, context, heightmaps, timetable). The upstream `data/*.json`
are not: `alignment.json` now has `line70_down/up` ids plus line 2/71 tracks,
and **`runtimes.json` was overwritten with mock values by `mock_runtimes.py`**.
Rebaking line 70's timetable from the current `data/` would use those mocks.

## Layout of szob-fele/

    tools/          Python: Overpass queries (*.ql), fetch_*, build_* (survey
                    data into data/), bake_* (runtime assets into web/data/),
                    build_sim.py (bundler), serve.py (no-cache dev server)
    data/           derived survey data (alignment, stations, infra, blocks…)
    data/raw/       Overpass JSON + terrarium elevation tiles (~180 MB, regenerable)
    web/index.html  shell: panel, menu, end modal, and the loader <script>
    web/src/*.js    the simulator (ES modules in source, flattened at build)
    web/data/       baked runtime assets, per line (suffix _line2, _line71)
    dist/           build output: index.html + data/ copied from web/data
    atlas.html, infrastructure.html, operations.html   generated survey pages

## Build and run

    cd szob-fele && python3 tools/build_sim.py     # writes dist/, ~0.3 s

`build_sim.py` concatenates `web/src` in its `ORDER` list into one flat
`<script>`, strips import/export, rewrites `S.NAME` to `NAME`, refuses to build
on a duplicate top-level name, and copies `web/data` to `dist/data`. The
loader in `index.html` then **fetches** `data/*.json|png` at runtime
(`?line=line2` selects suffix `_line2`). So `dist/` must be served over HTTP;
`file://` will not work. That shape is fine for GitHub Pages as-is.

Dev server: `.claude/launch.json` → `python3 szob-fele/tools/serve.py 8177 szob-fele/dist`.
Boot takes ~7 s in the preview pane before the menu appears.

`dist/data/` is ~25 MB (context.json alone 6 MB, height_near.png 3.7 MB).

## Runtime architecture (web/src)

`main.js boot(assets)` builds everything once, then `frame(now)` runs the
loop. Bundling order matters for top-level `const`s:

    shaders engine env route geom trains traffic aircraft catenary structures audio
    clouds weather landmarks parts tour panel cab hud input settings main

| file | what it owns |
| --- | --- |
| `route.js` | `Route` (interpolate baked track by chainage, limits, grades, stops), `Driver` (physics: tractive effort / Davis resistance / adhesion / EVM vigilance / auto-driver envelope / station dwell / master controller), `STOCKS`. |
| `aircraft.js` | AI light aircraft and helicopter, the flyable plane, their meshes. |
| `traffic.js` | `Traffic` (timetabled trains, block signals), `RoadTraffic` (cars on OSM ways, 1-D per way), `RiverTraffic` (ships on a fairway derived from the cover raster, ferries). |
| `trains.js` | Procedural train meshes: KISS, FLIRT, EC (loco+coaches), FREIGHT. Rebuilt every frame from traffic positions. |
| `geom.js` | Track, corridor mesh, roads & bridges, buildings (instanced boxes + real polygons), yard tracks, stations, signals, crossings. |
| `parts.js` | OSM 3D building parts (`context.parts`): walls with façades, flat/pyramid/dome/hip roofs. |
| `landmarks.js` | Hand-modelled structures keyed by anchor `key` from `context.json` (`buildLandmarks`) and trainsheds (`buildTrainsheds`). |
| `catenary.js`, `structures.js` | Overhead line; chimneys/masts/tanks/pylons from `q_structures.ql`. |
| `shaders.js` | All GLSL: sky, terrain rings, track program, buildings, vegetation, water, clouds, precipitation, post. |
| `weather.js`, `clouds.js`, `env.js` | 15 weather situations, moving fronts, 10 cloud types, sun position, seasons. |
| `audio.js` | Fully synthesised sound (no samples used at runtime). |
| `cab.js`, `hud.js`, `panel.js`, `input.js`, `settings.js` | Desk instruments, overlay, dispatcher board, keys/pointer, settings panel wiring. |

### Coordinate frames (the #1 source of past bugs)

- Baked data: metres **east, north** from the near region's SW corner
  (`world.json near.west/south`). Route points are `[east, north, elev, chainage]`.
- WebGL world: **x east, y up, z SOUTH** (`z = -north`). Anything built from
  data must negate north. `Route.at(m)` returns `[east, north, elev]`.
- Each line has **its own frame** (its own `world_<line>.json`). Changing the
  km window moves the origin and silently misaligns everything baked earlier.

## Debugging in the preview browser

Synthetic key presses from the preview tool do **not** reach the
`window` keydown listener. Drive state from the console instead:

```js
dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyU'}))  // this works
SIM.state.follow = true; SIM.state.yaw = 2.4; SIM.state.pitch = -0.1
// free camera looking at a point; T and E are [east, up, north]
window.look = (T, E) => { const s = SIM.state; s.follow = false;
  s.fly = {p: [E[0], E[1], -E[2]], speed: 30};
  const dx = T[0]-E[0], dz = -(T[2]-E[2]);
  s.yaw = Math.atan2(dx, -dz); s.pitch = (T[1]-E[1]) / Math.hypot(dx, dz); }
```

Fly-camera forward is `[sin yaw, pitch, -cos yaw]`. `SIM.route.at(m)` gives
`[east, north, elev]`; `SIM.driver.m` is the player's chainage.

## Work done 22 Sep 2026 (all verified in the running build)

Owner feedback drove a second pass: they DO like the landmark models ("kinda
jank" but wanted), the inner city looked sparse, Nyugati lacklustre, lights
did not light anything, features were hard to find.

**World / data (`tools/bake_context.py`, rebake with `python3 tools/bake_context.py`)**
- Gemini's landmark anchors are KEPT (owner likes them). Parliament and the
  Bazilika's OSM footprints are skipped so the hand models are not doubled.
- Panelház classifier restored to the original strict rule (Gemini's had
  made 13,097 buildings prefab slabs; now 2,591).
- **Building multipolygon relations are assembled** (outer rings stitched from
  member ways). Inner Pest is >50% relations; +2,822 outlines. This is what
  made the city look sparse.
- Roads carry OSM `lanes` and `oneway` (pack format: u8 cls, u8 bridge,
  u8 lanes, u8 oneway, u16 n; flagged by `roads.lanes: true`).
- `tools/ground_filter.py` removes buildings from the surface-model DEM in
  built-up land cover (morphological opening, numpy only; scipy is broken on
  this Mac). Original kept in `data/raw/height_near_dsm.png`. Rerun it after
  any `bake_world.py`.

**Rendering**
- Polygon buildings get a 4th vertex attribute `aBld` = [ground y, wall
  height, class, seed] (`geom.js buildPolyBuildings` → `main.js colouredVao`
  → `TRACK_VS/FS`). The façade shader counts storeys from the building's own
  ground and lays windows along the wall. Previously a fixed 95 m datum and
  world-axis projection. Pest palette per building, shopfront ground floor,
  cornice, lintels; panel, house, church, industrial variants.
- Big footprints get a 7 m pitched ring roof with a dark flat middle instead
  of one huge hip. Roof colours vary.
- Residential land cover is a garden/yard plot mosaic (terrain and corridor).
- Street lighting: `STREETLIGHT_GLSL` in `shaders.js`, 48 nearest lamps as
  point lights in terrain, track and building shaders.
- Nyugati: model in `landmarks.js buildTrainsheds` now has a pitched roof with
  lantern, glass-and-iron street gable, two towers with slate caps and clocks,
  wings and side ranges. The OSM station polygon is no longer drawn.
- KISS hump fixed; V43 livery; train meshes carry per-quad normals (needed
  for close-up interiors: float precision at 25 km coordinates).

**Simulation**
- `route.js`: master controller (lever B8..P8, EB), jerk-limited traction,
  ED brake fading below ~10 km/h, lagged air brake (per-stock tau), wheel
  slip. `STOCKS` table (KISS, FLIRT, EC = V43+5, FREIGHT = V43+20); scenario
  picks the stock in `startRun`. Measured from 80 km/h: KISS 277 m service /
  209 m EB, freight 647 / 415 m.
- `traffic.js RoadTraffic`: follows next same-direction vehicle, overtakes
  (own lane on multi-lane roads, oncoming lane on two-lane when clear), turns
  at junctions (ends matched to segments within 2.5 m), respects one-ways,
  spawns into free space, drives on `roadSurfaceAt` (same as road mesh).
  Underpass digging was dead code (`railDistAt` returns an object); fixed.
- `aircraft.js`: AI Cessnas + helicopter; flyable plane (shift+P).
- Passenger mode (Y): upper-deck window seat, player train drawn hollow.
- Duna slider to +14 m with a flood plane (`FLOOD_VS/FS`).
- Sound starts off (owner request); G turns it on.
- Mode bar (bottom centre) and `?` help overlay in `web/index.html`.

**Line 2 (Nyugati – Pilis – Esztergom) is built** — `tools/build_line2.sh`
reruns it all. Per-line pieces, all writing `_line2` files only:
`line_alignment.py` (graph shortest path over the relation's ways + line 70's
track from Nyugati; 52.86 km; profile from the DEM, 2% grade limit),
`q_line2_*.ql` downloads (buildings incl. relations 1.6 km, roads, west-strip
land cover, places, structures, signals, km posts, crossings, Esztergom old
town), `bake_world.py line2` / `bake_route.py line2` / `bake_context.py line2`
/ `bake_map.py line2` (all take the line as argv[1]; line 70 output verified
byte-identical after the change), `line_runtimes.py` (S72 81 min, Z72 65 min
by running a FLIRT over the route), and the Esztergom Basilica model
(`landmarks.js`, key `esztergom`, anchored to its OSM outline). The loader
fetches `timetable_<line>`/`map_<line>`. Terrain tiles widened west to 18.30 E.

Line 2 is single track: both directions share one path, so opposing trains
are drawn on the same rails (the timetable does not model crossings). Line
2's official km restarts at Angyalföld, so `route_line2.json` carries a
piecewise `official_km_table` instead of the linear fit.

## Work done 23 Sep 2026 (third pass, verified in the running build)

- Wipers auto (`state.wiperAuto`, off when dry); X takes manual control.
- Weather: `pickSituation(day)` in weather.js picks by season; each session
  starts with a random seasonal situation and a front already moving.
- Cars "swallowed" by roads at distance was depth precision: `uPull` in
  TRACK_VS pulls car/people vertices 0.3% toward the eye.
- Floating houses: boxes and polygons stand on the LOWEST ground under them.
- Esc exits plane / free camera / Kilátás. Aircraft: 6 Cessnas, 2 helis, 3
  airliners with contrails at 9-10 km.
- Danube: `WATER_GLSL` is shared by the river and the flood plane (the flood
  now reflects). Drought: negative Duna exposes gravel from the banks inward
  (~25 m of bed per metre), using distance-to-shore from the cover raster;
  water snap tolerance grows with the drop so reflections survive. Water
  fragments are discarded in the reflection pass.
- Landmarks anchored to OSM (`q_landmark_ways.ql` → `data/raw/landmark_ways.json`):
  bridges from their way chain, Parliament/Bazilika from their outline; bridge
  models sit 8 cm under the road deck (`BRIDGE_TOP` in landmarks.js). Árpád,
  Megyeri, Mária Valéria road ways added so they have decks and traffic.
  Northern Railway Bridge from line 2's longest bridge way, spans sized to
  OSM, deck at rail level on line 2.
- Line 2: bridge-aware profile (no sag over the Danube), `bridges` ranges in
  route/profile, corridor gap and no carving under bridges. Esztergom
  terminus was filtered out (stop 7 m past the last track point) — fixed.
  Esztergom + Párkány extract widened; Mária Valéria bridge model.
- Industry: `q_industry.ql` → `industry_osm.json` (fresh industrial buildings
  within 3 km of line 70). Samsung SDI's real halls (up to 152k m²) replace
  Gemini's invented model; Dunakeszi Járműjavító's invented model also
  dropped; halls over 60k/100k m² get 22/26 m.
- Land cover paint order: bigger polygons first within a rank. The Sejcei
  (Naszály) quarry was buried under a forest relation. Quarry shading:
  bright limestone with bench lines. Line 70 world rebaked with
  `SZOB_KM=0,63.6`; frame and water fit verified identical.
- Nyugati: pale metal roof with glazed band, pavilions against the hall
  corners with mansard domes, cupolas, clocks (checked against the aerials
  in the project folder).
- Overhead line: slimmer lighter wires, single wiring on single track, and
  wires over yard/station tracks (`buildYardWires`).
- `tour.js`: Kilátás mode (camera director: chase, window, trackside, drone)
  and place captions (`#poiCard`) from landmarks, peaks, places.
- Automatic resolution (`state.dynRes`) when fps < 40.

## Work done 23 Sep 2026 (fourth pass, checked in the running build)

Owner feedback:
- Two Chain Bridges ("one grey, one plattenbau style").
- Wants a Ferris wheel instead of a tower on Erzsébet tér, and Buda Castle.
- Prefers data to Gemini's models.
- UI crowded; weather controls finicky; POI caption not wanted.
- Northern Railway Bridge stops short of the Népsziget bay; a water glitch there on line 2.
- Overpasses wonky.
- Plane too easy; wants a choice of aircraft and a map in flight.
- Decorative trains don't work well; dispatcher board inconsistent.

See `szob-fele/LANDMARKS.md` (each landmark: reality vs data vs model) and
`szob-fele/DATA_SOURCES.md` (what else could be used: MÁV GTFS, DTM…).

**Landmarks and data**
- OSM 3D parts:
  - `q_building_parts.ql` → `data/raw/building_parts.json` → `context.parts` → `web/src/parts.js`.
  - The Parliament (112 parts) and the Bazilika (16) are now data; their hand models are dropped.
  - An outline covered 55% or more by parts is not drawn.
- `bridge:support`, `building=bridge` and `man_made=bridge` are never extruded as buildings. The Lánchíd pylons were the "plattenbau" bridge; they now place the model's towers (`tw`, 202 m apart).
- Bridge decks (`geom.js buildRoads`): touching bridge ways are one structure with one `deckAt`. The plateau is set by what the bridge crosses (water+8.5, rail+7.4, road+5.2), with ramps at 6% or steeper down to the approach roads. River piers are spaced every 65 m, land piers every 26 m (never on the rails). Cars ride `way.deckAt`; they used a different formula and ended up under the deck.
- Margit and Árpád hand models are dropped (data decks). Megyeri keeps only its pylons and stays, placed ±150 m from the middle of the main channel.
- Northern Railway Bridge: one truss per OSM chain (697 m Danube + 246 m bay).
- `line_alignment.py` merges touching bridge ways before the 100 m cut, which fixes the embankment carved across the bay on line 2.
- New models:
  - `bigwheel` (Budapest Eye, from the OSM `attraction=big_wheel`).
  - `budavar` dome (at 47.49611 N 19.03972 E). The palace outline is raised to 24 m.
- Gemini's invented Hulladékhasznosító, Újpesti Erőmű and Szennyvíztisztító models are removed; the real OSM buildings stay.
- Shorelines: the terrain shader decides water from the 4 cover texels, bilinear at 0.5. The 25 m staircases are gone.

**UI**
- Mode bar at top centre, compact; keys are in the tooltips. It includes a U button.
- The bottom strip is cells laid out by measured width, dropped if they don't fit. The debug numbers moved to F3.
- The strip is hidden when you look down at the desk in the cab.
- The cab desk (`cab.js`) is a five-column grid. It now shows the lever position and brake-pipe pressure.
- The panel folds (▾, remembered in localStorage).
- The POI caption is removed; `tour.js` `pickPOI` is now unused.
- Weather:
  - `state.front` no longer overwrites `state.wxId` each frame. That was the "finicky" selector.
  - `setWeather(id)` sets it here and now; "változékony" queues fronts.
  - `queueFront`/`stepFront` work relative to the player: a change every ~15 min.
  - The panel note shows the actual blended weather at the train and the approaching front with an ETA.
  - Cloud and haze moved to Beállítás. Env presets used non-existent ids; fixed.

**Trains and traffic**
- Finished services are retired after their last call. They stood at the Nyugati buffers for ever and silently blocked every departure.
- Blocked departures now wait (`pending`, up to 20 min) instead of being dropped.
- Single-track working (`Traffic.setSingleTrack`, `updateSingle`, `singleStop`):
  - Sections come from the yard-track layer (second track 3–7 m off, ≥300 m ⇒ loop). Line 2 is double to Pilisvörösvár.
  - First to come within 900 m claims a section; opposing trains wait at the loop exit.
  - Opposing AI trains are drawn on the loop side (`trainSide` → `buildTrains` `sideOf`).
  - Checked: 6 simulated hours, no opposing pair ever in one section.
- `Traffic.signalAspect/signalAspectAt` is the one aspect function used by the trains, the 3D signal lamps and the board. The lamps and the board had their own formula, one block out.
- The automatic driver now stops at red (`driver.signalStop`).
- Dispatcher board rewritten (`panel.js`):
  - km scale from the track (line 2's `km_to` is 999).
  - Titles from the stops; single track drawn as one line opening into loops.
  - Claimed sections are drawn in the claimer's colour.
  - Train labels show lateness; a legend.

**Flying** (`aircraft.js`)
- 1 / 2 / 3 switch between Cessna 172, JAS 39 Gripen (Hungary flies Gripens, not F-16s) and an H135 helicopter.
- Body-rate controls: a bank stays in, and a banked turn sinks unless you pull.
- The stall drops a wing. Gentle touchdowns land; Space brakes on the ground.
- The minimap is drawn in flight (`drawMap`). If the camera position is not known yet, the plane spawns at the train.

## Work done 23–24 Sep 2026 (fifth pass)

Owner feedback:
- Holes in the ground (sky below the horizon) under the line 2 bridge and at Nyugati.
- Ferdinánd híd too low for trains; Dózsa György út underpass not dug enough; Váci út climbs over the line.
- "Tower windows" on everything; wants glass offices, windowless sheds, small-house windows.
- Castle district swallowed by the terrain; the Opera wrong and too tall; the Aquincum amphitheatre a solid disc; "Hidegváró állomás".
- Nicer people; the Népsziget shipyard; the line 2 timetable (PDF) and freight.
- A bigger Budapest; S21.

**Terrain holes** (`bake_world.py` cover B channel):
- The distance-to-line channel decides where the terrain is discarded for the corridor mesh.
- It had round caps: past the Nyugati buffers and at both ends of every bridge the ground was cut away with no corridor drawn.
- It is now perpendicular distance to the down line's segments only, skipping bridge ranges and anything outside the baked window.
- Line 70 frame and water fit verified identical after the rebake.

**Crossings under and over the line** (`geom.js`):
- `prepareUnderpasses` gives each `bridge === 3` road a floor (natural ground either side, but at least 6.6 m under the rail) and `way.floorAt`.
- `buildCorridor` densifies rows to 2 m around each crossing and digs its own cutting to that floor. A deck carries the track over it.
- The road, its retaining walls and the cars use `floorAt`.
- `bake_context.py` marks roads that cross a railway bridge (any length, from the raw rail ways) as `bridge = 3`. This fixes Váci út under line 2.
- Rail-crossing road bridges clear the rail by 8.2 m, measured from `railY`, not the lowest ground. The ramp finishes before the rails (Ferdinánd híd).

**Buildings**
- `FACADE_GLSL` (shaders.js) is shared by the polygon and box buildings: `facadeKind(cls, H, seed)` → house, tenement, panel, hall with clerestory, church, glass office, retail box (glazed front, coloured band, no brand), blank shed/warehouse, civic/station, modern flats, ruin.
- The bake gives the classes:
  - 10 = office / tall commercial
  - 11 = big shop
  - 12 = warehouse / hangar / service
  - 3 = anything on railway or industrial land (Népsziget's warehouses, Vasúttörténeti Park)
  - 13 = ruin (low, roofless: the Aquincum amphitheatre)
- On slopes, walls run from the lowest ground to the height over the highest ground (boxes in BLDG_VS, polygons in geom.js); parts use the lower quartile. This fixes Castle Hill.
- The palace is classed civic.
- Opera override in the parts bake: OSM maps it as one 50.7 m part; now 34 m with a pink hipped roof.
- A `building=train_station` with levels (Nyugati's "Hidegváró") gets no barrel vault. The "Hidegváró állomás" label is patched in route.json/route_line2.json.
- **Trap:** re-running `bake_route.py` for line 70 moves the stops by up to 280 m (upstream station data changed since the known-good bake). Don't; patch route.json in place.

**People** (`geom.js buildPlatformPeople`): legs, body, arms, head, hair or hat, bags, backpacks, suitcases, umbrellas in rain; children and older people; colour among the dark coats; pairs.

**Structures**: portal crane model (shipyard cranes, `man_made=crane`).

**Line 2**
- `tools/parse_timetable_pdf.py` reads the MÁV printed timetable (`data/raw/menetrend/line2_munkanap.pdf`, rotated pages) into `timetable_line2.json`: 144 services, S72 when calling at every station in its span, else Z72.
- The generated one is kept as `timetable_line2_generated.json`.
- Freight added per Wikipedia: M44 trips Esztergom ⇄ Kertváros, one ÖBB 1116 freight to Budapest. Times invented. Loco liveries `LOCO_M44`, `LOCO_1116` in trains.js.
- Spawns inside a claimed single-track section wait. 17 simulated hours: no opposing pair ever in one section; p90 lateness about 10 min (crossings at our loops, not the real ones).

**S21** (Nyugati – Kőbánya-Kispest – Ócsa – Dabas – Lajosmizse): `tools/build_s21.sh`, OSM route relation 14995078.
- `line_alignment.py` takes `LINE_ENDS` to cut the relation at Lajosmizse (73.8 km).
- Terrain bounds widened to 46.70 N / 19.98 E.
- Menu and settings know `?line=s21`.
- Built and checked: 21 stops, 126-min run (FLIRT over OSM limits), hourly each way; `context_s21` 3.8 MB.
- The water plane is set by hand to 96.5 m (the fit used the plain's lakes: 81 m).
- Queries: the context download is split in two halves (one query timed out on every mirror).

**Traffic**
- Signals: gaps over 3.5 km get automatic-block signals about 2.5 km apart (`Traffic` constructor). S21 had 5 mapped signals in 73 km, and trains queued for kilometres.
- A "single" stretch under 1.2 km between double ones is treated as double (a gap in the mapped second track).
- Checked:
  - S21: 17 h, no opposing pair in a section, p90 lateness 4 min.
  - Line 2: p90 26 s (was 10 min).
  - Line 70: unchanged, 56 signals.

## Work done 24 Sep 2026 (sixth pass: the city, the car)

**The Budapest city layer** (`tools/fetch_city.sh`, `tools/bake_city.py`, `web/src/city.js`)
- Box: 47.39–47.58 N, 18.93–19.25 E (Óbuda/Újpest to Háros/Budafok, the Buda hills to Kispest/Kőbánya).
- Downloaded in 9 pieces to `data/raw/city/` (238 MB; one query for the box never returns).
- `bake_city.py` runs `bake_context.py` with `CITY=1`: the same classification, everything in the box, line 70's frame. Then it cuts the result into 540 tiles of 0.009° × 0.0133°: `web/data/city/t_i_j.json`, 19.7 MB, 252k buildings, 59k roads, 1,789 building parts, tunnel portals (Budavári alagút).
- Boxes become four-point polygons.
- Tiles are placed in any line's frame from their corner's lat/lon and the ratio of metres per degree (`index.mlat70/mlon70`, JS `metresPerDegree` = `geo.frame`).
- `CityTiles`:
  - Fetches tiles within 3.2 km of the camera, three at a time; builds them within ~6 ms a frame; drops them past 4.4 km.
  - Meshes: polygons, parts, roads (`buildRoads`, decks and all), portals.
  - Tile roads join `RoadTraffic` (`addWays`, which also re-links the line's ways that touch them) and the car's surface grid.
- Line contexts (`bake_context.py` without `CITY`) leave out buildings and parts inside the box once `web/data/city/index.json` exists (`NO_CITY=1` to bake the old way). They write `roads.ids`, so tiles skip roads the line already has.
- Line 70's context went from 6.4 to 3.5 MB.
- Checked: 30 tiles loaded, about 765k triangles, ~7 ms/frame; tiles line up in line 70's and S21's frames.
- **Rebuild order:** `fetch_city.sh` → `bake_city.py` → `bake_context.py` for every line.

**The car** (`web/src/car.js`; ⇧A or "Autó" on the mode bar)
- Starts on the nearest road, pointing along it.
- Bicycle model: engine falling off with speed, brakes, reverse, handbrake.
- W/S/A/D, Space, C for the driver's seat, Esc back to the train.
- The surface (`carSurf` in main.js):
  - on a road: the road's surface;
  - on a bridge or in an underpass: its `deckAt` / `floorAt`, whichever is nearer your height;
  - off the road: the ground;
  - river: stops.
- There is no collision with buildings or other cars.

**Fixes**
- Stadiums, sports halls, grandstands: class 14, an "arena" façade (pale, dark concourse bands).
- Big lone footprints with no levels (over 4,000 m², outside the dense blocks): class 12 halls.
- Slopes: the ground is also sampled inside the footprint, and 1 m is added when the slope is real. Parts stand on the median ground of their ring.
- The castle dome anchor is now made before the city exclusion (it had vanished).

## Still open

1. City layer follow-ups:
   - Stadium roofs cover the pitch (inner rings are not cut).
   - Tiles have no chimneys or other structures.
   - Keleti's and Kelenföld's yards are not drawn (yard tracks come only from the lines' own extracts).
   - The car ignores collisions.
   - Beyond the line's near heightmap (south of 47.456 on line 70, e.g. Kispest and Budafok) buildings stand on the 100 m far heightmap.
   - The original expansion request (districts 8–9, Keleti, Kelenföld, Budafok, Háros, Kispest) is covered by the city box; the notes below are older.
   - Today each line bakes only a 2–5 km ring, as one JSON.
   - A whole-Budapest city layer needs tiling/LOD streaming (the line 70 context alone is 6.4 MB).
   - Also: roads on the Buda side (the Alagút and Clark Ádám tér are not in any extract), and all 1,936 OSM building parts in Budapest (`q_parts_bp` census, 23 Sep).
2. Line 71 (no context, broken alignment): copy `build_s21.sh`.
3. Courtyards not cut out of relation blocks.
4. ~60% of road way-ends have no junction link (600 m bake cut-off).
5. Ships do not avoid each other; aircraft do not avoid anything.
6. Landmark to-dos in `szob-fele/LANDMARKS.md`.
7. Drivable car (owner idea); needs item 4 first.
8. MÁV GTFS for lines 70 and S21 (line 2 now uses the printed timetable).
9. The rail tunnel portal model (`portal`) exists, but no road tunnels are in the data yet.

## Things that are right and should not be re-opened

See `NOTES.md` → "Confirmed working" and memory `szob-fele-sim-decisions`:
browser not Godot, present-day stock, weather in scope, Szob is the end of
line 70, 16/32-bit aesthetic with low internal resolution.
