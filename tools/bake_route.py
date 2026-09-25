#!/usr/bin/env python3
"""Bake the drivable route into one compact JSON for the renderer.

Local metric frame with its origin at the near-region south-west corner, so the
renderer works in plain metres and never touches a latitude again.
"""
import json, math, sys
sys.path.insert(0, "tools")
from geo import frame, Chainer

import os as _os
# Which line. Line 70 reads the surveyed data (alignment, profile, block
# plan, infra); any other line reads what tools/line_alignment.py and the
# q_<line>_*.ql downloads produced, in its own world frame.
LINE = sys.argv[1] if len(sys.argv) > 1 else "line70"
SUFFIX = "" if LINE == "line70" else f"_{LINE}"
W = json.load(open(f"web/data/world{SUFFIX}.json", encoding="utf-8"))
NEAR = W["near"]
MLAT, MLON = frame(NEAR.get("frame_lat", (NEAR["south"] + NEAR["north"]) / 2))
# The window of the line to bake. Line 70 defaults to the Vác–Szob slice;
# SZOB_KM=0,63.6 is the whole line. Other lines are baked whole.
KM_FROM, KM_TO = [float(v) for v in
                  _os.environ.get("SZOB_KM", "30.0,63.6" if LINE == "line70" else "0,999").split(",")]
KM_TABLE = None

align = json.load(open("data/alignment.json" if LINE == "line70"
                       else f"data/alignment_{LINE}.json", encoding="utf-8"))
_pf = "data/profile.json" if LINE == "line70" else f"data/profile_{LINE}.json"
prof = json.load(open(_pf, encoding="utf-8"))
stops = []
if _os.path.exists("data/stations.json"):
    st = json.load(open("data/stations.json", encoding="utf-8"))
    stops = [s for s in (st.get(f"on_{LINE}") or st.get("on_line_70", []))
             if s["name"] != "Nyugati pályaudvar"]

if LINE != "line70":
    stops = []                    # rebuilt below from the line's own download
peaks = json.load(open("data/peaks.json", encoding="utf-8"))
plan = json.load(open("data/blockplan.json", encoding="utf-8")) if _os.path.exists("data/blockplan.json") else {"plan": {"down": [], "up": []}}
infra = json.load(open("data/infra.json", encoding="utf-8")) if _os.path.exists("data/infra.json") else {"milestones": [{"official_km": 0, "delta_m": 0}], "crossings": []}
ms = infra["milestones"]
if LINE != "line70":
    plan = {"plan": {"down": [], "up": []}}
    infra = {"milestones": [], "crossings": []}
    ms = infra["milestones"]

def xy(lat, lon):
    return ((lon - NEAR["west"]) * MLON, (lat - NEAR["south"]) * MLAT)

def height_at(m):
    i = min(int(m / prof["step_m"]), len(prof["profile"]) - 1)
    return prof["profile"][i][1]

def grade_at(m):
    i = min(int(m / prof["step_m"]), len(prof["profile"]) - 1)
    return prof["profile"][i][2]

# Find tracks for the requested line
t_down = next((t for t in align["tracks"] if t["id"] == f"{LINE}_down"), align["tracks"][0])
t_up = next((t for t in align["tracks"] if t["id"] == f"{LINE}_up"), align["tracks"][1])

def limit_at(m):
    pts, sp = t_down["points"], t_down["maxspeed"]
    for i in range(len(sp)):
        if pts[i][2] <= m <= pts[i + 1][2]:
            return sp[i] or 100
    return 100

def official_km(measured_m):
    if KM_TABLE:
        T = KM_TABLE
        if measured_m <= T[0][0]: return T[0][1] + (measured_m - T[0][0]) / 1000
        for (m0, k0), (m1, k1) in zip(T, T[1:]):
            if m0 <= measured_m <= m1:
                return k0 + (k1 - k0) * (measured_m - m0) / max(1e-6, m1 - m0)
        return T[-1][1] + (measured_m - T[-1][0]) / 1000
    """Invert the drift fit: measured = official*1000 + a + b*official."""
    return (measured_m - a) / (1000.0 + b)

def smooth(vals, half, weights=None):
    """Symmetric moving average, clamped at the ends."""
    n = len(vals)
    out = []
    for i in range(n):
        a_, b_ = max(0, i - half), min(n, i + half + 1)
        seg = vals[a_:b_]
        out.append(sum(seg) / len(seg))
    return out

def bake_track(t, step=10.0):
    ch = Chainer(t["points"])
    xs, ys, hs, m_s = [], [], [], []
    m = KM_FROM * 1000
    end = min(KM_TO * 1000, t["length_m"])
    while m <= end:
        lat, lon = ch.at(m)
        x, y = xy(lat, lon)
        xs.append(x); ys.append(y); hs.append(height_at(m)); m_s.append(m)
        m += step
    if not xs: return []
    xs = smooth(smooth(xs, 2), 2)
    ys = smooth(smooth(ys, 2), 2)
    hs = smooth(smooth(hs, 12), 12)
    return [[round(x, 2), round(y, 2), round(h, 3), round(mm, 1)]
            for x, y, h, mm in zip(xs, ys, hs, m_s)]

DOWN_CH = Chainer(t_down["points"])

if LINE != "line70":
    # ---- stations, signals, milestones and crossings from the line's own
    # Overpass downloads (q_<line>_signals.ql, q_<line>_extras.ql)
    sig_raw = json.load(open(f"data/raw/{LINE}_signals.json", encoding="utf-8"))["elements"]
    ext_raw = json.load(open(f"data/raw/{LINE}_extras.json", encoding="utf-8"))["elements"]
    best = {}
    for e in sig_raw:
        t = e.get("tags", {})
        if t.get("railway") not in ("station", "halt") or not t.get("name") or "lat" not in e:
            continue
        nm = t["name"]
        if "Vasútmúzeum" in nm or "Vasúttörténeti" in nm:
            continue                  # museum platforms, not served
        ch, off, _ = DOWN_CH.snap(e["lat"], e["lon"])
        if off < 160 and (nm not in best or off < best[nm][1]):
            best[nm] = ({"name": nm, "lat": e["lat"], "lon": e["lon"], "km": round(ch / 1000, 3)}, off)
    l70 = json.load(open("data/stations.json", encoding="utf-8")).get("on_line70", [])
    ny = next((s for s in l70 if s["name"] == "Budapest-Nyugati"), None)
    if ny:
        best["Budapest-Nyugati"] = (dict(ny, km=0.012), 0)
    stops = []
    # a terminus stands at the very end of the track, and the track is baked
    # in 10 m steps: Esztergom snapped to 52,857 m against a last point at
    # 52,850 and was filtered out, so trains terminated at Kertváros
    end_km = (t_down["length_m"] - 25) / 1000
    for v in best.values():
        v[0]["km"] = min(v[0]["km"], round(end_km, 3))
    for st_ in sorted((v[0] for v in best.values()), key=lambda s: s["km"]):
        # Újpest and Újpest-városkapu are one platform under two names
        if stops and (st_["km"] - stops[-1]["km"]) < 0.15:
            continue
        stops.append(st_)
    # official km from the mapped kilometre posts
    ms = []
    for e in sig_raw:
        t = e.get("tags", {})
        if t.get("railway") != "milestone" or "lat" not in e:
            continue
        try: off_km = float(t.get("railway:position", "").replace(",", "."))
        except ValueError: continue
        ch, off, _ = DOWN_CH.snap(e["lat"], e["lon"])
        if off < 40:
            ms.append({"official_km": off_km, "delta_m": ch - off_km * 1000, "ch": ch})
    # Line 2's official kilometrage is not one straight run from Nyugati: it
    # jumps by about 6 km between the Budapest end and Óbuda, so one linear
    # fit is meaningless. Keep a piecewise table instead, dropping posts that
    # disagree with both neighbours (a "292" among 29.1 and 29.3 is a typo).
    ms.sort(key=lambda r: r["ch"])
    clean = []
    for i, r in enumerate(ms):
        nb = [ms[j] for j in (i - 1, i + 1) if 0 <= j < len(ms)]
        if nb and all(abs(r["delta_m"] - q["delta_m"]) > 400 for q in nb):
            continue
        if clean and r["ch"] - clean[-1]["ch"] < 5:
            continue
        clean.append(r)
    KM_TABLE = [[round(r["ch"], 1), r["official_km"]] for r in clean]
    ms = []                           # the linear fit is not used for this line
    # main and combined signals, one chain for both directions, 60 m apart at least
    sm = []
    for e in sig_raw:
        t = e.get("tags", {})
        if t.get("railway") != "signal" or "lat" not in e:
            continue
        if not (t.get("railway:signal:main") or t.get("railway:signal:combined")):
            continue
        ch, off, _ = DOWN_CH.snap(e["lat"], e["lon"])
        if off < 30:
            sm.append(ch)
    sm.sort()
    chain = []
    for m in sm:
        if not chain or m - chain[-1] > 60: chain.append(m)
    if not chain or chain[0] > 50: chain.insert(0, 0.0)
    plan = {"plan": {"down": [{"m": m, "source": "osm",
                               "section_m": (chain[i + 1] - m) if i + 1 < len(chain) else 0,
                               "limit": 0} for i, m in enumerate(chain)]}}
    # level crossings with what guards them
    xs = []
    for e in ext_raw:
        t = e.get("tags", {})
        if t.get("railway") != "level_crossing" or "lat" not in e:
            continue
        ch, off, _ = DOWN_CH.snap(e["lat"], e["lon"])
        if off < 30:
            xs.append({"km": ch / 1000, "barrier": t.get("crossing:barrier") or "no"})
    infra = {"milestones": ms, "crossings": xs}
    print(f"{LINE}: {len(stops)} stops, {len(chain)} signals, {len(ms)} km posts, "
          f"{len(xs)} crossings")
# official-km calibration: measured = official + a + b*official (fit from milestones)
n = len(ms); sx = sum(m["official_km"] for m in ms); sy = sum(m["delta_m"] for m in ms)
sxx = sum(m["official_km"] ** 2 for m in ms)
sxy = sum(m["official_km"] * m["delta_m"] for m in ms)
b = (n * sxy - sx * sy) / (n * sxx - sx * sx) if n > 1 else 0
a = (sy - b * sx) / n if n > 0 else 0

down = bake_track(t_down)
up = bake_track(t_up)

lim = []
m = KM_FROM * 1000
while m <= KM_TO * 1000:
    v = limit_at(m)
    if LINE == "line70" and 53400 <= m <= 55600:
        v = min(v, 40)
    if not lim or lim[-1][1] != v:
        lim.append([round(m, 1), v])
    m += 20

route = {
    "origin": {"lat": NEAR["south"], "lon": NEAR["west"], "mlat": MLAT, "mlon": MLON},
    "km_from": KM_FROM, "km_to": KM_TO,
    "official_km_fit": {"a": round(a, 3), "b": round(b, 6)},
    "official_km_table": KM_TABLE if LINE != "line70" else None,
    "track_down": down,
    "track_up": up,
    "limits": lim,
    "grades": [[round(m, 1), round(grade_at(m), 3)]
               for m in range(int(KM_FROM * 1000), int(KM_TO * 1000), 100)],
    # Kisvác and Fenyveshegy sit on the line 75 tracks alongside; line 70
    # trains pass their platforms at speed and never call
    "stops": [{"name": s["name"], "km": s["km"],
               "official_km": round(official_km(s["km"] * 1000), 3),
               "xy": [round(v, 2) for v in xy(s["lat"], s["lon"])],
               "h": round(height_at(s["km"] * 1000), 1)}
              for s in stops if KM_FROM <= s["km"] <= KM_TO
              and s["name"] not in ("Kisvác", "Fenyveshegy")],
    "passing": [{"name": s["name"], "km": s["km"],
                 "xy": [round(v, 2) for v in xy(s["lat"], s["lon"])]}
                for s in stops if KM_FROM <= s["km"] <= KM_TO
                and s["name"] in ("Kisvác", "Fenyveshegy")],
    "signals": [{"m": round(s["m"], 1), "src": s["source"], "sec": s["section_m"],
                 "lim": s["limit"]}
                for s in plan["plan"]["down"] if KM_FROM * 1000 <= s["m"] <= KM_TO * 1000],
    "peaks": [{"name": p["name"], "ele": p["ele"],
               "xy": [round(v, 2) for v in xy(p["lat"], p["lon"])]}
              for p in peaks
              if p["ele"] >= 240 and NEAR["south"] - 0.25 <= p["lat"] <= NEAR["north"] + 0.25
              and NEAR["west"] - 0.35 <= p["lon"] <= NEAR["east"] + 0.35],
    "crossings": [{"m": c["km"] * 1000, "barrier": c["barrier"]}
                  for c in infra["crossings"] if KM_FROM <= c["km"] <= KM_TO],
    "places": [],
    # chainage ranges on long bridges (from the profile): no corridor there
    "bridges": prof.get("bridges", []),
}

PLACE_RANK = {"city": 0, "town": 1, "village": 2, "suburb": 3,
              "hamlet": 4, "neighbourhood": 5}
_places = json.load(open("data/raw/places.json", encoding="utf-8"))["elements"]
if LINE != "line70":
    _places += [e for e in json.load(open(f"data/raw/{LINE}_extras.json", encoding="utf-8"))["elements"]
                if (e.get("tags") or {}).get("railway") != "level_crossing"]
for e in _places:
    t = e.get("tags", {})
    lat = e.get("lat", (e.get("center") or {}).get("lat"))
    lon = e.get("lon", (e.get("center") or {}).get("lon"))
    if lat is None or not t.get("name"):
        continue
    if not (NEAR["south"] <= lat <= NEAR["north"]
            and NEAR["west"] <= lon <= NEAR["east"]):
        continue
    # The Budapest end is named by different things from the Bend: parks,
    # works, stadiums, the zoo, the islands in the Danube. A church every
    # two hundred metres would bury them, so the ranks put the big civic
    # features above the parish ones.
    if t.get("place") in PLACE_RANK:
        kind, rank = "place", PLACE_RANK[t["place"]]
    elif t.get("tourism") in ("zoo", "theme_park"):
        kind, rank = "landmark", 1
    elif t.get("leisure") == "stadium" or t.get("building") == "stadium":
        kind, rank = "landmark", 1
    elif t.get("historic") in ("castle", "ruins", "monument"):
        kind, rank = "landmark", 2
    elif t.get("historic") == "memorial":
        # A plaque or a bust carrying only a person's name tells you nothing
        # about where you are, and there are hundreds of them.
        kind, rank = "landmark", 4
    elif t.get("leisure") in ("park", "marina", "sports_centre"):
        kind, rank = "public", 2
    elif t.get("natural") == "water":
        kind, rank = "public", 3
    elif t.get("amenity") in ("museum", "theatre", "university"):
        kind, rank = "public", 3
    elif t.get("man_made") == "works" or t.get("landuse") == "industrial" \
            or t.get("building") == "industrial":
        kind, rank = "public", 3
    elif t.get("building") == "train_station" or t.get("landuse") == "railway":
        kind, rank = "landmark", 2
    elif t.get("amenity") == "place_of_worship":
        kind, rank = "church", 4
    elif t.get("amenity") in ("townhall", "hospital", "school"):
        kind, rank = "public", 4
    else:
        continue
    # ---- what actually deserves a label
    # A train window shows you a city, not a business directory. Anything that
    # is a company rather than a place goes, and so does a name that is only a
    # person — a plaque reading "Podmaniczky Frigyes" tells you nothing about
    # where you are. What is left gets a word saying what it is, where the
    # name alone does not: "Hősök tere" is self-describing, "Vajdahunyad" is
    # not.
    nm = t["name"].strip()
    low = nm.lower()
    if any(w in low for w in (
            " kft", " kft.", " bt.", " zrt", " nyrt", " gmbh", " s.r.o",
            "autómosó", "autószerviz", "kazánház", "nyelvstúdió", "nyelviskola",
            "irodaház", "üzletház", "raktár", "telephely", "szerviz",
            "fodrász", "kozmetik", "szolárium", "pizzéria", "büfé", "bisztró",
            "trafik", "dohánybolt", "gyógyszertár", "webshop", "logisztik",
            "gyülekez", "egyházközs", "missziό", "alapítvány",
            "fitness", "fitnesz", "konditerem", "edzőterem", "crossfit", "gym",
            "szalon", "patika", "étterem", "kávézó", "panzió", "hotel", "motel",
            "apartman", "ügyvédi", "fogászat", "orvosi rendelő", "rendelő",
            "bankfiók", "atm", "drogéria", "dohányzás")):
        continue
    if len(nm) < 3 or len(nm) > 46:
        continue
    # a bare personal name, with no word saying what it is
    WORDS = ("tér", "utca", "út", "körút", "sor", "park", "híd", "sziget",
             "hegy", "domb", "templom", "kápolna", "múzeum", "iskola",
             "pályaudvar", "állomás", "kastély", "vár", "torony", "liget",
             "kert", "stadion", "aréna", "csarnok", "gyár", "erőmű", "tó",
             "patak", "part", "dűlő", "köz", "fasor", "rakpart", "sétány",
             "emlékmű", "szobor", "kapu", "bánya", "fürdő", "uszoda",
             "kápoln", "templo", "vasút", "gyűjtem", "palota", "ház")
    if not any(w in low for w in WORDS):
        if kind in ("landmark", "public") and rank >= 3:
            continue
        # two or three capitalised words and nothing else is a person
        parts = nm.replace("-", " ").split()
        if (kind == "landmark" and len(parts) <= 3
                and all(w[:1].isupper() for w in parts if w)):
            continue
    label = nm
    # match the stem, not the nominative: "kápolnája" does not contain
    # "kápolna" — the seventh letter is á
    if kind == "church" and not any(w in low for w in
            ("templo", "kápoln", "zsinagóg", "bazilik", "székesegyház",
             "monostor", "apátság", "mecset")):
        label = nm + " templom"
    if t.get("tourism") == "zoo" and "állatkert" not in low:
        label = nm + " állatkert"
    if t.get("leisure") == "park" and not any(
            w in low for w in ("park", "liget", "kert")):
        label = nm + " park"
    # only a real station is "… állomás": Nyugati's "Hidegváró" (its old
    # waiting hall, mapped as building=train_station) became "Hidegváró
    # állomás", a station that does not exist
    if t.get("building") == "train_station" and "pályaudvar" not in low \
            and "állomás" not in low and len(nm.split()) == 1 and nm[:1].isupper() \
            and not t.get("source:name") and nm not in ("Hidegváró", "Váróterem", "Pénztár"):
        label = nm + " állomás"

    route["places"].append({
        "name": label, "kind": kind, "rank": rank,
        "xy": [round(v, 1) for v in xy(lat, lon)],
        "h": round(height_at(min(max(DOWN_CH.snap(lat, lon)[0], 0),
                                 t_down["length_m"] - 1)), 1),
    })
route["places"].sort(key=lambda p: p["rank"])
suffix = f"_{LINE}" if LINE != "line70" else ""
out_name = f"web/data/route{suffix}.json"
json.dump(route, open(out_name, "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
import os
print(f"track_down {len(down)} pts, up {len(up)}, stops {len(route['stops'])}, "
      f"signals {len(route['signals'])}, peaks {len(route['peaks'])}, "
      f"limits {len(lim)} changes")
print(f"official km drift fit: a={a:.1f} m, b={b:.3f} m/km")
if len(down) > 0:
    print(f"  Start measured {down[0][3]} → official {official_km(down[0][3] * 1000):.3f}")
    print(f"  End measured {down[-1][3]} → official {official_km(down[-1][3] * 1000):.3f}")
print(f"wrote {out_name} ({os.path.getsize(out_name)/1e6:.2f} MB)")
