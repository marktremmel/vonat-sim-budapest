#!/usr/bin/env python3
"""Bake the Vác–Szob world into textures a browser can load.

Two LOD rings, the way a 2001 engine would do it: a near heightmap at the
source resolution covering the corridor, and a far one at a quarter of that
covering everything visible to the horizon. Plus a land cover class raster so
vegetation can be scattered at runtime instead of shipped as geometry.

Height is packed into R+G as a 16-bit value in decimetres above sea level,
which covers 0–6553 m at 0.1 m precision and compresses well in PNG.
"""
import json, math, sys, zlib, struct
sys.path.insert(0, "tools")
from terrain import Terrain
from geo import frame
from mapdata import stitch

OUT = "web/data"
_LAST_COVER = None
NEAR_PAD_M = 6000.0
FAR_PAD_M = 26000.0
# The window of the line to bake. Defaults to the Vác–Szob slice; set
# SZOB_KM=from,to for another — SZOB_KM=0,63.6 is the whole line.
import os as _os
KM_FROM, KM_TO = [float(v) for v in
                  _os.environ.get("SZOB_KM", "30.0,63.6").split(",")]

# Which line. Line 70 uses data/alignment.json and data/profile.json; any
# other line has its own (tools/line_alignment.py) and is baked whole unless
# SZOB_KM says otherwise. Only THIS line's tracks are carved and measured:
# alignment.json also holds lines 2 and 71 now, and carving those with line
# 70's profile is what flattened the first line 2 world.
LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
ALIGN_FILE = "data/alignment.json" if LINE == "line70" else f"data/alignment_{LINE}.json"
PROFILE_FILE = "data/profile.json" if LINE == "line70" else f"data/profile_{LINE}.json"
if LINE != "line70" and "SZOB_KM" not in _os.environ:
    KM_FROM, KM_TO = 0.0, 999.0

def line_tracks():
    tr = json.load(open(ALIGN_FILE, encoding="utf-8"))["tracks"]
    mine = [t for t in tr if t["id"].startswith(LINE + "_") or t["id"] in ("down", "up")]
    return mine or tr[:2]

def landcover_elements():
    els = json.load(open("data/raw/landcover.json", encoding="utf-8"))["elements"]
    extra = f"data/raw/landcover_{LINE}.json"
    if LINE != "line70" and _os.path.exists(extra):
        have = {(e["type"], e["id"]) for e in els}
        els += [e for e in json.load(open(extra, encoding="utf-8"))["elements"]
                if (e["type"], e["id"]) not in have]
    # line 70's strip north of q_landcover2's box (the kisvasút's Királyrét end)
    north = "data/raw/landcover_line70_north.json"
    if LINE == "line70" and _os.path.exists(north):
        have = {(e["type"], e["id"]) for e in els}
        els += [e for e in json.load(open(north, encoding="utf-8"))["elements"]
                if (e["type"], e["id"]) not in have]
    return els

CLASSES = ["none", "forest", "scrub", "meadow", "farmland", "orchard",
           "vineyard", "residential", "industrial", "water", "rock", "wetland",
           "railway", "park", "sand", "quarry"]
CLASS_OF = {
    "forest": 1, "wood": 1, "scrub": 2, "heath": 2,
    "meadow": 3, "grassland": 3, "grass": 3, "farmyard": 3,
    "farmland": 4, "allotments": 4, "greenhouse_horticulture": 4,
    "orchard": 5, "vineyard": 6,
    "residential": 7, "cemetery": 7,
    "industrial": 8, "commercial": 8, "retail": 8,
    # A quarry is not a factory. The Naszály above Vác has had a face cut out
    # of it that shows for miles as pale limestone, and painting it in
    # industrial grey threw away the most distinctive thing on that hillside.
    "quarry": 15,
    "brownfield": 8, "construction": 8, "military": 8,
    "bare_rock": 10, "cliff": 10, "wetland": 11,
    "railway": 12,
    # a city is largely park, and a park is not a meadow: mown, treed, and
    # it is what the line runs past at Városliget
    "park": 13, "garden": 13, "village_green": 13, "recreation_ground": 13,
    "pitch": 13, "golf_course": 13, "sports_centre": 13, "stadium": 13,
    "nature_reserve": 1,
    "sand": 14, "beach": 14,
}

def png(width, height, rows, colour_type, bitdepth=8):
    """Minimal PNG writer. rows is a list of bytes objects, one per scanline."""
    raw = b"".join(b"\x00" + r for r in rows)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", width, height, bitdepth, colour_type, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

# NEAR_NORTH_M=metres grows the near window north (whole rows, the frame and
# every existing pixel unchanged): line 70's is grown 2.6 km so the
# Királyréti kisvasút (Kismaros – Királyrét, 47.895 N) is inside it. The
# rows and columns are laid out with the metres per degree of the ORIGINAL
# window's middle, which FRAME_LAT pins; otherwise mlon moves with the
# middle latitude and the east edge stretches by metres.
FRAME_LAT = None
def fr(reg):
    return frame(FRAME_LAT if FRAME_LAT is not None else (reg["south"] + reg["north"]) / 2)

def region(points, pad):
    lats = [p[0] for p in points]; lons = [p[1] for p in points]
    mlat, mlon = frame(sum(lats) / len(lats))
    return {"south": min(lats) - pad / mlat, "north": max(lats) + pad / mlat,
            "west": min(lons) - pad / mlon, "east": max(lons) + pad / mlon}

def carve_corridor(reg, step_m, w, h, heights):
    """Pull the DEM down onto the railway near the track.

    The formation ribbon draws a proper earthwork, but the terrain mesh still
    samples the raw DEM, so wherever the ground sits above the rails the
    terrain pokes straight through the track. At 25.7 m per pixel a railway is
    barely one pixel wide, so instead of trying to cut a trench we blend the
    DEM toward rail level out to 34 m — enough that terrain and ribbon agree.
    """
    import json as _json
    mlat, mlon = fr(reg)
    align = line_tracks()
    prof = _json.load(open(PROFILE_FILE, encoding="utf-8"))
    pstep, pp = prof["step_m"], prof["profile"]
    INNER, OUTER = 18.0, 46.0
    rad_px = int(OUTER / step_m) + 2
    touched = 0
    for t in align:
        pts = t["points"]
        for k in range(0, len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            segs = max(1, int(((b[2] - a[2]) / 6.0)))
            for q in range(segs):
                f = q / segs
                lat = a[0] + f * (b[0] - a[0])
                lon = a[1] + f * (b[1] - a[1])
                ch = a[2] + f * (b[2] - a[2])
                # never carve under a bridge: the ground there is a river
                if any(b0 <= ch <= b1 for b0, b1 in prof.get("bridges", [])):
                    continue
                rail = pp[min(int(ch / pstep), len(pp) - 1)][1]
                cx = (lon - reg["west"]) / (reg["east"] - reg["west"]) * w
                cy = (reg["north"] - lat) / (reg["north"] - reg["south"]) * h
                for jy in range(int(cy) - rad_px, int(cy) + rad_px + 1):
                    if jy < 0 or jy >= h:
                        continue
                    for jx in range(int(cx) - rad_px, int(cx) + rad_px + 1):
                        if jx < 0 or jx >= w:
                            continue
                        d = math.hypot((jx + 0.5 - cx) * step_m,
                                       (jy + 0.5 - cy) * step_m)
                        if d > OUTER:
                            continue
                        tt = 0.0 if d <= INNER else (d - INNER) / (OUTER - INNER)
                        tt = tt * tt * (3 - 2 * tt)
                        target = rail - 2.4   # below the ditch floor
                        i = jy * w + jx
                        blended = target * (1 - tt) + heights[i] * tt
                        if abs(blended - heights[i]) > 0.01:
                            heights[i] = blended
                            touched += 1
    return touched

def bake_height(terr, reg, step_m, name, carve=False):
    mlat, mlon = fr(reg)
    w = int((reg["east"] - reg["west"]) * mlon / step_m)
    h = reg.get("_h") or int((reg["north"] - reg["south"]) * mlat / step_m)
    heights = [0.0] * (w * h)
    for j in range(h):
        lat = reg["north"] - (j + 0.5) / h * (reg["north"] - reg["south"])
        for i in range(w):
            lon = reg["west"] + (i + 0.5) / w * (reg["east"] - reg["west"])
            heights[j * w + i] = terr.height(lat, lon)
    if carve:
        n = carve_corridor(reg, step_m, w, h, heights)
        print(f"    carved {n} pixels onto the railway")
    lo, hi = min(heights), max(heights)
    rows = []
    for j in range(h):
        row = bytearray()
        for i in range(w):
            v = max(0, min(65535, int(round(heights[j * w + i] * 10))))
            row += bytes((v >> 8, v & 0xFF, 0))
        rows.append(bytes(row))
    # RGB, not grey+alpha: canvas readback premultiplies alpha and would
    # destroy the low byte of the height
    data = png(w, h, rows, colour_type=2)
    open(f"{OUT}/{name}.png", "wb").write(data)
    print(f"  {name}: {w}x{h} at {step_m:.1f} m/px, "
          f"{lo:.0f}–{hi:.0f} m, {len(data)/1e6:.2f} MB")
    return {"w": w, "h": h, "step_m": step_m, **{k: v for k, v in reg.items() if k != "_h"},
            "encoding": "decimetres_asl_16bit_RG"}

def bake_cover(reg, step_m, name):
    """Scanline-rasterise the land cover polygons into a class index raster."""
    mlat, mlon = fr(reg)
    w = int((reg["east"] - reg["west"]) * mlon / step_m)
    h = reg.get("_h") or int((reg["north"] - reg["south"]) * mlat / step_m)
    grid = bytearray(w * h)
    tint = bytearray(w * h)
    global _LAST_COVER
    _LAST_COVER = grid
    dist = bytearray([255]) * (w * h)   # metres to the nearest track

    def to_px(lat, lon):
        x = (lon - reg["west"]) / (reg["east"] - reg["west"]) * w
        y = (reg["north"] - lat) / (reg["north"] - reg["south"]) * h
        return x, y

    polys = []
    for e in landcover_elements():
        t = e.get("tags", {})
        cls = CLASS_OF.get(t.get("landuse") or t.get("natural")
                           or t.get("leisure"))
        if not cls:
            continue
        if e["type"] == "way":
            g = e.get("geometry") or []
            if len(g) >= 3:
                polys.append((cls, [to_px(p["lat"], p["lon"]) for p in g]))
            continue
        # multipolygon: the big forests are all relations, and they carry the
        # holes that stop us planting trees in the middle of a lake
        for role, fill in (("outer", cls), ("inner", 0)):
            segs = [[(q["lat"], q["lon"]) for q in m["geometry"]]
                    for m in e.get("members", [])
                    if m.get("geometry") and (m.get("role") or "outer") == role]
            for ring in stitch(segs):
                if len(ring) >= 3:
                    polys.append((fill, [to_px(a, b) for a, b in ring]))
    # water last so it wins over everything. Relation members are open way
    # fragments, so they must be stitched into closed rings first — filling
    # them individually floods the map with a lake the size of the county.
    for r in json.load(open("data/raw/water.json", encoding="utf-8"))["elements"]:
        if r["type"] == "way":
            g = r.get("geometry") or []
            if len(g) >= 3:
                polys.append((9, [to_px(p["lat"], p["lon"]) for p in g]))
            continue
        segs = [[(q["lat"], q["lon"]) for q in m["geometry"]]
                for m in r.get("members", [])
                if m.get("geometry") and (m.get("role") or "outer") == "outer"]
        for ring in stitch(segs):
            if len(ring) >= 3 and abs(ring[0][0] - ring[-1][0]) < 1e-6 \
               and abs(ring[0][1] - ring[-1][1]) < 1e-6:
                polys.append((9, [to_px(a, b) for a, b in ring]))
        # The ISLANDS. A river is a multipolygon and its islands are inner
        # rings, and this branch took only the outers — so the Danube was
        # painted straight over Margitsziget, which stands ten metres above
        # the water and had every one of its six hundred buildings sunk to
        # the rooftops. The land cover branch above has always handled its
        # holes; the water branch never did. Marked 250 and restored after
        # the water is laid, so an island keeps whatever it was before.
        segs_in = [[(q["lat"], q["lon"]) for q in m["geometry"]]
                   for m in r.get("members", [])
                   if m.get("geometry") and m.get("role") == "inner"]
        for ring in stitch(segs_in):
            if len(ring) >= 3:
                polys.append((250, [to_px(a, b) for a, b in ring]))

    # outers first, then holes, then water on top
    # land, then its holes, then the water, then the islands the water has to
    # give back. The rank has to be explicit: a tuple of three booleans sorted
    # 250 BEFORE 9, so the river was painted over the island all over again.
    def rank(c):
        return 3 if c == 250 else 2 if c == 9 else 1 if c == 0 else 0
    # Within a rank, big polygons first so the smaller, more specific ones land
    # on top. In file order a forest relation around the Naszály was painted
    # after the Sejcei quarry inside it and buried it completely.
    def bbox_area(pts):
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))
    polys.sort(key=lambda p: (rank(p[0]), -bbox_area(p[1])))
    filled = 0
    before_water = None
    islands = 0
    for pi, (cls, pts) in enumerate(polys):
        if cls == 9 and before_water is None:
            before_water = bytes(grid)        # what the land was, under the river
        shade = (pi * 2654435761) % 251
        ys = [p[1] for p in pts]
        y0 = max(0, int(math.floor(min(ys)))); y1 = min(h - 1, int(math.ceil(max(ys))))
        if y1 < y0:
            continue
        for y in range(y0, y1 + 1):
            yc = y + 0.5
            xs = []
            for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
                if (ya <= yc < yb) or (yb <= yc < ya):
                    xs.append(xa + (yc - ya) / (yb - ya) * (xb - xa))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                ia = max(0, int(math.ceil(a - 0.5))); ib = min(w - 1, int(math.floor(b - 0.5)))
                if ib >= ia:
                    if cls == 250:
                        # an island: give back the land that was there
                        if before_water is not None:
                            k0 = y * w + ia
                            grid[k0:k0 + ib - ia + 1] = before_water[k0:k0 + ib - ia + 1]
                            islands += ib - ia + 1
                        continue
                    grid[y * w + ia:y * w + ib + 1] = bytes([cls]) * (ib - ia + 1)
                    tint[y * w + ia:y * w + ib + 1] = bytes([shade]) * (ib - ia + 1)
                    filled += ib - ia + 1
    # stamp the railway formation as class 12 so nothing is planted on it.
    # Marking the single pixel the centreline passes through misses wherever
    # the line crosses a pixel corner diagonally, which is how trees ended up
    # growing between the rails. Use a real metric radius, and a generous one:
    # a 20 m tree standing 20 m away still leans over the track from a cab.
    if islands:
        print(f"  islands restored from the river: {islands} px")
    RAIL_R = 27.0
    DIST_R = 90.0                     # how far out we record the distance
    rad_px = int(DIST_R / step_m) + 1
    align = line_tracks()
    for t in align:
        for a, b in zip(t["points"], t["points"][1:]):
            xa, ya = to_px(a[0], a[1]); xb, yb = to_px(b[0], b[1])
            n = max(1, int(max(abs(xb - xa), abs(yb - ya)) * 3) + 1)
            for k in range(n + 1):
                px_ = xa + (xb - xa) * k / n
                py_ = ya + (yb - ya) * k / n
                for jy in range(int(py_) - rad_px, int(py_) + rad_px + 1):
                    if jy < 0 or jy >= h:
                        continue
                    for jx in range(int(px_) - rad_px, int(px_) + rad_px + 1):
                        if jx < 0 or jx >= w:
                            continue
                        d = math.hypot((jx + 0.5 - px_) * step_m,
                                       (jy + 0.5 - py_) * step_m)
                        if d <= RAIL_R:
                            grid[jy * w + jx] = 12
                            tint[jy * w + jx] = 128
                        dv = min(255, int(d))
                        if dv < dist[jy * w + jx]:
                            dist[jy * w + jx] = dv
    # The distance channel decides where the terrain is cut away so the
    # corridor mesh can take over (TERRAIN_FS, uCorridorCut = 86 m). It has to
    # describe exactly where that mesh IS: it is built along the down line,
    # perpendicular to it, and has a gap on bridges (it would be a dam). A
    # plain distance-to-points has round caps — past the Nyugati buffers and
    # at both ends of every bridge — where the ground was cut and nothing was
    # drawn instead, so you looked through the world at the sky. So: the
    # perpendicular distance to the down line's segments, only where the
    # point projects onto a segment, and no segments on a bridge.
    try:
        prof_br = json.load(open(PROFILE_FILE, encoding="utf-8")).get("bridges", [])
    except Exception:
        prof_br = []
    dist = bytearray([255]) * (w * h)
    down = align[0]
    pts = down["points"]
    ch = [p[2] if len(p) > 2 else None for p in pts]
    if ch[0] is None:
        acc = [0.0]
        for a, b in zip(pts, pts[1:]):
            acc.append(acc[-1] + math.hypot((b[0] - a[0]) * 111132.0,
                                            (b[1] - a[1]) * 111320.0 * math.cos(math.radians(a[0]))))
        ch = acc
    for i in range(len(pts) - 1):
        m = ch[i]
        if any(b0 - 10 <= m <= b1 + 10 for b0, b1 in prof_br):
            continue
        # and not past the ends of the baked window: no corridor there either
        if m < KM_FROM * 1000 - 5 or m > KM_TO * 1000 - 70:
            continue
        xa, ya = to_px(pts[i][0], pts[i][1]); xb, yb = to_px(pts[i + 1][0], pts[i + 1][1])
        sx, sy = (xb - xa) * step_m, (yb - ya) * step_m
        L2 = sx * sx + sy * sy
        if L2 < 1e-6:
            continue
        for jy in range(int(min(ya, yb)) - rad_px, int(max(ya, yb)) + rad_px + 1):
            if jy < 0 or jy >= h:
                continue
            for jx in range(int(min(xa, xb)) - rad_px, int(max(xa, xb)) + rad_px + 1):
                if jx < 0 or jx >= w:
                    continue
                qx, qy = (jx + 0.5 - xa) * step_m, (jy + 0.5 - ya) * step_m
                t = (qx * sx + qy * sy) / L2
                if t < -0.02 or t > 1.02:
                    continue
                d = abs(qx * sy - qy * sx) / math.sqrt(L2)
                dv = min(255, int(d))
                if dv < dist[jy * w + jx]:
                    dist[jy * w + jx] = dv
    rows = []
    for j in range(h):
        row = bytearray()
        for i in range(w):
            k = j * w + i
            row += bytes((grid[k], tint[k], dist[k]))
        rows.append(bytes(row))
    # R = class, G = per-field shade, B = metres to the nearest running line,
    # which is what actually decides where a tree may stand
    data = png(w, h, rows, colour_type=2)
    open(f"{OUT}/{name}.png", "wb").write(data)
    from collections import Counter
    c = Counter(grid)
    top = ", ".join(f"{CLASSES[k]} {100*v/(w*h):.0f}%" for k, v in c.most_common(6))
    print(f"  {name}: {w}x{h} at {step_m:.1f} m/px, {len(data)/1e6:.2f} MB")
    print(f"    {top}")
    return {"w": w, "h": h, "step_m": step_m, **{k: v for k, v in reg.items() if k != "_h"}, "classes": CLASSES}

def fit_water(terr, reg, step_m):
    """Least squares through the water pixels: level = a + b * north metres."""
    mlat, mlon = fr(reg)
    w = int((reg["east"] - reg["west"]) * mlon / step_m)
    h = reg.get("_h") or int((reg["north"] - reg["south"]) * mlat / step_m)
    cov = _LAST_COVER
    n = sx = sy = sxx = sxy = 0.0
    band = {}
    for py in range(0, h, 4):
        lat = reg["north"] - (py + 0.5) * step_m / mlat
        for px in range(0, w, 4):
            if cov[py * w + px] != 9:
                continue
            lon = reg["west"] + (px + 0.5) * step_m / mlon
            z = terr.height(lat, lon)
            if z is None or z <= 0:
                continue
            north = (lat - reg["south"]) * mlat
            band.setdefault(int(north // 2000), []).append(z)
    # The Danube is the LOWEST water in any band. Gravel pits at Dunakeszi,
    # the quarry ponds under the Naszály and every fishing lake along the way
    # sit above it, and a median over all of them flattens the fit to a
    # twentieth of the river's real fall. A low percentile picks the river.
    pts = []
    for k, v in sorted(band.items()):
        if len(v) < 40:
            continue
        v.sort()
        pts.append((k * 2000 + 1000.0, v[len(v) // 6]))
    if len(pts) < 3:
        return {"a": 104.0, "b": 0.0}
    n = len(pts)
    sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
    sxx = sum(p[0] * p[0] for p in pts); sxy = sum(p[0] * p[1] for p in pts)
    b = (n * sxy - sx * sy) / max(1e-9, n * sxx - sx * sx)
    a = (sy - b * sx) / n
    print("  water surface: %.2f m at the south end, %.2f at the north "
          "(%.1f mm per km)" % (a, a + b * (h * step_m), b * 1e6))
    return {"a": round(a, 3), "b": round(b, 9)}

def main():
    import os
    os.makedirs(OUT, exist_ok=True)
    align = line_tracks()[0]
    
    seg = [p for p in align["points"] if KM_FROM * 1000 <= p[2] <= KM_TO * 1000]
    if not seg:
        seg = align["points"]
        print("Warning: KM_FROM and KM_TO filtered out all points, using entire track")
        
    terr = Terrain(12)
    print(f"baking world for {LINE} km %.0f–%.0f" % (KM_FROM, KM_TO))
    near_reg = region(seg, NEAR_PAD_M)
    far_reg = region(seg, FAR_PAD_M)
    extra = float(os.environ.get("NEAR_NORTH_M", "0"))
    if extra > 0:
        global FRAME_LAT
        FRAME_LAT = (near_reg["south"] + near_reg["north"]) / 2
        step = terr.metres_per_pixel(47.8)
        mlat, _ = frame(FRAME_LAT)
        h0 = int((near_reg["north"] - near_reg["south"]) * mlat / step)
        d0 = (near_reg["north"] - near_reg["south"]) / h0      # degrees per row, as before
        k = int(math.ceil(extra / step))
        # a hair under the exact row so int() lands on h0 + k, not one more
        near_reg["north"] = near_reg["south"] + d0 * (h0 + k) - d0 * 1e-6
        print(f"  near window grown north by {k} rows (h {h0} -> {h0 + k})")
        # the rows are placed from the north edge by d0 = span / h; keep that
        # exact: hand the row count over rather than recomputing it
        near_reg["_h"] = h0 + k
    
    suffix = f"_{LINE}" if LINE != "line70" else ""
    meta = {
        "near": bake_height(terr, near_reg, terr.metres_per_pixel(47.8),
                            f"height_near{suffix}", carve=True),
        "far":  bake_height(terr, far_reg, terr.metres_per_pixel(47.8) * 4, f"height_far{suffix}"),
        "cover": bake_cover(near_reg, terr.metres_per_pixel(47.8), f"cover_near{suffix}"),
    }
    meta["water"] = fit_water(terr, near_reg, terr.metres_per_pixel(47.8))
    if FRAME_LAT is not None:
        # the tools and the game take the frame from here, not from the middle
        meta["near"]["frame_lat"] = meta["cover"]["frame_lat"] = FRAME_LAT
        print("  NOTE: the water fit above includes the grown strip; line 70 keeps"
              " its old fit (a 95.978, b 8.6883e-05) — restore it in world.json")
    
    out_name = f"{OUT}/world{suffix}.json"
    json.dump(meta, open(out_name, "w", encoding="utf-8"), indent=1)
    print(f"wrote {out_name}")

if __name__ == "__main__":
    main()
