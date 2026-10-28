#!/usr/bin/env python3
"""Stops, shelters, stop platforms, bins, benches and fences in the Budapest
city box, from OSM, into web/data/streetbits.json.

    python3 tools/overpass.py tools/q_streetbits_0.ql data/raw/streetbits_0.json   # and _1, _2
    python3 tools/bake_streetbits.py

Coordinates are lat/lon in integers of 1e-5 degree (about 1 m) from
(lat0, lon0); lines are delta coded. The runtime (web/src/streetbits.js)
places them in each line's frame and builds them in 1 km chunks round the
camera.

  p: [kind, lat, lon, angle, length_dm, width_dm, ...] flat, six per point
     kind 0 litter bin, 1 bench, 2 recycling bins, 3 bus stop sign,
     4 tram stop sign, 5 shelter. angle: degrees clockwise from north of the
     shelter's long side (from its OSM outline) or of OSM `direction`, or -1
     (the runtime faces it to the nearest road).
  l: [[kind, dlat, dlon, ...], ...]
     kind 0 fence, 1 hedge, 2 guard rail, 3 stop platform (an open way: a
     strip), 4 stop platform (a closed way: its outline).

What is left out: anything underground or indoors (level < 0, tunnel,
location=underground, indoor), railway platforms of the main lines (the
runtime drops those within 30 m of a line's own track, which has its own),
and a shelter=yes stop when a mapped shelter stands within 25 m of it (the
mapped one is drawn instead).
"""
import json, math, os

LAT0, LON0 = 47.3, 18.8
MLAT = 111_200.0; MLON = MLAT * math.cos(math.radians(47.48))
OUT = "web/data/streetbits.json"

def q(la, lo): return int(round((la - LAT0) * 1e5)), int(round((lo - LON0) * 1e5))

def simplify(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; st += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def underground(t):
    try: lv = float(str(t.get("level", "0")).split(";")[0])
    except ValueError: lv = 0
    return (lv < 0 or t.get("tunnel") in ("yes", "building_passage") or t.get("location") == "underground"
            or t.get("indoor") == "yes" or t.get("covered") == "yes" and t.get("barrier"))

def outline_axis(g):
    """centre, long-side angle (deg from north, clockwise), length, width of a
    small outline, from its longest edge."""
    xs = [((p["lon"] - LON0) * MLON, (p["lat"] - LAT0) * MLAT) for p in g]
    cx = sum(x for x, _ in xs) / len(xs); cy = sum(y for _, y in xs) / len(xs)
    best, ang = -1, 0
    for a, b in zip(xs, xs[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L > best: best, ang = L, math.atan2(b[0] - a[0], b[1] - a[1])
    ux, uy = math.sin(ang), math.cos(ang)
    us = [(x - cx) * ux + (y - cy) * uy for x, y in xs]; vs = [-(x - cx) * uy + (y - cy) * ux for x, y in xs]
    return cx, cy, math.degrees(ang) % 180, max(us) - min(us), max(vs) - min(vs)

def main():
    els, seen = [], set()
    for i in range(3):
        for e in json.load(open(f"data/raw/streetbits_{i}.json"))["elements"]:
            k = (e["type"], e["id"])
            if k not in seen: seen.add(k); els.append(e)
    P, Lines, shelters, stops = [], [], [], []
    count = {}
    def add(kind, la, lo, ang=-1, l=0, w=0):
        P.extend([kind, *q(la, lo), int(round(ang)), int(l * 10), int(w * 10)]); count[kind] = count.get(kind, 0) + 1
    for e in els:
        t = e.get("tags", {})
        if underground(t): continue
        am, hw, rw, pt, br = t.get("amenity"), t.get("highway"), t.get("railway"), t.get("public_transport"), t.get("barrier")
        if am == "shelter":
            if t.get("shelter_type") != "public_transport": continue
            if e["type"] == "node": shelters.append((e["lat"], e["lon"], -1, 0, 0))
            elif "geometry" in e:
                cx, cy, ang, L, W = outline_axis(e["geometry"])
                if L > 40 or W > 12: continue           # a big canopy, not a stop shelter
                shelters.append((LAT0 + cy / MLAT, LON0 + cx / MLON, ang, L, W))
            continue
        if e["type"] == "node":
            d = t.get("direction")
            try: ang = float(d) if d is not None else -1
            except ValueError: ang = -1
            if am in ("waste_basket",): add(0, e["lat"], e["lon"])
            elif am == "bench": add(1, e["lat"], e["lon"], ang)
            elif am == "recycling" and t.get("recycling_type", "container") == "container": add(2, e["lat"], e["lon"])
            elif hw == "bus_stop" or rw == "tram_stop" or pt == "platform":
                stops.append((e["lat"], e["lon"], 4 if (rw == "tram_stop" or t.get("tram") == "yes") else 3, t.get("shelter") == "yes"))
            continue
        g = e.get("geometry")
        if not g or len(g) < 2: continue
        lk = {"fence": 0, "hedge": 1, "guard_rail": 2}.get(br)
        if lk is None and (rw == "platform" or pt == "platform"):
            if t.get("area") == "yes" or g[0] == g[-1]: lk = 4
            else: lk = 3
        if lk is None: continue
        xy = simplify([((p["lon"] - LON0) * MLON, (p["lat"] - LAT0) * MLAT) for p in g], 0.8 if lk < 3 else 0.3)
        flat, pl, po = [lk], 0, 0
        for x, y in xy:
            la, lo = q(LAT0 + y / MLAT, LON0 + x / MLON)
            flat += [la - pl, lo - po]; pl, po = la, lo
        Lines.append(flat); count[f"l{lk}"] = count.get(f"l{lk}", 0) + 1
    for s in shelters: add(5, s[0], s[1], s[2], s[3], s[4])
    def near_shelter(la, lo):
        return any(abs(la - s[0]) * MLAT < 25 and abs(lo - s[1]) * MLON < 25 for s in shelters)
    for la, lo, k, sh in stops:
        if sh and not near_shelter(la, lo): add(5, la, lo)          # shelter=yes, none mapped
        add(k, la, lo)
    json.dump({"lat0": LAT0, "lon0": LON0, "p": P, "l": Lines}, open(OUT, "w"), separators=(",", ":"))
    print(count, f"{os.path.getsize(OUT)/1e6:.2f} MB -> {OUT}")

if __name__ == "__main__":
    main()
