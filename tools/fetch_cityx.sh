#!/bin/sh
# The city's extras (rails, industry, power, solar, labels), nine pieces.
for q in 00 01 02 10 11 12 20 21 22; do
  f=data/raw/cityx/cityx_$q.json
  [ -s "$f" ] || python3 tools/overpass.py tools/q_cityx_$q.ql "$f"
done
