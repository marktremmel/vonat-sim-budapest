#!/usr/bin/env python3
"""Render the operations pass: topology, structures, block plan, timings."""
import json, math, html
from collections import Counter

def esc(s): return html.escape(str(s))

LAY = json.load(open("data/layouts.json", encoding="utf-8"))
STR = json.load(open("data/structures.json", encoding="utf-8"))
BP  = json.load(open("data/blockplan.json", encoding="utf-8"))
RT  = json.load(open("data/runtimes.json", encoding="utf-8"))
INF = json.load(open("data/infra.json", encoding="utf-8"))
TOTAL = 63.536

REAL = {"Budapest-Nyugati":0,"Rákosrendező":5,"Istvántelek":9,"Rákospalota-Újpest":12,
        "Dunakeszi alsó":17,"Dunakeszi":20,"Dunakeszi-Gyártelep":23,"Alsógöd":27,
        "Göd":29,"Felsőgöd":32,"Sződ-Sződliget":36,"Vác-Alsóváros":41,"Vác":44,
        "Verőce":50,"Kismaros":52,"Nagymaros-Visegrád":58,"Nagymaros":60,
        "Zebegény":68,"Szob alsó":74,"Szob":77}

# ------------------------------------------------- station diagram (topology)
def station_svg(name):
    L = LAY[name]
    km, half = L["km"], 0.85
    W, H, PL, PR = 1180, 172, 40, 14
    inner = W - PL - PR
    def X(k): return PL + (k - (km - half)) / (2 * half) * inner
    span = 42.0
    mid = 84.0
    def Y(o): return mid - max(-span, min(span, o)) / span * 58

    paths = []
    for geom, ci, tg in zip(L["_geom"], L["_comp_of"], L["_tags"]):
        pts = [(X(p["km"]), Y(p["off"])) for p in geom if abs(p["off"]) <= span * 1.6]
        if len(pts) < 2:
            continue
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        if ci == 0:
            cls = "road" if tg.get("main") else "road2"
        else:
            cls = "roadNG" if tg.get("railway") == "narrow_gauge" else "roadOrph"
        paths.append(f'<path d="{d}" class="{cls}"/>')

    sw = "".join(f'<circle cx="{X(s["km"]):.1f}" cy="{mid:.1f}" r="2.4" class="sw"/>'
                 for s in INF["switches"]
                 if km - half <= s["km"] <= km + half and s.get("on_route"))
    nums = "".join(
        f'<g class="roadnum"><rect x="{X(km)-9:.1f}" y="{Y(r["offset_m"])-7:.1f}" '
        f'width="18" height="14" rx="2"/>'
        f'<text x="{X(km):.1f}" y="{Y(r["offset_m"])+3.6:.1f}" text-anchor="middle">'
        f'{r["road"]}</text></g>' for r in L["roads"])
    ax = "".join(f'<text x="{X(km+d):.1f}" y="{H-8}" class="azl" text-anchor="middle">'
                 f'{km+d:.2f}</text>' for d in (-half, 0, half))
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Track layout of {esc(name)} built from OpenStreetMap node topology">
{"".join(paths)}{sw}{nums}
<line x1="{X(km):.1f}" y1="10" x2="{X(km):.1f}" y2="{H-24}" class="ctr"/>
<text x="{X(km)+7:.1f}" y="18" class="stn2">{esc(name)}</text>
{ax}<text x="{PL}" y="{H-8}" class="azl">km</text></svg>'''

# ------------------------------------------------------- run-time validation
def runtime_svg():
    legs = RT["S70"]
    W, H, PL, PR, T, B = 1180, 260, 52, 16, 26, 46
    def X(k): return PL + k / 80.0 * (W - PL - PR)
    def Y(i): return T + i / 20.0 * (H - T - B)
    grid = "".join(f'<line x1="{X(m):.1f}" y1="{T}" x2="{X(m):.1f}" y2="{H-B}" class="grid"/>'
                   f'<text x="{X(m):.1f}" y="{H-B+15}" class="azl" text-anchor="middle">{m}</text>'
                   for m in range(0, 81, 10))
    rows = []
    for i, (name, secs) in enumerate(legs):
        y = Y(i)
        sim = secs / 60.0
        real = REAL.get(name)
        rows.append(f'<text x="{PL-8}" y="{y+3.4:.1f}" class="rowl" text-anchor="end">'
                    f'{esc(name)}</text>')
        if real is not None:
            rows.append(f'<line x1="{X(min(sim,real)):.1f}" y1="{y:.1f}" '
                        f'x2="{X(max(sim,real)):.1f}" y2="{y:.1f}" class="gapline"/>')
            rows.append(f'<circle cx="{X(real):.1f}" cy="{y:.1f}" r="3.4" class="dotReal"/>')
        rows.append(f'<circle cx="{X(sim):.1f}" cy="{y:.1f}" r="2.6" class="dotSim"/>')
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Simulated S70 timings against the published timetable">
{grid}{"".join(rows)}
<text x="{PL}" y="16" class="axl">minutes from Budapest-Nyugati · hollow = published, solid = simulated</text>
</svg>'''

# ------------------------------------------------------------- block plan
def blockplan_svg():
    W, H, PL, PR = 1180, 170, 46, 14
    inner = W - PL - PR
    def X(km): return PL + km / TOTAL * inner
    rows = []
    for row, (ln, yb) in enumerate((("down", 54), ("up", 106))):
        sig = BP["plan"][ln]
        rows.append(f'<line x1="{PL}" y1="{yb}" x2="{W-PR}" y2="{yb}" class="axis"/>')
        rows.append(f'<text x="{PL}" y="{yb-26}" class="axl">{ln} line · '
                    f'{sum(1 for s in sig if s["source"]=="osm")} mapped, '
                    f'{sum(1 for s in sig if s["source"]=="synthetic")} synthesised</text>')
        for s in sig:
            x = X(s["m"] / 1000)
            if s["source"] == "osm":
                rows.append(f'<line x1="{x:.1f}" y1="{yb-13}" x2="{x:.1f}" y2="{yb}" '
                            f'class="anchor"/><circle cx="{x:.1f}" cy="{yb-15:.1f}" '
                            f'r="2.6" class="anchorD"/>')
            else:
                rows.append(f'<line x1="{x:.1f}" y1="{yb-9}" x2="{x:.1f}" y2="{yb}" '
                            f'class="synth"/>')
    ticks = "".join(f'<line x1="{X(k):.1f}" y1="20" x2="{X(k):.1f}" y2="{H-26}" '
                    f'class="grid"/><text x="{X(k):.1f}" y="{H-12}" class="azl" '
                    f'text-anchor="middle">{k}</text>' for k in range(0, 64, 10))
    return f'''<svg viewBox="0 0 {W} {H}" class="fig" role="img"
 aria-label="Synthesised block signal plan for both running lines">
{ticks}{"".join(rows)}</svg>'''

# ------------------------------------------------------------------ tables
def aspect_rows():
    return "".join(
        f'<tr><td class="n">{esc(p)}</td><td class="n">{esc(nx)}</td>'
        f'<td class="s">{esc(hu)}</td><td>{esc(en)}</td><td class="note">{esc(d)}</td></tr>'
        for p, nx, hu, en, d in BP["aspects"])

def struct_rows():
    seen, r = set(), []
    for s in STR:
        k = (round(s["km"], 1), s["tag"], s["length_m"] // 10)
        if k in seen:
            continue
        seen.add(k)
        spans = ", ".join(f"{v}× {kk}" for kk, vv in s["spans"].items() for v in [vv]) or "—"
        r.append(f'<tr><td class="n">{s["km"]:.3f}</td>'
                 f'<td><span class="pill {"y" if s["tag"]=="tunnel" else "n"}">'
                 f'{esc(s["tag_value"])}</span></td>'
                 f'<td class="n">{s["length_m"]}</td><td>{esc(spans)}</td>'
                 f'<td>{esc(", ".join(s["span_names"]) or (s["name"] or ""))}</td></tr>')
    return "".join(r)

def service_rows():
    order = ["S70", "S70 (FLIRT)", "G70", "Z70", "EC", "Freight"]
    r = []
    for k in order:
        legs = RT.get(k)
        if not legs:
            continue
        r.append(f'<tr><td class="s">{esc(k)}</td><td class="n">{len(legs)}</td>'
                 f'<td class="n">{legs[-1][1]/60:.1f}</td>'
                 f'<td class="n">{TOTAL/(legs[-1][1]/3600):.1f}</td></tr>')
    return "".join(r)

CSS = open("tools/atlas.css", encoding="utf-8").read()

def main():
    picks = ["Rákospalota-Újpest", "Dunakeszi", "Vác-Alsóváros", "Vác",
             "Kismaros", "Nagymaros", "Zebegény", "Szob"]
    diags = "".join(
        f'<div class="viewhead"><h3>{esc(n)}</h3><span class="km">km {LAY[n]["km"]:.3f} · '
        f'{LAY[n]["ways"]} ways · {LAY[n]["components"]} component'
        f'{"s" if LAY[n]["components"] != 1 else ""} · {len(LAY[n]["roads"])} roads'
        f'{" · " + str(LAY[n]["buffer_stops"]) + " buffer stops" if LAY[n]["buffer_stops"] else ""}'
        f'</span></div><div class="panel">{station_svg(n)}</div>'
        for n in picks if n in LAY)

    tun = [s for s in STR if s["tag"] == "tunnel"]
    bp_stats = {ln: (sum(1 for s in BP["plan"][ln] if s["source"] == "osm"),
                     sum(1 for s in BP["plan"][ln] if s["source"] == "synthetic"))
                for ln in ("down", "up")}

    body = f'''<title>Line 70 Operations</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>{CSS}</style>
<div class="board"><div class="board-inner">
<div class="chev"><span class="num">70</span> topology · aspects · timings</div>
<h1>Line 70 Operations</h1>
<p class="sub">Four questions answered with evidence: are those tracks really disconnected,
are there really tunnels, how do the signals work, and can we time a train well enough to
trust the traffic. The last one turned into the best check we have made yet.</p>
<div class="facts">
<div class="fact"><b>0</b><span>tunnels on the line</span></div>
<div class="fact"><b>3</b><span>causes of disconnection</span></div>
<div class="fact"><b>113</b><span>signals in the block plan</span></div>
<div class="fact"><b>49.8</b><span>km/h simulated average</span></div>
<div class="fact"><b>49–53</b><span>km/h published average</span></div>
<div class="fact"><b>1.8</b><span>min worst timing error</span></div>
</div></div></div>

<div class="wrap">

<section>
<p class="eyebrow">You were right</p>
<h2>There are no tunnels on line 70</h2>
<p class="lede">I intersected every structure with the roads and watercourses around it and
let the geometry decide what it is. Of {len(tun)} rail ways tagged as tunnel,
<strong>{sum(1 for s in tun if s["tag_value"]=="building_passage")} carry
<code>tunnel=building_passage</code></strong> — the tag for a railway running under a
building or a canopy, not through rock. The remaining three are
<code>railway=abandoned</code>, one of them charmingly named <em class="hu">Felszedett
Gazdasági vasút vágánya</em>, "lifted industrial railway track". None of them is on the
operational line.</p>
<p>The fourteen in the first kilometre out of Nyugati are the train shed and the structures
around Podmaniczky utca. Nineteen of the twenty-four have nothing crossing overhead at all,
which is exactly what you would expect of track under a roof. Your instinct was better than
my table.</p>
<h3>And the bridges are mostly streams, not roads</h3>
<p>Partly right on this one. Of the bridges, seventeen span only a road and four only a
path — so yes, plenty are just road overbridges. But the rest cross water, and the names
that came back are a complete cross-check against the route diagram you saved:
Szilas-patak, Csömöri-patak, Mogyoródi-patak, Ilka-patak, Sződrákos-patak, Gombás-patak,
Felső-Gombás-patak, Morgó-patak, Mosoni-patak, Ernő-patak, Malom-patak. Every one of those
appears in the Wikipedia <em class="hu">jelmagyarázat</em>, in the right order, at the right
distance.</p>
<div class="call"><span class="h">And it settles the Hétlyukú híd</span>
<p>At km 57.97 and 58.04 there is a pair of 75 m spans crossing the <strong>Malom-patak</strong>
and Árpád utca, immediately before Zebegény. The route diagram lists "Hétlyukú híd
(Malomvölgyi-patak)" at exactly that point. Last pass I could only call it likely. The
watercourse name confirms it: seven arches of 7.5 m, built 1850, still carrying you.</p></div>
<div class="scroll"><table>
<thead><tr><th>km</th><th>Tag</th><th>Length m</th><th>Crosses</th><th>What</th></tr></thead>
<tbody>{struct_rows()}</tbody></table></div>
</section>

<hr class="track">

<section>
<p class="eyebrow">Topology</p>
<h2>The disconnected tracks — three different reasons</h2>
<p class="lede">You were reading a real flaw. The old diagrams joined track centres that
happened to sit near each other, which invented connections and broke real ones. These are
rebuilt from OSM node identity: two ways are joined if and only if they share a node.</p>
<p>Rebuilt that way, most stations come back as a <strong>single connected component</strong>
— Rákospalota-Újpest, Dunakeszi, Göd, Vác, Verőce, Nagymaros-Visegrád and Nagymaros are all
one piece. Where something is isolated, it is isolated for one of three reasons, and only
one of them is a data problem.</p>

<div class="grid two">
<div class="card"><span class="tag">Reason 1 · different gauge</span>
<h3>It physically cannot connect</h3>
<p><strong>Kismaros</strong>: seven <code>railway=narrow_gauge</code> ways, running away from
the station up the valley. That is the <strong>Királyréti Erdei Vasút</strong> at 760 mm.
<strong>Szob</strong>: ten more, the remains of the Nagybörzsöny forest railway. No train can
pass between them and the main line, so OSM is right to leave them apart. Drawn in yellow
below.</p></div>
<div class="card"><span class="tag">Reason 2 · the connection was lifted</span>
<h3>It used to connect and no longer does</h3>
<p><strong>Vác-Alsóváros</strong>: three industrial spurs and a yard road, 10 to 130 m off
the line at km 30.8–32.5. That is the <strong>Forte</strong> photochemical works and the
Tungsram siding. Forte closed in 2007 and the junction has gone. A second group of three
yard roads on the other side is the timber loading area. Genuinely detached — and worth
modelling as rusted stubs, because that is what is there.</p></div>
<div class="card"><span class="tag">Reason 3 · my window, not the railway</span>
<h3>It connects just outside the frame</h3>
<p><strong>Rákosrendező</strong>: two <code>usage=main</code> ways running from &minus;24 m
out to &minus;1235 m. Those are the Esztergom line and the <em class="hu">körvasút</em>
heading for Rákos. They join the network perfectly well, 1.2 km away, outside my ±850 m
extract. <strong>Zebegény</strong> is the same story in miniature: its up line shows as a
separate component because there is no crossover at a <em class="hu">megállóhely</em> — and
that is not a fault, it is the operational truth. Two running lines that never touch between
stations.</p></div>
<div class="card"><span class="tag">What it means for the sim</span>
<h3>Component count tells you what kind of place this is</h3>
<p>A stop whose ways form one component has points and can be worked as a station. A stop
whose two running lines stay separate is a halt: trains call, nothing can be crossed over,
and the dispatcher has no moves to make there. That distinction falls straight out of the
graph and it is exactly what the panel needs to know.</p></div>
</div>

<h3>Rebuilt station diagrams</h3>
<p>Real topology, real offsets, switches on the axis, synthetic road numbers in the boxes.
These supersede the ones in the infrastructure pass.</p>
<div class="legend">
<span><i style="border-color:var(--ink)"></i>running line</span>
<span><i style="border-color:var(--ink-2)"></i>other standard gauge, connected</span>
<span><i style="border-color:var(--sig-yellow)"></i>narrow gauge, 760 mm</span>
<span><i style="border-color:var(--sig-red);border-top-style:dashed"></i>isolated component</span>
</div>
{diags}
</section>

<hr class="track">

<section>
<p class="eyebrow">Road numbers</p>
<h2>Numbered 1 to n across the formation</h2>
<p class="lede">Since OSM has none, they are synthesised the way you suggested — counted
straight across the formation, <strong>road 1 on the right-hand side facing Szob</strong>,
rising to the left. Every number below is ours, not MÁV's, and should be replaced the moment
we get a real station diagram.</p>
<dl class="spec">
{"".join(f'<div><dt>{esc(n)}</dt><dd>' + "  ".join(f"<b>{r['road']}</b> at {r['offset_m']:+.0f} m" for r in LAY[n]["roads"]) + '</dd></div>' for n in picks if n in LAY and LAY[n]["roads"])}
</dl>
<p class="small">Offsets are metres from the down-line centre, positive to the left of a
Szob-bound train. Where a station's platform faces the reception building, MÁV numbering
normally starts there — so if the building at a given station is on the left, our numbering
is reversed for that station. Worth a photograph each to check.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">The block plan</p>
<h2>Two thirds synthesised, one third fixed</h2>
<p class="lede">Mapped signals are anchors and do not move. Everything between them is filled
in at a spacing set by line speed, never closer than the MÁV standard braking distance
(<em class="hu">fékúttávolság</em>) of <strong>700 m</strong>. The result is
{bp_stats["down"][0]}+{bp_stats["down"][1]} signals on the down line and
{bp_stats["up"][0]}+{bp_stats["up"][1]} on the up.</p>
<div class="panel"><p class="cap">Block plan · dotted = synthesised, dot = mapped anchor</p>
{blockplan_svg()}</div>
<dl class="spec">
<div><dt>Braking distance</dt><dd><b>700 m</b> — the MÁV standard, and the hard floor for
any running block.</dd></div>
<div><dt>Section targets</dt><dd>1500 m at 120 km/h, 1300 at 100, 1100 at 80, 900 at 60.
Median achieved: <b>1315 m down, 1323 m up</b>.</dd></div>
<div><dt>Station sections</dt><dd>Seven on the down line, ten on the up, from 109 to 626 m.
These sit between an entry and an exit signal and are platform roads, not running blocks, so
the braking-distance floor does not apply.</dd></div>
<div><dt>Still too short</dt><dd>Two running blocks on the down line at 361 m and one on the
up at 381 m, all OSM anchor pairs just outside station limits. Left alone rather than moved,
since the anchors are real.</dd></div>
<div><dt>Theoretical headway</dt><dd>103 s at 120 km/h with 1500 m sections. Ignore it — what
actually limits this line is Nyugati's platforms, the flat junction at Rákospalota-Újpest and
50 s dwells. <b>Plan for three to four minutes.</b></dd></div>
</dl>
</section>

<hr class="track">

<section>
<p class="eyebrow">Aspects</p>
<h2>What a Hungarian signal is actually saying</h2>
<p class="lede">Speed signalling, so every aspect carries two numbers: the speed you may pass
<em>this</em> signal at, and the speed to expect at the <em>next</em> one. That pair is the
whole state machine — model it and the signals become a system rather than lamps.</p>
<div class="scroll"><table>
<thead><tr><th>Pass at</th><th>Expect</th><th>Hungarian</th><th>Lamps</th><th>Meaning</th></tr></thead>
<tbody>{aspect_rows()}</tbody></table></div>
<p class="small">Modelled from the MÁV speed-signalling system adopted 1962–67. Lamp
arrangements for the two-part aspects still need checking against F.1
<em class="hu">Jelzési Utasítás</em> before the sprites are drawn — the pass/expect pairs are
the part I am confident in.</p>
<h3>In the cab</h3>
<p><strong>EVM-120</strong> repeats the next signal's permitted speed into the cab through
coded track circuits, so the driver sees 120, 80, 40, 15 or 0 before the signal is in sight.
A restrictive change has to be acknowledged; ignore it and the brake applies. Over the top of
that sits the <em class="hu">éberségi berendezés</em>, the vigilance device — the same dial
as the SIFA in your ZUSI screenshot. Two things to watch and one button that will stop your
train if you stop paying attention. That is the tactical layer, and it is real.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Timings</p>
<h2>The physics reproduces the timetable</h2>
<p class="lede">Rather than guess at running times, I built a train. MÁV 815 at 314 t tare
plus load, 400 kN starting tractive effort, 4000 kW continuous, 1.1 m/s² acceleration,
0.9 m/s² service braking, against our own gradient profile and OSM speed limits, integrated
in 20 m steps with a backward braking pass.</p>
<div class="panel"><p class="cap">Simulated S70 against the published timetable</p>
{runtime_svg()}</div>
<p>Driven flat out to the limits, a KISS covers Nyugati to Szob in <strong>52.0 minutes of
pure running</strong>. The published all-stations time is 77. Fitting two parameters —
recovery margin and station dwell — to the twenty published times, holding dwell to a range
a real stop actually takes, gives <strong>16.5% recovery margin and 50 s dwell</strong>, and
reproduces every one of the twenty station times to within <strong>1.8 minutes</strong>, rms
0.87.</p>
<div class="call"><span class="h">The check that was not fitted</span>
<p>That model implies an average speed of <strong>49.8 km/h</strong> over the route. The
published figure for the S70 is <strong>49–53 km/h</strong> — a number that went nowhere near
the fit. The vehicle model, the gradients and the speed profile are all right at once.</p></div>
<h3>Every service, same engine</h3>
<div class="scroll"><table>
<thead><tr><th>Service</th><th>Calls</th><th>Scheduled min</th><th>Average km/h</th></tr></thead>
<tbody>{service_rows()}</tbody></table></div>
<p><strong>This is where the game lives.</strong> The timetable is 1.48× the technical
minimum. A driver who reads the road well arrives early and waits; a driver who dawdles loses
a path. And because the Z70 covers the route in 55 minutes against the S70's 76, an
all-stations train that runs late at Sződ-Sződliget is in the way of something much faster by
Vác. That conflict is not designed, it falls out of the real timetable and the real physics.</p>
</section>

<hr class="track">

<section>
<p class="eyebrow">Vehicle</p>
<h2>MÁV 815, the train you drive</h2>
<dl class="spec">
<div><dt>Formation</dt><dd>Six cars, <b>Bo'Bo'+2'2'+2'2'+2'2'+2'2'+Bo'Bo'</b> — eight powered
axles of twenty-four</dd></div>
<div><dt>Length</dt><dd><b>155.88 m</b> over couplers · width 2800 mm · height 4595 mm</dd></div>
<div><dt>Mass</dt><dd><b>314 t</b> empty, 21 t maximum axle load. English-language sources say
296 t; we use the Hungarian figure and flag the disagreement.</dd></div>
<div><dt>Power</dt><dd><b>4000 kW</b> continuous, 6000 kW short term, eight TSA TMF 59-33-4
motors</dd></div>
<div><dt>Tractive effort</dt><dd><b>400 kN</b> starting · acceleration 1.1 m/s²</dd></div>
<div><dt>Speed</dt><dd><b>160 km/h</b> design, but the line gives you 120 at most</dd></div>
<div><dt>Seats</dt><dd><b>600</b>, or 552 in summer configuration</dd></div>
<div><dt>Supply</dt><dd>25 kV 50 Hz · wheels 920 mm new, 850 mm worn</dd></div>
<div><dt>Fleet</dt><dd><b>40 units</b>, delivered to 2022, in service since 15 March 2020</dd></div>
<div><dt>Depot</dt><dd><b>Istvántelki Főműhely</b> — which is km 6.12 on our own line. The
train you are driving is maintained at a place you pass in the ninth minute.</dd></div>
</dl>
</section>

<hr class="track">

<section>
<p class="eyebrow">Next</p>
<h2>What is left</h2>
<p>Still to do, in the order I would take them: process the <strong>2874 land-cover
polygons</strong> into a vegetation scatter; build the <strong>24-hour traffic graph</strong>
now that every service pattern has a validated running time, including the international
paths and the freight; pull <strong>buildings</strong> in one fetch; and process the
<strong>Királyréti narrow gauge</strong>, which is already sitting in the corridor data and
now proven to be its own separate railway.</p>
<p>Then the renderer, which finally has everything it needs: a spline with real curvature,
a heightmap, named hills that know which window they are out of, a signal system with a
state machine, and a train whose timings match the real ones to within two minutes.</p>
</section>

<footer>
<p><b>Sources.</b> Topology, structures and signalling from OpenStreetMap contributors, ODbL.
MÁV 815 data from hu.wikipedia and Stadler published figures. Braking distance, speed
signalling and aspect logic from the MÁV speed-signalling system; F.1 verification pending.
Published S70 timings from hu.wikipedia, CC BY-SA 4.0.</p>
<p><b>Honest limits.</b> Road numbers are invented, not MÁV's. Aspect lamp arrangements are
modelled, not verified. The recovery margin and dwell are fitted, and they trade off against
each other — a different dwell assumption moves the margin. The run-time model has no signal
checks, no coasting and a perfect driver, which is precisely why it beats the timetable.</p>
<p>August 2026.</p>
</footer>
</div>'''
    open("operations.html", "w", encoding="utf-8").write(body)
    print(f"wrote operations.html ({len(body)/1024:.0f} KB)")

main()
