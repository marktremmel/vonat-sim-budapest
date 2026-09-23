#!/usr/bin/env python3
"""Running times for a line without surveyed ones, by actually running it.

Line 70's runtimes.json entries were validated against the published S70
timetable. Line 2 had placeholders from mock_runtimes.py (a flat assumed
speed). This drives a FLIRT along the baked route — its speed limits, its
calls — with the same simple physics the simulator uses (tractive effort
capped by power, a service brake, a dwell at each call), then adds a recovery
margin, and writes the cumulative seconds per call into data/runtimes.json.

    python3 tools/line_runtimes.py line2
"""
import json, sys

LINE = sys.argv[1] if len(sys.argv) > 1 else "line2"
route = json.load(open(f"web/data/route_{LINE}.json", encoding="utf-8"))
stops = route["stops"]
lim = route["limits"]
grades = route["grades"]

# FLIRT: 158 t, 2.6 MW, 200 kN start, service brake 0.8 m/s2 used at 0.6
MASS, P, TE0, VMAX, BRK = 158e3 * 1.08, 2.6e6, 2.0e5, 120 / 3.6, 0.6
DWELL, MARGIN = 45.0, 0.18   # single track: crossing waits are real time

def limit(m):
    v = lim[0][1]
    for mm, vv in lim:
        if mm > m: break
        v = vv
    return min(v / 3.6, VMAX)

def grade(m):
    i = max(0, min(len(grades) - 1, int(m / 100)))
    return grades[i][1] / 1000.0

def run(calls):
    """calls: chainages in metres, first is the start. Returns seconds at each."""
    out, t = [0.0], 0.0
    for a, b in zip(calls, calls[1:]):
        m, v = a, 0.0
        dt = 0.5
        while m < b - 0.5:
            # the fastest we may go here and still stop at b / slow for limits
            cap = limit(m)
            for d in range(40, 2000, 40):
                cap = min(cap, (limit(m + d) ** 2 + 2 * BRK * d) ** 0.5)
            cap = min(cap, (2 * BRK * max(0.0, b - m - 2)) ** 0.5)
            te = TE0 if v < 0.5 else min(TE0, P / v)
            res = 0.0015 * MASS * 9.81 + 0.5 * 1.2 * 8 * v * v + MASS * 9.81 * grade(m)
            if v < cap - 0.2:
                acc = (te - res) / MASS
            elif v > cap + 0.2:
                acc = -BRK
            else:
                acc = 0.0
            v = max(0.3, min(cap + 0.3, v + acc * dt))
            m += v * dt
            t += dt
        t += DWELL
        out.append(t - DWELL)          # arrival
    return [round(s * (1 + MARGIN), 1) for s in out]

rt = json.load(open("data/runtimes.json", encoding="utf-8"))
names = [s["name"] for s in stops]
kms = [s["km"] * 1000 for s in stops]
# S72 calls everywhere; Z72 skips the Budapest halts and the small Pilis ones
Z_SKIP = {"Boros-Pincehely", "Angyalföld", "Aquincum", "Aranyvölgy", "Szélhegy",
          "Vörösvárbánya", "Szabadságliget", "Klotildliget", "Magdolnavölgy",
          "Leányvár", "Esztergom-Kertváros"}
PATTERNS = {"line2": (("S72", names), ("Z72", [n for n in names if n not in Z_SKIP])),
            # S21 calls everywhere between Nyugati and Lajosmizse
            "s21": (("S21", names),)}[LINE]
for key, keep in PATTERNS:
    sel = [(n, k) for n, k in zip(names, kms) if n in keep]
    secs = run([k for _, k in sel])
    rt[key] = [[n, s] for (n, _), s in zip(sel, secs)]
    print(f"{key}: {len(sel)} calls, {sel[0][0]} → {sel[-1][0]} in {secs[-1] / 60:.0f} min")
json.dump(rt, open("data/runtimes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
