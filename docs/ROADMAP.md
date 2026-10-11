# Roadmap: where the project stands and what comes next

Written 26 Sep 2026, after S-14, from a read of every row in
[OWNER_BACKLOG.md](OWNER_BACKLOG.md), the S-12 specs, the code audit, and the
session logs.
- The backlog stays the list of record; this file groups it into stages.
- When a stage is finished, mark it here and in the backlog.
- It is a plan, not a promise: the owner reorders it whenever they like.

## Where it stands (26 Sep 2026)

- **Three lines,** with a real timetable on each:
  - 70: Nyugati–Szob;
  - 2: Nyugati–Esztergom;
  - S21: Nyugati–Lajosmizse.
- **Budapest:** streamed in 540 tiles, with 252k buildings and 304k real trees.
- **Traffic:** trams on 7 lines, road traffic, ships and aircraft.
- **Other modes:** a car, three aircraft, photo mode, missions, HU/EN.
- **Code and data:**
  - 33 source files, about 18,400 lines of JS;
  - 52 Python tools;
  - 76 MB of baked data.
- **Tests and history:** 28 headless tests; 50 commits on `main`; pushed after every owner review.
- **The owner's backlog:** 172 rows.

| status | rows | meaning |
| --- | --- | --- |
| done | 90 | in the game and seen |
| built | 27 | in the game, **not seen by anyone yet** |
| partly | 22 | started; the owner's point not fully met |
| open | 29 | not started |
| answered | 2 | questions |

## Feedback deep dive

### What the owner keeps coming back to

Grouped from the backlog's rows, with how often the theme recurs across
messages:

1. **Places they know, looking like themselves** (the largest group, about
   40 rows).
   - Nyugati, the castle, the bridges, Népsziget, Újpest.
   - The whole S21 list: Zugló, Kőbánya, KÖKI, Kispest, the airport.
   - Széchenyi fürdő, Esztergom.
   - The owner judges the game by places they have stood in. "I love my city."
2. **Data over invention** (stated in five messages).
   - Gemini's hand-typed models were removed at the owner's request.
   - The landmark models they like were kept, anchored to OSM.
3. **Infrastructure made visible** (about 15 rows).
   - Quarries, works, pipes, tanks, power lines, rails, pumpjacks, overpasses.
   - "Stunning" was said about the brick works and quarries.
4. **Life** (about 12 rows).
   - Denser traffic ("amazing density" once fixed).
   - People, and people walking.
   - Trams, birds, props.
5. **Ground truth of the railway itself** (repeated three times over 26 Sep).
   - Overpasses, banks, cuttings.
   - Which stock runs where (the 416 on S21).
   - Platforms.
6. **A lighter look, modern effects** (about 10 rows).
   - A pastel palette, not grey.
   - DOF, motion blur, AO with sliders.
   - Not a "PSX look".
7. **One world** (named in the 25 Sep prenight feedback).
   - All lines, trams and vehicles in one map, and hopping between them.

### What worked

- **The owner's photos give the fastest, most accurate fixes.**
  - The Zugló aerial settled in one round what three rounds of "I can't reproduce it" hadn't: the line is on a bank.
  - The Kispest photos showed exactly what OSM already had (a low island, a footbridge).
  - **Ask for a photo or a map link for every place-based request.**
- **OSM almost always has more than the game uses.**
  - Platforms, their heights, footbridges and building parts were all in OSM, unused.
  - Before inventing, query the spot (`tools/overpass.py` with `around:`).
- **Fixes scoped to where they are needed.**
  - The raised-stretch rules apply only inside `route.raised`, so the lines the owner had already approved did not move.

### What keeps going wrong

- **The elevation data smooths out railway earthworks** (30 m cells).
  - Every bank, cutting and grade-separated crossing is suspect.
  - Zugló (the bank) and the airport road (the cutting) were both this.
  - **Expect more** on line 70 (Rákospalota, Újpest) and line 2 (Óbuda).
  - The tool now exists (`raise_profile.py`); what's missing is a survey.
- **"Built" is piling up.**
  - 27 items are in the game but nobody has looked at them: fullscreen, pinch zoom, trees, vapour, announcements, Erzsébet híd, Fót, Aquincum pylons, Dunakeszi tó…
  - Each is a small risk of a quiet regression.
- **Places the owner can't find again.**
  - Újpest "swallowed houses" and "cuts through the station" are both unreproduced for want of a spot.
- **One-off bugs across many files.**
  - `main.js` is ~3,900 lines, and each new feature adds a pass to it.
  - The One World stage will need it split (see Stage 5).

## Waiting on the owner

- **Újpest:**
  - the spot where "the terrain is too high, houses look swallowed";
  - the spot where "it cuts through the station".
  - A screenshot, or the km on the HUD, would do.
- **"Cars: models are slow, drive model cars directly":** slow to draw, slow to drive, or "let me drive the proper car model"?
- **Priorities:** which stage first after Stage 0 (below). The default order is the one written here.

## The stages

Each stage is a set of backlog rows that belong together. Sizes are in
sessions like S-13/S-14 (one long working session each).

### Stage 0: review pass and housekeeping (≈ 1 session). In progress, S-15

S-15 (see `SESSION_S15.md`) did:
- a bug census, with seven classes fixed: roofs, dark blocks, junctions, stubs, trees, flower beds, the tram;
- the two quick checks, with grain and chroma fixed;
- both performance items.

Left:
- the owner's look at the built rows;
- the Északi összekötő glitch;
- the Népsziget water;
- the Újpest station.

Settle what is already in before adding more.

- **The owner looks at the 27 "built" rows.**
  - A checklist is in the backlog; its status column says "built".
  - For each one, either confirm it (mark it done) or say what's wrong.
- **Two quick checks nobody has made:**
  - does the resolution (élesség) setting work;
  - are grain and chroma too subtle to notice.
- **Leftover glitches:**
  - the texture under the Északi összekötő;
  - the Népsziget water on line 2;
  - the Újpest station (needs the spot).
- **Performance** (from the audit, not in the backlog before today):
  - the frame loop rebuilds trains, signals and cars into new arrays every frame (garbage-collection stutter);
  - the 48-streetlight loop runs in every fragment, which should be capped on low quality and phones.

**Done when** no row is "built" without a date and a "seen", and the two
performance items are measured before and after.

### Stage 1: the south, S21, with the same care as the north (≈ 2 sessions)

The owner's most-repeated list ("environments on the list", three times).

- **An earthworks survey** of every S21 crossing: for each OSM bridge or tunnel over or under the line, compare rail height, road height and ground. Apply `raise_profile.py` where the data says bank or cutting (the owner's "no level difference" is the test).
  - Then the same survey for line 70 inside Budapest.
- **KÖKI "done right":**
  - the terminal, the M3's surface yard tracks (in OSM);
  - on the other side, warehouses, parking decks and rundown houses (OSM first).
- **Kőbánya alsó:**
  - the station raised over the road is done;
  - still to do: its tram, the "Asian street", Népliget.
- **The Mexikói út tram depot:**
  - OSM tracks and halls;
  - the depot's trams standing in it (`trams.js` can park cars).
- **Zugló:**
  - the ügyészség tower. OSM says `building:colour=brown`, which renders orange; the real one is grey-brown with tinted glass.
  - Bosnyák tér's "orange" blocks.
  - A muted colour table for OSM's named colours would fix both, and every other "brown" or "orange" building.
- **Other places:**
  - Szent László church ("looks junk"): OSM building parts, or a small model like the landmarks;
  - Akadémia-újtelep, the cemetery, the prison, the data centre;
  - Egis and Richter (tanks and pipes are drawn but haven't been looked at there).
- **The airport:**
  - runways, aprons, terminals and hangars from OSM;
  - parked airliners;
  - the airliners already fly over it.
- **Kispest left-overs:**
  - the concrete panel fence along industrial land (a generic rule, since OSM lacks it);
  - station buildings in MÁV yellow when tagged `building=train_station` and uncoloured;
  - the Bzmot railcar as scenery.

**Done when** the owner has driven S21 from Nyugati to Kispest and names no
place that looks wrong.

### Stage 2: life and props (≈ 2 sessions)

- **People walking:**
  - on pavements near stations and in the city tiles (footways are in OSM);
  - at crossings;
  - in parks.
  - A cheap version first: people on sidewalk polylines, like `RoadTraffic` but slower.
- **Traffic lights:**
  - OSM `highway=traffic_signals` nodes;
  - a pole and heads at each;
  - cars stop on red (a cycle per junction).
- **Purchased packs:**
  - village houses, street props (benches, bins, bus shelters, electric boxes), farm buildings and garages;
  - this needs the FBX → mesh converter (Blender is installed) and the textured model program the cars already use.
- **Outside Budapest:** bushes, flowers and vineyard rows; fields by crop (OSM `landuse=farmland` + `crop`).
- **Courtyards cut out of blocks** (the owner: "doesn't matter much"; last).

**Done when** a station in the morning rush has people coming and going, and
a village street has props.

### Stage 3: the north and the Bend, second pass (≈ 1–2 sessions)

- **Line 2:**
  - industry before Dorog;
  - Pilis POIs and lookout towers (labels are baked; look at them);
  - the stations cut off at the end of the window (Miklósffy kápolna, Urkuta…) wait for Stage 5.
- **Szentendre and the island in detail:** the old town's parts and churches, the HÉV terminus.
- **The Pilis villages on the west bank** (Pomáz, Pilisborosjenő…).
- **Budapest places still "partly":**
  - Nyugati (reworked twice, still "lacklustre");
  - the castle district;
  - Széchenyi fürdő ("super junk": OSM parts, or a landmark model);
  - Népsziget's shipyard;
  - the Istvántelek façades.
- **Earthworks survey** for line 70 and line 2 (see Stage 1).

### Stage 4: the network grows (≈ 3 sessions)

The pieces One World will join, each useful on its own.

- **Trams you can board and drive:**
  - the 4/6 first (the Grand Boulevard, Combino);
  - then 1, 2, 3;
  - they need their overhead wires.
- **HÉV H5** (Batthyány tér – Szentendre): a new "line" of its own, built the way S21 was (`build_s21.sh` as the template).
- **Line 71** (Rákospalota – Veresegyház – Vácrátót): the alignment is broken, no context.
- **The Keleti – Kelenföld – Háros line:** its rails are drawn; it needs a route, stops and trains.
- **Freight on the rings:** Ferencváros, Rákosrendező yards.

### Stage 5: One World (≈ 4–6 sessions, a real refactor)

`UNIFIED_ENGINE_SPEC.md` has a proposal; treat it as a starting point. The
decisions to take first:

- **One frame, or one frame per region.**
  - Each line has its own origin today.
  - One global origin with float32 vertices loses precision beyond ~20 km from it: vertices jitter at 1 cm steps, and the train meshes already needed per-quad normals for this.
  - The usual answer is camera-relative rendering (subtract a camera origin on the CPU before upload), then one frame for all data.
- **Streaming:** load lines, contexts and heightmaps by region, the way the city tiles already are, instead of one line at a time.
- **Vehicles:** one registry of everything that moves (trains of every line, trams, HÉV, cars, ships, aircraft), and "hop into this one".
- **`main.js` split** into passes and systems. It is the file every change touches.

**Done when** you can ride line 70 to Nyugati, walk (or hop) to a tram, then
take S21 out, without a reload.

### Stage D: the dark timeline (runs alongside; the owner asked for it on 26 Sep)

A sandbox of disasters, off unless the address says `?mode=dark`. The spec
(`DARK_TIMELINE_DISASTER_SPEC.md`, Gemini) is a proposal; this is the
order of work.

1. **Done (S-13):** K strikes the point in view (fireball, sparks, a burning wreck, boom, shake).
2. **Done (S-15):**
   - three weapons (J);
   - craters in the ground, roads and track;
   - scorched ground;
   - buildings and trees in the blast gone to rubble (shaders, no rebuild).
3. **Next:**
   - a small panel: weapon, size, "clear all";
   - remember the craters for the session (and in the photo album's pictures);
   - vehicles drive into the crater instead of over its old surface;
   - a train that meets a crater derails (the derailment code exists).
4. **Then:**
   - the landmarks and OSM parts damaged (the Parliament, bridges: a broken bridge deck drops into the river);
   - fires that spread along a block;
   - the catenary down near a strike, so electric trains stop.
5. **Later, from the spec:**
   - moving hills (a landslide on the Gellért-hegy);
   - floods beyond the Danube slider;
   - a scripted "scenario" or two.

### Stage 6: the game on top (any time; small pieces)

- **The dispatcher game:** it needs denser traffic or a real bottleneck (the single track on line 2 or S21 at the rush).
- **An infrastructure tour for the owner's students:**
  - a guided Kilátás route with captions;
  - the quarries, works, bridges and yards.
- **Missions** on the new lines and trams.
- **The running cost of a diesel run** (the owner's side idea).
- **Graphics ideas the owner asked for** (26 Sep):
  - sun shafts through cloud gaps;
  - cloud shadows on the river;
  - heat shimmer over rails in summer;
  - wet-road reflections after rain.

## Recommended order

1. **Stage 0 now.**
   - It is small.
   - It clears 27 unverified rows.
   - The performance work pays off for everything after it.
2. **Stage 1:** the owner's most-repeated request, with the tools from S-14 in hand.
3. **Stage 2 or Stage 4**, whichever the owner cares about more ("life" or "more to ride").
4. **Stage 5** only after Stage 4 has the pieces, and after a decision on the frame question.
5. **Stages 3 and 6** interleave as breathers.

## Rules that stay (from the owner)

- Commit or push only after the owner's review.
- Accuracy from OSM first; ask for a photo when a place is wrong.
- Don't invent buildings.
- Plain docs: say what was seen and what wasn't.
- Every string in Hungarian and English.
- Never commit the raw asset packs.
- Be kind to Overpass and BP Fatár.
