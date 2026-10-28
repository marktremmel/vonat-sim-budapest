#!/usr/bin/env python3
"""Streams, ditches, drains and small canals from OSM -> web/data/streams.json.

Input: data/raw/streams.json (tools/q_streams.ql via tools/overpass.py).
Ways tagged as tunnels or culverts are left out (they run under roads and
buildings). Each way is simplified to within 2 m and stored in lat/lon as
integers of 1e-5 degree (about 1 m), as deltas from the previous point.

  {"lat0": .., "lon0": .., "ways": [[kind, width_dm, [dlat, dlon, ...]], ...],
   "names": {"index": name}}
  kind: 0 stream, 1 ditch/drain, 2 canal. width_dm: OSM width in decimetres,
  or 0 (the runtime takes a default per kind).

The runtime (web/src/streams.js) places them in each line's frame and draws
each as a sunken channel with water in it.
"""
import json, math, sys

RAW = "data/raw/streams.json"
OUT = "web/data/streams.json"
KIND = {"stream": 0, "ditch": 1, "drain": 1, "canal": 2}

def simplify(pts, tol):
    """Douglas-Peucker on (x, y) metres."""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > best: best, bi = d, i
        if best > tol:
            keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def main():
    els = json.load(open(RAW))["elements"]
    lat0, lon0 = 47.0, 18.6
    mlat = 111_200.0; mlon = mlat * math.cos(math.radians(47.5))
    ways, names, seen, skipped = [], {}, set(), 0
    for e in els:
        if e.get("type") != "way" or e["id"] in seen or "geometry" not in e: continue
        seen.add(e["id"])
        t = e.get("tags", {})
        if t.get("tunnel") in ("yes", "culvert", "flooded") or t.get("covered") == "yes" or t.get("location") == "underground":
            skipped += 1; continue
        k = KIND.get(t.get("waterway"))
        if k is None: continue
        g = [(p["lon"], p["lat"]) for p in e["geometry"]]
        m = simplify([((lo - lon0) * mlon, (la - lat0) * mlat) for lo, la in g], 2.0)
        if len(m) < 2: continue
        try: wd = int(round(float(str(t.get("width", "0")).split()[0].replace(",", ".")) * 10))
        except ValueError: wd = 0
        flat, pl, po = [], 0, 0
        for x, y in m:
            la = int(round((y / mlat) * 1e5)); lo = int(round((x / mlon) * 1e5))
            flat += [la - pl, lo - po]; pl, po = la, lo
        if t.get("name"): names[len(ways)] = t["name"]
        ways.append([k, min(wd, 250), flat])
    json.dump({"lat0": lat0, "lon0": lon0, "ways": ways, "names": names},
              open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)
    import os
    by = [sum(1 for w in ways if w[0] == k) for k in range(3)]
    print(f"{len(ways)} ways (stream {by[0]}, ditch {by[1]}, canal {by[2]}), "
          f"{skipped} culverts/tunnels left out, {os.path.getsize(OUT)/1e6:.2f} MB -> {OUT}")

if __name__ == "__main__":
    main()
