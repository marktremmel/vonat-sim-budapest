#!/usr/bin/env python3
"""Assign signals to a running line, derive block sections, list station roads.

OSM signal coverage on this line is partial, so the point here is not to
pretend we have a complete signalling plan. It is to measure the spacing that
IS mapped, so the rest can be synthesised to match rather than invented.
"""
import json, sys, statistics as st
from collections import defaultdict, Counter
sys.path.insert(0, "tools")
from geo import Chainer, load_tracks, haversine, densify

tracks = load_tracks()
DOWN, UP = Chainer(tracks[0]["points"]), Chainer(tracks[1]["points"])
TOTAL = tracks[0]["length_m"] / 1000.0

infra = json.load(open("data/infra.json", encoding="utf-8"))
ways = json.load(open("data/raw/infra_ways.json", encoding="utf-8"))["elements"]
stops = json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
stops = [s for s in stops if s["name"] != "Nyugati pályaudvar"]

def which_track(lat, lon):
    dc, do, _ = DOWN.snap(lat, lon)
    uc, uo, _ = UP.snap(lat, lon)
    return ("down", dc, do) if do <= uo else ("up", uc, uo)

def nearest_stop(km):
    return min(stops, key=lambda s: abs(s["km"] - km))

# ------------------------------------------------------------------ signals
def assign():
    out = []
    for s in infra["signals"]:
        line, ch, off = which_track(s["lat"], s["lon"])
        st_ = nearest_stop(ch / 1000)
        out.append({**s, "line": line, "line_km": round(ch / 1000, 3),
                    "line_offset_m": round(off, 1),
                    "near": st_["name"], "near_dist_km": round(ch / 1000 - st_["km"], 3)})
    out.sort(key=lambda r: r["line_km"])
    return out

def block_sections(sig):
    """Gaps between consecutive signals that can hold a train, per track."""
    res = {}
    for line in ("down", "up"):
        seq = [s for s in sig if s["line"] == line
               and (s["function"] in ("block", "entry", "exit") or "main" in s["kinds"])]
        seq.sort(key=lambda r: r["line_km"])
        secs = []
        for a, b in zip(seq, seq[1:]):
            d = (b["line_km"] - a["line_km"]) * 1000
            if d < 60:
                continue
            secs.append({"from_km": a["line_km"], "to_km": b["line_km"],
                         "length_m": round(d),
                         "from": a["function"] or "untagged",
                         "to": b["function"] or "untagged",
                         "near": a["near"]})
        res[line] = secs
    return res

# ---------------------------------------------------------- station layouts
def station_roads():
    """Numbered running roads at each station, from OSM track refs."""
    by_stop = defaultdict(dict)
    for w in ways:
        t = w.get("tags", {})
        if t.get("railway") != "rail" or not t.get("ref"):
            continue
        g = w.get("geometry") or []
        if len(g) < 2:
            continue
        mid = g[len(g) // 2]
        line, ch, off = which_track(mid["lat"], mid["lon"])
        if off > 130:
            continue
        s = nearest_stop(ch / 1000)
        if abs(ch / 1000 - s["km"]) > 1.4:
            continue
        length = sum(haversine((a["lat"], a["lon"]), (b["lat"], b["lon"]))
                     for a, b in zip(g, g[1:]))
        rec = by_stop[s["name"]].setdefault(t["ref"], {
            "ref": t["ref"], "length_m": 0.0, "service": t.get("service"),
            "electrified": t.get("electrified"), "maxspeed": t.get("maxspeed"),
        })
        rec["length_m"] += length
    out = {}
    for name, roads in by_stop.items():
        rs = sorted(roads.values(), key=lambda r: (len(r["ref"]), r["ref"]))
        for r in rs:
            r["length_m"] = round(r["length_m"])
        out[name] = rs
    return out

def main():
    sig = assign()
    blocks = block_sections(sig)
    roads = station_roads()

    json.dump({"signals": sig, "blocks": blocks, "station_roads": roads},
              open("data/blocks.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print("=== signals by running line ===")
    print("  ", Counter(s["line"] for s in sig).most_common())
    print("  functions:", Counter(s["function"] or "untagged" for s in sig).most_common())

    print("\n=== measured block spacing ===")
    for line, secs in blocks.items():
        L = [s["length_m"] for s in secs]
        if not L:
            continue
        print(f"  {line} line: {len(secs)} gaps between mapped signals")
        print(f"    median {st.median(L):.0f} m, shortest {min(L)} m, longest {max(L)} m")
        tight = sorted(secs, key=lambda s: s["length_m"])[:4]
        for t in tight:
            print(f"      {t['length_m']:6d} m  km {t['from_km']:.2f}→{t['to_km']:.2f}"
                  f"  {t['from']}→{t['to']}  ({t['near']})")

    print("\n=== how complete is the signalling data ===")
    n_main = sum(1 for s in sig if "main" in s["kinds"])
    est = int(TOTAL / 1.8) * 2 + len(stops) * 4
    print(f"  {len(sig)} signals mapped, {n_main} with a main-signal tag.")
    print(f"  A double-track automatic-block line this long needs on the order of")
    print(f"  {est} main signals. OSM has roughly {100*n_main/est:.0f}% of them.")

    print("\n=== numbered station roads (vágány) ===")
    for name in [s["name"] for s in stops]:
        rs = roads.get(name)
        if not rs:
            continue
        refs = ", ".join(f"{r['ref']}({r['length_m']}m)" for r in rs[:10])
        print(f"  {name:22s} {len(rs):2d}  {refs}")
    print(f"\nwrote data/blocks.json")

main()
