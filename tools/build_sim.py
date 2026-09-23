#!/usr/bin/env python3
"""Bundle the simulator into one self-contained HTML with assets inlined."""
import base64, io, json, os, re

SRC = "web/src"
# Concatenated in this order into one flat scope, so a name must be declared
# before anything reads it at load time. Functions are hoisted; top-level
# `const` is not.
ORDER = ["shaders.js", "engine.js", "env.js", "route.js", "geom.js", "trains.js",
         "traffic.js", "car.js", "aircraft.js", "catenary.js", "structures.js", "audio.js", "clouds.js", "weather.js", "landmarks.js", "parts.js", "city.js", "tour.js",
         "panel.js", "cab.js", "hud.js", "input.js", "settings.js", "main.js"]

def strip_modules(text):
    text = re.sub(r'^\s*import[^;]*;\s*$', '', text, flags=re.M)
    text = re.sub(r'^export\s+(const|let|var|function|class|async)', r'\1', text, flags=re.M)
    text = re.sub(r'^export\s*\{[^}]*\};?\s*$', '', text, flags=re.M)
    return text

def datauri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()

def main():
    html = io.open("web/index.html", encoding="utf-8").read()
    js = "\n".join(f"// ===== {n} =====\n{strip_modules(io.open(f'{SRC}/{n}', encoding='utf-8').read())}"
                   for n in ORDER)
    # shaders.js uses `S.NAME`; with everything flattened the names are bare
    js = re.sub(r'\bS\.([A-Z][A-Z0-9_]*)\b', r'\1', js)

    # Every module lands in ONE scope, so two files may not declare the same
    # top-level name — and the failure is a blank screen with a SyntaxError in
    # the console, which looks like a broken feature rather than a clash.
    # `structures.js` and `catenary.js` both wanted STEEL. Refuse to build.
    seen, clash = {}, []
    for name in ORDER:
        body = strip_modules(io.open(f"{SRC}/{name}", encoding="utf-8").read())
        for m in re.finditer(r'^(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)',
                             body, re.M):
            who = m.group(1)
            if who in seen and seen[who] != name:
                clash.append(f"{who}: {seen[who]} and {name}")
            seen[who] = name
    if clash:
        raise SystemExit("duplicate top-level names in one scope:\n  " + "\n  ".join(clash))

    # The game now uses dynamic fetching via index.html instead of baked ASSETS
    script = (
        "<script>\n"
        + js +
        "</script>\n"
    )
    out = html.replace("</div>\n", "</div>\n" + script, 1) if "</div>\n" in html else html + script
    # put the script at the very end instead, after the markup
    out = html.rstrip() + "\n" + script
    
    # Strip any ES module imports from the HTML since they are bundled globally
    out = re.sub(r"^\s*import\s+.*?;\s*$", "", out, flags=re.M)
    out = out.replace('<script type="module">', '<script>')
    os.makedirs("dist", exist_ok=True)
    io.open("dist/szob-fele.html", "w", encoding="utf-8").write(out)
    # the artifact host supplies its own doctype, head and body
    art = re.sub(r'^<!doctype html>\s*|^<meta charset="utf-8">\s*', '', out,
                 flags=re.M | re.I)
    io.open("dist/artifact.html", "w", encoding="utf-8").write(art)
    import shutil
    shutil.copytree("web/data", "dist/data", dirs_exist_ok=True)
    io.open("dist/index.html", "w", encoding="utf-8").write(out)   # for the dev server
    mb = os.path.getsize("dist/szob-fele.html") / 1e6
    print(f"wrote dist/szob-fele.html and dist/artifact.html  {mb:.2f} MB")
    print(f"  js {len(js)/1024:.0f} KB, assets dynamic fetch")
    if mb > 15.5:
        print("  WARNING: over the 16 MB artifact limit")

main()
