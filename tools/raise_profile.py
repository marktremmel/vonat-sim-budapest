#!/usr/bin/env python3
"""Lift a stretch of a line's baked profile onto an embankment the DEM misses.

    python3 tools/raise_profile.py s21

The profile comes from the SRTM surface, which is smoothed over 30 m cells, so
a railway embankment 7 m high over the streets comes out 2 m high. Roads under
the line are then dug down to reach 6.6 m of clearance (geom.js
prepareUnderpasses), where in reality they pass underneath at street level.

RAISES holds, per line, ramps in chainage (m): [start, full, full_end, end, lift m].
The lift eases in and out (smoothstep, like a vertical curve). It patches
route_<line>.json in place (re-running bake_route.py is not safe, NOTES Traps):
both tracks, the stops' heights and the grades. The applied table is stored as
"raised", and a re-run first takes the old lift off, so running it twice does not
stack.

S21, Mexikói út to past Kőbánya alsó: the line is on an embankment with road
bridges over Thököly út (km 4.04, Zugló station on the embankment), two side
streets (4.78, 5.23), Kerepesi út (5.70) and Kőbányai út (7.94, under Kőbánya
alsó's raised platforms). Owner's aerial photo of Zugló, 26 Sep 2026: the road
passes under at street level. Hungária körút goes OVER the line at km 2.85, so
the climb starts after it. A negative lift lowers the line into a cutting.
"""
import json, sys

RAISES = {
    "s21": [[2900, 3950, 8150, 8900, 5.5],
            # and DOWN into a cutting under the airport road (Ferihegyi
            # repülőtérre vezető út, OSM bridge=yes over the line at km 11.54):
            # the owner says the road has no level difference there, and the
            # DEM shows a 2-3 m trough along the line (a smoothed cutting).
            # The depth is an estimate that lets the road cross almost flat.
            [10850, 11450, 11650, 12350, -6.0]],
}

def lift(m, table):
    h = 0.0
    for a, b, c, d, H in table:
        if m <= a or m >= d: continue
        if m < b: t = (m - a) / (b - a)
        elif m > c: t = (d - m) / (d - c)
        else: t = 1.0
        h += H * t * t * (3 - 2 * t)
    return h

def main():
    line = sys.argv[1] if len(sys.argv) > 1 else "s21"
    table = RAISES[line]
    path = f"web/data/route_{line}.json"
    r = json.load(open(path, encoding="utf-8"))
    old = r.get("raised") or []
    for key in ("track_down", "track_up"):
        for p in r[key]:
            p[2] = round(p[2] - lift(p[3], old) + lift(p[3], table), 3)
    for s in r["stops"]:
        m = s["km"] * 1000
        s["h"] = round(s["h"] - lift(m, old) + lift(m, table), 1)
    # grades (per mille, 100 m steps) from the patched down track
    T = r["track_down"]
    m0, step = T[0][3], (T[-1][3] - T[0][3]) / (len(T) - 1)
    def y(m):
        f = max(0.0, min(len(T) - 1.001, (m - m0) / step)); i = int(f); u = f - i
        return T[i][2] + (T[i + 1][2] - T[i][2]) * u
    lo = min([q[0] for q in table + old], default=0) - 100
    hi = max([q[3] for q in table + old], default=0) + 100
    for g in r["grades"]:
        if lo <= g[0] <= hi:
            g[1] = round((y(g[0] + 50) - y(g[0] - 50)) / 100 * 1000, 2)
    r["raised"] = table
    json.dump(r, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{path}: raised {table}")
    for m in range(int(lo), int(hi) + 1, 500):
        print(f"  {m:6d} m  +{lift(m, table):4.1f} m  rail {y(m):6.1f}")

if __name__ == "__main__":
    main()
