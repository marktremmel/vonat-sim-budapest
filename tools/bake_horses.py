#!/usr/bin/env python3
"""Where horses stand (owner, Oct 2026: "horses around Piliscsév", "horses at Dorog").

    python3 tools/overpass.py tools/q_horses.ql data/raw/horses.json
    python3 tools/bake_horses.py           # -> web/data/horses.json

OSM's riding grounds, horse paddocks and equestrian pitches, as [lat, lon]
centres (one per place, places within 60 m merged). The game stands a few
horses round each (geom.js buildHorses), in whichever line's frame is loaded.
"""
import json, math
pts = []
for e in json.load(open("data/raw/horses.json", encoding="utf-8"))["elements"]:
    la = e.get("lat") or (e.get("center") or {}).get("lat"); lo = e.get("lon") or (e.get("center") or {}).get("lon")
    if la is None: continue
    if any(math.hypot((la - a) * 111200, (lo - b) * 75100) < 60 for a, b in pts): continue
    pts.append((la, lo))
json.dump({"places": [[round(a, 5), round(b, 5)] for a, b in pts]}, open("web/data/horses.json", "w"), separators=(",", ":"))
near = lambda la, lo, r: sum(1 for a, b in pts if math.hypot((a - la) * 111200, (b - lo) * 75100) < r)
print(f"horses: {len(pts)} places; within 4 km of Piliscsév {near(47.678, 18.815, 4000)}, of Dorog {near(47.720, 18.730, 4000)}")
