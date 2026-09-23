#!/usr/bin/env python3
"""Real station track layouts, built from OSM node topology rather than proximity.

The previous diagrams joined track centres that happened to sit near each other,
which drew roads that do not connect and broke roads that do. This builds the
actual graph — ways sharing a node id are joined, and nothing else is — then
reports the connected components so isolated track shows up as isolated track.
"""
import json, sys
from collections import defaultdict, Counter
sys.path.insert(0, "tools")
from geo import Chainer, load_tracks, haversine

tracks = load_tracks()
DOWN, UP = Chainer(tracks[0]["points"]), Chainer(tracks[1]["points"])
WAYS = json.load(open("data/raw/topology.json", encoding="utf-8"))["elements"]
NODES = json.load(open("data/raw/infra_nodes.json", encoding="utf-8"))["elements"]
NODE_TAGS = {n["id"]: n.get("tags", {}) for n in NODES}
STOPS = [s for s in json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
         if s["name"] != "Nyugati pályaudvar"]
L70_WAYS = {w["id"] for w in
            json.load(open("data/raw/line70.json", encoding="utf-8"))["elements"]
            if w["type"] == "way"}

HALF = 0.85     # km either side of the station centre
CORR = 150.0    # metres either side of the down line

class DSU:
    def __init__(self): self.p = {}
    def find(self, a):
        self.p.setdefault(a, a)
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]; a = self.p[a]
        return a
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[ra] = rb

def project(way):
    """Way geometry as (km, offset) in the diagram frame, plus node ids."""
    out = []
    for nid, p in zip(way.get("nodes", []), way.get("geometry", [])):
        ch, off, side = DOWN.snap(p["lat"], p["lon"])
        out.append((nid, ch / 1000.0, side * off))
    return out

def layout(name, km):
    lo, hi = km - HALF, km + HALF
    picked = []
    for w in WAYS:
        if not w.get("geometry") or len(w["geometry"]) < 2:
            continue
        pr = project(w)
        inside = [p for p in pr if lo <= p[1] <= hi and abs(p[2]) <= CORR]
        if len(inside) < 2:
            continue
        picked.append((w, pr))

    # connectivity by shared node id
    dsu = DSU()
    node_ways = defaultdict(list)
    for w, pr in picked:
        ids = [n for n, _, _ in pr]
        for a, b in zip(ids, ids[1:]):
            dsu.union(a, b)
        for n in ids:
            node_ways[n].append(w["id"])
    comps = defaultdict(list)
    for w, pr in picked:
        comps[dsu.find(pr[0][0])].append((w, pr))

    # rank components: the one containing the running lines is the main one
    def is_main(items):
        return any(w["id"] in L70_WAYS for w, _ in items)
    ordered = sorted(comps.values(), key=lambda it: (not is_main(it), -len(it)))

    # through roads near the centre, for numbering
    centres = []
    for w, pr in ordered[0] if ordered else []:
        near = [o for _, k, o in pr if abs(k - km) < 0.12]
        if near:
            centres.append((sum(near) / len(near), w))
    centres.sort(key=lambda c: c[0])
    roads, last = [], None
    for off, w in centres:
        if last is not None and abs(off - last) < 3.2:
            continue
        last = off
        roads.append({"offset_m": round(off, 1),
                      "service": w.get("tags", {}).get("service"),
                      "electrified": w.get("tags", {}).get("electrified"),
                      "line_ref": w.get("tags", {}).get("ref")})
    for i, r in enumerate(roads, 1):
        r["road"] = i          # synthetic vágány number, 1..n across the formation

    stubs = sum(1 for n, ws in node_ways.items()
                if NODE_TAGS.get(n, {}).get("railway") == "buffer_stop")
    return {
        "name": name, "km": km,
        "ways": len(picked),
        "components": len(ordered),
        "main_component_ways": len(ordered[0]) if ordered else 0,
        "isolated_ways": sum(len(c) for c in ordered[1:]),
        "buffer_stops": stubs,
        "roads": roads,
        "_geom": [[{"km": round(k, 4), "off": round(o, 2)} for _, k, o in pr
                   if lo - 0.05 <= k <= hi + 0.05]
                  for c in ordered for w, pr in c],
        "_comp_of": [ci for ci, c in enumerate(ordered) for _ in c],
        "_tags": [{"service": w.get("tags", {}).get("service"),
                   "railway": w.get("tags", {}).get("railway"),
                   "usage": w.get("tags", {}).get("usage"),
                   "ref": w.get("tags", {}).get("ref"),
                   "main": w["id"] in L70_WAYS}
                  for c in ordered for w, pr in c],
    }

def main():
    picks = ["Rákosrendező", "Rákospalota-Újpest", "Dunakeszi", "Göd",
             "Vác-Alsóváros", "Vác", "Verőce", "Kismaros",
             "Nagymaros-Visegrád", "Nagymaros", "Zebegény", "Szob"]
    out = {}
    for name in picks:
        s = next((x for x in STOPS if x["name"] == name), None)
        if not s:
            continue
        out[name] = layout(name, s["km"])

    json.dump(out, open("data/layouts.json", "w", encoding="utf-8"),
              ensure_ascii=False)

    print(f"{'station':22s} {'ways':>5} {'comps':>6} {'main':>5} {'orphan':>7} "
          f"{'buffers':>8} {'roads':>6}")
    for name, L in out.items():
        print(f"{name:22s} {L['ways']:5d} {L['components']:6d} "
              f"{L['main_component_ways']:5d} {L['isolated_ways']:7d} "
              f"{L['buffer_stops']:8d} {len(L['roads']):6d}")

    print("\nnumbered roads across the formation (synthetic, 1 = rightmost facing Szob):")
    for name, L in out.items():
        if len(L["roads"]) < 2:
            continue
        r = "  ".join(f"{x['road']}@{x['offset_m']:+.0f}m" for x in L["roads"])
        print(f"  {name:22s} {r}")
    print("\nwrote data/layouts.json")

main()
