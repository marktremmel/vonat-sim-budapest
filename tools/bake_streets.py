#!/usr/bin/env python3
"""Bake authentic Budapest and regional street/square names with coordinates.
Extracts named highways from raw context files into a compact spatial index.
Output: web/data/streets.json (~175 KB)
"""
import glob
import json
import os

def bake_streets():
    streets = {}
    raw_files = sorted(glob.glob("data/raw/context*.json"))
    for fn in raw_files:
        try:
            with open(fn, encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            continue
        nodes = {e["id"]: (e["lat"], e["lon"]) for e in d.get("elements", []) if e.get("type") == "node" and "lat" in e}
        for e in d.get("elements", []):
            if e.get("type") != "way":
                continue
            tags = e.get("tags", {})
            name = tags.get("name")
            if not name or "highway" not in tags:
                continue
            name = name.strip()
            # Filter non-street names or placeholder tags
            if len(name) < 3 or name.lower() in ("út", "utca", "tér", "köz"):
                continue
            coords = [nodes[nid] for nid in e.get("nodes", []) if nid in nodes]
            if not coords:
                continue
            if name not in streets:
                streets[name] = []
            # Sample start, middle, and end of the way
            step = max(1, len(coords) // 3)
            for i in range(0, len(coords), step):
                streets[name].append(coords[i])

    name_list = sorted(list(streets.keys()))
    name_to_idx = {n: i for i, n in enumerate(name_list)}
    pts_list = []
    for name in name_list:
        pts = streets[name]
        clean_pts = []
        for p in pts:
            if not any(abs(p[0] - q[0]) < 0.00035 and abs(p[1] - q[1]) < 0.0005 for q in clean_pts):
                clean_pts.append([round(p[0], 5), round(p[1], 5)])
        idx = name_to_idx[name]
        for pt in clean_pts[:6]:
            pts_list.append([idx, pt[0], pt[1]])

    out = {"names": name_list, "pts": pts_list}
    os.makedirs("web/data", exist_ok=True)
    out_path = "web/data/streets.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Baked {len(name_list)} unique streets, {len(pts_list)} sample points -> {out_path} ({os.path.getsize(out_path)//1024} KB)")

if __name__ == "__main__":
    bake_streets()
