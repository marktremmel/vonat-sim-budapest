"""Façade zones: which façade-kit family a building gets, by where it is
(docs/FACADE_PLAN.md). Used by bake_context.py for the line contexts and the
city tiles.

    zones = Zones()                      # tools/facade_zones.json + data/raw/districts.json
    fb = zones.family(osm_id, lat, lon, cls, h, flat)

fb is the byte stored in the top four bits of the building's class byte
(class | fb << 4): 0 = no zone, the shader's own rule by class and height;
1..10 = family index + 1 (FAMILIES); 15 = procedural on purpose.

A zone is a circle [lat, lon, radius m], a box [south, west, north, east] or
a Budapest district by its OSM name ("XIII. kerület"). The first circle or box
that holds the building wins; then its district. A zone gives a mix per
building category; the shares are fractions, and what they leave is
procedural. A category a zone does not mention falls through to the next
zone (a district under a circle), then to the shader's rule.

The categories copy the shader's facadeKind (shaders.js), with the wall
height taken as the height less the default roof:
  house_low   houses (class 0 or 4, under 8 m) with walls under 5.6 m
  house_high  the same, walls 5.6 m and over
  tenement    class 9, or class 0 at 8 m and over
  flats       class 4 at 8 m and over (the shader's "modern flats")
  public      class 8 (schools, hospitals, offices of the state)
"""
import json, math, os, zlib

FAMILIES = ("tenement", "interwar", "cube", "village", "villa", "mav", "oldtown", "garden", "civic", "szocreal")
PROCEDURAL = 15


def category(cls, h, flat):
    wall = h - (0.0 if flat else min(4.5, max(1.8, h * 0.28)))
    if cls in (0, 4) and h < 8.0:
        return "house_low" if wall < 5.6 else "house_high"
    if cls == 9 or (cls == 0 and h >= 8.0):
        return "tenement"
    if cls == 4:
        return "flats"
    if cls == 8:
        return "public"
    return None


def _stitch(segs):
    rings, segs = [], [list(s) for s in segs if len(s) >= 2]
    while segs:
        ring = segs.pop(0)
        grew = True
        while grew and ring[0] != ring[-1]:
            grew = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:    ring += s[1:]
                elif s[-1] == ring[-1]: ring += s[::-1][1:]
                elif s[-1] == ring[0]:  ring = s[:-1] + ring
                elif s[0] == ring[0]:   ring = s[::-1][:-1] + ring
                else: continue
                segs.pop(i); grew = True; break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def _thin(ring, step):
    out = [ring[0]]
    for p in ring[1:-1]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= step:
            out.append(p)
    return out + [ring[-1]]


def _inside(lat, lon, ring):
    c = False
    for i in range(len(ring)):
        (ay, ax), (by, bx) = ring[i - 1], ring[i]
        if (ay > lat) != (by > lat) and lon < ax + (lat - ay) * (bx - ax) / (by - ay):
            c = not c
    return c


class Zones:
    def __init__(self, path="tools/facade_zones.json", districts="data/raw/districts.json"):
        self.zones, self.districts = [], {}
        if not os.path.exists(path):
            return
        spec = json.load(open(path, encoding="utf-8"))
        for z in spec["zones"]:
            mix = {}
            for cat, m in z.items():
                if cat in ("name", "circle", "box", "district", "note"):
                    continue
                acc, rows = 0.0, []
                for fam, share in m.items():
                    if fam not in FAMILIES:
                        raise SystemExit(f"facade_zones.json: {z['name']}: unknown family {fam}")
                    acc += share
                    rows.append((acc, FAMILIES.index(fam) + 1))
                if acc > 1.0001:
                    raise SystemExit(f"facade_zones.json: {z['name']} {cat}: shares add up to {acc:.2f}")
                mix[cat] = rows
            z = dict(z, mix=mix)
            if "circle" in z:
                la, lo, r = z["circle"]
                z["box"] = [la - r / 111200, lo - r / (111200 * math.cos(math.radians(la))),
                            la + r / 111200, lo + r / (111200 * math.cos(math.radians(la)))]
            self.zones.append(z)
        if os.path.exists(districts):
            for e in json.load(open(districts, encoding="utf-8"))["elements"]:
                segs = [[(p["lat"], p["lon"]) for p in m.get("geometry", [])]
                        for m in e.get("members", []) if m.get("role") == "outer"]
                # thinned to about 20 m steps: the test runs once per 100 m cell
                rings = [_thin(r, 0.0002) for r in _stitch(segs)]
                if rings:
                    bb = [min(p[0] for r in rings for p in r), min(p[1] for r in rings for p in r),
                          max(p[0] for r in rings for p in r), max(p[1] for r in rings for p in r)]
                    self.districts[e["tags"].get("name", "")] = (bb, rings)
        self.count, self._cell = {}, {}

    def district_of(self, lat, lon):
        """The district holding the point, decided once per 0.001° cell
        (about 110 × 75 m), so a block on a district border may go either way."""
        key = (round(lat, 3), round(lon, 3))
        if key not in self._cell:
            la, lo = key
            self._cell[key] = next((name for name, (bb, rings) in self.districts.items()
                                    if bb[0] <= la <= bb[2] and bb[1] <= lo <= bb[3]
                                    and any(_inside(la, lo, r) for r in rings)), None)
        return self._cell[key]

    def family(self, eid, lat, lon, cls, h, flat):
        cat = category(cls, h, flat)
        if cat is None or not self.zones:
            return 0
        dist = None
        # by the OSM id (a relation's outline has a string id), the same every bake
        r = zlib.crc32(str(eid).encode()) / 4294967296.0
        for z in self.zones:
            if "box" in z:
                s, w, n, e = z["box"]
                if not (s <= lat <= n and w <= lon <= e):
                    continue
                if "circle" in z:
                    la, lo, rad = z["circle"]
                    dy = (lat - la) * 111200
                    dx = (lon - lo) * 111200 * math.cos(math.radians(la))
                    if dx * dx + dy * dy > rad * rad:
                        continue
            elif "district" in z:
                if dist is None:
                    dist = self.district_of(lat, lon) or ""
                if z["district"] != dist:
                    continue
            else:
                continue
            rows = z["mix"].get(cat)
            if rows is None:
                continue                   # this zone says nothing about the category
            fb = next((f for acc, f in rows if r < acc), PROCEDURAL)
            key = (z["name"], fb)
            self.count[key] = self.count.get(key, 0) + 1
            return fb
        return 0

    def report(self):
        """Buildings per zone and family, for the bake log."""
        by = {}
        for (zn, fb), n in self.count.items():
            by.setdefault(zn, []).append((FAMILIES[fb - 1] if 0 < fb <= len(FAMILIES) else "procedural", n))
        return "\n".join(f"  {zn}: " + ", ".join(f"{f} {n}" for f, n in sorted(v, key=lambda x: -x[1]))
                         for zn, v in by.items())
