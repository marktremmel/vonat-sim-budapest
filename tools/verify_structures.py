#!/usr/bin/env python3
"""Work out what each 'bridge' and 'tunnel' on line 70 actually spans.

A rail way tagged bridge=yes might carry the railway over a river, over a road,
or over nothing much. A rail way tagged tunnel=yes on a flat river-terrace line
is more likely to be a road passing overhead than a bore through rock. So:
intersect every structure with the roads and watercourses around it and let the
geometry say which it is.
"""
import json, sys
from collections import Counter
sys.path.insert(0, "tools")
from geo import Chainer, load_tracks, xy, haversine

DOWN = Chainer(load_tracks()[0]["points"])
ways = json.load(open("data/raw/infra_ways.json", encoding="utf-8"))["elements"]
crossers = json.load(open("data/raw/crossers.json", encoding="utf-8"))["elements"]

def seg_hit(p1, p2, p3, p4):
    """Do segments p1p2 and p3p4 cross?"""
    def o(a, b, c):
        v = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
        return 0 if abs(v) < 1e-9 else (1 if v > 0 else -1)
    return (o(p1,p2,p3) != o(p1,p2,p4)) and (o(p3,p4,p1) != o(p3,p4,p2))

def to_xy(geom):
    return [xy(p["lat"], p["lon"]) for p in geom]

def bbox(pts, pad=0.0):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return min(xs)-pad, min(ys)-pad, max(xs)+pad, max(ys)+pad

CR = []
for c in crossers:
    g = c.get("geometry") or []
    if len(g) < 2:
        continue
    pts = to_xy(g)
    CR.append((bbox(pts), pts, c.get("tags", {})))

def crossings_of(pts):
    bb = bbox(pts, 5.0)
    hits = []
    for cbb, cpts, tags in CR:
        if cbb[2] < bb[0] or cbb[0] > bb[2] or cbb[3] < bb[1] or cbb[1] > bb[3]:
            continue
        for a, b in zip(pts, pts[1:]):
            done = False
            for c, d in zip(cpts, cpts[1:]):
                if seg_hit(a, b, c, d):
                    hits.append(tags); done = True; break
            if done:
                break
    return hits

def describe(tags):
    if "waterway" in tags:
        return "water", tags.get("waterway"), tags.get("name")
    h = tags.get("highway")
    if h in ("footway", "path", "cycleway", "steps", "track"):
        return "path", h, tags.get("name")
    return "road", h, tags.get("name")

out = []
for w in ways:
    t = w.get("tags", {})
    br = t.get("bridge") and t["bridge"] != "no"
    tu = t.get("tunnel") and t["tunnel"] != "no"
    if not (br or tu):
        continue
    g = w.get("geometry") or []
    if len(g) < 2:
        continue
    mid = g[len(g)//2]
    ch, off, _ = DOWN.snap(mid["lat"], mid["lon"])
    if off > 140:
        continue
    pts = to_xy(g)
    L = sum(haversine((a["lat"],a["lon"]), (b["lat"],b["lon"])) for a, b in zip(g, g[1:]))
    hits = [describe(h) for h in crossings_of(pts)]
    kinds = Counter(k for k, _, _ in hits)
    names = sorted({n for _, _, n in hits if n})
    out.append({
        "km": round(ch/1000, 3),
        "tag": "bridge" if br else "tunnel",
        "tag_value": t.get("bridge") if br else t.get("tunnel"),
        "layer": t.get("layer"),
        "length_m": round(L),
        "name": t.get("name"),
        "spans": dict(kinds),
        "span_names": names[:4],
    })
out.sort(key=lambda r: r["km"])
json.dump(out, open("data/structures.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print(f"{len(out)} structures examined\n")
tun = [r for r in out if r["tag"] == "tunnel"]
bri = [r for r in out if r["tag"] == "bridge"]

print("=== the 'tunnels' ===")
print("  tunnel tag values:", Counter(r["tag_value"] for r in tun).most_common())
print("  layer values:     ", Counter(r["layer"] for r in tun).most_common())
over = Counter()
for r in tun:
    over[tuple(sorted(r["spans"])) or ("nothing",)] += 1
print("  what passes over: ", over.most_common())
print(f"\n  {'km':>7} {'len':>5}  value            passes overhead")
for r in tun:
    if r["length_m"] >= 30 or r["spans"]:
        s = ", ".join(f"{v}× {k}" for k, v in r["spans"].items()) or "nothing found"
        nm = (" — " + ", ".join(r["span_names"])) if r["span_names"] else ""
        print(f"  {r['km']:7.3f} {r['length_m']:5d}  {str(r['tag_value']):16s} {s}{nm}")

print("\n=== the bridges ===")
w = Counter()
for r in bri:
    w[tuple(sorted(r["spans"])) or ("nothing",)] += 1
print("  what they span:", w.most_common())
print(f"\n  {'km':>7} {'len':>5}  spans")
for r in bri:
    s = ", ".join(f"{v}× {k}" for k, v in r["spans"].items()) or "nothing found"
    nm = (" — " + ", ".join(r["span_names"])) if r["span_names"] else ""
    if r["length_m"] >= 20 or "water" in r["spans"] or r["name"]:
        print(f"  {r['km']:7.3f} {r['length_m']:5d}  {s}{nm}"
              + (f"   [{r['name']}]" if r["name"] else ""))
