# Session S-17 (12 Oct 2026): progress log

The owner's phone test (20 fps) and a ride on line 2 with photos (52–69).
All of it is filed in OWNER_BACKLOG "Feedback 11–12 Oct".

## Done (seen in the preview unless it says otherwise)

- **Kopár-hágói vasúti alagút** (line 2, km 27.57–28.35; OSM way 8060291).
  - The game had no tunnels: the line ran in an open cutting.
  - `tools/patch_line2.py` writes `route.tunnels`.
  - `buildCorridor(…, tunnels)`: over a tunnel the corridor mesh is the hillside (the heightmap has the cutting baked in for ~45 m a side, so the roof is carried across from the ground 62 m out, at least 8.5 m over the rail), plus a tube (floor, walls, arch) and a stone portal at each end.
  - Seen from the approach and inside. From above the hill is green but has no trees (the corridor's tree clearing).
- **Pázmáneum** stop (km 28.98), from OSM's stop positions; the same patch tool. The timetable has no calls there, so AI trains pass; the player's stopping train calls.
- **Skip to the next stop**: `window.__skipStop`, ⏭ on the mode bar, ⇧N, and the phone sheet.
- **Contrails**: 7 airliners (was 3). Not looked at.
- **Walkers**: about twice as many on desktop (max 220, 230 m); on phones 50 within 130 m, rebuilt every 2nd frame.
- **Phone frame rate**:
  - The fps box also shows `js N ms`, the frame's own work.
  - Traffic lights are rebuilt every 6th frame; trams are built within 1.4 km on phones.
  - In a phone-sized window on this Mac a frame is about 5.6 ms and no single layer dominates. Not measured on the phone.
- **Game Assets folder** reviewed (see the backlog row). Nothing imported.

## Second half ("continue … Nagykörút from Nyugati until Király or Oktogon … use the game assets")

- **Nagykörút traffic gap.**
  - `RoadTraffic` dropped ways under 90 m (and with fewer than 3 points) from the line's roads, and under 40 m from city-tile roads.
  - OSM cuts the körút into dozens of short pieces between Oktogon and Blaha, so it had no through traffic.
  - Roads of class 3 and up now keep pieces from 6 m. Line 70 went from 6,866 to 9,741 traffic ways.
  - Measured after: cars on main roads in every tenth of Oktogon–Blaha.
- **"Only one tram?"** 71 were running; the draw distance is the reason (3 km, 1.4 km on phones).
- **Recorded sound from the owner's library** (`web/data/audio/amb/`, 2 MB; `Sound.setLoop`):
  - `outdoors.m4a`: 45 s of FilmCow "ambience - woods near suburbs", outside the train by day;
  - `car.m4a`: FilmCow "car sedan inside", in the car;
  - `menu.m4a`: Clement Panchout "Contemplative", on the menu.
  - Only with the sound on (G). The outdoor loop was seen to load and start; nothing was listened to.
- **Horses** (`tools/q_horses.ql`, `bake_horses.py` → `web/data/horses.json`; `geom.js buildHorses`): 289 places in the region, those within 5 km of the loaded line built at boot (50 on line 2). Seen near Piliscsév.

## Third part ("no way of switching between 4-6, 2, 1, 3, 56, 61 … we can already place graffiti … where to go from here")

- **Tram line picker** (`#tramBar`, `window.__tram(ref)`, `__tramBar`; `Trams.nearest` takes a test function).
  - The Villamos button and ⇧T board the nearest tram and show the bar: one button a line, and "leave".
  - A line boards its nearest tram at any distance; the same line again moves to another tram of it.
  - Seen on line 2's world: nearest tram, then a 56 in Buda, bar highlighted.
- **Walls** (`tools/bake_walls.py <line>` → `extras*.json` key `walls`; `geom.js buildWalls`).
  - OSM `barrier=wall|retaining_wall|noise_barrier|city_wall` within 70 m of the down track: 106 on line 2 (5.6 km), 83 on line 70 (9.7 km), 7 on S21 (4.2 km).
  - Drawn as a 24 cm slab at the OSM height, or 2.0 / 2.4 / 3.5 m by kind. A retaining wall is drawn standing free, which is wrong where it really holds a bank.
  - `bake_linex.py` keeps the `walls` key.
- **Graffiti** (`geom.js graffitiSpots`, `DECAL_VS/FS`, `main.js makeGraffiti`, texture unit 9).
  - The 40 graffiti pieces of the sticker sheet, on about a third of 8 m wall stretches a side, and on some standing gondolas, coaches and containers.
  - 790 pieces on line 2. Not on phones. Not on glass or named walls.
  - Seen: a tag on a wall by Aquincum; a piece on a brown wagon.
  - Not looked at: line 70 and S21; at night; in rain.
- **Lakes "just blue texture"**: reproduced, not fixed (`WHERE_NEXT.md`).
- **Docs:** `ASSET_GUIDE.md` (what to get, in what form) and `WHERE_NEXT.md` (engine options and a five-step plan). Pack names and the open data sources in them were not checked online.

## Not done

- Station buildings and the winged wheel, Dorog, the lakes.
- The new start screen; personas.

## Where this session stopped

Not committed (the owner reviews first). Tests 28/28.
