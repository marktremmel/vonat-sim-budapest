#!/usr/bin/env python3
"""How hemmed-in the line feels, kilometre by kilometre.

At each sample point we take the highest terrain angle in a forward fan to the
left and to the right. Plotted along the route this is the shape of the
journey: open plain out of Budapest, then the valley walls rising after Vác.
"""
import json, math, sys
sys.path.insert(0, "tools")
from terrain import Terrain
from horizon import frame, R_EFF, eye_at

STEP_KM = 0.25
AZ_STEP = 3.0
FAN = 75.0          # degrees either side of abeam
MAX_D = 15000.0

def ranges():
    d, out = 60.0, []
    while d <= MAX_D:
        out.append(d)
        d *= 1.09
    return out
RANGES = ranges()

def heading_at(km, pts):
    t = km * 1000.0
    for a, b in zip(pts, pts[1:]):
        if a[2] <= t <= b[2]:
            mlat, mlon = frame(a[0])
            return (math.degrees(math.atan2((b[1] - a[1]) * mlon,
                                            (b[0] - a[0]) * mlat)) + 360) % 360
    return 0.0

def max_angle(terr, lat, lon, eye, az_c):
    mlat, mlon = frame(lat)
    best = -90.0
    az = az_c - FAN
    while az <= az_c + FAN:
        a = math.radians(az)
        sa, ca = math.sin(a), math.cos(a)
        for d in RANGES:
            h = terr.height(lat + (d * ca) / mlat, lon + (d * sa) / mlon)
            h -= d * d / (2.0 * R_EFF)
            ang = math.degrees(math.atan2(h - eye, d))
            if ang > best:
                best = ang
        az += AZ_STEP
    return best

def main():
    align = json.load(open("data/alignment.json", encoding="utf-8"))
    prof = json.load(open("data/profile.json", encoding="utf-8"))
    pts = align["tracks"][0]["points"]
    terr = Terrain(12)
    total = pts[-1][2] / 1000.0

    out, km = [], 0.0
    while km <= total:
        lat, lon, eye = eye_at(km, align, prof)
        hd = heading_at(km, pts)
        left = max_angle(terr, lat, lon, eye, (hd - 90) % 360)
        right = max_angle(terr, lat, lon, eye, (hd + 90) % 360)
        out.append([round(km, 3), round(left, 2), round(right, 2)])
        km += STEP_KM

    json.dump({"step_km": STEP_KM, "fan_deg": FAN, "enclosure": out},
              open("data/enclosure.json", "w", encoding="utf-8"))

    print(f"{len(out)} samples\n{'km':>6} {'left°':>6} {'right°':>6}  profile")
    for r in out:
        if abs(r[0] * 4 - round(r[0] * 4)) < 1e-6 and r[0] % 4 < 1e-6:
            bar = "#" * int(max(r[1], 0) * 1.4) + "|" + "#" * int(max(r[2], 0) * 1.4)
            print(f"{r[0]:6.1f} {r[1]:6.2f} {r[2]:6.2f}  {bar}")
    lo = min(out, key=lambda r: max(r[1], r[2]))
    hi = max(out, key=lambda r: max(r[1], r[2]))
    print(f"\nmost open  km {lo[0]:.2f}  (L {lo[1]:.1f}° R {lo[2]:.1f}°)")
    print(f"most closed km {hi[0]:.2f}  (L {hi[1]:.1f}° R {hi[2]:.1f}°)")
    print("wrote data/enclosure.json")

main()
