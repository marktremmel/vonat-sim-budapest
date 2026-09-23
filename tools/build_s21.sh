#!/bin/sh
# S21 (Budapest-Nyugati – Kőbánya-Kispest – Ócsa – Dabas – Lajosmizse), from
# scratch, like build_line2.sh. The OSM route relation (14995078) runs on to
# Kecskemét; LINE_ENDS stops the sim's line at Lajosmizse.
set -e
python3 tools/overpass.py tools/q_s21.ql            data/raw/s21.json
python3 tools/overpass.py tools/q_s21_signals.ql    data/raw/s21_signals.json
python3 tools/overpass.py tools/q_s21_rails.ql      data/raw/s21_rails.json
python3 tools/overpass.py tools/q_s21_extras.ql     data/raw/s21_extras.json
python3 tools/overpass.py tools/q_s21_context_a.ql  data/raw/context_s21_a.json   # in two halves: one
python3 tools/overpass.py tools/q_s21_context_b.ql  data/raw/context_s21_b.json   # query times out
python3 -c "import json; a=json.load(open('data/raw/context_s21_a.json'))['elements']+json.load(open('data/raw/context_s21_b.json'))['elements']; s=set(); o=[e for e in a if (e['type'],e['id']) not in s and not s.add((e['type'],e['id']))]; json.dump({'elements':o}, open('data/raw/context_s21_osm.json','w'))"
python3 tools/overpass.py tools/q_s21_landcover.ql  data/raw/landcover_s21.json
python3 tools/fetch_terrain.py 12                   # bounds reach 46.70 N, 19.98 E
LINE_ENDS="47.5104535,19.0568814;47.0262,19.5452" python3 tools/line_alignment.py s21
rm -f data/raw/height_near_dsm_s21.png
python3 tools/bake_world.py s21
python3 tools/ground_filter.py s21
# the water fit leans on the lakes of the plain; the Danube at Budapest is ~96.5 m
python3 -c "import json; p='web/data/world_s21.json'; w=json.load(open(p)); w['water']={'a':96.5,'b':0.0}; json.dump(w,open(p,'w'))"
python3 tools/bake_route.py s21
python3 tools/bake_context.py s21
python3 tools/bake_map.py s21
python3 tools/line_runtimes.py s21
LINE=s21 python3 tools/bake_timetable.py
python3 tools/build_sim.py
