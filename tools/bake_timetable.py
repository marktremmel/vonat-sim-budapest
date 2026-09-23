#!/usr/bin/env python3
"""Turn the validated running times into a working day on line 70.

data/runtimes.json holds, per service pattern, the scheduled seconds from
Budapest-Nyugati to each call — the numbers that reproduced the published S70
timetable to within 1.8 minutes. This lays them out across a day so the traffic
in the simulator departs when it actually departs, instead of on a loop.

Down services are timed from Nyugati. Up services reuse the same leg times
read backwards, which is a fair approximation: the two directions differ mainly
in where the crossing waits fall, not in how long the legs take.
"""
import json

RT = json.load(open("data/runtimes.json", encoding="utf-8"))
import os as _os
LINE = _os.environ.get("LINE", "line70")
suffix = f"_{LINE}" if LINE != "line70" else ""
route_file = f"web/data/route{suffix}.json"
STOPS = {s["name"]: s for s in
         json.load(open(route_file, encoding="utf-8"))["stops"]}
# The window of the line to bake. Defaults to the Vác–Szob slice; set
# SZOB_KM=from,to for another — SZOB_KM=0,63.6 is the whole line.
import os as _os
LINE = _os.environ.get("LINE", "line70")
KM_FROM, KM_TO = [float(v) for v in
                  _os.environ.get("SZOB_KM", "30.0,63.6").split(",")]
if LINE != "line70" and "SZOB_KM" not in _os.environ:
    # other lines are baked whole: the window is the route itself
    _r = json.load(open(route_file, encoding="utf-8"))
    KM_FROM, KM_TO = _r["track_down"][0][3] / 1000, _r["track_down"][-1][3] / 1000
END_NAME = {"line70": "Szob", "line2": "Esztergom", "line71": "Vác", "s21": "Lajosmizse"}.get(LINE, "vég")

# hours are local. Frequencies follow the real pattern: S70 half-hourly,
# G70 and Z70 hourly, an international pair every two hours, freight when it
# can be fitted. The international paths are plausible rather than published.
if LINE == "line70":
    PLAN = [
        ("S70", "S70",  +1, 6, "KISS",    30, 10, 4.5, 23.5),
        ("S70", "S70",  -1, 6, "KISS",    30, 25, 4.0, 23.0),
        ("G70", "G70",  +1, 6, "KISS",    60, 38, 5.0, 22.0),
        ("Z70", "Z70",  +1, 4, "FLIRT",   60,  8, 5.5, 21.5),
        ("Z70", "Z70",  -1, 4, "FLIRT",   60, 48, 5.5, 21.5),
        ("EC",  "EC Hungária",     +1, 7, "EC", 120,  47, 6.0, 21.0),
        ("EC",  "EC Metropolitan", -1, 7, "EC", 120, 107, 6.0, 21.0),
        ("Freight", "tehervonat",  +1, 16, "FREIGHT", 95, 22, 0.0, 24.0),
        ("Freight", "tehervonat",  -1, 14, "FREIGHT", 95, 71, 0.0, 24.0),
    ]
elif LINE == "line71":
    PLAN = [
        ("S71", "S71",  +1, 4, "FLIRT",   60, 10, 4.5, 23.5),
        ("S71", "S71",  -1, 4, "FLIRT",   60, 25, 4.0, 23.0),
    ]
elif LINE == "line2":
    PLAN = [
        ("S72", "S72",  +1, 4, "FLIRT",   60, 10, 4.5, 23.5),
        ("S72", "S72",  -1, 4, "FLIRT",   60, 25, 4.0, 23.0),
        ("Z72", "Z72",  +1, 4, "FLIRT",   60, 40, 5.5, 21.5),
        ("Z72", "Z72",  -1, 4, "FLIRT",   60, 55, 5.5, 21.5),
    ]
elif LINE == "s21":
    # S21 runs hourly, half-hourly in the peaks (the peak extras are left out)
    PLAN = [
        ("S21", "S21",  +1, 4, "FLIRT",   60, 15, 4.5, 23.0),
        ("S21", "S21",  -1, 4, "FLIRT",   60, 45, 4.0, 22.5),
    ]
else:
    PLAN = []

def full(key):
    """[(name, cumulative seconds, km)] for the whole run, Nyugati onwards."""
    out = []
    for name, secs in RT[key]:
        st = STOPS.get(name)
        km = st["km"] if st else (0.0 if name == "Budapest-Nyugati" else None)
        if km is not None:
            out.append((name, secs, km))
    return out

def time_at_km(pts, km):
    """Interpolate the schedule to a kilometre that is not itself a call.

    Freight has no intermediate calls in our section, so without this both
    directions inherited the timing of the only stop inside it — and entered
    the world at the wrong end.
    """
    for (n0, s0, k0), (n1, s1, k1) in zip(pts, pts[1:]):
        if k0 <= km <= k1:
            f = 0.0 if k1 == k0 else (km - k0) / (k1 - k0)
            return s0 + f * (s1 - s0)
    return pts[-1][1] if km > pts[-1][2] else pts[0][1]

def main():
    services = []
    sid = 0
    for key, label, dir_, cars, stock, period, offset, h0, h1 in PLAN:
        F = full(key)
        if len(F) < 2:
            continue
        t_in = time_at_km(F, KM_FROM)
        t_out = time_at_km(F, KM_TO)
        inside = [(n, s, km) for n, s, km in F if KM_FROM <= km <= KM_TO]
        seq = ([("belépés", t_in, KM_FROM)] + inside + [("kilépés", t_out, KM_TO)])
        # drop duplicates at the boundaries
        seen, clean = set(), []
        for n, s, km in seq:
            k = round(km, 2)
            if k in seen:
                continue
            seen.add(k)
            clean.append((n, s, km))
        base = clean[0][1]
        rel = [(n, s - base, km) for n, s, km in clean]
        if dir_ < 0:
            span = rel[-1][1]
            rel = [(n, span - s, km) for n, s, km in reversed(rel)]
        minute = offset
        while minute < h1 * 60:
            if minute >= h0 * 60:
                t0 = minute * 60
                calls = []
                for i, (n, s, km) in enumerate(rel):
                    arr = t0 + s
                    calls_here = n not in ("belépés", "kilépés")
                    dep = arr + (45 if calls_here and key != "Freight" else 0)
                    calls.append([round(km, 3), round(arr), round(dep),
                                  1 if calls_here else 0])
                services.append({
                    "id": f"{label}-{sid}", "name": label, "dir": dir_,
                    "cars": cars, "stock": stock,
                    "enter": calls[0][0], "enter_s": calls[0][1],
                    "calls": calls,
                    "exit_s": calls[-1][2],
                })
                sid += 1
            minute += period
    services.sort(key=lambda s: s["enter_s"])
    outfile = f"web/data/timetable{suffix}.json"
    json.dump({"services": services}, open(outfile, "w",
              encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)

    from collections import Counter
    c = Counter(s["name"] for s in services)
    print(f"{len(services)} services across the day")
    for k, v in c.most_common():
        print(f"  {k:20s} {v:3d}")
    print("\nfirst six on the line:")
    for s in services[:6]:
        h = s["enter_s"] // 3600; m = (s["enter_s"] % 3600) // 60
        print(f"  {h:02d}:{m:02d}  {s['name']:18s} "
              f"{'→ ' + END_NAME if s['dir'] > 0 else '→ Budapest'}  "
              f"enters at km {s['enter']:.1f}, {len(s['calls'])} calls")
    busiest = max(range(4, 24), key=lambda hh: sum(
        1 for s in services if hh * 3600 <= s["enter_s"] < (hh + 1) * 3600))
    n = sum(1 for s in services if busiest*3600 <= s["enter_s"] < (busiest+1)*3600)
    print(f"\nbusiest hour: {busiest:02d}:00 with {n} trains entering the section")

main()
