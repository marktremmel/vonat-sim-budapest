# Session S-15 (26 Sep 2026): progress log

The owner's message: "roads and trams and houses are still kinda buggy or messy
in execution … I just really wanna polish it … it's very buggy and inconsistent.
Let's do these stages, start with 0, also add dark timeline stuff."

## Plan

1. **Bug census** (new, first): look at roads, trams and houses in typical
   places, from the street and the air. Each distinct bug gets a class, and the
   classes are fixed by how often they show up.
2. ROADMAP Stage 0: the two quick checks, the performance items, the leftover
   glitches. The owner's look at the "built" rows can only be done by them.
3. The dark timeline: its own ROADMAP stage, and its next step built.

## Census: places looked at (line 70's frame, clear noon)

Oktogon, Blaha, Astoria, Nyugati, Margit híd (Pest end), Móricz Zsigmond körtér,
the Nagykörút at Király utca, Rákospalota's houses, Újpest centre (panel
blocks), Kőbánya, Rózsadomb, Gellért-hegy, the Buda side at Batthyány. From the
air (top-down and oblique), and some from street level. A 4/6 tram close up.

## Bug classes found, and what was done

| # | class | where | cause | fix | seen after |
| --- | --- | --- | --- | --- | --- |
| 1 | Roofs fold over themselves: dark slivers, broken hips on L/U shapes | everywhere with concave outlines (most Pest blocks, many houses) | the hip was made by pulling the outline toward its centroid, which crosses itself on a concave shape | concave and big outlines are inset along each corner's bisector, by a depth from the outline's own width (`geom.js buildPolyBuildings`); small convex houses keep the old hip | yes, Nagykörút top-down: clean hips on the L-shapes, no slivers |
| 2 | Big blocks read as black holes from above | every big footprint (inner Pest, Kőbánya) | the flat middle of the ring roof was 0.16 grey | light gravel grey 0.44 | yes, Oktogon from the air |
| 3 | Junctions: roads and their markings fight for the same pixels; kerb strips across the other road | every junction | all roads at one height | smaller roads 1.2 cm a class lower (lower, so no car sinks into a big road); no lane marks or kerbs within half a width + 4 m of a way's ends | yes, Móricz körtér top-down |
| 4 | Stubs: a lone grey hexagon on a lawn | where a way is under 2 m | the way's end caps were drawn with no road | ways under 2 m skipped | yes |
| 5 | Trees read as paper X's up close and stars from above | every tree | two quads at 90° | three quads 60° apart (VEG_VS, TREE_VS; 18 vertices) | yes |
| 6 | Flower beds as spiky stars on the lawn | BP Fatár beds (form 16) | drawn as upright crossed planes like a tree | one flat quad on the ground | yes |
| 7 | Tram: one black band for windows, no doors, nothing underneath | every tram | the mesh was bands | panes with pillars, two doors a section, bogies, roof equipment (`trams.js`) | yes, a 4/6 at Oktogon |

Not fixed, seen in the census:
- Neighbouring buildings' hipped roofs still meet in valleys and steps: that is how separate OSM outlines with their own heights come out, and mostly how Pest looks.
- The ground around houses in the outskirts is a pale grey-beige: the land-cover colour, not a bug, but it makes Rákospalota look washed out.
- Trees near a wall still read as flat at the edge of the crown.
- City-tile rails (tram tracks) beside roads were not checked for gaps.

## Stage 0 items

- **Resolution (élesség):** works. 320×180 at 0.6, 478×358 at 1.4, 887×666 at 2.6 (on this window).
- **Grain and chroma "not noticed":** the owner was right.
  - Measured as the mean change of the picture: grain at its default was 0.4 of 255 levels, and 1.1 at full.
  - The cause: grain was per screen pixel at 2K and ±4%. It is now per game pixel and ±8%, which measures 1.9 at the default.
  - The chroma offset was doubled.
- **Frame-loop allocations (audit 4.1):**
  - The car mesh writes into typed buffers kept between frames, instead of fresh arrays each frame.
  - The road surface under each car is cached on a 1 m grid.
  - Busy view over the Nagykörút with 898 cars, 200 frames: median 20.4 → 19.9 ms, p90 30–36 → 23 ms, p99 38.9 → 34.7 ms.
  - Cars now cost about 3 ms a frame (was 4).
  - Trains and signals still allocate per frame (not measured to matter).
- **The 48-light loop (audit 4.2):** capped at 12 lamps on low quality and 24 on medium. Only at night, since daytime already skipped the loop.
- **Not done:**
  - the owner's look at the "built" rows;
  - the Északi összekötő texture glitch;
  - the Népsziget water on line 2;
  - the Újpest station.

## Dark timeline, second step (`?mode=dark`)

- **Weapons:** K strikes the middle of the view with the chosen weapon; J cycles through three: a shell (6 m crater), a heavy bomb (14 m) and a very heavy bomb (30 m). The sizes are round numbers for the game, not ballistics.
- **Each strike leaves a crater:** a bowl with a thrown-up rim, in the terrain, the corridor, the roads and the track. The ground around it is scorched.
- **Damage:**
  - Polygon buildings and box buildings inside the blast collapse to rubble heaps 1–4 m high.
  - Trees in the blast are gone; trees on the slope go down with the ground.
- **How:** it is all in the shaders (`CRATER_GLSL`: `craterDip`, `scorchAt`, `blastAt`), so a strike costs nothing and nothing is rebuilt. Up to 16 craters; the oldest goes first.
- **Seen:** Rákospalota, a heavy and a very heavy bomb, from the air. Normal mode (no craters) loads with no errors on line 70 and S21. Tests 28/28.
- **Not done:**
  - OSM 3D parts (the Parliament) and hand-made landmarks do not collapse.
  - Cars and trains drive over the crater at the old height.
  - Craters are forgotten on reload.
  - There is no panel yet: the keys only.

## The phone would not load (owner, 8–11 Oct)

The owner's report: on the phone the page kept reloading itself; later it stopped at 70–74% with
"can't find variable boot" (Safari's wording: the game's script never started).
The published build was S-14 (`5cc5d82`), byte-identical to the repository.

- **Measured in a phone-sized Chrome window (JS heap; Chrome only reports this):**
  - Loading left about 430 MB allocated before S-13 and 635–710 MB in S-13/S-14.
  - The growth came with S-13: the Szentendre and Fót extracts (+17k footprints), trams, more roads.
  - A phone browser kills a tab at about that size and reloads it.
- **Not the cause (checked):**
  - The live file is identical to the commit.
  - The script parses and runs in Safari's own engine (`jsc`) on this Mac.
  - It needs only ES2020.
  - No top-level name clashes with element ids or the other scripts.
- **Fixes:**
  - `FBuf` (engine.js): a growable Float32Array with `push()` and `length`, a drop-in for the plain arrays every mesh builder collected vertices in (8 bytes a number, re-copied as they grow). Used in geom, parts, structures, catenary, landmarks, trains, trams, traffic, aircraft, kisvasut, easter and cab.
  - On touch devices (`state.lite`), footprints and collision solids are kept only within about 1.6 km of the track. Box buildings are still drawn everywhere.
  - The loader records the first script error (`window.__firstErr`) and shows it when the game's script did not start, instead of "can't find variable boot".
  - `window.__bootMem` holds the heap at each loading step (Chrome).
- **After (same window):**
  - Loading ends at about 350 MB on line 70 (S21 373, line 2 250).
  - While running, the heap stays at 120–150 MB; it swung between 116 and 400 MB before.
  - All three lines load with no errors; tests 28/28; the desktop picture is unchanged.
- **Not verified:** on a real phone. The iOS Simulator did not start in time. If it still fails, the loading screen will now show the real error text.

## Where this session stopped

Pushed as `4baab71` (11 Oct, on the owner's word). The phone fix is not yet confirmed on a real phone.
