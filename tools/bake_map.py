#!/usr/bin/env python3
"""Render a plan map of the corridor as a PNG for the in-game map view."""
import json, sys, math, sys, zlib, struct
sys.path.insert(0, "tools")
from geo import frame
from bake_world import png

LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
SUFFIX = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUFFIX}.json", encoding="utf-8"))
NEAR = W["near"]
MLAT, MLON = frame(NEAR.get("frame_lat", (NEAR["south"] + NEAR["north"]) / 2))
SCALE = 2                       # cover pixels per map pixel

PALETTE = {
    0:  (150, 156, 128), 1:  (74, 104, 66),  2:  (118, 132, 92),
    3:  (156, 172, 112), 4:  (186, 178, 126), 5:  (124, 148, 92),
    6:  (166, 160, 100), 7:  (176, 166, 156), 8:  (142, 140, 136),
    9:  (96, 138, 160),  10: (178, 172, 162), 11: (120, 146, 116),
    12: (110, 104, 96),
}

def main():
    from PIL import Image
    cov = Image.open(f"web/data/cover_near{SUFFIX}.png").convert("RGB")
    cw, ch = cov.size
    mw, mh = cw // SCALE, ch // SCALE
    src = cov.load()
    out = Image.new("RGB", (mw, mh))
    px = out.load()
    for y in range(mh):
        for x in range(mw):
            c = src[x * SCALE, y * SCALE][0]
            px[x, y] = PALETTE.get(c, PALETTE[0])

    route = json.load(open(f"web/data/route{SUFFIX}.json", encoding="utf-8"))
    step = NEAR["step_m"] * SCALE
    def to_px(wx, wy):
        return wx / step, (NEAR["h"] * NEAR["step_m"] - wy) / step

    def line(a, b, col, width=1):
        (x0, y0), (x1, y1) = a, b
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            y = y0 + (y1 - y0) * i / n
            for dy in range(-width, width + 1):
                for dx in range(-width, width + 1):
                    ix, iy = int(x) + dx, int(y) + dy
                    if 0 <= ix < mw and 0 <= iy < mh:
                        px[ix, iy] = col

    # ---- the city
    #
    # Land cover alone makes a beautiful Danube Bend and a poor Budapest: the
    # Bend IS its land cover — forest, water, rock — while a city in land cover
    # is one flat wash of "residential" with nothing in it. The city's shape is
    # in its streets and the density of its blocks, and both are already baked
    # in context.json, so the map draws them.
    import base64, struct
    ctx = json.load(open(f"web/data/context{SUFFIX}.json", encoding="utf-8"))

    # building density, one count per map pixel, then a tint by how built-up
    dens = [0] * (mw * mh)
    raw = base64.b64decode(ctx["buildings"]["data"])
    for i in range(ctx["buildings"]["count"]):
        bx, by = struct.unpack_from("<ff", raw, i * 18)
        x, y = to_px(bx, by)
        ix, iy = int(x), int(y)
        if 0 <= ix < mw and 0 <= iy < mh:
            dens[iy * mw + ix] += 1
    raw = base64.b64decode(ctx["polys"]["data"]); o = 0
    for i in range(ctx["polys"]["count"]):
        cx, cy, hdm, cls, roof, npts, ntri = struct.unpack_from("<ffHBBBB", raw, o)
        o += 16 + npts * 4 + ntri * 3
        x, y = to_px(cx, cy)
        ix, iy = int(x), int(y)
        if 0 <= ix < mw and 0 <= iy < mh:
            dens[iy * mw + ix] += 2          # a big footprint counts for more
    built = 0
    for iy in range(mh):
        for ix in range(mw):
            n = dens[iy * mw + ix]
            if not n:
                continue
            built += 1
            # up to a warm slate as the blocks get denser: 1 building is a
            # hamlet, 25 in a 51 m pixel is Terézváros
            t = min(1.0, n / 22.0) ** 0.62
            r, g, b = px[ix, iy]
            px[ix, iy] = (int(r * (1 - t) + 112 * t),
                          int(g * (1 - t) + 104 * t),
                          int(b * (1 - t) + 104 * t))

    # the road network, which is what actually draws a city on a map
    ROAD_COL = {0: (238, 232, 214), 1: (232, 224, 200), 2: (214, 208, 188),
                3: (196, 190, 174), 4: (172, 168, 156)}
    raw = base64.b64decode(ctx["roads"]["data"]); o = 0
    drawn = 0
    for i in range(ctx["roads"]["count"]):
        if ctx["roads"].get("lanes"):          # u8 cls, u8 bridge, u8 lanes, u8 oneway, u16 n
            cls, br, _ln, _ow, npts = struct.unpack_from("<BBBBH", raw, o); o += 6
        else:
            cls, br, npts = struct.unpack_from("<BBH", raw, o); o += 4
        pts = []
        for k in range(npts):
            rx, ry = struct.unpack_from("<ff", raw, o); o += 8
            pts.append((rx, ry))
        if cls > 4:                       # service roads and tracks: too fine
            continue
        col = ROAD_COL.get(cls, ROAD_COL[4])
        wdt = 1 if cls <= 1 else 0
        for a, b in zip(pts, pts[1:]):
            line(to_px(a[0], a[1]), to_px(b[0], b[1]), col, wdt)
        drawn += 1

    for name, col, wdt in (("track_up", (40, 46, 52), 1), ("track_down", (18, 22, 26), 1)):
        pts = route[name]
        for a, b in zip(pts[::4], pts[4::4]):
            line(to_px(a[0], a[1]), to_px(b[0], b[1]), col, wdt)

    marks = []
    for s in route["stops"]:
        x, y = to_px(s["xy"][0], s["xy"][1])
        marks.append({"name": s["name"], "x": round(x, 1), "y": round(y, 1),
                      "km": s["km"]})
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                if dx * dx + dy * dy <= 9:
                    ix, iy = int(x) + dx, int(y) + dy
                    if 0 <= ix < mw and 0 <= iy < mh:
                        px[ix, iy] = (250, 250, 250) if dx*dx+dy*dy > 3 else (20, 24, 28)

    rows = [bytes(b"".join(bytes(px[x, y]) for x in range(mw))) for y in range(mh)]
    data = png(mw, mh, rows, colour_type=2)
    open(f"web/data/map{SUFFIX}.png", "wb").write(data)

    meta = {"w": mw, "h": mh, "metres_per_px": step,
            "origin_world": [0.0, 0.0], "stops": marks}
    json.dump(meta, open(f"web/data/map{SUFFIX}.json", "w", encoding="utf-8"),
              ensure_ascii=False)
    print(f"map {mw}x{mh} at {step:.1f} m/px, {len(data)/1e6:.2f} MB, "
          f"{len(marks)} stops, {built} built-up pixels, {drawn} roads")

main()
