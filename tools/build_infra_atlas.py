#!/usr/bin/env python3
"""Render the infrastructure pass: calibration, signals, formation, stations."""
import json, math, html
from collections import Counter, defaultdict

def esc(s): return html.escape(str(s))

INF = json.load(open("data/infra.json", encoding="utf-8"))
BLK = json.load(open("data/blocks.json", encoding="utf-8"))
STR = json.load(open("data/structures.json", encoding="utf-8"))
STOPS = [s for s in json.load(open("data/stations.json", encoding="utf-8"))["on_line_70"]
         if s["name"] != "Nyugati pályaudvar"]
TC = {round(r[0], 1): r for r in INF["track_count"]}
TOTAL = 63.536
MAJOR = {"Budapest-Nyugati", "Rákospalota-Újpest", "Dunakeszi", "Vác",
         "Kismaros", "Nagymaros-Visegrád", "Zebegény", "Szob"}

# ------------------------------------------------------ km post calibration
def calib_svg():
    ms = INF["milestones"]
    W, H, L, R, T, B = 1180, 250, 58, 16, 24, 44
    xs = [m["official_km"] for m in ms]
    ds = [m["delta_m"] for m in ms]
    x0, x1 = 0, TOTAL
    d0, d1 = min(ds + [0]) - 6, max(ds + [0]) + 6
    def X(k): return L + (k - x0) / (x1 - x0) * (W - L - R)
    def Y(d): return T + (d1 - d) / (d1 - d0) * (H - T - B)
    grid = "".join(f'<line x1="{X(k):.1f}" y1="{T}" x2="{X(k):.1f}" y2="{H-B}" class="grid"/>'
                   f'<text x="{X(k):.1f}" y="{H-B+15}" class="azl" text-anchor="middle">{k}</text>'
                   for k in range(0, int(TOTAL) + 1, 10))
    ticks = ""
    for d in range(int(d0 // 20) * 20, int(d1) + 20, 20):
        if d0 <= d <= d1:
            ticks += (f'<line x1="{L}" y1="{Y(d):.1f}" x2="{W-R}" y2="{Y(d):.1f}" class="grid"/>'
                      f'<text x="{L-7}" y="{Y(d)+3.4:.1f}" class="azl" text-anchor="end">{d:+d}</text>')
    zero = f'<line x1="{L}" y1="{Y(0):.1f}" x2="{W-R}" y2="{Y(0):.1f}" class="axis"/>'
    # least-squares drift line
    n = len(xs); sx = sum(xs); sy = sum(ds)
    sxx = sum(x*x for x in xs); sxy = sum(x*y for x, y in zip(xs, ds))
    b = (n*sxy - sx*sy) / (n*sxx - sx*sx); a = (sy - b*sx) / n
    fit = (f'<line x1="{X(0):.1f}" y1="{Y(a):.1f}" x2="{X(TOTAL):.1f}" '
           f'y2="{Y(a + b*TOTAL):.1f}" class="fit"/>')
    dots = "".join(f'<circle cx="{X(m["official_km"]):.1f}" cy="{Y(m["delta_m"]):.1f}" '
                   f'r="3" class="dot"/>' for m in ms)
    stl = "".join(f'<line x1="{X(s["km"]):.1f}" y1="{T}" x2="{X(s["km"]):.1f}" y2="{T+7}" '
                  f'class="tk maj"/>' for s in STOPS if s["name"] in MAJOR)
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Difference between measured chainage and official kilometre posts">
{grid}{ticks}{zero}{fit}{dots}{stl}
<text x="{L}" y="16" class="axl">measured minus official, metres</text>
<text x="{W-R}" y="{H-6}" class="axl" text-anchor="end">official km post</text>
<text x="{X(TOTAL)-6:.1f}" y="{Y(a + b*TOTAL)-8:.1f}" class="axl" text-anchor="end">
drift {b:+.2f} m per km</text></svg>'''

# ------------------------------------------------------------ formation width
def formation_svg():
    W, H, L, R = 1180, 230, 46, 14
    inner = W - L - R
    mid = 118.0
    def X(km): return L + km / TOTAL * inner
    span = 62.0                      # metres of offset shown either side
    def Y(off): return mid - off / span * 86

    dots = []
    for km, n, offs in INF["track_count"]:
        for o in offs:
            if abs(o) <= span:
                dots.append(f'{X(km):.1f},{Y(o):.1f}')
    pts = "".join(f'<circle cx="{p.split(",")[0]}" cy="{p.split(",")[1]}" r="0.9" '
                  f'class="tdot"/>' for p in dots)
    axis = f'<line x1="{L}" y1="{mid:.1f}" x2="{W-R}" y2="{mid:.1f}" class="axis"/>'
    scale = "".join(
        f'<line x1="{L}" y1="{Y(o):.1f}" x2="{W-R}" y2="{Y(o):.1f}" class="grid"/>'
        f'<text x="{L-7}" y="{Y(o)+3.2:.1f}" class="azl" text-anchor="end">{o:+d}</text>'
        for o in (-40, -20, 20, 40))
    labs = []
    for s in STOPS:
        x = X(s["km"]); big = s["name"] in MAJOR
        labs.append(f'<line x1="{x:.1f}" y1="{mid-3:.1f}" x2="{x:.1f}" y2="{mid+3:.1f}" '
                    f'class="{"tk maj" if big else "tk"}"/>')
        if big:
            labs.append(f'<line x1="{x:.1f}" y1="{mid:.1f}" x2="{x:.1f}" y2="22" class="lead"/>'
                        f'<text x="{x:.1f}" y="16" text-anchor="middle" class="stn2">'
                        f'{esc(s["name"])}</text>')
    # signal ticks
    sig = "".join(f'<line x1="{X(s["line_km"]):.1f}" y1="{H-40}" x2="{X(s["line_km"]):.1f}" '
                  f'y2="{H-28}" class="sig{"B" if s["function"]=="block" else ""}"/>'
                  for s in BLK["signals"])
    xc = "".join(f'<line x1="{X(c["km"]):.1f}" y1="{H-22}" x2="{X(c["km"]):.1f}" '
                 f'y2="{H-12}" class="xing"/>' for c in INF["crossings"])
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Track formation width, signals and level crossings along line 70">
{scale}{pts}{axis}{"".join(labs)}
<text x="{L}" y="{H-44}" class="axl">metres across the formation</text>
{sig}<text x="{W-R}" y="{H-31}" class="axl" text-anchor="end">signals · block in accent</text>
{xc}<text x="{W-R}" y="{H-13}" class="axl" text-anchor="end">level crossings</text>
</svg>'''

# --------------------------------------------------------- station diagrams
def station_svg(name, km, half=0.75):
    W, H, L, R = 1180, 150, 40, 14
    inner = W - L - R
    def X(k): return L + (k - (km - half)) / (2 * half) * inner
    span = 34.0
    mid = 74.0
    def Y(o): return mid - o / span * 52

    cols = []
    k = round(km - half, 1)
    while k <= km + half:
        r = TC.get(round(k, 1))
        if r:
            cols.append((r[0], r[2]))
        k = round(k + 0.1, 1)

    # link cluster centres between adjacent columns into continuous roads
    segs = []
    for (k1, o1), (k2, o2) in zip(cols, cols[1:]):
        for a in o1:
            near = [b for b in o2 if abs(b - a) < 4.5]
            for b in near:
                if abs(a) <= span and abs(b) <= span:
                    segs.append(f'<line x1="{X(k1):.1f}" y1="{Y(a):.1f}" '
                                f'x2="{X(k2):.1f}" y2="{Y(b):.1f}" class="road"/>')
    sw = "".join(f'<circle cx="{X(s["km"]):.1f}" cy="{mid:.1f}" r="2.6" class="sw"/>'
                 for s in INF["switches"]
                 if km - half <= s["km"] <= km + half and s.get("on_route"))
    sg = []
    for s in BLK["signals"]:
        if not (km - half <= s["line_km"] <= km + half):
            continue
        y = Y(6.5 if s["line"] == "down" else -6.5)
        cls = "sgD" if s["function"] in ("entry", "exit", "block") else "sgU"
        sg.append(f'<g class="{cls}"><line x1="{X(s["line_km"]):.1f}" y1="{y:.1f}" '
                  f'x2="{X(s["line_km"]):.1f}" y2="{y-11:.1f}"/>'
                  f'<circle cx="{X(s["line_km"]):.1f}" cy="{y-13:.1f}" r="2.6"/></g>')
    xc = "".join(f'<line x1="{X(c["km"]):.1f}" y1="{Y(span)-4:.1f}" '
                 f'x2="{X(c["km"]):.1f}" y2="{Y(-span)+4:.1f}" class="xing2"/>'
                 for c in INF["crossings"] if km - half <= c["km"] <= km + half)
    ctr = (f'<line x1="{X(km):.1f}" y1="8" x2="{X(km):.1f}" y2="{H-26}" class="ctr"/>'
           f'<text x="{X(km)+6:.1f}" y="16" class="stn2">{esc(name)}</text>')
    ax = "".join(f'<text x="{X(km+d):.1f}" y="{H-8}" class="azl" text-anchor="middle">'
                 f'{km+d:.2f}</text>' for d in (-half, -half/2, 0, half/2, half))
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Track diagram of {esc(name)} derived from OpenStreetMap geometry">
{xc}{"".join(segs)}{sw}{"".join(sg)}{ctr}{ax}
<text x="{L}" y="{H-8}" class="azl">km</text></svg>'''

# ------------------------------------------------------------------- tables
def crossing_rows():
    r = []
    for c in INF["crossings"]:
        b = c["barrier"] or "—"
        cls = {"full": "r", "double_half": "y", "half": "y", "no": "g"}.get(b, "n")
        prot = []
        if c["light"] == "yes": prot.append("lights")
        if c["bell"] == "yes": prot.append("bell")
        if c["saltire"] == "yes": prot.append("saltire")
        r.append(f'<tr><td class="n">{c["km"]:.3f}</td>'
                 f'<td><span class="pill {cls}">{esc(b)}</span></td>'
                 f'<td>{esc(", ".join(prot) or "—")}</td>'
                 f'<td>{esc(c["name"] or c["ref"] or "")}</td></tr>')
    return "".join(r)

def structure_rows():
    r = []
    seen = set()
    for s in STR:
        key = (round(s["km"], 1), s["kind"], s["length_m"] // 10)
        if key in seen:
            continue
        seen.add(key)
        r.append(f'<tr><td class="n">{s["km"]:.3f}</td><td>{esc(s["kind"])}</td>'
                 f'<td class="n">{s["length_m"]}</td>'
                 f'<td>{esc(s["name"] or "")}</td></tr>')
    return "".join(r)

def signal_rows():
    r = []
    for s in BLK["signals"]:
        if not s["function"]:
            continue
        hu = {"block": "térközjelző", "entry": "bejárati jelző",
              "exit": "kijárati jelző", "protection": "fedezőjelző"}.get(s["function"], "")
        r.append(f'<tr><td class="n">{s["line_km"]:.3f}</td>'
                 f'<td>{esc(s["line"])}</td>'
                 f'<td>{esc(s["function"])}<span class="hu2"> {esc(hu)}</span></td>'
                 f'<td>{esc(s["form"] or "—")}</td>'
                 f'<td>{esc(s["near"])}</td></tr>')
    return "".join(r)

CSS = open("tools/atlas.css", encoding="utf-8").read()

def main():
    stations = [("Rákospalota-Újpest", 7.824), ("Dunakeszi", 14.757),
                ("Vác", 33.309), ("Verőce", 42.981),
                ("Nagymaros", 51.704), ("Szob", 62.789)]
    diagrams = "".join(
        f'<div class="viewhead"><h3>{esc(n)}</h3>'
        f'<span class="km">km {k:.3f} · {TC.get(round(k,1),[0,0,[]])[1]} tracks at the centre</span></div>'
        f'<div class="panel">{station_svg(n, k)}</div>' for n, k in stations)

    ms = INF["milestones"]
    d = [m["delta_m"] for m in ms]
    nsig = len(BLK["signals"])
    nmain = sum(1 for s in BLK["signals"] if "main" in s["kinds"])
    blocks = BLK["blocks"]["down"]
    import statistics as st
    med = st.median([b["length_m"] for b in blocks])
    xings = Counter(c["barrier"] or "untagged" for c in INF["crossings"])
    sw_on = sum(1 for s in INF["switches"] if s.get("on_route"))

    body = f'''<title>Line 70 Infrastructure</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>{CSS}</style>
<div class="board"><div class="board-inner">
<div class="chev"><span class="num">70</span> signals · blocks · formation</div>
<h1>Line 70 Infrastructure</h1>
<p class="sub">What the line is made of, pulled out of OpenStreetMap and snapped onto the
measured chainage. Includes the parts that are not there — the gaps matter as much as the
inventory, because they decide what has to be synthesised.</p>
<div class="facts">
<div class="fact"><b>{nsig}</b><span>signals on the route</span></div>
<div class="fact"><b>{len(ms)}</b><span>official km posts</span></div>
<div class="fact"><b>{sw_on}</b><span>running-line switches</span></div>
<div class="fact"><b>{len(INF["crossings"])}</b><span>level crossings</span></div>
<div class="fact"><b>{len(STR)}</b><span>bridges and tunnels</span></div>
<div class="fact"><b>34%</b><span>signal coverage</span></div>
</div></div></div>

<div class="wrap">

<section>
<p class="eyebrow">Calibration</p>
<h2>Our chainage runs short of the official posts, by one metre per kilometre</h2>
<p class="lede">Thirty milestones on line 70 carry a <code>railway:position</code> — the real
MÁV kilometre. Comparing them against the chainage measured off the geometry gives a clean,
almost perfectly linear drift: <strong>mean {sum(d)/len(d):+.1f} m</strong>, reaching about
&minus;47 m by km 50.</p>
<div class="panel"><p class="cap">Measured chainage minus official km post</p>{calib_svg()}</div>
<p>This is not an error, it is the expected thing. Kilometre posts were planted along the
alignment as it was, and have not moved since; the track under them has been realigned,
curves eased, the 1971–73 reconstruction increased radii. Our measurement follows today's
rails. Both numbers are right about different things.</p>
<p><strong>What it means for the game:</strong> display official kilometres, because that is
what a driver reads off the lineside and what the timetable is written in. Drive on measured
chainage, because that is what the wheels do. The fit above converts between them.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Signalling</p>
<h2>Enough to anchor a block plan, not enough to be one</h2>
<p class="lede">{nsig} signals sit on line 70 itself, {nmain} of them tagged as main signals.
By function: {Counter(s["function"] or "untagged" for s in BLK["signals"])["block"]} block
signals (<em class="hu">térközjelző</em>),
{Counter(s["function"] or "untagged" for s in BLK["signals"])["entry"]} entry
(<em class="hu">bejárati</em>),
{Counter(s["function"] or "untagged" for s in BLK["signals"])["exit"]} exit
(<em class="hu">kijárati</em>), and 45 mapped as a signal and nothing more.</p>
<p>A double-track automatic-block railway of this length, worked at 120 and 100 km/h, needs
somewhere around 158 main signals. We have about a third of them. The longest gap between
two mapped signals is 16.5 km, which is not a block section, it is a hole in the survey.</p>
<div class="call"><span class="h">So the honest plan is</span>
<p>Treat the mapped signals as <strong>fixed anchors</strong> — they are real positions and
must not move — and synthesise the rest between them, spaced by braking distance at line
speed. Where OSM gives us an entry or exit signal at a station, that station's approach is
already correct. Median measured gap on the down line is {med:.0f} m, but that number is
pulled down by station entry/exit pairs; the free-running block sections should come out
nearer 1500–1800 m.</p></div>
<h3>Every signal with a stated function</h3>
<div class="scroll"><table>
<thead><tr><th>km</th><th>Line</th><th>Function</th><th>Form</th><th>Nearest stop</th></tr></thead>
<tbody>{signal_rows()}</tbody></table></div>
<p class="small">Line is which running track the signal stands on, decided by which
centreline it snaps closest to. Six signal boxes are mapped:
{esc(", ".join(f"{b['name'] or b['ref']} (km {b['km']:.2f})" for b in INF["signal_boxes"]))}.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Formation</p>
<h2>How many tracks, and where they sit</h2>
<p class="lede">Each dot is a track centre, measured as a perpendicular offset from the down
line and clustered so that a track split into a dozen OSM fragments still counts once. Read
across and you get the shape of the railway: two roads almost everywhere, opening at
stations, and a long three-track stretch after Vác where line 75 runs alongside.</p>
<div class="panel"><p class="cap">Track centres across the formation · signals · level crossings</p>
{formation_svg()}</div>
<p>The wide places are exactly where they should be. Rákosrendező at km 3.3 is sixteen roads
at a regular 4.7 m spacing — the old hump yard. Dunakeszi at 14.1 is eight, for the carriage
works. Vác reaches nine, Szob ten. Nagymaros holds a steady six through the station.
Kismaros, despite being the junction for the narrow gauge, is two: it is a
<em class="hu">megállóhely</em>, a halt, and the forest railway does not connect to it.</p>
<h3>Station diagrams, drawn from the geometry</h3>
<p>Nothing below is hand-drawn. Each is the clustered track centres plotted against
chainage, with running-line switches on the axis and signals above and below by direction.
This is a first pass at the dispatcher panel — the same data, one step from being clickable.</p>
{diagrams}
<p class="small">Vertical scale is exaggerated about eight times, so tracks 4.7 m apart are
legible. Roads are joined between samples where a centre moves less than 4.5 m, which is why
a sharply diverging siding can break into segments. Switch positions are drawn on the axis
rather than at their true offset.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Which line is which</p>
<h2>70, 71 and 75 share more track than the map suggests</h2>
<p>Every rail way carries a <code>ref</code> naming the line it belongs to, and reading them
by station settles something the route diagram only hints at:</p>
<dl class="spec">
<div><dt>Rákospalota-Újpest</dt><dd><b>70 + 71</b> — line 71 to Vácrátót leaves here.</dd></div>
<div><dt>Vác-Alsóváros</dt><dd><b>70 + 71</b> — and rejoins here, having gone the long way
round through Fót and Vácrátót.</dd></div>
<div><dt>Vác</dt><dd><b>70 + 71 + 75</b> — three lines. This is the operational centre of the
whole route.</dd></div>
<div><dt>Kisvác and Fenyveshegy</dt><dd><b>70 + 75</b> — the two lines run side by side from
Vác to just short of Verőce. Both halts are on the 75 tracks; no line 70 train has ever
called at either, but you pass their platforms at 100 km/h.</dd></div>
<div><dt>Szob</dt><dd><b>70 + 120A</b> — the border station, with the connection toward
Štúrovo.</dd></div>
<div><dt>Rákosrendező</dt><dd><b>70 + 209, 210, 218, 219, 220</b> — five yard and connecting
line numbers on top of the main line.</dd></div>
</dl>
<p class="small">Three independent sources now agree on the Vác–Verőce parallel running: the
Wikipedia route diagram marks Kisvác and Fenyveshegy "csak 75", the station nodes snapped to
within four metres of our centreline, and the track formation reads three roads from km 34.5
to 41.5.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Switches and crossings</p>
<h2>Where the line can be got at</h2>
<p class="lede">{sw_on} switches sit on the running lines, out of {len(INF["switches"])} in
the corridor. {sum(1 for s in INF["switches"] if s["diverging_kmh"])} carry a diverging speed
and the answer is almost always the same: <strong>40 km/h</strong>, which is the standard
Hungarian turnout speed and the reason 40 is one of the aspects a signal can show.
{sum(1 for s in INF["switches"] if s["electric"] == "yes")} are electrically worked;
{sum(1 for s in INF["switches"] if s["heated"] == "yes")} are heated.</p>
<h3>Level crossings</h3>
<p>{len(INF["crossings"])} on the route: {xings.get("half",0)} half barriers,
{xings.get("double_half",0)} double half, {xings.get("full",0)} full,
{xings.get("no",0)} with no barrier at all, {xings.get("untagged",0)} untagged. The unbarriered
ones are the interesting ones to drive past.</p>
<div class="scroll"><table>
<thead><tr><th>km</th><th>Barrier</th><th>Protection</th><th>Road</th></tr></thead>
<tbody>{crossing_rows()}</tbody></table></div>
</section>

<hr class="track">

<section>
<p class="eyebrow">Structures</p>
<h2>Bridges and tunnels</h2>
<p class="lede">{len(STR)} structures within 140 m of the down line — {sum(1 for s in STR if s["kind"]=="bridge")}
bridges, {sum(1 for s in STR if s["kind"]=="tunnel")} tunnels, {sum(s["length_m"] for s in STR if s["kind"]=="bridge")} m
of bridged track in total.</p>
<p>Two are worth naming now. At <strong>km 63.46</strong> the <strong>Sávoly híd</strong>
carries the line over the Ipoly into Slovakia, and OSM has it twice — once as
<em class="hu">Sávoly híd</em> and once as <em class="hu">Sávolyho most</em>, which is the
border in a single data field. And at <strong>km 57.97</strong> there is a pair of 75 m
spans immediately before Zebegény, which is where the <strong>Hétlyukú híd</strong> stands:
seven arches of 7.5 m built in 1850, still carrying traffic. OSM does not name it, so treat
that identification as very likely rather than confirmed.</p>
<div class="scroll"><table>
<thead><tr><th>km</th><th>Kind</th><th>Length m</th><th>Name</th></tr></thead>
<tbody>{structure_rows()}</tbody></table></div>
<p class="small">The cluster of short "tunnels" in the first kilometre out of Nyugati are the
road bridges the line passes under — Ferdinánd híd, Dózsa György út, Róbert Károly körút —
tagged on the rail way rather than the road. The 469 m tunnel recorded at km 17.36 does not
match anything in the published route diagram and needs checking against a photo before we
build it.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Gaps</p>
<h2>What we still need, in priority order</h2>
<p class="lede">Asked to think about what else is wanted. This is the honest list, ordered by
how much it blocks.</p>

<h3>Blocking the simulator</h3>
<dl class="spec">
<div><dt>Platform numbers</dt><dd><b>Not in OSM at all.</b> No station on the line has its
roads numbered. You cannot say "arrive on road 3 at Vác" without them, and the dispatcher
panel needs them on every siding. Source: MÁV station diagrams, or platform photographs.
This is the single biggest hole.</dd></div>
<div><dt>Two thirds of the signals</dt><dd>Synthesise between the anchors, spaced by braking
distance. Needs a decision on section length, which needs the next item.</dd></div>
<div><dt>F.1 signalling rules</dt><dd>Which aspects may follow which, approach release,
what the <em class="hu">előjelző</em> shows for each main aspect. Without it the signals are
lamps, not a system.</dd></div>
<div><dt>Full timetable</dt><dd>We have S70 minutes. G70, Z70, the four international
services and the freight paths all need real times, or the traffic conflicts are invented.</dd></div>
<div><dt>KISS vehicle data</dt><dd>Mass, tractive effort curve, braking rates, length,
door positions. From Stadler's published spec, not OSM.</dd></div>
</dl>

<h3>Blocking the look</h3>
<dl class="spec">
<div><dt>Land cover</dt><dd><b>Fetched today:</b> 2874 polygons within 2.5 km — 863 forest,
538 scrub, 322 meadow, 247 wood, 86 orchard, 53 vineyard, 70 cliff, 58 bare rock. That is the
vegetation scatter, already sourced. Not yet processed.</dd></div>
<div><dt>Buildings</dt><dd>Station buildings and settlement footprints for the diorama.
In OSM, not yet pulled — it is a big fetch and wants doing once.</dd></div>
<div><dt>Curvature and cant</dt><dd>Radius is computable from the geometry we have. Cant is
not mapped anywhere and affects how the train sits in a curve.</dd></div>
<div><dt>Catenary</dt><dd>Mast positions are partly tagged. Regular spacing is a reasonable
fake; the wire is very visible from a cab.</dd></div>
</dl>

<h3>Worth having, not urgent</h3>
<dl class="spec">
<div><dt>Királyréti Erdei Vasút</dt><dd>38 narrow-gauge ways are already sitting in the
corridor data, unprocessed. Twelve kilometres, 760 mm, Kismaros to Királyrét.</dd></div>
<div><dt>Danube water level</dt><dd>The river is the view for thirty kilometres and its level
moves several metres a year.</dd></div>
<div><dt>Weather normals</dt><dd>Fog days, rain days, first and last frost for the Bend, so
the weather you asked for is the weather that actually happens here.</dd></div>
<div><dt>Sun position</dt><dd>Computable, no source needed — but worth doing early, because
it decides when the sunsets you want actually land.</dd></div>
</dl>
</section>

<footer>
<p><b>Sources.</b> All infrastructure from OpenStreetMap contributors, ODbL: relation
11547066 and everything within 1.3 km of it. Official kilometre posts from
<code>railway:position</code> on milestone nodes lying on the relation's own ways — corridor
milestones belonging to lines 2, 71 and 75 were excluded, since they are measured from
different origins and produced errors of up to 33 km before filtering.</p>
<p><b>Honest limits.</b> Signal coverage is roughly a third. Platform numbering is absent.
Switch positions in the station diagrams are drawn on the centre axis, not at their true
offset. The 469 m tunnel at km 17.36 is unverified. Track clustering occasionally reads one
road where the up line strays beyond the 70 m corridor, which is why a few short stretches
report a single track on a double-track railway.</p>
<p>August 2026.</p>
</footer>
</div>'''
    open("infrastructure.html", "w", encoding="utf-8").write(body)
    print(f"wrote infrastructure.html ({len(body)/1024:.0f} KB)")

main()
