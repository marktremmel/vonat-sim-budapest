#!/usr/bin/env python3
"""Patches to route_line2.json that the bake does not make (rerunning
bake_route.py is not safe: see HISTORY). Safe to run again.

    python3 tools/patch_line2.py

- The Kopár-hágói vasúti alagút (OSM way 8060291, tunnel=yes, 780 m) between
  Szabadságliget and Klotildliget: stored as route.tunnels = [[m0, m1]]. The
  game had no tunnels; the line ran in an open cutting there (owner, Oct 2026).
- Pázmáneum, the stop for the Pázmány campus at Piliscsaba (OSM stop
  positions at km 28.91 and 29.04): added to route.stops. The timetable has
  no calls there, so only a hand-driven or automatic player train stops.
"""
import json
p = "web/data/route_line2.json"
r = json.load(open(p, encoding="utf-8"))
r["tunnels"] = [[27570, 28350]]
T = r["track_down"]
if not any(s["name"] == "Pázmáneum" for s in r["stops"]):
    m = 28975.0
    q = min(T, key=lambda t: abs(t[3] - m))
    tb = r.get("official_km_table") or []
    off = min(tb, key=lambda e: abs(e[0] - m)) if tb else None
    okm = round(off[1] + (m - off[0]) / 1000, 3) if off else round(m / 1000, 3)
    r["stops"].append({"name": "Pázmáneum", "km": m / 1000, "official_km": okm,
                       "xy": [round(q[0], 2), round(q[1], 2)], "h": round(q[2], 1)})
    r["stops"].sort(key=lambda s: s["km"])
json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("tunnels", r["tunnels"], "| stops", len(r["stops"]), [s["name"] for s in r["stops"] if 24 < s["km"] < 32])
