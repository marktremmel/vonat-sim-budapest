#!/usr/bin/env python3
"""Elevation profile and gradients along the line 70 down track.

Terrarium is a *surface* model at 26 m/px. Where the line is cut into a
hillside — the Nagymaros–Zebegény ledge especially — raw samples read the slope
above the track, not the track. So the profile is graded like a railway: median
filter to kill spikes, then a slope limiter that enforces a ruling gradient,
then a wide mean. The result is a driveable profile, not a survey.
""" 
import json, sys, statistics as st
sys.path.insert(0, "tools")
from terrain import Terrain

STEP = 20.0      # metres between profile samples
RULING = 10.0    # per mille — cap for the slope limiter

def resample(pts, step):
    """Walk the polyline at fixed chainage intervals, interpolating lat/lon."""
    out, target, j = [], 0.0, 0
    total = pts[-1][2]
    while target <= total:
        while j < len(pts) - 2 and pts[j + 1][2] < target:
            j += 1
        a, b = pts[j], pts[j + 1]
        span = b[2] - a[2]
        t = 0.0 if span <= 0 else (target - a[2]) / span
        out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), target))
        target += step
    return out

def rolling_median(v, w):
    h, n = w // 2, len(v)
    return [st.median(v[max(0, i - h):min(n, i + h + 1)]) for i in range(n)]

def rolling_mean(v, w):
    h, n = w // 2, len(v)
    return [sum(v[max(0, i - h):min(n, i + h + 1)])
            / len(v[max(0, i - h):min(n, i + h + 1)]) for i in range(n)]

def slope_limit(h, step, ruling):
    """Clamp the profile downward until no step exceeds the ruling gradient."""
    cap = ruling / 1000.0 * step
    h = list(h)
    for i in range(1, len(h)):
        h[i] = min(h[i], h[i - 1] + cap)
    for i in range(len(h) - 2, -1, -1):
        h[i] = min(h[i], h[i + 1] + cap)
    return h

def main():
    align = json.load(open("data/alignment.json", encoding="utf-8"))
    pts = align["tracks"][0]["points"]
    terr = Terrain(12)
    print(f"terrain raster {terr.w}x{terr.h} px, "
          f"{terr.metres_per_pixel(47.7):.1f} m/px at the Bend")

    samples = resample(pts, STEP)
    raw = [terr.height(la, lo) for la, lo, _ in samples]
    smooth = rolling_median(raw, 31)                     # ~620 m median
    smooth = slope_limit(smooth, STEP, RULING)
    smooth = rolling_mean(smooth, 51)                    # ~1 km mean
    smooth = slope_limit(smooth, STEP, RULING)

    grad = [0.0]
    for a, b in zip(smooth, smooth[1:]):
        grad.append((b - a) / STEP * 1000.0)              # per mille
    grad = rolling_mean(grad, 15)

    prof = [[round(c, 1), round(h, 2), round(g, 2)]
            for (_, _, c), h, g in zip(samples, smooth, grad)]
    json.dump({
        "source": "AWS terrarium tiles z12 (SRTM-derived), smoothed for rail grading",
        "step_m": STEP,
        "profile": prof,
    }, open("data/profile.json", "w", encoding="utf-8"))

    stops = json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
    print(f"\n{'km':>7} {'m ASL':>7}  station")
    for s in stops:
        if s["name"] == "Nyugati pályaudvar":
            continue
        i = min(int(s["km"] * 1000 / STEP), len(smooth) - 1)
        print(f"{s['km']:7.3f} {smooth[i]:7.1f}  {s['name']}")

    worst = max(range(len(grad)), key=lambda i: abs(grad[i]))
    lo, hi = min(smooth), max(smooth)
    print(f"\nlowest {lo:.1f} m, highest {hi:.1f} m, "
          f"steepest {grad[worst]:+.2f} per mille at km {samples[worst][2]/1000:.2f}")
    climbs = sorted(((abs(g), c) for g, (_, _, c) in zip(grad, samples)), reverse=True)
    print("worst grades sit at km " + ", ".join(f"{c/1000:.1f}" for _, c in climbs[:5]))
    print(f"wrote data/profile.json — {len(prof)} samples every {STEP:.0f} m")

main()
