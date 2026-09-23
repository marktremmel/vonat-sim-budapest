#!/bin/sh
# Line 2 (Budapest-Nyugati – Pilisvörösvár – Esztergom), from scratch.
# Run from szob-fele/. Every step writes only line-2 files (suffix _line2);
# line 70's data is not touched. To add another line, copy this and the
# q_line2_*.ql queries with that line's OSM relation id.
set -e
# downloads (Overpass; each query is a few MB to ~40 MB)
python3 tools/overpass.py tools/q_line2.ql            data/raw/line2.json
python3 tools/overpass.py tools/q_line2_context.ql    data/raw/context_line2_osm.json
python3 tools/overpass.py tools/q_line2_west.ql       data/raw/landcover_line2.json
python3 tools/overpass.py tools/q_line2_extras.ql     data/raw/line2_extras.json
python3 tools/overpass.py tools/q_line2_signals.ql    data/raw/line2_signals.json
python3 tools/overpass.py tools/q_line2_rails.ql      data/raw/line2_rails.json     # loops and sidings
python3 tools/overpass.py tools/q_building_parts.ql  data/raw/building_parts.json  # OSM 3D parts
python3 tools/overpass.py tools/q_line2_esztergom.ql  data/raw/esztergom_osm.json
python3 tools/overpass.py tools/q_landmark_ways.ql     data/raw/landmark_ways.json   # bridges, Parliament, Bazilika
python3 tools/fetch_terrain.py 12                    # cached tiles are skipped
# derived
python3 tools/line_alignment.py line2    # one path + Nyugati prefix, profile
rm -f data/raw/height_near_dsm_line2.png
python3 tools/bake_world.py line2        # heightmaps, land cover, water fit
python3 tools/ground_filter.py line2     # take the roofs out of the DEM
python3 tools/bake_route.py line2        # stops, signals, crossings, km table
python3 tools/bake_context.py line2      # buildings, roads, landmarks
python3 tools/bake_map.py line2          # inset map
python3 tools/line_runtimes.py line2     # S72 / Z72 running times
LINE=line2 python3 tools/bake_timetable.py
python3 tools/build_sim.py
