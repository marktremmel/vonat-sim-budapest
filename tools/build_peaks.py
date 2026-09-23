#!/usr/bin/env python3
"""Named summits visible from line 70, with the chainage they stand over.

For each peak: the nearest point on the down line, the distance and bearing to
it from there, and an apparent-size score (height above the track / distance)
that decides which labels are worth drawing when you look out of the window.
"""
import json, math, sys
sys.path.insert(0, "tools")
from terrain import Terrain

MAX_DIST_M = 26000.0
MIN_ELE = 220.0

def frame(lat0):
    p = math.radians(lat0)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p))
MLAT, MLON = frame(47.67)
def xy(lat, lon): return lon * MLON, lat * MLAT

def nearest(lat, lon, pts):
    px, py = xy(lat, lon)
    best = (1e18, 0.0, None, None)
    for a, b in zip(pts, pts[1:]):
        x1, y1 = xy(a[0], a[1]); x2, y2 = xy(b[0], b[1])
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
        qx, qy = x1 + t * dx, y1 + t * dy
        d = math.hypot(px - qx, py - qy)
        if d < best[0]:
            # cross product of the travel direction with the peak offset:
            # positive means the summit is left of a Szob-bound train
            cross = dx * (py - qy) - dy * (px - qx)
            best = (d, a[2] + t * (b[2] - a[2]),
                    (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])),
                    "left" if cross > 0 else "right")
    return best

def main():
    pts = json.load(open("data/alignment.json", encoding="utf-8"))["tracks"][0]["points"]
    prof = json.load(open("data/profile.json", encoding="utf-8"))
    step = prof["step_m"]; heights = [p[1] for p in prof["profile"]]
    terr = Terrain(12)

    out = []
    for e in json.load(open("data/raw/peaks.json", encoding="utf-8"))["elements"]:
        t = e.get("tags", {})
        name = t.get("name")
        ele = t.get("ele")
        try:
            ele = float(str(ele).split()[0]) if ele else None
        except ValueError:
            ele = None
        if ele is None:
            ele = terr.height(e["lat"], e["lon"])       # fall back to the DEM
            sourced = "dem"
        else:
            sourced = "osm"
        if ele < MIN_ELE:
            continue
        dist, ch, q, hand = nearest(e["lat"], e["lon"], pts)
        if dist > MAX_DIST_M:
            continue
        i = min(int(ch / step), len(heights) - 1)
        rise = ele - heights[i]
        if rise < 60:
            continue
        px, py = xy(e["lat"], e["lon"]); qx, qy = xy(q[0], q[1])
        bearing = (math.degrees(math.atan2(px - qx, py - qy)) + 360) % 360
        out.append({
            "name": name, "ele": round(ele, 1), "ele_source": sourced,
            "lat": e["lat"], "lon": e["lon"],
            "km": round(ch / 1000, 2),
            "dist_m": round(dist),
            "bearing": round(bearing, 1),
            "compass": "south" if 90 < bearing < 270 else "north",
            "window": hand,
            "rise_m": round(rise),
            "apparent": round(math.degrees(math.atan2(rise, dist)), 3),
        })

    out.sort(key=lambda r: -r["apparent"])
    json.dump(out, open("data/peaks.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"{len(out)} named summits stand over the line")

    def table(rows, title):
        print(f"\n{title}")
        print(f"{'app°':>5} {'ele':>6} {'dist':>6} {'km':>6}  {'window':<6} {'bear':>5}  name")
        for r in rows:
            print(f"{r['apparent']:5.2f} {r['ele']:6.0f} {r['dist_m']/1000:5.1f}k "
                  f"{r['km']:6.2f}  {r['window']:<6} {r['bearing']:5.0f}  {r['name']}"
                  + ("" if r["ele_source"] == "osm" else "  [dem]"))

    table(out[:12], "closest and most dominant:")
    table(sorted(out, key=lambda r: -r["ele"])[:16], "the big names, by height:")
    from collections import Counter
    print("\nwhich window: " + ", ".join(f"{k} {v}" for k, v in
          Counter(r["window"] for r in out).items()))
    print("wrote data/peaks.json")

main()
