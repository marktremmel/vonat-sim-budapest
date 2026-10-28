# Near trees as leaves on wood (27 Oct 2026)

The owner asked for trees and bushes with more volume and density, light
that comes through the leaves, and seasons that change leaf by leaf. This
note covers what was built, how it was checked, and the limits. Not
committed.

Screenshots in `docs/img/leaf_*.jpg`, taken from the canvas in the preview
(port 8177, 1280×720, internal resolution 896×504):
- `leaf_god_noon.jpg` and `leaf_god_noon_old.jpg`: the riverside wood at Göd, July noon, new and old;
- `leaf_god_evening.jpg`: the same wood against the evening sun;
- `leaf_god_oct.jpg`, `leaf_god_jan.jpg`: 20 October and January;
- `leaf_god_650m.jpg`: from 35 m up, with the 650 m setting;
- `leaf_borzsony_oct.jpg`, `leaf_borzsony_jan.jpg`: a hillside wood above Nagymaros, October and January;
- `leaf_budapest_noon.jpg`: cadastre trees in Budapest.

The two January pictures and the 650 m one are after the owner's first
review (below); the others are from before it, when the winter twigs were
bigger.

## What was built

**Near the camera**, every tree and bush is drawn by
`web/src/foliage.js` (new, in `ORDER` after `engine.js`). "Near" means:
- 70 m with `state.lite` (phones), whatever the setting;
- otherwise Beállítás → "Lombos fák eddig" / "Leafy trees up to"
  (`gfxLeafR`, remembered as `szobPrefs.gfx.leafR`):
  - auto: 190 m at the default city radius, 120 m at a lower one;
  - or 300, 450 or 650 m.

What it draws:
- One template tree, built at boot by `buildFoliageMesh()`: a six-sided
  trunk flared at the foot, 8 limbs, 16 side branches, and 64 leaf clusters
  (two at each branch tip, the rest over the crown's outside). 484 vertices.
- `FOL_VS` bends the template into each species' crown (`folSpecies`: where
  the crown starts, its width, its form: dome, cone, column, weeping or
  mound), turns and mirrors it per tree, and turns each cluster to face the
  camera. Crown starts and widths follow the old silhouettes, so near and
  far are the same tree.
- `FOL_FS` cuts single leaves out of each cluster: a grid of leaf cells whose
  size follows the cluster's size on screen (about 3 px a leaf, 2 to 16 across
  a cluster; two levels are dithered so a change of level does not pop).
  Conifers get crossed needle pairs. Where there is no leaf, there are twigs:
  two from the cluster's foot, each forking once (one on a distant cluster).
  They are the same length in every season, and none are drawn on small
  distant clusters in leaf.

**Light** (`FOL_VS`/`FOL_FS`):
- The crown is treated as an ellipsoid. For every vertex, the shader works
  out how many metres of crown lie between it and the sun and attenuates the
  sunlight by that (`folPath`, density per species, much lower when bare). So
  the far side of a crown and the inside are in the crown's own shadow, and
  the trunk under a full crown is shaded.
- Leaves facing away from the sun get some light through them, and much more
  when you look towards the sun (yellow-green, not white).
- Ambient light is darker deep in the crown and low down; the trunk gets a
  little light off the sunlit ground.
- Cloud shadow is sampled once per tree, as before. Street lamps light the
  leaves at night (`STREETLIGHT_GLSL`, evaluated per vertex).

**Seasons, per leaf** (`FOL_FS`, from `seasonOf` in env.js, unchanged):
- Every leaf has its own random number. Leaves on the sunny outside of the
  crown turn first, and the same order decides which fall first.
- Each species turns to its own colour (`vegGold`), with some leaves redder
  (fruit trees, oaks, beech) and some browner.
- In spring the leaves appear small and grow; fruit trees flower first.
- Oaks, beech and hornbeam keep about 14% of their leaves, dead brown,
  through the winter.
- Snow lies on upward-facing leaves and twigs.

**Far away** the trees are the old three-plane crosses (`VEG_VS`, `TREE_VS`,
`VEG_FS`). The two are handed over pixel by pixel, so each pixel is drawn by
one of them. The reflection pass keeps the crosses throughout.
- Each tree has its own band (`VEG_BAND_GLSL`): it starts between 55% and 70%
  of the radius and ends between 85% and 100%, set by the tree's seed. So the
  change is not a ring at one distance.
- Within the band the pixel threshold is interleaved gradient noise, shifted
  per tree (`VEG_HANDOFF_GLSL`).

**Placement is unchanged.** The forest's placement code moved into a shared
function, `vegPlace()` in `VEG_PLACE_GLSL` (shaders.js), which both the far
crosses and the near trees call, so they place the same trees. The species
colours moved into `VEG_PAL_GLSL` (`vegGreen`, `vegGold`, `vegBark`), shared by
both; tune colours there. Budapest's cadastre trees (BP Fatár) go through the
same near path: `main.js` keeps a list of the ones within reach
(`Foliage.pickCadastre`). Flower beds stay flat quads at every distance.

**How it is drawn:**
- A transform-feedback pass (`FOL_PLACE_VS`, `FOL_CAD_VS`) runs `vegPlace()`
  once per grid cell and writes one 12-float record per tree into a buffer.
- It covers the near radius plus 40 m, and reruns only when the camera has
  moved 30 m, every 40th frame (for the cloud shadow), or when the passes,
  craters or cadastre list change. It runs before any pass of the frame
  starts.
- The draw is one instanced call over the records. `FOL_VS` drops trees out
  of range or out of view at the first line.
- Further out, a tree draws fewer, larger clusters (down to 45% at the
  hand-off); the understorey pass draws 60%, and lite 50%.
- No new texture units are used.

## Measurements

All in the preview on this Mac (WebKit WebGL over Metal), Göd riverside
wood, July noon, unless stated. The machine was busy with other work during
these runs, so whole-frame times drifted between runs. The A/B numbers were
taken back to back.

| what | old crosses | leaf trees |
| --- | --- | --- |
| whole frame, median of 5 (CPU+GPU, synced with `readPixels`) | 31.3 ms | 30.5 ms (no vegetation: 28.8 ms) |
| vegetation block on the GPU (`state.vegGpuMs`) | 1.3 ms | 2.2 ms |
| placement pass, averaged over frames (`state.folPlaceGpuMs`) | — | 0.07 ms |
| vegetation block, lite settings at run time | 1.0 ms | 1.2 ms |
| Budapest street, whole frame, median of 6 | 39.0 ms | 40.2 ms (no vegetation: 42.6 ms, i.e. noise) |

So on desktop the leaf trees cost about 1 ms of GPU time over the crosses.
The whole-frame numbers are within the noise.

**The distance setting**, measured from 35 m above the Göd riverside wood
(`leaf_god_650m.jpg`), July afternoon. The GPU time is of the vegetation
block, two runs each, after the first review's changes:

| setting | tree records | vegetation on the GPU |
| --- | --- | --- |
| old crosses | — | 1.4–2.5 ms |
| auto (190 m) | 3,107 | 2.2–2.7 ms |
| 300 m | 4,419 | 2.7–2.9 ms |
| 450 m | 6,699 | 3.3–3.7 ms |
| 650 m | 11,219 | 4.7–5.0 ms |

The record buffer holds 14,000 trees and the cadastre list 12,288, enough for
650 m. There is no setting past 650 m; the forest grid's records grow with
the square of the radius.

How to measure: `SIM.state.vegTimer = true` times the vegetation block and
the placement on the GPU, where `EXT_disjoint_timer_query_webgl2` exists.
Results come back a frame or two later, into `state.vegGpuMs` and
`state.folPlaceGpuMs`. `SIM.state.leafTrees = false` switches back to the old
crosses at run time; that is the A/B switch. `SIM.foliage.trees` is the record
count, and `SIM.foliage.runs` counts the placement passes.

Before placement was made occasional, it ran every frame inside the scene's
pass, and the GPU timer charged it 2–4 ms for about 3,000 points. The likely
cause is the Metal back end splitting the pass for transform feedback.
Whatever the cause, a transform-feedback pass here should run rarely and
outside a pass.

## Limits

- **Not run on a phone.** "Lite" was measured by setting `state.lite` at run
  time on this Mac. That changes the radius (70 m) and the cluster budget, but
  not what lite changes at boot.
- **Hand-off band.** In the band a tree is part leaf tree, part cross. Before
  the first review, in lite (band at 56–70 m), that showed as a dithered
  ghost of both shapes. With the wider, per-tree band it was not noticeable
  in the same view, nor on desktop in the views tried. It was checked in
  still pictures, not while moving.
- **Clusters face the camera.** Turning round a tree, the clusters turn with
  you. Close up (inside a crown) the leaves are much larger than real leaves,
  0.3–0.5 m at the finest level for a big tree.
- **The crown is one ellipsoid** for shadowing. A cone (spruce) or a column
  (poplar) is shadowed as if it were an ellipsoid of the same height and
  width.
- **Trees cast no shadow on the ground** or on each other. There is no shadow
  map anywhere in the game.
- **The far crosses are unchanged.** They do not have per-leaf colour or the
  light through the crown. The hand-off hides the difference within a tree,
  not between near and far woods.
- **Flower beds and the reflection** keep the old drawing.
- Leaf density per species (`dens`), crown forms and cluster sizes were set by
  eye from the pictures, not measured from real trees.
- **A GL error (1282, INVALID_OPERATION) is raised every frame**, with or
  without vegetation, so it is not from this work. It was not traced.

## Files

- `web/src/foliage.js`: new. The template, the placement and draw shaders, and `Foliage` (`place`, `draw`, `pickCadastre`).
- `web/src/shaders.js`:
  - `VEG_PLACE_GLSL`, `VEG_BAND_GLSL` and `VEG_HANDOFF_GLSL` are new;
  - `VEG_PAL_GLSL` is new, moved out of VEG_FS;
  - `VEG_VS` now calls `vegPlace()`;
  - `VEG_VS`, `TREE_VS` and `VEG_FS` take `uNearFade` for the hand-off.
- `web/src/main.js`:
  - `foliage` is created after `treeVao`, and `treeVao` keeps `inst` for the cadastre list;
  - the placement runs before the reflection pass, the draw in the vegetation block;
  - `uNearFade` is set on the far passes;
  - the GPU timer hook;
  - `SIM.foliage`.
- `web/src/engine.js`: `compile()` takes an optional list of transform-feedback varyings.
- `web/index.html`, `web/src/settings.js`: the "Leafy trees up to" setting.
- `tools/build_sim.py`: `foliage.js` added to `ORDER`.

## The owner's first review (27 Oct, evening)

They said "leaves are magnificent", and that the leaf colours and how the leaves
change were good. They asked for three changes:

1. **"See if my computer could handle longer draw distances."** Done: the
   setting above, up to 650 m. Lite stays at 70 m.
2. **"Transition could be more elegant."** Done:
   - The band is wider: 55–100% of the radius, was 80–100%.
   - Each tree changes at its own distance.
   - The 4×4 dither is replaced by finer noise.
   Not seen while moving.
3. **"Branches grow in the winter … kinda creepy."** That was literal: the
   twigs grew longer as the leaves fell (0.5 → 1.1 of a cluster). Now:
   - they are one fixed length, 0.62, in every season;
   - there are two twigs per cluster, each forking once (were three, each
     forking twice), and thinner;
   - on distant clusters there is one twig;
   - the limbs and side branches are 16–33% thinner.
