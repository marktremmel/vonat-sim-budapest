#!/usr/bin/env python3
"""Take the buildings out of the ground.

The elevation tiles are a SURFACE model: over a city the "ground" includes the
roofs, smeared over 25 m pixels. Everything that stands on `demAt` inherits it
— houses float where the model bulges, cars on a road sit under a hump the
road mesh smoothed over, and a green hill rises in the middle of Nyugati tér.

A grey-scale morphological opening (minimum filter, then maximum filter) over
a ~130 m window removes anything narrower than the window — a building, a
block — and returns wider shapes unchanged: a linear slope survives exactly,
so real hills are not cut down. It is applied only where the land cover is
built-up (residential, industrial, park), feathered at the edges, and never
on railway land, so embankments and yards keep their height.

Idempotent: the original surface model is kept at data/raw/height_near_dsm*.png
and always used as the input.

    python3 tools/ground_filter.py            # line 70
    python3 tools/ground_filter.py line2      # web/data/height_near_line2.png
"""
import os, shutil, sys
import numpy as np
from PIL import Image
from numpy.lib.stride_tricks import sliding_window_view as win

# numpy-only filters: scipy on this machine fails to load a binary module
def _pad(a, r, mode="edge"): return np.pad(a, r, mode=mode)
def minf(a, k): return win(_pad(a, k // 2), (k, k)).min(axis=(-1, -2))
def maxf(a, k): return win(_pad(a, k // 2), (k, k)).max(axis=(-1, -2))
def blur(a, r):
    k = 2 * r + 1
    return win(_pad(a.astype(np.float32), r), (k, k)).mean(axis=(-1, -2))

line = sys.argv[1] if len(sys.argv) > 1 else "line70"
suffix = "" if line == "line70" else f"_{line}"
out = f"web/data/height_near{suffix}.png"
orig = f"data/raw/height_near_dsm{suffix}.png"
cover = f"web/data/cover_near{suffix}.png"
if not os.path.exists(orig):
    shutil.copy(out, orig)

rgb = np.array(Image.open(orig).convert("RGB")).astype(np.int32)
h = (rgb[..., 0] * 256 + rgb[..., 1]) / 10.0
cls = np.array(Image.open(cover).convert("RGB"))[..., 0]

URBAN = (cls == 7) | (cls == 8) | (cls == 13)
mask = (maxf(URBAN.astype(np.uint8), 5) > 0) & (cls != 12) & (cls != 9)
soft = blur(mask.astype(np.float32), 2)
soft[cls == 12] = 0.0

K = 5                                      # 5 px ≈ 128 m at 25.7 m/px
opened = blur(maxf(minf(h, K), K), 1)
ground = np.minimum(h, h - (h - opened) * soft)

d = h - ground
print(f"{line}: lowered {np.count_nonzero(d > 0.5)} px by more than 0.5 m; "
      f"mean {d[d > 0.5].mean():.1f} m, p95 {np.percentile(d[d > 0.5], 95):.1f} m, "
      f"max {d.max():.1f} m")

v = np.clip(np.round(ground * 10), 0, 65535).astype(np.int32)
res = np.zeros_like(rgb, dtype=np.uint8)
res[..., 0] = v >> 8
res[..., 1] = v & 0xFF
Image.fromarray(res, "RGB").save(out, optimize=True)
print(f"wrote {out}")
