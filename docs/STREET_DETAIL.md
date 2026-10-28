# Street detail pass (28 Oct 2026)

The owner's words: the world "looks kinda goofy and low res"; they asked for pavements, road textures, bins, fences, bus and tram stops, tram wires and poles, and small streams in ditches. Their picture showed a 56 tram at Völgy utca with no wires, the ground as flat coloured triangles, and labels crowding the view.

None of this is committed. Nobody has seen it on a phone, and the owner has not reviewed it.

Pictures: `docs/img/street_volgy_tram.jpg` (the owner's spot, from the tram), `street_volgy_side.jpg`, `street_oktogon.jpg` (Nagykörút), `street_ordogarok.jpg` (the stream near Kelemen László utca).

## What was built

| part | where | data |
| --- | --- | --- |
| Tram overhead line: a contact wire 5.5 m over the ground, a tapered pole every 32 m 3.1 m out, a bracket and tie over the track | `geom.js buildCityExtras` → `tramOverhead` (city tiles, so it streams with them) | OSM tram tracks (`x.rails` kind 2, already in the tiles). The poles are **not** from OSM (the city's are not mapped). A pole stands on the side away from the other track; on bridges there are no poles. |
| Pantograph reaching the wire | `trams.js` (leading section) | the wire's height. If one of the two heights changes, change the other. |
| Pavements: 2.6 m beside primary and secondary roads, 2.0 m tertiary, 1.6 m residential/unclassified; a 0.3 m kerb | `geom.js buildRoads`, `PAVE_COL` | **not** from OSM (sidewalks are rarely mapped). Left out on bridges and within 9 m of the line's own track. |
| Road surface: asphalt grain and mottle, darker repair patches; paving slabs with joints on the pavement | `TRACK_FS`, `uRoad` (set only while the roads draw; off with `state.lite`) | none. The slabs run along the world axes, so on a diagonal street they are askew. |
| Ground: cover edges wander instead of straight 25 m squares; lit by a smooth normal from the heightmap instead of per triangle; a metre-scale grain by the camera | `TERRAIN_VS` (`vSmooth`), `TERRAIN_FS` | the existing cover raster. Water and the corridor cut-out are left on their true texels. |
| Streams, ditches, drains and canals as water between muddy banks | `web/src/streams.js`, marker `STREAM_WATER` in `TRACK_FS` | OSM, `tools/q_streams.ql` → `data/raw/streams.json` → `tools/bake_streams.py` → `web/data/streams.json` (0.4 MB, 5,838 ways, 3,500 km; 2,694 culverts and tunnels left out). All three lines. |
| Stop shelters, stop signs, stop platforms, litter bins, benches, recycling bins, fences, hedges, guard rails | `web/src/streetbits.js` | OSM in the city box, `tools/q_streetbits_{0,1,2}.ql` → `data/raw/streetbits_*.json` → `tools/bake_streetbits.py` → `web/data/streetbits.json` (1.8 MB). Counts below. |
| Fewer labels | `hud.js drawHud` | at most 7 place and landmark names, the most important first; none nearer than 150 m except towns and districts; at most 5 hills; the overlap test uses each label's whole box. |

Street bits, as baked: 2,390 shelters (the 807 mapped ones, plus a stop's `shelter=yes` where none is mapped within 25 m), 4,406 bus and 700 tram stop signs, 1,506 stop platforms, 10,826 litter bins, 12,443 benches, 420 recycling points, 38,794 fences, 1,048 hedges, 159 guard rails. Left out: anything underground or indoors, and platforms within 30 m of the line's own track (it has its own).

What is guessed in them: a shelter mapped as a point is 4 × 1.5 m and faces the nearest road (found by probing for a carriageway 4–11 m round it); the colours are typical BKK ones; fences are one height (1.25 m) and solid.

Streams and street bits are meshed in 1 km chunks within 2.4 km (streams) and 1.3 km (street bits) of the camera, two chunks a frame at most; `state.lite` uses 1.1 km and 0.5 km.

Rebake: `sh tools/bake_all.sh` now runs `bake_streams.py` and `bake_streetbits.py` too (from the cached raw files; refetch with `python3 tools/overpass.py tools/q_streams.ql data/raw/streams.json` and the three `q_streetbits_*.ql`).

## Checked

- In the preview, at Völgy utca (riding the 56 and from beside the track) and at Oktogon (tram 6), at noon in clear weather. Streams at the Ördög-árok, 290 m from Kelemen László utca (the stream OSM has nearest it).
- `node tools/test_sim.mjs`: all passed (36).
- Frame time: at Völgy utca, settled, 60 fps (the vsync cap) and 5.5–6.2 ms of JS a frame; at Oktogon 60 fps, 8.5 ms. Switching off the drawing of streams and street bits made no difference that the fps box can show at the cap. GPU time was not measured on its own. The "before" figure taken at the start (50 fps, 17 ms) was measured while the tiles were still loading, so it is not a fair comparison.
- Building one chunk: at most 1.9 ms (street bits) and 0.4 ms (streams) on this Mac.

## Ground cover (added the same day, after the owner: the terrain looks "bald, like something was forgotten there")

`web/src/grass.js`: grass tufts within 70 m of the camera by default (22 m with `state.lite`), with flowers in them in the growing season (white, yellow, purple, red), reeds on wetland, ferns in woodland and pebbles on rough ground (all the same seven-blade tuft, sized and coloured differently: a "reed" is a tall olive tuft, a "fern" a low wide dark one, a "pebble" a flat grey one; not modelled plants), sand and railway land. Each tuft is seven triangle blades, swaying in the wind; straw-coloured in autumn and winter, flattened by snow. Picture: `docs/img/grass_volgy.jpg`, `grass_line70.jpg`.

- Nothing is baked. A grid round the camera decides in the vertex shader, from the land-cover texture, whether anything grows in each cell and what. Density is by cover class: meadow and wetland full, park full but mown short, residential only on the lawn plots the terrain shader already draws (and fewer in the city), farmland and industrial land a few weeds. Past 28 m only one cell in four is kept, drawn larger.
- Where nothing must grow: roads, pavements, tram beds and rails, platforms, stops, ditches. These are drawn from above into a 512² mask over 180 m every 10 m of movement (or every 20 frames).
- The same mask pass draws the corridor (the railway's own ground mesh) with its height and its greenness, so beside the line the grass stands on the corridor and only on its green parts, not on the ballast or the cess.
- Not in the water reflection. Setting: Beállítás → Fű (ki / közel 40 m / normál 70 m / messze 110 m), remembered in `szobPrefs.gfx.grass`; `state.lite` caps it at 22 m; `SIM.state.grassR` overrides it from the console.
- Cost: 0.85 ms of GPU time a frame beside line 70 at Göd (timer query, this Mac). The fps box stayed at its 60 cap with it on and off. Not run on a phone.
- Not done: buildings are not in the mask, so grass grows inside them, hidden by the walls (an open-sided building such as a canopy would show it). The kind and density come from the 25 m cover raster only, not from finer OSM tags.

### Crops in the fields

Farmland (cover class 4) is filled near the camera, in the same `grass.js` pass. The crop and its calendar per field (the cover texture's G, the field's own tint, as TERRAIN_FS uses it; each field's dates ±8 days):

| crop | share | through the year |
| --- | --- | --- |
| winter wheat | about 7 fields in 10 | sown ~17 Oct, 5–15 cm through the winter, 85 cm by June, gold from early June, cut field by field between 1 and 23 July, stubble to early September, then ploughed (bare) to mid-October |
| maize | about 1 in 6 | in rows 0.75 m apart along the field's direction; from late April, 2.3 m by late July, drying from late August, cut between late September and late October, then stubble to mid-November |
| sunflower | about 1 in 9 | the same rows, 1.8 m; a yellow head on each plant from July, brown from mid-August, cut in September |

The plants follow the **day of the year** (`state.day`), not the season's `crop` number: that number passes through the same values going up in spring and going down at the July harvest, so the plants went green again after the cut. The ground's own colour still follows `crop`, so for a week or two around the harvest the stalks and the soil can disagree.

Pictures: `docs/img/crop_wheat_165.jpg` (mid June), `crop_wheat_230.jpg` (August stubble), `crop_sun2.jpg`, `crop_maize2.jpg`. Cost: about 0.7 ms of GPU time a frame standing in a maize field (peak 1.1 ms), this Mac. Beside the line the crops start where the corridor's colour turns to field, about 16 m out.

Not real: the maize and sunflower plants are the same seven-blade tuft, taller and wider; the sunflower head is two flat triangles. Which field grows what is not from data (OSM has no crops); it is a hash of the field, as the ground colour already was.

## Not done / what is left

- Shelters, signs and bins are simple coloured shapes. Models from the asset packs (`bake_props.py`) would look better; the props program is already there.
- Fences are solid panels; a see-through mesh would need alpha in the track program.
- Streams are not dug in. The banks are only coloured, so from low down a ditch is a strip, not a hollow.
- The tram bed is still the plain grey strip from `buildCityExtras` (no sleepers, no grass track where Budapest has it).
- Pavements are not from OSM, and they run over driveways and squares. No zebra crossings, no junction markings.
- Street bits exist only in the city box; outside it, line 70's furniture is still the S-18 set (`bake_street.py`, within 150 m of the track).
- Not run on a phone.
