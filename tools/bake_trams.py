#!/usr/bin/env python3
"""Budapest's tram routes for trams.js.

    python3 tools/overpass.py tools/q_trams.ql data/raw/trams.json
    python3 tools/bake_trams.py            # -> web/data/trams.json

Each OSM route relation (one per direction, PTv2) is chained from its way
members in order into one polyline; its stop positions are projected onto it
and kept as distances along it. The members carry no way tags, so trams.js finds
bridges itself (track over the river's cover). Coordinates stay in lat/lon: every line has its own
frame, and trams.js places them in whichever is loaded (as city.js does).
"""
import json, math

REFS = {"1", "2", "3", "4", "6", "56", "61"}
els = json.load(open("data/raw/trams.json", encoding="utf-8"))["elements"]

def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111200, (a[1] - b[1]) * 75100)

routes = []
for r in els:
    if r["type"] != "relation": continue
    t = r.get("tags") or {}
    if t.get("ref") not in REFS: continue
    ways = [m for m in r.get("members", []) if m["type"] == "way" and m.get("role", "") in ("", "forward", "backward")
            and m.get("geometry")]
    if not ways: continue
    chain, first = [], 0
    for m in ways:
        pts = [(p["lat"], p["lon"]) for p in m["geometry"] if p]
        if len(pts) < 2: continue
        if not chain:
            chain, first = list(pts), len(pts)
            continue
        # the first way's direction is only known once the second joins it
        if len(chain) == first and min(dist(chain[0], pts[0]), dist(chain[0], pts[-1])) < \
                                   min(dist(chain[-1], pts[0]), dist(chain[-1], pts[-1])):
            chain.reverse()
        e = chain[-1]
        if dist(pts[-1], e) < dist(pts[0], e): pts = pts[::-1]
        if dist(e, pts[0]) > 60:     # a gap in the relation: keep the longer piece
            if len(pts) > len(chain): chain, first = list(pts), -1
            continue
        chain += pts[1:]
    if len(chain) < 2: continue
    cum = [0.0]
    for i in range(1, len(chain)): cum.append(cum[-1] + dist(chain[i - 1], chain[i]))
    stops = []
    for m in r.get("members", []):
        if m["type"] != "node" or not m.get("role", "").startswith("stop"): continue
        p = (m["lat"], m["lon"])
        best = min(range(len(chain)), key=lambda i: dist(chain[i], p))
        if dist(chain[best], p) < 40: stops.append(round(cum[best], 1))
    stops = sorted(set(stops))
    routes.append({"ref": t["ref"], "name": t.get("name", ""), "to": t.get("to", ""),
                   "len": round(cum[-1], 1),
                   "pts": [[round(a, 6), round(b, 6)] for a, b in chain], "stops": stops})
# the full runs only (both directions); short workings (a 4 to Mester utca)
# would double the trams on part of the line
longest = {}
for q in routes: longest[q["ref"]] = max(longest.get(q["ref"], 0), q["len"])
routes = [q for q in routes if q["len"] >= 0.85 * longest[q["ref"]]]
routes.sort(key=lambda q: (len(q["ref"]), q["ref"]))
json.dump({"routes": routes}, open("web/data/trams.json", "w"), separators=(",", ":"))
for q in routes:
    print(f"  {q['ref']:>3}  {q['len'] / 1000:5.2f} km  {len(q['stops']):2d} stops  → {q['to']}")
print(f"trams: {len(routes)} routes")
