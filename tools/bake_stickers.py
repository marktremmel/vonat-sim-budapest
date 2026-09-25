#!/usr/bin/env python3
"""Photo-mode stickers: the Designsoup "Urban Grunge" decal pack (bought by
the owner; licence: use in projects, no redistribution as a standalone pack),
cut to their outlines and packed into two sprite sheets for the game.

    python3 tools/bake_stickers.py     # -> web/data/stickers_*.webp + stickers.json

The pack itself stays in ~/Downloads/Textures and PSX models/.
"""
import glob, json, math, os
from PIL import Image

SRC = os.path.expanduser("~/Downloads/Textures and PSX models/Designsoup's Urban Grunge decal pack V1.1/Individuals")
CELL = 200
groups = {"a": ["Stickers", "Signs", "Torn Paper "], "b": ["Grafitti"]}
meta = {"cell": CELL, "sheets": {}, "items": []}
for sheet, dirs in groups.items():
    files = sorted(f for d in dirs for f in glob.glob(os.path.join(SRC, d, "*.png")))
    cols = 12
    rows = math.ceil(len(files) / cols)
    atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        bb = im.getbbox()
        if bb: im = im.crop(bb)
        k = (CELL - 4) / max(im.width, im.height)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        x, y = (i % cols) * CELL, (i // cols) * CELL
        atlas.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        meta["items"].append({"s": sheet, "x": x, "y": y, "w": im.width, "h": im.height,
                              "kind": os.path.basename(os.path.dirname(f)).strip()})
    out = f"web/data/stickers_{sheet}.webp"
    atlas.save(out, "WEBP", quality=82, method=6)
    meta["sheets"][sheet] = {"file": os.path.basename(out), "w": atlas.width, "h": atlas.height}
    print(out, atlas.size, os.path.getsize(out) // 1024, "KB", len(files), "stickers")
json.dump(meta, open("web/data/stickers.json", "w"), separators=(",", ":"))
