# Session S-16 (11 Oct 2026): progress log

The owner, after the phone loaded: "it works! … no way of controlling the
speed [on the phone], and I'd like to see an fps count." Then picked five
things from the review: phone parity, finish what is half-built, a reason to
keep playing, life, sharing.

## Done (seen in the preview unless it says otherwise)

- **Phone: the "⋯" sheet** (index.html `MORE`). It holds everything the keyboard had and touch did not:
  - time: pause, 1×, 4×, 16×;
  - train: sound, wipers, lights, sander, desk, restart;
  - view: zoom, labels, next train, wires, buildings, fps, Esc.
  - Buttons with a state light up. Seen in a phone-sized window: 4× set `speedMul`, the sheet lit the right buttons.
- **fps:** a switch in Beállítás ("Képkocka/mp kijelzése"), remembered, and in the ⋯ sheet. A small box bottom-left, with the automatic-resolution percentage when it is below 100. Seen: "31 fps".
- **Drive buttons with words:** "kézi vezetés" where there was a bare "M", "▲ menet / ▼ fék", and an "auto" button to hand back. All touch labels are in English too.
- **Three more missions** (13 now; line 70 has 7, line 2 has 3, S21 has 3):
  - `s21-toltes`: Nyugati → Kőbánya-Kispest in the 416;
  - `m2-hid`: Nyugati → Óbuda over the Danube;
  - `s21-este`: Dabas → Lajosmizse in fog.
  - Not driven. Their stops exist on their lines (checked against the route files).
- **Dark timeline panel** (`?mode=dark`, `#darkPanel`): the three weapons, STRIKE (so a phone can), clear, and a count. J and K still work. Seen: pick, strike, clear.
- **Share links** (the mode bar's "Megosztás", `window.__share`): `?line=…&at=km&h=hour&d=day&wx=id[&dir=-1][&cam=x,y,z,yaw,pitch]`.
  - Opening one sets the day, time and weather, starts a run there with the menu closed, and puts the free camera back if the link has one.
  - It uses the phone's share sheet on touch devices and the clipboard elsewhere.
  - Seen: an S21 link opened at Zugló, 7:30, day 300, fog, in the 416. The run starts at the nearest stop to `at`.
- **A catch from the new loader message:** my first version of the sheet declared `EN` twice; the loading screen's error text named it at once.

## Second half (the owner: "boarding a tram; people walking and traffic lights; what are the 27?")

- **Riding a tram** (⇧T, or "Villamos" on the mode bar; `window.__tram`, `Trams.nearest`).
  - Boards the tram nearest the camera, within 6 km. A message says so when none is running or near.
  - It is a ride, not driving: the tram keeps its clock timetable.
  - Views: the driver's eye, or outside with C (the camera comes in closer rather than sit inside a building). The mouse looks round; Esc goes back to the train.
  - At the terminus you are put on the next one out.
  - Seen: tram 4 towards Széll Kálmán tér, both views.
- **Traffic lights** (`tools/q_traffic_signals.ql`, `tools/bake_traffic_lights.py` → `web/data/traffic_lights.json`, 38 KB).
  - 3,624 OSM signal nodes merged into 1,464 junctions (nodes within 28 m).
  - Each junction runs a 64 s cycle: north-south green, amber, all red, then east-west.
  - Cars brake to a stop line where their road enters the junction's circle, and go on green.
  - A pole with a three-lamp head stands at the kerb by each stop line (up to 8 a junction); the lit lamp blooms.
  - Seen at Astoria: poles, red and green lamps, cars queued behind a line. On line 70, 886 roads have stop lines and 344 junctions have poles (the rest are outside the loaded roads).
  - Not real phasing: no turn arrows, no pedestrian lights, and trams ignore the lights.
- **People walking** (`geom.js buildWalkers`, inside `buildPlatformPeople`).
  - Up to 110 walkers within 190 m of the camera, along the kerbs of the streets, more on big roads and at rush hours.
  - Not simulated: each one's place is a function of the clock, so it costs only what is drawn. Their legs swing.
  - On a one-way road (half of a divided one) they keep to the right-hand kerb, out of the median.
  - Seen at Astoria at 8:00. A few still walk in the road where a street is drawn wider or narrower than its data; they pass through each other, and they do not wait at lights.
- **Frame time** with lights and walkers, same busy view: median 6.6 ms, p90 19.9 ms (the pane was small).
- **The build checks syntax now** (`build_sim.py`): every inline script goes through `node --check`, and the build fails on an error. Twice this session a syntax slip left the page with no game while the 28 headless tests passed, because they do not load the bundle.

## Not done from the five

- **Dispatcher game in the menu:** it still cannot be won or lost (too few meets on the single track); putting it in the menu would not finish it. Needs denser traffic first.
- **A guided first drive** (the first-run hints exist; a proper tutorial mission does not).
- **The owner's look at the "built" rows.**
- **Phone portrait:** the cab view is letterboxed between dark bands, and the panel covers the top half until it is folded. Not touched.

## Where this session stopped

Pushed 11 Oct on the owner's word. Tests 28/28.
