#!/usr/bin/env python3
"""Stitch OSM water multipolygons into closed rings for the plan map."""
import json

def rings(min_nodes=40):
    out = []
    for e in json.load(open("data/raw/water.json", encoding="utf-8"))["elements"]:
        if e["type"] == "way" and e.get("geometry"):
            g = [(p["lat"], p["lon"]) for p in e["geometry"]]
            if len(g) >= min_nodes:
                out.append(g)
        elif e["type"] == "relation":
            segs = [[(p["lat"], p["lon"]) for p in m["geometry"]]
                    for m in e.get("members", [])
                    if m.get("geometry") and m.get("role") in ("outer", "", None)]
            out.extend(r for r in stitch(segs) if len(r) >= min_nodes)
    return out

def stitch(segs, tol=1e-7):
    """Join way fragments end to end into rings; drop what will not close."""
    segs = [list(s) for s in segs if len(s) > 1]
    rings, cur = [], None
    while segs:
        if cur is None:
            cur = segs.pop(0)
            continue
        tail, joined = cur[-1], False
        for i, s in enumerate(segs):
            if abs(s[0][0] - tail[0]) < tol and abs(s[0][1] - tail[1]) < tol:
                cur.extend(s[1:]); segs.pop(i); joined = True; break
            if abs(s[-1][0] - tail[0]) < tol and abs(s[-1][1] - tail[1]) < tol:
                cur.extend(s[-2::-1]); segs.pop(i); joined = True; break
        if not joined:
            rings.append(cur); cur = None
    if cur:
        rings.append(cur)
    return rings
