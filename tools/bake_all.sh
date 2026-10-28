#!/bin/sh
# Rebake every building layer after a rule change in tools/bake_context.py
# or tools/facade_zones.json: the Budapest city tiles, then each line's
# context (which leaves the city box to the tiles). Run from szob-fele/.
#
#     sh tools/bake_all.sh            # about 5 minutes
#
# Each step's log goes to data/bake_logs/; the façade-zone counts (buildings
# per zone and family) are printed at the end of each. Then rebuild:
# python3 tools/build_sim.py. The downloads (data/raw) are not touched.
set -e
mkdir -p data/bake_logs
step() {
  name=$1; shift
  printf '%-10s ' "$name"
  start=$(date +%s)
  "$@" > "data/bake_logs/$name.log" 2>&1 || { echo "FAILED, see data/bake_logs/$name.log"; exit 1; }
  echo "$(( $(date +%s) - start )) s, $(grep -c '' "data/bake_logs/$name.log") log lines"
}
step city    python3 tools/bake_city.py       # bake_context CITY=1, the tiles, city extras, cadastre trees
step line70  python3 tools/bake_context.py line70
step line2   python3 tools/bake_context.py line2
step s21     python3 tools/bake_context.py s21
step streams python3 tools/bake_streams.py     # streams and ditches (data/raw/streams.json, tools/q_streams.ql)
step streetb python3 tools/bake_streetbits.py  # stops, shelters, bins, fences (data/raw/streetbits_*.json)
for f in city line70 line2 s21; do
  echo "== $f"
  sed -n '/^façade zones/,/^[^ ]/p' "data/bake_logs/$f.log" | grep '^  ' | head -60
done
