# Physical derailment and blast-thrown trains (15 Oct 2026)

On 14 Oct the owner asked whether a derailment could really derail and break
up. This note covers what was built for that, how it was checked, and what was
not done. None of it is committed.

Screenshots: `docs/img/derailment_s20.jpg`. They were taken from the canvas
in the preview (port 8178) at 1280×800.

## What was built

**`web/src/wreck.js`** (new; added to `ORDER` in `tools/build_sim.py` after `trains.js`)
- `TrainWreck` gives each car two particles, one at each end, in plan (east, north). It runs on position-based dynamics at a fixed 1/120 s step:
  - each body keeps its length;
  - couplers hold the gap between cars, and one pulled 1.2 m too far can tear;
  - folded neighbours stay a V, and other cars keep a car-width apart;
  - a car still on the rails is held to the track until it is pulled 0.5 m off it.
- Friction:
  - on the rails, the emergency brake (1.4 m/s²);
  - off them, the ground, harder sideways than lengthways while the car is upright;
  - on its side, the same both ways.
- Across the car the body is a box rocking on its lowest corner:
  - a kick at derailment and the sideways slide can tip it;
  - past about 32° (a KISS is top-heavy) gravity takes it over;
  - it lands on a face, bounces a little and slides;
  - in the air (blast) it turns freely.
- Heights come from `trackGround()`: the ballast beside the rails, a 1:1.5 embankment or cutting slope, then the terrain (`demAt`). The track segments are filed in 25 m cells.
- Each car whose front reaches the derailment point at more than 72% of the first car's speed goes off too, with a kick scaled by its speed. So the front cars go over and the rear ones usually stay on the rails.
- `blast(x, n, R, power)` throws every car within `R` away from the point, upwards and rolling. The nearer end of a car gets the harder push, so the car slews round.
- The wreck reports `land`, `scrape`, `derail` and `tear` events. It does not draw anything itself.

**`web/src/trains.js`**
- `carLayout(t)` gives each vehicle's centre chainage, half length and height. It uses the same layout `buildTrains` draws.
- `buildTrains` draws a car that has `t.wreck[k]` from that pose: roll, then pitch, then heading, about the body's middle.

**`web/src/main.js`**
- The derailment rule itself is unchanged: over 2.6 m/s² sideways and over 1.35× the posted limit, driving by hand. What it triggers is new. `startWreck`:
  - builds the wreck at the train's speed;
  - throws the cars to the outside of the curve;
  - moves the camera to a free camera outside the curve, which turns to follow the first three cars until you drag the mouse (`state.wreckCam`).
- `stepWreck` holds the driver at zero with the lever at EB. The end card ("Kisiklás" / "Derailed") comes 1.5 s after everything is at rest, or after 14 s at the latest.
- `wreckFx` turns the wreck's events into effects:
  - dust along a car that lands on its side;
  - sparks where steel scrapes the rails and ballast;
  - a thump through `sound.boom`;
  - camera shake that falls off with distance.
- **Second destruction: the hero blast derails trains.** `triggerHeroShockwave` calls `blastTrains(x, n, 60·power, power)`:
  - an AI train with a car in reach leaves the timetable (`traffic.trains`);
  - it becomes a wreck that is thrown, lands and stays;
  - the four latest are kept (`aiWrecks`).
- `SIM.blastTrains` and `SIM.aiWrecks` are exposed for the console. A new run clears both kinds of wreck.

**`web/src/shaders.js`** (VFX_FS): a smoke particle with a negative temperature is dust, ballast-coloured and at 55% opacity.

**`tools/test_sim.mjs`**: three new checks (35 in all). A KISS at 1.6× the limit in the sharpest curve near Nyugati must come to rest, its first car must end up more than 5 m outside the curve, and that car must go over (more than 60°).

## How it was checked

- `python3 tools/build_sim.py` builds, and `node tools/test_sim.mjs` passes all 35 checks.
- In the preview, line 70, KISS, hand-driven:
  - 130 km/h into the 60 km/h curve at Rákosrendező (R ≈ 413 m), triggered at 134 km/h;
  - four or five cars left the track and three to five ended on their sides;
  - they came to rest 12–57 m from the track after about 8–10 s;
  - the "Derailed" end card then showed (`#endModal` display `block`).
- Blast, through `SIM.blastTrains` plus a crater and an explosion (the same calls the shockwave makes):
  - a 16-wagon freight at about 95 km/h had 10 wagons thrown, several onto their roofs;
  - a moving KISS had five cars thrown up the bank.
- Bugs found and fixed on the way:
  - a zero-length frame made 0/0 velocities (NaN poses);
  - a very short frame turned constraint corrections into huge speeds, which is why the step is now fixed;
  - a car bouncing off the ground lost its horizontal motion.

## Not done (limitations)

- Wrecks do not collide with buildings, trees, catenary masts, platforms or other trains. In the Rákosrendező test a car slid into a shed.
- Cars do not climb over each other, bogies do not tear off, and bodies do not crumple. Each car stays one rigid box.
- The track, overhead line and ground are not damaged, and no crater is left by a derailment.
- After a derailment, AI trains behind are not stopped: they run through the wreck site. Blasted AI trains simply vanish from the timetable.
- The player's own train is not thrown by the hero blast. It is not part of a hand-driven run in hero mode, and wrecking it would need the run's end handled.
- Sound is the existing `boom` only, with no grinding.
- The end card is HTML, so it is not in the canvas screenshots. It was checked through the DOM.
- Seen in passing (existing crater system, not changed here): a crater dug next to the Danube showed a flat triangle of water over the road and track, because the crater lowers the ground below the water plane.

## Other destruction ideas, not built

- **A bridge or overpass giving way:** split a `deckAt` road bridge at its piers and drop the spans. The cars on it would fall with the thrown-car ballistics.
- **A building collapsing over time:** `blastAt()` in CRATER_GLSL already turns buildings into heaps at once. A per-crater start time could animate the fall, with dust from `wreckFx`.
- **A dam or levee break:** raise the existing flood plane (`FLOOD_VS/FS`) locally, and spread it outward with time from a breach point.
