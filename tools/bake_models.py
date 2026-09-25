#!/usr/bin/env python3
"""Textured models for the road traffic: the GGBot "PSX Style Cars" pack
(bought by the owner; the originals stay in ~/Downloads and are not in the
repository), baked to one small JSON and one texture atlas.

    python3 tools/bake_models.py      # -> web/data/models/cars.json, cars.webp

Each model is normalised: centred, standing on y = 0, facing +z, and scaled
to a length of 1 — the game scales it to the vehicle it stands for (a small
car 3.3 m, a van 5.4 m). Every colour of a car, and its snowed-on version
where the pack has one, is a cell of the atlas; the model's UVs point into
its first cell and the shader offsets them to the chosen skin.

The bodies already carry their wheels (low-poly), so there is nothing to
spin: a car is one mesh.
"""
import base64, glob, json, math, os, struct
from PIL import Image

SRC = os.path.expanduser("~/Downloads/Textures and PSX models/PSX_Style_Cars_by_GGBot_(August2023)")
# (folder, obj, kinds it may stand for, skins in the order they are packed)
CARS = [
    ("Car 01", "Car.obj", ["car"], ["car", "car_blue", "car_gray", "car_red"]),
    ("Car 02", "Car2.obj", ["car", "suv"], ["car2", "car2_black", "car2_red"]),
    ("Car 03", "Car3.obj", ["hatchback", "small"], ["car3", "car3_red", "car3_yellow"]),
    ("Car 04", "Car4.obj", ["suv"], ["car4", "car4_grey", "car4_lightgrey", "car4_lightorange"]),
    ("Car 05", "Car5.obj", ["car"], ["car5", "car5_green", "car5_grey", "car5_taxi"]),
    ("Car 06", "Car6.obj", ["sports"], ["car6"]),
    ("Car 07", "Car7.obj", ["van", "small"], ["car7", "car7_black", "car7_brown", "car7_green", "car7_grey", "car7_red"]),
    ("Car 08", "Car8.obj", ["van"], ["Car8", "Car8_grey", "Car8_mail", "Car8_purple"]),
]
CELL, COLS = 128, 8

def load_obj(path):
    V, T, F = [], [], []
    for line in open(path, encoding="utf-8", errors="ignore"):
        p = line.split()
        if not p: continue
        if p[0] == "v": V.append(tuple(map(float, p[1:4])))
        elif p[0] == "vt": T.append(tuple(map(float, p[1:3])))
        elif p[0] == "f":
            idx = [(int(a.split("/")[0]) - 1, int(a.split("/")[1]) - 1 if len(a.split("/")) > 1 and a.split("/")[1] else 0) for a in p[1:]]
            for k in range(1, len(idx) - 1):
                F.append((idx[0], idx[k], idx[k + 1]))
    return V, T, F

cells, models = [], []
for folder, obj, kinds, skins in CARS:
    V, T, F = load_obj(os.path.join(SRC, folder, obj))
    xs = [v[0] for v in V]; ys = [v[1] for v in V]; zs = [v[2] for v in V]
    cx, cz, y0 = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2, min(ys)
    L = max(zs) - min(zs)
    pos, uv, nrm = [], [], []
    for a, b, c in F:
        P = [((V[i][0] - cx) / L, (V[i][1] - y0) / L, (V[i][2] - cz) / L) for i, _ in (a, b, c)]
        ux, uy, uz = (P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2])
        vx, vy, vz = (P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2])
        n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        ln = math.sqrt(sum(q * q for q in n)) or 1
        for k, (vi, ti) in enumerate((a, b, c)):
            pos += P[k]
            u, v = T[ti] if ti < len(T) else (0.5, 0.5)
            uv += [min(max(u, 0.0), 1.0), 1 - min(max(v, 0.0), 1.0)]
            nrm += [q / ln for q in n]
    first = len(cells)
    snow = []
    for s in skins:
        cells.append(os.path.join(SRC, folder, s + ".png"))
    # the snowed-on skins where the pack has them (Car 01)
    for s in skins:
        sp = os.path.join(SRC, folder, s.replace("car", "car_snow", 1) + ".png")
        if s.startswith("car") and "_snow" not in s and os.path.exists(sp) and folder == "Car 01":
            snow.append(len(cells)); cells.append(sp)
    models.append({"name": folder, "kinds": kinds, "w": round((max(xs) - min(xs)) / L, 3),
                   "h": round((max(ys) - y0) / L, 3), "skins": list(range(first, first + len(skins))),
                   "snow": snow, "count": len(pos) // 3,
                   "pos": base64.b64encode(struct.pack(f"<{len(pos)}f", *pos)).decode(),
                   "uv": base64.b64encode(struct.pack(f"<{len(uv)}f", *uv)).decode(),
                   "nrm": base64.b64encode(struct.pack(f"<{len(nrm)}f", *nrm)).decode()})
rows = math.ceil(len(cells) / COLS)
atlas = Image.new("RGB", (COLS * CELL, rows * CELL))
for i, f in enumerate(cells):
    im = Image.open(f).convert("RGB").resize((CELL, CELL), Image.NEAREST)
    atlas.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
os.makedirs("web/data/models", exist_ok=True)
atlas.save("web/data/models/cars.webp", "WEBP", quality=90)
json.dump({"atlas": "cars.webp", "cell": CELL, "cols": COLS, "rows": rows, "models": models},
          open("web/data/models/cars.json", "w"), separators=(",", ":"))
print(len(models), "cars,", len(cells), "skins,", sum(m["count"] for m in models) // 3, "triangles,",
      os.path.getsize("web/data/models/cars.json") // 1024, "KB json,", os.path.getsize("web/data/models/cars.webp") // 1024, "KB atlas")
