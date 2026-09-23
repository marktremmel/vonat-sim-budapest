#!/usr/bin/env python3
"""Derive running times from physics, check them against the real timetable.

If a simulated MÁV 815 covers Nyugati to Vác in about 44 minutes and Nyugati to
Szob in about 77, calling everywhere, then the speed profile, the gradients and
the vehicle model are all right at once — and every other service can be timed
with the same engine instead of being guessed.
"""
import json, sys, math
sys.path.insert(0, "tools")
from rollingstock import KISS, FLIRT, PUSHPULL, FREIGHT, RAILJET, simulate

DS = 20.0
align = json.load(open("data/alignment.json", encoding="utf-8"))["tracks"][0]
prof = json.load(open("data/profile.json", encoding="utf-8"))["profile"]
STOPS = [s for s in json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
         if s["name"] != "Nyugati pályaudvar"]
BY_NAME = {s["name"]: s for s in STOPS}
TOTAL_M = align["length_m"]
N = int(TOTAL_M / DS) + 1

# published S70 minutes from Budapest-Nyugati, southbound
REAL = {"Budapest-Nyugati": 0, "Rákosrendező": 5, "Istvántelek": 9,
        "Rákospalota-Újpest": 12, "Dunakeszi alsó": 17, "Dunakeszi": 20,
        "Dunakeszi-Gyártelep": 23, "Alsógöd": 27, "Göd": 29, "Felsőgöd": 32,
        "Sződ-Sződliget": 36, "Vác-Alsóváros": 41, "Vác": 44, "Verőce": 50,
        "Kismaros": 52, "Nagymaros-Visegrád": 58, "Nagymaros": 60,
        "Zebegény": 68, "Szob alsó": 74, "Szob": 77}

def speed_limits():
    """km/h per DS step, from OSM maxspeed plus the standing slow orders."""
    pts, ms = align["points"], align["maxspeed"]
    lim = [100] * N
    j = 0
    for i in range(N):
        ch = i * DS
        while j < len(ms) - 1 and pts[j + 1][2] < ch:
            j += 1
        lim[i] = ms[j] or 100
    # Dömösi átkelés landslide: permanent 40 toward Szob, 60 toward Vác
    for i in range(N):
        if 53.4 <= i * DS / 1000 <= 55.6:
            lim[i] = min(lim[i], 40)
    return lim

def grades():
    g = [0.0] * N
    step = 20.0
    for i in range(N):
        j = min(int(i * DS / step), len(prof) - 1)
        g[i] = prof[j][2]
    return g

LIM, GRD = speed_limits(), grades()

PATTERNS = {
    "S70": [s["name"] for s in STOPS if s["name"] not in ("Kisvác", "Fenyveshegy")],
    "G70": ["Budapest-Nyugati", "Rákosrendező", "Rákospalota-Újpest", "Dunakeszi",
            "Dunakeszi-Gyártelep", "Felsőgöd", "Vác-Alsóváros", "Vác", "Verőce",
            "Kismaros", "Nagymaros-Visegrád", "Nagymaros", "Zebegény",
            "Szob alsó", "Szob"],
    "Z70": ["Budapest-Nyugati", "Vác", "Verőce", "Kismaros", "Nagymaros-Visegrád",
            "Nagymaros", "Zebegény", "Szob alsó", "Szob"],
    "EC":  ["Budapest-Nyugati", "Vác", "Nagymaros-Visegrád", "Szob"],
    "Freight": ["Budapest-Nyugati", "Szob"],
}

def stop_metres(names):
    return [BY_NAME[n]["km"] * 1000 for n in names if n in BY_NAME]

def leg_runs(stock, names):
    """Pure technical running seconds for each leg, no dwell, no margin."""
    ms = stop_metres(names)
    return [simulate(stock, LIM, GRD, [], ds=DS, dwell_s=0.0,
                     start_km=a / 1000, end_km=b / 1000)[0]
            for a, b in zip(ms, ms[1:])]

def schedule(names, runs, margin, dwell):
    """Turn technical running times into a timetable: margin, then dwell."""
    out, t = [(names[0], 0.0)], 0.0
    for i, r in enumerate(runs):
        t += r * (1.0 + margin)
        out.append((names[i + 1], t))
        t += dwell
    return out

def fit_margin_dwell(names, runs, dwell_lo=30.0, dwell_hi=50.0):
    """Least squares fit of recovery margin and station dwell to the real times.

    The two parameters trade off almost perfectly — more dwell buys less margin
    — so dwell is held to a range a real suburban stop actually takes and the
    margin takes the remainder. Left unconstrained the fit puts 78 s at every
    halt, which no KISS has ever needed.
    """
    obs = [(i, REAL[n] * 60.0) for i, n in enumerate(names) if n in REAL]
    cum = []
    acc = 0.0
    for r in runs:
        acc += r
        cum.append(acc)
    best = None
    m = 0.0
    while m <= 0.40:
        d = dwell_lo
        while d <= dwell_hi:
            err = 0.0
            for i, target in obs:
                if i == 0:
                    continue
                pred = cum[i - 1] * (1 + m) + (i - 1) * d
                err += (pred - target) ** 2
            if best is None or err < best[0]:
                best = (err, m, d)
            d += 1.0
        m += 0.005
    return best[1], best[2], (best[0] / max(len(obs) - 1, 1)) ** 0.5

def main():
    names = PATTERNS["S70"]
    runs = leg_runs(KISS, names)
    pure = sum(runs) / 60.0
    margin, dwell, rms = fit_margin_dwell(names, runs)
    legs = schedule(names, runs, margin, dwell)

    print("=== S70: technical running time vs the published timetable ===")
    print(f"  pure running time, no stops, driven to the limit: {pure:.1f} min")
    print(f"  published all-stations time:                      77 min")
    print(f"  fitted recovery margin {margin*100:.1f}%  station dwell {dwell:.0f} s"
          f"   (rms residual {rms/60:.2f} min)\n")
    print(f"{'station':22s} {'sched':>6} {'real':>5} {'diff':>6}  {'leg run':>8}")
    worst = 0.0
    for i, (name, secs) in enumerate(legs):
        m = secs / 60.0
        r = REAL.get(name)
        leg = f"{runs[i-1]/60:7.2f}m" if i else "       —"
        if r is None:
            print(f"{name:22s} {m:6.1f}     —      —  {leg}")
            continue
        d = m - r
        worst = max(worst, abs(d))
        print(f"{name:22s} {m:6.1f} {r:5d} {d:+6.1f}  {leg}")
    print(f"\n  largest station error after fitting: {worst:.1f} min")
    sched_total = legs[-1][1] / 60.0
    dist = BY_NAME["Szob"]["km"]
    print(f"  timetable is {(77*60)/(pure*60):.2f}x the technical minimum — "
          f"that gap is the player's tactical room")
    print(f"  average speed: {dist/(pure/60):.1f} km/h flat out, "
          f"{dist/(sched_total/60):.1f} km/h to the timetable "
          f"(published figure for the S70 is 49–53)")

    print("\n=== every service pattern, same engine ===")
    combos = [("S70", KISS, dwell), ("S70 (FLIRT)", FLIRT, dwell),
              ("G70", KISS, dwell), ("Z70", KISS, dwell),
              ("EC", RAILJET, 150), ("Freight", FREIGHT, 0)]
    results = {}
    for label, stock, dw in combos:
        pat = PATTERNS[label.split()[0]]
        rr = leg_runs(stock, pat)
        lg = schedule(pat, rr, margin, dw)
        results[label] = lg
        print(f"  {label:14s} {stock.name:28s} {len(pat):2d} calls "
              f"{sum(rr)/60:6.1f} min running  {lg[-1][1]/60:6.1f} min scheduled")

    json.dump({k: [[n, round(s, 1)] for n, s in v] for k, v in results.items()},
              open("data/runtimes.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("\nwrote data/runtimes.json")

main()
