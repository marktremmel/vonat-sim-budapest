#!/usr/bin/env python3
"""Snap OSM stations and halts onto the line 70 alignment to get real km posts.

Anything whose centre lies within SNAP_M of the down line is treated as being
on the route; everything else in the corridor bbox belongs to lines 2/71/75 or
the narrow gauge and is reported separately so we can see what we skipped.
"""
import json, math

R = 6371008.8
SNAP_M = 220.0

def load_alignment():
    a = json.load(open("data/alignment.json", encoding="utf-8"))
    tracks = {}
    for t in a["tracks"]:
        if t["id"].endswith("_down"):
            line = t["id"].replace("_down", "")
            tracks[line] = t["points"]
    return tracks

def local_frame(lat0):
    """Metres per degree at this latitude — good to <0.1% over our 35 km span."""
    p = math.radians(lat0)
    mlat = 111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    mlon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    return mlat, mlon

MLAT, MLON = local_frame(47.67)

def to_xy(lat, lon):
    return lon * MLON, lat * MLAT

def snap(lat, lon, pts):
    """Nearest point on the polyline: returns (chainage_m, offset_m)."""
    px, py = to_xy(lat, lon)
    best = (1e18, 0.0)
    for (la1, lo1, c1), (la2, lo2, c2) in zip(pts, pts[1:]):
        x1, y1 = to_xy(la1, lo1)
        x2, y2 = to_xy(la2, lo2)
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
        qx, qy = x1 + t * dx, y1 + t * dy
        d = math.hypot(px - qx, py - qy)
        if d < best[0]:
            best = (d, c1 + t * (c2 - c1))
    return best[1], best[0]

def main():
    lines_pts = load_alignment()
    raw = json.load(open("data/raw/stations.json", encoding="utf-8"))["elements"]

    seen = {}
    out = {"nearby_other_lines": []}
    for line in lines_pts.keys():
        out[f"on_{line}"] = []
        
    for e in raw:
        t = e.get("tags", {})
        name = t.get("name")
        if not name:
            continue
        lat = e.get("lat", (e.get("center") or {}).get("lat"))
        lon = e.get("lon", (e.get("center") or {}).get("lon"))
        if lat is None:
            continue
            
        best_line = None
        best_off = 1e18
        best_ch = 0
        
        for line, pts in lines_pts.items():
            ch, off = snap(lat, lon, pts)
            if off < best_off:
                best_off = off
                best_ch = ch
                best_line = line
                
        rec = {
            "name": name,
            "lat": lat, "lon": lon,
            "type": t.get("railway", "halt"),
            "km": round(best_ch / 1000, 3)
        }
        # Budapest-Nyugati is shared by all these lines
        if name == "Budapest-Nyugati":
            for line in lines_pts.keys():
                if name not in seen.get(line, set()):
                    r = dict(rec)
                    # For Nyugati, distance is approx 0 for all lines
                    r["km"] = 0.0
                    out[f"on_{line}"].append(r)
                    seen.setdefault(line, set()).add(name)
            continue
            
        if best_off < SNAP_M and best_line:
            if name not in seen.get(best_line, set()):
                out[f"on_{best_line}"].append(rec)
                seen.setdefault(best_line, set()).add(name)
        else:
            if name not in seen.get("other", set()):
                out["nearby_other_lines"].append(rec)
                seen.setdefault("other", set()).add(name)

    for line in lines_pts.keys():
        out[f"on_{line}"].sort(key=lambda x: x["km"])
        
    json.dump(out, open("data/stations.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("Mapped stations to lines:")
    for k, v in out.items():
        print(f"  {k}: {len(v)} stations")

if __name__ == "__main__":
    main()
