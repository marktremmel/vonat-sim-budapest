#!/usr/bin/env python3
"""Adds what OSM says about each level crossing's lights to the baked routes,
in place (re-running bake_route.py for line 70 moves its stops: CLAUDE.md,
fifth pass).

    python3 tools/patch_crossings.py

Each crossing in web/data/route{,_line2,_s21}.json gets "light": "yes" or
"no" when the OSM node nearest to it along the line (within 4 m of chainage,
30 m off the track) has crossing:light, and "saltire" likewise. Crossings
with no tag are left without the key; the simulator draws the Hungarian
light signal at those too (main lines in Hungary are nearly all lit), and
only the St Andrew's cross where the tag says light=no.
"""
import json, sys
sys.path.insert(0, "tools")
from geo import Chainer

LINES = [("route.json", "data/alignment.json", "line70_down", "data/raw/infra_nodes.json"),
         ("route_line2.json", "data/alignment_line2.json", "line2_down", "data/raw/line2_extras.json"),
         ("route_s21.json", "data/alignment_s21.json", "s21_down", "data/raw/s21_extras.json")]

for route, align, tid, raw in LINES:
    t = next(t for t in json.load(open(align))["tracks"] if t["id"] == tid)
    ch = Chainer(t["points"])
    nodes = []
    for e in json.load(open(raw))["elements"]:
        tg = e.get("tags") or {}
        if tg.get("railway") != "level_crossing" or "lat" not in e:
            continue
        m, off, _ = ch.snap(e["lat"], e["lon"])
        if off < 30:
            nodes.append((m, tg))
    path = "web/data/" + route
    txt = open(path, encoding="utf-8").read()
    r = json.loads(txt)
    n = {"yes": 0, "no": 0}
    for x in r.get("crossings", []):
        best = min(nodes, key=lambda q: abs(q[0] - x["m"]), default=None)
        x.pop("light", None); x.pop("saltire", None)
        if not best or abs(best[0] - x["m"]) > 4:
            continue
        for k in ("light", "saltire"):
            v = best[1].get("crossing:" + k)
            if v in ("yes", "no"):
                x[k] = v
        if "light" in x:
            n[x["light"]] += 1
    json.dump(r, open(path, "w", encoding="utf-8"), separators=(",", ":"),
              ensure_ascii="\\u0" in txt)        # (written the way it was: line 70's is escaped)
    print(f"{route}: {len(r.get('crossings', []))} crossings, light yes {n['yes']}, no {n['no']}, untagged "
          f"{len(r.get('crossings', [])) - n['yes'] - n['no']}")
