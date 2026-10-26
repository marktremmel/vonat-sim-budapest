#!/usr/bin/env python3
"""Street furniture beside the line, from OSM, into web/data/extras_<line>.json
("street"), in the line's frame.

    python3 tools/bake_street.py line70            # downloads, then bakes
    python3 tools/bake_street.py line70 --cached

Benches, litter bins, vending machines and low fences within 150 m of the
down track: [x, y, kind, direction] each, kind 0 bench, 1 bin, 2 vending
machine; direction is OSM's `direction` in degrees (0 north, clockwise) or -1.
main.js stands a model from tools/bake_props.py on each.
"""
import json, math, os, subprocess, sys
sys.path.insert(0, "tools")
from geo import frame

LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
CACHED = "--cached" in sys.argv
SUF = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUF}.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
T = json.load(open(f"web/data/route{SUF}.json", encoding="utf-8"))["track_down"]
xy = lambda la, lo: ((lo - W["west"]) * MLON, (la - W["south"]) * MLAT)
ll = lambda x, y: (W["south"] + y / MLAT, W["west"] + x / MLON)

RAW = f"data/raw/street_{LINE}.json"
if not CACHED or not os.path.exists(RAW):
    step = max(1, int(150 / ((T[-1][3] - T[0][3]) / (len(T) - 1))))
    poly = ",".join(f"{la:.5f},{lo:.5f}" for la, lo in (ll(p[0], p[1]) for p in T[::step] + [T[-1]]))
    q = f"""[out:json][timeout:600];
(
  node(around:150,{poly})["amenity"~"^(bench|waste_basket|vending_machine)$"];
);
out;"""
    ql = f"data/raw/q_street_{LINE}.ql"
    open(ql, "w").write(q)
    subprocess.run([sys.executable, "tools/overpass.py", ql, RAW], check=True)

CARD = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}
def direction(t):
    d = str(t.get("direction", "")).strip().upper()
    if d in CARD: return CARD[d]
    try: return round(float(d)) % 360
    except ValueError: return -1

KIND = {"bench": 0, "waste_basket": 1, "vending_machine": 2}
out = []
for e in json.load(open(RAW, encoding="utf-8"))["elements"]:
    t = e.get("tags") or {}
    k = KIND.get(t.get("amenity"))
    if k is None or "lat" not in e: continue
    x, y = xy(e["lat"], e["lon"])
    out.append([round(x, 1), round(y, 1), k, direction(t)])
path = f"web/data/extras{SUF}.json"
ex = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
ex["street"] = out
json.dump(ex, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"{path}: {len(out)} pieces; benches, bins, vending: {[sum(1 for o in out if o[2] == k) for k in (0, 1, 2)]}; with a direction {sum(1 for o in out if o[3] >= 0)}")
