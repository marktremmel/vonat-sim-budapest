# Where to go from here: an evaluation (S-17, Oct 2026)

The owner asked: how could the game become easier to sustain, extend and
bring together; is that a move to Unreal or Godot; and what can today's AI do
for style and fidelity "without having to point out everything".

Measured where it says so. The rest is judgement.

## Where the project stands

Measured in this checkout:
- 19,200 lines of JavaScript in 40 files. `main.js` is 4,180 lines, most of
  it one `boot()` function; `shaders.js` is 2,720 lines of GLSL.
- 128 files in `tools/` (8,000 lines of Python plus Overpass queries).
- 78 MB of baked data. Three lines, each in its own coordinate frame, plus
  the Budapest city tiles.
- 28 headless tests. None looks at a rendered picture.

What works well:
- It opens from a link, on a phone, with nothing to install.
- The look is its own, and all of it is in our hands.
- The data pipeline: OSM and elevation in, a region out.

What costs more each month:
- **Every new kind of thing is five steps**: a query, a bake script, a
  builder, a shader or draw call, and a line in three per-line build scripts.
  Walls and graffiti this session took all five.
- **Three worlds.** Each line has its own frame, so everything is baked three
  times and nothing spans the region. The new start screen needs one world.
- **No path for bought models.** No glTF loader, no skeletal animation. The
  assets the owner is about to get cannot be used yet.
- **`main.js`.** One closure holds the whole game. Changes there are slow and
  have broken boot three times in two sessions.
- **Checking is by eye.** Each fix is a screenshot I take and look at.
  Nothing catches a place that got worse.

## Engine options

| option | gains | loses | verdict |
| --- | --- | --- | --- |
| **Unreal** | best lighting; Cesium plugin can stream real 3D cities | no browser build at all; a download of gigabytes; no phone link; all 19k lines rewritten; I cannot see or drive its editor | no |
| **Godot 4** | editor, glTF import, animation, physics, audio | web build is a download of tens of MB and is weakest on iPhone Safari; the terrain, water, cloud and façade shaders would be rewritten; the look would drift | not as the main game. Reasonable for a separate desktop edition later |
| **three.js or Babylon.js** (stay in the browser, replace the renderer) | glTF, skeletal animation, shadows and instancing ready-made | the 2,700 lines of GLSL ported one by one; a larger download; no automatic gain in phone speed | hold in reserve |
| **Stay, and rebuild the weak parts** | keeps the link, the phone and the look; every step ships | we write our own glTF loader and animation | **recommended** |

Why stay: the thing people react to is that a link opens a whole region on a
phone. Unreal ends that and Godot weakens it. And an AI-assisted project goes
fastest when all of it is text that can be run and checked from a script,
which this is.

When to revisit: if our own model loader and animation take more than about
three sessions, or if shadows prove out of reach, port the renderer to
three.js and keep everything else.

## The plan: five steps, each one ships

**Step 1. A model pipeline** (one to two sessions). *Started in S-18: animated people are in (`tools/bake_people.py`, animation as vertex frames in a texture, as planned here). Static props, a horse and a bus are still to do.*
- `tools/bake_gltf.py` (through Blender, which is installed): any GLB or FBX
  → a compact mesh, an atlas, and animation baked into a texture (each frame
  of a walk cycle stored as vertex positions; no skeleton maths at runtime,
  which suits phones).
- The runtime draws them instanced, like the cars.
- First users: walking people, a horse, a bus, a bench and a bus shelter.
- This unblocks everything in `ASSET_GUIDE.md`.

**Step 2. One world** (two to three sessions; `UNIFIED_ENGINE_SPEC.md` has a
draft).
- One frame for the region. Terrain, buildings and roads as tiles streamed
  round the camera, the way the city tiles already work.
- Lines 70, 2 and S21 become routes in that world, all running at once.
- The start screen falls out of it: the region from above, tap to drop in.
- The risk is the frame change (NOTES Traps 3 and 14). Do it once, with the
  three old worlds kept for comparison.

**Step 3. A world compiler in place of 128 scripts** (two sessions, can
overlap step 2).
- One download: the Hungary OSM extract from Geofabrik, cut to the region
  with `osmium`. No more Overpass queries that time out.
- One pass writes every tile, keeping **all tags** of every feature.
- One rules file says what each tag becomes:
  `barrier=wall → wall(h=2)`, `amenity=bench → prop(bench)`,
  `highway=bus_stop → prop(shelter)`, `natural=tree_row → trees(spacing=8)`.
- Adding a detail becomes one line and, if needed, one model. Benches, bins,
  hedges, fences, power poles, bus stops, playgrounds, advertising columns,
  cemeteries, allotments: all are in OSM and none is drawn today.
- This is the "friendly way to ask a bunch of data and rebuild the whole
  world" the owner described.

**Step 4. Code health** (one session, any time).
- Split `main.js` into boot, frame, cameras and modes.
- Real modules in the build, so names stop clashing.
- **Picture tests**: 30 fixed camera spots rendered and compared with the
  last accepted set. A change that makes Oktogon worse shows up as a diff.

**Step 5. Fidelity from data, not from pointing** (ongoing).
Sources I believe are open and cover Hungary; **none was checked this
session**:
- **Sentinel-2 imagery** (10 m): a real ground-colour tint per field, yard and
  wood. Probably the largest single gain in "definition" outside the city.
- **A canopy-height map** (Meta and WRI publish one at about 1 m): trees where
  they stand, at their real height.
- **Overture Maps buildings**: heights for buildings OSM has none for.
- **Mapillary street photos** (CC BY-SA): reference for façades and stations.
- Lakes levelled at bake time (see "Seen this session").

## What today's AI adds

- **Photo to model.** Image-to-3D tools (Meshy, Tripo, Hunyuan3D and others)
  make a rough textured mesh from two or three photos. With step 1 in place, a
  station building goes: your photos → generated mesh → Blender decimate and
  repaint to our palette → bake. This answers "a way to help AI draw complex
  objects from photos". Expect a clean-up pass on each; expect failures on
  thin things such as lattice masts.
- **Photo to texture.** A straight-on façade photo → a tileable, destained
  façade tile. The panel-block tiles were made this way by hand.
- **An automatic bug census.** The S-15 census (render typical places, name
  the bug classes, fix by frequency) can run every session over the picture
  tests of step 4, with reference photos beside each render.
- **A style pass.** One palette and one set of rules (colour count, edge
  hardness, texel size) applied to every imported asset in the bake, so packs
  from different authors stop looking like different games.
- **What it does not do:** it does not replace looking. Every wrong place
  fixed so far came from a photo or a remark of yours.

## Recommended order

1. Step 1 (models), because your assets are arriving.
2. Step 4's picture tests, because steps 2 and 3 move everything.
3. Steps 2 and 3 together: one world, compiled from one extract by rules.
4. The start screen and personas on top of that.
5. Step 5 sources one at a time, each judged by before-and-after pictures.

## Seen this session and not fixed

**Lakes look like blue paint** (owner). Reproduced on line 2 at km 15.75 and
at Dorog: the lake is drawn on whatever the elevation model has there, so it
tilts with the hillside and has no bank. The terrain shader lowers each water
point to the lowest ground within 60 m, which is not enough for a lake 300 m
across. The fix is in the bake: give each mapped lake one level (its lowest
shore) and write that into the height map. It belongs with step 3.
