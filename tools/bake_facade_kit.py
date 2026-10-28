#!/usr/bin/env python3
"""The façade kit: generated façade sheets cut into an atlas the building
shader assembles walls from (docs/FACADE_KIT.md).

    python3 tools/bake_facade_kit.py
      -> web/data/facade_kit.webp       colour
         web/data/facade_kit_mask.png   R glass, G paint, B relief
         web/data/facade_kit.json       {"sheets": n, "families": {name: [first, n]}, ...}

Input: every .png/.jpg/.webp in art/facade_kit/<family>/ (not *_mask.png),
for the families in FAMILIES, in that order (the shader knows them by
position). How a family's sheet is laid out:

- "stack" (tenement, interwar, civic, szocreal): a straight-on elevation of three storeys,
  four window bays wide: the top floor with the cornice at the top, a
  typical floor in the middle, the ground floor at the bottom.
- "two" (cube, villa, oldtown, garden): two storeys, the upper floor under the eaves and the raised
  ground floor. The upper floor is used as the typical row too.
- "strips" (village, mav): three different one-storey house fronts stacked, each
  a third of the image, plinth to eaves, four bays wide.

The rows and bays of "stack" and "two" are found from the windows
(find_boxes); "strips" are cut at the strongest horizontal line near each
third. Where that fails it falls back to three equal rows. Where a sheet
needs it, art/facade_kit/<family>/kit.json says where the rows are, in the
sheet's pixels:

    {"t01.png": {"top": [x0, y0, x1, y1], "typical": [...], "ground": [...],
                 "bays": 4}}

"bays" is how many bays the boxes span (default 4); with more, the first
four are used, with fewer, they repeat.

Masks: glass is what is much darker than the wall; paint is what is near the
wall's colour (the median of the typical floor). A brick row gets no paint.
A <sheet>_mask.png of the same size as the sheet (red glass, green paint)
replaces the guess. The blue channel is a guessed relief (relief()): 0.5 is
the wall, the glass and doors lower (set back), mouldings higher. Identical
files are used once.

Atlas layout, mirrored in shaders.js FACADE_GLSL (kitAt): a sheet is a block
of 4 bays x 3 rows, each cell 64 x 80 px (256 x 240); blocks are laid eight
to an atlas row, rows top / typical / ground from the top of the block. The
atlas is 2048 px wide and as tall as the rows used.
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

# the same names as tools/facade_zones.py FAMILIES (the shader's order); the
# atlas itself can hold them in any order, facade_kit.json says where
FAMILIES = (("tenement", "stack"), ("interwar", "stack"), ("cube", "two"), ("village", "strips"),
            ("villa", "two"), ("mav", "strips"), ("oldtown", "two"), ("garden", "two"),
            ("civic", "stack"), ("szocreal", "stack"))
ART = os.path.join("art", "facade_kit")
CW, CH, BAYS = 64, 80, 4          # cell size and bays per block
BW, BH = CW * BAYS, CH * 3        # block size
PER_ROW, MAX = 8, 24              # MAX sheets per family; the whole atlas must stay within MAX_H
MAX_H = 4096                      # WebGL's guaranteed texture size on phones
ATLAS_W = BW * PER_ROW
WALL_LUM = 0.78                   # the wall's brightness after levelling
ROWS = ("top", "typical", "ground")


def runs(on, minlen, gap):
    """[start, end) runs of True, joining gaps shorter than gap and dropping
    runs shorter than minlen."""
    out, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            if out and i - out[-1][1] < gap: out[-1][1] = j
            else: out.append([i, j])
            i = j
        else: i += 1
    return [r for r in out if r[1] - r[0] >= minlen]


def find_boxes(im, storeys=3):
    """Find the rows and bays from the windows: the glass (dark, not brown)
    forms three bands of rows, top floor, typical floor, ground floor. The
    typical row is cut exactly one storey tall (window to window) at a
    string course, so it repeats upwards without a seam; the bays are cut
    pier-middle to pier-middle over four window centres. None if the sheet
    does not show that layout."""
    a = np.asarray(im).astype(np.float32) / 255
    h, w, _ = a.shape
    lum = a.mean(axis=2)
    # panes are a cool grey-blue; the shading in the stucco is warm
    glass = (lum < 0.42) & (a[..., 2] >= a[..., 0])
    bands = runs(glass.mean(axis=1) > 0.12, h * 0.04, h * 0.03)
    # full-width horizontal lines: the string courses
    edge = np.abs(np.diff(lum, axis=0)).mean(axis=1)
    if storeys == 2:
        # two storeys: cut at the strongest line between them; the cellar
        # windows in the plinth are a thin band of their own, part of the
        # ground row
        if len(bands) >= 3 and bands[-1][1] - bands[-1][0] < 0.6 * (bands[-2][1] - bands[-2][0]):
            bands = bands[:-1]
        if len(bands) < 2 or bands[-1][1] < h * 0.6: return None
        (t1, s1), (g0, _) = bands[-2], bands[-1]
        b = s1 + int(np.argmax(edge[s1:max(s1 + 2, g0)]))
        cols = runs(glass[t1:s1].mean(axis=0) > 0.3, w * 0.03, w * 0.02)
        x0, x1 = bay_cut(cols, w)
        return {"top": [x0, 0, x1, b], "typical": [x0, 0, x1, b], "ground": [x0, b, x1, h]}
    if len(bands) < 3 or bands[-1][1] < h * 0.75: return None
    (t1, s1), (t2, s2), (g0, _) = bands[-3], bands[-2], bands[-1]
    p = t2 - t1     # window top to window top (balconies hang below the sills)
    lo, hi = s1, max(s1 + 2, (s1 + t2) // 2)
    b1 = lo + int(np.argmax(edge[lo:hi]))
    d = max(2, int(p * 0.04))
    c = int(b1 + p)
    b2 = c - d + int(np.argmax(edge[c - d:c + d])) if c + d < g0 else min(c, g0)
    cols = runs(glass[t2:s2].mean(axis=0) > 0.3, w * 0.03, w * 0.02)
    x0, x1 = bay_cut(cols, w)
    return {"top": [x0, 0, x1, b1], "typical": [x0, b1, x1, b2],
            "ground": [x0, b2, x1, h]}


def bay_cut(cols, w):
    """Four bays pier-middle to pier-middle over four window columns; the
    whole width when there are not four."""
    if len(cols) != 4: return 0, w
    mids = [(x0 + x1) / 2 for x0, x1 in cols]
    q = (mids[3] - mids[0]) / 3
    x0 = min(max(mids[0] - q / 2, 0), w - 4 * q)
    return round(x0), round(x0 + 4 * q)


def find_strips(im):
    """Three house fronts stacked: cut at the strongest horizontal line
    within 8% of each third, the whole width."""
    a = np.asarray(im).astype(np.float32) / 255
    h, w, _ = a.shape
    edge = np.abs(np.diff(a.mean(axis=2), axis=0)).mean(axis=1)
    cut = []
    for k in (1, 2):
        lo, hi = int(h * (k / 3 - 0.08)), int(h * (k / 3 + 0.08))
        cut.append(lo + int(np.argmax(edge[lo:hi])))
    return {"top": [0, 0, w, cut[0]], "typical": [0, cut[0], w, cut[1]], "ground": [0, cut[1], w, h]}


def boxes(im, spec, layout):
    """The three row boxes of a sheet, cut to four bays: from kit.json, else
    found, else equal thirds."""
    w, h = im.size
    found = {}
    if not all(r in spec for r in ROWS):
        found = (find_strips(im) if layout == "strips" else
                 find_boxes(im, 2 if layout == "two" else 3)) or {}
    out = {}
    for i, r in enumerate(ROWS):
        out[r] = spec.get(r, found.get(r, [0, round(h * i / 3), w, round(h * (i + 1) / 3)]))
    return out, spec.get("bays", 4), bool(found)


def cut(im, box, bays, size, resample):
    """One row: the box resized to four bays (cropped or repeated)."""
    x0, y0, x1, y1 = box
    bw = (x1 - x0) / bays
    if bays >= BAYS:
        row = im.crop((x0, y0, round(x0 + bw * BAYS), y1))
    else:
        one = im.crop((x0, y0, x1, y1))
        row = Image.new(im.mode, (one.width * -(-BAYS // bays), one.height))
        for k in range(-(-BAYS // bays)):
            row.paste(one, (k * one.width, 0))
        row = row.crop((0, 0, round(bw * BAYS), one.height))
    return row.resize(size, resample)


def blur(x, r):
    img = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255


def level(a, mid):
    """Even out the light: divide by a heavy blur of the WALL's brightness
    (windows left out of the blur, or they leave a bright halo round every
    window), per row, since the ground floor is meant to be darker."""
    lum = a.mean(axis=2)
    out = a.copy()
    for i in range(3):
        rows = slice(i * CH, (i + 1) * CH)
        l = lum[rows]
        w = (np.abs(l - np.median(l)) < 0.08).astype(np.float32)
        ref = np.median(l[w > 0]) if w.any() else np.median(l)
        # where there is little wall to go by (a shopfront), lean on ref
        low = (blur(l * w, 24) + ref * 0.15) / (blur(w, 24) + 0.15)
        out[rows] = a[rows] / np.maximum(low, 0.08)[..., None] * ref
    return out


def masks(a, mid, own_rows=False):
    """Guess glass and paint from the colour. mid: the typical-floor rows.
    own_rows: each row is a different house, with its own wall colour."""
    wall = np.median(a[mid].reshape(-1, 3), axis=0)
    wl = wall.mean()
    # each row against its own wall colour: a rusticated ground floor is
    # darker than the floors above but painted the same
    paint = np.zeros(a.shape[:2], np.float32)
    keep = []
    for i in range(3):
        rows = slice(i * CH, (i + 1) * CH)
        rw = wall if i == 1 else np.median(a[rows].reshape(-1, 3), axis=0)
        if np.abs(rw - wall).max() > 0.25 and not own_rows: rw = wall    # a row that is mostly glass
        # a brick wall keeps its own colour (and the stone round it)
        if rw[0] - rw[2] > 0.2: keep.append(i); continue
        d = np.sqrt(((a[rows] - rw) ** 2).sum(axis=2))
        paint[rows] = np.clip((0.16 - d) / 0.08, 0, 1)
    # brick (a brick wall, or brick showing through worn plaster) stays brick
    paint *= np.clip((0.24 - (a[..., 0] - a[..., 2])) / 0.06, 0, 1)
    paint = blur(paint, 1.2)
    lum = a.mean(axis=2)
    # glass is a cool grey-blue darker than the wall; a dark brown or red is
    # a wooden door, a frame or a shutter, and the shading in the stucco is
    # warm too: none of those light up at night
    warm = a[..., 0] - a[..., 2]
    glass = np.clip((wl * 0.72 - lum) / (wl * 0.15), 0, 1) * np.clip((0.02 - warm) / 0.04, 0, 1)
    # pale glass (a light grey-blue pane, net curtains) is no darker than the
    # wall but clearly bluer than it
    glass = np.maximum(glass, np.clip((-warm - 0.01) / 0.04, 0, 1) * np.clip((wl * 0.97 - lum) / (wl * 0.12), 0, 1))
    # drop specks: a 3 px opening of the glass
    g = Image.fromarray((glass * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    glass = np.asarray(g).astype(np.float32) / 255
    paint *= 1 - glass
    # the brightness the sheet is scaled by comes from a plaster row
    plaster = [i for i in range(3) if i not in keep]
    if 1 in keep:
        wl = np.median(a[plaster[0] * CH:(plaster[0] + 1) * CH].mean(axis=2)) if plaster else WALL_LUM
    return glass, paint, wl


RELIEF_M = 0.4                    # the blue channel's range: 0 is 0.4 m back, 1 is 0.4 m out


def relief(a, glass, paint):
    """A guessed relief from what the masks know, for the shader's parallax
    and shading: the glass sits 28 cm back and the reveal round it 20 cm (old
    walls are thick); large dark wooden areas (gates, doors) 40 cm back;
    carved or bright parts that are not plain wall (cornices, window crowns,
    stucco) 6 cm out.
    0.5 is the wall's plane. a is levelled to WALL_LUM."""
    lum = a.mean(axis=2)
    warm = a[..., 0] - a[..., 2]
    def grow(x, r):
        g = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(r))
        return np.asarray(g).astype(np.float32) / 255
    def shrink(x, r):
        g = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(r))
        return np.asarray(g).astype(np.float32) / 255
    reveal = np.clip(grow(glass, 5) - glass, 0, 1)
    # a door or gate: dark, warm, not glass, and big (survives a 7 px opening)
    door = np.clip((WALL_LUM * 0.62 - lum) / (WALL_LUM * 0.12), 0, 1) * np.clip((warm - 0.03) / 0.05, 0, 1) * (1 - glass)
    door = grow(shrink(door, 7), 7)
    # mouldings: fine carved detail (light and shade changing within a few
    # pixels), or brighter than the wall and not plain paint
    carve = blur(np.abs(lum - blur(lum, 1.5)), 2.0)
    orn = np.maximum(np.clip((carve - 0.11) / 0.05, 0, 1),
                     np.clip((lum - WALL_LUM * 1.02) / (WALL_LUM * 0.12), 0, 1) * (1 - paint))
    orn *= (1 - grow(glass, 7)) * (1 - door)
    depth = np.maximum(np.maximum(glass * 0.28, reveal * 0.20), door * 0.40) - orn * 0.06
    # blurred as the 0..1 code (blur() clips, and the mouldings are negative depth)
    return blur(np.clip(0.5 - depth / (2 * RELIEF_M), 0, 1), 0.8)


def sheets(family):
    """The family's sheet files, identical files once, at most MAX."""
    src = os.path.join(ART, family)
    if not os.path.isdir(src): return src, []
    files = sorted(f for f in os.listdir(src)
                   if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and not f.endswith("_mask.png"))
    seen, uniq = set(), []
    for f in files:
        k = hashlib.md5(open(os.path.join(src, f), "rb").read()).hexdigest()
        if k in seen: print(f"  {family}/{f}: the same image as an earlier one, skipped")
        else: seen.add(k); uniq.append(f)
    if len(uniq) > MAX: print(f"  {family}: {len(uniq)} sheets, using the first {MAX}")
    return src, uniq[:MAX]


def cut_sheet(src, f, spec, layout):
    """One sheet -> (colour block, glass, paint) at BW x BH."""
    im = Image.open(os.path.join(src, f)).convert("RGB")
    bx, bays, auto = boxes(im, spec, layout)
    block = Image.new("RGB", (BW, BH))
    for i, r in enumerate(ROWS):
        block.paste(cut(im, bx[r], bays, (BW, CH), Image.LANCZOS), (0, i * CH))
    mid = (slice(CH, 2 * CH), slice(None))
    a = level(np.asarray(block).astype(np.float32) / 255, mid)
    glass, paint, wl = masks(a, mid, own_rows=layout == "strips")
    own = os.path.join(src, os.path.splitext(f)[0] + "_mask.png")
    if os.path.exists(own):
        om = Image.open(own).convert("RGB")
        mb = Image.new("RGB", (BW, BH))
        for i, r in enumerate(ROWS):
            mb.paste(cut(om, bx[r], bays, (BW, CH), Image.NEAREST), (0, i * CH))
        m = np.asarray(mb).astype(np.float32) / 255
        glass, paint = m[..., 0], m[..., 1]
    a = np.clip(a * (WALL_LUM / max(wl, 0.05)), 0, 1)
    rel = relief(a, glass, paint)
    how = "kit.json" if spec else "found" if auto else "THIRDS (not found)"
    print(f"  {f}: rows {how} {[bx[r][1] for r in ROWS]}+{bx['ground'][3]}, x {bx['top'][0]}-{bx['top'][2]}; "
          f"glass {glass.mean() * 100:.0f}%, paint {paint.mean() * 100:.0f}%")
    return a, glass, paint, rel


def main():
    work, fams = [], {}
    for family, layout in FAMILIES:
        src, files = sheets(family)
        specs = {}
        if os.path.exists(os.path.join(src, "kit.json")):
            specs = json.load(open(os.path.join(src, "kit.json")))
        if files: print(f"{family} ({layout}): {len(files)} sheets")
        fams[family] = [len(work), len(files)]
        work += [(src, f, specs.get(f, {}), layout) for f in files]
    if not work:
        sys.exit(f"no sheets in {ART}/<family>/ (docs/FACADE_KIT.md)")
    rows = -(-len(work) // PER_ROW)
    size = (ATLAS_W, rows * BH)
    if size[1] > MAX_H:
        sys.exit(f"{len(work)} sheets make the atlas {size[1]} px tall, over {MAX_H}: "
                 f"at most {MAX_H // BH * PER_ROW} sheets fit; drop some (docs/FACADE_KIT.md)")
    col = Image.new("RGB", size, (200, 196, 188))
    msk = Image.new("RGB", size, (0, 0, 0))
    for n, (src, f, spec, layout) in enumerate(work):
        a, glass, paint, rel = cut_sheet(src, f, spec, layout)
        ox, oy = (n % PER_ROW) * BW, (n // PER_ROW) * BH
        col.paste(Image.fromarray((a * 255).astype(np.uint8)), (ox, oy))
        mm = np.stack([glass, paint, rel], axis=2)
        msk.paste(Image.fromarray((mm * 255).astype(np.uint8)), (ox, oy))
    os.makedirs("web/data", exist_ok=True)
    col.save("web/data/facade_kit.webp", "WEBP", quality=88)
    msk.save("web/data/facade_kit_mask.png", optimize=True)
    json.dump({"sheets": len(work), "families": fams, "cell": [CW, CH], "bays": BAYS,
               "perRow": PER_ROW, "atlas": list(size), "wallLum": WALL_LUM},
              open("web/data/facade_kit.json", "w"))
    kb = lambda p: os.path.getsize(p) // 1024
    print(f"web/data/facade_kit.webp {size[0]}x{size[1]} {kb('web/data/facade_kit.webp')} KB, "
          f"_mask.png {kb('web/data/facade_kit_mask.png')} KB, {len(work)} sheets")


if __name__ == "__main__":
    main()
