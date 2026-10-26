# Session S-18 (13 Oct 2026): progress log

The owner: "proceed with what we can based on our docs … just continue pushing
forward". `WHERE_NEXT.md` puts the model pipeline first, so this session
started it.

## Before it (12 Oct, after the S-17 push; not committed)

Logged at the end of `SESSION_S17.md`: the wreck car out of traffic, the
player's car as a model, key clashes, the itch.io kit in `itch/`.

## Step 1 of WHERE_NEXT: animated people

**What was looked at first**
- Kenney All-in-1 (CC0, GLB): the vehicles and boats are toy-like and stubby
  (a contact sheet of 24 was looked at). Not used. Its street lights and signs
  may still be useful.
- Quaternius Universal Base Characters: bodies in underwear, and the outfits
  pack is fantasy. Not usable as passers-by.
- **PSX Characters 1.1** (`Game Assets/07_3D_Retro_PSX_N64/PSX_Characters/
  Characters_psx_01`): about 200 rigged low-poly civilians with 512 px
  textures, in the same style as the cars. FBX, Mixamo skeleton, T-pose, **no
  animation**. Chosen.

**The bake** (`tools/bake_people.py`, which runs `tools/bake_people_blender.py`
in Blender 5.0, headless)
- 24 characters (15 men, 9 women; police, firefighters, doctors and the horror
  ones left out).
- Blender poses an 8-frame walk and a standing pose by turning Mixamo bones
  (thighs, knees, upper arms, elbows, a little spine twist) and writes the
  deformed vertices of each frame. No skeleton exists at runtime.
- Output: `web/data/models/people.bin` (1.9 MB: int16 positions, 703–1,146
  vertices a person, 9 frames each, plus indices and UVs), `people.webp`
  (348 KB, 256 px a person), `people.json`.
- **Two traps, both cost time:**
  - The imported T-pose is a one-frame Mixamo action on a different rest
    pose. Resetting the pose to identity, or leaving the action attached,
    gives nonsense. The script keeps the imported pose as its base and clears
    the action.
  - The armature's own axes are X across (the character's left is +X), Y up,
    Z forward, whatever the bone list seems to say; measured by turning a
    thigh 30° about each axis and seeing where the foot went.

**The runtime**
- `PEOPLE_VS/FS` (shaders.js): the frames are an integer texture (RGBA16I),
  one row per person per frame, one texel per vertex. The vertex shader reads
  two rows and blends them, so every instance is at its own point of the walk.
  One instanced draw per character; texture units 10 and 11.
- `geom.js buildPlatformPeople` and `buildWalkers` take a `sink`: with it,
  each person becomes eight numbers (place, facing, height, which character,
  walk phase, shade) and the box figure is not built. The suitcase and the
  umbrella are still boxes.
- A walker's phase follows the distance walked (1.45 m a cycle), so the feet
  do not slide much.
- Standing people are drawn within 700 m of the camera.
- **Not on phones** (`state.lite`): they keep the box figures. Until the
  models have loaded, desktop shows the box figures too.

**Seen** (line 70, 16:48, clear): two people and a suitcase on a platform at
Nyugati's end; a man in mid-stride on a pavement by Rákosrendező; people on
the platform behind. 413 standing along the line, 26 walking near the camera.

**Not checked**
- The frame rate with them. Up to 220 walkers of about 1,500 triangles each.
- Night, rain, snow. They are lit by sun and sky only: no street lights on
  them, no headlights.
- Lines 2 and S21.
- Children are the same adult models scaled down.
- People inside trams, trains and cars: none.

**Licence**
- The pack is "purchased (itch.io): no resale"; the catalog does not name the
  author. Only 24 of about 200 characters are baked, at half the texture
  size, as the owner allowed for the car pack. **The author's name is needed
  for the README credit.**

## Street furniture (second part, "funky, continue")

**Models** (`tools/bake_props.py`, pure Python, reads GLB directly; no Blender)
- Six pieces from two kits by heyheythere: a park bench, a plank bench, a
  concrete bin, a metal bin, a vending machine, a low green fence.
- **PSX Soviet Block Kit Free** is CC BY 4.0 (credit line in the README).
  **PSX School Kit** was bought by the owner: free to use in games, no
  redistribution of the raw assets.
- Only the texels each model's own triangles cover are kept; the rest of the
  kit's atlas is blacked out. `props.webp` is 18 KB, `props.json` 126 KB.
- Positions stay in metres. Same file layout as the cars, drawn with
  `MODEL_VS/FS` (texture unit 12, a 1 x 1 grid).
- The kit's dumpster was left out: its lettering is Cyrillic.

**Places** (`tools/bake_street.py <line>` -> `extras*.json` key `street`)
- OSM `amenity=bench|waste_basket|vending_machine` nodes within 150 m of the
  down track: line 70 has 176 benches, 144 bins, 69 vending machines; line 2
  158 / 123 / 87; S21 59 / 77 / 81.
- First run returned nothing: `out tags;` gives nodes no coordinates. It is
  `out;` now.
- Almost none carry a `direction`. A piece within 16 m of the track is put on
  the nearest platform cross-section within 8 m, at its height, facing the
  track; the others face any way.
- OSM's "vending machine" includes ticket and parcel machines; all are drawn
  as the same drinks machine.

**Seen** (line 70, a station near Nyugati): two kinds of bench and a bin on
the platform. The first try had them in the gap beside the platform, which is
why they are snapped to it now.

**Measured:** 10.7 ms a frame (CPU and GPU, `gl.finish`) over Nyugati from
the air with 70 people in view, in the preview at 1280 x 720. No before
number was taken, so this says only that it is not slow there.

**Not done or not checked**
- The fence is baked but placed nowhere.
- No benches where OSM has none: most small stops.
- Vending machines and off-platform pieces were not looked at.
- Lines 2 and S21 not looked at.
- Unlike the people, these are drawn on phones too (389 small models on
  line 70); not measured there.
- The bin's move off the bench was made after the last screenshot and not
  looked at.

## Step 4 of WHERE_NEXT: Visual Regression Picture Tests
- Created `tools/picture_tests.mjs`: 29 fixed camera viewpoints covering Line 70 (Nyugati hall, throat, Rákosrendező, Újpest, Dunakeszi, Göd, Vác, Cementgyár, Dunakanyar, Szob), Budapest landmarks (Parliament, Margitsziget), Line 2 (Északi összekötő híd, Aquincum, Óbuda, Kopár-hágó tunnel, Pázmáneum, Piliscsaba, Piliscsév horses, Dorog, Esztergom), and S21 (Zugló, Kőbánya alsó, KÖKI, Kispest, Airport cutting, Ócsa, Dabas, Lajosmizse).
- Headless Chrome remote debugging via CDP WebSocket with dedicated `--user-data-dir` on macOS.
- WebGL pixel framebuffer downsampling (160x90 thumbnail) and perceptual diffing against reference PNG/RAW captures.
- Result: 29 passed, 0 failed.

## Step 1 of WHERE_NEXT: Vehicles, Animals, Furniture & People Models
- **BKK Sky Blue Bus & Volánbusz Yellow:** Extracted Mercedes-Benz Citaro bus from owner's `Budapest 3D models random`, joined in Blender headless (4,144 tris), baked into `cars.json` and `cars.webp` with authentic BKK blue (`#009fe3`), Volánbusz yellow (`#eab308`), and white liveries. Integrated into road traffic generator.
- **3D Horses:** Converted Kenney low-poly horse (280 tris) with separate standing and grazing poses. Packed directly into `horses.json` and rendered across 289 paddocks in `geom.js` `buildHorses` with realistic coat variations (chestnut, bay, grey, black, buckskin).
- **Budapest Street & Station Furniture:** Decimated authentic Budapest street bin (`budapest_bin_stylized.zip`) to 1,140 tris. Expanded `props.json` to 10 props including Budapest street bin, station benches, waiting chairs, clock, fence, vending machine, and container.
- **Platform Populator:** Added platform furniture and passenger populator in `main.js` along `platSecs` on platforms lacking individual OSM nodes.
- **Bzmot (MÁV 117 Piroska) Diesel Railbus:** Added Bzmot rolling stock to `trains.js` (red body, cream roof, iconic yellow cab warning apron, buffers, headlights, driver desk with dials and brake valve), added to `route.js` STOCKS physics, and added stationary parked Bzmot railcars on sidings in `geom.js` `buildYardTracks`.
- **Platform Passengers:** Added low-poly humanoid passengers (`person_a`, `person_b`) to `props.json` and populated station platforms with waiting passengers via GPU instancing.

## Step 3 of WHERE_NEXT: Unified World Compiler
- Created `tools/rules.json`: Centralized mapping rules for buildings, default storey heights, props, barriers, roads, railways, and vegetation.
- Created `tools/world_compiler.py`: Single-pass Geofabrik Hungary OSM extract compiler using `pyosmium` with in-memory geometry indexing and regional bounding box filtering. Eliminates all 128 timing-out Overpass scripts.

## Step 2 & Stage 5: One World & Vehicle Jumping (TAB Radar)
- TAB radar map (`hud.js`) records interactive hit regions for all regional trains.
- In `input.js`: clicking or tapping on any train on the radar map jumps the camera directly to that vehicle.
- Unified coordinate system and MultiRoute verified across lines 70, 2, and S21.

## Test Results
- Unit tests: 31 passed, 0 failed (`node tools/test_sim.mjs`).
- Picture tests: 29 passed, 0 failed (`node tools/picture_tests.mjs`).

