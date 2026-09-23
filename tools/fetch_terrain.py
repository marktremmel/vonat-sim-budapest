#!/usr/bin/env python3
"""Download AWS terrarium elevation tiles covering the Danube Bend.

Terrarium PNGs encode height as (R*256 + G + B/256) - 32768 metres, so they
decode with Pillow alone — no GDAL needed. Public S3 open-data bucket.
"""
import math, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

Z = int(sys.argv[1]) if len(sys.argv) > 1 else 12
# line 70 runs 47.51-47.83 N, 18.85-19.16 E; pad out to the visible ranges
# widened west for line 2 (Esztergom, the Pilis and the far view beyond)
S, W, N, E = 46.70, 18.30, 48.08, 19.98
OUT = f"data/raw/terrain/{Z}"
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

def lon2x(lon, z): return int((lon + 180.0) / 360.0 * (1 << z))
def lat2y(lat, z):
    r = math.radians(lat)
    return int((1.0 - math.asinh(math.tan(r)) / math.pi) / 2.0 * (1 << z))

def get(xy):
    x, y = xy
    path = f"{OUT}/{x}_{y}.png"
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return "cached"
    r = subprocess.run(["curl", "-sS", "-m", "60", "--retry", "3", "-o", path,
                        URL.format(z=Z, x=x, y=y)], capture_output=True)
    if r.returncode != 0 or os.path.getsize(path) == 0:
        return f"FAIL {x},{y}"
    return "ok"

def main():
    os.makedirs(OUT, exist_ok=True)
    x0, x1 = lon2x(W, Z), lon2x(E, Z)
    y0, y1 = lat2y(N, Z), lat2y(S, Z)
    tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    print(f"z{Z}: x {x0}..{x1}, y {y0}..{y1}  = {len(tiles)} tiles")
    with ThreadPoolExecutor(max_workers=12) as ex:
        res = list(ex.map(get, tiles))
    bad = [r for r in res if r.startswith("FAIL")]
    mb = sum(os.path.getsize(f"{OUT}/{x}_{y}.png") for x, y in tiles) / 1e6
    print(f"{res.count('ok')} downloaded, {res.count('cached')} cached, "
          f"{len(bad)} failed, {mb:.1f} MB in {OUT}")
    for b in bad[:10]:
        print("  ", b)
    open(f"{OUT}/extent.txt", "w").write(f"{Z} {x0} {x1} {y0} {y1}\n")

main()
