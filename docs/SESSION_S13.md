# Session S-13 (26 Sep 2026): progress log

A 5-hour session. The owner said: "get through as much as possible, as high
quality as possible, ship improvements later". Nothing is committed until the
owner reviews it.

Sources of work:
- `OWNER_BACKLOG.md`: the "prenight" section, plus the older open rows.
- `FEEDBACK_0925_IMPLEMENTATION_PLAN.md` and `CODEBASE_AUDIT_AND_REVIEW.md`: Gemini's plans. Their claims were checked against the code on 26 Sep, and the ones spot-checked are true.
- `UNIFIED_ENGINE_SPEC.md`, `MODERN_VFX_PARTICLE_ENGINE_SPEC.md`, `DARK_TIMELINE_DISASTER_SPEC.md`: proposals, not orders.

Update this file after every item: [x] means done and looked at in the
preview; [~] means built but not looked at; [ ] means not started. Add a
note about what was actually done.

## A. Quick fixes (prenight feedback + audit)
- [~] A1 Fullscreen: F11 and a ⛶ button (last in the mode bar; `act.fs`, webkit fallback). Not clicked in the preview: fullscreen needs a real user gesture
- [x] A2 Passenger window per stock: KISS 3.15 m upstairs, FLIRT 1.78 m, EC 2.22 m; car length from CAR_LEN. Seen: a FLIRT window framed by the body
- [x] A3 Corridor seasons: `uGround`/`uSeason` in TRACK_FS, applied to green fragments only (ballast untouched). Seen at Kismaros on days 180, 300 and 20: no seam with the terrain
- [~] A4 Panel z-index 5 → 9 (above the mode bar 7 and the touch buttons 8, below the menus)
- [x] A5 Camera roll: cockpit full bank, chase a third (none while you orbit with the mouse). Seen banked right in both
- [~] A6 Motion blur: skip the sky (depth 1) and points behind last frame's camera (w ≤ 0.01)
- [~] A7 Column form fuller (flame, fullest a third up, bole visible); bark lighter than the crown; inner-crown shade and limbs in summer. Bake: Populus → broad form unless italica/Bolle/fastigiate (columns 11,947 → 4,530)
- [x] A8 Northern Railway Bridge: the city extras' own ballast deck is skipped inside the modelled truss (`onModelBridge` → `buildCityExtras(…, skipAt)`); truss diagonals now a real Warren pattern (they were X's). Seen: one deck, piers in the water. The piers already reached the water; the 'out of the water' report was not reproduced
- [x] A9 Tile roads: `RoadTraffic.addWays(ways, owner)` / `removeOwner(owner)` (dead flag, out of the grid, vehicles removed, entries revived on reload); `removeDriveWays` for the car's grid. Seen: 11,185 ways stable over 5 back-and-forth visits, 680–887 vehicles, none on dead ways. Place labels are bounded (≤ one set per tile) and left as they are
- [~] A10 Touch: arrows forced to text glyphs (U+FE0E), a "gép" button cycles 1/2/3, two-finger pinch zooms (view and board)
- [~] A11 Attribution 8 px (7 px and short form on phones); BP Fatár credit added to it

## B. Trains
- [x] B1 S21 → MÁV 416 "Uzsgyi" (hu.wikipedia: Metrowagonmash, 2 cars, 45.82 m, 2×315 kW, 100 km/h, runs Budapest–Lajosmizse):
  - `STOCKS.M416` (98 t, 520 kW, no ED brake, `diesel: true`);
  - trains.js: `M416` sizes, livery from the owner's photos, short upright nose with the blue band and the red coupler box;
  - all 36 S21 services and the S21 player run use it;
  - audio: engine note from the throttle (600–1800 rpm firing frequency), no VVVF;
  - overhead line on S21 only as far as Kőbánya-Kispest (+250 m), yard wires likewise.
  - Seen: a two-car 416 at Lajosmizse, no wires there. Not heard (sound needs a real click); front not seen close up
- [x] B2 Cab rebuilt per stock (`buildCab(…, stock)`): tall raked one-piece windscreen on slim pillars (Stadler), two-piece with a centre pillar (416, V43), rubber seal, sun blind, parked wipers, framed side windows with the sash, grab rail, mirror outside, lamp strip, back door; pale plastic / beige / green-grey. The desk face is unchanged, so desk clicks still map. Buffer 600 → 2,400 vertices. Seen: KISS and 416

## C. Flying
- [x] C1 `web/src/vfx.js` (`Particles`: pool of 3,072, CPU physics, one instanced draw; VFX_VS/FS: blackbody fire, black smoke with buoyancy, velocity-stretched sparks, vapour, dithered edge). A plane crash is a fireball, sparks, and a wreck that burns and smokes for 30 s; the camera holds on it for the 2.5 s before the restart; a synthesised boom (`sound.boom`); camera shake (`state.shake`). Seen: fireball, then a black column over the Bend
- [~] C2 Gripen afterburner flame at full throttle (seen, made fuller after); wingtip vapour when the nose swings > 0.3 rad/s above 70 m/s (not seen)
- [x] C3 Cockpits (`aircraft.js buildCockpit`, drawn through the cab program with its short projection, in the plane's banked axes `pl.cockBasis`): Cessna with the six-pack, yoke, strut, door pillars, wing overhead; Gripen with a low coaming, three screens, the HUD posts and green marker, the canopy bow and sills, a stick; H135 with a glass nose, centre post, overhead panel. Seen: all three

## D. Data
- [x] D1 Oil wells: `tools/q_wells.ql` → `data/raw/wells.json` (32 in the whole region; OSM maps only one in the Ócsa field itself) → `bake_linex.py` `structs` (class 9) → structures.js pumpjack (pad, A-frame, beam, horse head, crank, weights) drawn from line extras. S21 has 18, lines 70 and 2 one each. Seen on S21. Static, not animated
- [x] D2 Roads: `bake_context.py` keeps roads to 1.6 km (900 m for service/track) on the other lines (was 600/420 m while buildings reached 3 km), and to 3 km in the Esztergom–Párkány box; S21 roads re-downloaded to 1.5 km (`q_s21_roads_{n,s}.ql`, merged via EXTRA). line 2: 8,637 → 10,368 roads; S21: 7,395 → 12,147; buildings and everything else unchanged (+2 road-tunnel portals on line 2). Seen: Dabas and Esztergom with their street grids
- [~] D3 Fót: `tools/q_fot.ql` → `data/raw/fot_osm.json` merged into line 70's context (it is inside line 70's 5.4 km ring south of 47.65): +2,878 boxes, +4,715 outlines, +517 roads; context 3.5 → 3.9 MB. Seen: Fót town from above; the logistics halls themselves not singled out
- [ ] D4 S21 places (Zugló, Kőbánya alsó, KÖKI …): whatever OSM supports

## E. Traffic
- [x] E1 AI cars at a road end with no junction: when a road that lines up is within 70 m ahead (`roadAhead`), they carry on straight over the ground (`v.free`, `stepFree`), join the first road within 6 m and 40°, and give up after 8 s; otherwise U-turn as before. First try (70% of ends, 15 s) put a third of all traffic in the fields; now about 5% are off-road at any moment, a third of them rejoin
- [ ] E2 "Cars: models are slow, drive model cars directly" (unclear; read as: the drivable car should be one of the car models)

## F. One world, first step
- [x] F1 Trams: `tools/q_trams.ql` → `data/raw/trams.json` → `tools/bake_trams.py` → `web/data/trams.json` (15 full runs of 1, 2, 3, 4, 6, 56, 61, both directions, stops projected) → `web/src/trams.js` (clock-driven: 9 m/s, 20 s dwell, headway per line; lifted over water from the cover raster; yellow BKV cars: Combino 6×8.85 m on 4/6, CAF on 1, shorter elsewhere; drawn within 3 km). Seen: a 4/6 on Szent István körút. Nobody can board or drive one yet

## H. From the owner's 26 Sep message (see OWNER_BACKLOG)
- [x] Megyeri pylons over the main channel
- [x] Announcements: "Következő állomás" after departure + "X következik" before arrival
- [x] Passenger seat on short trains
- [x] Afterburner cube gone; vapour banked and stronger; bigger explosion (afterburner and vapour not re-seen)
- [x] Starling murmuration over Kispest (autumn/winter dusk)
- [~] DOF / motion blur / AO strength sliders in Beállítás (not clicked in the preview)
- [x] Szentendre, the island's south end and Budakalász: `q_szentendre.ql` → `data/raw/szentendre_osm.json`, merged into line 70 with its own radius (`in_szentendre`, 8 km): +13,623 boxes, +13,085 outlines, +3,331 roads. Line 70 context now 5.3 MB (3.5 MB this morning). Seen from the air
- [~] S21: checked the profile (rail ≤ 3 m above the ground 70 m out, km 0.5–11.5) and the Üllői út bridge (OSM `bridge=yes` primary road within 10–50 m of the line at km 11.5 → lifted 8.2 m). Nothing changed: need the owner's exact spots
- [~] Újpest: looked from 35 m at the centre and at Kertváros, houses on the ground. Not reproduced; asked the owner for the spot
- [x] Erzsébet híd model (landmarks.js `erzsebet`, anchor in bake_context.py for every line): white pylon pairs on the banks, crossbeams, sagging main cables, hangers every 10 m, anchorages. All three contexts rebaked. The road layer's river piers are suppressed inside it (`geom.js setNoPierAt`). Seen: pylons on both banks, no river piers, cables in the reflection

## G. Dark timeline (owner's idea; sandbox only, off by default)
- [~] G1 `?mode=dark`: K strikes where the middle of the view meets the world (explosion ×6, a fire that burns a minute, boom, shake). No crater, no damage, no panel yet. Seen only through a snowstorm

## Checks owed (built, never looked at)
- [~] Népsziget: only low buildings (seen). Száva utca tower: seen from S21. Aquincum pylons, Újpest vaults, Dunakeszi tó, MÁV-telep: still not confirmed

## Log
(newest last)

- 26 Sep: A1–A7, A10, A11 in. Build and 28 tests pass; no console errors. Passenger, seasons and plane roll looked at (screenshots in scratchpad).
- 26 Sep: A8 A9 B1 B2 C1 C3 done and looked at; C2 half seen. Next: D1 pumpjacks.
- 26 Sep: D1, E1 done. D2 in progress: line 2 context rebaked with roads to 1.6 km (Esztergom–Párkány box to 3 km): 8,637 → 10,368 roads, buildings unchanged, +2 road tunnel portals. S21 roads at 1.5 km downloading (`q_s21_roads_{n,s}.ql`). F1 trams: `q_trams.ql` downloading.
- 26 Sep: owner feedback mid-session (see OWNER_BACKLOG "Feedback 26 Sep"). Done from it so far: Megyeri pylons (landmarks water test from the cover raster; they stood over the Szentendre branch; seen over the main channel now); announcements "Következő állomás: X" after departing and "X következik." ~40 s before (61 new recordings, 126 files); passenger seat clamped to the last car (416); afterburner cube → dark nozzle with a hot throat; vapour banked with the wings and doubled; explosion ×2.2–3.2. Line 70 context rebaked for the Megyeri anchor (all counts identical).
- 26 Sep: the starling murmuration (vfx.js `Murmuration`, 900 boids: weak pull to a wandering centre, alignment and separation with sampled neighbours, a turning wave; drawn as particle type 5, dots at distance). Over Kispest (47.452 N 19.140 E, 140 m up) from day 270 to day 60, 15:30–18:30, within 7 km. Seen at dusk.

## Where this session stopped (for the next one)

Everything above is built, tested (28/28) and not committed; the owner reviews first.

Not done, in the owner's order of interest:
- S21 places (Zugló, Kőbánya alsó, KÖKI, Mexikói út depot…) beyond what OSM already gives.
- Need the owner's input: the exact spots for "train high above the road" (S21), the Üllői út crossing, the Újpest "swallowed houses", and the Kispest photos (they did not arrive).
- Purchased models: village houses, street props, farm buildings.
- Walking people. Bushes, vineyards and flowers outside Budapest.
- "Cars: models are slow, drive model cars directly" (unclear: ask).
- Trams: boarding / driving one; overhead wires for them. H5, the Keleti–Kelenföld line, one world.
- Dark timeline beyond the K strike: craters, damage, the panel.
- New data sizes: line 70 context 5.3 MB, city tiles 33 MB, web/data 82 MB in all.
