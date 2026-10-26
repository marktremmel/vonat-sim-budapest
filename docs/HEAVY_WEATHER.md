# Heavy weather mode (15 Oct 2026)

The owner asked for an "insane" weather option after reviewing S-19: rain on the
camera, spray behind cars, splashes. It is a switch in Beállítás:
**Erős időjárás (cseppek, permet)** / *Heavy weather (drops, spray)*. It is off
by default and remembered in `szobPrefs.gfx.heavy`. Pushed in `ffe8dce` (26 Oct).

## What it does

- **Drops on the lens** (`BLIT_FS` in `shaders.js`, `lensDrops`, uniform `uLens`).
  - Two grids of cells (big drops and small ones), each cell holding at most one drop.
  - A drop lands, sits, and late in its life slides off. It slides down when the camera is still, and outward from the middle when the camera moves. It leaves a thin trail behind it.
  - Inside a drop the picture is sampled from the far side of the drop (an upside-down little lens) and softened. The drop has a dark rim and a small glint.
  - Worked out per game pixel, so it keeps the low-res look.
  - How wet the lens is (`state.lensWet`) rises in rain and dries slowly afterwards.
  - It is drawn in the outside, free, drone, chase, car-chase, tram and hero views. It is not drawn in the cab or a carriage (the windscreen and wipers already do that), a car's or plane's cockpit, or photo mode.
- **Spray** (vfx type 6, a pale dithered mist).
  - Road vehicles: `buildRoadTraffic` lists cars faster than 4 m/s within 160 m of the camera in `RT_SPRAY`. `main.js` throws two plumes off each car's rear wheels, more the faster it goes.
  - Trains: mist along the bogies and a wake behind every train faster than 8 m/s near the camera. The player's train is included when you are not in it.
  - Only on a wet road (`wx.wet` or rain falling), never in snow.
- **Splashes** (vfx type 7): small crowns where rain lands within about 22 m in front of the camera. They land on roofs (`solids.topAt`), roads and ground. Not when the camera is more than 60 m above the ground.
- **Phone** (`state.lite`): a third as many spray and splash particles. The lens layer costs the same.
- Spray and splashes stop spawning when the particle pool is within 600 of full, so a crash still has room for its fire.

## Frame time (measured in the preview, 1280×800 viewport, internal 597×373)

The camera is the follow camera in warm-front rain (rain 55%, road wet), with the train
at about 110 km/h near Nyugati. Each run is 150 frames from `SIM.step(1, 16)`, with a
1-pixel `readPixels` after each so the GPU work is counted. Off and on alternate, twice each:

| setting | median ms | p90 ms | live particles |
| --- | --- | --- | --- |
| off | 19.1 / 18.7 | 20.4 / 19.9 | 0 |
| on | 19.1 / 19.1 | 20.3 / 20.4 | 1307 / 933 |
| off, `lite` | 18.9 / 18.4 | 20.1 / 19.7 | 0 |
| on, `lite` | 18.8 / 18.8 | 20.1 / 20.3 | 277 / 286 |

An earlier run at the start of the line, with the camera over Nyugati, gave 21.2 ms off and 21.6 ms on (median).
The cost is within about 0.4 ms a frame, which is near the noise of this measurement.

Limitations:
- Setting `state.lite` at runtime only thins the spawns. It does not reproduce a phone. Nothing was measured on a real phone.
- On a phone the lens pass runs at the phone's screen resolution, like the rest of `BLIT_FS`.

## Screenshots

These are in `scratch/heavy_weather/` (not for the repo):
- `1_lens_first_try.jpg`: drops on the lens over Nyugati. The glints were made smaller after this shot.
- `2_car_spray_chase.jpg`: car chase camera, spray plumes behind the car, drops on the lens.
- `3_train_spray.jpg`: a KISS at speed with its spray wake, from the free camera, with drops on the lens.

## Not done / known

- Precipitation streaks still lean with the player train's speed even when the camera is a free camera. This was already the case before this change.
- Ships throw no spray. Cars in the city tiles do (they are in the same `RoadTraffic`).
- Snow on the lens is not modelled; the lens stays dry in snow.
