#!/usr/bin/env python3
"""Marks the forearms in web/data/models/people.bin and writes each person's
elbow and neck into people.json, for the idle poses in PEOPLE_VS (a phone
held up, the head turned or bowed). bake_people.py runs it last; it can also
be run on its own, since it needs only the baked files (the pack does not
have to be there).

    python3 tools/tag_people.py

There is no skeleton at runtime, so the arm is found from the walk the bake
already made: between walk frames 2 and 6 the upper arms swing 24° each way
about the shoulder, so an arm vertex moves forward by about its drop below
the shoulder, and against the leg on the same side. The
forearm is the arm below the elbow, and the elbow is the widest empty band
in the arm's heights between 0.45 and 0.70 of the standing height (the
models are low-poly: the joint is a ring with nothing between it and the
next one).

The tag goes into the fourth int16 of every frame (it was 0): 1 the
forearm on the character's left (+x), 2 the right. people.json gains
"rig": [elbow y, elbow z, elbow |x|, neck z], in units of the height.
"""
import json
import numpy as np

M = "web/data/models/people.json"
B = "web/data/models/people.bin"
meta = json.load(open(M))
blob = bytearray(open(B, "rb").read())
F = meta["frames"] + 1
for q in meta["people"]:
    nv = q["nv"]
    a = np.frombuffer(bytes(blob[q["vo"] * 2: q["vo"] * 2 + nv * 4 * F * 2]), dtype="<i2").reshape(F, nv, 4).astype(np.float64) / 16000
    st = a[F - 1]
    x, y, z = st[:, 0], st[:, 1], st[:, 2]
    d = a[2, :, 2] - a[6, :, 2]
    s = np.sign(d) * np.sign(x)
    big = np.abs(d) > 0.4 * np.clip(0.8 - y, 0.02, None)
    # the arms swing against the legs: whichever sign the high movers have
    sa = np.sign(np.median(s[big & (y > 0.6) & (y < 0.8)]))
    arm = big & (s == sa) & (y > 0.3) & (y < 0.8)
    ys = np.sort(np.unique(np.round(y[arm], 4)))
    ys = ys[(ys > 0.45) & (ys < 0.70)]
    gi = int(np.argmax(np.diff(ys))) if len(ys) > 1 else 0
    ey = float((ys[gi] + ys[gi + 1]) / 2) if len(ys) > 1 else 0.58
    near = arm & (np.abs(y - ey) < 0.05)
    ez = float(np.mean(z[near])) if near.any() else 0.0
    ex = float(np.mean(np.abs(x[near]))) if near.any() else 0.17
    head = y > 0.88
    nz = float(np.mean(z[head]))
    tag = np.where(arm & (y < ey), np.where(x > 0, 1, 2), 0).astype("<i2")
    for f in range(F):
        o = q["vo"] * 2 + f * nv * 8
        fr = np.frombuffer(bytes(blob[o: o + nv * 8]), dtype="<i2").reshape(nv, 4).copy()
        fr[:, 3] = tag
        blob[o: o + nv * 8] = fr.tobytes()
    q["rig"] = [round(ey, 4), round(ez, 4), round(ex, 4), round(nz, 4)]
    print(f"{q['name']:24s} forearm verts {int((tag > 0).sum()):4d}  elbow y {ey:.3f} z {ez:+.3f} |x| {ex:.3f}  neck z {nz:+.3f}")
open(B, "wb").write(blob)
json.dump(meta, open(M, "w"), separators=(",", ":"))
