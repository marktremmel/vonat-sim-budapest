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
| **S21 stock is wrong.** Owner: "an old Metrovagonmas car … diesel". Their photos show MÁV-START **416 021 / 416 031**, a two-car diesel railcar (blue/white, yellow doors). Kőbánya-Kispest–Lajosmizse is not electrified; we run an electric FLIRT. Verify the class before modelling it | 25 Sep (img 48, 49) | open |
| Side idea: the running cost of a diesel run (not in the main game) | 25 Sep | open |
| Cab lookout: "not just peering through a grey box" | 25 Sep | open |
| Sightseeing (Kilátás) follow camera too low, "move it up a notch" | 25 Sep | built (raised, never under the ground) |

## Lines and world extent

| request | from | status |
| --- | --- | --- |
| Line 2 Budapest–Pilis–Esztergom | 22 Sep | done |
| Esztergom city, bridge, basilica, Párkány (Štúrovo) | 23 Sep | done |
| Esztergom and Štúrovo roads | 25 Sep | open |
| Line 2 cut off before Miklósffy kápolna, Urkuta, Zamárd, Ákospalota, Búbánatvölgy; Szob not reachable | 25 Sep | open (owner: fine to leave until a "whole world" exists) |
| S21 | 23 Sep | done |
| Line 71 ("will be easy") | 23 Sep | open (alignment broken, no context) |
| City expansion: districts 8–9, Kispest, Kelenföld, Budafok, Háros, Keleti | 23 Sep | done (city tiles, 47.39–47.58 N) |
| Keleti – Kelenföld – Háros line | 25 Sep | partly (its rails are drawn; no line, no trains) |
| Trams 1 and 4/6; HÉV H5 | 25 Sep | partly (tram rails drawn; nothing runs) |
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
| Népsziget: "nothing this tall on the whole island" | 25 Sep | built (village-house rule; not looked at) |
| Széchenyi fürdő "looks super junk" | 25 Sep | open |
| Too many buildings as towers, incl. football arenas | 23 Sep | done (arena class, façade kinds) |
| Vasúttörténeti Park with tower windows | 23 Sep | done (industrial class) |
| Istvántelek / outskirts: "still too many of the same facades" | 25 Sep | partly (textured panels, palette; not re-checked) |
| Power lines at Aquincum ("rocks"), but pylons turned 90° | 25 Sep | built (pylons oriented; not looked at) |
| Dunakeszi tó: water covers half the lake | 25 Sep | built (lake level; not looked at) |
| **S21 / Zugló, Kőbánya, Kispest** (images 28–47): | 25 Sep | |
| – Mexikói út tram depot | | open |
| – Embankment near and before Zugló too high | | open |
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
| – Határ út and the TV tower "very symbolic" | | built (the real one is the Száva utcai adótorony, 154 m, from OSM; not looked at since the fix) |

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
| Use the purchased packs (PSX houses, street props, farm, garages, textures) | 25 Sep | partly (panel façades and cars done; houses, props, farm buildings open) |
| Traffic lamps / traffic lights | 25 Sep | open |
| People: varied silhouettes that read as people | 23 Sep | partly (platform people 24 Sep) |
| People "going about", walking | 25 Sep | open |
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
| AI cars freer: continue off-road on false terrain until back on a road, or time out and despawn | 25 Sep | open |
| Cars using big roads, not little paths | 25 Sep | done |
| More traffic; "still seeing empty roads" | 25 Sep | done ("amazing density") |
| Car looks (PSX cars) | 25 Sep | done; "a little dark": fixed 25 Sep |
| Drivable car | 23 Sep | done |
| Ships and small planes | 22 Sep | done |
| Plane too easy; choice of aircraft (F-16, small plane, heli) | 23 Sep | done (Cessna, Gripen, H135) |
| How to get back from the plane | 23 Sep | done (Esc) |
| A map in flight | 23 Sep | done |
| Flight cockpit could be better | 25 Sep | open |
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
| "Haven't noticed much grain or chroma" | 25 Sep | open (effects may be too subtle; check) |
| DOF jumping near the train | 25 Sep | done |
| DOF and motion blur switchable in settings | 25 Sep | done |
| Does the resolution setting (élesség) work? | 24 Sep | open (never checked) |
| Station announcements with local TTS | 25 Sep | done |
| Choppy | 23 Sep | partly (automatic resolution) |
| An infrastructure tour for the owner's students | 25 Sep | open (idea) |
| Discover the Pilis and the Danube Bend: settings visible, "opportunities present" | 23 Sep | partly (Kilátás, missions, photo album) |
