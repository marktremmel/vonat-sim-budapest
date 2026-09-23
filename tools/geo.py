#!/usr/bin/env python3
"""Shared geometry helpers: local metric frame, snapping, chainage."""
import json, math

R = 6371008.8

def frame(lat0):
    """Metres per degree of latitude and longitude at this latitude."""
    p = math.radians(lat0)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p))

MLAT, MLON = frame(47.67)

def xy(lat, lon):
    return lon * MLON, lat * MLAT

def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))

def load_tracks(path="data/alignment.json"):
    return json.load(open(path, encoding="utf-8"))["tracks"]

CELL = 400.0  # metres, spatial index cell size

class Chainer:
    """Projects a point onto a track polyline to get chainage and offset.

    Segments are indexed into a coarse grid so snapping tens of thousands of
    points stays linear rather than quadratic.
    """

    def __init__(self, points):
        self.p = points
        self.seg = []
        self.grid = {}
        for a, b in zip(points, points[1:]):
            x1, y1 = xy(a[0], a[1])
            x2, y2 = xy(b[0], b[1])
            i = len(self.seg)
            self.seg.append((x1, y1, x2 - x1, y2 - y1,
                             (x2 - x1) ** 2 + (y2 - y1) ** 2, a[2], b[2]))
            for cx in range(int(min(x1, x2) // CELL), int(max(x1, x2) // CELL) + 1):
                for cy in range(int(min(y1, y2) // CELL), int(max(y1, y2) // CELL) + 1):
                    self.grid.setdefault((cx, cy), []).append(i)

    def _candidates(self, px, py, rings=1):
        cx, cy = int(px // CELL), int(py // CELL)
        out = set()
        for i in range(-rings, rings + 1):
            for j in range(-rings, rings + 1):
                out.update(self.grid.get((cx + i, cy + j), ()))
        return out

    def snap(self, lat, lon):
        """Returns (chainage_m, offset_m, side) — side is +1 left of travel."""
        px, py = xy(lat, lon)
        cand = self._candidates(px, py)
        if not cand:
            cand = self._candidates(px, py, rings=4)
        if not cand:
            cand = range(len(self.seg))
        bd, bch, bside = 1e18, 0.0, 0
        for k in cand:
            x1, y1, dx, dy, L2, c1, c2 = self.seg[k]
            t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / L2))
            qx, qy = x1 + t * dx, y1 + t * dy
            d = math.hypot(px - qx, py - qy)
            if d < bd:
                bd = d
                bch = c1 + t * (c2 - c1)
                bside = 1 if (dx * (py - qy) - dy * (px - qx)) > 0 else -1
        return bch, bd, bside

    def at(self, ch):
        """Interpolated lat/lon at a chainage."""
        for a, b in zip(self.p, self.p[1:]):
            if a[2] <= ch <= b[2]:
                t = (ch - a[2]) / max(b[2] - a[2], 1e-9)
                return a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
        return self.p[-1][0], self.p[-1][1]

def densify(geometry, step=20.0):
    """Walk a way's geometry at fixed metric intervals."""
    out, carry = [], 0.0
    for a, b in zip(geometry, geometry[1:]):
        d = haversine((a["lat"], a["lon"]), (b["lat"], b["lon"]))
        if d <= 0:
            continue
        t = carry
        while t < d:
            f = t / d
            out.append((a["lat"] + f * (b["lat"] - a["lat"]),
                        a["lon"] + f * (b["lon"] - a["lon"])))
            t += step
        carry = t - d
    if geometry:
        out.append((geometry[-1]["lat"], geometry[-1]["lon"]))
    return out

