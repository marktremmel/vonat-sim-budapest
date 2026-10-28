# Owner backlog: every request, with its status

Built on 25 Sep 2026 from every message the owner sent between 22 and 25 Sep 2026. They were extracted
from the session transcript, not from memory or summaries. Each line is one request, in the owner's own
terms (short quotes in "…"), with where it stands.

Screenshots the owner attached are in `../owner_feedback_images/` (outside
the repo: some are Apple Maps captures). The number after a date says which
images came with that message.

**Status key**
- **done**: in the game and checked in the running build.
- **built**: code is in, but nobody has looked at it on screen yet.
- **partly**: something was done, and the owner's point is not fully met.
- **open**: not started.
- **answered**: a question, answered in the docs.

When you finish something, change its status here and add the date. Do not
delete lines.

**The stages this list is grouped into, and the recommended order:**
[ROADMAP.md](ROADMAP.md) (26 Sep). **Waiting on the owner:** the two Újpest spots
(rows below) and what "cars: models are slow" means.

---

## Standing wishes (apply to everything)

- Accuracy from OSM / Overpass data is the point. No invented buildings ("I prefer data over Gemini's models").
- Keep and improve the landmark models the owner likes (bridges, Parliament via OSM parts…).
- "Infrastructure made visible": industry, mines, power lines, rails, works.
- A lighter, pastel look of the region, not grey Eastern Europe. **Not** a "weird PSX look".
- Graphics: smart modern features that keep the style (AO, DOF, motion blur were liked).
- Budapest's POIs and historic places matter to the owner ("I love my city").
- Every string in Hungarian and English.
- Git: commit or push only after the owner has reviewed the build.
- Purchased assets may be used and modified. Never commit the raw pack files.
- Docs: plain statements, verified; say what is not done.

## Trains and driving

| request | from | status |
| --- | --- | --- |
| Realistic train controls | 22 Sep | done (master controller, air/ED brake, slip) |
| KISS and FLIRT models; "the train has a hump on its back" | 22 Sep | done |
| Passenger mode, sitting at a window | 22 Sep | done (Y) |
| Dispatcher board consistent | 23 Sep | partly (board rewritten 23 Sep; the dispatcher *game* is a prototype, not in the menu) |
| Decorative trains crossing the player's path | 23 Sep | done (single-track working) |
| Line 2 freight per Wikipedia (M44, ÖBB 1116) | 23 Sep | done (times invented) |
| **S21 stock is wrong.** Owner: "an old Metrovagonmas car … diesel". Their photos show MÁV-START **416 021 / 416 031** | 25 Sep (img 48, 49) | done (26 Sep: MÁV 416 "Uzsgyi", Metrowagonmash, 2 cars, 45.8 m, 2×315 kW, 100 km/h per hu.wikipedia; model, physics, diesel sound; wires on S21 end at KÖKI; seen) |
| Side idea: the running cost of a diesel run (not in the main game) | 25 Sep | open |
| Cab lookout: "not just peering through a grey box" | 25 Sep | done (26 Sep: per-stock cab with a tall windscreen, blind, wipers, framed side windows, mirror; seen) |
| Sightseeing (Kilátás) follow camera too low, "move it up a notch" | 25 Sep | built (raised, never under the ground) |

## Lines and world extent

| request | from | status |
| --- | --- | --- |
| Line 2 Budapest–Pilis–Esztergom | 22 Sep | done |
| Esztergom city, bridge, basilica, Párkány (Štúrovo) | 23 Sep | done |
| Esztergom and Štúrovo roads | 25 Sep | done (26 Sep: roads kept to 3 km in the Esztergom–Párkány box; seen) |
| Line 2 cut off before Miklósffy kápolna, Urkuta, Zamárd, Ákospalota, Búbánatvölgy; Szob not reachable | 25 Sep | open (owner: fine to leave until a "whole world" exists) |
| S21 | 23 Sep | done |
| Line 71 ("will be easy") | 23 Sep | open (alignment broken, no context) |
| City expansion: districts 8–9, Kispest, Kelenföld, Budafok, Háros, Keleti | 23 Sep | done (city tiles, 47.39–47.58 N) |
| Keleti – Kelenföld – Háros line | 25 Sep | partly (its rails are drawn; no line, no trains) |
| Trams 1 and 4/6; HÉV H5 | 25 Sep | partly (trams 1, 2, 3, 4, 6, 56, 61 run; S-16: you can ride one (⇧T), driver's eye or outside; not drivable; H5 open) |
| One world: the lines joined | 25 Sep | open |
| Királyréti kisvasút, its vehicle, dense forest | 25 Sep | done (runs to Királyrét since 25 Sep) |
| Would it run on a uConsole? | 25 Sep | answered (README "How big it is": lowest quality at best) |
| How many km² is the map? | 25 Sep | answered (README "How big it is") |
| GitHub Pages | 22 Sep | done (24 Sep; the root serves the game) |

## Budapest: places the owner named

| request | from | status |
| --- | --- | --- |
| Inner city sparse | 22 Sep | done (multipolygon buildings, city tiles) |
| Nyugati looks lacklustre | 22, 23 Sep | partly (model reworked twice) |
| Hidegváró "állomás" label wrong | 23 Sep | done |
| Missing terrain near Nyugati | 23 Sep | done |
| Two Chain Bridges; keep the grey one | 23 Sep | done |
| Two Északi összekötő bridges | 23 Sep | done |
| Északi összekötő should reach across the Népsziget bay | 23 Sep | done |
| Texture glitch under the Északi összekötő ("less so than it used to") | 25 Sep | open |
| Népsziget water glitch on line 2 | 23 Sep | partly (see line above) |
| Ferris wheel at Erzsébet tér, not a tower | 23 Sep | done |
| Buda Castle; the castle district swallowed by the terrain; "budahill little over budacastle" | 23 Sep | partly (slope fixes 24 Sep; owner has not re-checked) |
| Lánchíd: the Alagút tunnel and Clark Ádám tér | 23 Sep | built (portals and roads come from city tiles; not looked at) |
| Opera wrong and too tall | 23 Sep | done |
| Bazilika, Parliament | 23 Sep | done (OSM 3D parts; owner: "superb") |
| Ferdinánd híd too low for trains | 23 Sep | done |
| Dózsa György út underpass not deep enough | 23 Sep | done |
| Váci út crossing too high, orange sky under the bridge | 23 Sep | done (24 Sep terrain holes) |
| Aquincum: "weird something circular" | 23 Sep | done (ruin class) |
| Újpest: new mall (Tesco, don't brand it) | 23 Sep | done (unbranded retail façade) |
| Újpest: "it cuts through the station" | 23 Sep | open (not investigated) |
| Újpest: "weird dome/hangar" | 25 Sep | built (low vaults for big round roofs; not looked at) |
| Népsziget: rundown shipyard, huge blocky storage, cranes | 23 Sep | partly (cranes done; warehouses reduced) |
| Népsziget: "nothing this tall on the whole island" | 25 Sep | done (seen 26 Sep: only low buildings) |
| Széchenyi fürdő "looks super junk" | 25 Sep | open |
| Too many buildings as towers, incl. football arenas | 23 Sep | done (arena class, façade kinds) |
| Vasúttörténeti Park with tower windows | 23 Sep | done (industrial class) |
| Istvántelek / outskirts: "still too many of the same facades" | 25 Sep | partly (textured panels, palette; not re-checked) |
| Power lines at Aquincum ("rocks"), but pylons turned 90° | 25 Sep | built (pylons oriented; not looked at) |
| Dunakeszi tó: water covers half the lake | 25 Sep | built (lake level; not looked at) |
| **S21 / Zugló, Kőbánya, Kispest** (images 28–47): | 25 Sep | |
| – Mexikói út tram depot | | open |
| – Embankment near and before Zugló too high | | done (26 Sep, S-14; the owner confirmed this note meant the same thing: the line runs on a high bank and the roads pass under; see the 26 Sep row below) |
| – Bosnyák tér's big buildings are orange | | open |
| – The prosecution service (ügyészség) tower at Zugló station, orange-tinted windows | | open |
| – Kőbánya alsó: the station is elevated over the road; its tram, the "Asian street", Népliget | | open |
| – Szent László church "looks junk" | | open |
| – Rails Kőbánya alsó – Kőbánya felső – Élessarok – Örs, Dréher and the plants | | partly (all OSM rails drawn since 25 Sep; no detailing) |
| – MÁV-telep: one-storey rundown houses | | built (village-house rule; not looked at) |
| – Akadémia-újtelep, the cemetery, a prison, a data centre | | open |
| – The whole airport | | open |
| – Egis and Richter: tall tanks, wide pipes | | partly (OSM tanks and overground pipes drawn; not looked at there) |
| – KÖKI "done right"; the other side is warehouses, parking decks, rundown houses | | open |
| – A tower at KÖKI that isn't there | 25 Sep | done (it was a GSM-R mast I had made into a TV tower; removed) |
| – Határ út and the TV tower "very symbolic" | | done (the Száva utcai adótorony, 154 m, from OSM; seen from S21 on 26 Sep) |

## Line 2, Pilis, Danube Bend

| request | from | status |
| --- | --- | --- |
| Brick works and quarries ("stunning") | 23, 25 Sep | done |
| More POIs on line 2: big buildings, plants, infrastructure, memorable places | 25 Sep | partly (line labels from `bake_linex.py`; not reviewed) |
| Before Dorog it gets sparse; industrial areas need detail | 25 Sep | open |
| Pilis hills: names and POIs (Dunabogdány quarry, lookout towers) | 25 Sep | partly (labels baked; not looked at) |
| Solar farms as shiny black glass | 25 Sep | done |
| Naszály quarry emphasised | 23 Sep | done |
| Samsung SDI true size; Dunakeszi Járműjavító | 23 Sep | done |
| Villages (Verőce…): 1–2 storey country houses, 1–2 windows a side and a door | 25 Sep | done (Verőce seen) |
| Dobogókő pumping heart easter egg | 25 Sep | done |

## Buildings, props, people

| request | from | status |
| --- | --- | --- |
| Façade variety: windowless, small-house windows, glass offices | 23 Sep | done |
| Generated façade kit: ChatGPT sheets cut into tiles, assembled by building size, lit windows at night; rooms behind the windows (interior mapping) later | 27 Oct | 15 of the owner's sheets in (`docs/FACADE_KIT.md`, `tools/bake_facade_kit.py` finds rows and bays itself). Seen on Andrássy út at noon and night. Inner Pest's tenements were classed as modern flats: fixed in the city tiles and the line contexts (NOTES Trap 19). Interwar (16), cube-house (17) and village-house (15) sheets in too; village and cube seen in Göd, interwar by a test swap only. Routing by district / town / MÁV colony built (`tools/facade_zones.json`, `sh tools/bake_all.sh`, `docs/FACADE_PLAN.md`), six more families' prompts ready (villa, mav, oldtown, garden, civic, szocreal). Interior mapping not started |
| Use the purchased packs (PSX houses, street props, farm, garages, textures) | 25 Sep | partly (panel façades and cars done; houses, props, farm buildings open) |
| Traffic lamps / traffic lights | 25 Sep | done (S-16: 1,464 signalled junctions from OSM, cars stop at red, poles with lit lamps; seen at Astoria. No turn phases or pedestrian lights) |
| People: varied silhouettes that read as people | 23 Sep | partly (platform people 24 Sep) |
| People "going about", walking | 25 Sep | built (S-16: up to 110 walkers along the kerbs near the camera; seen at Astoria. A few stray into the road; they don't wait at lights) |
| More OSM 3D building parts (like the Parliament) | 25 Sep | partly (all city-box parts in; outside the box not) |
| A wide search for detailed 3D models of landmarks | 23 Sep | open (idea; OSM parts used instead) |
| Cross-reference reality (Apple Maps 3D), keeping our style | 23 Sep | open (idea; licensing unclear) |
| Chimneys, silos, tanks, gasometers, masts, monuments | 25 Sep | done |
| Courtyards cut out of blocks | 23 Sep | open (owner: "doesn't matter much") |
| Floating houses | 22, 23 Sep | partly (several fixes; the 25 Sep ground-height fix may help more) |

## Nature and seasons

| request | from | status |
| --- | --- | --- |
| At least 7 tree forms | 25 Sep | done (16 forms) |
| Bushes, fields, flowers, fruit trees, vineyards | 25 Sep | partly (in Budapest from the tree cadastre; outside, fruit trees and vineyard rows exist, but bushes and flowers don't) |
| Much more vegetation, denser forest | 25 Sep | done |
| Seasons on the ground tiles, not only the trees | 25 Sep | done |
| BP Fatár: Budapest's trees, bushes, flowers, bins, monuments | 25 Sep | done (304k trees; sizes per species; LOD by distance only) |
| Wipers off unless bad weather | 23 Sep | done |
| Weather that develops; not the same at every start | 23 Sep | done |
| Weather controls finicky | 23 Sep | done |
| Danube: all levels with the good reflections; negative = drought | 23 Sep | done |
| Danube slider floods the ground | 22 Sep | done |
| Raised Danube chequerboard glitch | 25 Sep | done |
| Raised Danube still white | 25 Sep | done (the flood plane now lies under the flooded ground, which draws the reflective river water; seen at Göd at +4 m). Above +6 m the river itself stayed white: its snap allowance grew only for droughts; fixed, seen at +10 m |

## Road traffic, car, flying

| request | from | status |
| --- | --- | --- |
| Road traffic that overtakes | 22 Sep | done |
| Cars under the road, "swallowed", especially from above | 22, 23, 25 Sep | built (reported three times; latest fix 25 Sep not seen by owner) |
| AI cars freer: continue off-road on false terrain until back on a road, or time out and despawn | 25 Sep | done (26 Sep: only when a road lines up within 70 m ahead; 8 s timeout; ~5% off-road at a time) |
| Cars using big roads, not little paths | 25 Sep | done |
| More traffic; "still seeing empty roads" | 25 Sep | done ("amazing density") |
| Car looks (PSX cars) | 25 Sep | done; "a little dark": fixed 25 Sep |
| Drivable car | 23 Sep | done |
| Ships and small planes | 22 Sep | done |
| Plane too easy; choice of aircraft (F-16, small plane, heli) | 23 Sep | done (Cessna, Gripen, H135) |
| How to get back from the plane | 23 Sep | done (Esc) |
| A map in flight | 23 Sep | done |
| Flight cockpit could be better | 25 Sep | done (26 Sep: Cessna, Gripen and H135 cockpits that bank with the aircraft; seen) |
| Orbit with the mouse in the car and the plane | 25 Sep | done |
| Orbit dragged the window and got stuck | 25 Sep | done |

## Camera, UI, photo, sound

| request | from | status |
| --- | --- | --- |
| Features hard to find; menu rethought | 22 Sep | done (menu, mode bar, ? help) |
| Bottom UI crowded; desk crowded | 23 Sep | done |
| POI guide at top centre not wanted | 23 Sep | done (removed) |
| U hides the UI but keeps the POI labels | 25 Sep | done |
| Drone follow not working | 25 Sep | done |
| English toggle; rename to Dunakanyar Szimulátor | 25 Sep | done |
| Title logo on the main screen; cover image | 25 Sep | done |
| Photo mode: stop time, drone, hue, saturation, vignette, noise, FOV, DOF, tilt-shift miniature | 25 Sep | done |
| Photo mode stops everything; orbit; place lights | 25 Sep | done |
| Stickers (place, scale, flip), light effects, caption | 25 Sep | done |
| "Haven't noticed much grain or chroma" | 25 Sep | done (S-15: measured, the owner was right: grain changed the picture by 0.4 of 255 levels. It is now per game pixel and twice as strong (1.9); chroma offset doubled; seen) |
| DOF jumping near the train | 25 Sep | done |
| DOF and motion blur switchable in settings | 25 Sep | done |
| Does the resolution setting (élesség) work? | 24 Sep | done (S-15: yes, 320×180 at 0.6 to 887×666 at 2.6) |
| Station announcements with local TTS | 25 Sep | done |
| Choppy | 23 Sep | partly (automatic resolution) |
| Frame-loop allocations (trains, signals, cars rebuilt into new arrays every frame) and the 48-light loop in every fragment (code audit 4.1, 4.2; added to this list 26 Sep) | 25 Sep audit | done for cars and lamps (S-15: car mesh in reused buffers, road height cached; p90 frame 30–36 → 23 ms in a busy view; lamps capped 12/24/48 by quality). Trains and signals still allocate |
| An infrastructure tour for the owner's students | 25 Sep | open (idea) |
| Discover the Pilis and the Danube Bend: settings visible, "opportunities present" | 23 Sep | partly (Kilátás, missions, photo album) |

## Feedback 25 Sep late prenight (`feedback-0925prenight-dev.md`)
> The original file is not in the project; these rows were written by Gemini from it. See `FEEDBACK_0925_IMPLEMENTATION_PLAN.md` (Gemini's plan) and `UNIFIED_ENGINE_SPEC.md`.

| request | from | status |
| --- | --- | --- |
| Full screen mode (missing, needed for promo material) | 25 Sep prenight | built (F11 and ⛶ in the mode bar) |
| FLIRT has no windows, passenger seat looks into emptiness | 25 Sep prenight | done (seat height and car length per stock; seen) |
| Népsziget bridge: two bridges glitching, pillars out of water | 25 Sep prenight | done (the city extras' second deck removed inside the truss; Warren diagonals; the piers were already in the water) |
| Flying plane doesn't tilt/bank, difficult navigation | 25 Sep prenight | done (cockpit full bank, chase a third; seen) |
| Cockpit doesn't tilt; afterburner visual; crash/boom/smoke | 25 Sep prenight | done (cockpits, afterburner flame, crash fireball + burning wreck + boom + shake; seen) |
| Atmospheric effects: wind condensation over wings | 25 Sep prenight | built (wingtip vapour in hard pulls) |
| Sightseeing/modebar overlaps settings dropdowns/tabs | 25 Sep prenight | built (panel above the mode bar) |
| Pinch-to-zoom on touch screens | 25 Sep prenight | built |
| Contributors text too large | 25 Sep prenight | built (8 px, short form on phones, BP Fatár credit added) |
| Left/right flying arrows shouldn't be OS emojis | 25 Sep prenight | built (text presentation forced) |
| Change planes without keyboard | 25 Sep prenight | built ("gép" touch button) |
| Tilted pixels push together (pitch/tilt reprojection) | 25 Sep prenight | built (motion blur skips the sky and points behind the last camera) |
| Missing roads in Esztergom, and near/after Dabas | 25 Sep prenight | done (seen) |
| Tree variety: poplars look like spikes, zoo trees, trunk/branch contrast | 25 Sep prenight | built (fuller columns, only real columnar cultivars; lighter bark, inner-crown shade, limbs) |
| South (S21) needs deeper data care like the north | 25 Sep prenight | partly (26 Sep: roads to 1.5 km, the Zugló bank and the airport-road cutting, OSM platforms; the places list above is ROADMAP Stage 1) |
| Ócsa hydrocarbon extraction wells (petroleum pumpjacks) | 25 Sep prenight | done (pumpjacks where OSM maps wells: 32 in the region, only 1 in the Ócsa field itself; seen) |
| Cars: models are slow, drive model cars directly | 25 Sep prenight | open |
| Fót infrastructure: logistics warehouses & highway interchanges | 25 Sep prenight | built (Fót extract in line 70's context) |
| Western side of Danube (Szentendre & Pilis villages) missing | 25 Sep prenight | partly (Szentendre, the island's south, Budakalász; the Pilis villages not) |
| Ground color does not change over seasons | 25 Sep prenight | done (corridor seasons; seen) |
| **Unified One World Engine**: all lines, trams, hop between vehicles | 25 Sep prenight | open (full spec in UNIFIED_ENGINE_SPEC.md) |
| **High Impact Events / Disasters ("The Dark Timeline")** | 25 Sep prenight | partly (S-15: three weapons (J), craters, scorching, buildings and trees in the blast to rubble; seen. No panel, landmarks don't break, craters not kept. ROADMAP Stage D) |
| **Tram line 3 (Mexikói út M ⇄ Kőbánya ⇄ Gubacsi út)** | 25 Sep prenight | built (runs; not boardable) |
| **Tram line 56/56A/61 (Kelenföld ⇄ Déli pu. ⇄ Széll Kálmán ⇄ Hűvösvölgy)** | 25 Sep prenight | built (56 and 61 run; not boardable) |
| **Modern VFX Particle Engine (Fire, Explosions, Sparks, Smoke)** | 25 Sep prenight | built (a smaller version: `web/src/vfx.js`) |


## Feedback 26 Sep, after S-14

| request | from | status |
| --- | --- | --- |
| "Roads and trams and houses are still kinda buggy or messy in execution … I just really wanna polish it" | 26 Sep | partly (S-15 bug census: roofs folding on concave outlines, black flat roofs, junction z-fighting and kerbs across roads, stub hexagons, paper-X trees, star flower beds, the toy tram. All fixed and seen; see `SESSION_S15.md` for what is left) |
| Start Stage 0; add the dark timeline | 26 Sep | Stage 0 in progress; dark timeline is ROADMAP Stage D |
| The game would not load on the phone: it kept reloading, then stopped at 70–74% with "can't find variable boot" | 8–11 Oct | done (the owner: "it works!", 11 Oct; memory at load cut from about 700 MB to about 350 MB; far footprints skipped on touch devices; the loader now shows the real error). |
| Phone: "no way of controlling the speed", missing controls; an fps count | 11 Oct | built (S-16: a ⋯ sheet with time speed, sound, wipers, lights, zoom and the rest; fps switch in settings and the sheet; worded drive buttons. Seen in a phone-sized window, not on the phone) |
| The five picks from the review: phone parity; finish the half-built; a reason to keep playing; life; sharing | 11 Oct | partly (S-16: phone parity, 3 more missions, dark timeline panel, share links. Second half: tram riding, traffic lights, walking people. Open: dispatcher game, a tutorial drive) |

## Feedback 26 Sep, during S-13 (the owner's words, short)

| request | from | status |
| --- | --- | --- |
| Announce "Kőbánya alsó következik" some way before arriving, not only "következő megálló" | 26 Sep | built (26 Sep: "Következő állomás: X" once under way, "X következik." ~40 s / ≥350 m before; 61 new recordings; not heard in the preview) |
| S21: check the overpasses; between Mexikói út and Kőbánya-Kispest the train runs well above the road | 26 Sep | done (S-14, 26 Sep). The owner's aerial photo of Zugló showed the real line on a ~7 m bank from Mexikói út to past Kőbánya alsó, with Thököly út passing under at street level. The DEM had it 2 m high, so the roads were dug into cuttings. Now: `tools/raise_profile.py s21` lifts km 2.9–8.9 by up to 5.5 m (grades ≤ 1.16%; Zugló and Kőbánya alsó platforms +5.5 m); Thököly út, two side streets, Kerepesi út and Kőbányai út pass under at street level (6.2–6.3 m clearance); the bank top widens for the sidings beside it. Seen from the street, the cab and the air. From the air the cuts at the diagonal roads are still faceted |
| Üllői út crossing (S21) does not work for cars: in reality there is no level difference there | 26 Sep | done (S-14, 26 Sep). It is the airport road (Ferihegyi repülőtérre vezető út, OSM `bridge=yes` over the line at km 11.54). The game had its deck 10.6 m over the ground with a cliff to the approach road. The DEM shows a 2–3 m trough along the line there (a smoothed cutting), so S21 is now lowered 6 m into a cutting from km 10.85 to km 12.35 (`raise_profile.py`, grade ≤ 1.42%; KÖKI and Kispest stations unchanged), and a bridge over a raised or lowered stretch clears the rails by 7.4 m. The deck is now 123.2 m, level with the ground along the road (121.4–123.5 m); the approach ramps are ≤ 12%. The cutting's depth is an estimate. Seen from above, the road and the cab |
| Passenger seat sits behind the train on the shorter trains (FLIRT/416 have fewer cars); they need windows too | 26 Sep | built (the seat car is clamped to the train; the 416 has a window band) |
| Kispest: the owner sent photos of how it really looks | 26 Sep | partly (S-14, 26 Sep). The photos were in `owner_feedback_images/kispest/` all along (3 photos + a video). They show a low, narrow island between two tracks, a steel lattice footbridge, a yellow station building, a concrete panel fence, and sidings. Done: stations now use OSM's platforms (`tools/bake_platforms.py`, all three lines): Kispest's island is 0.15 m high between the main track and the loop; the footbridges over the line are lattice bridges with stair towers (10 on S21, 27 on line 70, 18 on line 2); the waiting people stand on the OSM platforms. Seen at Kispest, Dunakeszi and Pilisvörösvár. Still open: the concrete fence (not in OSM), the yellow station building (OSM has no colour), the Bzmot railcar |
| A homage to the starling murmuration once seen over Kispest: hundreds of birds in huge moving formations | 26 Sep | done (900 boids over Kispest, autumn/winter dusk 15:30–18:30; seen) |
| Terrain too high round Újpest? Houses look swallowed (or is it the suburb's design?) | 26 Sep | open. Looked 26 Sep at Újpest centre and Kertváros from 35 m: houses stand on the ground. **Not reproduced; need the spot** |
| Afterburner: the old glowing cube is still there; the flame may go the wrong way | 26 Sep | built (the cube is a dark nozzle with a hot throat now; the flame leaves the nozzle backwards: checked against the mesh, where the nozzle is at the tail) |
| Wing vapour does not follow the wing's bank; could be stronger | 26 Sep | built (banked wingtips, 3 puffs a tip, bigger, from 60 m/s and 0.2 rad/s) |
| Explosion is minuscule | 26 Sep | built (×2.2 Cessna / ×3.2 Gripen) |
| DOF and motion blur adjustable (strength) in the menu; any other graphics ideas | 26 Sep | built (Beállítás: DOF, motion-blur and corner-shading amount sliders, remembered). Ideas: sun shafts through cloud gaps, soft shadows of clouds on the river, heat shimmer over rails in summer, wet-road reflections of lamps after rain |
| Erzsébet híd deserves a better design | 26 Sep | built (a model: two white pylons on the banks, main cables with sag, hangers, anchorages; anchored on the OSM deck) |
| Megyeri híd: the pylons are not on the bridge | 26 Sep | done (they stood over the Szentendre branch: the river test now uses the land cover; seen over the main channel) |
| More detail on Szentendre island and Szentendre itself (flying opens up new paths) | 26 Sep | open |
| **Environments on the list** (repeated): KÖKI, Határ út, Kőbánya and the other annotated S21 places must stay in the to-do list | 26 Sep | they are, under "S21 / Zugló, Kőbánya, Kispest" above; still open |


## Feedback 11–12 Oct (phone test, then a ride on line 2; images 52–69 in `owner_feedback_images/`)

| request | from | status |
| --- | --- | --- |
| Phone: about 20 fps, automatic resolution at 55%, graphics settings change nothing, choppy | 11 Oct | partly (S-17: the fps box now also shows the frame's own work in ms, to tell processor from graphics; on phones fewer walkers, nearer trams, lights rebuilt every 6th frame. **Not measured on the phone**; need the "js … ms" number) |
| "Tram is only one tram?": the owner meant there was no way to switch between lines 4-6, 2, 1, 3, 56, 61 | 11, 12 Oct | built (S-17: a line picker bar, shown by the Villamos button and while riding: 1, 2, 3, 4, 6, 56, 61 and "leave". A line boards its nearest tram wherever it is; the same line again moves to another tram of it. Seen: from the nearest tram to a 56 in Buda) |
| (earlier reading of the same remark) | 11 Oct | answered (S-17: 71 trams were running across the 15 route directions at 19:24; they are drawn only within 3 km of the camera, 1.4 km on a phone, so one in view is likely on a phone) |
| Part of the Nagykörút is inaccessible for the cars (owner: cars seen from Nyugati only as far as Oktogon/Király) | 11, 12 Oct | done (S-17: traffic dropped every road piece under 90 m, or 40 m in city tiles, and OSM cuts the körút into dozens of short pieces there. Main roads now keep pieces from 6 m. Cars on main roads along Oktogon–Blaha by tenths: 15, 10, 12, 2, 6, 5, 10, 2, 1, 14; it was none in the middle six) |
| Haven't seen many walking people | 11 Oct | built (S-17: about twice as many on desktop, up to 220 within 230 m) |
| Look at `~/Downloads/Game Assets` and use what fits | 11 Oct | answered (S-17: PSX Characters and Quaternius base characters + animations for people and a persona; Quaternius/KayKit street props; Soviet block kits; FilmCow SFX; Panchout music. S-17 imported the first: outdoor ambience and a car-cabin loop from FilmCow, and Clement Panchout's "Contemplative" as menu music) |
| A new start: a high view of the city and region, pan and tap anywhere to drop into a nearby vehicle of your choice | 11, 12 Oct | built (S-19: the corner map opens the full map; drag pans, buttons zoom 1–6×, a click drops a pin offering hero, city stroll, car, nearest tram or a Cessna; map badges board trams and trains. Checked in the preview by script, not by the owner) |
| Personas: your own character and colours, super-abilities ("Hancock"), other ways of getting around | 11 Oct | partly (S-19: the 24 PSX characters to pick from, one brightness tint (no separate skin or garment colours), flight, a blast (E) and a boosted-dive landing blast that throw cars, a city stroll without powers. Not built: lifting and throwing cars, charged jump, boost FOV. See `SESSION_S19.md`) |
| Graffiti on walls (stickers has some; the owner will photograph more at the end of October); "on the side wall before Aquincum and the next stop, on small walls and on standing wagons, small details" | 12 Oct | built (S-17: OSM walls, retaining walls and noise barriers within 70 m of the line are now drawn, `tools/bake_walls.py`: 106 on line 2, 83 on line 70, 7 on S21. The 40 graffiti pieces of the sticker pack go on about a third of the wall stretches and on some standing wagons: 790 pieces on line 2. Seen on a wall by Aquincum and on a brown wagon. Not on phones. Open: the owner's own photos 62–66 are not in the sheet yet; no graffiti on underpass walls, bridge piers or buildings) |
| Klotildliget: why does it exist? | 12 Oct | answered in chat, from memory and unverified: a garden suburb of Piliscsaba, named after Archduchess Klotild |
| The Pázmány campus at Piliscsaba ("awkwardly bad project"), nice to pass | 12 Oct | partly (S-17: the **Pázmáneum** stop added at km 28.98 from OSM; seen. The campus buildings: OSM footprints only, not looked at) |
| "It really was a big curve" | 12 Oct | noted (praise) |
| No skip-to-next-stop button | 12 Oct | built (S-17: ⏭ on the mode bar, ⇧N, and in the phone sheet: 450 m before the next stop, clock moved on; checked from Nyugati) |
| The Pilis villages' big houses are good, "kinda spooky" | 12 Oct | noted (praise) |
| Contrails ("chemtrails") missing from the skies | 12 Oct | built (S-17: 7 airliners with trails, was 3; not looked at) |
| Horses round Piliscsév; horses at Dorog | 12 Oct | done (S-17: `tools/bake_horses.py`, 289 OSM riding grounds and paddocks in the region, 5 within 4 km of Piliscsév and 3 of Dorog; three to six horses at each; seen near Piliscsév) |
| Station buildings: each unique, mostly run down; MÁV-telep type buildings; the winged wheel emblem (photo 61) | 12 Oct | open |
| A way to help AI draw complex objects from photos | 12 Oct | open (idea) |
| Lots of empty railway buildings | 12 Oct | open |
| Dorog: the wagon depot, the stadium, the works, solar farms (photos 59, 60, 67, 68) | 12 Oct | open (solar farms and industrial buildings come from OSM; not looked at there) |
| A tunnel between Klotildliget and Szabadságliget: is it in? | 12 Oct | done (S-17: it was not. The Kopár-hágói vasúti alagút, 780 m, km 27.57–28.35: hillside over it, a tube, stone portals; seen from the approach and inside. No trees on the hill over it yet) |
| Vibes photos: cranes at dusk, the Danube from the bridge, Richter at Dorog, the level crossing | 12 Oct | noted (reference for cranes, dusk light, the works) |
| "We need much better visual definition … I wanna do good" | 12 Oct | open (see the reply of 12 Oct: where definition can come from) |
| Some water features have no water in them, "just blue texture" | 12 Oct | open, reproduced (line 2 km 15.75 and Dorog: lakes are painted on sloping ground with no level surface or bank. Cause and fix in `docs/WHERE_NEXT.md`: level each lake in the bake) |
| The owner will get assets: "write me a guide on what exactly we need" | 12 Oct | done (`docs/ASSET_GUIDE.md`; pack names from memory, not checked online) |
| Where to go from here: easier to sustain and add to; Unreal or Godot if need be; what AI can do for style and fidelity; one friendly OSM request that rebuilds the world with far more detail | 12 Oct | answered (`docs/WHERE_NEXT.md`: stay in the browser; a model pipeline, one world, a rules-driven world compiler, picture tests, then new data sources) |
| The start screen is doable; "might need the whole city brought together" | 12 Oct | done (S-19: high regional view with interactive tactical drop pin modal and live teleportation) |
| "As I play it's just not at that state" for an itch.io page: not there yet | 12 Oct | noted (the itch files are ready in `itch/`, unpublished; the owner decides when) |
| A broken, burnt-out model car driving in traffic | 12 Oct | done (the pack's Car 06 has only a rusted-wreck skin and was used as the "sports car"; it is out of traffic, and so is the US postal van skin. Checked: 0 of Car 06 among 249 cars near Nyugati) |
| The player car is very cringe | 12 Oct | open (S-19 changed only where the car starts: on the road surface, and from a map pin. The car model and physics are as before; there is no vehicle throw) |
| Keyboard shortcuts mix and do two things at once ("like shift Z") | 12 Oct | partly (found and fixed: ⇧T also switched the ground off; ⇧O also switched the wires off; ⇧L toggled labels; in the dark timeline K and J also switched the sky and the sander. ⇧Z itself: one handler, no clash found; **need what it did**. Open: plain letters T, R, K, N, O, P still switch whole layers off, which looks like a bug when hit by accident) |
| Kenney All-in-1 3.7.0 added to `Game Assets` | 12 Oct | looked at (CC0, GLB. Useful: Car Kit (bus-less, but van, trucks, tractor, ambulance, police, taxi, garbage truck), City Kit Roads (street lights, traffic lights, signs, barriers), Watercraft Pack (tugs, cargo ships, rowing boats), Train Kit, Mini Characters (26 GLB), Animated Characters (FBX). Nothing imported: it waits for the model pipeline, `WHERE_NEXT.md` step 1) |
| "Proceed with what we can … continue pushing forward" | 13 Oct | S-18: step 1 of `WHERE_NEXT.md` started. **People are now textured, animated models** on desktop: 24 civilians from the owner's PSX Characters pack, an 8-frame walk made in Blender (`tools/bake_people.py`), on platforms and pavements. Seen on line 70. Not on phones; frame rate not measured; see `docs/SESSION_S18.md` |
| Animated low-poly pedestrians (asset guide item 1; "nicer people", "haven't seen many walking people") | 23 Sep, 11 Oct | built (S-18, as above) |
| Street furniture (asset guide item 2) | 13 Oct | partly (S-18: OSM benches, bins and vending machines within 150 m of the lines as textured models from two heyheythere PSX kits, `tools/bake_props.py` + `tools/bake_street.py`; platform ones stand on the platform facing the track. Seen on line 70. Open: stops where OSM has no benches, bus shelters, the low fence, lamps as models) |
| Still missing from the library: a horse, a bus, a bus shelter, a bicycle (searched 13 Oct; Kenney has a toy horse only) | 13 Oct | open (to get; see `docs/ASSET_GUIDE.md`) |

## Feedback 13–14 Oct (Session S-19: Hero persona, blast physics, high-res map, tram expansion)

| request | from | status |
| --- | --- | --- |
| "Katt ide idea is not very smart zoom in and zoom and pan based on position or pan if open, click also didn't work" | 14 Oct | built (S-19: as described; a drag pans, a click without a drag drops a pin. Not seen by the owner) |
| "Destruction not really visible didn't react much but had a large brown stuff over the screen for a long time" | 14 Oct | built (S-19: the hero's blast uses the S-15 craters and throws road vehicles in arcs, without the brown smoke. The crater shader is S-15's, unchanged. 14 Oct review: thrown cars now land and lie for 26 s; the hero and cars stand in the crater) |
| "If one world why it needed to load to switch trains?" | 14 Oct | answered (S-19: within a line, trains and trams switch without loading; another line reloads the page, because each line has its own frame and data. The 250 MB figure was not measured) |
| "Map is very low res, the previous was so detailed and pretty" | 14 Oct | built (S-19: `bake_map.py` re-baked at `SCALE = 1`, 25.7 m/px, twice the linear resolution: line 70 is 1361×1941 px; smoothing on; corner map at 1.4×, full map opens at 2.2×. Not seen by the owner) |
| "POIs labels on the map should scale with zoom currently too big" | 14 Oct | built (S-19: sizes follow the zoom, minor stops hidden below 1.35×, overlapping landmark labels skipped. 14 Oct review: the landmark labels were 200–775 m off (the castle in Pest) and wrong on line 2 and S21; now placed from lat/lon. Not seen by the owner) |
| "The blast and destruction is built in really nicely" | 14 Oct | noted (praise from owner) |
| Review of S-19 (14 Oct, the owner: "eval review and look for bugs"): eight bugs | 14 Oct | done (14 Oct, checked in the preview by script; sand colour and map labels by numbers, not by eye): trams on the riverbed on line 2/S21; tram stop names out of step (now OSM names); sand drawn as quarry; street plaque never on "… út"; flight strafe mirrored; a crater on every dive landing, hero and cars floating over craters; map landmarks hundreds of metres off; thrown cars spinning up and vanishing in the air. Also removed: an invented 139 m viaduct at Hűvösvölgy. See `SESSION_S19.md` §7 |

## Feedback 14 Oct evening (after the S-19 review)

| request | from | status |
| --- | --- | --- |
| Esc returns to the train, but without the cab | 14 Oct | done (every mode returns to the cab with the desk; `SESSION_S19.md` §8) |
| Depth of field should be minimal at the start | 14 Oct | done (default 0.12, was 0.35) |
| Hero stopped moving; no looking down | 14 Oct | done (stuck on a train roof: riding rewritten; camera to 74° down; seen by script) |
| How to switch line, how to get back to the start menu | 14 Oct | answered (Esc in the cab opens the menu; the line cards there reload with that line) |
| Still obstacles on the tracks | 14 Oct | done (walls cut back, wagons off the up line, trees off the line; nothing within 2.67 m) |
| The train slows by itself under manual control, holds 42 km/h | 14 Oct | not reproduced. Likely the map's "board a train", which only followed an AI train; it now hands you that train |
| Switching trains should be better | 14 Oct | done (take over the train you pick on the map; the line is no longer empty after a start) |
| Dunakeszi lakes: half of the water a little higher, as ground | 14 Oct | done (every lake flat at one level; banks as grass. Seen against the old build) |
| Map: pan down? Clicks inconsistent with the pin and the nearest tram | 14 Oct | done (pan held to the edges; card clicks ignored; one tram boarding. Line 70's map ends just south of Nyugati) |
| Hero hover pose ("fly standing idle position I don't see") | 14 Oct | built (lean, legs mid-stride, bob; not seen by the owner) |
| "Insane" weather: drops on the lens and FPV camera, spray behind cars | 14 Oct | open (idea) |
| Other destruction simulations | 14 Oct | open (idea) |
| A derailment that really derails and breaks up | 14 Oct | open (idea) |
| More fidelity | 14 Oct | open |

## 27 Oct: trees with leaves

| request | from | status |
| --- | --- | --- |
| Trees and bushes as leaf clumps on a trunk and branches: more volume and density; sun through the leaves and shade inside the crown; leaf colour per leaf for the seasons (green → yellow/red/brown, falling, bare in winter) | 27 Oct | built (`docs/LEAF_TREES.md`: near trees within 190 m, 70 m in lite, are a trunk, branches and 64 leaf clusters; crown self-shadow, light through the leaves, per-leaf turning and falling; the far trees stay crosses. Seen at Göd, above Nagymaros and in Budapest at noon, low sun, night, October, November, January, snow, April. About +1 ms GPU on this Mac. Not run on a phone. Seen by the owner on 27 Oct: "leaves are magnificent") |
| Longer leaf-tree draw distance, to try on their machine | 27 Oct | built (Beállítás → "Lombos fák eddig": auto, 300, 450, 650 m; lite stays 70 m. Vegetation GPU time over Göd from above: 2.2–2.7 ms at auto, 4.7–5.0 ms at 650 m, on this Mac) |
| A more elegant hand-over between leaf trees and far trees | 27 Oct | built (wider band, each tree at its own distance, finer noise instead of the 4×4 dither; checked in stills, not while moving; not seen by the owner) |
| "Branches grow in the winter … kinda creepy" | 27 Oct | done (the twigs did grow longer as the leaves fell; now one fixed length, fewer and thinner twigs, slimmer limbs; seen at Göd and above Nagymaros in January; not seen by the owner) |

## 28 Oct: feedback after the façade routing (owner's words, short; image: a tram at Völgy utca on the Hűvösvölgy line)

| request | from | status |
| --- | --- | --- |
| Sheets for villa, MÁV colony, old town, garden city, civic, 1950s | 28 Oct | in: 20 villa, 12 mav, 11 oldtown, 11 garden, 10 civic, 4 szocreal (rate-limited); all cut, one old-town sheet in thirds; atlas 131 sheets, 2048 × 4080 (the 4096 limit is now one row away). MÁV sheets seen in the Rákospalota colony |
| "On the S2 line we are constantly running through other trains" | 28 Oct | done, not yet seen by the owner. Three causes. (1) A train waiting to cross stood 25 m short of the single track, but the train coming off it was eased onto the loop track over 60 m, so its front ran through the waiting train. It now stands 80 m short (`traffic.js` `CROSS_STAND`). (2) The player's automatic driver, after overrunning that point by a few metres, crept on at 0.3 m/s into the opposing train: the stop point moved with the train, and on a down grade the brake never went fully on. The point is now fixed, and the brake goes fully on when the train must stand (`route.js`, `main.js`). (3) A short gap in the mapped second track (km 14.35–14.95) was double track for the traffic but drawn as one line. Opposing trains are now drawn on the second track wherever the traffic treats the line as double (`trackLayout`, `sideOnLoops`, moved from main.js to traffic.js). Checked: new test 4b in `tools/test_sim.mjs` runs 5 h of line 2 with an automatic player train on the game's own sections, checking every pair of trains where they are drawn. It finds 0 overlaps (146 with the old 25 m stand), and the closest pair is 3.7 m apart centre to centre (bodies are 2.96 m wide). Seen in the preview: two trains side by side at Solymár. |
| A black upside-down triangle over or behind the train lights, to look better (owner, later: "I meant the semafor, the lights for the trains": the road-side crossing signal) | 28 Oct | done, not reviewed: `geom.js buildCrossings` draws the Hungarian crossing signal on both sides: pale post, St Andrew's cross (white, red rim), the black triangle with a white rim, two red lamps and a white one under them, each hooded. The white blinks slowly with no train near; the reds blink in turn and the booms drop when one is within 900 m. OSM `crossing:light` copied into the route files by `tools/patch_crossings.py` (line 70: 17 tagged yes, 51 untagged; line 2: 25 yes, 1 no; S21: 3 yes, 53 untagged). Untagged crossings get the light, light=no gets the cross alone. Duplicate nodes within 25 m are one crossing. The road is assumed square to the track and 7 m wide, so a skewed road has its signals off the kerb. Seen on line 70 at km 2.4 (day, train near at night) and km 6.4 (booms down, night). First misread as a mask on the train fronts; the owner had it removed. The fix found then stays: trains running at −1 had their cabs on the inner ends |
| The sky still wobbles in passenger view | 28 Oct | done, not yet seen by the owner. Each sky pixel's ray was the far point minus the near point through the inverse view-projection. With the eye 25 km from the origin in float32 and the passenger seat's 0.12 m near plane, that ray jumped by up to 1° from frame to frame. The sky now has its own matrix with the camera at the origin (`main.js` `invSkyVP`, and a mirrored one for the water reflection). Checked in the preview at the window seat, by working out the shader's float32 ray from both matrices over 40 frames: the frame-to-frame change went from up to 1.00° (mean 0.46°) to 0.001°. |
| People: idle animation variety, or walking, instead of just standing | 28 Oct | done, not reviewed: about a sixth of those waiting pace 8–24 m up and down the platform and turn round at the ends; the rest shift their weight, look about, and 30% take out a phone now and then (forearm up, head bowed). All in `PEOPLE_VS`, from the sim clock, per-person seed; no CPU work. The forearms are found from the baked walk (`tools/tag_people.py`, run by `bake_people.py`). Seen at Rákosrendező; frame time unchanged at the 60 fps cap (GPU time not measured on its own). Not done: no phone object in the hand, pacers can walk through others, not on phones (`state.lite` keeps the box figures). Pavement walkers were already there (S-18) |
| "Looks kinda goofy and low res": pavements, roads with proper textures, bins, fences, bus and tram stops, overhead wires and poles for trams | 28 Oct | done, not reviewed (write-up `docs/STREET_DETAIL.md`): tram contact wire and poles with brackets on every OSM tram track in the city tiles; a pavement beside every road from tertiary up to primary (not from OSM); asphalt grain and repair patches and paving slabs in the shader; from OSM in the city box: 2,390 stop shelters, 5,100 stop signs, 1,500 stop platforms, 11k litter bins, 12k benches, 40k fences, hedges and guard rails. Seen at Völgy utca and at Oktogon. Not done: shelters and signs are simple shapes, not models; fences are solid panels; no road markings at junctions, no crossings |
| In the image: the tram rides on bare ground with no wires, the ground is flat coloured triangles, place labels crowd the view | 28 Oct | done, not reviewed. Wires: above. The "triangles" were the 25 m land-cover pixels, each one flat colour with a straight edge; near the camera (900 m) the lookup is now warped by noise so the edges wander, the ground is lit by a smooth normal from the heightmap instead of per triangle, and there is a metre-scale grain by the camera. Labels: at most 7 place/landmark names (the most important first), none nearer than 150 m except towns and districts, at most 5 hills, and the overlap test takes each label's whole box. At Völgy utca from the tram: 2 labels, was 7. The tram bed itself is still the grey strip it was |
| Small streams in ditches: Rákos-patak, the one near Kelemen László utca | 28 Oct | done, not reviewed: 5,838 streams, ditches and canals from OSM (`tools/q_streams.ql`, `bake_streams.py`, `web/src/streams.js`; culverts left out) on all three lines, drawn as water between muddy banks. They lie on the ground, not dug into it (the heightmap is 25 m a pixel). The one near Kelemen László utca is the Ördög-árok; seen there |
| "There should be some grass and variety … less bald when looking at the terrain" | 28 Oct | done, not reviewed: `web/src/grass.js`, grass tufts within 70 m (22 m lite) with flowers, reeds, ferns and pebbles by land cover; kept off roads, tracks, platforms and ballast by a top-down mask; beside the line on the corridor's green parts. 0.85 ms GPU at Göd. Seen at Völgy utca and beside line 70 at Göd (km 26). Setting: Beállítás → Fű (off / 40 / 70 / 110 m). Reeds, ferns and pebbles are the same tuft resized and recoloured. Fields: filled (see the next row) |
| "Fill up the fields" | 28 Oct | done, not reviewed: wheat, maize and sunflower in the farmland near the camera, by the day of the year (wheat green → gold → cut in July → stubble → ploughed; maize and sunflower in rows, sunflower heads in July–August). Which crop a field grows is a hash of the field, not data. Seen at km 18, 27 and 36 of line 70 in June, July, August and January. About 0.7 ms GPU in a maize field. `docs/STREET_DETAIL.md` → Crops |
| "The newly added façades seem very 2D": depth so windows stand back, doors inset, decorations out a little, and reflections in the windows | 28 Oct | built (`docs/FACADE_KIT.md` "Depth": a guessed relief in the mask's blue channel, parallax, relief shading, sky and sun reflections on the glass; lite keeps shading and reflections. Seen on Andrássy út on/off and at dusk, stills only; not seen by the owner) |
