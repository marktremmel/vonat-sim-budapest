#!/usr/bin/env python3
"""Ray-march the DEM outward from a point on the line to get the skyline.

For each azimuth we walk out to 30 km, tracking the greatest elevation angle
any sample subtends. That upper envelope is the horizon the driver sees, and
because it is computed rather than drawn it is the real ridgeline of the
Börzsöny and the Visegrádi-hegység, not an impression of one.

Refraction is folded in the surveyor's way: an effective earth radius of
R/(1-k) with k=0.13 approximates standard atmospheric bending.
"""
import json, math, sys
sys.path.insert(0, "tools")
from terrain import Terrain

R_EFF = 6371008.8 / (1.0 - 0.13)
EYE_H = 3.1          # driver's eye above rail, metres
MAX_D = 30000.0
NEAR_STEP, FAR_STEP, FAR_FROM = 25.0, 120.0, 4000.0

def frame(lat0):
    p = math.radians(lat0)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p))

class Horizon:
    def __init__(self, terr):
        self.t = terr

    def scan(self, lat, lon, eye, az0, az1, step_deg=0.2):
        mlat, mlon = frame(lat)
        out = []
        az = az0
        while az <= az1 + 1e-9:
            a = math.radians(az)
            sin_a, cos_a = math.sin(a), math.cos(a)
            best_ang, best_d, best_h = -90.0, 0.0, 0.0
            d = NEAR_STEP
            while d <= MAX_D:
                dlat = (d * cos_a) / mlat
                dlon = (d * sin_a) / mlon
                h = self.t.height(lat + dlat, lon + dlon)
                h -= d * d / (2.0 * R_EFF)              # curvature + refraction
                ang = math.degrees(math.atan2(h - eye, d))
                if ang > best_ang:
                    best_ang, best_d, best_h = ang, d, h
                d += NEAR_STEP if d < FAR_FROM else FAR_STEP
            out.append((round(az, 3), round(best_ang, 4),
                        round(best_d), round(best_h, 1)))
            az += step_deg
        return out

def bearing_dist(lat0, lon0, lat1, lon1):
    """Bearing (deg from north) and ground distance between two points."""
    mlat, mlon = frame(lat0)
    dx = (lon1 - lon0) * mlon
    dy = (lat1 - lat0) * mlat
    return (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0, math.hypot(dx, dy)

def eye_at(km, align, prof):
    pts = align["tracks"][0]["points"]
    target = km * 1000.0
    for a, b in zip(pts, pts[1:]):
        if a[2] <= target <= b[2]:
            t = (target - a[2]) / max(b[2] - a[2], 1e-9)
            lat, lon = a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
            break
    else:
        lat, lon = pts[-1][0], pts[-1][1]
    i = min(int(target / prof["step_m"]), len(prof["profile"]) - 1)
    return lat, lon, prof["profile"][i][1] + EYE_H

def main():
    align = json.load(open("data/alignment.json", encoding="utf-8"))
    prof = json.load(open("data/profile.json", encoding="utf-8"))
    peaks = json.load(open("data/peaks.json", encoding="utf-8"))
    terr = Terrain(12)
    hz = Horizon(terr)

    # each view: label, chainage, centre azimuth, half-width
    views = [
        ("Vác-Alsóváros, the plain opening north", 31.70, 350, 40),
        ("Vác, the Naszály standing over the town", 33.31, 25, 40),
        ("Verőce, where the hills close in", 42.98, 250, 40),
        ("Kismaros, the wall of the Börzsöny", 44.35, 300, 40),
        ("Nagymaros, across the water to Visegrád", 51.70, 200, 40),
        ("Dömösi átkelés, under the Szent Mihály-hegy", 54.30, 215, 40),
        ("Zebegény, the Bend at its tightest", 58.46, 245, 40),
    ]
    result = []
    for title, km, az_c, half in views:
        lat, lon, eye = eye_at(km, align, prof)
        scan = hz.scan(lat, lon, eye, az_c - half, az_c + half)
        top = max(scan, key=lambda s: s[1])
        # peaks inside this fan, measured from the eye rather than from the
        # line's nearest approach, and kept only if they actually break the
        # skyline: a summit hidden behind a nearer ridge gets no label
        lab = []
        for p in peaks:
            b, dist = bearing_dist(lat, lon, p["lat"], p["lon"])
            rel = (b - (az_c - half)) % 360
            if rel > 2 * half or dist > MAX_D or dist < 120:
                continue
            drop = dist * dist / (2.0 * R_EFF)
            ang = math.degrees(math.atan2(p["ele"] - drop - eye, dist))
            i = min(int(round(rel / 0.2)), len(scan) - 1)
            sky = max(scan[max(0, i - 2):i + 3], key=lambda s: s[1])[1]
            if ang < sky - 0.28:
                continue                      # occluded by something nearer
            lab.append({**p, "az": round(b, 2), "from_eye_m": round(dist),
                        "angle": round(ang, 3)})
        lab.sort(key=lambda p: -p["angle"])
        result.append({
            "title": title, "km": km, "az0": az_c - half, "az1": az_c + half,
            "eye": {"lat": round(lat, 6), "lon": round(lon, 6), "h": round(eye, 1)},
            "skyline": scan,
            "labels": lab[:16],
        })
        print(f"{title}\n  km {km}  eye {eye:.1f} m  "
              f"highest skyline {top[1]:.2f}° at az {top[0] % 360:.1f}° "
              f"({top[3]:.0f} m, {top[2]/1000:.1f} km out)")
        print(f"  {len(lab)} summits break this skyline:")
        for p in lab[:7]:
            print(f"    {p['name']:24s} {p['ele']:4.0f} m  "
                  f"{p['from_eye_m']/1000:5.1f} km  az {p['az']:5.1f}°  "
                  f"{p['angle']:5.2f}°")
        print()

    json.dump(result, open("data/horizons.json", "w", encoding="utf-8"),
              ensure_ascii=False)
    print("wrote data/horizons.json")

if __name__ == "__main__":
    main()
