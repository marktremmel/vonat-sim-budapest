# Data sources: what is used, and what could make the sim more accurate

Written 23 Sep 2026. "Used" means the bake pipeline reads it today. The other
sources were found by a web search on that date and have **not** been tried.

## Used now

| Data | From | Notes |
| --- | --- | --- |
| Track, stations, signals, km posts, crossings, buildings, roads, land cover, water, places | OpenStreetMap via Overpass (`tools/*.ql`, `tools/overpass.py` with mirror fallback) | Accuracy is OSM's. Heights are mostly guessed: few buildings carry `height` or `building:levels`. |
| 3D building parts | OSM `building:part` (`q_building_parts.ql`) | Inner Budapest, Vác, Esztergom. 874 parts on line 70. |
| All tracks along line 2 (loops, sidings) | OSM, `q_line2_rails.ql` | Gives the passing loops the single-track working uses. |
| Terrain | Mapzen/AWS Terrarium tiles (a blend of public DEMs; around 25–30 m here) (`fetch_terrain.py`) | This is a surface model: roofs and trees are in it. `ground_filter.py` removes the buildings in built-up land cover. |
| Timetable | Generated (`bake_timetable.py`, `line_runtimes.py`) | Line 70's `runtimes.json` was overwritten with mock values (see CLAUDE.md). Line 2's run times come from simulating a FLIRT. |

## Worth trying, most useful first

1. **MÁV GTFS: the real timetable.**
   - MÁV-START has published its timetable as GTFS since 2016, free after registration.
   - Registration form: <https://www.mavcsoport.hu/gtfs-igenybejelento>.
   - BKK's feed (including the HÉV) is on Transitland: <https://www.transit.land/feeds/f-u2m-bkk>.
   - What it would give: real S70/G70/Z70/S72/Z72 times, stopping patterns and train numbers, in place of the generated ones and the mocks.
   - Needs: a GTFS reader in `bake_timetable.py`, and matching GTFS stop names to OSM stations.
2. **A real ground model (DTM) instead of the surface model.**
   - Sonny's LiDAR DTMs of Europe (<https://sonny.4lima.de/>) are free, derived from national LiDAR where it is open. Check whether the Hungarian coverage is LiDAR-based or only a fill.
   - Hungary's own 5 m DDM (Lechner Tudásközpont, info@lechnerkozpont.hu) is listed on the INSPIRE geoportal; access terms need checking.
   - What it would give: no building "humps", real cuttings and embankments, and correct bridge abutments. Most of the terrain workarounds in this code exist because the current terrain is a surface model.
3. **More OSM than we ask for.**
   - `railway:signal:*` (signal types and positions), `maxspeed` per track, `railway:track_ref` (platform numbers), `electrified` / `voltage`, `bridge:structure`.
   - OpenRailwayMap renders these and is a quick way to see what is mapped.
   - `roof:shape`, `roof:colour`, `building:colour` on ordinary buildings. The parts renderer already reads them; the outline renderer does not yet.
4. **BKK GTFS for the city.**
   - Trams on Margit híd and the Nagykörút, the HÉV to Szentendre along the Buda bank, and buses.
   - This would replace invented road traffic with real routes, at least where the vehicles are visible.
5. **Wikidata** for heights and dates of named buildings. Many OSM buildings carry a `wikidata` tag, so a Wikidata `height` would be a better guess than one from building levels.
6. **Aerial imagery for checking, not for textures.** Use it to check positions and roof colours of landmarks by hand. Most orthophoto licences forbid redistribution, so don't bake it into the sim.

## Not found

- No open CityGML or other 3D city model for Budapest turned up in the search.
- OSM building parts are the best open 3D data for the city found so far.

Sources:
- [MÁV-csoport GTFS registration](https://www.mavcsoport.hu/gtfs-igenybejelento)
- [eGov Hírlevél, 2016: MÁV-START timetable database free for developers](https://hirlevel.egov.hu/2016/10/11/a-mav-start-menetrendi-adatbazisa-dijmentesen-elerheto-minden-fejleszto-szamara/)
- [Transitland: BKK and MÁV-HÉV GTFS](https://www.transit.land/feeds/f-u2m-bkk)
- [Sonny's LiDAR DTMs of Europe](https://sonny.4lima.de/)
- [INSPIRE geoportal: Hungary elevation dataset record](https://inspire-geoportal.ec.europa.eu/srv/api/records/elddm5x5-b1a1-47f9-a635-a67a36423144)
- [awesome-citygml list of open 3D city models](https://github.com/OloOcki/awesome-citygml)
