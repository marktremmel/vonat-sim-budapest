#!/usr/bin/env python3
"""The line's real platforms and the footbridges over it, from OSM, into
web/data/extras_<line>.json ("platforms", "footbridges"), in the line's frame.

    python3 tools/bake_platforms.py s21            # downloads, then bakes
    python3 tools/bake_platforms.py s21 --cached   # bake from data/raw only

Until now every station got the same generic slab (0.55 m high, one side,
165 m); Kispest is really a low island between the two tracks with a steel
footbridge over the line (owner's photos, 26 Sep 2026). OSM maps platforms as
a line along the platform's middle or as a closed area, often with `height`
(0.15 at Kispest). geom.js buildOsmPlatforms decides the width from the tracks
either side, so an island fills the gap between them and a side platform gets
a standard width.

Each platform: {"pts": [[x, y], ...], "closed": 0|1, "h": height or null,
"name": ...}. Each footbridge: {"pts": [[x, y], ...], "kind": "footway"|...}.
Only ways within 40 m of the down track are kept.
"""
import json, math, os, subprocess, sys
sys.path.insert(0, "tools")
from geo import frame

LINE = sys.argv[1] if len(sys.argv) > 1 else "s21"
CACHED = "--cached" in sys.argv
SUF = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUF}.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
R = json.load(open(f"web/data/route{SUF}.json", encoding="utf-8"))
T = R["track_down"]
xy = lambda la, lo: ((lo - W["west"]) * MLON, (la - W["south"]) * MLAT)
ll = lambda x, y: (W["south"] + y / MLAT, W["west"] + x / MLON)

RAW = f"data/raw/platforms_{LINE}.json"
if not CACHED or not os.path.exists(RAW):
    # the line as a polyline for Overpass `around`, a point every ~150 m
    step = max(1, int(150 / ((T[-1][3] - T[0][3]) / (len(T) - 1))))
    poly = ",".join(f"{la:.5f},{lo:.5f}" for la, lo in (ll(p[0], p[1]) for p in T[::step] + [T[-1]]))
    q = f"""[out:json][timeout:600];
(
  way(around:45,{poly})["railway"="platform"];
  way(around:45,{poly})["public_transport"="platform"]["train"="yes"];
  way(around:45,{poly})["highway"~"^(footway|path|cycleway|steps|pedestrian)$"]["bridge"];
);
out tags geom;"""
    ql = f"data/raw/q_platforms_{LINE}.ql"
    open(ql, "w").write(q)
    subprocess.run([sys.executable, "tools/overpass.py", ql, RAW], check=True)

# distance to the down track, through a coarse grid
CELL = 50
grid = {}
for i, p in enumerate(T):
    grid.setdefault((int(p[0] // CELL), int(p[1] // CELL)), []).append(i)
def dist(x, y):
    best = 1e9
    cx, cy = int(x // CELL), int(y // CELL)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for i in grid.get((cx + dx, cy + dy), ()):
                best = min(best, math.hypot(T[i][0] - x, T[i][1] - y))
    return best

def height(t):
    try: return float(str(t.get("height", "")).replace(",", ".").split()[0])
    except (ValueError, IndexError): return None

plats, bridges, seen = [], [], set()
for e in json.load(open(RAW, encoding="utf-8"))["elements"]:
    if e["type"] != "way" or e["id"] in seen or not e.get("geometry"): continue
    seen.add(e["id"])
    t = e.get("tags") or {}
    pts = [xy(p["lat"], p["lon"]) for p in e["geometry"]]
    if min(dist(x, y) for x, y in pts) > 40: continue
    P = [[round(x, 1), round(y, 1)] for x, y in pts]
    if t.get("railway") == "platform" or t.get("public_transport") == "platform":
        closed = len(P) > 3 and math.hypot(P[0][0] - P[-1][0], P[0][1] - P[-1][1]) < 0.5
        plats.append({"pts": P, "closed": int(closed), "h": height(t), "name": t.get("name") or t.get("ref") or ""})
    elif t.get("bridge") and t.get("bridge") != "no":
        # a bridge that crosses the line (one end each side), not a path beside it
        L = sum(math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) for i in range(1, len(P)))
        if L < 8 or L > 400: continue
        bridges.append({"pts": P, "kind": t.get("highway"), "layer": t.get("layer", "1")})

path = f"web/data/extras{SUF}.json"
ex = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
ex["platforms"], ex["footbridges"] = plats, bridges
json.dump(ex, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{path}: {len(plats)} platforms ({sum(p['closed'] for p in plats)} areas), {len(bridges)} footbridges")
