#!/usr/bin/env python3
"""Station announcements, spoken once by a local Hungarian voice and kept as
small AAC files, so every browser plays the same announcement (a browser's
own speech synthesis has no Hungarian voice on most systems).

    python3 tools/make_announcements.py          # macOS: needs `say` and `afconvert`

For every stop on every baked line (web/data/route*.json):
    web/data/audio/ann/<slug>.m4a        "Következő állomás: Vác."
and for the ends of the lines, also
    web/data/audio/ann/<slug>_veg.m4a    "... a vonat végállomása. Kérjük, minden utasunk szálljon ki."

The slug is the name folded to ASCII, lower case, spaces and hyphens to
underscores; web/src/main.js annSlug() does the same. The voice is Tünde
(Premium) if installed, else Tünde.
"""
import glob, json, os, subprocess, sys, tempfile, unicodedata

def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return "".join(ch if ch.isalnum() else "_" for ch in s).strip("_")

voices = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
VOICE = "Tünde (Premium)" if "Tünde (Premium)" in voices else "Tünde"
if "Tünde" not in voices:
    sys.exit("no Hungarian voice (Tünde) installed: System Settings → Accessibility → Spoken Content")

stops, ends = set(), set()
for f in glob.glob("web/data/route*.json"):
    if "line71" in f:
        continue
    r = json.load(open(f, encoding="utf-8"))
    names = [s["name"] for s in sorted(r["stops"], key=lambda s: s["km"])]
    stops.update(names)
    if names:
        ends.update([names[0], names[-1]])

out = "web/data/audio/ann"
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp()
jobs = [(n, False) for n in sorted(stops)] + [(n, True) for n in sorted(ends)]
for name, end in jobs:
    spoken = name.replace("-", " ")
    text = (f"Következő állomás: {spoken}, a vonat végállomása. Kérjük, minden utasunk szálljon ki."
            if end else f"Következő állomás: {spoken}.")
    dst = os.path.join(out, slug(name) + ("_veg" if end else "") + ".m4a")
    if os.path.exists(dst):
        continue
    aiff = os.path.join(tmp, "a.aiff")
    subprocess.run(["say", "-v", VOICE, "-r", "165", "-o", aiff, text], check=True)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "32000", "-c", "1", aiff, dst], check=True)
    print(dst)
total = sum(os.path.getsize(p) for p in glob.glob(out + "/*.m4a"))
print(f"{len(glob.glob(out + '/*.m4a'))} files, {total / 1e6:.2f} MB, voice {VOICE}")
