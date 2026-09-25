#!/usr/bin/env python3
"""Named places, quarries, solar farms and pipelines along a line
(q_linex_<line>.ql → data/raw/linex_<line>.json), baked to
web/data/extras_<line>.json in the line's own frame, in the layout the city
tiles' `x` layer uses (bake_cityx.py), so one renderer draws both.

    python3 tools/bake_linex.py line2
"""
import json, sys
sys.path.insert(0, "tools")
from geo import frame

LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
SUF = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUF}.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
xy = lambda la, lo: [round((lo - W["west"]) * MLON, 1), round((la - W["south"]) * MLAT, 1)]
CITY = (47.39, 18.93, 47.58, 19.25)      # the city tiles carry their own


def label_rank(t):
    """1: seen from far (viewpoints, castles, quarries, towers, attractions);
    2: named works and institutions; 3: close only (memorials, churches)."""
    if t.get("tourism") in ("viewpoint", "attraction", "museum", "zoo", "theme_park", "alpine_hut") \
       or t.get("historic") in ("castle", "ruins", "archaeological_site") \
       or t.get("landuse") == "quarry" or t.get("man_made") in ("tower", "water_tower", "communications_tower"):
        return 1
    if t.get("historic") in ("memorial", "monument", "wayside_cross", "wayside_shrine") or t.get("amenity") == "place_of_worship":
        return 3
    return 2
def ring_area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2

out = {"labels": [], "solar": [], "pipes": [], "rails": [], "structs": []}
# oil wells (q_wells.ql → data/raw/wells.json): pumpjacks, structures.js class 9,
# where they fall in this line's near window (OSM maps 32 in the region)
import os
if os.path.exists("data/raw/wells.json"):
    for e in json.load(open("data/raw/wells.json", encoding="utf-8"))["elements"]:
        la = e.get("lat") or (e.get("center") or {}).get("lat"); lo = e.get("lon") or (e.get("center") or {}).get("lon")
        if la is None: continue
        if not (W["south"] <= la <= W["north"] and W["west"] <= lo <= W["east"]): continue
        out["structs"].append(xy(la, lo) + [7.0, 3.0, 9])
seen = set()
for e in json.load(open(f"data/raw/linex_{LINE}.json", encoding="utf-8"))["elements"]:
    t = e.get("tags") or {}
    g = e.get("geometry") or []
    if e["type"] == "node": la, lo = e["lat"], e["lon"]
    elif g: la, lo = sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g)
    else: continue
    incity = CITY[0] <= la < CITY[2] and CITY[1] <= lo < CITY[3]
    flat = [c for p in g for c in xy(p["lat"], p["lon"])]
    if t.get("power") in ("plant", "generator"):
        # a farm, not the panels on a roof
        if not incity and len(g) > 3 and ring_area([xy(p["lat"], p["lon"]) for p in g]) > 1500: out["solar"].append(flat)
        continue
    if t.get("man_made") == "pipeline":
        if not incity: out["pipes"].append(flat)
        continue
    name = t.get("name")
    if t.get("landuse") == "quarry":
        name = name or "kőbánya"
        if name == "kőbánya" and len(g) < 12: continue          # small anonymous pits: no label
    if not name or incity or name in seen: continue
    seen.add(name)
    kind = "landmark" if (t.get("tourism") or t.get("historic") or t.get("man_made") or t.get("landuse") == "quarry") else "public"
    out["labels"].append([name, kind] + xy(la, lo) + [label_rank(t)])
json.dump(out, open(f"web/data/extras{SUF}.json", "w"), separators=(",", ":"))
print(LINE, {k: len(v) for k, v in out.items()})
