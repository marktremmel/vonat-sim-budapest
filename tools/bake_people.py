#!/usr/bin/env python3
"""Walking people from the owner's PSX Characters pack (the originals stay in
~/Downloads/Game Assets and are not in the repository): web/data/models/
people.json, people.bin and people.webp.

    python3 tools/bake_people.py

Blender (tools/bake_people_blender.py) gives each character an 8-frame walk
and a standing pose. Here the frames are packed as int16 (x, y, z, 0) per
vertex per frame, in units of the character's height / 16000, and the 512 px
textures go into one atlas at CELL px.

people.json: {"frames": 8, "cell", "cols", "rows", "people": [{"name",
"fem", "nv", "ni", "vo" (offset of the frames in the bin, in int16s), "io"
(offset of the uint16 indices, in bytes), "uo" (offset of the float32 uvs,
in bytes)}]}. Frame f of a person is nv*4 int16s at vo + f*nv*4; frame 8 is
the standing pose. tools/tag_people.py then adds the forearm tags and "rig".
"""
import json, os, struct, subprocess, sys, math
from PIL import Image

SRC = os.path.expanduser("~/Downloads/Game Assets/07_3D_Retro_PSX_N64/PSX_Characters/Characters_psx_01")
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
MALE = ["Character_02", "Character_03", "Character_04", "Character_06", "Character_07", "Character_08", "Character_10",
        "Character_12", "Character_14", "Character_29", "Character_31", "Character_Male_34", "Character_Male_37",
        "Character_Male_40", "Character_Male_43"]
FEMALE = ["Character_Female_01", "Character_Female_03", "Character_Female_05", "Character_Female_07", "Character_Female_09",
          "Character_Female_12", "Character_Female_15", "Character_30_Female", "Character_33_Female", "Character_36_Female"]
if len(sys.argv) > 1:      # a hand-picked list: M:name or F:name
    MALE = [a[2:] for a in sys.argv[1:] if a.startswith("M:")]; FEMALE = [a[2:] for a in sys.argv[1:] if a.startswith("F:")]
CELL, COLS = 256, 5

files = [f"{SRC}/Models/Rig/Male/{n}.fbx" for n in MALE] + [f"{SRC}/Models/Rig/Female/{n}.fbx" for n in FEMALE]
files = [f for f in files if os.path.exists(f)]
RAW = "data/raw/people_raw.json"
subprocess.run([BLENDER, "-b", "-P", "tools/bake_people_blender.py", "--", RAW] + files, check=True, stdout=subprocess.DEVNULL)
raw = json.load(open(RAW))

blob, people, cells = bytearray(), [], []
for p in raw["people"]:
    name = os.path.basename(p["file"])[:-4]
    tex = os.path.join(SRC, "Textures", p["tex"] or name + ".png")
    if not os.path.exists(tex): tex = os.path.join(SRC, "Textures", name + ".png")
    if not os.path.exists(tex): print("no texture for", name); continue
    nv = len(p["uv"])
    while len(blob) % 4: blob.append(0)
    vo = len(blob) // 2
    for fr in p["frames"]:
        for x, y, z in fr:
            blob += struct.pack("<4h", *(max(-32767, min(32767, round(v * 16000))) for v in (x, y, z)), 0)
    io = len(blob); blob += struct.pack(f"<{len(p['idx'])}H", *p["idx"])
    while len(blob) % 4: blob.append(0)
    uo = len(blob); blob += struct.pack(f"<{nv * 2}f", *(c for uv in p["uv"] for c in uv))
    people.append({"name": name, "fem": int("Female" in name), "nv": nv, "ni": len(p["idx"]), "vo": vo, "io": io, "uo": uo})
    cells.append(tex)
rows = math.ceil(len(cells) / COLS)
atlas = Image.new("RGB", (COLS * CELL, rows * CELL))
for i, f in enumerate(cells):
    atlas.paste(Image.open(f).convert("RGB").resize((CELL, CELL), Image.LANCZOS), ((i % COLS) * CELL, (i // COLS) * CELL))
os.makedirs("web/data/models", exist_ok=True)
atlas.save("web/data/models/people.webp", "WEBP", quality=88)
open("web/data/models/people.bin", "wb").write(blob)
json.dump({"atlas": "people.webp", "bin": "people.bin", "frames": raw["frames"], "cell": CELL, "cols": COLS, "rows": rows,
           "people": people}, open("web/data/models/people.json", "w"), separators=(",", ":"))
print(len(people), "people,", len(blob) // 1024, "KB of frames,", os.path.getsize("web/data/models/people.webp") // 1024, "KB atlas;",
      "verts", min(p["nv"] for p in people), "to", max(p["nv"] for p in people))
# the forearm tags and each person's elbow and neck, for the idle poses
subprocess.run([sys.executable, "tools/tag_people.py"], check=True, stdout=subprocess.DEVNULL)
