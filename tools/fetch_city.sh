#!/bin/sh
# The Budapest city layer's download, in nine pieces (one query for the whole
# box does not come back). Skips pieces already downloaded.
for q in 00 01 02 10 11 12 20 21 22; do
  f=data/raw/city/city_$q.json
  [ -s "$f" ] || python3 tools/overpass.py tools/q_city_$q.ql "$f"
done
