# Session S-19 (14 Oct 2026): progress log

S-19 was done by another agent (Antigravity). Its first version of this file described several
features that are not in the code. This version was rewritten the same evening after reading the
code and running the build. A review fixed eight bugs; they are listed at the end (section 7). Nothing
from S-18 or S-19 is committed yet.

The owner's requests that started it:
1. "A new start: a high view of the city and region, pan and tap anywhere to drop into a nearby vehicle of your choice."
2. "Personas: your own character and colours, super-abilities ('Hancock'), other ways of getting around."
3. "Katt ide idea is not very smart zoom in and zoom and pan based on position or pan if open, click also didn't work."
4. "Destruction not really visible didn't react much but had a large brown stuff over the screen for a long time."
5. "If one world why it needed to load to switch trains?"
6. "Map is very low res … pois labels on the map should scale with zoom currently too big, the blast and destruction is built in really nicely."

---

## 1. Hero / on-foot mode (`main.js`, `input.js`, `hud.js`)

How to get in:
- ⇧H;
- the "Hős" button on the mode bar;
- the hero card on the menu;
- a dropped pin on the map (section 2).

Esc leaves it.

Keys (in `input.js`):
- W/A/S/D walk; Shift runs (14 m/s for the hero, 8 m/s on foot).
- Space: on the ground, a launch at 45 m/s (80 with Shift); in the air, climb.
- C, X or Ctrl: dive.
- In the air, W flies where the camera looks (32 m/s, 80 with Shift), and S flies back.
- E: blast. F: first or third person. V: next character. P: pause.

The blast:
- It adds a crater through the S-15 crater system: `addCrater`, 16 slots, `CRATER_GLSL`. The shader code is S-15's; S-19 did not replace it.
- It also makes sparks, a shake and a boom, and throws road vehicles within 90 m × power on ballistic arcs.
- It pushes standing platform people away.
- The full-screen brown smoke is not used here.

A boosted dive (⇧C) landing makes the same blast.

**Characters:**
- The 24 PSX models from S-18 (`CHAR_MODELS` in hud.js names them).
- The map's pin card has ◀ ▶, man and woman shortcuts, and four tint buttons. A tint is one brightness multiplier (`tintScale`); there are no separate skin, hair or garment colours.
- There is no 3D preview in the picker.
- If the people models are not loaded, a box figure with a cape is drawn instead (`buildHeroMesh`).

**City stroll:** the same mode without powers: a 4.2 m/s walk and a small jump. Only the map pin offers it.

**Train roofs:** the hero is held on a train's roof when within 4.5 m sideways and 2 m of the roof height. The hold is to the nearest 10 m track point, so it hops along a moving train and you cannot walk along the roof.

**Not built** (the first version of this file claimed them):
- lifting and throwing cars;
- a charged super-jump;
- the double-tap-W boost with a widening field of view, and a Mach cone;
- a live preview in the character picker;
- per-part colours;
- the B key for the blast (it is E).

## 2. The map (`hud.js drawMap`, `input.js`, `tools/bake_map.py`)

Opening, zooming and panning:
- Clicking the corner map opens the full map at 2.2×. Tab still toggles it.
- The full map has + / − / reset / centre buttons; zoom runs from 1× to 6×.
- A drag pans; a click without a drag drops a pin.

The pin card offers:
- hero;
- city stroll;
- a car;
- the nearest tram;
- a Cessna 320 m over the pin.

Clicking a tram or train badge on the map boards it.

**Map images:** re-baked at `SCALE = 1` (one cover pixel per map pixel, 25.7 m/px).
- Line 70: 1361×1941 px.
- Line 2: 1604×1626 px.
- S21: 1907×2613 px.

**Labels:** sizes follow the zoom. Below 1.35× only the major stops are named, and landmark labels that would overlap are skipped.

**The landmark labels:**
- Parliament, Buda Castle, Gellért Hill, Margaret Island, Hősök tere, Hűvösvölgy, Kelenföld.
- They were typed in line 70's metres and stood 200–775 m off; the castle was in Pest. They are now lat/lon, placed in the loaded line's frame (section 7).
- The "Budaörsi út" label was dropped: it is a road, not a place.

## 3. Trams (`trams.js`, `tools/bake_trams.py`)

The 7 lines from S-16/17 run unchanged: 1, 2, 3, 4, 6, 56, 61 (15 route directions). The first version of this file said 6.

S-19 added:
- **Stop names:** shown while riding, and used for the street plaque. S-19 typed them as lists matched by index, which was out of step. They now come from OSM (section 7).
- **Manual tram controls** while riding:
  - W power, S brake, B full brake;
  - E or D doors (when stopped);
  - M toggles manual;
  - Space pauses.
- **Danube bridge decks:** for 1, 4 and 6, drawn under the track wherever it is lifted more than 2 m: a deck, railings, and piers every 35 m. They are drawn in addition to the city tiles' own road bridges; whether they double up on screen has not been looked at.

**Removed in the review:** the Hűvösvölgy "Nagyhíd" viaduct, a 139 m stone viaduct with piers, a stop and a shelter at a fixed 238 m. It was invented: OSM's Nagyhíd on the 56/61 is a 3.7 m bridge (ways 1354687146/7).

## 4. Road traffic (`traffic.js`)

- Tram tracks are no longer driven on.
- At a junction a car does not turn back down the way it came, and it prefers to carry on straight.
- Red lights:
  - the stop line is 1.5 m before the junction;
  - the anti-stuck nudge never pushes a car past a red.
- Spawning:
  - no car spawns within 120 m of the camera;
  - in the car and hero modes that distance is 16 m (`closeTraffic`), so the streets round you fill.
- Headings are smoothed between frames.
- Traffic-light poles are not placed on a carriageway.

## 5. Look

**Façades** (`FACADE_GLSL`), four tenement variants:
- Secessionist, with a green-or-gold tile band under the eaves;
- wrought-iron balconies with corbels;
- eclectic, with arched first-floor windows and pediments;
- renovated.

Ground floors:
- banded rustication;
- an arched gateway every fourth bay.

The roofline gets a cornice with brackets and dormer windows.

**Paved squares (land-cover class 16):**
- `bake_world.py` can bake them from `highway=pedestrian` and `place=square`, but no cover raster has been re-baked.
- At boot, `main.js` paints ten hand-typed circles (Széll Kálmán tér, Déli, Nyugati tér, Blaha, Deák, Batthyány, Móricz, Gellért tér, Fővám tér, Jászai Mari tér). These are circles, not the squares' OSM shapes.

**Street-name plaque** at the top of the screen:
- the street or square within 85 m, from `web/data/streets.json` (`tools/bake_streets.py`);
- otherwise the nearest place;
- otherwise the next tram stop, within 80 m.

**City trees** are no longer placed on carriageways.

**Déli pályaudvar:** `bake_context.py` gives it a flat roof instead of a barrel vault. The line contexts were not re-baked.

## 6. Other

- `web/src/unified.js` (13 Oct): the "one world" coordinate frame, the per-line offsets and `MultiRoute`.
  - They are exposed on `SIM` and tested (3 checks); nothing is drawn through them yet.
  - The test passes with a 94.5 m gap between line 70's and S21's Nyugati, which is more than one station's width.
- Switching between lines still reloads the page (`?line=`). Within a line, trains and trams switch without loading.
- `tools/serve.py`: threaded, IPv4 and IPv6.
- Tests: `node tools/test_sim.mjs`, 33 checks, all pass.

## 7. Review of 14 Oct: bugs found and fixed

Each was reproduced in the running build, fixed, and checked again in the preview (numbers in brackets).

1. **Trams crossed the Danube on the riverbed on line 2 and S21.**
   - The bridge test used boxes typed in line 70's metres, and the other lines' frames are kilometres apart.
   - Fix: lift over river cover for 1, 4 and 6 only, in any frame, with 5% ramps.
   - Checked:
     - line 2: 6.1–7.6 m over the river (was 0.7);
     - line 70: 6.5–8.2 m;
     - steepest step 0.25 m per 5 m.
2. **Tram stop names out of step**, wrong termini (2 ended at "Müpa", 4 at "Széna tér"), and half of tram 3 nameless.
   - Fix: `tools/q_tram_stops.ql` downloads the stop nodes' names to `data/raw/tram_stops.json`; `bake_trams.py` writes `stop_names` beside `stops`; the typed lists are gone.
   - The geometry and stop distances in `trams.json` are unchanged (compared).
   - Checked: all 15 directions start and end at their real termini, and every stop has a name.
3. **Sand and beaches were drawn in the quarry's ochre:** the colour table had been shifted for class 16. It is restored: 14 sand, 15 quarry, 16 paving.
4. **The street plaque never showed on an "… út" road.** `\b` is ASCII-only in JavaScript; the test now uses `\p{L}`. Checked: "Andrássy út" and "Erzsébet királyné útja" show.
5. **Flying sideways (A/D) was mirrored** when facing anything but north or south. Checked: flight strafe now matches walking strafe facing north, east and 57°.
6. **Every dive landing struck a crater:** a 30 m dive gave 29 m wide and 4.5 m deep, and threw the cars round it. Holding C pulls at 78 m/s², so any plain dive lands at 70–85 m/s.
   - Now only a boosted dive (⇧C) strikes one; a plain landing kicks up dust.
   - The hero, driving cars and thrown cars now stand on the crater's ground: `craterDipAt` in main.js mirrors the shader's `craterDip`. They used to stand on the old ground over the bowl.
   - Checked:
     - plain dives from 30 and 150 m make no crater;
     - a boosted one does;
     - the hero stood at 101.2 m in a crater whose rim ground is 105.2 m.
7. **Map landmark labels 200–775 m off** (see section 2). Checked against the river cover: Buda Castle has the river 225 m east of it, Parliament 85 m west, and Margaret Island has water on both sides.
8. **Thrown cars span faster and faster, and vanished after 6 s, often in the air.**
   - The turn is now taken once.
   - A car settles, lies there, and goes 26 s after the blast.
   - Checked: a steady 0.119 rad per frame, landed at 1.9 s, still there 6 s later, gone after 26 s.

**Not checked on screen:** the sand colour and the map labels. The preview pane was hidden, so these were checked by numbers, not by eye.

**Still open from the review:**
- many new messages are Hungarian only, not through `tt()`;
- the tram pause message reads `state.lang`, which does not exist, so it is always English;
- the hard-coded paved-square circles;
- the hero's 10 m hops on a train roof.

## 8. The owner's round of 14 Oct evening: fixes

Checked in the preview by script; the lake also in pictures, old build against new.

1. **Esc now returns to the cab, desk and all, from every mode** (hero, car, tram, plane, free camera).
   - Each mode used to clear only itself, and the hero had switched the desk off, so you were on the train with no cab.
   - Every exit now goes through `toCab` in `index.html` (`window.__toCab`). ⇧H a second time does the same.
   - Esc in the cab opens the menu, as before: that is the way back to the start menu and to the other lines.
2. **Depth of field starts at 0.12** (was 0.35).
   - The slider now goes down to 0.04.
   - A saved 0.35, the old default, is treated as unset.
3. **The hero could get stuck for good on a train roof.**
   - The roof hold snapped you to the nearest 10 m track point every frame while you were within 2 m of roof height. A hero started from the cab spawns on the train, and the first jump went through roof height; after that no key got you off.
   - Now (`roofUnder`, `trainPoint` in main.js) you land on a roof only when falling onto it, ride with the train, can walk along it, and jump or walk off.
   - Checked: a freight at 80 km/h carried the hero 42.7 m for its 42.7 m.
4. **The hero camera** can now look 74° down (was 43°), and sits 9 m back in flight (4.2 m on foot; was 3.6). **Hovering** has its own pose: a slight lean, legs held mid-stride, a slow bob. It was the standing pose in mid-air.
5. **The line stood empty after a start or a jump in time.**
   - `Traffic.seekTo` only queued services entering after the seek.
   - Services already under way are now placed where their timetable has them: between two calls by time, or standing at a call.
   - Checked on line 70: 10 trains at 19:24 (was 0) and 15 at 08:00, moving.
   - This was there before S-19.
6. **Switching trains:** clicking a train on the map now hands you that train (`window.__takeOver`): its place, speed, stock and booked path, with the AI copy removed. It used to only follow it with the outside camera, while W/S went on driving your own train elsewhere.
   - That is the likeliest reading of "slows by itself despite manual control and holds 42 km/h". It was not reproduced: driving by hand, a KISS ran up to 119 km/h with nothing holding it back.
   - Checked: a freight taken over at km 6.12 and 65 km/h kept both, and picked up speed on full power.
7. **Obstacles on the line.**
   - Six OSM walls stood on or across the rails on line 70. They are now cut back to 2.6 m from either running track (`clearOfTrack`).
   - Parked wagons were kept 9 m from the down line only, and some stood on the up line, 0.66 m from its centre. They now keep 4 m from both.
   - City cadastre trees are kept 3.5 m off the running line.
   - Checked: nothing drawn is nearer than 2.67 m to a running track.
   - Wall pieces that were cut are 1 m segments, so they carry no graffiti.
8. **Map:**
   - Panning is held to the map's edges, so there is no dead zone to drag back through after pulling past an edge.
   - A click on the pin's card that misses its buttons no longer drops a new pin under it.
   - The map badge, the pin's "nearest tram" and the Villamos button now board a tram the same way (`boardTram`). It says so when no trams are running, and leaves the other modes.
   - Line 70's map ends at 47.456° N, just south of Nyugati, so it cannot pan further south.
9. **Dunakeszi lakes:**
   - Each lake was levelled per vertex from the lowest ground within 60 m. The big one is near river level, so half of it snapped to the river plane and half stood a little higher as water-coloured ground.
   - Now every water body except the river itself (the one more than 6 km across) is flat as a whole (`lakeLevels`, a float texture on unit 13). It sits on the river plane if its ground is within a metre of it, else at the 10th percentile of its ground.
   - Bank texels standing more than 0.35 m above the level are drawn as grass.
   - The 25 m cover still paints a few lakeside plots as water: at Dunakeszi the ground is flat at the lake's own level, so houses there stand at the water's edge.

**Not done; ideas for later:**
- a heavy-weather mode (drops on the lens and the FPV camera, spray behind cars);
- a physical derailment (the train leaving the track and breaking up);
- other destruction simulations;
- more fidelity in general.
