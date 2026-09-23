#!/usr/bin/env python3
"""Stitched terrarium elevation raster with bilinear sampling."""
import math, os
from PIL import Image

class Terrain:
    def __init__(self, z=12, root="data/raw/terrain"):
        self.z = z
        d = f"{root}/{z}"
        self.z, self.x0, self.x1, self.y0, self.y1 = map(
            int, open(f"{d}/extent.txt").read().split())
        self.w = (self.x1 - self.x0 + 1) * 256
        self.h = (self.y1 - self.y0 + 1) * 256
        canvas = Image.new("RGB", (self.w, self.h))
        for x in range(self.x0, self.x1 + 1):
            for y in range(self.y0, self.y1 + 1):
                canvas.paste(Image.open(f"{d}/{x}_{y}.png").convert("RGB"),
                             ((x - self.x0) * 256, (y - self.y0) * 256))
        self.px = canvas.load()
        self.n = 1 << self.z

    def _pix(self, lat, lon):
        """Fractional pixel position in the stitched canvas."""
        gx = (lon + 180.0) / 360.0 * self.n * 256 - self.x0 * 256
        r = math.radians(lat)
        gy = (1.0 - math.asinh(math.tan(r)) / math.pi) / 2.0 * self.n * 256 - self.y0 * 256
        return gx, gy

    def _raw(self, ix, iy):
        ix = min(max(ix, 0), self.w - 1)
        iy = min(max(iy, 0), self.h - 1)
        r, g, b = self.px[ix, iy]
        return (r * 256 + g + b / 256.0) - 32768.0

    def height(self, lat, lon):
        gx, gy = self._pix(lat, lon)
        x0, y0 = math.floor(gx - 0.5), math.floor(gy - 0.5)
        fx, fy = (gx - 0.5) - x0, (gy - 0.5) - y0
        h00 = self._raw(x0, y0);     h10 = self._raw(x0 + 1, y0)
        h01 = self._raw(x0, y0 + 1); h11 = self._raw(x0 + 1, y0 + 1)
        return ((h00 * (1 - fx) + h10 * fx) * (1 - fy)
                + (h01 * (1 - fx) + h11 * fx) * fy)

    def metres_per_pixel(self, lat):
        return 40075016.686 * math.cos(math.radians(lat)) / (self.n * 256)
