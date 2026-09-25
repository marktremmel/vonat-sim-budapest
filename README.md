# Dunakanyar Szimulátor (vonat-sim-budapest) — v0.1 alpha

A browser train simulator of Budapest's suburban lines, built from
OpenStreetMap and elevation data: hand-rolled WebGL2, no dependencies, and a
Python bake pipeline. It is an alpha: expect rough edges and odd-looking
places.

**Play:** https://marktremmel.github.io/vonat-sim-budapest/
(`?line=line2` Esztergom, `?line=s21` Lajosmizse).

- **Lines:**
  - 70: Nyugati – Vác – Szob.
  - 2: Nyugati – Pilis – Esztergom, on the real weekday timetable.
  - S21: Nyugati – Kőbánya-Kispest – Ócsa – Lajosmizse.
- **Budapest:** the whole of the central city is loaded in 1 km tiles around the camera, about 250k buildings, with the Parliament and the Bazilika from OSM's 3D building parts.
- **Ways to play:**
  - **Indulás:** one click onto the next train from Budapest, on automatic; M takes over.
  - **Szolgálat:** ten missions on real stretches (a FLIRT through Újpest, the KISS in the rain, the fog on the Pilis, a 1,280-tonne freight), scored for punctuality, stopping at the mark, safety, comfort and energy, with stars and four licence grades.
  - **Napi kihívás:** a mission, time and weather chosen by the date, the same for everyone.
  - **Fotóalbum:** photograph landmarks, peaks and towns (Z) from the train, a plane or the car.
  - **Photo mode (⇧Z or Fotó):** everything stops (trains, cars, planes). You get:
    - a free camera, or orbit round a clicked point;
    - lights you place yourself;
    - exposure, hue, saturation, contrast, warmth, vignette, grain, field of view;
    - depth of field (click to focus) and a tilt-shift "miniature" mode;
    - stickers (drag, wheel to scale, ⇧wheel to turn, double-click to flip) and a caption;
    - a light leak, a flare, a print or film border and a date stamp. These are drawn into the saved PNG.
- **The Királyréti kisvasút** (line 70's world): the 760 mm forest railway from Kismaros up to Királyrét. It is taken from OSM (9.7 km, 8 stops). An Mk48 with three coaches runs it by itself all day. You cannot drive it.
  - Ride as a passenger, watch in sightseeing mode (Kilátás), give orders on the dispatcher board;
    fly (Cessna, Gripen, helicopter), fly a drone, or drive a car. Buildings are solid, trains brake for a car on the line, and the car stops at a closed boom.
  - On a phone: touch buttons for the lever, the car and the plane.
- **Hungarian or English:** the HU/EN button on the menu (the first visit follows the browser's language).
- **Station announcements:** a local Hungarian voice (macOS Tünde, `tools/make_announcements.py`), with the sound on (G).
- **Graphics switches** (Beállítás): quality, depth of field in the outside views, motion blur, corner shading (AO).
- **Help:** press `?` in the game for every key.

## Run locally

    python3 tools/build_sim.py                 # web/src + web/data -> dist/
    python3 tools/serve.py 8177 dist           # then http://localhost:8177

`dist/` has to be served over HTTP; opening the file directly will not work.

    node tools/test_sim.mjs                    # headless checks, also run by CI

GitHub Pages ("Deploy from a branch", `main`, root) serves the `index.html` at
the repository root: `build_sim.py` writes it along with `dist/`, pointing it
at `web/data/` (`window.DATA_BASE`). After changing anything, run the build
and commit the new `index.html` with the change.

## Data

Map data © OpenStreetMap contributors, under the ODbL
(https://www.openstreetmap.org/copyright). Terrain: Mapzen/AWS Terrain Tiles.

The baked runtime data is in `web/data/`. The raw downloads (`data/raw/`,
~660 MB) are not in the repository; `tools/` fetches and bakes them again
(`build_line2.sh`, `build_s21.sh`, `fetch_city.sh` + `bake_city.py`).

The cover, logo and menu art are the owner's own. The panel-block façades
(`web/data/facades.webp`) are cut from two texture packs:
- "Eastern European Urban Decay - Building Pack Vol. 1" by cortino (https://cortino.itch.io/psx-slav-panel-building);
- "WEIRD HOUSE PACK" by utilizator2011 (https://utilizator2011.itch.io/free-weire).

The car models (`web/data/models/cars.*`) are baked from GGBot's "PSX Style
Cars" pack (`tools/bake_models.py`), and the photo-mode stickers
(`web/data/stickers_*.webp`) from Designsoup's "Urban Grunge" decal pack
(`tools/bake_stickers.py`). Both were bought by the owner.

None of these packs may be redistributed as the original files, so only the
derived atlases and meshes are here. The tools rebuild them from the packs.

For how everything fits together, start with `CLAUDE.md`, then `NOTES.md`,
`LANDMARKS.md` and `DATA_SOURCES.md`.

---

# Szob felé — line 70 simulator

Data foundation for a driving-and-dispatching simulator on MÁV line 70,
Budapest-Nyugati → Vác → Szob.

## How big it is (25 Sep 2026)

| | area | what is there |
| --- | --- | --- |
| Budapest city tiles | 508 km² (47.39–47.58 N, 18.93–19.25 E) | every building, part and road OSM has: 252k buildings, 59k road ways |
| Line corridors (70, 2, S21) | about 950 km² | buildings, roads, land cover within 2–5 km of each track |
| Terrain, near (per line) | 1,650–3,300 km² | 25 m heightmap and land cover raster, drawn with vegetation |
| Terrain, far (per line) | 6,500–9,500 km² | 100 m heightmap to the horizon, coloured, no buildings |

All of Budapest is 525 km², so the city box is nearly all of it. The whole
download is 65 MB of baked data, of which a session fetches the line's own
7–9 MB plus the city tiles around the camera (about 20 at a time).

**"Near region"**: each line bakes buildings, roads and land cover only near
its own track, because a line is one JSON file and one heightmap; everything
beyond is the far terrain. The city tiles are the way past that — streamed
1 km pieces — and doing the same for the terrain and the countryside is the
"one world" step in `REVIEW.md`.

**Will it run on small hardware?** On a laptop it holds 60 fps at medium
quality. A uConsole-class device (a Raspberry Pi CM4, OpenGL ES 3.1) has
WebGL2 but roughly a twentieth of the GPU: expect "Alacsony" quality, a
single-digit frame rate in the city, and possibly running out of memory with
city tiles loaded. Not tested.

## Layout

    tools/      data acquisition and derivation scripts
    data/       derived, committable data (small)
    data/raw/   downloaded sources (OSM JSON, elevation tiles) — regenerable
    atlas.html  generated survey of the line

## Rebuilding from scratch

    python3 tools/overpass.py tools/q_line70.ql    data/raw/line70.json
    python3 tools/overpass.py tools/q_stations.ql  data/raw/stations.json
    python3 tools/overpass.py tools/q_peaks.ql     data/raw/peaks.json
    python3 tools/overpass.py tools/q_linenodes.ql data/raw/linenodes.json
    python3 tools/overpass.py tools/q_water.ql     data/raw/water.json
    python3 tools/overpass.py tools/q_infra_nodes.ql data/raw/infra_nodes.json
    python3 tools/overpass.py tools/q_infra_ways.ql  data/raw/infra_ways.json
    python3 tools/overpass.py tools/q_platforms.ql   data/raw/platforms.json
    python3 tools/overpass.py tools/q_landcover.ql   data/raw/landcover.json
    python3 tools/overpass.py tools/q_topology.ql    data/raw/topology.json
    python3 tools/overpass.py tools/q_crossers.ql    data/raw/crossers.json
    python3 tools/overpass.py tools/q_landcover2.ql  data/raw/landcover.json
    python3 tools/overpass.py tools/q_context.ql     data/raw/context.json
    python3 tools/overpass.py tools/q_places.ql      data/raw/places.json
    python3 tools/overpass.py tools/q_structures.ql  data/raw/structures_osm.json
    python3 tools/fetch_terrain.py 12
    python3 tools/build_alignment.py
    python3 tools/build_stations.py
    python3 tools/build_profile.py
    python3 tools/build_peaks.py
    python3 tools/horizon.py
    python3 tools/build_enclosure.py
    python3 tools/build_infra.py
    python3 tools/build_blocks.py
    python3 tools/build_atlas.py
    python3 tools/build_infra_atlas.py
    python3 tools/verify_structures.py
    python3 tools/build_layouts.py
    python3 tools/build_blockplan.py
    python3 tools/build_timetable.py
    python3 tools/build_ops_atlas.py
    SZOB_KM=0,63.6 python3 tools/bake_world.py   # heightmaps + land cover
    SZOB_KM=0,63.6 python3 tools/bake_route.py   # drivable route bundle
    python3 tools/bake_context.py     # buildings as boxes, roads as polylines
    python3 tools/bake_map.py         # plan map PNG for the in-game map
    SZOB_KM=0,63.6 python3 tools/bake_timetable.py  # a working day
    python3 tools/build_sim.py        # one self-contained HTML

## Derived data

| file | what |
| --- | --- |
| `data/alignment.json` | both running lines, chainage and sectional speed per vertex |
| `data/stations.json` | 22 stops snapped to the down line, real km posts |
| `data/profile.json` | elevation every 20 m, slope limited to 10‰ |
| `data/peaks.json` | 747 named summits with chainage, bearing and window side |
| `data/horizons.json` | computed skylines at seven viewpoints |
| `data/enclosure.json` | terrain enclosure angle each side, every 250 m |
| `data/infra.json` | signals, switches, crossings, milestones, track counts with offsets |
| `data/blocks.json` | signals assigned to a running line, block gaps, lines per station |
| `data/structures.json` | bridges and tunnels, with what each one actually spans |
| `data/layouts.json` | station layouts from node topology, components, road numbers |
| `data/blockplan.json` | 113 signals — mapped anchors plus synthesised blocks — and the aspect table |
| `data/runtimes.json` | validated running times for every service pattern |
| `web/data/timetable.json` | 170 services across a day, with booked calls |

## Sources and licences

- Track, stations, summits, water: OpenStreetMap contributors, **ODbL**.
- Budapest's street and park trees, shrubs, flower beds, benches, bins and
  statues: the **BP Fatár** tree and park cadastre of FŐKERT Nonprofit Zrt. /
  Budapesti Közművek Zrt., served by Info-Garden Kft.
  (https://infogardenweb.hu/bpfatar/). The positions and species are theirs;
  heights and crown sizes are per species (see "The city's trees").
  We have not found a published licence for this data. It is used with
  credit, and the owner should confirm it before anything more than a hobby release.
- Elevation: AWS terrarium tiles, SRTM-derived, public domain.
- Route length, sectional speeds, timetable: Hungarian Wikipedia, **CC BY-SA 4.0**.
- M41 model by roliflow, Bzmot by newvoxel, both Sketchfab **CC-BY-4.0** —
  attribution required if either ships in the game.

## Generated pages

- `atlas.html` — the survey: geometry, km posts, terrain, skylines.
- `infrastructure.html` — signals, formation width, first-pass station diagrams.
- `operations.html` — topology, structures, block plan, aspects, run-time validation.
- `dist/szob-fele.html` — **the simulator.** The whole line, Nyugati to Szob.
  Its station diagrams supersede those in `infrastructure.html`, which linked
  track centres by proximity rather than by shared nodes.

Both read the shared stylesheet at `tools/atlas.css`.

## The city's trees (BP Fatár)

Inside the city box, the trees in the streets and parks are the real ones.
`tools/fetch_bpfatar.py` downloads the cadastre: 310,914 trees in 574
species, plus park objects. `tools/bake_trees.py` puts them into the city
tiles; 304,266 fall inside the box.

- **Form:** each species is mapped by its genus to one of the vegetation
  shader's tree forms. Limes are domes, maples broad, planes and pagoda trees
  spreading, poplars columns. Upright cultivars ('Fastigiata') are drawn as
  columns and weeping ones as willows.
- **Size:** the cadastre has each tree's height and crown, but only one
  request per tree, and the server refused requests after 200 of them. So:
  - the 39 species that were sampled draw from their real measurements;
  - every other species gets a typical size for its genus in a Budapest
    street (these trees are young: a median of 6–9 m), varied per tree.
- **Park objects:** shrubs, shrub groups and hedges are bushes; flower beds,
  roses and wild-flower meadows are a new low "flower bed" form that flowers
  in season. Benches, bins, statues and drinking fountains are small boxes;
  the cadastre gives only a point, so a bench's facing is a guess.
- **Drawing:** each tile's trees are one instanced draw (`TREE_VS` in
  shaders.js, the same look as the other trees). Small things fade first: a
  flower bed at about 600 m, a big tree at 2.4 km. Invented park trees are
  thinned out inside the box.

Not covered:
- Trees outside the city box (about 6,600: Rákosmente, Békásmegyer).
- Forests, which are not municipal: they stay procedural.

## Design notes

The sections from here on were written as each part was built (Aug–Sep 2026).
They explain why things are the way they are. Where one disagrees with
`CLAUDE.md` or `REVIEW.md`, those are newer.

## The simulator

`web/` holds the source, `dist/` the bundle. Hand-rolled WebGL2, no dependencies.

    web/src/shaders.js   sky, terrain, track, vegetation, precipitation, blit
    web/src/engine.js    gl helpers, ring meshes, matrices
    web/src/env.js       sun position, summer time, seasons, sky palette
    web/src/route.js     Route, Driver, tractive effort and resistance
    web/src/geom.js      track, corridor, roads, buildings, yards, stations,
                         signals, crossings, platform people
    web/src/trains.js    the four classes' geometry
    web/src/traffic.js   the other services, road vehicles, Danube shipping
    web/src/catenary.js  the overhead line
    web/src/structures.js chimneys, silos, tanks, masts
    web/src/clouds.js    the ten base types of the cloud atlas
    web/src/weather.js   Central European weather situations
    web/src/landmarks.js hand-modelled buildings, anchored to their footprint
    web/src/audio.js     synthesised sound — no samples ship
    web/src/panel.js     the dispatcher's board
    web/src/cab.js       the driver's desk
    web/src/hud.js       the canvas overlay
    web/src/input.js     keyboard, pointer and wheel
    web/src/main.js      boot, the menu, the render loop
    tools/serve.py       dev server that refuses to be cached
    web/data/            baked heightmaps, land cover, route bundle

`build_sim.py` concatenates these in `ORDER` into one flat scope and strips the
`import`/`export` lines, so a file's position in that list is what decides
whether a top-level `const` exists when something reads it at load. Functions
are hoisted and may be declared in any order; a `const` may not.

One scope also means **two files may not declare the same top-level name**.
`structures.js` and `catenary.js` both wanted `STEEL`, and the result is a
blank screen with a `SyntaxError` in the console — which reads as a broken
feature rather than a name clash. The bundler now scans for duplicates and
refuses to build, which turns a puzzling half-hour into a one-line error.

Terrain is three nested square annuli sampled from a heightmap in the vertex
shader; normals come from screen derivatives, so flat shading is free.
Vegetation is instanced billboards positioned by hashing a grid cell and
rejecting against the land cover raster — no scatter data is shipped; three
species are drawn procedurally in the fragment shader. Rendered at roughly a
third of native resolution and point-upscaled.

The **corridor mesh** owns the ground near the line. It is built at load from
the alignment: ballast crown, stone ditch, bank, then natural ground out to
100 m either side, at ten-metre longitudinal steps. The terrain rings
`discard` every fragment within 86 m of a running line, so inside the corridor
there is exactly one surface and nothing can poke through the track. That
replaced an earlier arrangement where a narrow formation ribbon sat on top of
the terrain rings and the two disagreed by whatever the interpolation happened
to do — the source of every clipping complaint up to that point.

The same shape gives an embankment where the ground is low and a cutting where
it is high, without having to decide which, and the bank is capped so a cutting
wall cannot climb across the rails.

**Buildings** are 62k oriented boxes with hipped roofs, bucketed into 1 km
cells and uploaded per frame within 3.4 km of the camera. Footprints are
reduced to centre, half-extents, rotation and height at bake time — 18 bytes
each.

## The whole line

`SZOB_KM=from,to` selects the window `bake_world`, `bake_route` and
`bake_timetable` cover; `0,63.6` is Budapest-Nyugati to Szob and is what
ships. All twenty stops are in — Nyugati, Rákosrendező, Istvántelek,
Rákospalota-Újpest, the three Dunakeszis, Alsógöd, Göd, Felsőgöd,
Sződ-Sződliget, Vác-Alsóváros, Vác, then the Bend.

The near heightmap is 1361 x 1839 at 25.7 m/px, the far one 730 x 849 at
103 m/px, and the whole bundle is 9.4 MB.

**Two things bite when the window changes.** `bake_route` takes its origin from
the near region's south-west corner, so moving the window moves the local
frame and *everything* baked against it has to be rebuilt in step —
`bake_context` has no window of its own and looked correct, but its buildings
and roads were still in the old frame, 27.7 km out. And `data/raw/places.json`
was fetched for a Vác–Szob bounding box, so the Budapest end had no names at
all until the query was widened.

The places query now covers the whole line and asks for more than villages and
churches, because the city end is named by different things: parks, works,
stadiums, the zoo, the islands. 5088 named features, ranked so a parish church
does not bury Nyugati pályaudvar, and label range is capped by rank so
Budapest is not a wall of text.

## Reflection

The water renders a second pass, and how that pass is built was wrong from the
start in a way that made it swim.

The old version reflected the *camera*: it mirrored the eye and the target
about the water plane and called `lookAt` with an unreflected `[0,1,0]` up
vector. Reflecting a camera flips its handedness, so `lookAt` rebuilt the
basis with the right vector inverted and the image came out mirrored
**left-to-right** as well as top-to-bottom. Every sample was therefore taken
from the wrong side of the screen, and moving your head moved the error rather
than the reflection — which is exactly what "swims" describes.

It now reflects the *world*. The geometry is drawn unreflected through
`vp * R`, where R mirrors about the water plane:

    [1  0  0  0]
    [0 -1  0  2h]
    [0  0  1  0]
    [0  0  0  1]

That puts the mirror image directly into the real camera's screen space, so
the correct sample coordinate is the fragment's own screen position — nothing
to derive and nothing to guess. The eye passed to the pass is still the
mirrored one, because the fog distance and the normal flip want the true
length of the light path, object → water → eye.

Two more things were wrong. The ripple displaced the sample by **a tenth of
the screen**, which is not a ripple, it is a different picture; it is now
0.010 and falls off with distance, so near water breaks up and the far bank
stays put. And the reflection target was a fixed 320x180 regardless of the
window, so on any aspect but 16:9 the screen-space lookup was stretched — it
now tracks the main target at half size.

The Fresnel term is closer to Schlick as well: almost nothing looking straight
down, almost everything at a grazing angle. Note what that implies, because it
is easy to mistake for a bug — from eight metres above the water looking
across a river, the rays that strike the visible water are half a degree to
two degrees below horizontal, so what they reflect is **sky**, with a thin
band of the far bank at the shoreline. Mostly sky is the correct answer.

## The city

The Bend is landscape; Budapest is a built environment, and the first
whole-line bake made that obvious — it looked like a very large village.
Three things were wrong, and all three were data rather than rendering.

**Land cover stopped at Vác.** `q_landcover2.ql` had a Vác–Szob bounding box,
so more than half the world had no class at all: no residential, no industrial,
no parks, no woods. Refetched for the whole line and with the classes a city
needs — parks, brownfield, railway land, retail, commercial, pitches,
construction. "none" fell from 56% of the raster to 8%.

**Park is now its own class**, not meadow: mown, watered, greener, and it
keeps its colour when the fields have burned off in August. Trees grow in it,
sparsely and in planted species rather than wild ones.

**Buildings had no heights.** Of 73805, only 253 carry a `height` tag and 6650
`building:levels`; 60264 are a bare `building=yes`. Everything therefore took a
7 m default. Two inferences fix it, and both are inferences, not data:

- *Panelház*: a long, narrow, tall rectangle — over 42 m of frontage, 9–17 m
  deep, more than 3.2:1 — is a prefabricated slab block. OSM almost never says
  so, but in this corridor a block of those proportions almost always is one.
  994 of them. They get a flat roof, bare concrete, and the strict window grid
  that is the whole of how they read from a train.
- *City block*: an untyped building with more than 26 neighbours within about
  a hundred metres is a bérház, not a cottage. Height comes from footprint
  area — 11.5 m, 15.5 m or 19 m. 25047 of them, taking the median height of the
  line from 7 m to a p90 of 15.5 m.

Roofs are now per-building: flat for anything industrial, commercial or
prefabricated, and pitched otherwise — with a **ridge along the long axis**
rather than a pyramid, and a shallow pitch above 11 m. A pyramid on a 40 m
footprint was most of the village look.

### Real footprints

An oriented bounding box is fine for a house and wrong for everything else. A
block of flats is an L or a U, a station is a shed with wings, a factory is a
row of halls — and one rotated rectangle each is what keeps a city looking
like a diagram of a city.

Buildings over 380 m² now carry their **actual footprint**: 9393 of them,
58421 triangles, 0.63 MB packed. They are triangulated at bake time by ear
clipping — a fan from the centroid is wrong on any concave shape, which in a
city is most of them — and the geometry is built once at load and bucketed
into kilometre cells so only what is in range is drawn. Everything smaller
stays an instanced box, where a box is honest.

Roof form comes from `roof:shape` where OSM has it (2100 buildings do):
flat, gabled and hipped as a ring drawn in toward the centroid and lifted,
pyramidal as the same with the ring collapsed, and **arched** — a barrel vault
over the long axis — for a trainshed. Nyugati's 37-point outline gets one.

Named railway structures are recognised by name and tag, because OSM carries
their footprints but almost never their heights, so a running shed ends up at
the seven metres of a bungalow: *fűtőház* and *járműjavító* become 13.5 m
engine sheds with barrel roofs, *víztorony* becomes a 32 m water tower.

**The industrial buildings carry no names — but their SITES do.** The first
pass concluded the works were anonymous, and that was a search error: the
names sit on `landuse=industrial` relations in `landcover.json` — "Dunakeszi
Járműjavító", "Samsung", "Duna Dráva Cement Kft." — with full member
geometry, while the buildings inside them are bare `building=industrial`.
So height comes from two places. Size gives the floor: a hall over 6000 m² is
12 m to the eaves, 15 over 15000 and 18 over 30000, never the 9 m of the
default. A `man_made=storage_tank` — which OSM maps as a
twenty-node circle, so the polygon layer already gives it the right shape —
takes three quarters of its own span as its height, since that is roughly how
tanks are proportioned; the widest here is 44 m across and was standing 9 m
tall. A `man_made=tower` takes a height from its `tower:type`. 34 polygons
changed, the tallest from 7 m to 26.

What the buildings query alone does **not** give you is the cement works'
98 m preheater tower — not because the data lacks it, but because every
context query filters on `["building"]`, and a chimney or a silo is a bare
`man_made` feature. The corridor has simply never been asked for its
freestanding structures. `q_structures.ql` exists to fix that.

## The overhead line

Line 70 is electrified at 25 kV 50 Hz — the desk has a meter for it — and
until now there was not a wire anywhere on it. `web/src/catenary.js` builds
one at load from the running lines themselves, so it needs no data: a mast
every 60 m on the outside of each track, a cantilever over it, a contact wire
at 5.5 m above rail and a messenger at 6.9 m sagging 24 cm between supports,
with droppers between the two. 254k vertices, 6 MB, and 0.17 ms a frame.

The detail that makes it read as a railway rather than a line of fence posts
is the **stagger**: the contact wire is pulled alternately 30 cm either side
of the track centre so a pantograph wears evenly across its strip, so from the
cab the wire visibly swings from one side to the other at every mast.

Where the formation is too wide to reach across, the masts are replaced by a
**portal** — a keretszerkezet — over the whole track group. How wide that is
comes from the yard tracks already baked: their offsets from the down line are
packed unsigned, so the sign is recovered at load from the down line's own
normal, and the extent is taken per 60 m of chainage. The down line draws the
structure and the up line only hangs its wire from it, or Nyugati's throat
would carry two portals in the same place.

A wire 12 mm across would be invisible drawn to scale and a single ribbon
disappears seen edge on, so every wire is two ribbons in a cross, which
always presents a face.

`O` toggles the whole thing.

**The pantographs had to move.** They extended a fixed 1.62 m above the roof,
which put a KISS's head at 6.2 m — clean through a wire at 5.5 m. A real
pantograph reaches until it touches, so ours now extends to `PAN_TOP` and a
low locomotive stretches further than a double-decker. This is the sort of
thing that only becomes wrong when something else becomes right.

## Platform furniture

A platform with nothing on it is a slab of concrete, and ours were exactly
that. `buildStations` now adds what you actually see going through a Hungarian
station: a flat canopy on a single row of columns down the back of the
platform — 90 m at a station where a six-car set stands, 30 m at a village
halt, because a 210 m platform with 210 m of roof looks like a shed — and lamp
posts every 30 m along the rest of it.

The lit part of a lamp is separate from the post. The post and shade are
static, since they are there at noon too; the light is rebuilt only when the
darkness has moved by 0.06, which across a dusk is about ten rebuilds of a
69-lantern mesh. It is a lantern with sides rather than a plate facing the
sky, because a flat plate is invisible from a train — which is three metres
up, looking along the platform, not down at it. The colour is authored above
1.0 so the bloom does the work, the same trick as the train lamps and the lit
windows.

## The works, anchored to their sites

The three plants along this line — Dunakeszi Járműjavító, Samsung at Göd, Duna
Dráva Cement above Vác — carry no name on any building. The name is on the
`landuse=industrial` **relation** around them, which is why a first search for
them came back empty. Those relations are anchors in their own right: centre,
principal axis and extent, exactly as a landmark is anchored to a footprint,
and with no typed coordinate anywhere.

`bake_context.py` emits one for the cement works, which stands 356 m off the
line at km 37.2 and is the most conspicuous thing on that side of the river.
What the anchor gives is *where and which way round*. What it cannot give is
the plant: OSM has the halls and nothing about what stands on them, and a
cement works without its preheater tower is a shed. So the tower, the kilns,
the silos, the stack and the covered limestone store are **invented** — the
shapes a dry-process works has, at the sizes the real one has, in the place
the data puts it. The 98 m tower is real; that it has three steps in it is a
guess.

The site polygon is 1.7 km across because it takes in the quarry and the
stockyard, so the plant is built to its own scale about the centre rather than
stretched to fill it.

## Quarries

A quarry was being drawn in the same grey as a factory, which threw away the
most distinctive thing on the Naszály: a face cut out of the hillside that
shows as pale limestone for miles. It is its own cover class now, and nothing
is planted on it. Three of them are near enough to see, the closest 823 m off
the line at km 28.4.

## Yard tracks

Only the two running lines were ever drawn, so Nyugati's fourteen-road throat,
the whole of Rákosrendező and every station's loops and sidings were bare
ballast with two rails down the middle. That is most of why the Budapest end
read as a country branch rather than the approach to a terminus.

All of it was already downloaded — 979 `railway=rail` ways in
`infra_ways.json`, plus the disused and abandoned ones. 1424 ways and 12484
points are baked now, each point carrying its chainage and offset from the
down line, worked out where the chainer lives. Inside the corridor a yard is
graded to rail level so the height comes from the route profile; outside it,
from the ground. Sidings get greyer ballast and duller rail than a running
line, and the disused ones are drawn more weed than stone.

## Landmarks, and why there are almost none

Placement is the hard part, not the modelling, and the first attempt got it
wrong in an instructive way.

Landmarks carry no coordinates: the bake finds the building in OSM by name and
hands over its footprint centre, principal axis and extent, in the same frame
as everything else. That much is right and worth keeping. **The mistake was
using an oriented bounding box as the descriptor.** An OBB is a good
description of a water tower and a bad description of a mall: WestEnd is
322 x 305 m and nearly square, but its principal-axis OBB reports 396 x 137,
so a box drawn to those numbers sat across the road. Nyugati was out by a
similar margin for the same reason.

The polygon layer already draws both of them correctly, from their real
outlines, and Nyugati's outline already gets a barrel vault from its
`roof:shape`. So the hand-modelled layer is now reserved for shapes an
extruded footprint genuinely cannot express **and** whose footprint is compact
enough for an OBB to describe — which at present means the octagonal brick
water towers at Újpest, Istvántelek and Tatai út, and nothing else.

The axis-sign resolution is kept, because it is sound and independent of the
descriptor: the bake snaps both ends of the long axis to the down line and
defines +u as the end further from the track, so anything modelled this way
faces the right way without anyone deciding it.

Note what "reserved for the water towers" means in the code, because it is not
obvious from either file alone. `LANDMARKS` in `bake_context.py` matches one
name — *víztorony* — so the only anchors baked are the four towers at Újpest,
Tatai út, Istvántelek and Margitsziget. `landmarks.js` still carries the
switched-off models for Nyugati, WestEnd, the roundhouse and the fűtőház:
they are **unreachable**, not disabled by a flag, because nothing ever hands
them an anchor with that key. Widening the `LANDMARKS` list is what would turn
them back on — and would bring back the OBB-descriptor problem that turned
them off, so the fix has to come first. The vault you see over Nyugati is the
polygon layer's `roof:shape=arched`, not the hand model.

## Nyugati, and where a building's dimensions come from

The most-asked-for thing at the Budapest end was Nyugati as a trainshed rather
than a hull, and the reason it kept coming out wrong is that the footprint
does not know how wide a shed is.

OSM has **one** polygon for the whole station: 153 m along the tracks and
122 m across, because it takes in the wings, the concourse and the halls
either side. `bake_context.py` gives any large `building=train_station` a
barrel vault, and a barrel over that footprint is a 122 m tunnel — built on
the world axes at that, while Nyugati stands at 49° to them.

Each dimension now comes from whatever actually knows it:

| | from |
| --- | --- |
| where, and which way round | the track frame at the building's own chainage — a shed runs along its tracks by definition, so the tangent *is* the axis and no principal axis has to be guessed |
| how long | the polygon, projected on that axis: 153 m, against a real 146 |
| how wide | **the tracks** — how far the platform roads reach either side, which is the one number the footprint has not got |
| where it springs from | the polygon's own eaves, so the vault sits on the walls the polygon layer already draws |

The polygon keeps its walls and gives up only its roof: `buildPolyBuildings`
takes a set of indices whose roof is drawn elsewhere, and `buildTrainsheds` in
`landmarks.js` builds the vault. It is **hollow** — no floor, no far gable,
and the ribs are single surfaces, which the renderer shows from both sides —
so from a train standing under it you see the vault over you, which is the
point of a trainshed and was not true of the tunnel. The glazed screen is at
the buffer end only, because the other end is where the trains leave.

**How wide is not one question.** The overhead line asks it too, for where a
portal replaces a cantilever, and the two want different answers. A portal
spans a group of roads that are actually adjacent, so its offsets are
clustered with a 12 m gap and trimmed to 34 m — without the trim Nyugati grew
a 92 m gantry, and without the clustering a 126 m one, because the throat, the
Rákosrendező approach and line 2 are all within 220 m of the running line. A
shed spans the platform group whether or not the mapping is continuous across
it: at Nyugati the roads OSM has are −21..−16 and 0..+5, a 16 m gap, and
clustering keeps half the station. So the shed takes the plain reach of the
roads within 40 m instead. Same data, two reductions, and using one for the
other is wrong in both directions.

## What is not a building

**They are all in the game now** (chimneys, tanks, silos, masts, water towers,
cranes, pylons — `q_structures.ql` → `structures.js`); this section is the
story of how they were missing. The context queries filtered on
`["building"]`, and a chimney is not a building — it is a `man_made=chimney` —
and neither is a silo, a tank, a gasometer, a lighting mast or a monument.
Until then none of them had ever been downloaded. The cement works had no chimney not because OSM lacks it but
because nothing had asked.

`q_structures.ql` asks. 201 of them stand within 2.4 km of the line:
59 chimneys, 50 tanks, 40 lattice masts, 17 water towers, 11 observation
towers, 8 watchtowers, 7 silos, 7 yard lighting masts, a crane and a cooling
tower. `structures.js` draws them as tapered drums and see-through lattices —
eight sides is plenty for something read at half a kilometre, and the facets
are what give a cylinder its shading under flat lighting anyway.

**Height is the interesting part**, because seven of the forty-three chimneys
carry a `height` tag and the rest carry nothing. Those seven are used as
given: 203 m for the FŐTÁV stack, 120 for the Rákospalota incinerator, both
real landmarks of this railway that were simply absent. For the rest the
height comes from the kind — and then from **the size of the site the thing
stands in**. A chimney in a 1.4 km² cement works is not the chimney of a
boiler house behind a school, and while the chimney is anonymous the ground
under it is not: `landuse=industrial` polygons carry the names, so a
point-in-polygon against the smallest containing site gives a chimney in a
works 2.2x its base height and one in a yard 1.5x. The smallest containing
site, not the largest, because a works sits inside a district and it is the
works that tells you something.

That last point is the correction to an earlier claim in this file. The works
along this line — Dunakeszi Járműjavító, Samsung at Göd, Duna Dráva Cement
above Vác — were written up as unnamed and therefore unanchorable. They are
named. The names are on their `landuse=industrial` **relations** in
`landcover.json`, not on the buildings inside them, and a search that printed
only its first dozen hits per file buried them under street names. A
truncated search result reads exactly like a negative one.

## Bridges

144 road ways along the line carry `bridge=yes`, including Ferdinánd híd over
the whole Nyugati throat and Hungária körút over the line at Rákosrendező.
102 of them survive the extraction radius and are drawn.

A deck is **flat**. The first version interpolated between the abutments and
added half the clearance at the ends as well as the middle, which turned every
overbridge into a ramp launching off into the sky. It now sits at the height
of the higher abutment, or high enough to clear whatever is beneath — 6.1 m is
the MÁV structure gauge under 25 kV — with a girder under it, parapets each
side, and an abutment face from the ground up at each end.

There are deliberately **no piers** over a railway: a road overbridge across
a railway is a single span, and the first attempt built them on the world axes
rather than along the road, so any skew crossing threw a grey sliver straight
across the view from the cab.

### Over water, everything about that is wrong

Margit híd was in the raw data all along and was being thrown away by the
bake: roads are kept to 600 m from the line and the bridge stands 900 m out,
while the query that fetched it reaches 900 m and the buildings ring 2600.
Bridges of secondary class and up are now kept as far as the buildings are —
a Danube bridge is visible from much further than a street is.

Drawing it then found two more things. **A long bridge arrives as a chain of
short ways** — Margit híd is eight, from 11 m to 230 m — and decking each off
its own ends builds a staircase across the river. And **the DEM is a surface
model**, so the "ground" at a bank abutment is whatever building stands beside
it: those eight ways report end heights from 96 m to 113 m along a bridge that
is level. Deck one off its own abutments and it climbs a rooftop.

So bridge ways that touch are treated as one structure, and if any part of the
chain is over water the whole chain decks off **the water** — the one height
in the neighbourhood that is neither a rooftop nor a river bed. 8.5 m of
clearance, level, with the end walls becoming narrow piers into the river
instead of a dam across it. Margit híd now sits at 105.1 m against a river at
96.6.

## The water surface

The Danube is not level. It falls about **86 mm per kilometre** — 96.0 m above
the sea at Nyugati against 100.1 m by Szob — and the simulator drew it as a
single flat plane at 104 m for the whole 63 km. At the Budapest end that plane
was eight metres too high, which put both banks and the whole of Margitsziget
under the river. The island had 102 buildings baked and none of them could be
seen.

`bake_world` now fits a line through the height of the pixels the cover raster
calls water, north against metres above sea level, and stores it in
`world.json`. The fit takes a **low percentile** of each two-kilometre band,
not the median, because the Danube is the lowest water in any band: the gravel
pits at Dunakeszi, the quarry ponds under the Naszály and every fishing lake
along the way sit above it, and a median over all of them flattened the
gradient to a twentieth of the real one.

There is a **Duna slider** on the panel, because the gauge is read against a
datum rather than sea level and genuinely goes negative in a dry summer. It
offsets the fitted plane by -4 to +7 m.

The renderer follows the fitted plane, and a lake keeps its own level: a water
pixel is snapped to the river only where the ground already agrees it is about
river level. Without that, correcting the river dug ten-metre blue craters
through the city, because every pond in Angyalföld was being pulled down to
the Danube.

## Margitsziget and the width of the data

The buildings query was a 1400 m ring around the line, which leaves
Margitsziget out entirely — it sits about two kilometres off, opposite
Újlipótváros. A 2600 m ring over the whole 63 km is too heavy for the public
Overpass mirrors, so the Budapest end has a plain bounding box of its own
(`q_context_bp.ql`) and the two are merged at bake time, de-duplicated by way
id. 5982 extra buildings, 102 of them on the island, and the bake radius is
2400 m.

## Place names

The first pass at widening the query produced 5088 labels, which is a business
directory rather than a city. A train window shows you places, so anything
that is a company goes — Kft, Bt, Zrt, car washes, boiler houses, language
schools, chemists — and so does a name that is only a person: a plaque reading
"Podmaniczky Frigyes" tells you nothing about where you are, and there are
hundreds of them. What is left gets a word saying what it is where the name
alone does not, so a church becomes "… templom" and a park "… park". 2553
labels now, and they read as somewhere.

Two bugs in that filter are worth remembering. `"kápolna"` is not a substring
of `"kápolnája"` — the seventh letter is á, not a — so every chapel was being
given a second suffix. And memorials were ranked 2, which put them above the
"needs a descriptive word" test, so the bare personal names survived it.

## Trains

Four classes, told apart by silhouette rather than detail, because that is all
you get from a moving cab.

- **KISS** — tall (4.60 m) with one continuous flat roof. Between the bogies
  it shows two rows of windows, one per deck; over the bogies one row at
  mezzanine height. (An earlier version lowered the roof over the ends, which
  read as a hump on every car. The real roof does not step.) Six cars, pantographs on the outer
  two.
- **FLIRT** — long, low, flat-roofed and articulated: the bogies sit under the
  joints between modules rather than under each car end, so the running gear
  is spaced differently from anything with conventional bogies. Four cars,
  runs the Z70 zonal turn.
- **EC** — a locomotive and a rake of high-floor coaches at one height, one
  continuous window band, doors at the very ends.
- **FREIGHT** — a locomotive and a mixed rake. Three wagon types chosen by a
  hash of the wagon's chainage, so a train keeps its make-up from frame to
  frame: open hoppers with inward-sloping sides, octagonal tank barrels with a
  dome, and container flats carrying one 40 ft box or two 20 ft ones in
  shipping-line colours.

Driving ends get a raked nose, an inset windscreen, a buffer beam and the
lamps a train actually shows — two white low and one high at the leading end,
two red at the trailing one. Lamp colours are authored above 1.0, so it is the
bloom that makes them read as lights rather than white rectangles. Everything
is flat-shaded from screen derivatives, which is why the hopper sides slope
and the tank barrel is faceted: a shape only reads if its facets face
different ways.

**Panels are tiled, never stacked.** The first version drew windows, doors and
container corrugations as quads floating a centimetre proud of the body side.
With a 1.2 m near plane and a 62 km far plane, depth resolution at a few
hundred metres is worse than that, so a container turned into a field of
speckle. Every surface is now cut into abutting pieces — `panel()` takes a
longitudinal span and a list of horizontal bands — and nothing is coplanar
with anything else.

**Vehicle make-up is seeded from the train, not its position.** A freight's
wagon types and container colours came from a hash of each wagon's chainage,
so the whole rake reshuffled itself every frame as it moved. Each train now
gets a `seed` at spawn and `vehRnd(seed, index, salt)` does the rest.

**Stadler units are close-coupled.** `COUPLE` gives each class the fraction of
its own length it gives up to the gap at each end: 0.494 for a KISS or FLIRT,
which with a gangway box across the joint reads as one train, against 0.472
for freight, where you can see daylight between the wagons — because you can.

Windows go warm after dark (`GLASS_LIT`, again above 1.0 so it blooms), as do
the lamps.

## Road traffic

`RoadTraffic` in `sim.js` puts vehicles on the same OSM ways the road mesh is
built from. A vehicle lives on one way parameterised by arc length, which
makes the whole problem one-dimensional: following the vehicle in front,
stopping short of a gate, and rejoining are all the same comparison of two
distances along the way. Cars, vans, buses, lorries and bicycles, keeping
right, with headlights and brake lights that brighten after dark.

Where a way meets a level crossing is worked out once at load, by closest
approach to each road **segment** — matching vertices found almost nothing,
because a straight road across a railway usually has no vertex near the
crossing. When a train is within 900 m the booms drop, and vehicles on that
road brake to a stop 7 m short and queue behind each other until it lifts.

Only vehicles within about 1.5 km of the train exist at all, re-drawn every
four seconds, and the draw is weighted towards roads that actually have a
crossing on them — there are only two in the baked section, so left to chance
the queue is a thing you would never see.

## Seasons

`seasonOf(day)` returns four numbers the shaders read, with dates for the
Carpathian Basin — three weeks ahead of northern Europe in spring, and holding
its leaves into November.

| | what it drives |
| --- | --- |
| `leaf` | how much foliage a deciduous tree carries, 0 bare to 1 full |
| `autumn` | how far the colour has turned |
| `fresh` | the light yellow-green of new growth, April into May |
| `crop` | what is standing in the fields |

Winter wheat is the reference crop: sown in October, low and green through the
spring, ripe in the last week of June, cut in July, pale stubble through
August, turned bare in September. Each field is offset a little from that, and
about a quarter of them are maize or sunflower and stay green much later.

A bare tree is not a green one with the saturation down. The canopy mask
thins, the silhouette narrows, and a sparse fan of branches is drawn where the
crown was, so a winter wood reads as grey sticks. Each tree turns at its own
pace and to its own colour — rust, gold or ochre — from its own hash.

## Vegetation

Seven species, chosen from the land cover rather than at random: vines in a
vineyard, fruit trees in an orchard, willow on wetland, hazel and blackthorn
in scrub, and spruce, oak and poplar mixed in woodland. Each has its own
crown shape, height range, width ratio and bark colour — spruce 13–25 m and
needled to the ground, poplar 15–24 m and pinched, hazel 2.4–5.6 m with no
trunk at all, a willow that is widest a third of the way up and trails below.

## The Danube

Nothing about the river ships as data, so the fairway is derived at load from
the land cover raster that is already baked. Every 400 m along the line, a ray
is cast out to each side; the run of the water class is measured; if the span
is wider than 160 m it is a river rather than a pond, and its midpoint is a
point on the lane. Smoothed over five samples, because the raster is 26 m per
pixel and the midpoint jitters with it.

What comes out is 28.5 km of centreline with the water between 441 m and
783 m wide, which is the real width of the Danube through the Bend — a useful
check that the derivation is doing what it claims.

On it: pushed convoys, cargo motorships, a river cruise ship and small
launches, keeping right, running faster downstream than up, with wakes and
the correct navigation lights — green to starboard, red to port. The
Nagymaros–Visegrád ferry runs across the fairway on a path taken
perpendicular to the lane at Nagymaros, waits 90 s at each ramp, and usually
has a car or two on its deck.

## Adhesion and vigilance

Weather now costs you something. The aerodynamic term already used air speed;
the brake now runs through an adhesion figure that falls with wet rail, snow
and freezing rain, and sanding buys most of it back. From 90 km/h with a full
service brake: 347 m dry, 445 m wet, 631 m on snow, 390 m sanded on snow.

EVM-120 vigilance: while driving manually above walking pace, 40 s pass, then
a warning, then 5 s to acknowledge before a penalty brake. `E` or the ÉBER
switch acknowledges; the penalty releases once you are stopped. Automatic
driving is exempt, or an unattended run would brake itself to a stand.

## The desk

Six labelled switches — FÉNY, TÖRLŐ, KÜRT, ÉBER, AJTÓ, HOMOK — each showing
its state in words, and each clickable. The instrument face is one quad with a
known UV, so a click is resolved by casting a ray through the cursor with the
cab's own projection, intersecting that plane, and turning the resulting `u,v`
straight into the canvas pixel the switch was drawn at. `drawInstruments`
records the rects; `buildCab` returns the face.

A 25 kV catenary meter sits beside them and sags with what the line is drawing.

## Night

Building windows light up after sunset: 3.2 m storeys and 2.7 m bays laid out
from the wall's world position, which is crude for a wall that is not
axis-aligned but reads correctly from a train, given these are boxes. Which
windows are lit is a hash of the cell, so a building keeps the same ones all
night, and how many depends on what it is — a block of flats is mostly lit at
nine in the evening, a shed is not.

The driven train has a headlight: one spot in `TERRAIN_FS` and `TRACK_FS`,
230 m, cone from 0.70 to 0.94, inverse-square-ish falloff. About a dozen
instructions, and only for fragments in front of the train. `shift+F` cycles
off / normal / full beam; it comes on by itself as the sun goes down and in
anything murky.

## Output

Light and display brightness are not the same number, and until now they were.
Everything was written into an 8-bit target, so a sunlit field and a lit cloud
top both had to fit under 1.0 and the only way to keep the sky from clipping
was to darken the ground.

The scene now renders to `RGBA16F` where `EXT_color_buffer_half_float` is
available, falling back to 8-bit where it is not. Values above 1.0 survive.
The output stage multiplies by an exposure, adds a bloom, and runs Narkowicz's
ACES fit, which rolls the highlights off rather than clipping them and keeps
saturation while doing it. Bloom is a bright-pass at a quarter size followed by
a separable five-tap blur; only what clears the threshold blooms, so a sunlit
snowfield glows and a grey overcast does not.

There is deliberately **no gamma step**. Every colour here — the land cover
palette, the sky keys, the liveries — was chosen by eye against a screen, so
the pipeline is display-referred, not linear, and encoding it as though it
were linear washes the picture out. What the float target buys is headroom,
which is the part that was actually missing.

Exposure and Bloom are on the panel. Cloud shadow strength is 0.70 of the
direct term, not 0.92: a shadow removes the beam, not the daylight, and at
0.92 it punched holes in a sunny day.

## Weather

`web/src/clouds.js` is the vocabulary: the ten base types of the Nemzetközi
Felhőatlas, each a deck at its real altitude in the Hungarian height bands.
`web/src/weather.js` is the grammar: fifteen **situations** the Carpathian
Basin gets, from a summer anticyclone to a supercell, a Genoa low, freezing
rain, Saharan dust and a blizzard. A situation names the decks and their
coverage, a gloom figure, what falls out of them and how hard, the wind, the
visual range in metres, and the ground state. Palette, fog, ground colour,
audio and train resistance are all read off that one object.

**Intensity is strength, not brightness.** The slider scales coverage,
thickness, gloom, precipitation rate, wind and visibility together, so the
same front reads as broken cloud and a shower at 0.3 and as a closed base and
a downpour at 1.8. It does not touch exposure.

**Visibility is a number, not a dial.** Each situation states a meteorological
visual range — 250 m for inversion fog, 22 km for a fair cumulus day — and the
fog density is `3 / vis`, which is the definition that range is measured by.
The panel and the HUD show the resulting figure. The Haze slider is a trim on
top and resets to 1 when the situation changes.

**Cloud motion.** Each octave of the fractal noise is advected at its own
speed and offset on its own clock, under a slow domain warp, so the field
changes shape as it moves rather than sliding as one sheet. Decks higher up
run faster by a wind-shear factor. `uTime` is a weather clock that advances
with the time rate, so at ×16 the sky changes as fast as the traffic.

**Raining decks** get three extra terms. *Gloom* replaces the sun-lit shading
with a flat slate, so a raining base loses its modelling rather than just
going darker. *Pannus* is a second, smaller, faster field below the deck,
drawn dark, standing in for the scud under a rain base. *Rain shafts* sample
the deck's own density above two points 4 and 12 km down the view direction
and draw a grey veil below the base elevation at those distances, so showers
appear where the cloud is dense with gaps between. A cumulonimbus multiplies
its high deck's density by the low deck's, sampled upwind, so the anvil sits
over and downwind of the tower rather than drifting independently.

**Precipitation** is instanced quads at world positions, in a 52 m box that
wraps around the camera; the offset is wrapped each frame so the coordinate
never grows. Each quad spans the drop's position now to one exposure ago, so
the streak is the drop's own velocity — fall speed, wind, and the train's
motion — projected by the same matrix as the rest of the scene. It is
depth-tested, so a shower is hidden behind a hillside. An earlier version
sampled a grid on a sphere of fixed radius around the eye; that folded over at
the edges of a wide field of view and made the streaks fan out from the centre,
worst when looking back or sideways.

**Fronts.** One situation used to cover all sixty-two kilometres and never
change unless you changed it. A front is a chainage, a speed and the two air
masses either side of it: `weatherAt` blends them by where you are, and since
every downstream thing — sky, fog, ground, audio, the drag on the train —
reads the one resolved object, all of it follows without knowing a front
exists. Measured across an edge at km 30: rain 0.53 and 9.8 km of visibility
on the Budapest side, half of each at the line itself, clear and 28.7 km four
kilometres beyond it.

The numbers blend and the categories do not. A sky cannot be half stratus and
half cumulus and rain cannot be half snow, so deck types and precipitation
kind come from whichever side weighs more; by the time they change over the
numbers have carried you most of the way and it does not read as a switch.
When the edge walks off the end of the line the new air becomes the baseline
and another front sets off from the other end, so it keeps turning.

**The animator** (Beállítás → Animáció) drifts the clock, the calendar, the
weather or all three while you watch. Its fronts run about ten times faster
than the real ones, which is a deliberate lie: a front crosses this line in
three quarters of an hour, and nobody watches a sky for three quarters of an
hour. Switch fronts on by hand instead and you get the honest speed.

**The windscreen** is a separate screen-space pass, drawn only in the cab and
faded out as you look away from straight ahead. Droplets travel up the glass,
faster with speed. The wiper is a sector sweep about a pivot below the screen;
for each fragment the shader solves for when the arm last crossed that angle
and rebuilds the film from there. `X` cycles off / slow / fast; `I` toggles the cab interior.

**Cloud shadows** project the ground point up the sun direction to the deck
altitude and sample the same field the sky uses — `CLOUD_FIELD_GLSL` in
`shaders.js` is shared between the shaders that need it.

Buildings and vegetation take the shadow too, and they take it **per object,
in the vertex shader**, not per fragment. The ground needs a per-pixel answer
because a shadow edge crossing a field has to be an edge; a building is
fifteen metres of wall and a tree is a billboard, and one sample at the foot
says the same thing for a hundredth of the cost — vegetation especially, where
four vertices stand in for a great many fragments. Verified by holding the
camera still, freezing everything that moves, and measuring how much each
pixel changes over fifty-five seconds of cloud time: 10.5 luma across the city,
12.8 over the woods in the Bend, 3.3 with **only** buildings drawn — against
0.1 under a clear sky, and 0.0 between two identical frames. The shadow scales the direct
term only, leaving the skylight, and fades out as gloom rises because under a
closed base there is no beam left to interrupt. Terrain and the corridor take
it; buildings and vegetation do not.

`uLift` grows the diffuse term as gloom rises. Without it the ground goes
black while the cloud stays mid-grey. In fog the sky dome is mixed toward the
horizon colour, and the hill and place labels are gated on the same
transmittance so nothing is named that cannot be seen.

Lying snow is applied on upward-facing surfaces, scaled by a noise field,
reduced in woodland, skipped on water, and on the track it is suppressed on
the railhead — which is picked out by being the one neutral grey in the
palette, everything else being warm or green. Wet ground is a flat darkening.

A FLIRT's horn switch has four positions and three instruments: forward
sounds both chambers together, which is the normal warning; left and right
sound the deep or the high one alone; and pulled back it gives the *légsíp*,
an air whistle that is quiet on purpose — for warning somebody close by at low
speed without frightening them. The chambers are a minor third, B flat 4 and
D flat 5. The KÜRT switch cycles the four positions; `H` sounds whichever is
selected.

Lightning fires as one to four decaying pulses a few hundredths apart, adds
light inside the cloud proportional to its density, and lifts the whole
palette for that frame. Thunder is scheduled at distance / 343 m/s; the crack
is only audible under about 4 km and the roll is low-passed further with
distance. Rain is a band-passed noise bed whose level rises with speed and
swells on a slow LFO; snow is set almost silent.

Train resistance uses air speed rather than ground speed in the aerodynamic
term, so wind along the line costs or saves running time.

**World axes are x east, y up, z SOUTH** — the right-handed frame that
`lookAt`, `perspective` and the solar position all assume. An earlier version
fed metres *north* straight into z, which is left-handed, and rendered the
entire world as a mirror image: every right-hand curve appeared as a left-hand
one and the midday sun sat in the north. Anything that builds a world position
from the (east, north) data must negate the north component, and any raster
lookup must undo it.

The near heightmap is **carved** along the railway at bake time: the DEM is
blended toward rail level within 11 m and out to 34 m. Without it the terrain
mesh samples raw ground and pokes straight through the track, because at
25.7 m per pixel a railway is barely one pixel wide.

**Stations** are synthesised, not surveyed: a platform deck 55 cm above rail,
165 m at a halt and 210 m at a station, placed on the far side of the running
line from its neighbour, which is where a side platform actually sits. Name
boards are drawn into a canvas atlas at load, one row each, in MÁV blue.

Keys: `M` manual/auto, `W`/`S` step the master controller (P1–P8 power,
B1–B8 brake; `shift+0` to zero, `Backspace` emergency), `Y` passenger seat
(`shift+Y` other side), `shift+P` fly a plane, `?` all keys. The mode bar at
the bottom does the same with a click. Previously: `W`/`S` power and brake, `C` chase view, `X` cab
interior on `I`, `X` wiper, `H` horn, `E` vigilance, `J` sand, `shift+F` headlights,
`,`/`.` jump to the previous or next station,
`F` follow another train, `G` sound, `L` hill names,
`P` labels, `Q` dispatcher board, `Tab` map, `shift+R` restart the run,
`shift+C` detaches the camera and flies it (WASD, `R`/`F` for height, shift to
hurry), `U` hides the whole interface,
`T`/`V`/`R`/`K`/`B`/`N`/`O` toggle terrain, vegetation, track, sky, buildings,
roads, overhead line, `1`/`2`/`3` time rate, space pause. `window.SIM` is exposed for poking
at; `SIM.demAt(x, y)` gives the ground under any point, because when something
does not appear the first question is always where the ground under it is;
`SIM.tick(t)` steps one frame by hand, which is the only way to drive the
simulation in a hidden tab, where the browser stops calling
`requestAnimationFrame`.

"In the cab" is one derived flag — the cab interior is drawn, your own train
is suppressed, and the windscreen and its wiper are drawn — and it is true
only when the camera is actually in the cab. The chase view used to leave it
set, so the cab was pasted over the outside view, the wiper swept across the
landscape, and your own train was invisible from outside.

## 22 Sep 2026 pass

See `../CLAUDE.md` → "Work done 22 Sep 2026" for the list with file
pointers. In short: building relations assembled (inner Pest was half
missing), ground filter for the surface-model DEM, per-building façade data,
street light pools, Nyugati's pitched hall and street front, master
controller and per-scenario stock, lane-aware traffic with overtaking and
junction turns, passenger mode, aircraft, flood plane, mode bar.

## Known gaps

**The current list is in `REVIEW.md`** ("Bugs and weak spots still open" and
the backlog at its end) and in `CLAUDE.md` ("Still open"). What follows is
the list as it stood in August 2026, kept for its history: several items are
done (buildings along the whole line, the city, land cover processed into
vegetation), and the Királyréti narrow gauge is still to come.

Six things in this list were wrong until 23 Aug 2026, recorded because the
same mistakes are easy to make again.

1. `trainDyn`, `sigDyn` and `xingDyn` were built and uploaded every frame and
   never drawn — no train, signal or crossing boom had ever appeared.
2. `state.hour` was never advanced, so the timetable was handed the same
   instant for ever and no service was released after the one you started
   with; lateness was measured against a frozen clock and the sun never moved.
3. The startup delay was `img.decode()`, which never settles in a hidden tab.
4. The whole reflection-target setup was duplicated inside `resize()`, so
   every resize built a fresh framebuffer, texture and renderbuffer, shadowed
   the real ones and leaked the old ones.
5. `KeyR` was bound twice: it toggled the track *and* restarted the run.
6. `KeyX` was bound twice after the weather pass: the cab interior and the
   new wiper, so one key did both.

The first three had been described in this file as if they worked.


- **Dömösi átkelés** has no OSM stop node (halt suspended); needs placing by
  hand at roughly km 54.3.
- The elevation raster is a *surface* model at 26 m/px. The track profile is
  graded, not surveyed — driveable, not buildable.
- **Road numbers in `data/layouts.json` are invented**, counted across the
  formation with 1 on the right facing Szob. Replace with real MÁV station
  diagrams when we get them.
- Signal aspect lamp arrangements are modelled, not verified against F.1.
- The 16.5% recovery margin and 50 s dwell are fitted and trade off against
  each other; a different dwell assumption moves the margin.
- `data/raw/landcover.json` (2874 polygons) is fetched but not yet processed
  into a vegetation scatter.
- No 24-hour traffic graph yet, only per-service running times.
- Buildings and the Királyréti narrow gauge are not processed.
- Land cover, buildings and roads are only baked for the near region
  (km 30–63.6).
- Passenger loading is a demand model, not data: bigger places exchange more
  people and dwell is 18 s plus a second per four passengers.
- Platform sides and lengths are inferred, not from a real station diagram.
  Nothing is numbered and there are no buildings placed deliberately — the
  station buildings you see are whatever OSM tagged nearby.
- Name boards face the viewer rather than sitting parallel to the track like
  real ones, because parallel is unreadable from a moving cab.
- Visibility is whatever the weather situation states, with the palette's
  own sun-altitude curve as a floor. Neither is derived from anything: the
  visual ranges are chosen to be typical of each situation, not measured.
- The formation apron still reads too broad where the ground is flat.
- Roads crossing the corridor still sample the raw DEM rather than the
  corridor surface, so a level crossing can sit slightly wrong.
- Roads have kerbs and centre lines but no junctions, markings at
  intersections, or bridges of their own.
- The two running lines differ in length by 118 m, so the same chainage is not
  abreast on both. Block occupancy uses one chain of signal positions for both
  directions, which is out by up to ~120 m on the up line.
- Up-direction schedules reuse the down leg times read backwards, which is
  fair for running time but does not model where crossing waits really fall.
- Lateness is measured only at booked calls, so it updates in steps rather
  than continuously.
- No announcements or horn; the chime is the only station sound.
- A hauled train's `length`, which is what block occupancy uses, is still
  `cars x unit length`, but the rake is now drawn as a locomotive plus
  `cars - 1` vehicles. The drawn EC is about 7 m shorter than the occupied
  length and the freight about 5 m longer.
- Trains are untextured flat-shaded geometry. There are no unit numbers, no
  destination blinds, no marker or tail lamps (only headlights, and they are
  always on), no coupler detail, no interiors and no passengers. Bogies are
  blocks with a lighter band for wheels — they do not rotate and the wheels
  are not round. The FLIRT's articulation is implied by bogie spacing only:
  the modules are still drawn as separate boxes with a gap, not joined by a
  gangway. Wagon make-up is a hash of chainage, not a real consist.
- Roads now cap each way end with a small disc, which closes the notches at
  T-junctions, but there is still no real junction geometry and Zebegény's
  dense network reads worse than the open stretches.
- The reflection pass covers everything the main pass does, trains and
  signals included. Sampling the reflection target while rendering into it is
  a feedback loop the driver rejects, so the water samples a flat dummy
  texture during that pass — reflections do not themselves reflect.
- The reflection is planar and exact for the water plane only. Anything not on
  that plane — a wake, a hull, spray — does not reflect, and there is no
  refraction of what is under the surface.
- The line still ends abruptly at Szob rather than running away into the
  distance.
- The panel can hold and release signals but cannot set routes, change
  points, or regulate a train's speed — there is no interlocking behind it.
- Road traffic turns at junctions (a way's end is matched to any other way's
  segment within 2.5 m) and overtakes on two-lane roads, but about 60% of way
  ends have no match, mostly where the bake cut roads off at 600 m, and there
  a vehicle turns round. Vehicles on different ways still do not see each
  other at crossroads; no traffic lights or give-way rules.
- Only 4 of the level crossings in the baked Vác–Szob section have a barrier
  in OSM (the 20 in the survey is the whole line, most of them below Vác), so
  there are two roads on which the queueing is visible at all.
- Vehicle headlights are emissive quads: they glow but light nothing.
- Vehicles are streamed, not persistent. One that leaves the radius is
  recycled rather than remembered, so the same bus is not going somewhere —
  it is traffic, not a timetable.
- Species are picked from the land cover class, which is 26 m per pixel, so
  a single tree can be the wrong species for its actual spot. There is no
  undergrowth, no hedgerow structure, and nothing grows on the reservation.
- The crop model is one cereal calendar with a per-field offset. There is no
  rotation, no rape (which would be unmistakable in April), no vine leaf
  colour distinct from the trees, and irrigation and fallow are not modelled.
- Ships do not avoid each other, do not slow for the ferry, and the ferry
  does not wait for a gap in the traffic. There is one ferry and it is placed
  by name, not from data.
- The wake is a flat wedge on the water surface, not a disturbance of it: it
  does not break up the reflection or move with the hull's displacement.
- The catenary voltage is a plausible number, not a load-flow. Sanding has no
  consumable limit and the sander never empties.
- Lit building windows are laid out from world position rather than from the
  wall's own axis, so on a building at an angle to the grid the grid is
  sheared. Nothing is lit inside — it is a pattern on the wall.
- The overhead line is geometry only. Nothing electrically connects to it:
  the pantograph reaches the right height but is not sprung against the
  wire, there are no neutral sections, no tensioning weights, no earth
  wires, and the catenary meter on the desk is still a plausible number
  rather than a load flow. A mast can stand in front of a signal.
- Platform canopies are a flat deck on one row of columns — no glazing,
  no trusses, no gutters, and nothing hangs from them: no clocks, no
  departure screens, no running-in boards. There are no benches, no
  shelters, no bins, no buffer stops anywhere, and the lamps light
  nothing — the lantern glows but the platform under it does not.
- Cab switches are drawn but unlabelled and inert.
- The headlight is one cone from the driven train only. Other trains' lamps
  glow but do not light the ground, and the cone does not fall on buildings or
  vegetation, only on terrain and the corridor.
- A front is one edge between two air masses, walking at a constant speed
  along the line. There is no depth to it — no warm sector, no wind veer as
  it passes, no line of cloud standing along the front itself, and the two
  situations either side never change while it runs.
- The falling particles are placed by hashing a world grid walked at the
  particle velocity. Left to run, the coordinate outgrows float precision, so
  the clock restarts whenever nothing is falling — and, failing that, after
  fifteen minutes of continuous rain, when the field reshuffles once.
- Rain does not wet the rails, so adhesion is unchanged; snow does not drift
  into the cuttings; nothing accumulates over time — the lying snow is a
  property of the situation, not the result of it having snowed.
- Precipitation is not occluded by anything: it draws in front of the whole
  world, so it falls through a station canopy as happily as through open air.
- A building or a tree takes its cloud shadow from one sample at its foot, so
  a cloud edge crossing a tall block darkens all of it at once rather than
  sweeping down the wall.
- The temperature is a nominal for the situation and the season, not a
  simulated one, and nothing consults it — rain does not become snow on its
  own, the situation says which it is.
- Startup is 442 ms measured on this machine. It used to take tens of seconds,
  which was not the corridor mesh: `loadImage` awaited `img.decode()`, and
  Chromium never settles that promise while the document is hidden — it does
  not reject, it never settles — so a build opened in a background tab hung on
  a blank screen with no error. It now waits on the load event instead.
- Water reflects but is still not convincingly dynamic; terrain seams persist
  in places; Zebegény's road network still reads poorly.
- Lines 71 and 75 are untouched.
- `shift+C` detaches the camera and flies it — WASD, `R`/`F` for height, shift
  to hurry, and it starts wherever the train is. It is what makes anything
  more than a hundred metres from the rails checkable at all: Margitsziget is
  1.5 km west behind Újlipótváros and cannot be seen from the cab.
- Zoom is a lens in the cab, where you cannot lean out of the window, and a
  **dolly** outside, where a long lens flattens everything and reads as a
  telescope rather than as getting closer.
- How far the road vehicles are drawn grows with the camera's height above the
  ground. At rail level 560 m is past the point of seeing them; from the free
  camera at two hundred metres they used to stop in a visible circle.
- The windscreen pivot is fixed in screen space, so the wiper is only in the
  right place when you are looking roughly straight ahead. It fades out as you
  turn away rather than being masked to the actual glass.
- Bloom has one fixed radius and threshold, and the bright-pass runs at a
  quarter of an already low internal resolution, so it is a glow rather than a
  lens. Exposure is manual: there is no eye adaptation.
- The cab interior is not lit by the headlights, and the headlights do not
  light anything — they are emissive quads.

## Settled

- **There are no tunnels on line 70.** All 25 tagged ones are
  `tunnel=building_passage` or `railway=abandoned`.
- Most stations are one connected component. Isolation has three causes:
  narrow gauge (Kismaros, Szob), lifted industrial connections
  (Vác-Alsóváros / Forte), and extraction-window clipping (Rákosrendező,
  Zebegény's up line — the latter correct, a halt has no crossover).
- Official km posts run about 1.02 m per km ahead of measured chainage.
  Display official, drive on measured; the fit in `build_infra_atlas.py`
  converts between them.
