#!/usr/bin/env python3
"""Alignment and profile for a line other than 70, as one continuous path.

build_alignment.py takes the two longest runs of a relation as the down and
up tracks. That is right for line 70, which is double track throughout, and
wrong for line 2, which is mostly single track and whose relation has gaps:
its "up" came out as a 299-point fragment. Here every way of the relation
goes into a node graph and the line is the shortest path from its southern
end to its northern end. Both directions run on it.

Line 2 trains start at Budapest-Nyugati and run on line 70's tracks to
Rákosrendező, where line 2 begins, so line 70's down track from Nyugati to
the nearest point of the line 2 path is put in front. Chainage is then from
Nyugati, like line 70's.

    python3 tools/line_alignment.py line2
writes data/alignment_line2.json and data/profile_line2.json.
"""
import heapq, json, math, sys
sys.path.insert(0, "tools")
from geo import haversine
from terrain import Terrain

LINE = sys.argv[1] if len(sys.argv) > 1 else "line2"
raw = json.load(open(f"data/raw/{LINE}.json", encoding="utf-8"))["elements"]
ways = [e for e in raw if e["type"] == "way" and e.get("geometry")]

# ---- node graph. Coordinates rounded to ~1 cm identify shared nodes.
key = lambda p: (round(p["lat"], 7), round(p["lon"], 7))
adj, maxspeed = {}, {}
for w in ways:
    g = w["geometry"]
    ms = (w.get("tags") or {}).get("maxspeed")
    ms = int(ms) if ms and ms.isdigit() else None
    for a, b in zip(g, g[1:]):
        ka, kb = key(a), key(b)
        d = haversine(ka, kb)
        adj.setdefault(ka, []).append((kb, d)); adj.setdefault(kb, []).append((ka, d))
        maxspeed[(ka, kb)] = maxspeed[(kb, ka)] = ms
# gaps in the relation: join any dead end to the nearest node of another
# component within 150 m, so the path can cross them
ends = [k for k, v in adj.items() if len(v) == 1]
for e in ends:
    best = None
    for k in adj:
        if k == e or any(n == k for n, _ in adj[e]):
            continue
        d = haversine(e, k)
        if d < 150 and (best is None or d < best[1]):
            best = (k, d)
    if best and best[1] > 1.0:
        adj[e].append((best[0], best[1])); adj[best[0]].append((e, best[1]))

south = min(adj, key=lambda k: k[0])
north = max(adj, key=lambda k: k[0])
# Esztergom is north-west, Rákosrendező south-east: take the extreme pair by
# distance rather than latitude alone
far = max(adj, key=lambda k: haversine(k, south))
# Or the ends are given: LINE_ENDS="lat,lon;lat,lon" — the Budapest end first.
# S21's relation runs on to Kecskemét; the sim stops it at Lajosmizse.
import os
if os.environ.get("LINE_ENDS"):
    (a0, b0), (a1, b1) = [tuple(float(v) for v in p.split(",")) for p in os.environ["LINE_ENDS"].split(";")]
    south = min(adj, key=lambda k: haversine(k, (a0, b0)))
    far = min(adj, key=lambda k: haversine(k, (a1, b1)))
    print(f"ends given: {haversine(south, (a0, b0)):.0f} m and {haversine(far, (a1, b1)):.0f} m off")
dist, prev = {south: 0.0}, {}
pq = [(0.0, south)]
while pq:
    d, u = heapq.heappop(pq)
    if d > dist.get(u, 1e18): continue
    if u == far: break
    for v, w in adj[u]:
        nd = d + w
        if nd < dist.get(v, 1e18):
            dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
path = [far]
while path[-1] != south:
    path.append(prev[path[-1]])
path.reverse()
speeds = [maxspeed.get((a, b)) for a, b in zip(path, path[1:])]

# ---- Nyugati prefix from line 70's down track
l70 = next(t for t in json.load(open("data/alignment.json", encoding="utf-8"))["tracks"]
           if t["id"] in ("line70_down", "down"))
pts70 = l70["points"]
j = min(range(len(pts70)), key=lambda i: haversine(pts70[i][:2], path[0]))
if haversine(pts70[j][:2], path[0]) < 400:
    prefix = [(p[0], p[1]) for p in pts70[:j]]
    ms70 = l70.get("maxspeed") or []
    path = prefix + path
    speeds = [(ms70[i] if i < len(ms70) else 40) for i in range(len(prefix))] + speeds
    print(f"prefixed {len(prefix)} points of line 70 from Nyugati "
          f"({pts70[j][2]:.0f} m)")

ch = [0.0]
for a, b in zip(path, path[1:]):
    ch.append(ch[-1] + haversine(a, b))
filled, last = [], 60
for s in speeds:
    last = s if s is not None else last
    filled.append(last)
pts = [[round(a, 7), round(b, 7), round(c, 2)] for (a, b), c in zip(path, ch)]
track = {"points": pts, "length_m": round(ch[-1], 1), "maxspeed": filled}
json.dump({"source": f"OpenStreetMap relation for {LINE}, shortest path",
           "tracks": [dict(track, id=f"{LINE}_down"), dict(track, id=f"{LINE}_up")]},
          open(f"data/alignment_{LINE}.json", "w", encoding="utf-8"))
print(f"{LINE}: {len(pts)} points, {ch[-1]/1000:.2f} km")

# ---- profile: DEM every 20 m, smoothed, gradient limited to 20 permille
# (line 2 climbs through the Pilis far more steeply than 70 does)
terr = Terrain(12)
STEP = 20.0
def at(m):
    i = max(0, min(len(ch) - 2, next((k for k in range(len(ch) - 1) if ch[k + 1] >= m), len(ch) - 2)))
    f = (m - ch[i]) / max(1e-6, ch[i + 1] - ch[i])
    return (path[i][0] + f * (path[i + 1][0] - path[i][0]),
            path[i][1] + f * (path[i + 1][1] - path[i][1]))
hs, m = [], 0.0
while m <= ch[-1]:
    la, lo = at(m); hs.append(terr.height(la, lo)); m += STEP
def smooth(v, r):
    return [sum(v[max(0, i - r):i + r + 1]) / len(v[max(0, i - r):i + r + 1]) for i in range(len(v))]
# a railway runs on embankments and through cuttings: the median-ish of the
# terrain, not every bump. Heavy smoothing, then a slope limit both ways.
hs = smooth(smooth(hs, 25), 25)
G = 0.020 * STEP
for i in range(1, len(hs)): hs[i] = max(hs[i - 1] - G, min(hs[i - 1] + G, hs[i]))
for i in range(len(hs) - 2, -1, -1): hs[i] = max(hs[i + 1] - G, min(hs[i + 1] + G, hs[i]))
# ---- bridges. The DEM under a river bridge is the river, so the smoothed
# profile sagged to 4 m above the Danube. Every bridge way over 100 m spans
# straight between the rail heights at its ends, at least 10 m above the
# lowest ground under it, and its chainage range is recorded so bake_world
# does not carve the ground up to rail level there (a dam across the river).
from geo import Chainer
CH = Chainer(pts)
spans = []
for w in ways:
    if not (w.get("tags") or {}).get("bridge"):
        continue
    g = w["geometry"]
    c0 = CH.snap(g[0]["lat"], g[0]["lon"]); c1 = CH.snap(g[-1]["lat"], g[-1]["lon"])
    if c0[1] > 30 or c1[1] > 30:
        continue
    spans.append(sorted((c0[0], c1[0])))
# a bridge mapped as several ways is one bridge: the Újpest bay crossing is a
# 162 m way and an 84 m way end to end, and the 84 m one alone fell under the
# 100 m cut, so the embankment was carved straight across the water there
spans.sort()
merged = []
for m0, m1 in spans:
    if merged and m0 - merged[-1][1] < 15:
        merged[-1][1] = max(merged[-1][1], m1)
    else:
        merged.append([m0, m1])
bridges = []
for m0, m1 in merged:
    if m1 - m0 < 100:
        continue
    bridges.append([round(m0, 1), round(m1, 1)])
    i0, i1 = int(m0 / STEP), min(len(hs) - 1, int(m1 / STEP) + 1)
    h0, h1 = hs[max(0, i0 - 3)], hs[min(len(hs) - 1, i1 + 3)]
    low = min(terr.height(*at(i * STEP)) for i in range(i0, i1 + 1))
    for i in range(i0, i1 + 1):
        f = (i - i0) / max(1, i1 - i0)
        hs[i] = max(h0 + (h1 - h0) * f, low + 10.0)
if bridges:
    print(f"bridges: {len(bridges)}, longest {max(b[1] - b[0] for b in bridges):.0f} m")
prof = [[round(i * STEP, 1), round(h, 2),
         round(((hs[min(i + 1, len(hs) - 1)] - hs[max(i - 1, 0)]) / (2 * STEP)) * 1000, 2)]
        for i, h in enumerate(hs)]
json.dump({"step_m": STEP, "profile": prof, "bridges": bridges}, open(f"data/profile_{LINE}.json", "w"))
print(f"profile {len(prof)} samples, {min(hs):.0f}–{max(hs):.0f} m")
