#!/usr/bin/env python3
"""The Budapest city layer: bake it, then cut it into 1 km tiles.

    ./tools/fetch_city.sh                 # data/raw/city/city_*.json (9 pieces)
    python3 tools/bake_city.py            # web/data/city/index.json + tiles
    # then rebake the line contexts, which now leave the city box to the tiles:
    python3 tools/bake_context.py; python3 tools/bake_context.py line2; ...

Step one runs bake_context.py with CITY=1: every building, building part and
road inside the city box (47.39–47.58 N, 18.93–19.25 E), classified exactly as
the line contexts are, in line 70's frame, into web/data/city_all.json.

Step two cuts that into tiles of 0.009° × 0.0133° (about 1 × 1 km) by each
item's centre. A tile's coordinates are metres from its own south-west corner
in line 70's frame, and the index carries line 70's metres-per-degree, so the
browser can place a tile in ANY line's frame: x = (lon0 − west)·mlon_line +
dx·mlon_line / mlon_70 (web/src/city.js). Buildings are all polygons in the
tiles (a box becomes a four-point footprint), so a tile is one mesh.
"""
import base64, json, math, os, struct, subprocess, sys
sys.path.insert(0, "tools")
from geo import frame

if "--split-only" not in sys.argv:
    env = dict(os.environ, CITY="1")
    r = subprocess.run([sys.executable, "tools/bake_context.py", "line70"], env=env)
    if r.returncode:
        raise SystemExit("bake_context CITY=1 failed")

W = json.load(open("web/data/world.json", encoding="utf-8"))["near"]
MLAT, MLON = frame((W["south"] + W["north"]) / 2)
C = json.load(open("web/data/city_all.json", encoding="utf-8"))
S, WEST, N, E = 47.39, 18.93, 47.58, 19.25
DLAT, DLON = 0.009, 0.0133

def latlon(x, y):
    return (y / MLAT + W["south"], x / MLON + W["west"])

def tile_of(x, y):
    la, lo = latlon(x, y)
    return int((la - S) // DLAT), int((lo - WEST) // DLON)

def origin(i, j):
    la0, lo0 = S + i * DLAT, WEST + j * DLON
    return la0, lo0, (lo0 - W["west"]) * MLON, (la0 - W["south"]) * MLAT

tiles = {}
def T(k):
    if k not in tiles:
        tiles[k] = {"polys": bytearray(), "np": 0, "roads": bytearray(), "nr": 0, "ids": [],
                    "parts": [], "portals": []}
    return tiles[k]

# boxes -> four-point polygons (hipped unless flat)
B = base64.b64decode(C["buildings"]["data"])
for i in range(C["buildings"]["count"]):
    x, y, hu, hv, rot, h, cls, flat = struct.unpack_from("<ffHHHHBB", B, i * 18)
    hu, hv, ang, h = hu / 10, hv / 10, rot / 65535 * math.pi, h / 10
    k = tile_of(x, y); _, _, ox, oy = origin(*k)
    ca, sa = math.cos(ang), math.sin(ang)
    pts = [(u * hu * ca - v * hv * sa, u * hu * sa + v * hv * ca) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = T(k)
    rtype = 0 if flat else 1
    rh = 0 if flat else min(4.5, max(1.8, h * 0.28))
    t["polys"] += struct.pack("<ffHBBBBH", x - ox, y - oy, min(65535, int(h * 10)), cls, rtype, 4, 2, int(rh * 100))
    for px, py in pts:
        t["polys"] += struct.pack("<hh", int(px * 10), int(py * 10))
    t["polys"] += bytes((0, 1, 2, 0, 2, 3))
    t["np"] += 1

# polygons, re-based to their tile
P = base64.b64decode(C["polys"]["data"])
o = 0
for i in range(C["polys"]["count"]):
    cx, cy, h, cls, roof, n, nt, rh = struct.unpack_from("<ffHBBBBH", P, o)
    size = 16 + 4 * n + 3 * nt
    k = tile_of(cx, cy); _, _, ox, oy = origin(*k)
    t = T(k)
    t["polys"] += struct.pack("<ff", cx - ox, cy - oy) + P[o + 8:o + size]
    t["np"] += 1
    o += size

# parts
for p in C.get("parts", []):
    k = tile_of(p["x"], p["y"]); _, _, ox, oy = origin(*k)
    q = dict(p, x=round(p["x"] - ox, 2), y=round(p["y"] - oy, 2))
    T(k)["parts"].append(q)

# roads: a way goes to the tile of its middle point, whole
R = base64.b64decode(C["roads"]["data"])
ids = C["roads"].get("ids", [])
o = 0
for i in range(C["roads"]["count"]):
    cls, br, lanes, one, n = struct.unpack_from("<BBBBH", R, o)
    pts = [struct.unpack_from("<ff", R, o + 6 + 8 * m) for m in range(n)]
    o += 6 + 8 * n
    mx, my = pts[len(pts) // 2]
    k = tile_of(mx, my); _, _, ox, oy = origin(*k)
    t = T(k)
    t["roads"] += struct.pack("<BBBBH", cls, br, lanes, one, n)
    for x, y in pts:
        t["roads"] += struct.pack("<ff", x - ox, y - oy)
    t["nr"] += 1
    t["ids"].append(ids[i] if i < len(ids) else 0)

# tunnel portals
for a in C.get("landmarks", []):
    k = tile_of(a["x"], a["y"]); _, _, ox, oy = origin(*k)
    T(k)["portals"].append(dict(a, x=round(a["x"] - ox, 2), y=round(a["y"] - oy, 2)))

os.makedirs("web/data/city", exist_ok=True)
for f in os.listdir("web/data/city"):
    if f.startswith("t_"):
        os.remove(os.path.join("web/data/city", f))
index = {"box": [S, WEST, N, E], "dlat": DLAT, "dlon": DLON, "mlat70": MLAT, "mlon70": MLON,
         "widths": C["roads"]["widths"], "tiles": []}
total = 0
for (i, j), t in sorted(tiles.items()):
    if i < 0 or j < 0:
        continue
    la0, lo0, _, _ = origin(i, j)
    name = f"t_{i}_{j}.json"
    body = {"lat0": la0, "lon0": lo0,
            "polys": {"count": t["np"], "data": base64.b64encode(bytes(t["polys"])).decode()},
            "roads": {"count": t["nr"], "ids": t["ids"], "data": base64.b64encode(bytes(t["roads"])).decode()},
            "parts": t["parts"], "portals": t["portals"]}
    json.dump(body, open(f"web/data/city/{name}", "w"), separators=(",", ":"))
    sz = os.path.getsize(f"web/data/city/{name}")
    total += sz
    index["tiles"].append({"i": i, "j": j, "lat0": la0, "lon0": lo0, "file": name,
                           "n": t["np"], "kb": round(sz / 1024)})
json.dump(index, open("web/data/city/index.json", "w"), separators=(",", ":"))
print(f"city: {len(index['tiles'])} tiles, {sum(t['n'] for t in index['tiles'])} buildings, "
      f"{total / 1e6:.1f} MB")
