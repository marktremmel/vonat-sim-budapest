# Review: where the sim stands, what is broken, where it could go

Written 24 Sep 2026, after v0.1 alpha went to GitHub Pages. It is based on
reading the code and on running the game in the preview browser. "Checked"
means it was run and seen; everything else here is an assessment.

## What is already good

- **The world is real data.**
  - Three lines, each with its own frame.
  - 250k Budapest buildings loaded in tiles.
  - OSM 3D parts for the Parliament and the Bazilika.
  - Bridges from their own ways, landmarks anchored to their outlines.
  - Signals, loops and km posts from OSM.
  - A printed MÁV timetable on line 2.

  Very few hobby sims have this breadth, and it is the thing to protect.
- **The train side has real depth.** A master controller with ED and air
  brakes, adhesion and slip, EVM vigilance, block signalling, single-track
  working with passing loops, and a dispatcher board that shows what the
  trains obey.
- **The sandbox is fun.** Flying over the Danube bend, the passenger seat,
  Kilátás, the car, weather fronts, and the Danube slider with its flood and
  drought. The owner's own words: "flying around is fun".
- **The look is consistent.** Low internal resolution, flat colours,
  procedural façades. It reads as a deliberate style, not a missing texture budget.
- **It is light to host.** One 690 KB script and 48 MB of data, most of it
  fetched on demand. Once loaded it holds about 7 ms a frame on this Mac with
  30 city tiles loaded.

## Bugs fixed in this review (24 Sep, checked in the running game)

| Bug | Effect | Fix |
| --- | --- | --- |
| Élesség slider bound to `sharpSel`, which does not exist | The resolution slider did nothing | Bound to `resSlider`; the value now shows the resolution (e.g. 819×614) |
| The clock advanced twice per frame (`state.hour += dt/3600` in two places) | Game time ran at 2× real time; every train, the player's included, drifted late; hence the "+13:22" and "−263:59" readings | One increment; checked 10.0 game s per 10 s real |
| End-of-run "Main Menu" set `display:block` inline | The menu could not be closed again | Uses `toggleMenu(true)` |
| Scoring ran with the automatic driver | Auto-driving collected "perfect stops" | Scored only when you drive |
| SPAD detected only within 5 m of the signal in that frame | Overrunning a red at speed was usually missed | Detected when the signal ahead changes while it showed stop (restarts and station jumps excluded) |
| In the free camera, R/F/Q/E also did their train actions | R hid the track; F jumped to following another train | Movement keys are swallowed in the free camera |
| Start jingle requested as `mav-szignal` (never loaded) as well as `szignal_mav` | A dead call | Removed |

Also: no penalty counter was ever increased, so the end screen always showed
0 violations. Overspeed, poor stops and SPADs now count.

## Done from this review (25 Sep, checked in the running game and by `tools/test_sim.mjs`)

| Item | What was built | How it was checked |
| --- | --- | --- |
| Loading screen | The cover image, a progress bar, rotating tips. The data files now download in parallel (they were fetched one after another), without cache-busting query strings. `boot()` reports its build steps. | Seen in the preview; boots to the menu in 3.5 s with the tab visible. |
| Menu | Hungarian. Cover banner, line cards (70, 2, S21), **Indulás** (the next stopping train from Budapest, in daylight, on automatic), Szolgálat, Fotóalbum, Napi kihívás; the old form is under "Részletek". Line 71 is out of the menu (it has no context). | Seen; every button used. |
| First-run hints | Four steps after the first Indulás (look around, the views, M, keys); once per browser. | Seen. |
| Remembered settings | Picture and sound sliders, quality, the last line (a bare address opens it), the last run's choices per line, missions, album. All in `localStorage` key `szobPrefs`; the panel fold only when you click it. | Reloaded; values came back. |
| One language | HUD banners, panel labels, end card and help in Hungarian. | Grepped for English UI strings; seen. |
| Scorecard (`score.js`) | Punctuality, stop accuracy, safety, comfort, energy (0–100 each), stars, a live figure on the strip. Only what you drive counts. | A scripted hand-driven run of mission 1: three stops within 2 m, 100%, three stars. |
| Stopping by hand | The train stops where you stop it (within 30 m of the mark the doors open, and the error is scored); 30 m past it is a missed stop. It used to be pulled onto the mark from 45 m out, which made every stop "perfect". | `test_sim.mjs`; the scripted run. |
| Stopping patterns | Your own G70, EC and freight now run through the stops they do not call at (from the booked path, else the pattern). Every train you drove used to stop everywhere. | Checked the call lists for EC, G70, freight, S70. |
| "Next stop" | The HUD and the automatic chime keep pointing at the stop you are braking for until you have called there or run 30 m past it. `nextStop` moved on 30 m short, so the banner vanished just as you needed it. | Scripted stops. |
| Missions (`missions.js`) | Ten, on lines 70, 2 and S21, in four licence grades (Gyakornok → Főmozdonyvezető) unlocked by stars; personal bests. | Mission 1 played through; the grade unlocked. `test_sim.mjs` checks every mission's stops exist on its line. |
| Daily challenge | A mission, time and weather picked from the date: the same for everyone all day. | `test_sim.mjs`. |
| Collision world (`collide.js`) | Every footprint, box, building part and structure (chimney, mast) as a solid in a 25 m grid; city tiles add and remove theirs. | 58k solids on line 70 at boot, 64–75k with tiles; `test_sim.mjs`. |
| Car | Slides along walls (a glancing hit keeps its speed, head-on stops), bumps other cars (they stop), and AI cars brake for it. On the line it is seen by every train from 700 m, which emergency-brakes; a train that cannot stop hits it. | Drove into Nyugati's side building; stood the car 450 m ahead of the train, which stopped short. |
| Plane, helicopter | A roof is ground (the helicopter can land on one); flying into the side of a building is a crash, with a message. | Code path; not flown into a building on camera. |
| Drone | Pushed off walls, stands on roofs. | Code path. |
| Derailment | More than 2.6 m/s² sideways *and* more than 35% over the limit: the run ends as "Kisiklás", no stars. | The tightest curve near Nyugati (R ≈ 390 m, 60 km/h) holds at the limit, derails at 115 km/h. |
| Station announcements | "Tisztelt utasaink! Vác következik." in the browser's Hungarian voice, after the chime, with the sound on. Silent where no Hungarian voice is installed. | Code path; not heard in the preview. |
| Photo album | Z or the Fotó button: a picture, and the landmark, 700 m+ peak or town in the middle of it goes into the album with a thumbnail, date, weather and how you were travelling; a PNG to save. | Took one; the album showed it. |
| Touch controls | On a touch screen: lever, ÉBER, VÉSZ in the cab; steering in the car, plane, drone and free camera; panel folded, mode bar on top. | Mobile preset in the preview. |
| Quality | Alacsony / Közepes / Magas: resolution and how far the city loads (1.9 / 3.2 / 4.3 km). Low on touch screens. | Switched; tiles and resolution followed. |
| Tests and CI | `tools/test_sim.mjs` (node, no browser): braking distances, hand stops, scoring, 6 h of traffic per line with no train running into another, the collision world, missions. `.github/workflows/test.yml` runs it on every push. It found `traffic.js` using `CAR_LEN`/`CAR_H` without importing them (it worked only in the flattened build). | 28 checks pass. |

**The dispatcher game is a prototype, not in the menu.** The machinery is
there: click a single-track section on the board to say which direction goes
next (▶ / ◀), a failed unit, late trains, and a shadow copy of the same traffic
run by the automatic rule to score against. But at today's timetable density
line 2 at 7:00 has three trains on 52 km. In a 50-minute shift trains waited at
a red for one minute in total, with or without orders, so a shift can be
neither won nor lost. It needs denser traffic (a peak-hour timetable, more
freight) before it is a game. `?line=line2&mission=d2-csucs` starts it. The
section orders work in free play too.

## Bugs and weak spots still open

**Severity 1: breaks the experience**
- ~~**Nothing collides.**~~ Done 25 Sep, closed level-crossing booms included; aircraft still do not meet each other.
- ~~**First load is slow and silent.**~~ Done 25 Sep: a loading screen, parallel downloads. The 9 MB of line 70 data is still 9 MB.
- **Line 70's timetable is the generated one on mock run times** (CLAUDE.md,
  "Lineage"). Only line 2 is real.

**Severity 2: looks or feels wrong**
- ~~The language is mixed.~~ Hungarian throughout since 25 Sep; there is no English toggle.
- Stadium roofs cover the pitch, and courtyards are filled, because inner rings are not cut.
- About 60% of road ends in the line contexts have no junction link, so cars
  vanish or turn at invisible ends. The city tiles are much better linked.
- The terrain is a surface model: humps, and hills slightly over buildings in
  places (Castle Hill improved but not solved). The real fix is a DTM (DATA_SOURCES.md).
- South of line 70's near heightmap (Kispest, Budafok) the city stands on the 100 m far heightmap.
- Ships do not avoid each other; aircraft avoid nothing.
- Sound starts off (owner request) and is thin when on: synthesised, three samples. Stop announcements added 25 Sep (browser voice).
- ~~No touch controls.~~ ~~Settings not remembered.~~ Both done 25 Sep (time and weather are not remembered).

**Severity 3: code health**
- `main.js` is 2,600 lines; the frame loop mixes simulation, scoring, UI and
  rendering. Scoring and missions should get their own module before they grow.
- ~~There are no automated tests.~~ `tools/test_sim.mjs` since 25 Sep. It does not yet set up single-track working (that is computed from the yard layer in `main.js`).
- `bake_context.py` is one 1,300-line `main()`. The city mode works but is
  threaded through many `if CITY` branches.
- Two copies of CLAUDE.md (the project folder's and the repo's) will drift.

## Physics: making things solid

The core problem: the world is drawn from data but not queried as geometry.
The fix is one shared **collision world**, built from what is already in
memory.

1. **Buildings.**
   - At load (and per city tile), put every footprint polygon with its height into a spatial hash (e.g. 25 m cells).
   - Queries:
     - `solidAt(x, y, z)`: is this point inside a building below its roof?
     - `pushOut(circle)`: the nearest wall and its normal, to slide the car along.
   - Cost: a few thousand polygons per km², each tested only against its cell. Cheap.
2. **Car.**
   - Circle against building walls: slide, and bump the speed down.
   - Car against traffic: treat the player's car as a vehicle on the nearest
     way, so AI cars brake behind it and wait for it; a collision is a
     bounce plus a message.
   - Level crossings: closed gates are solid, and a train is a moving capsule
     along the track. Standing on the crossing when a train comes is a
     "you were hit" event, and the train's driver (AI or you) must emergency-brake.
     That is a real safety lesson and a dramatic moment.
3. **Plane, helicopter, drone.**
   - A **height grid** of the maximum building/structure height per 10 m cell (built with the hash) plus the terrain: crash if below.
   - Chimneys, masts and pylons are already in `structs` (height and radius).
   - Catenary: the wire height is known along the line.
   - The helicopter could land on flat roofs: roof height from the grid.
4. **Trains.**
   - Derailment on overspeed: lateral acceleration from the curve radius (the track geometry is there) above a threshold. Not a crash scene: a stop, a fade, a report.
   - Obstacles on the track (a car stuck on a crossing, a fallen tree in a storm) that the driver must see and brake for.
   - Coupling (freight shunting at Esztergom?) is a bigger step.
5. **Water.** The car stops at the bank today. The plane could ditch; the helicopter could hover low over the Danube and kick up spray.

Order: the building hash first (it serves the car, the plane and the drone),
then the car against traffic and trains, then the plane height grid.

## Gamification: turning a sandbox into a game

The sim already measures most of what a driving game scores: lateness at each
call, stopping error, overspeed, SPADs, vigilance. What is missing is
*structure*: a reason to start a run, a goal inside it, and a result worth
repeating.

- **Missions ("Szolgálat"), built from the timetable.** "S70 at 07:10,
  Nyugati → Vác, 4 cars, rain", "Z72 at 17:40, evening rush, Pilis in fog",
  "Freight Esztergom → Kertváros with an M44". Each run gets a scorecard, stars
  and a personal best:
  - punctuality at every call;
  - stop accuracy (metres from the mark);
  - comfort (jerk — the physics already has it);
  - energy (traction kWh minus regenerative braking);
  - safety (SPAD, overspeed, EVM).
- **A driver's licence.** Start on a FLIRT in fair weather on line 70.
  Unlock the KISS, night runs, snow, single track on line 2 (where crossing
  times matter), then the freight with its long braking distances, then the
  EC. That is a progression that teaches the physics.
- **The dispatcher game.** On line 2 and S21 the single track makes crossings
  the whole puzzle. Give the dispatcher the holds and the loop choices, add
  disruptions (a failed unit at Piliscsaba, a signal failure, a late
  freight), and score total delay minutes. Very few games do this with real
  track layouts.
- **Discovery** (the owner's "people could discover the Pilis and the Dunakanyar"):
  - **A photo album.** Photograph each landmark and peak from the train, the
    plane or the car. The POI list exists (`tour.js buildPOIs`). A card
    records where it was taken, the weather and the time.
  - **Challenges.** Fly under the Danube bridges; land the helicopter on the
    Citadella; drive the car across every Danube bridge; ride every line end
    to end.
  - **A daily challenge** seeded by the date: the same weather, service and disruptions for everyone.
- **Free play stays free.** Scoring should never nag in sandbox mode. Missions are opt-in.

## Making it a worthwhile experience

1. **The first five minutes.**
   - A loading screen with progress and a real Nyugati photo.
   - One "Indulás" button that starts a nice default: the next S70 in daylight, the cab, auto-drive with a hint to press M.
   - A four-step overlay: look around, the mode bar, M for manual, ? for keys.
   - The long menu stays behind "Részletek".
2. **Station announcements.** Hungarian text-to-speech ("Tisztelt utasaink,
   a vonat Vác állomásra érkezik"), or the owner's own recordings for the
   bigger stops. With the chime this is the most atmospheric sound there is.
3. **One language** (Hungarian first), including the English leftovers listed above.
4. **Presets:** Low / Medium / High (resolution, city radius, shadows off, fewer people), picked automatically on first run from the measured frame rate.
5. **A mobile mode:** touch buttons for the lever and the camera, the passenger and Kilátás modes as the main offer, a smaller city radius.
6. **Remember things:** line, time, weather, resolution, unlocked items (localStorage).
7. **A photo mode:** hide the UI (U exists), free camera, time of day, a share button that saves a PNG.

## Where it can grow

**More lines**, now cheap with `build_s21.sh` as a template:

| Line | Why |
| --- | --- |
| 71 (Veresegyház) | Already half there. |
| 40 | Kelenföld – Budafok – Háros – Pusztaszabolcs: Budafok and Háros are already in the city tiles. |
| 1 | Kelenföld – Tatabánya. |
| 80 | Hatvan. |
| 100a | Cegléd. |
| HÉV H5 | Batthyány tér – Szentendre along the Danube: short, iconic, and inside the city box for half its length. |
| Tram 4/6 on the Nagykörút | The city layer makes a tram line mostly a track-and-timetable job. A tram driving mode through Pest would be unique. |

**One world instead of one frame per line.** The city tiles already place
themselves by lat/lon. Doing the same for the terrain (tiles instead of one
heightmap per line) would let the lines join at Nyugati and Kelenföld. You
could then drive S70 into the city, watch S72 leave, and switch lines without
reloading. This is the biggest architectural step, and it builds on what now exists.

**Data**, per DATA_SOURCES.md: MÁV GTFS for every line's timetable; a DTM
for real ground; OpenRailwayMap signal types and speeds; `roof:shape` and
`building:colour` on ordinary buildings; OSM `natural=tree` for street trees.

**Tech**
- City tiles in a binary format (they are base64 inside JSON now), built in a Web Worker.
- A far LOD: merged low-detail blocks for tiles 3–8 km away, so the skyline does not pop.
- A headless test script run by CI.

## Suggested next three steps (as written on 24 Sep; 1–3 are now done, see the table above)

1. **Collision world and the car/plane against it.** The biggest "is this
   real?" gap, and the basis for the crossing and derailment moments.
2. **The first five minutes and one language.** A loading screen, the
   "Indulás" quick start, a four-step intro, Hungarian HUD and menus,
   remembered settings, and station announcements.
3. **Missions with a scorecard** for line 70 and line 2 (punctuality, stop
   accuracy, comfort, safety, energy), with stars and personal bests, and the
   single-track dispatcher puzzle on line 2 as the second game mode.

## Next, after 25 Sep

1. **Play it by hand.** Missions and the collision world were tested by
   script. Their difficulty (the star thresholds, the energy scale, the
   derailment margin) needs a human.
2. **The dispatcher game needs traffic.** A peak-hour timetable for line 2
   (every S72 and Z72 of the printed timetable plus the freights) or a
   "rush" factor, then the shadow comparison will mean something.
3. **Leftovers from the list above:** stadium roofs and courtyards (inner
   rings), city-tile roads never leave the traffic and drive grids when their
   tile is dropped, the far heightmap under Kispest and Budafok, and line 70's
   real timetable (MÁV GTFS).

## Round 8 (25 Sep, afternoon): done

Details in `CLAUDE.md`, "eighth pass". In short:
- **Name and language:** Dunakanyar Szimulátor with the owner's logo; a HU/EN toggle.
- **Photo mode:** depth of field, tilt-shift, grading.
- **Graphics switches:** depth of field, motion blur, corner shading (AO).
- **Announcements:** recorded with a local Hungarian voice.
- **Façades:**
  - panel blocks from the purchased packs, in pastels;
  - house and tenement variants;
  - OSM `building:colour` and `roof:colour`.
- **Traffic:** per-kilometre density by road class.
- **Wagons:** parked wagons no longer stand on the running line.

The owner's verdict: the AO and the building colours were the big upgrades,
and motion blur "works surprisingly amazing when speeding".

## Round 9 backlog (owner feedback, 25 Sep evening), in the order it will be done

**A. Wrong things, fixed first**
1. **Villages look like tenement blocks** (Verőce), and so do Népsziget and
   MÁV-telep. The bake's "dense block ⇒ bérház" rule gives any crowded
   untagged house 11.5–19 m. It should hold only in the dense city. Village
   houses need a village façade: one or two windows a side, a door, a gable.
2. **A hangar that is not there**: Újpest; the tram depot at Határ út. It is
   the barrel vault given to `building=train_station` footprints with no levels.
3. **Power-line pylons are turned 90°.**
4. **Depth of field hunts near the train.** Its ray misses the train. It
   should focus on the thing being followed.
5. **Half a lake** (Dunakeszi tó). The water plane is the Danube's level, so a
   lake higher than the river shows as flat blue ground. It needs its own level.
6. **Cars vanish under the road from above.**
7. **Photo mode still runs** planes, ships and road traffic.
8. **Dragging to look around sometimes drags the page**, and orbit sticks.
9. **Drone follow (camera menu) does nothing.**

**B. Small features**
- U cycles: panels hidden but labels kept, then everything hidden.
- Orbit with the mouse in the car and the plane.
- Photo mode:
  - orbit round a point;
  - place lights;
  - stickers (the Designsoup pack), to place, scale, rotate and flip;
  - captions;
  - light effects before saving.
- Seasons on the ground: spring green, summer gold, stubble after harvest,
  ploughed brown in autumn, winter grey.
- More traffic on the roads.
- A pumping heart at Dobogókő ("the heart chakra of the world"), as an easter egg.

**C. The asset pipeline** (the owner bought the packs: GGBot PSX cars, PSX
houses, PSX street, farm, warehouse, traffic templates, textures).
- Blender headless (FBX → glTF), then a bake to compact meshes and texture
  atlases, then an instanced textured-mesh program.
- Then:
  - real car models;
  - village houses and farm buildings;
  - street props: traffic lights, bus stops, benches, electric boxes;
  - garages.
- Not a "PSX look": the models are used at the game's own low resolution
  and lighting.

**D. More of the world, from data**
- **All the railways in the city**, not only our lines' own tracks:
  Kőbánya-felső, Keleti, the Kelenföld–Ferencváros link, the yards.
- **Industry:**
  - pipelines (`man_made=pipeline`);
  - the tanks at Richter and Egis;
  - solar farms as dark glass that catches the sun;
  - the Határ út TV tower, modelled properly;
  - quarries and lookout towers on the Pilis;
  - more points of interest per line (named buildings, works, memorials).
- **Vegetation:**
  - at least seven tree forms;
  - bushes;
  - crop fields;
  - orchards and vineyards;
  - flowers;
  - denser forest.
- **People:** walking, not only standing on platforms.
- **Places the owner annotated:**
  - S21: Mexikói út tram depot, Bosnyák tér's orange blocks, the prosecution
    service tower at Zugló, Kőbánya alsó's elevated station over the road, the
    Szent László church, KÖKI;
  - line 2: Széchenyi fürdő;
  - Esztergom and Štúrovo roads.

**E. New lines**
- The Királyréti kisvasút (Kismaros–Királyrét): the Mk48, green coaches,
  dense forest.
- Tram 1 and 4/6 on the Nagykörút.
- HÉV H5 to Szentendre.
- The Keleti/Kelenföld–Háros link.
- Then one world: terrain tiles, so the lines join.

**Also asked:**
- **How big is the map?** See README, "How big it is": about 510 km² of
  city, 950 km² of line corridors, and 6,500–9,500 km² of terrain per line.
- **Would it run on a uConsole?** Probably only at the lowest quality. The same README section explains why.

## Round 9: where it stands (25 Sep, night)

"Seen" means I looked at it in the running build. "Built" means the code is
in and the tests pass, but I have not looked at it on screen.

**A. Wrong things**

| # | item | state |
| --- | --- | --- |
| 1 | Villages as tenement blocks | Fixed. The bérház rule now needs a dense block, ≥ 26% cover and a mean footprint ≥ 300 m². Small untagged houses outside it are 3.2–4.6 m and get a village façade: plinth, 1–2 windows a bay, shutters, a door. **Seen** at Verőce. Népsziget and MÁV-telep not looked at. |
| 2 | Hangars that are not there | `roof:shape=round` over 1,500 m² that is not a station gets a row of low vaults, not one big one. **Built**; Újpest and Határ út not looked at. |
| 3 | Pylons turned 90° | Each pylon now faces along the line of its two nearest neighbours, and the cables use each pylon's own arms. **Built**; not looked at. |
| 4 | DOF hunts | It focuses on what is followed (train, car, plane). Otherwise it casts a ray every 0.3 s. |
| 5 | Half a lake | A lake that is not at river level takes the lowest ground within 60 m as its level. **Built**; Dunakeszi tó not looked at. |
| 6 | Cars under the road | Cars get a stronger polygon offset than the road, and ride the road's chord, not the ground. |
| 7 | Photo mode still runs | Everything stops. **Seen.** |
| 8 | Drag moves the page, orbit sticks | Default drag prevented; the drag ends on pointerup, cancel, lost capture and blur. |
| 9 | Drone follow | Fixed (it read an undefined clock). |
| – | Found on the way | `demAt` read the heightmap half a pixel (13 m) off the drawn terrain, so anything placed from the CPU sat metres under or over it on slopes. The terrain shader's flood rule used the river level at the frame's south edge everywhere. Both fixed (NOTES.md, Traps 12–13). **Seen:** line 70 at Vác, Verőce and Zebegény looks as before. |

**B. Small features**: all in.
- U cycles through three levels (labels kept, then nothing).
- Mouse orbit in the car and the plane.
- Photo mode: orbit, lights, stickers, caption and effects. **Seen**, including a saved PNG.
- Seasons on the ground.
- More road traffic (denser per km, turns prefer the same road class).
- The Dobogókő heart. **Seen.**

**C. Asset pipeline**
- Done: the cars. GGBot's pack is baked into 8 models and 33 skins, drawn instanced and textured. **Seen.**
- Not done: houses, street props (traffic lights, bus stops), farm buildings.

**D. More of the world**
- **City extras**, baked into the city tiles (`bake_cityx.py`):
  - 4,754 rail and tram ways, 1,887 structures, 292 overground pipelines, 22 solar farms, 2,974 ranked labels.
  - **Seen:** the Határ út TV tower (concrete shaft and pod; its ~100 m height is my estimate, OSM has none), the silos at Kőbánya, the rail corridor there.
- **Outside the city** (`bake_linex.py`): per-line labels (quarries, lookout towers), solar farms, pipelines.
- **Vegetation:**
  - Four new tree forms: fruit with spring blossom, walnut, spruce, birch.
  - Denser forest, and garden trees in villages. **Seen.**
  - Not done: bushes, vineyards, flowers.
- **Not done:**
  - walking people;
  - the annotated places on S21 and line 2 (Mexikói út depot, Bosnyák tér, the prosecution tower, Kőbánya alsó, Széchenyi fürdő, Esztergom/Štúrovo roads).
  - Except the TV tower: that one is in.

**E. New lines**
- **The Királyréti kisvasút:** in line 70's world. **Seen:** the Mk48 and three coaches on the track, the forest either side. See the README.
  - The trees along its track are cleared through the cover texture's spare alpha channel.
  - Its rail height is the smoothed ground, never below the ground itself.
- **Not done:** trams 1 and 4/6, H5, the Keleti/Kelenföld–Háros link, and one world. The city's tram and rail tracks are drawn, but nothing runs on them.

## After round 9 (25 Sep, evening; pushed as d99eb53)

- **Kisvasút:** its world is extended to Királyrét. **Seen.**
- **Cars:** lighter; the shader darkened the paint.
- **Danube raised:** the chequerboard is fixed. **Seen** at Göd with +4 m.
- **The city's trees from the BP Fatár cadastre:** 304k trees and 101k shrubs and flower beds, plus 18.6k benches, bins, statues and fountains. **Seen** from above over the Városliget and at street level. See README, "The city's trees".
