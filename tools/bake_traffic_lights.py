#!/usr/bin/env python3
"""Traffic signals for the road traffic (traffic.js) and their poles.

    python3 tools/overpass.py tools/q_traffic_signals.ql data/raw/traffic_signals.json
    python3 tools/bake_traffic_lights.py        # -> web/data/traffic_lights.json

OSM maps a signal as a node on the road, often one per approach, so a big
junction has several within a few metres. Nodes within 28 m of each other
are merged into one junction (its middle), which then runs one cycle.
Stored as [lat, lon] pairs; the game places them in whichever line's frame
is loaded, as it does the trams.
"""
import json, math
els = json.load(open("data/raw/traffic_signals.json", encoding="utf-8"))["elements"]
pts = [(e["lat"], e["lon"]) for e in els if e["type"] == "node"]
M_LAT, M_LON = 111200.0, 75100.0
cell = {}
for la, lo in pts:
    cell.setdefault((int(la * M_LAT // 28), int(lo * M_LON // 28)), []).append((la, lo))
seen, out = set(), []
for k in list(cell):
    if k in seen: continue
    group, stack = [], [k]
    while stack:                                   # flood over touching cells
        c = stack.pop()
        if c in seen or c not in cell: continue
        seen.add(c); group += cell[c]
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                n = (c[0] + dx, c[1] + dy)
                if n not in seen and n in cell: stack.append(n)
    la = sum(p[0] for p in group) / len(group); lo = sum(p[1] for p in group) / len(group)
    r = max(math.hypot((p[0] - la) * M_LAT, (p[1] - lo) * M_LON) for p in group)
    out.append([round(la, 6), round(lo, 6), round(min(60, r + 6), 1)])
json.dump({"lights": out}, open("web/data/traffic_lights.json", "w"), separators=(",", ":"))
print(f"traffic lights: {len(pts)} signal nodes -> {len(out)} junctions")
