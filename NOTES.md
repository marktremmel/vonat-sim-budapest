# Backlog

## Resuming this project in a fresh session
Everything needed is on disk; nothing important lives only in a conversation.

1. Read `README.md` for how the thing is built and every known limitation.
2. Read this file, starting with **"Traps"** below — that section is the most
   valuable thing here. Every entry in it cost real time to find.
3. `cd szob-fele && python3 tools/build_sim.py` rebuilds `dist/` from
   `web/src`. Raw-data rebuild commands are in the README; the window is
   `SZOB_KM=0,63.6`. **`bake_world.py` run without that variable rebakes the
   Bend alone and silently moves the frame every other baked file is expressed
   in.** It happened on 24 Aug; the recovery is to rerun the whole chain.
4. **Read TESTING.md.** What to check, the console harness for each check, the
   known-good numbers, and where to point the free camera (`shift+C`) to look
   at each piece of work. Both instruments that found real bugs this week are
   in there, together with the ways each of them lied first.
5. `.claude/launch.json` starts a no-cache dev server on 8177 serving `dist/`.
6. Source layout is in the README under "The simulator".

Design decisions already settled are recorded under "Confirmed working" below
and in the memory note `szob-fele-sim-decisions`. Do not re-open them without
being asked.

## Sixteenth pass — weather that moves, and a test document
- **The cement works**, at last, and the way in was the correction from two
  passes ago: the plants are named on their `landuse=industrial` relations, so
  the relation is the anchor. Position, axis and extent from data; the tower,
  kilns, silos, stack and store invented, which is the licence Mark gave and
  is stated plainly in the README.
- **Quarries** got their own cover class. They were being painted in factory
  grey, which threw away the cut face on the Naszály.
- **Zoom is a dolly outside the cab** and a lens inside it.
- **Vehicles are drawn as far as the camera can see** — the reach grows with
  height above ground, so they no longer stop in a circle around the free
  camera.

### Still open, for the next session
- Panelház facades: Mark's word is "so so". The pastels and the grid are in;
  what is missing is the bay rhythm — a real slab reads as vertical strips of
  balcony and window, not an even grid.
- Power lines and pylons. `q_structures.ql` already asks for `power=tower` and
  968 come back; nothing draws them yet, and a transmission line crossing the
  Bend would be worth having.
- Leaf transparency, which Mark says "didn't make the cut".
- The largest quarry (Sejcei mészkőbánya, 1.6 km across) did not appear in the
  raster sweep — worth checking whether it is a relation the cover bake is
  skipping.
- Boot has drifted from 0.6 s to about 1.9 s across the session. Some of that
  is a browser that has loaded an 11 MB page two hundred times, and some is
  probably real. Measure it cold before believing either.


- **Fronts.** Next up 0, the last of the original list. A front is a chainage,
  a speed and the two air masses either side; the weather you get is the blend
  at your own chainage. Everything downstream reads one resolved object, so
  nothing else had to change. Verified across an edge at km 30: rain 0.53 and
  9.8 km visibility behind it, half of each at the line, clear and 28.7 km
  ahead.
  - **The sides were inverted first time.** "Behind" a front is the new air —
    the side it has already passed — and I had the new sky arriving in front
    of the edge, which is a wall of rain retreating from you at 40 km/h.
  - Fronts hand over: when the edge leaves the line the new air becomes the
    baseline and another sets off from the other end.
- **The animator turns weather by fronts** rather than swapping the sky
  outright, which was a slideshow — everything changed everywhere at once and
  nothing arrived from anywhere. Its fronts run ten times faster than the real
  ones on purpose; a real one takes three quarters of an hour to cross.
- **TESTING.md**, which is the thing this project has most needed. What to
  check, the console harness for each, the known-good numbers, and where to
  point the free camera to see each piece of work. Both instruments that found
  real bugs this week are in it, along with the ways each of them lied first.

## Fifteenth pass — the shimmer, and Margitsziget

**The shimmer was one bug, and Mark described it exactly.** "It feels like it
tries to render twice on the same position just different colors." It was not
two draws. It was one draw disagreeing with itself: the polygon buildings —
the city's real footprints — took their surface normal from the fragment
shader's screen derivatives, and on a wall seen at a shallow angle those
derivatives are nearly parallel, so their cross product is a small number made
of rounding error. The normal landed somewhere different in every pixel, the
lighting followed it, and a flat wall came out as two shades interleaved.

Measured, once the poly and box layers could be toggled apart: **boxes alone
0.00% speckled pixels, polygons alone 3.64%.** Every triangle now carries a
normal worked out from its own three corners, handed to the track program
through an optional third attribute that other meshes simply leave disabled.
**3.57% → 0.02%.**

Four things were ruled out first, each with a measurement, and all four were
innocent: z-fighting against the ground, the road markings, the kerbs and the
caps at way ends. Two more were real but were not this: the instanced box
buildings now carry analytic wall normals too, and `flatNormal`'s fallback is
blended rather than switched, because a hard threshold flickers along the line
where it changes its mind and trades one speckle for another. A fallback of
"up" is right for a road and catastrophic for a wall, and one program draws
both — which is why the attribute exists.

**Margitsziget was under the Danube.** Six hundred buildings on it, sunk to
the rooftops, and the ground beneath them ten metres above the water. A river
is an OSM multipolygon and its islands are its inner rings; the land-cover
branch of `bake_world` has always honoured holes, and the water branch never
did — it took only the outers, so the Danube was painted straight over the
island. 5725 pixels of island given back, on this line. The first attempt
failed silently because the paint order was a tuple of three booleans that
sorted the islands BEFORE the water.

Also: `COVER_COL` in geom.js was two entries short of the shader's palette, so
the corridor drew every park beside the line in the dark grey of ballast.

**And a free camera**, `shift+C`, which is what made all of the above findable
in the first place — Margitsziget is 1.5 km west with Újlipótváros in front of
it and cannot be seen from the cab at all. WASD, R/F for height, shift to go
faster, and it starts wherever the train is. This is the tool the project has
been missing: half of what was built this week could not be confirmed to exist
without driving past it and hoping.

Plus, from Mark's second list: the panel is two tabs (Menet / Beállítás) with
the rendering settings on the second, `U` or the corner button hides the whole
interface, and there is an **animator** — the day, the year, the weather, or
all three, drifting on their own while you sit in the cab.

## Fourteenth pass — the defects on Mark's list
Worked from his list. What each one turned out to be:

1. **Bridges too low.** Whether a bridge crosses the railway was measured at
   its VERTICES, and a bridge spanning a fourteen-road throat has no vertex
   anywhere near the track: Ferdinánd híd's nearest vertex is 39 m from the
   down line while the way itself passes 2 m from it. It was therefore not a
   railway bridge at all and got 1.8 m of clearance instead of 6.6. Measured
   along the segments now — the same fix, and the same lesson, as the level
   crossings. 15 crossing bridges became 17.
2. **"Dózsa György should be an overpass where the cars go under."** Right,
   and the road was riding over the tracks because the corridor grades the
   ground to rail level and the road sat on it. Ways OSM tags as tunnel or
   layer<0 within 40 m of the line are now DUG: 5.6 m below the formation at
   the closest approach, back up over fifty metres, with retaining walls. 34
   of them.
3. **Holes in the ground where the layers meet.** The corridor is built along
   the down line and reached 100 m; the terrain discards itself within 86 m of
   EITHER running line; the two lines part by up to 29 m at the stations. So a
   strip could be 86 m from the up line — terrain gone — and 115 m from the
   down line, outside the corridor. Nothing drew it. The corridor now reaches
   124 m, past anything the raster can discard.
4. **The shed tilted off its building.** It took its direction from the track
   tangent, and at Nyugati the platforms fan out in the throat while the hall
   stands square: ten degrees of skew. It now takes the edge-length-weighted
   direction of the footprint's own walls — 32° for Nyugati, with 99% of the
   perimeter agreeing with it or its perpendicular — and falls back to the
   track only where a footprint is not rectilinear enough to be sure.
5. **The opened map ran off the screen.** Sized on width alone; it fits both
   ways now.
6. **Windows that read as dots.** Three things at once: the grid was measured
   from a datum forty metres below sea level rather than from each building's
   own ground, so no row of windows lined up with any floor; bays were 2.7 m,
   which at two hundred metres is a third of a pixel and therefore noise, not
   detail; and the contrast between pane and wall was **98 luma measured off
   the screen**, a chessboard where a real facade shows a quarter of that.
   Storeys now count from the building's base, bays are drawn 4.2 m whatever
   the truth, lit rooms take two bays at a time, and the contrast is a third
   of what it was.
7. **Radio masts** are their own thing now, not chimneys: banded red and white
   in seven sections, bracing drawn both ways so it reads as a lattice rather
   than a spiral, aerials on top, and see-through, which is half of what says
   mast.
8. **Panelház in grey — and pastel where renovated.** Two in five by hash, in
   apricot, sage, pale blue, sand and dusty lilac, which is what Hungarian
   panel refurbishment actually looks like.

**And the thing underneath most of it.** The world renders at about 512 across
and is point-upscaled — that is the look — but everything thin is below one
pixel there, and below one pixel it is not detail, it is noise: the contact
wire, the rails, the road markings, a window. Two answers, both applied.
Draw thin things **thicker than they are** (the contact wire is 12 mm and is
drawn at 100), and put the internal resolution **under Mark's hand** with the
Élesség slider — 0.6 is chunkier than before, 2.6 is nearly native and the
wires become wires. Frame time barely moves across the range: the GPU was
never the constraint.

Not the causes, though each was checked and ruled out with measurements:
z-fighting against the ground, the road markings, the kerbs, the caps at way
ends, and derivative normals going degenerate at grazing angles. The last one
was real and worth fixing anyway — `flatNormal` in `shaders.js`.

## Mark's list, 23 Aug 2026 — and the standing instruction
**"Let yourself creative freedom in order to make it work and be visually
good — more important than accuracy."** Recorded because it changes the
default. Where the data is thin, invent something plausible and legible
rather than drawing the thin truth. Say which is which in the docs.

Also standing: **ask OSM for more.** More queries, more tiles, more classes.
Ask in parts and stitch them together rather than one heavy query.

Raised, in his order:
1. ~~Bridges sitting too low~~ — Ferdinánd híd, and "Dózsa György should be an
   overpass where the cars go under".
2. Chimneys liked. Some are really radio towers: want red and white, built
   from triangles.
3. Power infrastructure — lines, pylons, substations.
4. Buildings flickering / dots / two colours — windows that do not read as
   windows.
5. Leaf transparency "didn't make the cut".
6. Cars disappear in the outside view.
7. Zoom changes focal length rather than moving the camera.
8. Panelház should be grey, or the renovated ones in abstract pastels.
9. The cement works still not seen; and the Naszály quarry, part of the hill
   cut away to yellow stone.

## Review — 23 Aug 2026, evening
A second pair of eyes over the day's work and the claims the documents make.
Everything here was checked against the raw data, not the prose.

**1. The "nothing is named" claim is false, and the mistake is instructive.**
The day's conclusion that Dunakeszi Járműjavító, Samsung SDI and the Váci
cementgyár are unnamed in the data — written into both this file and the
README — is wrong. All three are named `landuse=industrial` **relations** in
`landcover.json`: "Dunakeszi Járműjavító" (rel 11997707, km ~16.5), "Samsung"
(rel 16364462, Göd), "Duna Dráva Cement Kft." (rel 3973913, north of Vác).
Each carries full member geometry, so they are polygon-anchorable with zero
typed coordinates. The search that missed them printed only the first twelve
hits per file, and street names — Gyár utca, Szövőgyár utca — filled the quota
first. *Traps: a truncated search result looks exactly like a negative one.*
There are **374 named relations** in that one file — sites, parks, cemeteries,
quarries — none of them used as anchors for anything.

**2. Margit híd is downloaded and then thrown away.** Its 14 way segments
(`bridge=yes`, secondary + service) are in `data/raw/context.json`. The bake
keeps roads only to `ROAD_R` = 600 m; the bridge stands ~1.9 km out, so it is
dropped — while the query it came from fetches to 900 m and the buildings ring
to 2600. The fix is one condition: keep `bridge=yes` ways of secondary class
and up out to `BUILD_R`. A Danube bridge is the most visible built thing on
the river and the renderer already knows how to draw a deck, girders and
parapets.

**3. Margitsziget itself is fine** — 102 buildings, the víztorony landmark,
correct water level. What it is missing is *connections*: Margit híd (above),
Árpád híd, and its internal roads — and those last two are missing from the
RAW data, not just the bake, because `q_context_bp.ql` fetches only
`["building"]`. No highway query covers the island or the Buda bank.

**4. The corridor has never been asked for freestanding structures.** Every
context query filters on `["building"]`, so anything OSM maps as a bare
`man_made` node or way was never downloaded: chimneys, silos, cranes,
gasometers, masts — and monuments (`historic=monument`: Hősök tere's column is
one). This, not missing hand-models, is why the cement works has no 98 m
tower: **we never asked for it.** A tiny `q_structures.ql` fetching
`man_made=chimney|tower|silo|storage_tank|crane|gasometer|mast|water_tower`
plus named `historic=monument|memorial` over the whole corridor would be a few
hundred elements and would give the works their kilns, Hősök tere its column,
and the skyline its chimneys — all data-anchored.

**5. Stale documentation found:** the README's "Generated pages" still calls
the simulator "Slice 1: Vác to Szob in the cab" (the whole line ships); the
source layout list omits `catenary.js`; and the "cannot be recognised by
name" paragraphs in both files need the correction from finding 1.

**6. Approximations to keep in mind, none urgent:** the trainshed maps its
length onto chainage as `bm + u`, exact only where the track is straight
(true at Nyugati, would bend at a curved shed); a per-object cloud shadow
means a tall tower darkens all at once; the portal trim keeps the side of the
cluster nearer the down line, which is right until a portal group is ever
entirely to one side. Frame time at ×16 rose from ~3.5 to ~5.5 ms with the
day's meshes — fine at 60 fps, worth watching.

**Order of work from here:** correct the false claims (docs only), then
bridge-keeping and relation anchors in `bake_context.py` — both offline —
then the structures query, which needs Overpass.

## Plan for the twelfth pass — 23 Aug 2026
Written cold, from README.md, this file, and the current source. Baseline
checked first: `build_sim.py` rebuilds byte-identical to the shipped `dist/`,
and the bundle boots with `window.SIM` live and no console errors.

**Step 0 — split the files. DONE.** Nine files where there were two; how and
how it was verified is under "Structure" below. `ORDER` is now shaders,
engine, env, route, geom, trains, traffic, audio, clouds, weather, landmarks,
panel, cab, hud, input, main.

**Step 1 — make the docs true. DONE**, and it went the opposite way to what
it looked like from a cold read. The README and this file both say the
hand-modelled landmark layer is "the water towers and nothing else", and
`landmarks.js` plainly contains a Nyugati trainshed, a WestEnd and a
roundhouse — which reads like a stale document. It is not. `bake_context.py`
emits anchors for one name only, so those models are unreachable code and the
documents describe what is actually drawn. Both now say so explicitly.
The lesson is the one already in the Traps list: check what the data contains
before believing what the code appears to do.

**Step 2 onward — features, cheapest real gain first.**

1. **Overhead line.** There is no catenary anywhere on a 25 kV railway, and
   the cab has a meter for it. Masts at ~55 m from the alignment, cantilever,
   contact wire at 5.5 m with stagger, messenger at 6.8 m, portal gantries
   over the yard throats. New `catenary.js`, built at load like the corridor,
   drawn through the track program. All the data it needs is already baked.
2. **Station furniture** — canopies, lamp posts, buffer stops at Nyugati,
   boards. `geom.js buildStations`. Mark's second Budapest item; our stations
   are bare decks.
3. **Weather that develops** — Next up 0. A front at a chainage that moves
   along the line, two situations blended by distance from it. `weather.js`
   takes km; `main.js` hands it `driver.m`.
4. **The sound bed** — Next up 17, and the thing Mark has raised twice.
   Rolling noise in layers with stereo joint clicks, a traction bed that is
   not a drone. `audio.js` only.
5. **Cloud shadows on buildings and trees** — Next up 16. `CLOUD_FIELD_GLSL`
   is already shared; BLDG_FS and VEG_FS just do not sample it.
6. **Rain on the rails** — Next up 15. Adhesion exists per situation; make it
   accumulate, and add leaf fall in autumn.
7. **The live map** — Budapest 5. The inset is a baked PNG; after the split
   `hud.js` is the obvious home for one that draws the train, the other
   services and the stations it already knows.
8. Then terrain seams (6), shoreline tiling (7), floating buildings (10),
   dispatcher zoom (13), Szentendrei-sziget POIs (11).

**From the Gemini copy** (`gemini-afternoon.txt`, a different working copy —
none of its code is here): the only two things on it we do not already have
are the catenary and the moving front, both above. Its own log records a
1315 m projection shift and a rotation sign error from typing coordinates by
hand — which is exactly what the anchor system here exists to prevent. Do not
import coordinates from it.

## Traps
Things that were wrong for a long time before anyone noticed, and the shape of
mistake each one represents. Check these before believing anything.

1. **Geometry built is not geometry drawn.** `trainDyn`, `sigDyn` and
   `xingDyn` were uploaded every frame with no draw call for weeks. If a
   feature "doesn't appear", grep for the `drawArrays` before debugging the
   maths.
2. **Check the bounding box of every raw file before trusting it.** Three
   separate features were silently truncated at Vác because their Overpass
   query had a Bend-only bbox: `places.json`, `landcover.json` (56% of the
   world had no land cover) and the 1400 m building ring (no Margitsziget).
   `data/raw/*.json` are not all the same extent.
3. **`bake_route` sets the local frame from the near region's south-west
   corner.** Change the km window and every raw-derived file baked against
   the old origin is silently offset — `context.json` was 27.7 km out and
   still looked plausible. Rebake everything together.
4. **An oriented bounding box is a bad descriptor for a big building.**
   WestEnd is 322 x 305 m and nearly square; its principal-axis OBB says
   396 x 137. Anchor landmarks to the *polygon*, never the OBB.
5. **`bridge=yes` does not mean "over the railway".** Only 15 of 102 tagged
   ways actually cross the line; the rest span streams and other roads, and
   lifting them all to railway clearance put decks in the air over Dózsa
   György út. The bake records which ones cross.
6. **The Danube is not level** — 86 mm/km, 96.0 m at Nyugati against 100.1 m
   at Szob. A constant was 8 m too high at the Budapest end and drowned
   Margitsziget. And a pond is not the river: snap a water pixel to the river
   plane only where the ground already agrees.
7. **Hungarian stems, not words.** `"kápolna"` is not a substring of
   `"kápolnája"` — the seventh letter is á. Match `"kápoln"`.
8. **Clamp `dt` at zero.** A backwards timestamp ran the whole simulation in
   reverse, train, clock and weather.
9. **Measure before tuning.** The flange-squeal threshold was set from a
   guess and could never fire: the tightest curve on the line is 1.3 per km.

10. **One measurement, two questions.** How wide the tracks are at a chainage
    is asked by the overhead line (where does a portal replace a cantilever?)
    and by the trainshed (how far does the vault span?), and the right
    reduction is different for each. Clustering with a 12 m gap is right for
    a portal and keeps half of Nyugati for a shed; the plain reach is right
    for a shed and gives a 126 m gantry. Neither is "the" answer.
11. **A feature can make an old approximation wrong.** Pantographs extended a
    fixed 1.62 m for months and looked fine, because there was no wire. The
    day there was one, every pantograph on the railway stood clean through
    it. Adding something real is a good moment to ask what was only right
    because the real thing was missing.
12. **`demAt` and the GPU disagreed by half a pixel (fixed 25 Sep 2026).**
    `bake_world.py` samples each heightmap pixel at its centre, `(i + 0.5)`
    steps in, and the GPU's linear filter reads it the same way. `demAt`
    in main.js treated pixel i as the point i steps in. So everything laid
    on the ground from the CPU was 13 m off the drawn terrain: roads, cars,
    buildings, the corridor, the kisvasút. On flat ground that doesn't
    show. On a 20% slope it is 2.6 m, which is how the forest railway ended
    up under the hillside. Any new CPU sampler of a linearly filtered
    texture needs the same `- 0.5`.
13. **An `out` read before it is written.** TERRAIN_VS computed the river
    level from `vWorld.z` before setting `vWorld`, so the flood rule used
    the level at the frame's south edge everywhere (about 5 m low at Szob).
    It now uses the vertex's own north.

## Twelfth pass — the wire, the platforms, and Nyugati
- **The overhead line.** A 25 kV railway with no catenary anywhere on it now
  has masts, cantilevers, contact and messenger wires, droppers and portals
  over the wide formations, built at load from the running lines themselves —
  254k vertices, 38 ms to build, 0.17 ms a frame. `O` toggles it. The stagger
  is what makes it read: the wire swings 30 cm either side of the centre at
  every mast.
- **Pantographs reach the wire** instead of a fixed 1.62 m above the roof.
- **Platform furniture**: a canopy on one row of columns — 90 m at a station,
  30 m at a halt — and lamp posts along the rest. The lit part of a lamp is a
  separate mesh rebuilt only when the darkness moves by 0.06, and it is a
  lantern with sides, because a plate facing the sky is invisible from a
  train.
- **Nyugati is a shed, not a hull.** Position and direction from the track
  frame at its own chainage, length from the polygon, **span from the
  tracks**, springing from the polygon's eaves, hollow inside. See the README.
- **Window grids follow the wall now.** Both the panelház panes and the lit
  windows were projected on `(x - z) * 0.7071`, a fixed 45° diagonal, which is
  exact for a wall facing that way and sheared on every other one — Mark's
  "not sold on it". They use the wall's own axis, taken from the normal that
  is already to hand. The two grids were also on different pitches, so a
  panelház lit up in windows that were not where its windows are.
- **And they stop being drawn once they are finer than a pixel**, fading into
  their own average instead. That is the white fizz over a distant block at
  night: a window grid below the sample rate is noise, and the honest limit is
  an evenly lit wall.
- **Buffer stops** at Nyugati. Only four, because only four track ends there
  are real: thirty ends lie within the first kilometre and twelve of them
  share a chainage of 145 m, which is the edge of the extraction box. A way
  cut off by a bounding box looks exactly like a way that stops.
- **Cloud shadows on buildings and vegetation**, per object rather than per
  fragment. See "Next up" 16 for the measurement.
- Boot went from about 650 ms to about 870 on this machine, nearly all of it
  the six megabytes of wire going to the GPU.

12. **A truncated search result reads exactly like a negative one.** The
    works along this line were written up as unnamed and unanchorable on the
    strength of a search that printed its first twelve hits per file — street
    names filled the quota and buried them. They are named, on their
    `landuse=industrial` relations. Print counts, not just heads.
13. **The DEM is a SURFACE model and will lie about ground.** `demRidge` takes
    the highest sample nearby, which beside a city street is a roof: the eight
    ways of Margit híd report abutments from 96 m to 113 m along a level
    bridge. Anything that means "ground level" in a built-up area needs a
    second opinion — the water plane, the rail profile, anything but the DEM.
14. **One flat scope means one namespace.** `structures.js` and `catenary.js`
    both declared `STEEL`; the symptom is a blank screen and a `SyntaxError`,
    which looks like a broken feature. `build_sim.py` now refuses to bundle
    duplicate top-level names.
15. **`["building"]` was deciding what the world could contain.** Every
    context query filtered on it, so no chimney, silo, tank, gasometer or mast
    had ever been downloaded — the corridor's whole vertical vocabulary was
    missing, and it read as a data gap rather than a query gap. Before
    concluding that OSM lacks something, check what was asked for.

## Thirteenth pass — asking for more of the map
- **`q_structures.ql`**, and 201 freestanding structures inside 2.4 km:
  chimneys, silos, tanks, water towers, lattice masts, yard lighting. The
  FŐTÁV stack at 203 m and the Rákospalota incinerator at 120 are in the data
  with real heights and were simply never fetched.
- **Height from the site, where the thing itself is anonymous.** A chimney
  inside a 1.4 km² works is scaled 2.2x, one in a yard 1.5x, by
  point-in-polygon against the smallest containing `landuse=industrial`.
- **Margit híd exists.** It was fetched and then dropped by a 600 m road
  limit; bridges of secondary class and up now reach as far as the buildings.
  Decking it needed traps 13 and the chain rule — see the README.
- **Industrial heights by footprint size**: 60 halls over 6000 m² were all
  standing at the 9 m default. Tanks take three quarters of their span.
- `SIM.demAt` exposed; `state.show.structs` added; the bundler now catches
  duplicate top-level names.

## Picking up Budapest — what I would tell myself

The Bend looks finished and Budapest does not, and the gap is **density of
detail**, not any single missing feature. In rough order of value:

1. ~~**Nyugati properly.**~~ Done, 23 Aug 2026, and exactly as this said:
   span from the tracks, walls from the polygon, hollow. What it did not say,
   and what cost the time, is that the reduction from track offsets to "how
   wide" is not the same one the overhead line wants — see trap 10.
2. **Station detail generally**: canopies and lamp posts are in. Still
   missing: name boards that sit parallel, buffer stops anywhere, the yard's
   own lighting masts, benches, shelters, clocks and departure screens, and
   anything hanging from a canopy.
3. **Landmarks by polygon anchor** (trap 4): Hősök tere and the museums,
   Margit híd. Bridges like Margit híd are *linear* — anchor them to the OSM
   way they carry, not to a building.
   **Correction (same evening): the three works ARE named** — on their
   `landuse=industrial` relations in `landcover.json`, not on their buildings.
   The earlier "not one of them is named" was a truncated search reading as a
   negative result; see the Review section. Size still sets the floor height,
   and the site relations are the anchors for anything more.
4. **Silhouettes as sprites, not boxes.** Mark's suggestion and it is the
   right one: draw people the way the trees are drawn — a low-res billboard
   with the shape in the fragment shader, a few poses, slight sway. Cheap and
   far better than boxes.
5. **The inset map is a flat PNG** and looks stale beside everything else.
   It could show the live train, other services, the weather and the stations
   it already knows about.
6. **Panelház shading** — Mark is not sold on it. The window grid is laid out
   from world position, so on a building at an angle to the grid the grid is
   sheared. Project along the wall's own axis instead.
7. **More Budapest building depth**: `building:part` (only 9 in the data now),
   more roof shapes, and courtyards — a Pest block is a hollow square and we
   draw it solid.

**Ask Mark early**: whether to keep pushing Budapest detail or to spend a
session on the sound bed, which he has twice said is "not very enjoyable" and
which no pass has properly addressed.

Running list of everything raised and not yet done. Struck items move to the
README's "Settled" or "Known gaps" sections once they land.

## Confirmed working (do not re-open)
- Handedness — world z runs south; right turns are right turns.
- Track smoothing, corridor mesh, carve; the Dömösi ledge is clean.
- Timetable-driven traffic, 170 services; block working and holds.
- Terminate at last call and reverse — verified turning back at Szob.
- Lateness against a booked path, rebased onto the actual departure.
- Ezüst híd sun glitter. Camera drag. Dispatcher board.
- Station stops with passenger exchange.

## Done in the cloud pass
- All ten base types from the Nemzetközi Felhőatlas, with Hungarian names and
  the Hungary height bands: low under 2 km, middle 2–7 km, high above.
  Each is a deck at its real altitude and the view ray is intersected with it,
  so perspective is honest — a 9 km cirrus sheet reads flatter than a 1.3 km
  cumulus field without any special casing. Selectable from the panel.
- Shading comes from the noise gradient standing in for a surface normal, so
  cumuliform types get lit tops and shadowed bases while sheets stay flat, and
  fibrous types take the sun's colour straight through.
- Summer time: Hungary keeps CEST days 88–298. Checked against SunCalc for
  Vác on 15 July 2026 — ours 8.30°/292.99° at 19:36 against 8.42°/292.87°,
  culmination 12:49 both.
- Birds. There were none before; what sounded like one was the cicada band.
- Field furrows, rows and mown stripes, each field worked in its own direction.

## Done in the cab pass
- Cab enlarged and pushed forward, windscreen sill added so the circled corner
  seams are closed, brake-pressure dial, lamp column (ÉBER / AJTÓ / FÉNY /
  HOMOK) and a switch row. Default field of view widened to 78°.
- Clouds: fractal noise on a projected deck, lit from the side, thinning at
  the horizon, with a slider.
- Level crossings: booms that drop when a train is within 900 m, alternating
  red lamps, drawn only where OSM records an actual barrier.

## Done in the weather pass
- **A weather system**, not just a cloud picker. Fifteen Central European
  situations in `web/src/weather.js` — nyári anticiklon, gomolyfelhős
  délután, záporos hidegfront mögött, hidegfronti zivatar, szupercella,
  melegfronti esőzés, mediterrán ciklon, szitálás, anticiklonális köd,
  havazás, hófúvás, ónos eső, szaharai por, őszi párásság. Each names its
  decks, coverage, gloom, wind, precipitation, visibility and ground state,
  and everything downstream is driven from it.
- **Intensity, not brightness.** The slider is the strength of the situation:
  coverage, thickness, gloom, rain rate, wind and visibility move together.
  The same cold front gives broken cloud and a shower at 0.3 and a closed
  black base and a downpour at 1.8.
- **The cloud field is advected, not scrolled** — per-octave flow, per-octave
  turnover and a slow domain warp, so cells build, lean and dissolve. Higher
  decks run faster by a shear factor. Verified by A/B over 230 s of cloud
  time: the field is genuinely different, not translated.
- **Ns and Cb now read as rain.** Gloom removes the sunlit term rather than
  darkening it, pannus tears off underneath, rain shafts hang from the base
  where the deck is actually dense, and the Cb's anvil is tied to the tower
  that feeds it.
- **Precipitation** in world space with parallax and correct lean from fall
  speed + wind − train velocity. Rain, drizzle, sleet, hail, snow, freezing
  rain. Water runs *up* the windscreen at speed.
- **Cloud shadows** from the same field that draws the cloud, shared verbatim
  between the sky and ground shaders. 75 fps with them on.
- Lying snow, wet ground, skylight lift under overcast, sky obscuration in
  fog, labels gated on visibility.
- Lightning with multiple return strokes and thunder delayed at 343 m/s;
  rain, hail and wind beds in the synthesised audio; snow nearly silent.
- The aerodynamic resistance term is in air speed, so wind costs or saves time.

## Fixed after the first weather run
- **Nothing dynamic was ever drawn.** `trainDyn`, `sigDyn` and `xingDyn` were
  built and uploaded every frame and had no draw call. No trains, no signals,
  no crossing booms, ever. Mark spotted it from outside view. They now draw
  through the track program, in the reflection pass too, and the player's own
  consist is drawn whenever the camera is not inside it.
- **The clock never ticked.** `state.hour` only changed when the slider moved,
  so `traffic.step` was handed the same instant every frame: no service after
  the one you started with was ever spawned, lateness was measured against a
  frozen now, and the sun stood still. Now advances with the time rate, and
  dragging the slider re-seeks the timetable. Verified: 6 services on the line
  after 21 simulated minutes, where there had only ever been 1.
- **Startup was an image decode, not the mesh.** `loadImage` awaited
  `img.decode()`, which Chromium never settles while the document is hidden.
  Boot is 442 ms measured.
- **Rain was radial.** The old pass sampled a grid on a sphere of fixed radius
  around the eye, which folded at the edges of a wide FOV and fanned the
  streaks out from the centre. Replaced with instanced quads at world
  positions, depth-tested, spanning the drop's motion over one exposure.
- Windscreen wiper on `X` — off / slow / fast, solving for when the arm last
  crossed each fragment's angle and rebuilding the film behind it.
- Visibility is now a stated visual range in metres per situation, with fog
  density `3/vis`; the Haze slider is a trim and resets with the situation.
- Derült ég is now genuinely cloudless; it had a cirrus veil.
- Rain audio decays fast when it stops and swells on a slow LFO instead of
  sitting as a flat hiss. Master volume slider added.
- `SIM.tick(t)` steps a frame by hand — the only way to drive the sim in a
  hidden tab, where the browser stops calling `requestAnimationFrame`.

## Second feedback pass — trains, light, camera
- **Four train classes with real silhouettes.** KISS with the stepped
  double-deck roof and two window rows in the middle; FLIRT low, flat and
  articulated with Jacobs bogie spacing; EC as a loco and a rake of high-floor
  coaches; freight as a loco and a mixed rake of hoppers, tank barrels and
  container flats. Driving ends have a raked nose, inset windscreen, buffer
  beam and the two-low-one-high lamp group. Z70 is now a four-car FLIRT in the
  baked timetable — 32 of the 170 services.
- **HDR and tone mapping.** RGBA16F target, ACES output curve, threshold
  bloom, Exposure and Bloom on the panel. This is the answer to "less bright
  and harder to make out": the picture was being dimmed to make room for the
  sun, and now it is not. No gamma step — the pipeline is display-referred by
  construction and encoding it as linear washes it out.
- Cloud shadow cut from 0.92 to 0.70 of the direct term.
- **`inCab` is one flag now.** The chase view used to leave `state.cab` set,
  so the cab was pasted over the outside view, the wiper swept the landscape
  and your own train was invisible. Mark reported all three.
- **`X` was already the cab toggle** and the weather pass bound the wiper to
  it as well, so one key did both — exactly what Mark described. Wiper moved
  to `Z`. `R` was also double-bound (track toggle and restart); restart is
  `shift+R`.
- **The reflection target was being rebuilt on every resize** — the whole
  block was duplicated inside `resize()`, shadowing the real objects and
  leaking a framebuffer, texture and renderbuffer each time.
- Hour and Day are now **Time** and **Date**, each showing its value
  ("július 19."), and the running clock no longer writes to a slider while it
  is being dragged — which is what made them feel as if they interfered.

## Third feedback pass
- **Freight was reshuffling itself.** Wagon type and container colour came
  from a hash of each wagon's chainage, so the whole rake changed every frame
  as it moved. Seeded from the train's own `seed` and the wagon index now.
- **The speckle** was z-fighting: windows, doors and corrugations were quads
  a centimetre proud of the body side, and depth resolution at a few hundred
  metres is worse than that. Every panel is tiled now, nothing coplanar.
- **KISS units are close-coupled** with a gangway across the joint, so a
  Stadler set reads as one train. Freight keeps a visible gap, correctly.
- **Real MÁV liveries** from the photo: white over blue with yellow doors for
  the KISS and FLIRT, a cobalt loco with a yellow front, grey-blue for EC.
- **Six wagon types**: loaded and empty open hoppers, tank barrels in three
  colours, covered grain hoppers with roof hatches, box vans with sliding
  doors, container flats with one 40 ft, two 20 ft or nothing.
- **Chase camera stood off** by the length of the train being followed — 95 m
  was inside a 200 m freight rake, which is the "see through" Mark reported.
- **Road traffic** with queueing at the booms — Next up items 2 and 9. 168
  vehicles at ~3.5 ms/frame. Verified: with the gates shut 53 of 60 vehicles
  on gated roads stop; when they lift they move off.
- **Night**: lit building windows, warm train windows, head and tail lamps,
  and a headlight cone on terrain and corridor (`shift+F`).
- The follow banner names the class, since EC and FLIRT are hourly or
  two-hourly and Mark had not run into one.

## From the Gemini branch
Not merged — that work is in a separate copy and this instance did not take
its code. Everything from that list worth having has now been built here
independently: headlight cone, building window glow, lit vehicles and trains,
road traffic with crossing queues, horn, EVM-120 vigilance, labelled and
clickable cab switches, flange squeal, VVVF singing. **Left from it:** road
overpass bridges for the 102 grade-separated crossings, and a weather front
that moves along the line rather than covering all 62 km at once.

## Fourth pass
- **Closed the holes in the wagons.** The hopper's sloped ends overhung its
  sides, leaving an open corner you could look straight through — that was
  the "see inside when I turn around". Grain hoppers had no gable ends,
  containers and coaches no floor. All closed.
- **Vehicles belong on the road they are on**: type is weighted by road class
  (a bus needs 6.5 m, a lorry 7.5 m, a bike goes anywhere) and the lane
  offset is a quarter of the actual carriageway rather than a fixed 1.7 m.
  On anything under 5.2 m everyone uses the middle. More of them, too.
- **Ships on the Danube.** Fairway derived from the land cover raster —
  28.5 km, 441–783 m wide, which is the real river. Pushed convoys, cargo
  motorships, a cruise ship, launches, and the Nagymaros–Visegrád ferry.
- **Horn on `H`**, two tones a fourth apart with harmonics and a waver.
- **Flange squeal** from `Route.curvatureAt`. Measured first: the tightest
  curve here is 1.3 per km, a 760 m radius, so the first threshold — set
  from a guess — would never have fired.
- **VVVF inverter singing**: 300 → 600 → 1200 Hz carrier steps, then
  synchronous, loudest under power at low speed and gone by line speed.
- **Labelled, clickable desk switches** and a 25 kV meter. A click is a ray
  onto the instrument face, whose UV is the canvas pixel.
- **EVM-120 vigilance** with a penalty brake, and **adhesion**: wet rail,
  snow and ice lengthen the stop, sanding buys it back. 347 m dry against
  631 m on snow from 90 km/h. This is the first time the weather has cost
  anything to drive in.

## Fifth pass — seasons, roads, horn
- **Seasons.** `seasonOf(day)` gives leaf, autumn, fresh and crop. Deciduous
  trees actually go bare — the canopy thins and branches are drawn where the
  crown was — each turning at its own pace to its own colour. Fields follow a
  winter-wheat calendar with a per-field offset, meadows go straw in high
  summer, orchards show worked ground when the leaf is off.
- **Vegetation variety**: seven species picked from the land cover — spruce,
  oak, poplar, hazel, willow, fruit tree, vine — each with its own crown,
  height range and bark. Backlog item 8.
- **Road density**: vehicles are streamed around the *camera* now. The old
  version picked a way then a random point along the whole of it, so on a
  five-kilometre road nearly every vehicle landed out of sight. 500 on the
  books, ~140 within 500 m, culled from the mesh past 560 m.
- **The horn was a truck.** Two tones sounding together with a lot of
  harmonic content is exactly what a road vehicle does. Rebuilt as two
  chambers off one reservoir: the low speaks first, the high joins 110 ms
  later — the "buu-beee" — with air noise behind the tone, a flat start that
  pulls up to pitch, and a sag on release.
- **Ferries** generalised to a list. Nagymaros–Visegrád (720 m crossing) and
  Vác–Szentendrei-sziget (420 m) take; Göd and Dunakeszi are registered and
  will appear when the Budapest half is baked.
- **Switches**: the panel was at the far right of the desk, u 0.73–0.94, off
  the screen at any normal pitch — moved to the near centre. Five of the six
  also had no visible effect: the horn lamp read the key not the state, the
  wiper only drew in rain, ÉBER showed nothing unless already warning, and
  AJTÓ needed a booked dwell. All now respond. The ray→plane→pixel maths was
  verified exact (recovered u=0.729 against 0.731 wanted).

## Sixth pass — Budapest, seasons round two, vehicles
- **The whole line is built.** `SZOB_KM=0,63.6` and the bakes run for
  Budapest-Nyugati to Szob: 20 stops, 68 crossings, near heightmap
  1361x1839, bundle 9.4 MB. Verified driving out of Nyugati through
  Rákosrendező and Istvántelek to Dunakeszi.
  - `bake_route` sets the local frame from the near region's SW corner, so
    changing the window silently put `context.json` 27.7 km out of register.
    Anything baked against that frame must be rebuilt together.
  - `places.json` had a Vác–Szob bbox. Rewidened and enriched: parks, works,
    stadiums, the zoo, islands. 5088 features, and Nyugati, Rákosrendező,
    Istvántelek, Városliget, Margitsziget, Angyalföld, Népliget and the
    Puskás Aréna all name themselves now.
  - Four ferries take, since the fairway runs the whole line: Nagymaros,
    Vác, Göd and Dunakeszi.
- **Winter trees were still green** — the canopy thinned but kept its summer
  colour, so a January wood read as a summer one. Out of season the leaf
  colour now goes to dead brown before the crown thins.
- **Twelve species, for this region specifically**, zoned by altitude: beech
  above 430 m, sessile oak and hornbeam below, Turkey oak on the warm lower
  slopes, pine on the dry ones, willow, poplar and alder on the floodplain,
  black locust on disturbed ground, the Nagymaros chestnuts, hazel and
  blackthorn in scrub, vines in the vineyards. Each with its own crown, bark
  and autumn colour — beech to copper, hornbeam to clear yellow, oak to rust.
- **Road traffic on the right roads.** Weighting was far too flat: a village
  has forty residential ways and two primaries, so uniform picking left the
  main road empty. Steep class weights now put the traffic where it belongs
  (primary 77, tertiary 341, residential 64, service 13 in a sample).
- **The deadlock.** Two vehicles spawned overlapping have a negative gap and
  neither can open it, so everything behind stops for ever. A vehicle
  stationary for 12 s with no closed gate in front of it is now moved on.
- **The horn is a minor third**, B flat 4 and D flat 5, both chambers
  sounding together — that chord is the Stadler sound. Pitching it as a
  fifth an octave down was why it read as a road vehicle.
- `dtReal` is clamped at zero. A timestamp that goes backwards ran the whole
  simulation in reverse — train, clock, weather and all.
- Mouse wheel zooms the view.
- Cab: `insideTrain` and `inCab` are separate now, so turning the console off
  no longer leaves you sitting inside your own train body.

## Seventh pass — making Budapest a city
- **Land cover was Vác–Szob only.** Over half the world had no class at all,
  which is why the city looked like a field with houses on it. Refetched for
  the whole line with city classes; "none" 56% → 8%. Park is its own class.
- **Building heights inferred**, because OSM has almost none: panelház by
  proportion (994), bérház by neighbour density (25047). Flat roofs for
  industrial and prefabricated; ridged roofs along the long axis instead of
  pyramids; shallow pitch above 11 m. Median height 7 m → p90 15.5 m.
- **Panelház window grid** in the shader — the regularity is what reads.
- **Bare trees are actually bare.** Narrowing the silhouette was not enough:
  the crown was still a solid shape. The canopy is now punched out on a fine
  grid as the leaf falls, so at bare only a fifth of it survives and it reads
  as twigs.
- **Vehicles were under the road.** The road mesh sits on `demRidge` — the
  highest DEM sample within 9 m — plus 0.34 m; the vehicles used the raw DEM.
- **The horn, properly**: three instruments and a four-position switch, per
  the F.1 description Mark found. Both chambers, deep alone, high alone, or
  the légsíp.
- `,` and `.` jump between stations. Sixty-three kilometres is a long way to
  drive to look at one bridge.

## Reflection — fixed
The pass mirrored the camera and passed an unreflected up vector to `lookAt`,
which flips handedness and mirrored the image left-to-right as well. Every
sample came from the wrong side of the screen, so head movement moved the
error. It reflects the world through `vp * R` now, which lands the mirror
image in the real camera's screen space and makes the sample coordinate the
fragment's own position. The ripple was a tenth of the screen; it is 0.010
and distance-scaled. The target was a fixed 320x180 on any aspect; it tracks
the main one at half size.

Note for later: mostly-sky in the water is correct at a shallow viewing angle,
not a bug — the rays that hit visible water are within a couple of degrees of
horizontal.

Next up 5 struck.

## Eighth pass — real footprints, and reflection that reads
- **Buildings over 380 m² carry their real footprint** — 9393 polygons,
  58421 triangles, ear-clipped at bake so concave blocks are right. Roof form
  from `roof:shape`; barrel vaults for tin sheds and trainsheds. Nyugati's
  37-point outline gets one.
- Named railway structures by name and tag: fűtőház and járműjavító as 13.5 m
  engine sheds, víztorony at 32 m. OSM has the footprints, never the heights.
- **Reflection reads as reflection now.** The maths was right after the last
  pass but it still looked like a photograph lying flat on the river, because
  a single sharp sample is not what water does. Each wave facet points
  somewhere slightly different, and since the surface tilts far more across
  the view than along it, a point on the bank arrives smeared **vertically**.
  Seven taps, weighted, with the smear growing with distance. That stretched
  column is what the eye reads as a reflection.

## Eleventh pass — bridges at last
- **Road bridges.** 144 ways tagged `bridge` in the data, 102 in range, drawn
  with flat decks, girders, parapets and abutments. Two things went wrong on
  the way and both are recorded in the README: a deck that interpolated its
  clearance ramped into the sky, and piers built on the world axes rather than
  along the road threw slivers across the cab view on any skew crossing.
  Ferdinánd híd and Hungária körút are both in.
- **Duna slider**, -4 to +7 m on the fitted plane. The gauge is read against a
  datum and does go negative.
- **Dome height** capped against the footprint — it was three times the OSM
  roof height, which grew circus tents.
- **POI cleanup**: 5088 labels down to 2553. No companies, no bare personal
  names, and a word saying what a thing is where the name does not.

## Not done this pass, and asked for
Nyugati as a hollow shed with platforms (the polygon barrel is still too wide
— it spans the whole 134 m footprint rather than the 44 m of the real shed);
Hősök tere and the museums; Margit híd; sprite-based platform silhouettes
rather than boxes; the inset map, which is still a flat PNG; panelház shading;
Dunakeszi Járműjavító, Samsung SDI and the Váci cementgyár; and more depth in
the Budapest building stock generally.

## Tenth pass — the river was eight metres too high
- **The water plane was a constant.** The Danube falls 86 mm/km — 96.0 m at
  Nyugati, 100.1 m at Szob — and it was drawn flat at 104 m. At the Budapest
  end that is eight metres too high: both banks and all of Margitsziget were
  under the river, which is why the island "wasn't there" despite having 102
  buildings baked. Fitted from the cover raster's water pixels at bake, and
  the renderer follows the slope.
  - The fit needs a low percentile, not a median: the Danube is the LOWEST
    water in any band, and the Dunakeszi gravel pits and Naszály ponds sit
    above it. A median flattened the gradient to 21 mm/km.
  - And a pond is not the river: a water pixel snaps to the river plane only
    where the ground already agrees. Otherwise correcting the Danube dug
    ten-metre blue craters through the city.
- **WestEnd was in neither layer.** A 120 m cap on the bounding box half-
  extent ran before both the polygon and the box path, so a 322 x 305 m
  building was simply dropped. The cap now rejects the box, not the building.
- **Trainshed reads as iron and glass**, alternating ribs and glazing along
  the bays with glazed gables, instead of a grey hull.
- **A dome is not a cone.** `roof:shape=dome` was mapped to the pyramidal
  form, which collapses the ring to a point. Domes now bulge on a circular
  profile through five rings.
- **`X` is the wiper**, as everyone expects; the cab interior moved to `I`.
- **Leaf edges are dithered**, not hard-cut at 0.45, so a crown has a broken
  edge and the sky shows through it. Mark's suggestion.
- **Platform silhouettes**: people waiting, weighted by the hour — two peaks,
  a quiet middle, nearly nobody at night — and more of them at the big
  stations.

## Ninth pass — tracks, Margitsziget, and a strategy correction
- **Yard tracks.** "No tracks yet" was right: only the two running lines were
  drawn, so every throat and yard was bare ballast. 1424 ways, 12484 points,
  baked with chainage and offset so a yard sits at rail level inside the
  corridor and on the ground outside. Nyugati's throat and Rákosrendező read
  properly now.
- **Margitsziget.** The buildings query was a 1400 m ring; the island is 2 km
  off. A 2600 m ring over the whole line times out on the public mirrors, so
  the Budapest end has its own bounding box merged in at bake. 5982 extra
  buildings, 102 on the island, bake radius 2400 m.
- **Landmark strategy corrected, and the reason is worth keeping.** The
  anchoring idea was right; the *descriptor* was wrong. An OBB describes a
  water tower well and a mall badly — WestEnd is 322x305 and nearly square,
  its OBB says 396x137, so the box sat on the road. Nyugati was off for the
  same reason. The polygon layer already draws both correctly from their real
  outlines, so the hand-modelled layer is now only the water towers, which is
  the one shape that needs it and the one Mark said looked right.

## Landmarks — the placement system
The Gemini branch tried this and its own log says where it went: a 1315 m
projection shift from rounding the origin, an inverted sign in the rotation,
then several passes of re-typing coordinates. That is the failure mode of
placing things by hand, and it is avoidable.

Landmarks here carry **no coordinates at all**. `bake_context.py` finds the
building in OSM by name and emits its footprint centre, principal axis and
extent in the same frame as everything else; `landmarks.js` models in a local
frame and is transformed by that anchor. Drift, rotation errors and
wrong-side-of-the-line are all structurally impossible.

The axis *sign* — which end of the long axis is the front — is resolved by
snapping both ends to the down line and defining +u as the end further from
it. Nyugati's shed therefore opens toward the tracks by construction. That
was visibly wrong on the first build and correct on the next without touching
a number.

Done: Nyugati (vault, glazed gable, head building, pavilion towers with
clocks), WestEnd (atrium spine, parking deck), the Vasúttörténeti roundhouse
with turntable pit and bridge, water towers at Újpest, Istvántelek, Tatai út.

**The switched-off models are still in the file.** `bake_context.py`'s
`LANDMARKS` list matches one name, *víztorony*, so the only anchors baked are
the four towers. The `nyugati`, `westend`, `roundhouse` and `futohaz` branches
of `landmarks.js` are therefore unreachable code, not a feature behind a flag
— nothing hands them an anchor. Do not read them as working, and do not widen
`LANDMARKS` without fixing the descriptor first, or the mall goes back across
the road. The vault over Nyugati today is the polygon layer's
`roof:shape=arched`.

**If we come back to landmarks**, the lesson is that the anchor must be the
polygon, not a bounding box. The right shape is: take the real outline for
position and extent, and hand-model only the *roof or superstructure* on top
of it — which is what `roof:shape=arched` already does for Nyugati. A
Ferdinánd híd or a Rákospalota flyover is different again: those are linear
structures and should be anchored to the OSM way they carry, not to a
building. Neither has been done.

## Still not right about Budapest
Mark asked for Nyugati reproduced, and an extruded footprint with a barrel
over it is not that. The Eiffel trainshed is a glazed gable end with a fan of
ironwork; WestEnd is a mall with a curved glass roof; the Vasúttörténeti
roundhouse is a segment with a turntable in front of it. Getting those right
means **hand-modelled landmarks** — a small table of named structures with
purpose-built geometry, keyed to their OSM footprint for position and
orientation. That is the honest next step and it has not been done.
Also missing: the turntable itself, platform canopies, the yard's own
buildings and lighting masts, and any overhead line anywhere.

## Structure — done, 23 Aug 2026
`sim.js` (2443 lines) and `main.js` (1978) are now nine files. No logic moved:

    sim.js  → env.js  route.js  geom.js  trains.js  traffic.js
    main.js → hud.js  input.js  main.js (1509: boot, menu, frame loop)

`main.js` keeps the boot and the loop, which share too much closure state to
be worth prising apart. What came out has a clean edge:
`drawHud(c, canvas, st, world)` takes `{ imgMap, routeData, mapMeta }` — the
only three things the overlay needed from the boot — and `installInput(ctx)`
takes the eleven objects the handlers act on. Both destructure at the top, so
not one line of either body changed.

`installInput` is called after the menu is built rather than where the
handlers used to sit, because `sound`, `startRun` and `toggleMenu` are all
declared further down and a handler cannot close over a scope it is not in.

**How it was verified, and the method is worth reusing.** The bundle is a
concatenation, so a pure move must leave the generated JS *identical as a
set of lines*. Dump the bundle's non-blank lines sorted, before and after,
and diff: the sim.js split came out with only the eleven new header comments
differing, and the main.js split with exactly ten lines — the two new
signatures, the two call sites, two destructures and a brace. Anything else
appearing in that diff is a mistake. Then boot it: keys, station jump, map,
layer cycle, drag and wheel all exercised through `SIM.tick`, console clean.

## Answered
- **Grade separation** — OSM does record it. Of 147 places where a road's
  geometry crosses line 70, **45 are level crossings** (a shared node tagged
  `railway=level_crossing`) and **102 are grade separated**: 22 tagged bridge,
  57 tunnel or underpass, the rest separated by geometry alone. Mostly
  footways (36) and residential streets (23). Of the level crossings, 20 have
  a real barrier — 16 half, 2 double half, 2 full — 22 explicitly have none,
  and 26 are untagged. Only the 20 get booms.
- **Sun** — checked against SunCalc for Vác on 15 July 2026. Ours reads
  8.30° / 292.99° at 19:36 against their 8.42° / 292.87°, and culmination at
  12:49 against 12:49:26. It was an hour out until summer time was handled.
- **The bird** — there were no birds; that was the cicada band at 5 kHz. There
  are birds now.

## Next up
Nothing below has been started. Ordered as Mark listed them.

0. ~~Weather that develops~~ — done, 24 Aug 2026. A front is a chainage, a
   speed and two air masses; `weatherAt` blends them at your own position and
   `stepFront` starts a fresh one when the last runs off the end. What it is
   not: a front with any depth to it. No warm sector, no wind veer through the
   passage, no cloud line standing along the edge itself.
1. ~~Trains~~ — done: four classes with distinct silhouettes. Still no
   textures, numbers, blinds or tail lamps; see the README's gap list.
2. ~~Road traffic that waits at the crossings~~ — done.
3. ~~Cab switches labelled and clickable~~ — done.
4. ~~Road bridges~~ — done: 102 tagged ways, 15 of which actually cross the
   line and get railway clearance. Still
   the largest missing thing at the Budapest end — Ferdinánd híd and the
   Rákospalota flyover both cross the line. These are linear structures and
   should be anchored to the OSM way they carry, not to a building.
5. ~~Reflection~~ — done: reflects about the plane properly.
6. **Terrain seams** — still open in places, with sky visible through them.
7. **Water/terrain tiling** at the shoreline.
8. ~~Vegetation variety~~ — done: seven species, seasonal.
9. ~~Road traffic — cars and cyclists~~ — done: cars, vans, buses, lorries
   and bicycles. No junction behaviour yet, which is the next step.
10. **Floating buildings** near the curve.
11. **Szentendrei-sziget POIs** — it is opposite the line for much of the run.
12. **Danube should read as a big river**, not a channel.
13. **Dispatcher board** — small on a touchpad; pinch/wheel zoom unreliable.
14. ~~Startup progress~~ — moot: boot is ~400 ms now.
15. **Rain on the rails** — wet and leaf-fall adhesion, snow drifting into
    the cuttings, and lying snow that accumulates because it snowed rather
    than because the situation says so.
16. ~~Cloud shadows on buildings and trees~~ — done, per object rather than
    per fragment. Measured: with the camera held still and everything else
    frozen, a pixel changes 10.5 luma over 55 s of cloud time against 0.1
    under a clear sky.
17. **The sound bed** — Mark's words: "there's definitely lot of sound still
    not very enjoyable". Rain reads right; the rolling and traction beds do
    not. A volume slider is a stopgap, not the fix.

## Questions to settle
- Sun path and month: default is day 200 (mid-July). Confirm the arc over the
  Bend looks right through the day.
- Whether a given road/rail crossing is level or grade separated — OSM tags
  say, and it changes whether barriers are needed.
