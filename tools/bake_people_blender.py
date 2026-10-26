"""Run by Blender (tools/bake_people.py starts it): imports each rigged FBX,
poses a walk cycle and a standing pose on its Mixamo skeleton, and writes the
deformed vertices of every frame to a JSON file.

    Blender -b -P tools/bake_people_blender.py -- out.json a.fbx b.fbx ...

The pack's characters come in a T-pose with no animation. The walk here is
made by turning bones about the armature's own axes (measured: X across with
the character's left at +X, Y up, Z forward): thighs and upper arms swing,
knees and elbows bend. FRAMES walk frames, then one standing frame.
"""
import bpy, sys, json, math
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
OUT, FILES = args[0], args[1:]
FRAMES = 8
B = "mixamorig:"

def turn(arm, name, axis, deg):
    """Turn a pose bone about an armature-space axis through its head."""
    pb = arm.pose.bones.get(B + name)
    if not pb or abs(deg) < 1e-6: return
    bpy.context.view_layer.update()
    h = pb.matrix.to_translation()
    R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-h)
    pb.matrix = R @ pb.matrix
    bpy.context.view_layer.update()

BASE = {}
def pose(arm, ph):
    """ph in [0, 1) is the walk phase; None is standing."""
    for pb in arm.pose.bones: pb.matrix_basis = BASE[pb.name].copy()
    bpy.context.view_layer.update()
    walk = ph is not None
    s = math.sin(ph * 2 * math.pi) if walk else 0.0
    c = math.cos(ph * 2 * math.pi) if walk else 0.0
    # arms down from the T-pose, a little away from the body
    turn(arm, "LeftArm", "Z", -76); turn(arm, "RightArm", "Z", 76)
    if walk:
        turn(arm, "LeftArm", "X", 24 * s);  turn(arm, "RightArm", "X", -24 * s)
        turn(arm, "LeftForeArm", "X", -(14 + 10 * max(0, -s)));  turn(arm, "RightForeArm", "X", -(14 + 10 * max(0, s)))
        # the left leg leads when the left arm trails
        turn(arm, "LeftUpLeg", "X", -26 * s);  turn(arm, "RightUpLeg", "X", 26 * s)
        turn(arm, "LeftLeg", "X", 30 * max(0, -c) + 6);  turn(arm, "RightLeg", "X", 30 * max(0, c) + 6)
        turn(arm, "Spine", "Y", 4 * s)
    else:
        turn(arm, "LeftForeArm", "X", -8); turn(arm, "RightForeArm", "X", -8)
    bpy.context.view_layer.update()

out = []
for f in FILES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=f)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    mesh = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    if not arm or not mesh: print("SKIP", f); continue
    bpy.context.view_layer.objects.active = arm
    # The T-pose is a one-frame Mixamo action on a different rest pose: keep
    # it as the starting pose and drop the action, or it overrides every turn.
    bpy.context.view_layer.update()
    BASE.clear(); BASE.update({pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones})
    arm.animation_data_clear()
    tex = ""
    for im in bpy.data.images:
        if im.filepath: tex = im.filepath.replace("\\", "/").split("/")[-1]
    frames, idx, uvs, key = [], [], [], {}
    for k in list(range(FRAMES)) + [None]:
        pose(arm, None if k is None else k / FRAMES)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = mesh.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        W = ev.matrix_world
        if not idx:
            uvl = me.uv_layers.active.data
            for t in me.loop_triangles:
                for li in t.loops:
                    vi = me.loops[li].vertex_index
                    uv = uvl[li].uv
                    kk = (vi, round(uv.x, 4), round(uv.y, 4))
                    if kk not in key:
                        key[kk] = len(key); uvs.append([round(uv.x, 4), round(1 - uv.y, 4)])
                    idx.append(key[kk])
            order = [kk[0] for kk in sorted(key, key=key.get)]
        co = [W @ me.vertices[vi].co for vi in order]
        frames.append(co)
        ev.to_mesh_clear()
    # model space: x left, y up, z forward (the character faces -Y in Blender),
    # feet on y = 0, in units of the standing height
    st = frames[-1]
    z0 = min(p.z for p in st); H = max(p.z for p in st) - z0
    cx = sum(p.x for p in st) / len(st); cy = sum(p.y for p in st) / len(st)
    fr = []
    for co in frames:
        zf = min(p.z for p in co)          # keep the lower foot on the ground
        fr.append([[round((p.x - cx) / H, 4), round((p.z - zf) / H, 4), round(-(p.y - cy) / H, 4)] for p in co])
    out.append({"file": f, "tex": tex, "idx": idx, "uv": uvs, "frames": fr})
    print("BAKED", f.split("/")[-1], len(order), "verts", len(idx) // 3, "tris", tex)
json.dump({"frames": FRAMES, "people": out}, open(OUT, "w"))
