# Façade plan: which family goes where

Written 27 Oct 2026, evening; the routing was built the same night. How the
sheets are made and cut is `docs/FACADE_KIT.md`; this file is about
**routing**: which building gets which façade family, district by district
in Budapest and town by town on the lines.

## Where it stands (27 Oct, late evening)

- **Routing is built.** The bake decides each building's family from where
  it is (`tools/facade_zones.json`, read by `tools/facade_zones.py`), and the
  shader draws it. Ten families are wired; four have sheets (tenement,
  interwar, cube, village, 63 sheets). The other six (villa, mav, oldtown,
  garden, civic, szocreal) have prompts in `docs/FACADE_KIT.md` and empty
  folders: a building routed to one of them falls back to the old rule by
  class and height until its sheets are in.
- After a zone change: `sh tools/bake_all.sh`, then `python3 tools/build_sim.py`.

## What OSM gives us to route by (counted 27 Oct)

Over the 341,395 buildings in the city download, line 70's context and
Esztergom:
- `start_date` (year built): 3,726, about 1%.
- `building:architecture`: 122 (52 functionalism, 18 art nouveau…).
- heritage refs: 186.

So the year and the style cannot come from the tags. They have to come from
**where the building is**, its class (house, apartments, school…), its
height and footprint, and what is round it (block density, railway land).
That is how a person would guess too.

No MÁV colony is mapped as an area. Only streets and churches carry the name,
which is enough to find them:

| place | anchor in OSM | lat, lon |
| --- | --- | --- |
| Rákospalota MÁV-telep (XV, line 70) | Vasutastelep utca, MÁV Telepi Jézus szíve templom, the BKV stop | 47.543–47.547, 19.115–19.122 |
| Kőbánya MÁV telep (X) | "MÁV telep", Kisboldogasszony templom | 47.490, 19.110 |
| Dunakeszi works colony (line 70) | Járműtelep utca | 47.584, 19.112 |
| Vác, by the station | MÁV telep utca | 47.782, 19.137 |
| Szob mining colony | Bányatelep utca | 47.822, 18.861 |
| Pilis mining colony (line 2) | Bányatelep | 47.607, 18.903 |
| Wekerletelep (XIX) | Wekerletelepi templom, Kultúrház | 47.455–47.458, 19.122–19.128 |

From reading about them (sources at the end): MÁV built its colonies from
the 1890s to the 1920s near stations and works, to standard designs, mostly
one storey, some two. The walls are plastered, with exposed brick on the
plinths, corners, cornices and round the windows, stone plinths and wooden
shutters. The 1910s ones (Istvántelek) are more romantic. Rákospalota's was
the biggest in Budapest; part of it was later replaced by panel blocks.
Jancsi-telep (1894–96, Kőbánya/Józsefváros, by the Northern Workshop) still
has stone plinths, brick decoration and shutters. The extents in the table
are a guess from the street names: check them on a map before baking.

## How it works

1. **`tools/facade_zones.json`**: named zones, each a circle `[lat, lon,
   radius m]`, a box `[south, west, north, east]` or a Budapest district by
   its OSM name, with a family mix per building category. Circles and boxes
   come first in the file, then the districts, then a catch-all box. The
   first zone that holds the building and mentions its category wins; a
   category a zone leaves out falls through to the next zone. Shares are
   fractions; the rest is procedural.
2. **Categories** (`facade_zones.py category`, copying the shader's
   `facadeKind`): `house_low` (houses with walls under 5.6 m), `house_high`,
   `tenement` (class 9, or untagged and 8 m or more), `flats` (apartments 8 m
   or more, the shader's "modern flats"), `public` (class 8: schools,
   hospitals, offices of the state). Others (halls, churches, shops, panels)
   get no family.
3. **The pick** is random by the building's OSM id, so it is the same on
   every bake.
4. **The byte** goes into the top four bits of the building's class byte
   (`class | family << 4`; classes go up to 14). 0 = no zone, 1–10 = family
   + 1, 15 = procedural on purpose. `geom.js unpackPolyBuildings` splits it
   (`B.cls`, `B.fam`), the box path passes it through, and both shaders
   split it again (`clsB & 15`, `clsB >> 4`). Nothing else reads the byte
   (`bake_city.py` copies it into the tiles, `bake_map.py` ignores it).
5. **The shader** (`FACADE_GLSL`) has `uniform ivec2 uKitFam[10]` (first
   sheet, count, filled by `main.js` from `facade_kit.json`) and `KIT_G`, the
   ground floor, storey and bay of each family. The baked family wins if it
   has sheets; otherwise the old rule (70% of a kind with sheets, 12% of
   tenements interwar). Interwar and 1950s blocks take the muted palette.
6. **`tools/bake_all.sh`** rebakes the city tiles and the three line
   contexts in order (about 5 minutes) and prints the buildings per zone and
   family from each log (`data/bake_logs/`).
7. District outlines: `tools/q_districts.ql` → `data/raw/districts.json`
   (OSM admin_level 9).

Atlas size: ten families at about 12 sheets is 120 sheets, 2048 × 3600, under
the 4096 px limit, but about 80 MB of GPU memory for colour and mask. For
phones (`state.lite`) the loader should take a half-size atlas, baked
alongside (`facade_kit_lite.webp`); not done yet.

## What was checked (27 Oct, late)

- `sh tools/bake_all.sh` ran in about 8 minutes (city 312 s, the lines 51–66
  s each). Building counts unchanged (city 252,046; line 70 46,523 polygons;
  line 2 20,857; S21 13,375); in the boxes only the family bits of the class
  byte changed.
- Buildings caught per zone, from the logs, for example: Rákospalota
  colony 583 mav, Kőbánya colony 132 mav, Vác old town 414 oldtown, Vác
  MÁV-telep 62 mav, Szob Bányatelep 81, Pilis Bányatelep 266, Esztergom old
  town 1,331 oldtown, Wekerletelep 448 garden, Újlipótváros 150 interwar.
  The Dunakeszi colony circle caught only 11 buildings, so it is probably in
  the wrong place.
- In the build: no shader errors; Pozsonyi út (Újlipótváros) from the air
  is mostly interwar sheets now. Tests 35/35.
- Not checked: the new families (no sheets), phones, the district borders
  building by building (a 110 × 75 m cell decides, so a block on a border
  can go either way).

## Budapest, district by district

The mixes are starting points: about 70% of a kind takes a kit sheet, the
rest stays procedural so a street is not one pattern. "Houses" is kind 1,
"blocks" are apartments and tenements, "public" is schools, town halls,
offices with a public use.

| district | what is there | blocks | houses | public / other |
| --- | --- | --- | --- | --- |
| I Vár, Víziváros | baroque and copf houses on Castle Hill, tenements below | Castle Hill: oldtown; Víziváros: tenement, some oldtown | villa | civic |
| II, XII Buda hills | villas, interwar villas, some 1960s | interwar | villa, cube | civic |
| III Óbuda | old Óbuda's one-storey core (Fő tér, Kiscelli), panels, 1950s | szocreal, interwar | oldtown (old core), cube | civic |
| IV Újpest | small-town centre, 1950s, panels; Istvántelek works colony | tenement (low), szocreal | mav near Istvántelek, cube, village | civic |
| V Belváros, Lipótváros | the richest tenements, offices | tenement | — | civic |
| VI, VII Terézváros, Erzsébetváros | tenements, a lot unrenovated in VII | tenement (more of the worn sheets in VII) | — | civic |
| VIII Józsefváros | tenements, lower and poorer outward; MÁV housing by Keleti (Nyolcház) and Jancsi-telep at the X border | tenement | mav at Jancsi-telep | civic |
| IX Ferencváros | tenements inside, 1950s and panels outside, brick industry on Soroksári út | tenement, szocreal | — | civic |
| X Kőbánya | breweries and works, 1950s blocks, the Kőbánya MÁV telep | szocreal | mav (colony), cube | civic |
| XI Újbuda | interwar on Bartók Béla út and Lágymányos, villas on Gellért Hill, 1950s, panels | interwar, szocreal | villa (Gellért Hill) | civic |
| XIII Újlipótváros, Angyalföld | Újlipótváros is Budapest's interwar quarter; Angyalföld 1950s and panels | Újlipótváros: interwar 60%, tenement; Angyalföld: szocreal | — | civic |
| XIV Zugló | villa quarter by the Városliget, interwar, cube houses outward | interwar, tenement | villa (west), cube | civic |
| XV Rákospalota, Pestújhely | the Rákospalota MÁV-telep, family houses, panels | szocreal | mav (colony 80%), cube, village | civic |
| XVI, XVII outer Pest | family-house suburbs, 1910s–30s villa colonies (Mátyásföld) | — | cube, garden, village | civic |
| XVIII Pestszentlőrinc | garden suburbs (on S21) | szocreal | garden, cube | civic |
| XIX Kispest | Wekerletelep, panels | szocreal | garden (Wekerle 85%) | civic |
| XX, XXIII Pesterzsébet, Soroksár | small houses, some village core | — | cube, village | civic |
| XXI Csepel | the works, 1950s estates, garden town | szocreal | garden, cube | civic |
| XXII Budafok, Budatétény | old wine-village core, villas | — | oldtown (core), villa, cube | civic |

## Line 70: the suburbs and the Danube Bend

| place | blocks | houses | notes |
| --- | --- | --- | --- |
| Dunakeszi | szocreal, panels | mav (works colony by Járműtelep utca), cube | the works itself is industrial halls |
| Göd, Sződ, Sződliget | — | cube, village | Göd's interwar villas by the Danube: villa |
| Vác, old town (Káptalan utca 47.777, 19.130; the main square; Szent Anna templom 47.776, 19.129) | oldtown | oldtown | baroque town, one of the most baroque in Hungary |
| Vác, by the station | — | mav (MÁV telep utca, 47.782, 19.137) | |
| Vác, Deákvár and the estates | szocreal, panels | cube | |
| Verőce, Kismaros | — | village, cube, villa (holiday villas) | |
| Nagymaros (Fő tér 47.789, 18.959) | — | oldtown (core), village | |
| Zebegény, Szob | — | village, cube; mav at Szob's Bányatelep | |

## Line 2 and S21

| place | blocks | houses | notes |
| --- | --- | --- | --- |
| Óbuda end of line 2 | szocreal, panels | — | see district III |
| Üröm, Budakalász, Solymár, Pilisvörösvár | — | village, cube | Swabian villages: gable-end houses (a façade does not change the roof; later) |
| Pilisvörösvár / Pilisszentiván mining colony | — | mav (Bányatelep 47.607, 18.903) | the mining colonies look like MÁV ones |
| Piliscsaba, Pilisjászfalu | — | villa, cube | villa colonies of the 1900s–30s |
| Dorog | szocreal | mav (miners' colonies) | |
| Esztergom, Víziváros and the town centre | oldtown | oldtown | baroque, rebuilt after 1706 |
| Esztergom, outer estates | szocreal, panels | cube | |
| S21 Kőbánya-Kispest to Pestszentlőrinc | szocreal | garden, cube | Wekerletelep sits by the line |
| Ócsa, Dabas, Lajosmizse | — | village, cube | Ócsa has a protected old village core |

Town-centre coordinates not in the table above (Esztergom's Széchenyi tér
and Víziváros, Vác's main square) were not found under those names in our
downloads and need looking up when the zone file is written.

## Order of work

1. **Generate sheets** for the six new families (owner, ChatGPT, no Claude
   time). Priority by how many buildings they cover: civic, szocreal, villa,
   mav, oldtown, garden.
2. ~~Wiring~~: done 27 Oct (above). When the new sheets are in, check by eye
   in five places: Rákospalota colony, Vác main square, Esztergom Víziváros,
   Wekerletelep, Újlipótváros.
3. **Phone atlas**: the half-size `facade_kit_lite.webp` and a check on a
   real phone.
4. Later: interior mapping behind the glass mask; gable-end village houses
   (needs roof work, not façades); shopfronts as their own small family.

## Sources

- [MÁV telepek, vasúti lakótelepek Budapesten (We Love Budapest, Dec 2025)](https://welovebudapest.com/cikk/2025/12/20/mav-telepek-vasuti-lakotelepek-budapest/): the colonies, standard designs, plaster with exposed brick.
- [Kis falu a nagyvárosban: a Jancsi-telep (We Love Budapest)](https://welovebudapest.com/cikk/2021/07/30/latnivalok-es-kultura-kis-falu-a-nagyvarosban-a-jancsi-telep): built 1894–96 for the Northern Workshop, stone plinths, brick decoration, shutters.
- [A rákospalotai MÁV-telep házainak története (We Love Budapest)](https://welovebudapest.com/cikk/2025/01/29/latnivalok-es-kultura-rakospalota-mav-telep-hazak-tortenete/): the biggest colony, the 1910s.
- [Ferkai András: Housing Estates (Hungaricana)](https://library.hungaricana.hu/en/view/VaroshazaKiado_0008/?pg=7): the MÁVAG colony, red brick strips framing plastered façades.
- [Víziváros, Esztergom (Wikipedia)](https://en.wikipedia.org/wiki/V%C3%ADziv%C3%A1ros): destroyed 1705–06, repopulated and rebuilt.

The district descriptions are general knowledge of Budapest, not checked
building by building; the zone file is where they get tested against the
map.
