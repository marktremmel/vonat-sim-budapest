#!/usr/bin/env python3
"""Street furniture models into web/data/models/props.json and props.webp,
from GLB files in the owner's asset library (the originals stay in
~/Downloads/Game Assets and are not in the repository).

    python3 tools/bake_props.py

Reads GLB directly (no Blender): one mesh per file, positions in metres,
glTF axes (x left, y up, z front), which is the game's model space. Each
model's own texels are cut out of its kit's atlas (everything else blacked
out) and stacked on one sheet at their own resolution; the UVs address the
whole sheet. Same file layout as the cars
(tools/bake_models.py), so the game draws both with MODEL_VS/FS; positions
stay in metres (instance scale 1).

Sources and licences:
- PSX Soviet Block Kit Free by heyheythere, CC BY 4.0
  (https://heyheythere.itch.io/psx-soviet-block-kit-free)
- PSX School Kit by heyheythere (bought by the owner: free to use in games,
  no redistribution of the raw assets)
"""
import base64, json, math, os, struct
from PIL import Image, ImageDraw, ImageFilter

LIB = os.path.expanduser("~/Downloads/Game Assets/07_3D_Retro_PSX_N64/heyheythere_Modular_Kits")
# (glb_path, atlas_path, name, kind, scale)
PROPS = [
    (f"{LIB}/psx-soviet-block-kit-free/glb/bench_entrance.glb", f"{LIB}/psx-soviet-block-kit-free/textures/atlas.png", "bench_entrance", "bench", 1.0),
    (f"{LIB}/psx-school-kit/glb/bench.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "bench", "bench", 1.0),
    (f"{LIB}/psx-school-kit/glb/waiting_chairs.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "waiting_chairs", "bench", 1.0),
    (f"{LIB}/psx-school-kit/glb/waste_bin.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "waste_bin", "bin", 1.0),
    (f"{LIB}/psx-school-kit/glb/trash_can.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "trash_can", "bin", 1.0),
    ("data/raw/models_cache/budapest_bin/budapest_bin.glb", "data/raw/models_cache/budapest_bin/atlas.png", "budapest_bin", "bin", 0.00055),
    (f"{LIB}/psx-soviet-block-kit-free/glb/bin_container.glb", f"{LIB}/psx-soviet-block-kit-free/textures/atlas.png", "bin_container", "container", 1.0),
    (f"{LIB}/psx-school-kit/glb/vending_machine.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "vending_machine", "vending", 1.0),
    (f"{LIB}/psx-school-kit/glb/wall_clock.glb", f"{LIB}/psx-school-kit/textures/atlas.png", "wall_clock", "clock", 1.0),
    (f"{LIB}/psx-soviet-block-kit-free/glb/fence_low.glb", f"{LIB}/psx-soviet-block-kit-free/textures/atlas.png", "fence_low", "fence", 1.0),
    ("data/raw/models_cache/chars/person_a.glb", "data/raw/models_cache/chars/texture_a.png", "person_a", "person", 1.0),
    ("data/raw/models_cache/chars/person_b.glb", "data/raw/models_cache/chars/texture_b.png", "person_b", "person", 1.0),
]
COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

def read_glb(path):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    binary = b[20 + n + 8:]
    def acc(i):
        a = j["accessors"][i]; v = j["bufferViews"][a["bufferView"]]
        k = NUM[a["type"]]; fmt = COMP[a["componentType"]]; size = struct.calcsize(fmt) * k
        stride = v.get("byteStride") or size
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        out = [struct.unpack_from("<" + fmt * k, binary, off + i2 * stride) for i2 in range(a["count"])]
        if a.get("normalized") and fmt in "BH":
            m = 255.0 if fmt == "B" else 65535.0
            out = [tuple(c / m for c in t) for t in out]
        return out
    P, N, U = [], [], []
    for node in j["nodes"]:
        if "mesh" not in node: continue
        tr = node.get("translation", [0, 0, 0]); sc = node.get("scale", [1, 1, 1])
        if node.get("rotation") and any(abs(q) > 1e-6 for q in node["rotation"][:3]): raise SystemExit(f"{path}: a rotated node; not handled")
        for prim in j["meshes"][node["mesh"]]["primitives"]:
            at = prim["attributes"]
            pos = acc(at["POSITION"]); nrm = acc(at["NORMAL"]); uv = acc(at["TEXCOORD_0"])
            idx = [i[0] for i in acc(prim["indices"])] if "indices" in prim else list(range(len(pos)))
            for i in idx:
                P.append(tuple(pos[i][k] * sc[k] + tr[k] for k in range(3))); N.append(nrm[i]); U.append(uv[i])
    return P, N, U

models, crops = [], []
for glb_path, atlas_path, name, kind, scale in PROPS:
    P, N, U = read_glb(glb_path)
    if scale != 1.0:
        P = [tuple(c * scale for c in pt) for pt in P]
    atlas = Image.open(atlas_path).convert("RGB")
    AW, AH = atlas.size
    u0, u1 = min(u for u, v in U), max(u for u, v in U); v0, v1 = min(v for u, v in U), max(v for u, v in U)
    # the texels the model uses, a pixel wider all round
    box = (max(0, math.floor(u0 * AW) - 1), max(0, math.floor(v0 * AH) - 1), min(AW, math.ceil(u1 * AW) + 1), min(AH, math.ceil(v1 * AH) + 1))
    crop = atlas.crop(box)
    # ...and only those: a model's triangles can lie far apart on the kit's
    # atlas, with other pieces' textures between them. Everything its own
    # triangles do not cover is blacked out.
    mask = Image.new("L", crop.size, 0); dr = ImageDraw.Draw(mask)
    for t in range(0, len(U), 3):
        tri = [(U[i][0] * AW - box[0], U[i][1] * AH - box[1]) for i in (t, t + 1, t + 2)]
        dr.polygon(tri, fill=255, outline=255)
    mask = mask.filter(ImageFilter.MaxFilter(5))
    crop = Image.composite(crop, Image.new("RGB", crop.size), mask)
    xs = [p[0] for p in P]; ys = [p[1] for p in P]; zs = [p[2] for p in P]
    y0 = min(ys)
    models.append({"name": name, "kind": kind, "cell": 0, "count": len(P),
                   "size": [round(max(xs) - min(xs), 2), round(max(ys) - y0, 2), round(max(zs) - min(zs), 2)],
                   "pos": [c for p in P for c in (p[0], p[1] - y0, p[2])], "nrm": [c for n in N for c in n]})
    crops.append((crop, box, U, AW, AH))
    print(f"{name}: {len(P) // 3} triangles, {models[-1]['size']} m, texels {crop.size}")
# one sheet, the crops at their own resolution one under another; the UVs
# address the whole sheet (so the game uses a 1 x 1 grid for it)
SW = 1
while SW < max(c[0].size[0] for c in crops): SW *= 2
SH = 1
while SH < sum(c[0].size[1] + 2 for c in crops): SH *= 2
sheet = Image.new("RGB", (SW, SH)); y = 0
for m, (crop, box, U, AW, AH) in zip(models, crops):
    sheet.paste(crop, (0, y))
    uv = []
    for u, v in U: uv += [(u * AW - box[0]) / SW, (y + v * AH - box[1]) / SH]
    y += crop.size[1] + 2
    for k, arr in (("pos", m["pos"]), ("uv", uv), ("nrm", m["nrm"])):
        m[k] = base64.b64encode(struct.pack(f"<{len(arr)}f", *arr)).decode()
sheet.save("web/data/models/props.webp", "WEBP", lossless=True)
json.dump({"atlas": "props.webp", "cols": 1, "rows": 1, "models": models},
          open("web/data/models/props.json", "w"), separators=(",", ":"))
print(len(models), "props,", os.path.getsize("web/data/models/props.json") // 1024, "KB,", os.path.getsize("web/data/models/props.webp") // 1024, "KB sheet", sheet.size)
