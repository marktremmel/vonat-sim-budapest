#!/usr/bin/env python3
"""The Királyréti Erdei Vasút for line 70's world (web/src/kisvasut.js).

    python3 tools/overpass.py tools/q_kisvasut.ql data/raw/kisvasut.json
    python3 tools/bake_kisvasut.py      # -> web/data/kisvasut.json

The narrow-gauge ways are chained end to end, starting from the end nearest
Kismaros station on line 70, and the longest chain is the line. Stops are
the named station/halt nodes within 60 m of it, by distance along it.
Coordinates are metres east and north in line 70's frame.
"""
import json, math, sys
sys.path.insert(0, "tools")
from geo import frame

W = json.load(open("web/data/world.json", encoding="utf-8"))["near"]
MLAT, MLON = frame((W["south"] + W["north"]) / 2)
xy = lambda la, lo: ((lo - W["west"]) * MLON, (la - W["south"]) * MLAT)
els = json.load(open("data/raw/kisvasut.json", encoding="utf-8"))["elements"]
ways = [[xy(p["lat"], p["lon"]) for p in e["geometry"]] for e in els
        if e["type"] == "way" and len(e.get("geometry") or []) > 1
        and (e.get("tags") or {}).get("service") not in ("yard", "siding", "spur")]
nodes = [(e["tags"].get("name"), xy(e["lat"], e["lon"])) for e in els
         if e["type"] == "node" and (e.get("tags") or {}).get("name")]
KISMAROS = xy(47.8274, 19.0135)       # where the running line leaves the Kismaros yard

# chain: repeatedly attach the way whose end touches the chain's end
key = lambda p: (round(p[0], 0), round(p[1], 0))
def near(a, b): return math.hypot(a[0] - b[0], a[1] - b[1]) < 3.0
dend = lambda w: min(math.hypot(w[0][0] - KISMAROS[0], w[0][1] - KISMAROS[1]),
                     math.hypot(w[-1][0] - KISMAROS[0], w[-1][1] - KISMAROS[1]))
wlen = lambda w: sum(math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]) for i in range(1, len(w)))
start = max([w for w in ways if dend(w) < 5] or [min(ways, key=dend)], key=wlen)
chain = list(start)
if math.hypot(chain[-1][0] - KISMAROS[0], chain[-1][1] - KISMAROS[1]) < math.hypot(chain[0][0] - KISMAROS[0], chain[0][1] - KISMAROS[1]):
    chain.reverse()
left = [w for w in ways if w is not start]
grew = True
while grew:
    grew = False
    for w in left:
        if near(w[0], chain[-1]): chain += w[1:]; left.remove(w); grew = True; break
        if near(w[-1], chain[-1]): chain += list(reversed(w))[1:]; left.remove(w); grew = True; break
cum = [0.0]
for i in range(1, len(chain)):
    cum.append(cum[-1] + math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]))
stops = []
for name, p in nodes:
    best = min(range(len(chain)), key=lambda i: math.hypot(chain[i][0] - p[0], chain[i][1] - p[1]))
    if math.hypot(chain[best][0] - p[0], chain[best][1] - p[1]) < 60 and name not in [s["name"] for s in stops]:
        stops.append({"name": name, "s": round(cum[best], 1)})
stops.sort(key=lambda s: s["s"])
json.dump({"pts": [[round(x, 1), round(y, 1)] for x, y in chain], "stops": stops},
          open("web/data/kisvasut.json", "w"), separators=(",", ":"))
print(f"kisvasút: {cum[-1] / 1000:.2f} km, {len(chain)} points, stops {[s['name'] for s in stops]}")
