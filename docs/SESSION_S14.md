# Session S-14 (26 Sep 2026): progress log

Started from the owner's aerial photo of Zugló (Thököly út, Francia út,
Mexikói út): "in real life the train goes over raised ground between Mexikói út
and down around after Kőbánya alsó. Kőbánya alsó is still raised, with a higher
platform."

## Done (all seen in the preview unless it says otherwise)

- **S21 embankment, km 2.9–8.9** (`tools/raise_profile.py`, new).
  - Measured first: the S21 rail stood 2 m above the DEM from km 2 to 10. SRTM smooths the bank away (NOTES Trap 15).
  - The tool patches `route_s21.json` in place: both tracks, stop heights and grades. It stores the table as `raised`, and a re-run takes the old lift off first (ran it twice: no stacking).
  - Lift: +5.5 m from km 3.95 to km 8.15, eased in from km 2.9 (after the Hungária körút overpass at km 2.85) and out by km 8.9.
  - Steepest grade 1.16% (was 0.38% there).
  - Zugló and Kőbánya alsó platforms +5.5 m; Mexikói út +0.1 m.
- **Roads under it** (`geom.js`):
  - Thököly út, the side streets at km 4.78 and km 5.23, Kerepesi út and Kőbányai út now pass under at street level.
  - The floors come out at natural ground by the existing rule (`railY − 6.6` is now below it).
  - Clearance: Thököly 6.3 m, Kerepesi 6.3 m, Kőbányai 6.2 m.
- **The bank's shape:**
  - A 1:1.5 slope on raised stretches (the 36 m ease would have buried the parallel streets).
  - The top widens (up to 30 m, per side) where active sidings run within 60 m. Disused ones don't count: they had pulled a street onto the bank.
  - Sidings 60–110 m out stand on the ground, not at rail height.
  - Roads never climb a raised bank.
  - Underpass walls are capped at the ground: they stood in the air as slivers.
  - A denser corridor cross-section on raised lines.
- **Scope:** all of it is keyed to `route.raised`.
  - Line 70 has none and loads with no console errors; its corridor, roads and walls use the old code paths.
  - Tests 28/28.

- **Airport road at km 11.54** (the owner's "Üllői út crossing: no level difference"):
  - S21 goes 6 m down into a cutting from km 10.85 to km 12.35, a negative entry in `RAISES`. The DEM trough along the line suggests a real cutting; the depth is an estimate.
  - A road bridge over a raised or lowered stretch clears the rail by 7.4 m and ignores the ground under it.
  - The deck went from 129.5 m to 123.2 m, level with the ground along the road. The approach ramps went from about 50% to 12% or less.
  - The cutting uses the same steep slope as the bank.
  - Sidings within 60 m (KÖKI) go down with it.

- **Kispest, the owner's photos** (found in `owner_feedback_images/kispest/`; the S-13 notes wrongly said they had not arrived):
  - `tools/bake_platforms.py <line>` (new) downloads `railway=platform` ways and the footway/cycleway bridges within 45 m of the line and stores them in `extras_<line>.json`. `bake_linex.py` now keeps those two keys.
  - `geom.js osmPlatformSections` turns a platform (a line or an area) into cross-sections. A line platform's width comes from the tracks either side: an island fills the gap less 1.65 m a side (only tracks within 5 m count); a side platform is 3.2 m wide. OSM `height` is used (0.25–0.8 m).
  - `buildStations` was refactored around one `emit()` (deck, faces, canopy, lamps, board). An island gets its columns and lamps down the middle.
  - A stop with OSM platforms uses them; the others keep the generic platform. Waiting people stand on the OSM platforms.
  - `buildFootbridges`: a deck 6.9 m over the rails, lattice sides and a stair tower at each end.
  - Baked for all three lines: S21 has 20 platforms and 10 footbridges, line 70 has 43 and 27, line 2 has 32 and 18. The old extras are backed up in `../extras_line70.before.json` and `../extras_line2.before.json`.
  - Seen: Kispest (island between the main track and the loop, low, footbridge in view, people on it), Dunakeszi, Pilisvörösvár. Every other station has not been looked at one by one.
  - Kispest's island is 1.5 m wide, because OSM puts the tracks 4.8 m apart. It may be narrower than the real one.

## Not done / seen limits

- From the air, the cuts where roads cross diagonally under the bank are still faceted (steep triangle fans). From the street and the cab they read as bridges in a bank.
- The parallel line on its own bridge beside S21 at Thököly út (in the photo) is drawn only if it is in S21's yard-track extract; not checked one by one.
- City-tile rails (`buildCityExtras`) beside the bank are still at ground level. Where they duplicate a context siding, that one is inside the bank.
- Older backlog note "embankment near and before Zugló too high": the owner confirmed it meant this; marked done.
- Backup of the unraised route: `../route_s21.before_raise.json` (outside the repo).

## Where this session stopped

Not committed (the owner reviews first).
