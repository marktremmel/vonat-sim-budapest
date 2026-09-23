#!/usr/bin/env python3
"""Render the measured line into an HTML atlas: plan, journey strip, skylines."""
import json, math, sys, html
sys.path.insert(0, "tools")
from mapdata import rings

def frame(lat0):
    p = math.radians(lat0)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p))
MLAT, MLON = frame(47.67)

A = json.load(open("data/alignment.json", encoding="utf-8"))
S = json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
P = json.load(open("data/profile.json", encoding="utf-8"))
E = json.load(open("data/enclosure.json", encoding="utf-8"))
H = json.load(open("data/horizons.json", encoding="utf-8"))
PK = json.load(open("data/peaks.json", encoding="utf-8"))

STOPS = [s for s in S if s["name"] != "Nyugati pályaudvar"]
MAJOR = {"Budapest-Nyugati", "Rákospalota-Újpest", "Dunakeszi", "Vác",
         "Kismaros", "Nagymaros-Visegrád", "Zebegény", "Szob"}
TOTAL = A["tracks"][0]["length_m"] / 1000.0

def esc(s): return html.escape(str(s))

# ---------------------------------------------------------------- plan map
def plan_svg():
    pts = A["tracks"][0]["points"]
    lat0 = sum(p[0] for p in pts) / len(pts)
    lon0 = sum(p[1] for p in pts) / len(pts)
    def xy(la, lo):
        return ((lo - lon0) * MLON, -(la - lat0) * MLAT)
    xs, ys = zip(*(xy(p[0], p[1]) for p in pts))
    pad = 5200
    x0, x1 = min(xs) - pad, max(xs) + pad
    y0, y1 = min(ys) - pad, max(ys) + pad
    W, Hh = x1 - x0, y1 - y0
    sc = 640.0 / Hh
    def px(la, lo):
        x, y = xy(la, lo)
        return (x - x0) * sc, (y - y0) * sc

    water = []
    for r in rings():
        if len(r) < 90:
            continue
        d = "M" + " L".join(f"{px(a,b)[0]:.1f},{px(a,b)[1]:.1f}" for a, b in r[::3]) + " Z"
        water.append(f'<path d="{d}" class="water"/>')

    def track_path(t):
        p = t["points"]
        return "M" + " L".join(f"{px(a,b)[0]:.1f},{px(a,b)[1]:.1f}" for a, b, _ in p[::2])

    peak_dots = []
    for p in sorted(PK, key=lambda r: -r["ele"])[:9]:
        x, y = px(p["lat"], p["lon"])
        if not (0 < x < W * sc and 0 < y < 640):
            continue
        peak_dots.append(
            f'<g class="pk"><path d="M{x:.1f},{y-5:.1f} l4.6,7.5 h-9.2 Z"/>'
            f'<text x="{x+7:.1f}" y="{y+3:.1f}">{esc(p["name"])} {p["ele"]:.0f}</text></g>')

    st = []
    for s in STOPS:
        x, y = px(s["lat"], s["lon"])
        big = s["name"] in MAJOR
        st.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{3.4 if big else 2.1:.1f}" '
                  f'class="{"stn maj" if big else "stn"}"/>')
        if big:
            st.append(f'<text x="{x-7:.1f}" y="{y+3.4:.1f}" class="stl" '
                      f'text-anchor="end">{esc(s["name"])}</text>')

    return (W * sc, 640,
            f'''<svg viewBox="0 0 {W*sc:.0f} 640" class="plan" role="img"
     aria-label="Plan of MÁV line 70 from Budapest-Nyugati to Szob along the Danube">
  <g>{"".join(water)}</g>
  <path d="{track_path(A["tracks"][1])}" class="rail up"/>
  <path d="{track_path(A["tracks"][0])}" class="rail down"/>
  {"".join(peak_dots)}
  {"".join(st)}
  <g class="rose"><path d="M26,614 L26,584 M26,584 l-4.5,7 M26,584 l4.5,7"/>
    <text x="26" y="628" text-anchor="middle">N</text></g>
</svg>''')

# ------------------------------------------------------------ journey strip
def strip_svg():
    W, H_, L, R = 1180, 300, 46, 14
    inner = W - L - R
    def X(km): return L + km / TOTAL * inner
    mid = 132.0
    enc = E["enclosure"]
    amax = 40.0
    def Y_r(a): return mid - min(a, amax) / amax * 108
    def Y_l(a): return mid + min(a, amax) / amax * 108

    right = " ".join(f"{X(k):.1f},{Y_r(r):.1f}" for k, l, r in enc)
    left = " ".join(f"{X(k):.1f},{Y_l(l):.1f}" for k, l, r in enc)
    pr = f'<polygon class="encR" points="{X(0):.1f},{mid:.1f} {right} {X(TOTAL):.1f},{mid:.1f}"/>'
    pl = f'<polygon class="encL" points="{X(0):.1f},{mid:.1f} {left} {X(TOTAL):.1f},{mid:.1f}"/>'

    # speed bands
    speeds, chs = A["tracks"][0]["maxspeed"], [p[2] for p in A["tracks"][0]["points"]]
    runs, cur, start = [], speeds[0], 0.0
    for i, sp in enumerate(speeds):
        if sp != cur:
            runs.append((cur, start, chs[i])); cur, start = sp, chs[i]
    runs.append((cur, start, chs[-1]))
    bands = []
    for sp, a, b in runs:
        if b - a < 150:
            continue
        cls = {120: "s120", 100: "s100", 80: "s80", 60: "s60", 20: "s20"}.get(sp, "s20")
        bands.append(f'<rect x="{X(a/1000):.1f}" y="266" width="{X(b/1000)-X(a/1000):.1f}" '
                     f'height="15" class="{cls}"/>')
        if b - a > 3000:
            bands.append(f'<text x="{(X(a/1000)+X(b/1000))/2:.1f}" y="277" '
                         f'class="sv">{sp}</text>')

    # elevation, exaggerated
    prof = P["profile"]
    lo = min(p[1] for p in prof); hi = max(p[1] for p in prof)
    ep = " ".join(f"{X(p[0]/1000):.1f},{252 - (p[1]-lo)/(hi-lo)*34:.1f}"
                  for p in prof[::5])
    elev = f'<polyline class="elev" points="{ep}"/>'

    ticks, labs = [], []
    for s in STOPS:
        x = X(s["km"]); big = s["name"] in MAJOR
        ticks.append(f'<line x1="{x:.1f}" y1="{mid-2:.1f}" x2="{x:.1f}" '
                     f'y2="{mid+2:.1f}" class="{"tk maj" if big else "tk"}"/>')
        if big:
            labs.append(f'<g class="stripLab"><line x1="{x:.1f}" y1="{mid:.1f}" '
                        f'x2="{x:.1f}" y2="24" class="lead"/>'
                        f'<text x="{x:.1f}" y="18" text-anchor="middle">'
                        f'{esc(s["name"])}</text>'
                        f'<text x="{x:.1f}" y="{mid+15:.1f}" text-anchor="middle" '
                        f'class="kmv">{s["km"]:.1f}</text></g>')

    grid = "".join(f'<line x1="{X(k):.1f}" y1="30" x2="{X(k):.1f}" y2="{mid+96:.1f}" '
                   f'class="grid"/>' for k in range(0, int(TOTAL) + 1, 10))

    return f'''<svg viewBox="0 0 {W} {H_}" class="strip" role="img"
  aria-label="Terrain enclosure, line speed and elevation along the 63 km of line 70">
  {grid}
  {pr}{pl}
  <line x1="{L}" y1="{mid}" x2="{W-R}" y2="{mid}" class="axis"/>
  {"".join(ticks)}{"".join(labs)}
  <text x="{L}" y="{mid-112:.0f}" class="axl">hillside angle, right window · 40° full scale</text>
  <text x="{L}" y="{mid+62:.0f}" class="axl">hillside angle, left window · same scale</text>
  {elev}<text x="{L}" y="216" class="axl">elevation, ×{(34/(hi-lo))/(inner/(TOTAL*1000)):.0f} vertical</text>
  {"".join(bands)}
  <text x="{L-6}" y="277" class="axl" text-anchor="end">km/h</text>
</svg>'''

# ------------------------------------------------------------- skyline views
def sky_svg(v):
    W, H_ = 1180, 210
    az0, az1 = v["az0"], v["az1"]
    span = az1 - az0
    sky = v["skyline"]
    amin, amax = -1.5, max(11.0, max(s[1] for s in sky) + 2.2)
    def X(az): return (az - az0) / span * W
    def Y(a): return H_ - 34 - (a - amin) / (amax - amin) * (H_ - 62)
    pts = " ".join(f"{X(s[0]):.1f},{Y(s[1]):.1f}" for s in sky)
    fill = f'<polygon class="skyfill" points="{X(az0):.1f},{H_-34} {pts} {X(az1):.1f},{H_-34}"/>'
    line = f'<polyline class="skyline" points="{pts}"/>'

    labs, used = [], []
    for p in v["labels"][:9]:
        rel = (p["az"] - az0) % 360
        if rel > span:
            continue
        x = X(az0 + rel)
        y = Y(p["angle"])
        row = 0
        while any(abs(x - ux) < 92 and row == ur for ux, ur in used) and row < 3:
            row += 1
        used.append((x, row))
        ty = 16 + row * 15
        labs.append(
            f'<g class="pkl"><line x1="{x:.1f}" y1="{y:.1f}" x2="{x:.1f}" y2="{ty+4:.1f}"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.4"/>'
            f'<text x="{x:.1f}" y="{ty:.1f}" text-anchor="middle">{esc(p["name"])}'
            f'<tspan class="m"> {p["ele"]:.0f}</tspan></text></g>')

    axis = []
    a = math.ceil(az0 / 15) * 15
    while a <= az1:
        axis.append(f'<line x1="{X(a):.1f}" y1="{H_-34}" x2="{X(a):.1f}" y2="{H_-28}" class="tick"/>'
                    f'<text x="{X(a):.1f}" y="{H_-16}" text-anchor="middle" class="azl">'
                    f'{int(a)%360}°</text>')
        a += 15
    return f'''<svg viewBox="0 0 {W} {H_}" class="sky" role="img"
  aria-label="Computed skyline from km {v['km']} looking between {int(az0)%360} and {int(az1)%360} degrees">
  <line x1="0" y1="{Y(0):.1f}" x2="{W}" y2="{Y(0):.1f}" class="horiz"/>
  {fill}{line}{"".join(labs)}
  <line x1="0" y1="{H_-34}" x2="{W}" y2="{H_-34}" class="axis"/>{"".join(axis)}
</svg>'''

# ------------------------------------------------------------------- page
CSS = open("tools/atlas.css", encoding="utf-8").read()

def station_rows():
    out, prev = [], None
    for s in STOPS:
        gap = "" if prev is None else f"{s['km'] - prev:.3f}"
        prev = s["km"]
        i = min(int(s["km"] * 1000 / P["step_m"]), len(P["profile"]) - 1)
        h = P["profile"][i][1]
        enc = min(E["enclosure"], key=lambda r: abs(r[0] - s["km"]))
        cls = ' class="maj"' if s["name"] in MAJOR else ""
        out.append(
            f'<tr{cls}><td class="s">{esc(s["name"])}</td>'
            f'<td class="n">{s["km"]:.3f}</td><td class="n delta">{gap}</td>'
            f'<td class="n">{h:.0f}</td>'
            f'<td class="n">{enc[2]:.1f}°</td><td class="n">{enc[1]:.1f}°</td>'
            f'<td class="n delta">{s["offset_m"]:.1f}</td></tr>')
    return "".join(out)

def main():
    pw, ph, plan = plan_svg()
    views = "".join(
        f'''<div class="viewhead"><h3>{esc(v["title"])}</h3>
<span class="km">km {v["km"]:.2f} · eye {v["eye"]["h"]:.0f} m · looking {int(v["az0"])%360}°–{int(v["az1"])%360}°</span></div>
<div class="panel">{sky_svg(v)}</div>''' for v in H)

    body = f'''<title>Line 70 Survey</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>{CSS}</style>
<div class="board"><div class="board-inner">
<div class="chev"><span class="num">70</span> measured, not sketched</div>
<h1>Line 70 Survey</h1>
<p class="sub">Every number on this page came out of open data on this machine: the track
geometry from OpenStreetMap, the ground from SRTM-derived elevation tiles. Nothing here is
drawn by hand or estimated by eye. This is the foundation the simulator sits on.</p>
<div class="facts">
<div class="fact"><b>62.789</b><span>km, Nyugati–Szob</span></div>
<div class="fact"><b>63.536</b><span>km of down track</span></div>
<div class="fact"><b>22</b><span>stops on the route</span></div>
<div class="fact"><b>747</b><span>named summits over it</span></div>
<div class="fact"><b>104.8–130.1</b><span>metres above sea level</span></div>
<div class="fact"><b>38.4°</b><span>steepest hillside</span></div>
</div></div></div>

<div class="wrap">

<section>
<p class="eyebrow">The check that mattered</p>
<h2>62.789 against a published 62.9</h2>
<p class="lede">The alignment is OSM relation 11547066 — both running lines, 160 ways, chained
end to end and measured. Snapping the station nodes onto that chain puts Szob at
<strong>62.789 km</strong>. The published route length is 62.9 km. That is a tenth of a
percent, which means the geometry is real and every distance below can be trusted.</p>
<p>The sectional speeds OSM carries agree with the published table too, boundary for
boundary: 60 to Rákosrendező, 80 to Rákospalota-Újpest, 120 to Vác, 100 to Szob. Two
independent sources, same line. The two tracks differ by 118 m over the route, which is
just the down line taking the longer side of the curves.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">The journey, measured</p>
<h2>The line has a shape, and it is not the one on the map</h2>
<p class="lede">The band below is the angle of the highest ground in a forward fan from each
window — how enclosed the train feels. It is flat and open for thirty-two kilometres, and
then the Bend closes around you.</p>
<div class="panel"><p class="cap">Terrain enclosure · line speed · elevation, 0 to 63 km</p>
{strip_svg()}</div>
<p class="small">Enclosure sampled every 250 m over a 150° forward fan to each side, capped
for drawing at 40°. Elevation is vertically exaggerated — the whole line only spans 25 m of
height. Speed band from OSM <code>maxspeed</code>.</p>
<p>Out of Budapest the hills never exceed three degrees; you are crossing a plain. At
<strong>km 32</strong>, just short of Vác, the right-hand side starts to climb and never
comes back down: 5.7° at Sződ, 11.3° by Fenyveshegy, 16.4° at Nagymaros, and
<strong>38.4° at km 54</strong> — the ledge below the Szent Mihály-hegy where the hillside
came down on the track in 2020 and again in 2022. Then Szob, and it opens out again.</p>
<p>That curve is the emotional shape of the ride and nobody designed it. It should drive
everything: where the camera wants to point, where the music changes, which windows matter.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">The plan</p>
<h2>Both tracks, the river, and the summits that stand over them</h2>
<div class="planwrap">
<div class="panel">{plan}</div>
<div>
<p>Drawn from the chained geometry with no smoothing — the curves are the real curves, and
the Danube is the real riverbank polygon out of OSM. The line clings to the left bank from
Alsógöd all the way to the Ipoly.</p>
<h3>What the plan makes obvious</h3>
<p>Budapest to Vác is almost straight: 33 km with barely a curve worth the name, which is
why it carries 120 km/h. Everything interesting to drive is in the last thirty.</p>
<p>Lines 70 and 75 run side by side from Vác to just short of Verőce — which is why the
Kisvác and Fenyveshegy platforms snapped to within four metres of our alignment even though
no line 70 train has ever called at them. Two sources, one geographic fact.</p>
<dl class="spec">
<div><dt>Alignment</dt><dd><b>1687 vertices</b> across two tracks, mean spacing 37 m</dd></div>
<div><dt>Terrain</dt><dd><b>120 tiles</b>, 2560×3072 px, 25.7 m per pixel at the Bend</dd></div>
<div><dt>Profile</dt><dd><b>3177 samples</b> every 20 m, slope-limited to 10‰</dd></div>
<div><dt>Water</dt><dd><b>107 rings</b> stitched from OSM multipolygons</dd></div>
</dl>
</div></div>
</section>

<hr class="track">

<section>
<p class="eyebrow">The skyline</p>
<h2>What you actually see out of the window</h2>
<p class="lede">These are not illustrations. Each one is a ray march outward from a real point
on the track — the driver's eye 3.1 m above rail — taking the highest elevation angle at every
quarter degree out to thirty kilometres, with earth curvature and atmospheric refraction folded
in. The line is the ridge. A summit only gets a label if it genuinely breaks that ridge.</p>
{views}
<h3>The occlusion test earns its keep</h3>
<p>From <strong>Kismaros</strong> the routine returns nothing at all, and that is the correct
answer: the valley side 800 m away subtends 7.3°, and Csóványos — 938 m, but fourteen
kilometres behind it — manages 3.3°. You cannot see the Börzsöny from Kismaros. It is hidden
by its own foothills.</p>
<p>But from <strong>Vác-Alsóváros</strong>, out on the open plain at km 31.7, the whole range
is there at once: Csóványos at 24.7 km, Magos-fa, Varsa-tető, Hangyás-bérc, all of them
standing up over the flat. So the mountains announce themselves twenty minutes before you
reach them, and then vanish exactly as you enter them. That is a gift. The game should know
about it.</p>
<p>At <strong>Vác</strong> the ray march found a 648 m summit 5.8 km away on bearing 13.8°,
working only from elevation pixels. The Naszály is 652 m. It found the mountain by itself.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">The stops</p>
<h2>Real km posts</h2>
<div class="scroll"><table>
<thead><tr><th>Station</th><th>km</th><th>Δ km</th><th>m ASL</th>
<th>Right</th><th>Left</th><th>Snap</th></tr></thead>
<tbody>{station_rows()}</tbody></table></div>
<p class="small">Chainage measured along the down track from the Budapest-Nyugati buffer
stops. Right and Left are the terrain enclosure angles from each window at that point. Snap
is how far the OSM station node sat from our centreline — zero for every stop on line 70,
and about 4 m for Kisvác and Fenyveshegy, which sit on the line 75 tracks alongside.
<strong>Dömösi átkelés is missing</strong>: the halt is suspended and no longer carries a
stop node, so it needs placing by hand at roughly km 54.3.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Next</p>
<h2>What this unlocks</h2>
<p>The geometry, the ground, the speeds and the skylines are now data files rather than
intentions. Slice 1 — Vác to Szob in the cab — can be built directly on them: the track is a
spline with real curvature, the terrain is a heightmap, the hills already know their names and
which window they appear in.</p>
<p>Still to gather: signal and block-section positions, the level crossings, the industrial
sidings at Vác and Szob, station track layouts, and the Királyréti narrow gauge. All of it is
in OSM or derivable, and the tooling to pull it now exists.</p>
</section>

<footer>
<p><b>Sources.</b> Track geometry, stations, summits and water from OpenStreetMap contributors,
ODbL. Elevation from AWS terrarium tiles (SRTM-derived), public domain. Published route length,
sectional speeds and timetable from Hungarian Wikipedia, CC BY-SA 4.0. Peak names cross-checked
against the Börzsöny relief map in the project folder.</p>
<p><b>Honest limits.</b> The elevation raster is a surface model at 26 m per pixel: it reads
tree canopy and cutting tops, not rail head. The track profile is therefore graded rather than
surveyed — median filtered, slope limited to 10‰, then smoothed. It is good enough to drive and
not good enough to build from. Skylines inherit the same resolution: ridge shapes are true,
individual crags are not.</p>
<p>Generated {len(P["profile"])} profile samples, {len(E["enclosure"])} enclosure samples and
{sum(len(v["skyline"]) for v in H)} skyline rays on this machine. August 2026.</p>
</footer>
</div>'''
    open("atlas.html", "w", encoding="utf-8").write(body)
    print(f"wrote atlas.html ({len(body)/1024:.0f} KB)")

main()
