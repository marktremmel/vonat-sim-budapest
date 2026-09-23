#!/usr/bin/env python3
import json, math, os

R = 6371008.8  # IUGG mean earth radius, metres
SPLIT_M = 100.0

def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))

def chain(rel, ways):
    runs, pts, speeds = [], [], []
    for m in rel["members"]:
        w = ways.get(m["ref"])
        if not w or not w.get("geometry"):
            continue
        g = [(p["lat"], p["lon"]) for p in w["geometry"]]
        ms = w.get("tags", {}).get("maxspeed")
        ms = int(ms) if ms and ms.isdigit() else None
        if not pts:
            pts, speeds = list(g), [ms] * (len(g) - 1)
            continue
        tail = pts[-1]
        d_fwd, d_rev = haversine(tail, g[0]), haversine(tail, g[-1])
        if d_rev < d_fwd:
            g, d_fwd = g[::-1], d_rev
        if d_fwd > SPLIT_M:
            runs.append((pts, speeds))
            pts, speeds = list(g), [ms] * (len(g) - 1)
            continue
        if d_fwd < 1.0:
            g = g[1:]
        speeds.extend([ms] * len(g))
        pts.extend(g)
    runs.append((pts, speeds))
    return runs

def finish(pts, speeds):
    if pts[0][0] > pts[-1][0]:
        pts, speeds = pts[::-1], speeds[::-1]
    p, s = [pts[0]], []
    for pt, sp in zip(pts[1:], speeds):
        if haversine(p[-1], pt) > 0.5:
            p.append(pt)
            s.append(sp)
    ch = [0.0]
    for a, b in zip(p, p[1:]):
        ch.append(ch[-1] + haversine(a, b))
    filled, last = [], None
    for sp in s:
        last = sp if sp is not None else last
        filled.append(last)
    return p, filled, ch

def process_file(filename, prefix):
    if not os.path.exists(filename):
        print(f"Skipping {filename} - not found")
        return []
    d = json.load(open(filename, encoding="utf-8"))
    try:
        rel = next(e for e in d["elements"] if e["type"] == "relation")
    except StopIteration:
        return []
    ways = {e["id"]: e for e in d["elements"] if e["type"] == "way"}

    runs = [finish(p, s) for p, s in chain(rel, ways) if len(p) > 1]
    runs.sort(key=lambda r: -r[2][-1])
    
    tracks = []
    # Just take the two longest continuous runs for each line (down and up)
    for i, (name, (p, s, ch)) in enumerate(zip((f"{prefix}_down", f"{prefix}_up"), runs[:2])):
        tracks.append({
            "id": name,
            "length_m": round(ch[-1], 1),
            "points": [[round(la, 7), round(lo, 7), round(c, 2)]
                       for (la, lo), c in zip(p, ch)],
            "maxspeed": s,
        })
    return tracks

def main():
    tracks = []
    tracks.extend(process_file("data/raw/line70.json", "line70"))
    tracks.extend(process_file("data/raw/line2.json", "line2"))
    tracks.extend(process_file("data/raw/line71.json", "line71"))

    json.dump({
        "source": "OpenStreetMap relations for MÁV lines",
        "note": "chainage in metres from the southern end of each track",
        "tracks": tracks,
    }, open("data/alignment.json", "w", encoding="utf-8"))
    print(f"wrote data/alignment.json — {len(tracks)} tracks total")

main()
