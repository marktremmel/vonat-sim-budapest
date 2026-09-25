#!/usr/bin/env python3
"""Budapest's municipal trees and park planting (BP Fatár) into the city tiles.

    python3 tools/fetch_bpfatar.py      # data/raw/bpfatar/ (310,914 trees + park objects)
    python3 tools/bake_trees.py         # adds "tr" and "pk" to web/data/city/t_*.json

Data: the BP Fatár tree and park cadastre of FŐKERT Nonprofit Zrt. /
Budapesti Közművek Zrt., served by Info-Garden Kft. (credited in README).

Every tree is a point with its species. Heights and crowns are known per
tree only through one request each, so the fetch sampled a few trees of some
species (dims.json) and was then refused by the server. A tree gets:
  - its species' sampled measurements, one picked by the tree's id, where
    the species was sampled (39 species);
  - otherwise its genus' typical size in a Budapest street or park (GENUS,
    judged from those samples: city trees are young, a median of 6–9 m),
    spread ±55% by the id so a row of limes is not a row of clones.
The species decides the FORM, one of the vegetation shader's 16 (VEG_FS),
plus 16 for a flower bed. Upright cultivars ('Fastigiata', 'Columnare'…)
become columns, weeping ones ('Pendula') willows, mop-heads low and round.

Per tile, coordinates in half metres from the tile's corner (line 70's frame):
  tr  [x2, y2, code, …]   code = form | h2 << 5 | c2 << 11, h2 and c2 the
                           height and crown in half metres (max 31.5 m)
  pk  [x2, y2, kind, …]   0 bench, 1 bin, 2 statue, 3 fountain
Trees outside the city box are left out (the tiles only cover the box).
"""
import glob, json, math, os, re, sys, zlib
sys.path.insert(0, "tools")
from geo import frame

W = json.load(open("web/data/world.json", encoding="utf-8"))["near"]
MLAT, MLON = frame(W.get("frame_lat", (W["south"] + W["north"]) / 2))
S, WEST, N, E = 47.39, 18.93, 47.58, 19.25
DLAT, DLON = 0.009, 0.0133
RAW = "data/raw/bpfatar"

def xy(lat, lon): return ((lon - W["west"]) * MLON, (lat - W["south"]) * MLAT)
def tile_of(lat, lon): return int((lat - S) // DLAT), int((lon - WEST) // DLON)
def origin(i, j):
    return (WEST + j * DLON - W["west"]) * MLON, (S + i * DLAT - W["south"]) * MLAT

# genus -> (form, typical height m). Forms (VEG_FS): 0 beech-dome, 1 oak-broad,
# 2 hornbeam-oval, 4 locust-airy, 5 pine, 6 poplar-column, 7 willow-weeping,
# 8 alder-narrow, 9 chestnut-round, 10 bush, 12 fruit-low-round (blossom),
# 13 walnut-spreading, 14 spruce/thuja-cone, 15 birch
GENUS = {
    "Acer": (1, 10), "Fraxinus": (4, 11), "Tilia": (0, 12), "Robinia": (4, 11), "Celtis": (1, 11),
    "Prunus": (12, 6), "Styphnolobium": (13, 9), "Sophora": (13, 9), "Populus": (1, 16),    # most Budapest poplars are broad (alba, × canadensis);
    # Lombardy and fastigiate cultivars become columns by the cultivar rule, below

    "Koelreuteria": (9, 8), "Platanus": (13, 19), "Aesculus": (9, 13), "Juglans": (13, 9),
    "Thuja": (14, 5), "Gleditsia": (4, 12), "Ulmus": (1, 12), "Pinus": (5, 11), "Ailanthus": (4, 11),
    "Catalpa": (9, 8), "Corylus": (2, 10), "Pyrus": (12, 7), "Quercus": (1, 13), "Morus": (13, 10),
    "Betula": (15, 12), "Picea": (14, 9), "Crataegus": (12, 5), "Sorbus": (12, 6), "Malus": (12, 5),
    "Taxus": (14, 4), "Carpinus": (2, 9), "Elaeagnus": (7, 5), "Ginkgo": (8, 9), "Salix": (7, 9),
    "Sambucus": (10, 4), "Chamaecyparis": (14, 6), "Cornus": (10, 4), "Juniperus": (14, 4),
    "Alnus": (8, 10), "Abies": (14, 8), "Rhus": (10, 4), "Broussonetia": (13, 7), "Cercis": (12, 6),
    "Syringa": (10, 3.5), "Tamarix": (7, 4), "Paulownia": (9, 10), "Fagus": (0, 16), "Castanea": (9, 12),
    "Larix": (5, 14), "Cedrus": (14, 12), "Magnolia": (12, 6), "Liquidambar": (1, 12),
    "Liriodendron": (0, 13), "Buxus": (10, 2), "Ostrya": (2, 8), "Euonymus": (10, 4),
    "Maclura": (1, 9), "Tetradium": (9, 8), "Taxodium": (5, 12), "Metasequoia": (5, 14),
    "Pterocarya": (13, 12), "Zelkova": (1, 11), "Laburnum": (12, 5), "Amelanchier": (12, 5),
    "Hibiscus": (10, 2.5), "Ligustrum": (10, 3), "Cotinus": (10, 3.5), "Pseudotsuga": (14, 14),
    "Sequoiadendron": (14, 15), "Gymnocladus": (4, 10), "Phellodendron": (9, 9),
}
CROWN = {0: 0.62, 1: 0.72, 2: 0.55, 4: 0.62, 5: 0.40, 6: 0.28, 7: 0.85, 8: 0.40, 9: 0.78,
         10: 1.05, 12: 0.92, 13: 0.88, 14: 0.38, 15: 0.46, 16: 1.0}
PARK_TREE = {  # park kind -> (form, height, crown, how many round the point, spread m)
    "000000600": (10, 2.8, 2.6, 1, 0), "000000700": (10, 2.2, 2.4, 3, 2.2), "100000700": (10, 2.2, 2.4, 3, 2.2),
    "000000800": (10, 1.5, 1.8, 4, 2.6), "000000900": (10, 0.7, 2.2, 2, 1.4),
    "000001100": (16, 0.45, 3.0, 1, 0), "100001100": (16, 0.45, 3.0, 1, 0),
    "000001200": (16, 0.6, 3.2, 1, 0), "100001200": (16, 0.6, 3.2, 1, 0),
    "000035800": (16, 0.8, 2.4, 1, 0), "000035900": (16, 0.9, 1.2, 1, 0), "000001700": (16, 2.4, 1.4, 1, 0),
    "000070300": (16, 0.5, 6.0, 2, 3.0),
}
PARK_MESH = {"000008500": 0, "000012000": 1, "000011900": 1, "000001900": 2, "000002700": 3}

def h01(s, k=0):
    return (zlib.crc32(f"{s}:{k}".encode()) & 0xFFFFFF) / 0xFFFFFF

cats = {c["id"]: c for c in json.load(open(f"{RAW}/tree_categories.json", encoding="utf-8"))}
dims = json.load(open(f"{RAW}/dims.json")) if os.path.exists(f"{RAW}/dims.json") else {}
dims = {k: [d for d in v if d and d[0]] for k, v in dims.items()}

def form_of(latin):
    la = latin or ""
    g = la.split()[0] if la else ""
    g = g.strip("×x ") or (la.split()[1] if len(la.split()) > 1 else "")
    form, H = GENUS.get(g, (1, 8))
    # the cultivar only ('Fastigiata', or "f. pendula"): "Betula pendula" is
    # the silver birch, not a weeping one
    cv = " ".join(re.findall(r"'([^']*)'|\b(?:f|var)\. (\w+)", la) and
                  [a or b for a, b in re.findall(r"'([^']*)'|\b(?:f|var)\. (\w+)", la)]).lower()
    if re.search(r"fastigiat|columnar|pyramidal|erect|stricta|obelisk|sentry", cv) and form not in (5, 14):
        form = 6
    elif form == 1 and g == "Populus" and re.search(r"italica|nigra.*pyr|bolleana", la.lower()):
        form = 6                                      # Lombardy / Bolle's poplar, named in the species
    elif "pendul" in cv or "tortuos" in cv:
        form = 7
    elif re.search(r"globos|umbracul|nana|compact|mop", cv):
        form, H = 12, H * 0.5
    return form, H

tiles = {}
def T(k):
    return tiles.setdefault(k, {"tr": [], "pk": []})

def put_tree(lat, lon, form, h, c):
    if not (S <= lat < N and WEST <= lon < E): return False
    k = tile_of(lat, lon); ox, oy = origin(*k); x, y = xy(lat, lon)
    h2 = max(1, min(63, round(h * 2))); c2 = max(1, min(63, round(c * 2)))
    T(k)["tr"] += [round((x - ox) * 2), round((y - oy) * 2), form | h2 << 5 | c2 << 11]
    return True

n_tree = n_in = 0
forms = {}
for f in glob.glob(f"{RAW}/tree/*.json"):
    cid = os.path.basename(f)[:-5]
    c = cats.get(cid, {})
    form, H = form_of(c.get("latin"))
    samp = dims.get(cid) or []
    for t in json.load(open(f, encoding="utf-8")):
        n_tree += 1
        sid = t.get("supplyId", "")
        if samp:
            d = samp[int(h01(sid) * len(samp)) % len(samp)]
            h = d[0] * (0.85 + 0.3 * h01(sid, 1))
            cr = d[1] if d[1] else h * CROWN.get(form, 0.6)
        else:
            h = H * (0.45 + 1.1 * h01(sid, 1))
            cr = h * CROWN.get(form, 0.6) * (0.85 + 0.3 * h01(sid, 2))
        if put_tree(t["lat"], t["lon"], form, h, cr):
            n_in += 1; forms[form] = forms.get(form, 0) + 1

n_park = 0
for cid, (form, h, cr, cnt, spread) in PARK_TREE.items():
    f = f"{RAW}/park/{cid}.json"
    if not os.path.exists(f): continue
    for t in json.load(open(f, encoding="utf-8")):
        sid = t.get("supplyId", "")
        a0 = h01(sid, 3) * math.tau
        for q in range(cnt):
            dx = math.cos(a0 + q * 2.1) * spread * (0.4 + 0.6 * h01(sid, 10 + q))
            dy = math.sin(a0 + q * 2.1) * spread * (0.4 + 0.6 * h01(sid, 20 + q))
            s = 0.7 + 0.6 * h01(sid, 30 + q)
            if put_tree(t["lat"] + dy / MLAT, t["lon"] + dx / MLON, form, h * s, cr * s):
                n_park += 1
n_mesh = 0
for cid, kind in PARK_MESH.items():
    f = f"{RAW}/park/{cid}.json"
    if not os.path.exists(f): continue
    for t in json.load(open(f, encoding="utf-8")):
        lat, lon = t["lat"], t["lon"]
        if not (S <= lat < N and WEST <= lon < E): continue
        k = tile_of(lat, lon); ox, oy = origin(*k); x, y = xy(lat, lon)
        T(k)["pk"] += [round((x - ox) * 2), round((y - oy) * 2), kind]
        n_mesh += 1

merged = 0
for (i, j), v in tiles.items():
    f = f"web/data/city/t_{i}_{j}.json"
    if not os.path.exists(f): continue
    body = json.load(open(f, encoding="utf-8"))
    body["tr"], body["pk"] = v["tr"], v["pk"]
    json.dump(body, open(f, "w"), separators=(",", ":"))
    merged += 1
print(f"trees: {n_in:,} of {n_tree:,} inside the city box; park planting {n_park:,}; "
      f"benches/bins/statues/fountains {n_mesh:,}; {merged} tiles")
print("forms:", dict(sorted(forms.items())))
