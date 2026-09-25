#!/usr/bin/env python3
"""The façade atlas: panel-block façades cut from third-party texture packs,
made lighter and cleaner, as tiles the building shader repeats along a wall.

    python3 tools/bake_facades.py         # -> web/data/facades.webp

The packs are NOT in the repository (their licences allow use in a game but
not redistribution of the original files). Put them in ~/Downloads as
downloaded to rebake:
  * "Eastern European Urban Decay - Building Pack Vol. 1" by cortino
    (https://cortino.itch.io/psx-slav-panel-building): Panelak 1/texture.png
  * "WEIRD HOUSE PACK" by utilizator2011 (https://utilizator2011.itch.io/free-weire):
    texture/1h.png, 2h.png, 6h.png

Each tile is a whole number of storeys high and of window bays wide, cut by
hand from the photo (the boxes below), so it repeats without a jump. The
shader (shaders.js FACADE_GLSL, kind 3) needs each tile's bays and storeys:
FAC_TILES below, mirrored there.

"Lighter": the owner wants the grey Eastern-European look brightened, so the
grime is flattened (a blur of the low frequencies divided out), the whole
lifted, and the colour mostly taken out: the shader paints each building its
own pastel over it.
"""
import os
from PIL import Image, ImageFilter, ImageOps, ImageEnhance
import numpy as np

HOME = os.path.expanduser("~/Downloads")
FAC_TILES = [  # (file, crop box, bays, storeys)
    ("asset pack slav1/Panelak 1/texture.png", (0, 442, 336, 691), 4, 3),   # ochre upper floors
    ("asset pack slav1/Panelak 1/texture.png", (0, 691, 336, 940), 4, 3),   # green lower floors
    ("abanodehousepack/texture/1h.png", (0, 0, 512, 508), 5, 4),            # glazed balconies
    ("abanodehousepack/texture/2h.png", (0, 0, 512, 504), 6, 6),            # loggias
    ("abanodehousepack/texture/6h.png", (0, 150, 512, 507), 8, 7),          # blue and white
]
T = 256
atlas = Image.new("RGB", (T * len(FAC_TILES), T))
for i, (f, box, bays, storeys) in enumerate(FAC_TILES):
    im = Image.open(os.path.join(HOME, f)).convert("RGB").crop(box).resize((T, T), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    # flatten the stains: divide by a heavy blur of the luminance, keep the detail
    lum = a.mean(axis=2, keepdims=True)
    low = np.asarray(Image.fromarray((lum[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))).astype(np.float32)[..., None] / 255
    a = a / np.maximum(low, 0.05) * 0.62
    # lift and half-desaturate
    g = a.mean(axis=2, keepdims=True)
    a = g + (a - g) * 0.45
    a = np.clip(a * 1.15 + 0.06, 0, 1) ** 0.85
    atlas.paste(Image.fromarray((a * 255).astype(np.uint8)), (i * T, 0))
os.makedirs("web/data", exist_ok=True)
atlas.save("web/data/facades.webp", "WEBP", quality=86)
print("web/data/facades.webp", atlas.size, os.path.getsize("web/data/facades.webp") // 1024, "KB")
print("FAC_TILES", [(b, s) for _, _, b, s in FAC_TILES])
