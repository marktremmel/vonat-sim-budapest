#!/usr/bin/env python3
"""Walls, retaining walls and noise barriers beside the line, from OSM, into
web/data/extras_<line>.json ("walls"), in the line's frame.

    python3 tools/bake_walls.py line2            # downloads, then bakes
    python3 tools/bake_walls.py line2 --cached   # bake from data/raw only

Owner, Oct 2026: graffiti "on the side wall before Aquincum and the next
stop, on small walls and on standing wagons". The game had no walls at all.
geom.js buildWalls draws them and puts graffiti on some.

Each wall: {"pts": [[x, y], ...], "h": metres, "k": 0 wall | 1 retaining |
2 noise barrier or steel/glass, "ng": 1 = no graffiti}. Only ways within 70 m of the down track, 4 m or longer.
"""
import json, math, os, subprocess, sys
sys.path.insert(0, "tools")
from geo import frame

LINE = sys.argv[1] if len(sys.argv) > 1 else "line2"
CACHED = "--cached" in sys.argv
SUF = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUF}.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
T = json.load(open(f"web/data/route{SUF}.json", encoding="utf-8"))["track_down"]
xy = lambda la, lo: ((lo - W["west"]) * MLON, (la - W["south"]) * MLAT)
ll = lambda x, y: (W["south"] + y / MLAT, W["west"] + x / MLON)

RAW = f"data/raw/walls_{LINE}.json"
if not CACHED or not os.path.exists(RAW):
    step = max(1, int(150 / ((T[-1][3] - T[0][3]) / (len(T) - 1))))
    poly = ",".join(f"{la:.5f},{lo:.5f}" for la, lo in (ll(p[0], p[1]) for p in T[::step] + [T[-1]]))
    q = f"""[out:json][timeout:600];
way(around:70,{poly})["barrier"~"^(wall|retaining_wall|noise_barrier|city_wall)$"];
out tags geom;"""
    ql = f"data/raw/q_walls_{LINE}.ql"
    open(ql, "w").write(q)
    subprocess.run([sys.executable, "tools/overpass.py", ql, RAW], check=True)

def height(t):
    try: return float(str(t.get("height", "")).replace(",", ".").split()[0])
    except (ValueError, IndexError): return None

KIND = {"wall": 0, "city_wall": 0, "retaining_wall": 1, "noise_barrier": 2}
DEF = {0: 2.0, 1: 2.4, 2: 3.5}
walls, total = [], 0.0
for e in json.load(open(RAW, encoding="utf-8"))["elements"]:
    if e["type"] != "way" or not e.get("geometry"): continue
    t = e.get("tags") or {}
    k = KIND.get(t.get("barrier"))
    if k is None: continue
    P = [[round(v, 1) for v in xy(p["lat"], p["lon"])] for p in e["geometry"]]
    L = sum(math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) for i in range(1, len(P)))
    if L < 4: continue
    h = height(t)
    if t.get("wall") == "noise_barrier" or t.get("material") in ("glass", "steel"): k = 2
    w = {"pts": P, "h": round(min(8.0, max(0.8, h if h else DEF[k])), 1), "k": k}
    # no graffiti on glass, or on a named wall (a monument: the Aquincum colonnade)
    if t.get("material") == "glass" or t.get("name") or t.get("historic"): w["ng"] = 1
    walls.append(w)
    total += L

path = f"web/data/extras{SUF}.json"
ex = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
ex["walls"] = walls
json.dump(ex, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{path}: {len(walls)} walls, {total / 1000:.1f} km; by kind {[sum(1 for w in walls if w['k'] == k) for k in (0, 1, 2)]}")
