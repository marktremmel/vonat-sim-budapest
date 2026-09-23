#!/usr/bin/env python3
"""Extract signals, block sections, switches, crossings and track counts.

Everything is snapped onto the down-line chainage so it can be indexed by
kilometre the way a real route book is.
"""
import json, math, re, sys
from collections import Counter, defaultdict
sys.path.insert(0, "tools")
from geo import Chainer, load_tracks, haversine, xy, densify

CORRIDOR = 90.0     # metres either side counts as "on the route"

tracks = load_tracks()
DOWN = Chainer(tracks[0]["points"])
TOTAL = tracks[0]["length_m"]

nodes = json.load(open("data/raw/infra_nodes.json", encoding="utf-8"))["elements"]
ways = json.load(open("data/raw/infra_ways.json", encoding="utf-8"))["elements"]

# Nodes that sit on a line 70 relation way. Anything else in the corridor
# belongs to line 2, 71, 75, the narrow gauge or a yard, and must not be
# mistaken for route infrastructure — several of those carry km posts of
# their own, measured from a different origin.
ON_ROUTE = {e["id"] for e in
            json.load(open("data/raw/linenodes.json", encoding="utf-8"))["elements"]}

def on_route(e):
    return e["id"] in ON_ROUTE

# ---------------------------------------------------------------- milestones
def parse_pos(v):
    if not v:
        return None
    m = re.match(r"^\s*(-?\d+(?:[.,]\d+)?)", str(v))
    return float(m.group(1).replace(",", ".")) if m else None

def milestones():
    out = []
    for e in nodes:
        t = e.get("tags", {})
        if t.get("railway") != "milestone" or not on_route(e):
            continue
        official = parse_pos(t.get("railway:position") or t.get("railway:position:exact"))
        if official is None:
            continue
        ch, off, side = DOWN.snap(e["lat"], e["lon"])
        out.append({"official_km": official, "measured_km": round(ch / 1000, 3),
                    "delta_m": round(ch - official * 1000, 1),
                    "offset_m": round(off, 1), "lat": e["lat"], "lon": e["lon"]})
    out.sort(key=lambda r: r["official_km"])
    return out

# ------------------------------------------------------------------- signals
FUNC_HU = {
    "entry": "bejárati jelző", "exit": "kijárati jelző",
    "block": "térközjelző", "intermediate": "fedezőjelző",
    "distant": "előjelző", "shunting": "tolatásjelző",
}

def parent_way_heading(lat, lon):
    """Heading of the track the signal stands on, by exact coordinate match."""
    for w in ways:
        g = w.get("geometry") or []
        for i, p in enumerate(g):
            if abs(p["lat"] - lat) < 1e-9 and abs(p["lon"] - lon) < 1e-9:
                a = g[max(0, i - 1)]
                b = g[min(len(g) - 1, i + 1)]
                if a is b:
                    return None, w
                x1, y1 = xy(a["lat"], a["lon"])
                x2, y2 = xy(b["lat"], b["lon"])
                return (math.degrees(math.atan2(x2 - x1, y2 - y1)) + 360) % 360, w
    return None, None

def signals():
    out = []
    for e in nodes:
        t = e.get("tags", {})
        if t.get("railway") != "signal" or not on_route(e):
            continue
        ch, off, side = DOWN.snap(e["lat"], e["lon"])
        kinds = []
        for key, label in (("main", "main"), ("distant", "distant"),
                           ("main_repeated", "repeater"), ("shunting", "shunting"),
                           ("crossing", "crossing")):
            if any(k.startswith(f"railway:signal:{key}") for k in t):
                kinds.append(label)
        func = t.get("railway:signal:main:function")
        out.append({
            "km": round(ch / 1000, 3), "offset_m": round(off, 1),
            "side": "left" if side > 0 else "right",
            "kinds": kinds,
            "function": func,
            "function_hu": FUNC_HU.get(func),
            "form": t.get("railway:signal:main:form") or t.get("railway:signal:distant:form"),
            "height": t.get("railway:signal:main:height"),
            "direction": t.get("railway:signal:direction"),
            "ref": t.get("ref") or t.get("railway:signal:main:ref"),
            "lat": e["lat"], "lon": e["lon"],
        })
    out.sort(key=lambda r: r["km"])
    return out

# ------------------------------------------------------------- track counting
def sample_offsets(halfwidth=70.0, step=15.0):
    """Signed perpendicular offset of every track sample near the centreline."""
    buckets = defaultdict(list)
    for w in ways:
        t = w.get("tags", {})
        if t.get("railway") != "rail":
            continue
        narrow = t.get("gauge") in ("760", "600")
        for la, lo in densify(w.get("geometry") or [], step):
            ch, off, side = DOWN.snap(la, lo)
            if off <= halfwidth:
                buckets[int(ch // 100.0)].append((side * off, w["id"], narrow))
    return buckets

def cluster(offsets, tol=3.2):
    """Group perpendicular offsets into distinct parallel tracks."""
    if not offsets:
        return []
    offsets = sorted(offsets)
    groups, cur = [], [offsets[0]]
    for o in offsets[1:]:
        if o - cur[-1] <= tol:
            cur.append(o)
        else:
            groups.append(cur); cur = [o]
    groups.append(cur)
    return [sum(g) / len(g) for g in groups]

def track_count():
    """Distinct parallel tracks per 100 m, by clustering perpendicular offsets.

    Counting way IDs overcounts badly where OSM splits one track into many
    fragments, so tracks are identified by where they sit across the formation
    instead.
    """
    buckets = sample_offsets()
    n = int(TOTAL // 100.0) + 1
    out = []
    for i in range(n):
        offs = [o for o, _, _ in buckets.get(i, ())]
        centres = cluster(offs)
        out.append([round(i / 10, 2), len(centres),
                    [round(c, 1) for c in centres]])
    return out

# --------------------------------------------------------------------- misc
def switches():
    out = []
    for e in nodes:
        t = e.get("tags", {})
        if t.get("railway") != "switch":
            continue
        ch, off, side = DOWN.snap(e["lat"], e["lon"])
        if off > 400:
            continue
        out.append({
            "km": round(ch / 1000, 3), "on_route": on_route(e),
            "offset_m": round(off, 1), "ref": t.get("ref"),
            "turnout_side": t.get("railway:turnout_side"),
            "straight_kmh": t.get("railway:maxspeed:straight"),
            "diverging_kmh": t.get("railway:maxspeed:diverging"),
            "electric": t.get("railway:switch:electric"),
            "heated": t.get("railway:switch:heated"),
            "local": t.get("railway:local_operated"),
        })
    out.sort(key=lambda r: r["km"])
    return out

def crossings():
    out = []
    for e in nodes:
        t = e.get("tags", {})
        if t.get("railway") not in ("level_crossing", "crossing") or not on_route(e):
            continue
        ch, off, side = DOWN.snap(e["lat"], e["lon"])
        out.append({
            "km": round(ch / 1000, 3),
            "kind": t.get("railway"),
            "ref": t.get("ref"),
            "barrier": t.get("crossing:barrier"),
            "light": t.get("crossing:light"),
            "bell": t.get("crossing:bell"),
            "saltire": t.get("crossing:saltire"),
            "name": t.get("name"),
        })
    out.sort(key=lambda r: r["km"])
    return out

def signal_boxes():
    out = []
    for e in nodes:
        t = e.get("tags", {})
        if t.get("railway") != "signal_box":
            continue
        ch, off, _ = DOWN.snap(e["lat"], e["lon"])
        out.append({"km": round(ch / 1000, 3), "offset_m": round(off, 1),
                    "name": t.get("name"), "ref": t.get("ref")})
    out.sort(key=lambda r: r["km"])
    return out

def main():
    ms, sg, sw, cx, sb = milestones(), signals(), switches(), crossings(), signal_boxes()
    tc = track_count()

    json.dump({"milestones": ms, "signals": sg, "switches": sw,
               "crossings": cx, "signal_boxes": sb, "track_count": tc},
              open("data/infra.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"=== milestones: {len(ms)} on line 70 itself ===")
    if ms:
        d = [m["delta_m"] for m in ms]
        print(f"  official km posts span {ms[0]['official_km']:.1f} to {ms[-1]['official_km']:.1f}")
        print(f"  measured minus official: mean {sum(d)/len(d):+.1f} m, "
              f"min {min(d):+.1f}, max {max(d):+.1f}")
        for m in ms[:3] + ms[len(ms)//2:len(ms)//2+2] + ms[-3:]:
            print(f"    {m['official_km']:6.1f} official   {m['measured_km']:7.3f} measured"
                  f"   {m['delta_m']:+7.1f} m")

    print(f"\n=== signals: {len(sg)} on line 70 itself ===")
    print("  functions:", Counter(s["function_hu"] or s["function"] or "untagged"
                                  for s in sg).most_common())
    print("  forms:    ", Counter(s["form"] or "-" for s in sg).most_common())
    print("  heights:  ", Counter(s["height"] or "-" for s in sg).most_common())

    onr = sum(1 for s in sw if s["on_route"])
    print(f"\n=== switches: {len(sw)} in the corridor, {onr} on the running lines ===")
    dv = Counter(s["diverging_kmh"] for s in sw if s["diverging_kmh"])
    print("  diverging speeds:", dv.most_common())
    print("  electrically worked:",
          sum(1 for s in sw if s["electric"] == "yes"), "of", len(sw))

    print(f"\n=== level crossings: {len(cx)} ===")
    print("  barriers:", Counter(c["barrier"] or "-" for c in cx).most_common())

    print(f"\n=== signal boxes: {len(sb)} ===")
    for b in sb:
        print(f"    km {b['km']:6.2f}  {b['name'] or b['ref'] or '(unnamed)'}")

    print("\n=== parallel tracks along the route ===")
    runs, cur, start = [], tc[0][1], 0.0
    for km, n, _ in tc:
        if n != cur:
            runs.append((cur, start, km)); cur, start = n, km
    runs.append((cur, start, tc[-1][0]))
    for n, a, b in runs:
        if b - a >= 0.4:
            print(f"  {a:6.2f} – {b:6.2f} km   {n:2d} tracks")
    widest = max(tc, key=lambda r: r[1])
    print(f"  widest at km {widest[0]}: {widest[1]} tracks, offsets "
          f"{widest[2][:12]}")
    print("  (70 m either side of the down line, so this is the running lines"
          " plus platform and loop roads, not the far end of a yard)")

main()
