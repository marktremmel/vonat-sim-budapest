#!/usr/bin/env python3
"""Synthesise the missing two thirds of the block plan, and model the aspects.

Mapped signals are anchors and never move. Gaps between them are filled with
evenly spaced block signals so that no section is shorter than the MÁV standard
braking distance of 700 m, and none is much longer than the headway target for
its line speed.
"""
import json, sys, math
from collections import Counter
sys.path.insert(0, "tools")

FEKUT = 700.0       # MÁV standard braking distance, metres
TARGET = {120: 1500.0, 100: 1300.0, 80: 1100.0, 60: 900.0, 20: 700.0}

align = json.load(open("data/alignment.json", encoding="utf-8"))["tracks"][0]
BLK = json.load(open("data/blocks.json", encoding="utf-8"))
STOPS = [s for s in json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
         if s["name"] != "Nyugati pályaudvar"]
TOTAL = align["length_m"]

def limit_at(m):
    pts, ms = align["points"], align["maxspeed"]
    for i in range(len(ms)):
        if pts[i][2] <= m <= pts[i + 1][2]:
            return ms[i] or 100
    return 100

def target_at(m):
    return TARGET.get(limit_at(m), 1300.0)

def merge(points, tol=60.0):
    """Collapse anchors closer together than one signal spacing."""
    out = []
    for p in sorted(points):
        if out and p - out[-1] < tol:
            continue
        out.append(p)
    return out

def near_station(m, tol_km=0.9):
    return any(abs(m / 1000 - s["km"]) <= tol_km for s in STOPS)

def synthesise(line):
    anchors = merge(round(s["line_km"] * 1000)
                    for s in BLK["signals"] if s["line"] == line
                    and (s["function"] in ("entry", "exit", "block")
                         or "main" in s["kinds"]))
    anchors = merge([0.0] + [a for a in anchors if 60 < a < TOTAL - 60] + [TOTAL])
    out = []
    for a, b in zip(anchors, anchors[1:]):
        out.append({"m": a, "source": "osm"})
        gap = b - a
        tgt = target_at((a + b) / 2)
        if gap <= tgt * 1.45:
            continue
        n = max(1, int(round(gap / tgt)) - 1)
        while n > 0 and gap / (n + 1) < FEKUT:
            n -= 1
        for k in range(1, n + 1):
            out.append({"m": a + gap * k / (n + 1), "source": "synthetic"})
    out.append({"m": TOTAL, "source": "osm"})
    # dedupe and measure
    seen, clean = set(), []
    for s in sorted(out, key=lambda r: r["m"]):
        k = round(s["m"])
        if k in seen:
            continue
        seen.add(k)
        clean.append(s)
    for a, b in zip(clean, clean[1:]):
        a["section_m"] = round(b["m"] - a["m"])
        a["limit"] = limit_at(a["m"])
        # a gap wholly inside station limits is a station track, not a running
        # block, and is not required to hold a full braking distance
        a["kind"] = ("station" if near_station(a["m"]) and near_station(b["m"])
                     and a["section_m"] < FEKUT else "running")
    clean[-1]["section_m"] = 0
    clean[-1]["limit"] = limit_at(clean[-1]["m"])
    clean[-1]["kind"] = "running"
    return clean

# ------------------------------------------------------------ aspect model
ASPECTS = [
    ("MAX",  "MAX", "zöld",                  "green",
     "Szabad. Pass at line speed, the next signal also clears."),
    ("MAX",  "80",  "zöld villogó",          "green flashing",
     "Pass at line speed, expect 80 at the next signal."),
    ("MAX",  "40",  "zöld villogó",          "green flashing",
     "Pass at line speed, expect 40 at the next signal."),
    ("MAX",  "0",   "sárga",                 "yellow",
     "Megállj jelzésre számíts. Pass, but the next signal is at danger."),
    ("80",   "MAX", "sárga + zöld",          "yellow over green",
     "Pass at no more than 80; the next signal clears."),
    ("80",   "0",   "sárga + sárga villogó", "yellow over yellow flashing",
     "Pass at no more than 80; the next signal is at danger."),
    ("40",   "MAX", "két sárga",             "two yellow",
     "Pass at no more than 40, diverging route; next signal clears."),
    ("40",   "0",   "két sárga villogó",     "two yellow flashing",
     "Pass at no more than 40; the next signal is at danger."),
    ("15",   "—",   "hívójelzés (fehér)",    "white",
     "Call-on. Proceed on sight at no more than 15 km/h."),
    ("0",    "—",   "vörös",                 "red",
     "Megállj. Stop, and do not pass."),
]

def headway(block_m, v_kmh, train_m=156.0, react_s=8.0):
    """Three-aspect headway: two clear sections plus the train, at line speed."""
    v = v_kmh / 3.6
    return (2 * block_m + train_m) / v + react_s

def main():
    plan = {ln: synthesise(ln) for ln in ("down", "up")}
    json.dump({"braking_distance_m": FEKUT, "targets": TARGET,
               "plan": plan, "aspects": ASPECTS},
              open("data/blockplan.json", "w", encoding="utf-8"), ensure_ascii=False)

    for ln, sig in plan.items():
        src = Counter(s["source"] for s in sig)
        run = sorted(s["section_m"] for s in sig
                     if s["section_m"] > 0 and s["kind"] == "running")
        stn = sorted(s["section_m"] for s in sig
                     if s["section_m"] > 0 and s["kind"] == "station")
        print(f"=== {ln} line: {len(sig)} signals "
              f"({src['osm']} from OSM, {src['synthetic']} synthesised) ===")
        print(f"  running blocks: {len(run)}   shortest {run[0]} m   "
              f"median {run[len(run)//2]} m   longest {run[-1]} m")
        print(f"  station sections (entry to exit): {len(stn)}   "
              f"{stn[0]}–{stn[-1]} m — these are platform roads, not blocks")
        under = [x for x in run if x < FEKUT]
        print(f"  running blocks under the {FEKUT:.0f} m braking distance: "
              + (f"{len(under)}  {under}" if under else "none"))
        by = Counter()
        for s in sig:
            if s["section_m"] > 0:
                by[s["limit"]] += 1
        print("  sections by line speed:", dict(sorted(by.items())))
        print()

    print("=== signalling headway, three-aspect ===")
    for v in (120, 100, 80, 60):
        b = TARGET[v]
        h = headway(b, v)
        print(f"  {v:3d} km/h, {b:.0f} m sections → {h:5.1f} s theoretical minimum")
    print("  Theoretical only. What actually limits this line is Nyugati's")
    print("  platforms, the flat junction at Rákospalota-Újpest and 50 s dwells,")
    print("  so plan for a practical 3-4 minute headway, not 100 seconds.")

    print("\n=== aspect table ===")
    print(f"  {'pass':>5} {'next':>5}  {'Hungarian':24s} {'lamps':28s}")
    for p, n, hu, en, _ in ASPECTS:
        print(f"  {p:>5} {n:>5}  {hu:24s} {en:28s}")
    print("\nwrote data/blockplan.json")

main()
