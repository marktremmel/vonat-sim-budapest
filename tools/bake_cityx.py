#!/usr/bin/env python3
"""The city's extras, merged into the city tiles as their `x` layer.

    sh tools/fetch_cityx.sh            # data/raw/cityx/cityx_*.json (nine pieces)
    python3 tools/bake_cityx.py        # adds "x" to web/data/city/t_*.json

bake_city.py builds the tiles from buildings and roads only. The owner asked
for everything else a city has that you see from a train: every railway (not
only our own lines: Kőbánya-felső, the Keleti throat, the freight rings),
trams, the industry (tanks, chimneys, the Határ út TV tower, pipelines above
ground), power lines, solar farms, and names worth a label.

Per tile, coordinates in metres from the tile's corner, line 70's frame:
  rails   [kind, bridge, [x0, y0, x1, y1, …]]   kind 0 rail, 1 narrow/light,
          2 tram; tunnels and subways underground are left out
  structs [x, y, h, r, cls]                     structures.js classes (8: TV tower)
  pipes   [[x0, y0, …]]                         overground pipelines only
  solar   [[x0, y0, …]]                         solar farm outlines
  labels  [name, kind, x, y]                    kind: landmark | public
"""
import glob, json, math, os, sys
sys.path.insert(0, "tools")
from geo import frame

W = json.load(open("web/data/world.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
S, WEST, N, E = 47.39, 18.93, 47.58, 19.25
DLAT, DLON = 0.009, 0.0133

def xy(lat, lon):
    return ((lon - W["west"]) * MLON, (lat - W["south"]) * MLAT)
def tile_of_ll(lat, lon):
    return int((lat - S) // DLAT), int((lon - WEST) // DLON)
def origin(i, j):
    la0, lo0 = S + i * DLAT, WEST + j * DLON
    return (lo0 - W["west"]) * MLON, (la0 - W["south"]) * MLAT


def label_rank(t):
    """1: seen from far (viewpoints, castles, quarries, towers, attractions);
    2: named works and institutions; 3: close only (memorials, churches)."""
    if t.get("tourism") in ("viewpoint", "attraction", "museum", "zoo", "theme_park", "alpine_hut") \
       or t.get("historic") in ("castle", "ruins", "archaeological_site") \
       or t.get("landuse") == "quarry" or t.get("man_made") in ("tower", "water_tower", "communications_tower"):
        return 1
    if t.get("historic") in ("memorial", "monument", "wayside_cross", "wayside_shrine") or t.get("amenity") == "place_of_worship":
        return 3
    return 2
def ring_area(pts):
    return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2

tiles = {}
def T(k):
    if k not in tiles:
        tiles[k] = {"rails": [], "structs": [], "pipes": [], "solar": [], "labels": []}
    return tiles[k]

def num(v, dflt=None):
    try:
        return float(str(v).split()[0].replace(",", "."))
    except Exception:
        return dflt

seen = set()
els = []
for f in sorted(glob.glob("data/raw/cityx/cityx_*.json")):
    for e in json.load(open(f, encoding="utf-8"))["elements"]:
        if (e["type"], e["id"]) in seen: continue
        seen.add((e["type"], e["id"]))
        els.append(e)

# structure kinds: (class, default height, default radius)
SK = {"chimney": (0, 30.0, 1.9), "silo": (1, 24.0, 4.2), "storage_tank": (2, 11.0, 7.0),
      "gasometer": (2, 22.0, 14.0), "water_tower": (3, 32.0, 4.0), "mast": (4, 40.0, 1.6),
      "tower": (4, 22.0, 2.2), "crane": (6, 22.0, 3.0), "lighthouse": (3, 14.0, 2.0),
      "communications_tower": (8, 150.0, 5.0)}
# Towers OSM knows too little about: (lat, lon) → (class, height). The Határ
# út TV tower (Kispest, Szávay utca) is tagged a communication tower with no
# height or construction; it is a concrete tower with a pod. ~100 m is an
# estimate from photographs, not a survey.
KNOWN = {(47.4639, 19.1484): (8, 100.0, 5.0)}
def known(lat, lon):
    for (la, lo), v in KNOWN.items():
        if abs(la - lat) < 0.0006 and abs(lo - lon) < 0.0009: return v
    return None
counts = {"rails": 0, "structs": 0, "pipes": 0, "solar": 0, "labels": 0}
for e in els:
    t = e.get("tags") or {}
    geom = e.get("geometry") or []
    if e["type"] == "node":
        lat, lon = e["lat"], e["lon"]
    elif geom:
        lat = sum(p["lat"] for p in geom) / len(geom); lon = sum(p["lon"] for p in geom) / len(geom)
    else:
        continue
    if not (S <= lat < N and WEST <= lon < E): continue
    k = tile_of_ll(lat, lon); ox, oy = origin(*k)
    loc = lambda la, lo: [round(xy(la, lo)[0] - ox, 1), round(xy(la, lo)[1] - oy, 1)]
    flat = lambda: [c for p in geom for c in loc(p["lat"], p["lon"])]
    rw, mm, pw = t.get("railway"), t.get("man_made"), t.get("power")
    if rw and e["type"] == "way":
        if t.get("tunnel") in ("yes", "building_passage") or rw == "subway" and t.get("tunnel", "yes") != "no":
            continue
        kind = 2 if rw == "tram" else 1 if rw in ("narrow_gauge", "light_rail", "funicular") else 0
        T(k)["rails"].append([kind, 1 if t.get("bridge") in ("yes", "viaduct") else 0, flat()]); counts["rails"] += 1
    elif mm == "pipeline" and e["type"] == "way":
        if t.get("location") in ("overground", "overhead"):
            T(k)["pipes"].append(flat()); counts["pipes"] += 1
    elif pw in ("plant", "generator") and e["type"] == "way" and len(geom) > 3:
        if ring_area([xy(p["lat"], p["lon"]) for p in geom]) > 1500:      # a farm, not a roof
            T(k)["solar"].append(flat()); counts["solar"] += 1
    elif pw == "tower" and e["type"] == "node":
        h = num(t.get("height"), 34.0)
        T(k)["structs"].append(loc(lat, lon) + [round(h, 1), 4.2, 7]); counts["structs"] += 1
    elif mm in SK or (mm == "tower" and t.get("tower:type")):
        cls, h0, r0 = SK.get(mm, SK["tower"])
        tt = t.get("tower:type", "")
        if mm == "tower" and tt == "communication":
            h0 = 60.0
            if (t.get("tower:construction") in ("concrete", "freestanding") or num(t.get("height"), 0) > 90):
                cls, r0 = 8, 5.0                          # a TV tower, concrete, with a pod
        elif mm == "tower" and tt in ("lighting",): cls, h0, r0 = 5, 26.0, 0.9
        h = num(t.get("height"), h0)
        kn = known(lat, lon)
        if kn: cls, h, r0 = kn
        if e["type"] == "way" and geom:
            # a tank or a silo drawn as its outline: the radius from the ring
            cx, cy = xy(lat, lon)
            r0 = max(r0 if cls != 2 else 2.0, sum(math.hypot(xy(p["lat"], p["lon"])[0] - cx, xy(p["lat"], p["lon"])[1] - cy)
                                                  for p in geom) / len(geom))
            if cls == 2 and not t.get("height"): h = max(6.0, min(26.0, r0 * 1.5))
        T(k)["structs"].append(loc(lat, lon) + [round(h, 1), round(r0, 1), cls]); counts["structs"] += 1
    name = t.get("name")
    if name and (t.get("tourism") or t.get("historic") or t.get("amenity") or t.get("landuse")
                 or mm in ("tower", "water_tower", "communications_tower")):
        kind = "landmark" if (t.get("tourism") or t.get("historic") or mm) else "public"
        T(k)["labels"].append([name, kind] + loc(lat, lon) + [label_rank(t)]); counts["labels"] += 1

merged = 0
for (i, j), x in tiles.items():
    f = f"web/data/city/t_{i}_{j}.json"
    if not os.path.exists(f): continue
    body = json.load(open(f, encoding="utf-8"))
    body["x"] = x
    json.dump(body, open(f, "w"), separators=(",", ":"))
    merged += 1
print(f"cityx: {counts} into {merged} tiles")
