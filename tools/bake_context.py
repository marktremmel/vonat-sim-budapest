#!/usr/bin/env python3
"""Reduce OSM buildings and roads to something a browser can hold.

Buildings become oriented boxes — centre, half extents, rotation, height —
which is both far smaller than footprints and exactly the fidelity this looks
right at. Roads stay as polylines, simplified and filtered to the corridor.
Everything is packed binary and base64'd, because JSON numbers cost ten times
as much for the same information.
"""
import base64, json, math, struct, sys
from collections import Counter
sys.path.insert(0, "tools")
from geo import frame, Chainer, load_tracks

import os
# Which line. Line 70 is the original; any other line bakes into its own
# frame (world_<line>.json), measures distance from its own track, reads its
# own corridor download (context_<line>_osm.json) as well as line 70's (which
# covers the shared Nyugati end), and writes context_<line>.json.
LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
# CITY=1: the Budapest city layer (bake_city.py splits it into tiles). It is
# baked in line 70's frame from data/raw/city/*.json, everything inside the
# city box, no distance-from-the-line limits. The line contexts then leave
# out the buildings and parts inside the box (the tiles draw them) and list
# their road ids (the tiles skip those roads).
CITY = os.environ.get("CITY") == "1"
if CITY:
    LINE = "line70"
CITY_BOX = (47.39, 18.93, 47.58, 19.25)
# Szentendre, the island's south end and Budakalász, across the river from
# line 70 (q_szentendre.ql): kept whatever their distance from the line
def in_szentendre(lat, lon):
    return 47.585 <= lat <= 47.720 and 19.020 <= lon <= 19.110
def in_city(lat, lon):
    return CITY_BOX[0] <= lat <= CITY_BOX[2] and CITY_BOX[1] <= lon <= CITY_BOX[3]
EXCLUDE_CITY = (not CITY and os.path.exists("web/data/city/index.json")
                and os.environ.get("NO_CITY") != "1")
SUFFIX = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUFFIX}.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
BUILD_R, ROAD_R = 2400.0, 600.0   # wide enough for Margitsziget
# Line 70 takes the city to 5.4 km at the Budapest end; that radius around
# line 2 would take in most of Buda and Pest, so other lines stop at 2 km.
CITY_R = 5400.0 if LINE == "line70" else 2000.0
# Esztergom's Castle Hill and Basilica stand 2.4 km from the end of line 2
if LINE != "line70":
    BUILD_R = 3000.0
CITY_ROAD_R = 4500.0 if LINE == "line70" else 1200.0
# line 70's frame, for the landmark anchors typed in it
W70 = json.load(open("web/data/world.json", encoding="utf-8"))["near"]
M70LAT, M70LON = frame(W70.get("frame_lat", (W70["south"] + W70["north"]) / 2))
def from70(x, y):
    lat, lon = y / M70LAT + W70["south"], x / M70LON + W70["west"]
    return ((lon - W["west"]) * MLON, (lat - W["south"]) * MLAT)

def xy(lat, lon):
    return ((lon - W["west"]) * MLON, (lat - W["south"]) * MLAT)

def latlon(x, y):
    return (y / MLAT + W["south"], x / MLON + W["west"])

DOWN = Chainer(load_tracks("data/alignment.json" if LINE == "line70"
                            else f"data/alignment_{LINE}.json")[0]["points"])

LEVEL_H = 3.2
DEFAULT_H = {"house": 6.5, "detached": 6.5, "residential": 8.0, "apartments": 16.0,
             "garage": 3.0, "roof": 4.0, "industrial": 9.0, "retail": 6.0,
             "commercial": 10.0, "church": 14.0, "train_station": 9.0,
             "warehouse": 9.0, "hut": 3.0, "shed": 3.0, "yes": 7.0}
CLS = {"church": 1, "chapel": 1, "train_station": 2, "station": 2,
       "industrial": 3, "warehouse": 3, "apartments": 4, "retail": 5,
       "commercial": 5, "garage": 6, "shed": 6, "hut": 6, "roof": 6,
       "office": 5, "hospital": 8, "school": 8, "university": 8,
       "public": 8, "civic": 8, "hotel": 5}
# class 7 is a panelház: a prefabricated concrete slab block. They are the
# defining building of the Budapest approach — Angyalföld, Újpest, Dunakeszi —
# and drawing them as houses with hipped roofs is what made the city read as
# a very large village. They are recognised by shape rather than by tag,
# because OSM rarely says: a long, narrow, tall, rectangular apartment block.
PANEL = 7

# OSM building:colour / roof:colour: "#rrggbb", "#rgb" or a colour name. A
# named colour means the kind of colour, not the CSS swatch: a "red" roof is
# terracotta, a "yellow" house is a Pest ochre, not a traffic sign.
NAMED_COLOUR = {
    "white": (0.92, 0.91, 0.88), "ivory": (0.93, 0.91, 0.84), "cream": (0.92, 0.88, 0.76),
    "beige": (0.86, 0.80, 0.66), "tan": (0.80, 0.70, 0.54), "yellow": (0.92, 0.82, 0.52),
    "orange": (0.90, 0.64, 0.40), "pink": (0.92, 0.74, 0.72), "salmon": (0.92, 0.66, 0.56),
    "red": (0.64, 0.30, 0.22), "maroon": (0.48, 0.22, 0.18), "brown": (0.46, 0.32, 0.24),
    "green": (0.50, 0.64, 0.46), "lightgreen": (0.70, 0.82, 0.62), "darkgreen": (0.28, 0.38, 0.28),
    "blue": (0.46, 0.58, 0.74), "lightblue": (0.70, 0.80, 0.88), "darkblue": (0.24, 0.30, 0.44),
    "grey": (0.60, 0.60, 0.60), "gray": (0.60, 0.60, 0.60), "lightgrey": (0.76, 0.76, 0.75),
    "lightgray": (0.76, 0.76, 0.75), "darkgrey": (0.36, 0.36, 0.37), "darkgray": (0.36, 0.36, 0.37),
    "silver": (0.72, 0.73, 0.75), "black": (0.16, 0.16, 0.17), "purple": (0.56, 0.44, 0.60),
    "violet": (0.66, 0.56, 0.74), "gold": (0.82, 0.68, 0.36), "copper": (0.40, 0.58, 0.50),
}
def osm_colour(v):
    if not v:
        return None
    v = v.strip().lower().replace(" ", "").replace("_", "")
    try:
        if v.startswith("#") and len(v) == 7:
            return tuple(int(v[i:i + 2], 16) / 255 for i in (1, 3, 5))
        if v.startswith("#") and len(v) == 4:
            return tuple(int(v[i] * 2, 16) / 255 for i in (1, 2, 3))
    except ValueError:
        return None
    return NAMED_COLOUR.get(v)

ROOF = {"flat": 0, "skillion": 0, "gabled": 1, "hipped": 1, "half-hipped": 1,
        "round": 3, "dome": 4, "onion": 4, "pyramidal": 2, "many": 1, "gambrel": 1,
        "mansard": 1, "quadruple_saltbox": 1, "saltbox": 1}

def signed_area(p):
    a = 0.0
    for i in range(len(p)):
        x0, y0 = p[i]; x1, y1 = p[(i + 1) % len(p)]
        a += x0 * y1 - x1 * y0
    return a * 0.5

def ear_clip(p):
    """Triangulate a simple polygon. A fan from the centroid is wrong on any
    L-shaped block — which in a city is most of them — so this does it
    properly. Returns index triples into p."""
    n = len(p)
    if n < 3:
        return []
    idx = list(range(n))
    if signed_area(p) < 0:
        idx.reverse()
    def cross(a, b, c):
        return ((p[b][0]-p[a][0]) * (p[c][1]-p[a][1])
                - (p[b][1]-p[a][1]) * (p[c][0]-p[a][0]))
    def inside(a, b, c, q):
        d1 = cross(a, b, q); d2 = cross(b, c, q); d3 = cross(c, a, q)
        neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
        pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
        return not (neg and pos)
    out, guard = [], 0
    while len(idx) > 3 and guard < 4000:
        guard += 1
        clipped = False
        for i in range(len(idx)):
            a, b, c = idx[i-1], idx[i], idx[(i+1) % len(idx)]
            if cross(a, b, c) <= 0:
                continue                      # reflex
            if any(inside(a, b, c, q) for q in idx if q not in (a, b, c)):
                continue
            out.append((a, b, c))
            idx.pop(i)
            clipped = True
            break
        if not clipped:
            break
    if len(idx) == 3:
        out.append((idx[0], idx[1], idx[2]))
    return out

def obb(pts):
    """Oriented bounding box by principal axis — good enough, and cheap."""
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - cx) ** 2 for p in pts)
    syy = sum((p[1] - cy) ** 2 for p in pts)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in pts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ca, sa = math.cos(ang), math.sin(ang)
    us = [(p[0] - cx) * ca + (p[1] - cy) * sa for p in pts]
    vs = [-(p[0] - cx) * sa + (p[1] - cy) * ca for p in pts]
    hu, hv = (max(us) - min(us)) / 2, (max(vs) - min(vs)) / 2
    mu, mv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
    return (cx + mu * ca - mv * sa, cy + mu * sa + mv * ca, hu, hv, ang)

def simplify(pts, tol):
    """Douglas–Peucker."""
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]; bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1e-9
    worst, wi = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
        if d > worst:
            worst, wi = d, i
    if worst <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:wi + 1], tol)[:-1] + simplify(pts[wi:], tol)

def main():
    if CITY:
        import glob
        els, seen_ids = [], set()
        for f in sorted(glob.glob("data/raw/city/city_*.json")):
            for e in json.load(open(f, encoding="utf-8"))["elements"]:
                k = (e["type"], e["id"])
                if k not in seen_ids:
                    seen_ids.add(k); els.append(e)
        print(f"city: {len(els)} elements")
    else:
        els = json.load(open("data/raw/context.json", encoding="utf-8"))["elements"]
    # The main query is a 1400 m ring around the line, which leaves out
    # Margitsziget entirely — it sits about two kilometres off, opposite
    # Újlipótváros. A 2600 m ring over the whole 63 km is too heavy for the
    # public mirrors, so the Budapest end gets a plain bounding box of its
    # own and the two are merged here, de-duplicated by way id.
    EXTRA = (("data/raw/context_bp.json", "data/raw/eszakpest_osm.json", "data/raw/downtown_osm.json",
              "data/raw/industry_osm.json", "data/raw/fot_osm.json",     # Fót, M0/M3 (q_fot.ql)
              "data/raw/szentendre_osm.json")                             # q_szentendre.ql
             if LINE == "line70" else (f"data/raw/context_{LINE}_osm.json", "data/raw/eszakpest_osm.json",
                                       "data/raw/esztergom_osm.json", "data/raw/downtown_osm.json",
                                       # roads out to 1.5 km (q_s21_roads_*.ql)
                                       f"data/raw/{LINE}_roads_n.json", f"data/raw/{LINE}_roads_s.json"))
    for fname in (() if CITY else EXTRA):
        try:
            extra = json.load(open(fname, encoding="utf-8"))["elements"]
            have = {e.get("id") for e in els}
            added = [e for e in extra if e.get("id") not in have]
            els = els + added
            print(f"merged {len(added)} extra buildings from {fname}")
        except FileNotFoundError:
            pass

    # The landmark bridges' own road ways (q_landmark_ways.ql): Árpád and
    # Megyeri híd were outside every other extract, so they had a model and
    # no deck, and Lánchíd had a model floating beside its real deck.
    try:
        LMW = json.load(open("data/raw/landmark_ways.json", encoding="utf-8"))["elements"]
    except FileNotFoundError:
        LMW = []
    have = {e.get("id") for e in els}
    els = els + [e for e in LMW if e["type"] == "way" and e.get("tags", {}).get("highway")
                 and e["id"] not in have]

    # Resolve node IDs to lat/lon geometry for all raw OSM elements (buildings and roads)
    node_map = {e["id"]: {"lat": e["lat"], "lon": e["lon"]} for e in els if e.get("type") == "node" and "lat" in e}
    resolved_count = 0
    for e in els:
        if not e.get("geometry") and "nodes" in e:
            e["geometry"] = [node_map[nid] for nid in e["nodes"] if nid in node_map]
            resolved_count += 1
    if resolved_count > 0:
        print(f"resolved geometry for {resolved_count} OSM ways (buildings & roads)")

    # Building RELATIONS. In inner Pest more than half the buildings are
    # multipolygons — a tenement block with its courtyard is an outer ring and
    # an inner one — and every one was being skipped, because only ways were
    # read. Checked against Overpass on 22 Sep 2026: a 400 x 550 m patch by
    # Teréz körút has 189 building ways and 228 building relations. Each outer
    # ring becomes a pseudo-way carrying the relation's tags. Courtyards are
    # not cut out; from street level a block reads as solid anyway.
    way_by_id = {e["id"]: e for e in els if e.get("type") == "way"}
    def stitch(segs):
        rings, segs = [], [list(s) for s in segs if len(s) >= 2]
        while segs:
            ring = segs.pop(0)
            grew = True
            while grew and ring[0] != ring[-1]:
                grew = False
                for i, s in enumerate(segs):
                    if s[0] == ring[-1]:   ring += s[1:]
                    elif s[-1] == ring[-1]: ring += s[::-1][1:]
                    elif s[-1] == ring[0]:  ring = s[:-1] + ring
                    elif s[0] == ring[0]:   ring = s[::-1][:-1] + ring
                    else: continue
                    segs.pop(i); grew = True; break
            if ring[0] == ring[-1] and len(ring) >= 4:
                rings.append(ring)
        return rings
    rel_added = 0
    for e in list(els):
        if e.get("type") != "relation":
            continue
        t = e.get("tags") or {}
        if "building" not in t:
            continue
        outers = [way_by_id.get(m["ref"]) for m in e.get("members", [])
                  if m.get("type") == "way" and m.get("role") in ("outer", "")]
        outers = [w for w in outers if w]
        # a member way that is itself a building is already drawn
        if not outers or any("building" in (w.get("tags") or {}) for w in outers):
            continue
        segs = [[n for n in w.get("nodes", []) if n in node_map] for w in outers]
        for k, ring in enumerate(stitch(segs)):
            els.append({"type": "way", "id": f"r{e['id']}_{k}", "tags": t,
                        "geometry": [node_map[n] for n in ring]})
            rel_added += 1
    print(f"assembled {rel_added} building outlines from multipolygon relations")

    # How built-up is it here? Three quarters of the buildings on this line
    # are tagged `building=yes` with no levels and no height, and giving them
    # all the 7 m of a village house makes Budapest a very large village.
    # Local density is the best proxy available: a 300 m2 footprint with
    # forty neighbours inside a hundred metres is a city block, the same
    # footprint on its own is a farm building.
    #
    # The count alone was not enough: a village of small houses packed along
    # its streets (Verőce, 148 in the block around the station) counts as
    # many as a Pest block, and every one of its cottages became a 15 m
    # tenement. So the ground covered is measured too, and the average
    # footprint (measured 25 Sep: Pest VII–VIII 30–40% covered, 470–550 m² a
    # building; Verőce, Göd, Rákospalota, Kispest 12–27%, 150–210 m²).
    dens, dens_a = {}, {}
    for e in els:
        t = e.get("tags", {})
        if "building" not in t:
            continue
        g = e.get("geometry") or []
        if not g:
            continue
        key = (int(g[0]["lat"] * 900), int(g[0]["lon"] * 600))
        dens[key] = dens.get(key, 0) + 1
        if len(g) >= 3:
            k = math.cos(math.radians(g[0]["lat"]))
            xs = [(p["lon"] * 111320 * k, p["lat"] * 111130) for p in g]
            dens_a[key] = dens_a.get(key, 0) + abs(sum(xs[i][0] * xs[i - 1][1] - xs[i - 1][0] * xs[i][1]
                                                       for i in range(len(xs)))) / 2
    def around(lat, lon):
        a, b = int(lat * 900), int(lon * 600)
        return sum(dens.get((a + i, b + j), 0)
                   for i in (-1, 0, 1) for j in (-1, 0, 1))
    def cover_mean(lat, lon):
        """share of the ground under buildings nearby, and the mean footprint (m²)"""
        a, b = int(lat * 900), int(lon * 600)
        n = sum(dens.get((a + i, b + j), 0) for i in (-1, 0, 1) for j in (-1, 0, 1))
        s = sum(dens_a.get((a + i, b + j), 0) for i in (-1, 0, 1) for j in (-1, 0, 1))
        cell = (3 / 900 * 111130) * (3 / 600 * 111320 * math.cos(math.radians(lat)))
        return s / cell, (s / n if n else 0)

    # Buildings big enough for a bounding box to be visibly wrong get their
    # real footprint extruded instead. Classical Budapest downtown blocks,
    # courtyard tenements, flats, and stations are extruded with true perimeters.
    POLY_AREA = 160.0

    # ---- landmark anchors
    # Hand-modelled buildings are anchored to their OWN OSM footprint, not to
    # typed coordinates. The footprint already gives a centre, a principal
    # axis and a size in exactly the frame everything else is baked in, so a
    # landmark cannot drift, cannot be rotated the wrong way, and cannot be
    # put on the wrong side of the line — the three ways hand placement goes
    # wrong. If OSM moves the building, the model moves with it.
    # Only shapes an extruded footprint genuinely cannot express, and only
    # where the footprint is compact enough for an oriented bounding box to
    # describe it. That second condition is the one that caught us out:
    # WestEnd is 322 x 305 m and nearly square, but its principal-axis OBB
    # reported 396 x 137, so a box drawn to those numbers sat across the road.
    # An OBB is a good descriptor for a water tower and a bad one for a mall,
    # and the polygon layer already draws the mall correctly.
    LANDMARKS = [
        ("viztorony", lambda t: "víztorony" in (t.get("name") or "").lower()),
        # the Esztergom Basilica: anchored to its own OSM outline, modelled in
        # landmarks.js because an extruded footprint cannot make a dome
        ("esztergom", lambda t: t.get("building") == "cathedral"
                                and "adalbert" in (t.get("name") or "").lower()),
        # the Budapest Eye on Erzsébet tér: mapped as a 65 m "building", and
        # extruded it was a 65 m tower block in the middle of the square
        ("bigwheel", lambda t: t.get("attraction") == "big_wheel"),
    ]
    # The Vasúttörténeti Park roundhouse is not named in OSM and not mapped as
    # a curved building, so there is nothing to anchor it to directly. Its own
    # water tower IS named and stands in the park, so the roundhouse is placed
    # relative to that — data-anchored at one remove, which is still better
    # than a typed coordinate that drifts the moment the frame changes.
    DERIVED = {}
    anchors = []
    ppack, pcount, ptri = bytearray(), 0, 0
    pcolours = []          # [poly index, wall rgb or None, roof rgb or None]
    poly_ids = set()

    # ---- OSM 3D building parts (q_building_parts.ql). Where mappers have
    # modelled a building in parts — the Parliament in 112 of them, with its
    # dome, spires and roofs; the Bazilika in 16 — the parts ARE the building,
    # and the plain outline is not drawn. A part: its ring, triangles for a
    # flat top, height, min_height, roof shape and height, and colours.
    NAMED_COL = {"white": (0.92, 0.91, 0.88), "beige": (0.84, 0.78, 0.64), "grey": (0.60, 0.60, 0.60),
                 "gray": (0.60, 0.60, 0.60), "brown": (0.45, 0.32, 0.22), "red": (0.62, 0.22, 0.18),
                 "green": (0.30, 0.46, 0.36), "yellow": (0.88, 0.78, 0.45), "black": (0.16, 0.16, 0.17),
                 "darkgrey": (0.33, 0.33, 0.35), "darkgray": (0.33, 0.33, 0.35), "blue": (0.30, 0.40, 0.55),
                 "orange": (0.80, 0.50, 0.25), "silver": (0.72, 0.73, 0.75), "maroon": (0.45, 0.18, 0.15),
                 "lightgrey": (0.78, 0.78, 0.78), "lightgray": (0.78, 0.78, 0.78), "tan": (0.78, 0.68, 0.52),
                 "cream": (0.90, 0.86, 0.72), "olive": (0.45, 0.45, 0.25), "teal": (0.25, 0.50, 0.50)}
    def colour(v):
        if not v: return None
        v = v.strip().lower()
        if v.startswith("#") and len(v) in (4, 7):
            if len(v) == 4: v = "#" + "".join(ch * 2 for ch in v[1:])
            try: return tuple(round(int(v[i:i + 2], 16) / 255, 3) for i in (1, 3, 5))
            except ValueError: return None
        return NAMED_COL.get(v)
    def num(v):
        try: return float(str(v).split()[0].replace(",", "."))
        except (ValueError, TypeError, AttributeError): return None
    parts, part_poly = [], []
    if CITY:
        PR = [e for e in els if e.get("type") == "way" and "building:part" in (e.get("tags") or {})]
    else:
        try:
            PR = json.load(open("data/raw/building_parts.json", encoding="utf-8"))["elements"]
        except FileNotFoundError:
            PR = []
    for e in PR:
        t = e.get("tags", {})
        if "building:part" not in t:
            continue
        if e["type"] == "relation":
            rings = stitch([[(p["lat"], p["lon"]) for p in m.get("geometry", [])]
                            for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")])
            rings = [[{"lat": a, "lon": b} for a, b in r] for r in rings]
        else:
            rings = [e.get("geometry") or []]
        for g in rings:
            if len(g) < 4: continue
            lat = sum(p["lat"] for p in g) / len(g); lon = sum(p["lon"] for p in g) / len(g)
            if CITY:
                if not in_city(lat, lon): continue
            elif DOWN.snap(lat, lon)[1] > CITY_R: continue
            city_part = EXCLUDE_CITY and in_city(lat, lon)
            ring = [xy(p["lat"], p["lon"]) for p in g]
            if ring[0] == ring[-1]: ring = ring[:-1]
            ring = simplify(ring, 0.25)
            if len(ring) < 3 or len(ring) > 200: continue
            H = num(t.get("height"))
            lv = num(t.get("building:levels"))
            # The Opera is mapped as ONE part over its whole footprint with the
            # 50.7 m of its stage tower, which made a 50 m box of the building.
            # The street range is about 26 m to the cornice with a steep
            # pinkish-red roof (checked against photographs).
            if t.get("name") == "Magyar Állami Operaház":
                t = dict(t, **{"height": "34", "roof:shape": "hipped", "roof:height": "8",
                               "roof:colour": "#b87a6e", "building:colour": "#cdb894"})
                H = 34.0
            if H is None: H = (lv or 3) * LEVEL_H + (num(t.get("roof:height")) or 0)
            mh = num(t.get("min_height"))
            if mh is None: mh = (num(t.get("building:min_level")) or 0) * LEVEL_H
            if H - mh < 0.3: continue
            tris = ear_clip(ring)
            cx = sum(q[0] for q in ring) / len(ring); cy = sum(q[1] for q in ring) / len(ring)
            part_poly.append((cx, cy, abs(signed_area(ring))))
            if city_part:
                continue                     # the city tiles draw it
            parts.append({"x": round(cx, 2), "y": round(cy, 2),
                          "p": [v for q in ring for v in (round((q[0] - cx) * 10), round((q[1] - cy) * 10))],
                          "t": [i for tr in tris for i in tr],
                          "h": round(H, 2), "mh": round(mh, 2),
                          "rh": num(t.get("roof:height")) or -1,
                          "rs": t.get("roof:shape") or "flat",
                          "wc": colour(t.get("building:colour") or t.get("colour")),
                          "rc": colour(t.get("roof:colour")),
                          "ch": 1 if t.get("building") in ("church", "cathedral", "chapel") or
                                     t.get("building:part") in ("church", "tower") else 0})
    # a grid of part centroids, to find the outlines they replace
    pgrid = {}
    for i, (cx, cy, a) in enumerate(part_poly):
        pgrid.setdefault((int(cx // 100), int(cy // 100)), []).append(i)
    def point_in(pt, poly):
        x, y = pt; inside = False
        for i in range(len(poly)):
            (x0, y0), (x1, y1) = poly[i - 1], poly[i]
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                inside = not inside
        return inside
    def covered_by_parts(pts):
        if not part_poly: return False
        area = abs(signed_area(pts))
        if area < 1: return False
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        got = 0.0
        for gx in range(int(min(xs) // 100), int(max(xs) // 100) + 1):
            for gy in range(int(min(ys) // 100), int(max(ys) // 100) + 1):
                for i in pgrid.get((gx, gy), []):
                    cx, cy, a = part_poly[i]
                    if point_in((cx, cy), pts): got += a
        return got >= 0.55 * area
    print(f"building parts {len(parts)}")
    n_covered = 0

    # railway and industrial land (and the railway museum): a building inside
    # it is a shed, a workshop, a hall or a store — the Népsziget shipyard's
    # big blocky warehouses — not a block of flats with a grid of windows
    rail_land = []
    try:
        lcx = json.load(open("data/raw/landcover.json", encoding="utf-8"))["elements"]
        if LINE != "line70" and os.path.exists(f"data/raw/landcover_{LINE}.json"):
            lcx += json.load(open(f"data/raw/landcover_{LINE}.json", encoding="utf-8"))["elements"]
        for e in lcx:
            tg = e.get("tags") or {}
            if tg.get("landuse") in ("railway", "industrial") or "vasúttörténeti" in (tg.get("name") or "").lower():
                rings = [e.get("geometry") or []] if e["type"] == "way" else \
                        [m.get("geometry") or [] for m in e.get("members", []) if m.get("role") == "outer"]
                for g in rings:
                    if len(g) > 3:
                        ring = [xy(p["lat"], p["lon"]) for p in g]
                        xs = [q[0] for q in ring]; ys = [q[1] for q in ring]
                        rail_land.append((min(xs), min(ys), max(xs), max(ys), ring))
    except FileNotFoundError:
        pass
    land_grid = {}
    for k, (x0, y0, x1, y1, ring) in enumerate(rail_land):
        for gx in range(int(x0 // 500), int(x1 // 500) + 1):
            for gy in range(int(y0 // 500), int(y1 // 500) + 1):
                land_grid.setdefault((gx, gy), []).append(k)
    def on_rail_land(x, y):
        for k in land_grid.get((int(x // 500), int(y // 500)), ()):
            x0, y0, x1, y1, ring = rail_land[k]
            if x0 <= x <= x1 and y0 <= y <= y1:
                inside = False
                for i in range(len(ring)):
                    (ax, ay), (bx, by) = ring[i - 1], ring[i]
                    if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
                        inside = not inside
                if inside: return True
        return False
    print(f"railway land polygons {len(rail_land)}")

    bpack, bcount, skipped = bytearray(), 0, 0
    pylons = []
    for e in els:
        t = e.get("tags", {})
        if "building" not in t:
            continue
        g = e.get("geometry") or []
        if len(g) < 4:
            continue
        pts = [xy(p["lat"], p["lon"]) for p in g]
        cx = sum(p[0] for p in pts) / len(pts)
        lat = sum(p["lat"] for p in g) / len(g)
        lon = sum(p["lon"] for p in g) / len(g)
        if CITY:
            if not in_city(lat, lon):
                continue
        else:
            _, off, _ = DOWN.snap(lat, lon)
            r_limit = CITY_R if lat < 47.65 else BUILD_R
            if LINE == "line70" and in_szentendre(lat, lon): r_limit = 8000.0
            if off > r_limit:
                skipped += 1
                continue
        ox, oy, hu, hv, ang = obb(pts)

        # A bridge pylon or a bridge mapped as a "building" is not a house:
        # extruded from the river bed it was a tenement block standing on
        # Lánchíd. The pylons' positions go to the bridge models instead.
        if t.get("bridge:support") or t.get("building") == "bridge" or t.get("man_made") == "bridge":
            if t.get("bridge:support") == "pylon":
                pylons.append((ox, oy, hu, hv, ang, num(t.get("height")), colour(t.get("building:colour"))))
            continue
        # drawn by its 3D parts instead
        if covered_by_parts(pts):
            n_covered += 1
            continue

        # Hand-modelled landmarks whose OSM footprint is also in the data now
        # that relations are read: draw the model, not both on top of each other
        if (t.get("name") or "") in ("Országház", "Szent István-bazilika"):
            continue

        # Is this one of the buildings we model by hand? Tested BEFORE the
        # size rejection, because a landmark is large by definition — the
        # 120 m half-extent cap was quietly throwing WestEnd away.
        lm = None
        nm0 = t.get("name") or ""
        for key, test in LANDMARKS:
            try:
                if test(t): lm = key; break
            except Exception:
                pass
        if lm:
            # An oriented bounding box has no opinion about which way along
            # its long axis is "front" — the axis is a line, not an arrow.
            # Resolve it from the railway: +u is defined to point AWAY from
            # the line, so a trainshed always opens toward the tracks and a
            # station's head building always faces the street. Guessing this
            # by hand is how a station ends up back to front.
            for sgn in (1,):
                ea = (ox + math.cos(ang) * hu, oy + math.sin(ang) * hu)
                eb = (ox - math.cos(ang) * hu, oy - math.sin(ang) * hu)
                da = DOWN.snap(*latlon(*ea))[1]
                db = DOWN.snap(*latlon(*eb))[1]
                if da < db:
                    ang = ang + math.pi
            anchors.append({"key": lm, "name": nm0,
                            "x": round(ox, 2), "y": round(oy, 2),
                            "ang": round(ang, 5),
                            "hu": round(hu, 2), "hv": round(hv, 2),
                            "h": round(num(t.get("height")) or
                                       float(t.get("building:levels") or 4) * LEVEL_H, 2)})
            continue           # drawn by the landmark builder, not as a box

        # The 120 m cap rejects a bounding box too poor to be worth drawing.
        # It must not reject the BUILDING: WestEnd is 322 x 305 m and was
        # being thrown away by both layers, so it simply was not there.
        too_big_for_a_box = hu > 120 or hv > 120
        if hu < 1.5 or hv < 1.2:
            continue
        # height: an explicit tag first, then levels, then a guess from what
        # the building says it is. Only 253 of 74k carry a height and 6650
        # carry levels, so most of this is the guess.
        h = None
        ht = t.get("height")
        if ht:
            try: h = float(str(ht).split()[0])
            except ValueError: h = None
        if h is None:
            lv = t.get("building:levels")
            try:
                h = float(lv) * LEVEL_H if lv else None
            except ValueError:
                h = None
        # The royal palace is mapped as one relation with building:levels=3.
        # It is five storeys to the courtyard and more to the Danube, about
        # 24 m to the cornice; the dome is a model (key budavar).
        if (t.get("name") or "") == "Budavári Palota" and not t.get("height"):
            h = 24.0
            obx, oby = ox, oy
            # the dome over the Danube wing: OSM has no part for it, so its
            # position is the coordinate Wikipedia gives for the palace
            # (47°29'46"N 19°02'23"E), which is the dome
            dxy = xy(47.49611, 19.03972)
            anchors.append({"key": "budavar", "name": "Budavári Palota",
                            "x": round(dxy[0], 2), "y": round(dxy[1], 2), "ang": round(ang, 5),
                            "hu": round(hu, 2), "hv": round(hv, 2), "h": 24.0,
                            "cx": round(ox, 2), "cy": round(oy, 2)})
        # (the palace's dome anchor above is made even when the city tiles
        # draw the palace itself)
        if EXCLUDE_CITY and in_city(lat, lon):
            skipped += 1
            continue                           # drawn by the city tiles
        kind = t["building"]
        cls = CLS.get(kind, CLS.get(t.get("amenity", ""), 0))
        if (t.get("name") or "") == "Budavári Palota":
            cls = 8                                  # stone, tall windows
        name = t.get("name") or ""
        low = name.lower()

        # Named railway structures. These are the ones that make the Budapest
        # end legible from a train, and OSM carries the footprint but almost
        # never the height, so a shed ends up at the 7 m of a bungalow.
        rail_shed = ("fűtőház" in low or "futohaz" in low
                     or "járműjavító" in low or "jarmujavito" in low
                     or t.get("railway") in ("engine_shed", "workshop")
                     or t.get("landuse") == "railway")
        water_tower = ("víztorony" in low or "viztorony" in low
                       or t.get("man_made") == "water_tower")
        # A tank is a cylinder, and OSM maps it as a twenty-node circle, so the
        # polygon layer already gives it the right shape — what it has not got
        # is a height, and a 44 m tank standing 9 m tall is a paddling pool.
        # Height from the span, which is how tanks are actually proportioned.
        tank = t.get("man_made") == "storage_tank"
        # A tower is whatever kind of tower it says it is. Salamon-torony and
        # the campanile carry real heights; the bell towers do not.
        tower_type = t.get("man_made") == "tower" and (t.get("tower:type") or "")
        if water_tower:
            cls, h = 3, 32.0
        elif rail_shed:
            cls, h = 3, 13.5
        elif tank and h is None:
            cls, h = 3, max(6.0, min(26.0, max(hu, hv) * 2 * 0.75))
        elif tower_type and h is None:
            cls = 8
            h = {"bell_tower": 18.0, "campanile": 22.0, "observation": 20.0,
                 "communication": 30.0, "defensive": 16.0}.get(tower_type, 14.0)
        elif kind in ("train_station", "station"):
            cls = 2
        area = 4 * hu * hv
        crowd = around(lat, lon)
        # A works hall is not a bungalow either. Sixty industrial footprints
        # over 6000 m² carry no height at all — the Dunakeszi carriage works,
        # the Göd battery plant and the Vác cement works among them, none of
        # which OSM names here, so there is nothing to match on but the size.
        # A hall that big is 12 to 18 m to the eaves, never 9.
        works = kind in ("yes", "industrial", "warehouse", "factory", "manufacture", "storage") \
                and not t.get("building:levels") and on_rail_land(ox, oy)
        if h is None and (kind in ("industrial", "warehouse", "factory") or works) and area > 6000:
            h = (26.0 if area > 100000 else 22.0 if area > 60000 else 18.0 if area > 30000
                 else 15.0 if area > 15000 else 12.0)   # a battery gigafactory hall is not a barn
            cls = 3
        if h is None:
            h = DEFAULT_H.get(kind, 7.0)
            covered, mean_fp = cover_mean(lat, lon)
            # an untyped building in a dense block is a bérház, not a cottage
            # — in a real city block: well covered, with big footprints
            if kind in ("yes", "residential") and crowd > 26 and covered >= 0.26 and mean_fp >= 300:
                if area > 420 and crowd > 60: h, cls = 19.0, 9
                elif area > 260: h, cls = 15.5, 9
                elif area > 150: h, cls = 11.5, 9
            # and in a village or a garden suburb a small untagged house is
            # one storey under its roof, a shed less
            elif kind in ("yes", "house", "detached", "residential", "semidetached_house") and covered < 0.26:
                if area < 60:
                    h = 3.2
                elif area < 220:
                    h = 4.6

        # A panelház is long, narrow, tall and rectangular. The proportions
        # are the giveaway: 45–120 m of frontage, 10–16 m deep, four storeys
        # or more. Where OSM gives no levels, a block of that footprint is
        # assumed to be one, because in this corridor it almost always is.
        long_side, short_side = max(hu, hv) * 2, min(hu, hv) * 2
        slabby = long_side > 42 and 9 < short_side < 17 and long_side / short_side > 3.2
        if slabby and kind in ("apartments", "residential", "yes"):
            cls = PANEL
            if not t.get("building:levels") and not ht:
                h = 10 * LEVEL_H if long_side > 60 else 4 * LEVEL_H
        elif kind == "apartments" and h >= 18:
            cls = PANEL

        # Ruins (the Aquincum amphitheatre is one, a multipolygon round an open
        # arena) are low roofless walls, not a solid block with a lid
        ruin = t.get("historic") in ("ruins", "archaeological_site") or kind == "ruins" or t.get("ruins") == "yes"
        if ruin:
            cls, h = 13, (h if t.get("height") else 3.5)
        # Stadiums and sports halls are not tenements (the Puskás Aréna and
        # the Papp László Sportaréna had rows of flats' windows): class 14,
        # an arena. A big lone footprint with no levels, out of the dense
        # blocks, is a hall of some kind, not a block of flats either.
        sport = kind in ("stadium", "sports_hall", "grandstand", "sports_centre", "arena", "pavilion") \
                or t.get("leisure") in ("stadium", "sports_centre", "sports_hall", "ice_rink")
        if sport:
            cls = 14
            if not t.get("height") and not t.get("building:levels"):
                h = 26.0 if area > 20000 else 16.0 if area > 5000 else 9.0
        elif (kind in ("yes", "public", "commercial") and area > 4000 and crowd < 40
              and not t.get("building:levels") and not t.get("height") and cls in (0, 9)):
            cls = 12
            h = 14.0 if area > 12000 else 10.0
        # What the façade shader should draw (FACADE_GLSL): glass for offices,
        # a blank box with a shopfront for big shops, nothing for warehouses,
        # and for anything on railway land a hall rather than a tenement.
        if cls not in (1, 2, PANEL, 13, 14):
            if kind == "office" or (kind == "commercial" and h >= 14):
                cls = 10
            elif (kind in ("retail", "supermarket", "commercial") or t.get("shop") in
                  ("supermarket", "mall", "department_store", "doityourself")) and area > 900:
                cls = 11
            elif kind in ("warehouse", "hangar", "storage", "depot", "service", "transportation"):
                cls = 12
            elif kind == "hotel":
                cls = 9
            elif ((ox and on_rail_land(ox, oy)) and kind not in ("house", "residential", "apartments", "detached")
                  # a hut, a boathouse, a pub or a hotel on industrial land is
                  # still a hut, a boathouse, a pub or a hotel (Népsziget: the
                  # rowing clubs and the Partizán Hajó had become sheds)
                  and area >= 220
                  and not any(t.get(k) for k in ("name", "amenity", "tourism", "leisure", "shop", "office", "historic"))):
                cls = 3
        h = max(2.5, min(70.0, h))
        # flat roof: everything industrial, commercial or prefabricated. A
        # hipped roof on a factory shed or a slab block is simply wrong.
        flat = 1 if cls in (PANEL, 3, 5, 8, 10, 11, 12, 14) or kind in (
            "industrial", "warehouse", "retail", "commercial", "office",
            "roof", "garages", "hangar", "supermarket") else 0
        # the real footprint, where it is worth having
        ring = simplify(pts[:-1] if pts[0] == pts[-1] else pts, 0.6)
        if len(ring) > 2 and ring[0] == ring[-1]:
            ring = ring[:-1]
        if area >= POLY_AREA and 3 <= len(ring) <= 96:
            rshape = t.get("roof:shape")
            rtype = ROOF.get(rshape, 0 if flat else 1)
            if rtype == 3 and area > 1500 and kind not in ("train_station", "station"):
                rtype = 6                      # a row of low vaults, not one hangar
            if cls == 13:
                rtype = 5                      # no roof: open to the sky
            elif kind in ("train_station", "station") and area > 1200 and not t.get("building:levels"):
                rtype = 3                      # a trainshed is a barrel vault
            elif rail_shed and area > 600:
                rtype = 3                      # so is an engine shed
            rh = 0.0
            try:
                rh = float(t.get("roof:height") or 0)
            except ValueError:
                rh = 0.0
            if rtype and rh <= 0:
                rh = min(4.5, max(1.8, h * 0.28))
            tris = ear_clip(ring)
            if tris:
                cx2 = sum(q[0] for q in ring) / len(ring)
                cy2 = sum(q[1] for q in ring) / len(ring)
                ppack += struct.pack("<ffHBBBB", cx2, cy2,
                                     min(65535, int(h * 10)), cls,
                                     rtype, len(ring), min(255, len(tris)))
                ppack += struct.pack("<H", min(65535, int(rh * 100)))
                for q in ring:
                    ppack += struct.pack("<hh",
                        max(-32767, min(32767, int((q[0]-cx2) * 10))),
                        max(-32767, min(32767, int((q[1]-cy2) * 10))))
                for a, b, c in tris[:255]:
                    ppack += struct.pack("<BBB", a, b, c)
                wc = osm_colour(t.get("building:colour"))
                rc = osm_colour(t.get("roof:colour"))
                if wc or rc:
                    pcolours.append([pcount, [round(x, 3) for x in wc] if wc else None,
                                     [round(x, 3) for x in rc] if rc else None])
                pcount += 1
                ptri += len(tris)
                poly_ids.add(id(e))
                continue                       # not also drawn as a box

        if too_big_for_a_box:
            continue                       # no footprint and no box: skip it
        bpack += struct.pack("<ffHHHHBB", ox, oy,
                             min(65535, int(hu * 10)), min(65535, int(hv * 10)),
                             int((ang % math.pi) / math.pi * 65535),
                             min(65535, int(h * 10)), cls, flat)
        bcount += 1

    # service roads and tracks were dropped before; without them a village is
    # a handful of houses with no lanes between them
    RCLS = {"motorway_link": 0, "trunk_link": 1, "primary_link": 1, "secondary_link": 2,
            "tertiary_link": 3, "living_street": 5, "pedestrian": 6,
            "motorway": 0, "trunk": 0, "primary": 1, "secondary": 2, "tertiary": 3,
            "unclassified": 4, "residential": 4, "service": 5, "track": 6}
    RWIDTH = [11.0, 8.5, 7.5, 6.5, 5.5, 3.6, 3.2]
    NARROW_R = 420.0
    rpack, rcount, rpts = bytearray(), 0, 0
    rids = []
    # Railway bridges (any length) along this line: a road that crosses one
    # passes UNDER the railway, even if OSM does not tag the road as a tunnel
    # (Váci út under line 2 at Újpest). Without this the road was laid on the
    # corridor at rail level and climbed over the track.
    rail_br = []
    for fname in ([f"data/raw/{LINE}.json", f"data/raw/{LINE}_rails.json"] +
                  (["data/raw/infra_ways.json"] if LINE == "line70" else [])):
        try:
            for e in json.load(open(fname, encoding="utf-8"))["elements"]:
                tg = e.get("tags") or {}
                if e.get("type") == "way" and tg.get("railway") and tg.get("bridge") and tg.get("bridge") != "no" and e.get("geometry"):
                    rail_br.append([xy(p["lat"], p["lon"]) for p in e["geometry"]])
        except FileNotFoundError:
            pass
    def seg_x(a, b, c, d):
        def cr(o, p, q): return (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
        return (cr(a, b, c) * cr(a, b, d) < 0) and (cr(c, d, a) * cr(c, d, b) < 0)
    def under_rail_bridge(pts):
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        for rb in rail_br:
            if max(q[0] for q in rb) < min(xs) or min(q[0] for q in rb) > max(xs) or \
               max(q[1] for q in rb) < min(ys) or min(q[1] for q in rb) > max(ys):
                continue
            for a, b in zip(pts, pts[1:]):
                for c, d in zip(rb, rb[1:]):
                    if seg_x(a, b, c, d): return True
        return False
    n_under = 0
    for e in els:
        t = e.get("tags", {})
        hw = t.get("highway")
        if hw not in RCLS:
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        mid = g[len(g) // 2]
        if CITY:
            off, limit = (0.0, 1.0) if in_city(mid["lat"], mid["lon"]) else (2.0, 1.0)
        else:
            _, off, _ = DOWN.snap(mid["lat"], mid["lon"])
            limit = CITY_ROAD_R if mid["lat"] < 47.65 else (NARROW_R if RCLS[hw] >= 5 else ROAD_R)
            # The other lines' towns had houses and no streets (owner: "missing
            # roads in Esztergom, and near and after Dabas"): the buildings are
            # kept to 3 km, the roads were cut at 600 m (420 for small ones).
            # Keep them as far as the extracts reach, and in the Esztergom –
            # Párkány box as far as the buildings.
            if LINE == "line70" and in_szentendre(mid["lat"], mid["lon"]):
                limit = 8000.0
            if LINE != "line70":
                limit = max(limit, 1600.0 if RCLS[hw] <= 4 else 900.0)
                if 47.770 <= mid["lat"] <= 47.825 and 18.690 <= mid["lon"] <= 18.775:
                    limit = BUILD_R
        # A big bridge is visible from much further than a street is. Margit
        # híd was downloaded and then dropped here — 1.9 km out against a
        # 600 m road limit — which left the Danube with no bridge on it at
        # the Budapest end. Bridges of secondary class and up are kept as far
        # as the buildings are.
        if not CITY and t.get("bridge") and t.get("bridge") != "no" and RCLS[hw] <= 2:
            limit = BUILD_R if mid["lat"] >= 47.65 else CITY_R
        if off > limit:
            continue
        pts = simplify([xy(p["lat"], p["lon"]) for p in g], 3.0)
        if len(pts) < 2 or len(pts) > 250:
            continue
        # A bridge deck is a straight line between its abutments, so the
        # renderer needs to know which ways are bridges — 144 of them, and
        # they include Ferdinánd híd over the whole Nyugati throat and
        # Hungária körút over the line at Rákosrendező.
        # `bridge=yes` says the road is carried over SOMETHING — a stream, a
        # dip, another road. It does not say it is carried over the railway,
        # and Dózsa György út is exactly the case that catches you out: the
        # line crosses it, not the reverse. Lifting every tagged bridge to
        # railway clearance put decks in the air over roads that run beside
        # and below the track. So record whether the way actually crosses the
        # down line, and let the renderer give clearance only to those.
        # Whether a bridge crosses the railway is measured along the way, not
        # at its vertices. A bridge over a wide throat has NO vertex near the
        # track — Ferdinánd híd spans fourteen roads in one 2-point way, and
        # its nearest vertex is 39 m from the down line while the way itself
        # passes 2 m from it. Tested by vertex it was not a railway bridge at
        # all, so it got 1.8 m of clearance instead of 6.6 and sat on the
        # tracks. This is the same mistake the level crossings made, and the
        # same fix: walk the segments.
        dense = []
        for i in range(len(g) - 1):
            a, b = g[i], g[i + 1]
            seg = math.hypot((b["lon"] - a["lon"]) * MLON, (b["lat"] - a["lat"]) * MLAT)
            n = max(1, int(seg / 6.0))
            for k in range(n):
                f = k / n
                dense.append((a["lat"] + (b["lat"] - a["lat"]) * f,
                              a["lon"] + (b["lon"] - a["lon"]) * f))
        dense.append((g[-1]["lat"], g[-1]["lon"]))
        near_rail = min((DOWN.snap(la, lo)[1] for la, lo in dense), default=9999)

        br = 0
        if t.get("bridge") and t.get("bridge") != "no":
            br = 2 if near_rail < 26 else 1
        # A road in a cutting or a subway under the line is not a bridge — it
        # is the opposite, and it needs to be DUG. 3 marks it for the renderer.
        if t.get("tunnel") or str(t.get("layer", "0")).startswith("-"):
            br = 3 if near_rail < 40 else 0
            # A road tunnel away from the railway (the Alagút under Castle
            # Hill) was drawn over the top of the hill. It is not drawn; its
            # ends get a portal (landmarks.js, key "portal").
            if br == 0 and t.get("tunnel") == "yes":
                if RCLS[hw] <= 4 and len(pts) >= 2:
                    L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                    if L > 60:
                        for (ax, ay), (bx, by) in ((pts[0], pts[1]), (pts[-1], pts[-2])):
                            anchors.append({"key": "portal", "name": t.get("name") or "alagút",
                                            "x": round(ax, 2), "y": round(ay, 2),
                                            "ang": round(math.atan2(by - ay, bx - ax), 4),
                                            "hu": 3.0, "hv": max(4.0, RWIDTH[RCLS[hw]] * 0.5 + 1.5), "h": 7.5})
                continue
        elif not br and near_rail < 12 and under_rail_bridge([xy(la, lo) for la, lo in dense[::2]] + [xy(*dense[-1])]):
            br = 3; n_under += 1
        # Lanes, from the `lanes` tag where OSM has it (about a fifth of the
        # roads here, mostly the main ones), else a default by class. Oneway
        # is its own flag: a one-way street's lanes all run the same way.
        oneway = 1 if t.get("oneway") in ("yes", "1", "true") or hw == "motorway" else 0
        try:
            lanes = int(str(t.get("lanes", "")).split(";")[0])
        except ValueError:
            lanes = 0
        if lanes <= 0:
            lanes = {0: 4, 1: 2, 2: 2, 3: 2, 4: 2}.get(RCLS[hw], 1)
            if oneway and RCLS[hw] >= 1: lanes = 1 if RCLS[hw] >= 3 else 2
        lanes = max(1, min(8, lanes))
        rpack += struct.pack("<BBBBH", RCLS[hw], br, lanes, oneway, len(pts))
        rids.append(e.get("id", 0))
        for x, y in pts:
            rpack += struct.pack("<ff", x, y)
        rcount += 1
        rpts += len(pts)

    print(f"roads under railway bridges (dug): {n_under}")
    for a in list(anchors):
        d = DERIVED.get(a["name"])
        if d:
            key, du, dv = d
            c, sn = math.cos(a["ang"]), math.sin(a["ang"])
            anchors.append({"key": key, "name": key,
                            "x": round(a["x"] + du * c - dv * sn, 2),
                            "y": round(a["y"] + du * sn + dv * c, 2),
                            "ang": a["ang"], "hu": 55.0, "hv": 40.0, "h": 12.0})

    # ---- yard tracks
    # Only the two running lines were ever drawn, so Nyugati's throat, the
    # whole of Rákosrendező and every station's loops and sidings were bare
    # ballast. All of it is already downloaded — 979 ways in infra_ways.json.
    # Each point carries its chainage and offset from the down line, worked
    # out here where the Chainer lives, so the renderer can put a yard track
    # at rail level inside the corridor and on the ground outside it.
    RAILCLS = {"rail": 0, "narrow_gauge": 1, "disused": 2, "abandoned": 3,
               "construction": 2}
    tpack, tcount, tpts = bytearray(), 0, 0
    try:
        rails = json.load(open("data/raw/infra_ways.json", encoding="utf-8"))["elements"]
    except Exception:
        rails = []
    # line 2's own loops and sidings (q_line2_rails.ql); infra_ways is line 70's
    if os.path.exists(f"data/raw/{LINE}_rails.json"):
        have = {e["id"] for e in rails}
        rails += [e for e in json.load(open(f"data/raw/{LINE}_rails.json", encoding="utf-8"))["elements"]
                  if e.get("type") == "way" and e["id"] not in have]
    for e in rails:
        rw = e.get("tags", {}).get("railway")
        if rw not in RAILCLS:
            continue
        g = e.get("geometry") or []
        if len(g) < 2:
            continue
        pts = []
        for q in g:
            ch, off, _ = DOWN.snap(q["lat"], q["lon"])
            if off > 900:
                continue
            x, y = xy(q["lat"], q["lon"])
            pts.append((x, y, ch, off))
        if len(pts) < 2:
            continue
        tpack += struct.pack("<BBH", RAILCLS[rw], 0, len(pts))
        for x, y, ch, off in pts:
            tpack += struct.pack("<fffH", x, y, ch, min(65535, int(off)))
        tcount += 1
        tpts += len(pts)
    print(f"yard tracks {tcount} ways, {tpts} points, {len(tpack)/1e6:.2f} MB packed")

    # ---- freestanding structures
    #
    # Everything above filters on ["building"], so anything OSM maps as a bare
    # man_made feature has never been in this project's data at all: chimneys,
    # silos, tanks, gasometers, lighting masts. That is the real reason the
    # cement works had no chimney — not that the data lacks one, but that we
    # never asked. `q_structures.ql` asks.
    #
    # Almost none of them carry a height (7 chimneys of 43), so height comes
    # from the kind — and, for the industrial ones, from the SIZE OF THE SITE
    # ---- structures (towers, chimneys, tanks)
    # The site landmarks: heavy industry, cement works, chemical plants. Each is
    # anchored to the site polygon: centre, principal axis and extent, exactly
    # as a landmark is anchored to a footprint. Nothing is typed.
    # Only the cement works keeps an invented superstructure: OSM has its
    # halls but not the preheater tower and kilns that make it a cement works.
    # Samsung SDI and Dunakeszi Járműjavító had invented halls too; their real
    # buildings are in OSM (industry_osm.json) at their true size, and the
    # models stood on top of them.
    SITE_LANDMARK = [("cementworks", ("cement", "ddc"))]
    SITE = []                       # (name, area m2, [ (x,y) ring ])
    try:
        lc = json.load(open("data/raw/landcover.json", encoding="utf-8"))["elements"]
        if LINE != "line70" and os.path.exists(f"data/raw/landcover_{LINE}.json"):
            lc += json.load(open(f"data/raw/landcover_{LINE}.json", encoding="utf-8"))["elements"]
    except Exception:
        lc = []
    def ring_of(e):
        if e.get("type") == "way":
            return [xy(p["lat"], p["lon"]) for p in (e.get("geometry") or [])]
        pts = []
        for m in e.get("members", []):
            if m.get("role") == "outer":
                pts += [xy(p["lat"], p["lon"]) for p in (m.get("geometry") or [])]
        return pts
    for e in lc:
        t = e.get("tags") or {}
        if t.get("landuse") not in ("industrial", "quarry", "railway"):
            continue
        r = ring_of(e)
        if len(r) < 3:
            continue
        cx = sum(q[0] for q in r) / len(r); cy = sum(q[1] for q in r) / len(r)
        lat, lon = latlon(cx, cy)
        if DOWN.snap(lat, lon)[1] > BUILD_R + 900:
            continue
        area = 0.0
        for i in range(len(r)):
            a, b = r[i], r[(i + 1) % len(r)]
            area += a[0] * b[1] - b[0] * a[1]
        SITE.append((t.get("name") or "", abs(area) / 2, r))
    SITE.sort(key=lambda s: -s[1])

    for key, words in SITE_LANDMARK:
        best = None
        for name, area, ring in SITE:
            low = name.lower()
            if not any(wd in low for wd in words):
                continue
            if best is None or area > best[1]:
                best = (name, area, ring)
        if not best:
            continue
        name, area, ring = best
        cx = sum(q[0] for q in ring) / len(ring)
        cy = sum(q[1] for q in ring) / len(ring)
        # principal axis by edge length in doubled angle — the same reduction
        # the trainshed uses, and for the same reason: a works is rectilinear
        # and its walls know its grid better than any bounding box does
        sx = sy = 0.0
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 1: continue
            th = math.atan2(dy, dx)
            sx += L * math.cos(2 * th); sy += L * math.sin(2 * th)
        ang = 0.5 * math.atan2(sy, sx)
        hu = max(abs((q[0] - cx) * math.cos(ang) + (q[1] - cy) * math.sin(ang))
                 for q in ring)
        hv = max(abs(-(q[0] - cx) * math.sin(ang) + (q[1] - cy) * math.cos(ang))
                 for q in ring)
        lat, lon = latlon(cx, cy)
        ch, off, _ = DOWN.snap(lat, lon)
        anchors.append({"key": key, "name": name,
                        "x": round(cx, 2), "y": round(cy, 2), "ang": round(ang, 5),
                        "hu": round(hu, 2), "hv": round(hv, 2), "h": 0.0})
        print(f"  site      {key:12s} {name[:28]:28s} ({cx:.0f},{cy:.0f}) "
              f"{hu*2:.0f}x{hv*2:.0f} m  km {ch/1000:.1f}, {off:.0f} m out")

    def site_of(x, y):
        """The smallest named site containing this point — smallest, because a
        works sits inside a district and the works is the informative one."""
        best = None
        for name, area, r in SITE:
            n, inside = len(r), False
            j = n - 1
            for i in range(n):
                if (r[i][1] > y) != (r[j][1] > y) and \
                   x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1] + 1e-9) + r[i][0]:
                    inside = not inside
                j = i
            if inside and (best is None or area < best[1]):
                best = (name, area)
        return best

    # kind -> (class, default height m, default radius m)
    SKIND = {"chimney": (0, 30.0, 1.9), "silo": (1, 24.0, 4.2),
             "storage_tank": (2, 11.0, 7.0), "gasometer": (2, 22.0, 14.0),
             "water_tower": (3, 32.0, 4.0), "cooling": (2, 30.0, 12.0),
             "communication": (4, 40.0, 1.6), "lighting": (5, 26.0, 0.9),
             "observation": (4, 22.0, 2.2), "watchtower": (4, 18.0, 2.0),
             "crane": (6, 22.0, 3.0),
             "power_tower": (7, 34.0, 4.2), "pylon": (7, 34.0, 4.2)}
    spack, scount = bytearray(), 0
    sseen = Counter()
    try:
        structs = json.load(open("data/raw/structures_osm.json", encoding="utf-8"))["elements"]
        if LINE != "line70" and os.path.exists(f"data/raw/{LINE}_extras.json"):
            structs += [e for e in json.load(open(f"data/raw/{LINE}_extras.json", encoding="utf-8"))["elements"]
                        if (e.get("tags") or {}).get("man_made")]
    except Exception:
        structs = []
    # Millennium Monument at Hősök tere (Budapest XIV, Városliget, km 1.6)
    hx, hy = xy(47.5149, 19.0778)
    anchors.append({"key": "hosok", "name": "Millenniumi emlékmű",
                    "x": round(hx, 2), "y": round(hy, 2),
                    "ang": 0.58 + math.pi, "hu": 45.0, "hv": 25.0, "h": 36.0})
    print(f"  landmark  hosok        Millenniumi emlékmű          ({hx:.0f},{hy:.0f})")

    # Visegrádi Fellegvár (High Castle Citadel on the mountain peak, km 43.0)
    vx, vy = xy(47.79367, 18.98032)
    anchors.append({"key": "fellegvar", "name": "Visegrádi Fellegvár",
                    "x": round(vx, 2), "y": round(vy, 2),
                    "ang": 0.35, "hu": 65.0, "hv": 45.0, "h": 28.0})
    print(f"  landmark  fellegvar    Visegrádi Fellegvár          ({vx:.0f},{vy:.0f})")

    # Salamon-torony (Solomon's Keep on the Danube bank, km 42.8)
    sx, sy = xy(47.79640, 18.97715)
    anchors.append({"key": "salamon", "name": "Salamon-torony",
                    "x": round(sx, 2), "y": round(sy, 2),
                    "ang": -0.42, "hu": 22.0, "hv": 22.0, "h": 32.0})
    print(f"  landmark  salamon      Salamon-torony               ({sx:.0f},{sy:.0f})")




    # Erzsébet híd (1964): a white single-span suspension bridge. Anchored on
    # its OSM deck (the far pair of its ways in downtown_osm.json, 499 m with
    # the Pest ramp); the model finds the river along the axis and stands its
    # pylons on the two banks (landmarks.js "erzsebet")
    ea, eb = xy(47.4921407, 19.052848), xy(47.4900993, 19.046942)
    anchors.append({"key": "erzsebet", "name": "Erzsébet híd",
                    "x": round((ea[0] + eb[0]) / 2, 2), "y": round((ea[1] + eb[1]) / 2, 2),
                    "ang": round(math.atan2(eb[1] - ea[1], eb[0] - ea[0]), 5),
                    "hu": round(math.hypot(eb[0] - ea[0], eb[1] - ea[1]) / 2, 1), "hv": 14.0, "h": 40.0})
    print(f"  landmark  erzsebet     Erzsébet híd")

    # Megyeri híd (M0 Danube Cable-Stayed Bridge, km 12.2)
    anchors.append({"key": "megyeri", "name": "Megyeri híd",
                    "x": round(from70(23594.3, 16934.5)[0], 2), "y": round(from70(23594.3, 16934.5)[1], 2),
                    "ang": 2.6458, "hu": 935.0, "hv": 35.0, "h": 100.0})
    print(f"  landmark  megyeri      Megyeri híd                  (23594,16935)")

    # Északi összekötő vasúti híd (Újpesti vasúti híd, km 7.2)
    anchors.append({"key": "eszakivasut", "name": "Újpesti vasúti híd",
                    "x": round(from70(22260.0, 11719.4)[0], 2), "y": round(from70(22260.0, 11719.4)[1], 2),
                    "ang": 2.7489, "hu": 540.0, "hv": 16.0, "h": 22.0})
    print(f"  landmark  eszakivasut  Újpesti vasúti híd           (22260,11719)")

    # Árpád híd (km 4.2)
    anchors.append({"key": "arpadhid", "name": "Árpád híd",
                    "x": round(from70(21224.8, 8923.7)[0], 2), "y": round(from70(21224.8, 8923.7)[1], 2),
                    "ang": 2.9372, "hu": 959.0, "hv": 28.0, "h": 16.0})
    print(f"  landmark  arpadhid     Árpád híd                    (21225,8924)")

    # Margit híd (Margaret Bridge with Margitsziget branch, km 2.5)
    anchors.append({"key": "margithid", "name": "Margit híd",
                    "x": round(from70(20325.0, 6465.0)[0], 2), "y": round(from70(20325.0, 6465.0)[1], 2),
                    "ang": 0.0, "hu": 360.0, "hv": 18.0, "h": 22.0})
    print(f"  landmark  margithid    Margit híd                   (20325,6465)")

    # Váci Diadalív (Stone Triumphal Arch of Vác, km 34.0)
    dx, dy = xy(47.7845, 19.1275)
    anchors.append({"key": "diadaliv", "name": "Váci Diadalív",
                    "x": round(dx, 2), "y": round(dy, 2),
                    "ang": 0.15, "hu": 12.0, "hv": 8.0, "h": 15.0})
    print(f"  landmark  diadaliv     Váci Diadalív                ({dx:.0f},{dy:.0f})")

    # Országház (Hungarian Parliament Building, southern skyline, facing Danube west)
    anchors.append({"key": "parlament", "name": "Országház",
                    "x": round(from70(20488.8, 5627.1)[0], 2), "y": round(from70(20488.8, 5627.1)[1], 2),
                    "ang": 1.5708, "hu": 135.0, "hv": 62.0, "h": 96.0})
    print(f"  landmark  parlament    Országház                    (20489,5627)")

    # Széchenyi Lánchíd (Chain Bridge - georeferenced OSM centerline between Buda & Pest)
    anchors.append({"key": "lanchid", "name": "Széchenyi Lánchíd",
                    "x": round(from70(20340.0, 4728.0)[0], 2), "y": round(from70(20340.0, 4728.0)[1], 2),
                    "ang": 2.8608, "hu": 221.0, "hv": 18.0, "h": 48.0})
    print(f"  landmark  lanchid      Széchenyi Lánchíd            (20340,4728)")

    # Szent István-bazilika (St. Stephen's Basilica dome, facing west)
    anchors.append({"key": "bazilika", "name": "Szent István-bazilika",
                    "x": round(from70(21104.6, 4937.8)[0], 2), "y": round(from70(21104.6, 4937.8)[1], 2),
                    "ang": 1.5708, "hu": 45.0, "hv": 35.0, "h": 96.0})
    print(f"  landmark  bazilika     Szent István-bazilika        (21105,4938)")

    # Gellért-hegy & Szabadság-szobor (Citadel & Liberty Statue on mountain crest)
    anchors.append({"key": "gellert", "name": "Gellért-hegy és Szabadság-szobor",
                    "x": round(from70(20661.5, 3358.9)[0], 2), "y": round(from70(20661.5, 3358.9)[1], 2),
                    "ang": 0.0, "hu": 80.0, "hv": 60.0, "h": 135.0})
    print(f"  landmark  gellert      Gellért-hegy                 (20662,3359)")

    # ---- landmarks re-anchored to their OSM geometry. Gemini typed these
    # coordinates by hand and several stood beside the real thing, so there
    # were two Chain Bridges. A bridge takes its centre, direction and half
    # length from the chain of its OSM ways (the two points furthest apart);
    # a building takes its outline's oriented box.
    def far_pair(pts):
        best = (0, pts[0], pts[-1])
        for i in range(0, len(pts), max(1, len(pts) // 60)):
            for j in range(i + 1, len(pts), max(1, len(pts) // 60)):
                d = math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
                if d > best[0]: best = (d, pts[i], pts[j])
        return best
    BRIDGE_OF = {"lanchid": ("Széchenyi lánchíd", ("tertiary",)),
                 "margithid": ("Margit híd", ("secondary",)),
                 "arpadhid": ("Árpád híd", ("primary",)),
                 "megyeri": ("Megyeri híd", ("trunk", "motorway")),
                 "maria_valeria": ("Mária Valéria híd", ("secondary",))}
    for key, (nm, cls) in BRIDGE_OF.items():
        pts = [xy(p["lat"], p["lon"]) for e in LMW if e["type"] == "way"
               and e["tags"].get("name") == nm and e["tags"].get("highway") in cls
               for p in e.get("geometry", [])]
        if len(pts) < 2:
            continue
        d, a_, b_ = far_pair(pts)
        rec = next((a for a in anchors if a["key"] == key), None)
        if rec is None:
            rec = {"key": key, "name": nm, "h": 30.0, "hv": 14.0}
            anchors.append(rec)
        rec.update({"x": round((a_[0] + b_[0]) / 2, 2), "y": round((a_[1] + b_[1]) / 2, 2),
                    "ang": round(math.atan2(b_[1] - a_[1], b_[0] - a_[0]), 5), "hu": round(d / 2, 1)})
        # Megyeri híd: the cable-stayed part is tagged bridge:structure=
        # suspension in OSM; its middle is the middle of the 300 m main span,
        # where the model's two pylons belong (they were placed from the
        # widest wet run along the axis, and stood off the bridge)
        if key == "megyeri":
            cs = [xy(p["lat"], p["lon"]) for e in LMW if e["type"] == "way"
                  and e["tags"].get("name") == nm and e["tags"].get("bridge:structure") in ("suspension", "cable-stayed")
                  for p in e.get("geometry", [])]
            if len(cs) >= 2 and far_pair(cs)[0] < 900:     # (OSM tags nearly the whole 1.8 km: no help)
                _, c0, c1 = far_pair(cs)
                mx, my = (c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2
                ca, sa = math.cos(rec["ang"]), math.sin(rec["ang"])
                rec["mu"] = round((mx - rec["x"]) * ca + (my - rec["y"]) * sa, 1)
                rec["mv"] = round(-(mx - rec["x"]) * sa + (my - rec["y"]) * ca, 1)
                print(f"  megyeri main span centre at u {rec['mu']}, v {rec['mv']}")
        print(f"  anchored  {key:12s} to OSM: {d:.0f} m")
    # The Northern Railway Bridge is two bridges: the Danube crossing from
    # Óbuda to Népsziget, and a second one over the Újpest bay (the Népsziget
    # "öböl") to Angyalföld. They are the chains of line 2's bridge ways named
    # Újpesti vasúti híd; each chain gets its own model, sized to its length.
    # (Only the longest way was used before, so the bay had no bridge.)
    try:
        l2 = json.load(open("data/raw/line2.json", encoding="utf-8"))["elements"]
        br = [e for e in l2 if e["type"] == "way" and e.get("geometry")
              and "Újpesti vasúti híd" in ((e.get("tags") or {}).get("bridge:name") or (e.get("tags") or {}).get("name") or "")]
        chains = []
        for e in br:
            ends = [xy(e["geometry"][0]["lat"], e["geometry"][0]["lon"]), xy(e["geometry"][-1]["lat"], e["geometry"][-1]["lon"])]
            hit = [c for c in chains if any(math.hypot(p[0] - q[0], p[1] - q[1]) < 8 for p in ends for q in c["ends"])]
            if hit:
                c = hit[0]
                for o in hit[1:]:
                    c["pts"] += o["pts"]; c["ends"] += o["ends"]; chains.remove(o)
            else:
                c = {"pts": [], "ends": []}; chains.append(c)
            c["pts"] += [xy(p["lat"], p["lon"]) for p in e["geometry"]]; c["ends"] += ends
        anchors[:] = [a for a in anchors if a["key"] != "eszakivasut"]
        for c in chains:
            d, a_, b_ = far_pair(c["pts"])
            if d < 60: continue
            anchors.append({"key": "eszakivasut", "name": "Újpesti vasúti híd",
                            "x": round((a_[0] + b_[0]) / 2, 2), "y": round((a_[1] + b_[1]) / 2, 2),
                            "ang": round(math.atan2(b_[1] - a_[1], b_[0] - a_[0]), 5),
                            "hu": round(d / 2, 1), "hv": 8.0, "h": 22.0})
            print(f"  anchored  eszakivasut  to OSM: {d:.0f} m")
    except FileNotFoundError:
        pass
    # Lánchíd's towers are mapped (bridge:support=pylon, 36.35 m): the model
    # puts its towers on them rather than at a guessed spacing
    for rec in [a for a in anchors if a["key"] == "lanchid"]:
        ca, sa = math.cos(rec["ang"]), math.sin(rec["ang"])
        us = []
        for (px, py, *_rest) in pylons:
            u = (px - rec["x"]) * ca + (py - rec["y"]) * sa
            v = -(px - rec["x"]) * sa + (py - rec["y"]) * ca
            if abs(v) < 25 and abs(u) < rec["hu"] + 30: us.append(u)
        if len(us) == 2:
            mid = (us[0] + us[1]) / 2
            rec["x"] = round(rec["x"] + mid * ca, 2); rec["y"] = round(rec["y"] + mid * sa, 2)
            rec["tw"] = round(abs(us[1] - us[0]) / 2, 2)
            print(f"  lanchid towers from OSM pylons: {2 * rec['tw']:.1f} m apart")
    for key, nm in (("parlament", "Országház"), ("bazilika", "Szent István-bazilika")):
        rel = next((e for e in LMW if e["type"] == "relation" and e["tags"].get("name") == nm), None)
        if not rel:
            continue
        pts = [xy(p["lat"], p["lon"]) for m in rel.get("members", []) if m.get("role") == "outer"
               for p in m.get("geometry", [])]
        rec = next((a for a in anchors if a["key"] == key), None)
        if rec and len(pts) > 3:
            ox, oy, hu, hv, ang = obb(pts)
            if hv > hu: hu, hv, ang = hv, hu, ang + math.pi / 2
            rec.update({"x": round(ox, 2), "y": round(oy, 2), "ang": round(ang, 5),
                        "hu": round(hu, 1), "hv": round(hv, 1)})
            print(f"  anchored  {key:12s} to OSM outline {hu*2:.0f}x{hv*2:.0f} m")

    # the Parliament and the Bazilika are in OSM as 3D parts: draw the data
    for key in ("parlament", "bazilika"):
        rec = next((a for a in anchors if a["key"] == key), None)
        if rec and sum(1 for (cx, cy, _a) in part_poly if math.hypot(cx - rec["x"], cy - rec["y"]) < 90) >= 6:
            anchors.remove(rec)
            print(f"  {key}: drawn from {LINE} OSM building parts, model dropped")
    print(f"outlines replaced by their parts: {n_covered}")

    # a water tower already anchored as a landmark must not be drawn twice
    lm_xy = [(a["x"], a["y"]) for a in anchors]
    for e in structs:
        t = e.get("tags") or {}
        mm = t.get("man_made") or ""
        kind = t.get("tower:type") if mm == "tower" else mm
        if not kind and t.get("power") in ("tower", "pylon"):
            kind = "power_tower"
        if kind not in SKIND:
            continue
        g = e.get("geometry") or []
        if e.get("type") == "node":
            lat, lon = e["lat"], e["lon"]
            span = None
        elif g:
            lat = sum(p["lat"] for p in g) / len(g)
            lon = sum(p["lon"] for p in g) / len(g)
            pr = [xy(p["lat"], p["lon"]) for p in g]
            span = max(max(q[0] for q in pr) - min(q[0] for q in pr),
                       max(q[1] for q in pr) - min(q[1] for q in pr))
        else:
            continue
        if DOWN.snap(lat, lon)[1] > BUILD_R:
            continue
        x, y = xy(lat, lon)
        cls, h, rad = SKIND[kind]
        if span and span > 1.0:
            rad = span / 2
        ht = t.get("height")
        if ht:
            try: h = float(str(ht).split()[0])
            except ValueError: pass
        else:
            st = site_of(x, y)
            if st and kind in ("chimney", "silo", "storage_tank"):
                # 150000 m2 is a works; 15000 is a yard behind a shop
                if st[1] > 150000: h *= 2.2 if kind == "chimney" else 1.7
                elif st[1] > 40000: h *= 1.5 if kind == "chimney" else 1.25
        if kind == "water_tower" and any((x-a)**2 + (y-b)**2 < 900 for a, b in lm_xy):
            continue
        # 203 m is the FŐTÁV stack and 120 the Rákospalota incinerator, both
        # real, both tagged, and both landmarks of this line — a 110 m clamp
        # was quietly shortening them.
        h = max(5.0, min(220.0, h))
        rad = max(0.6, min(30.0, rad))
        spack += struct.pack("<ffHHH", x, y, int(h * 10), int(rad * 10), cls)
        scount += 1
        sseen[kind] += 1
    print(f"structures {scount}: " +
          ", ".join(f"{k} {v}" for k, v in sseen.most_common()))

    out = {
        "buildings": {"count": bcount,
                      "stride": 18,
                      "format": "f32 x, f32 y, u16 halfU dm, u16 halfV dm,"
                                " u16 rot/pi, u16 height dm, u8 class, u8 pad",
                      "data": base64.b64encode(bytes(bpack)).decode()},
        "polys": {"count": pcount, "format":
                  "f32 cx, f32 cy, u16 height dm, u8 class, u8 roof, u8 npts, "
                  "u8 ntri, u16 roofheight cm, npts x (i16 dx, i16 dy) dm, "
                  "ntri x (u8,u8,u8)",
                  "colours": pcolours,
                  "data": base64.b64encode(bytes(ppack)).decode()},
        "landmarks": anchors,
        "parts": parts,
        "structs": {"count": scount,
                    "format": "f32 x, f32 y, u16 height dm, u16 radius dm, u16 class",
                    "data": base64.b64encode(bytes(spack)).decode()},
        "rails": {"count": tcount,
                  "format": "per way: u8 class, u8 pad, u16 n, "
                            "then n * (f32 x, f32 y, f32 chainage, u16 offset)",
                  "data": base64.b64encode(bytes(tpack)).decode()},
        "roads": {"count": rcount, "widths": RWIDTH,
                  "format": "per way: u8 class, u8 bridge, u8 lanes, u8 oneway, u16 n, then n * (f32 x, f32 y)",
                  "lanes": True, "ids": rids,
                  "data": base64.b64encode(bytes(rpack)).decode()},
    }
    OUTF = "web/data/city_all.json" if CITY else f"web/data/context{SUFFIX}.json"
    if CITY:
        out["landmarks"] = [a for a in anchors if a["key"] == "portal"]
        out["structs"]["count"], out["structs"]["data"] = 0, ""
        out["rails"]["count"], out["rails"]["data"] = 0, ""
    json.dump(out, open(OUTF, "w"), separators=(",", ":"))
    for a in anchors:
        print(f"  landmark {a['key']:12s} {a['name'][:28]:28s} "
              f"({a['x']:.0f},{a['y']:.0f}) {a['hu']*2:.0f}x{a['hv']*2:.0f} m "
              f"{math.degrees(a['ang']):.0f} deg")
    print(f"footprints {pcount} polygons, {ptri} triangles, "
          f"{len(ppack)/1e6:.2f} MB packed")
    print(f"buildings kept {bcount} (dropped {skipped} beyond {BUILD_R:.0f} m), "
          f"{len(bpack)/1e6:.2f} MB packed")
    print(f"roads {rcount} ways, {rpts} points, {len(rpack)/1e6:.2f} MB packed")
    print(f"{OUTF} {os.path.getsize(OUTF)/1e6:.2f} MB")

main()
