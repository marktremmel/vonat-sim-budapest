# Asset guide: what the game needs, and in what form

Written in S-17 (Oct 2026) for the owner, who is about to get assets.
Pack names are from memory and were **not checked online**: open the page and
read the licence before paying.

## Rules that decide whether a pack is usable

1. **Licence.** The game is public on GitHub Pages. A pack is usable if it
   allows use in a released game. It need not allow redistributing the raw
   files: we ship only baked atlases and meshes, never the pack. CC0 is best.
   Avoid "non-commercial only" and "editorial only".
2. **Format.** GLB/glTF first, FBX second (Blender converts it), OBJ last
   (no animation). Blender-only files are fine.
3. **Weight.** Low-poly. Props under 1,500 triangles, people under 3,000,
   vehicles under 6,000. One texture atlas per pack, 1024 px or smaller, is
   ideal. Packs with a 4K texture per object are a poor fit.
4. **Look.** Flat or lightly textured colour, present-day Central Europe.
   Not fantasy, not American suburbia (yellow school buses, fire hydrants,
   mailboxes), not a deliberate PSX look.
5. **Animation.** For people and animals: a walk cycle and an idle are
   enough. Rigged with no animation is usable only with a separate animation
   library on the same skeleton.

## What to get, in order of value

| # | what | used for | notes |
| --- | --- | --- | --- |
| 1 | **Animated low-poly people**: 8–12 civilians, mixed ages, walk + idle + sit | platforms, pavements, tram and train interiors, the persona | You already have Quaternius base characters and an animation library in `Game Assets`. Try those first: this may need no purchase |
| 2 | **Street furniture, European**: bus shelter, bench, bin, bollard, bike rack, kiosk, advertising column, post box, street clock, phone box, fences and railings, concrete panel fence | every street and platform; OSM has the positions of benches, bins, shelters, bike racks | Kenney "City Kit" packs and KayKit city packs are CC0 but generic. One Eastern European prop pack is worth more than three generic ones |
| 3 | **Railway furniture**: platform canopy, station name board, clock, ticket machine, level-crossing parts, buffer stop, relay cabinet, signal box, water crane, semaphore | stations and yards | Rare as a pack. Photos are a good substitute: see below |
| 4 | **Vehicles**: city bus (to paint BKK blue), articulated bus, trolleybus, van, lorry, tractor, bicycle, scooter, motorbike | road traffic; "other ways of getting around" | The cars are already models. Buses are the biggest gap: OSM has the bus routes |
| 5 | **Façade textures, tileable**: Pest tenement (plaster, stucco, brick), village house (plaster with a plinth), 1970s cube house, station building yellow | every building; this is where "visual definition" mostly comes from | ambientCG and Poly Haven are CC0 for plaster, brick and concrete. Tenement façades are best made from your own straight-on photos |
| 6 | **Sound recordings**: tram bell and rumble, station hall, platform announcements chime, city street, level-crossing bell, crowd, rain on a roof, birds by season | the sound is mostly synthesised now | Freesound with the CC0 filter; Sonniss GDC bundles (free, game use allowed) |
| 7 | **Animals**: horse with walk and graze, cow, sheep, dog, pigeon, stork | paddocks (289 mapped), fields, squares | Replaces the box horses |
| 8 | **Boats**: river cruiser, barge with pusher, small ferry, rowing boat | the Danube | The ships are simple boxes now |

## Photos you can take (free, and often better than a pack)

- **Graffiti**: straight-on, the whole piece in frame, even light. Each becomes
  one more piece in the graffiti sheet (`tools/bake_stickers.py`). There are
  40 now, from the Designsoup pack.
- **Station buildings**: all four sides, straight-on, plus one corner view
  and the winged wheel. One set per building type is enough.
- **Fences and walls**: the concrete panel fence, noise barriers, brick yard
  walls. One panel, straight-on.
- **Signs**: station name boards, platform numbers, crossing signs.
- **Façades**: one typical house per village or street type, straight-on.

## What happens to an asset once it is here

1. It stays in your library. Only the files needed are copied to a work
   folder outside the repository.
2. A bake script (`tools/bake_models.py`, `bake_stickers.py`,
   `bake_facades.py`) turns it into an atlas and a compact mesh in `web/data`.
3. The README credits the author.

**The limit today:** the game can draw textured static models (the cars) and
flat decals (graffiti). It cannot yet load glTF directly or play skeletal
animation. That loader is the first step in `WHERE_NEXT.md`, and items 1, 2,
3, 4 and 7 above all wait on it.
