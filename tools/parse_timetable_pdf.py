#!/usr/bin/env python3
"""Read a MÁV printed line timetable (PDF, pages set sideways) into services.

    python3 tools/parse_timetable_pdf.py data/raw/menetrend/line2_munkanap.pdf line2

The pages are rotated: a station is a column of text at one x, a train is a
band of y. Each train's column starts with its number (x ~ 53); each time is
two tokens in that band on the station's x, hour then minute (the minute has
the smaller y, the text runs bottom to top). A station printed twice in a row
is arrival then departure. Writes web/data/timetable_<line>.json in the format
bake_timetable.py writes (and keeps the generated one as *_generated.json).
Needs PyMuPDF (fitz).
"""
import json, re, sys, os
import fitz

pdf, LINE = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "line2"
route = json.load(open(f"web/data/route_{LINE}.json", encoding="utf-8"))
stops = {s["name"]: s["km"] for s in route["stops"]}
END_KM = max(stops.values())

def norm(n):
    return n.replace(".", "").strip()

services = []
doc = fitz.open(pdf)
for pno, page in enumerate(doc):
    ws = page.get_text("words")
    # train columns: numbers at x ~ 50-57
    heads = [w for w in ws if 50 <= w[0] <= 57 and re.fullmatch(r"\d{3,5}", w[4])]
    if not heads:
        continue
    cols = sorted([((w[1] + w[3]) / 2, w[4]) for w in heads], key=lambda c: -c[0])
    # station rows: names right of x 90, printed far down the page (y > 395)
    rows = []
    for w in sorted(ws, key=lambda w: w[0]):
        if w[0] < 88 or w[1] < 395 or not w[4][:1].isalpha():
            continue
        nm = norm(w[4])
        if nm in stops or nm in ("Rákosrendező", "Vasútmúzeum", "Rákos", "Újpalota", "Pázmáneum"):
            rows.append(((w[0] + w[2]) / 2, nm))
    if len(rows) < 5:
        continue
    order = [r[1] for r in rows]
    # direction from the order of the names down the page
    known = [n for n in order if n in stops]
    direction = 1 if stops[known[0]] < stops[known[-1]] else -1
    nums = [w for w in ws if re.fullmatch(r"\d{1,2}", w[4]) and w[1] < 395 and w[0] >= 88]
    for cy, num in cols:
        seq = []
        for i, (rx, nm) in enumerate(rows):
            tok = [w for w in nums if abs((w[0] + w[2]) / 2 - rx) < 2.6 and cy - 12 <= (w[1] + w[3]) / 2 <= cy + 9]
            if len(tok) < 2:
                continue
            tok.sort(key=lambda w: -(w[1] + w[3]) / 2)
            hh, mm = int(tok[0][4]), int(tok[1][4])
            if hh > 26 or mm > 59:
                continue
            arr_row = i + 1 < len(rows) and rows[i + 1][1] == nm
            seq.append((nm, hh * 3600 + mm * 60, "arr" if arr_row else "dep"))
        if len(seq) < 3:
            continue
        # merge arrival and departure rows of the same station
        calls, prev = [], None
        for nm, t, kind in seq:
            if nm not in stops:
                continue
            if calls and calls[-1][0] == nm:
                calls[-1][2] = t
            else:
                calls.append([nm, t, t])
        for c in calls:
            if c[1] == c[2]:
                c[1] = c[2] - 30        # arrival half a minute before departure
        if len(calls) < 2:
            continue
        services.append({"num": num, "dir": direction, "calls": calls})

# de-duplicate (a train can appear on two pages)
seen, out = set(), []
for s in services:
    key = (s["num"], s["calls"][0][0], s["calls"][0][2])
    if key in seen:
        continue
    seen.add(key)
    # a stopping train calls at every station between its ends; a fast one
    # (Z72) runs through some
    k0, k1 = sorted((stops[s["calls"][0][0]], stops[s["calls"][-1][0]]))
    between = [n for n, k in stops.items() if k0 - 0.01 <= k <= k1 + 0.01]
    name = "S72" if len(s["calls"]) >= len(between) - 1 else "Z72"
    first = s["calls"][0]
    calls = [[stops[first[0]], first[2] - 60, first[2] - 60, 0]]
    for i, (nm, a, d) in enumerate(s["calls"]):
        calls.append([stops[nm], a if i else d, d, 1])
    out.append({"id": f"{name}-{s['num']}", "name": name, "num": s["num"], "dir": s["dir"],
                "cars": 3 if name == "Z72" else 4, "stock": "FLIRT",
                "enter": stops[first[0]], "enter_s": first[2] - 60, "calls": calls})

# Freight (Wikipedia, "Teherforgalom"): regular only between Esztergom and
# Esztergom-Kertváros, rare beyond; M44 shunters on the local trips, ÖBB 1116
# on the Budapest-bound ones. Times are invented to fit between passenger
# trains; the timetable PDF has no freight in it.
if LINE == "line2" and "Esztergom" in stops and "Esztergom-Kertváros" in stops:
    kE, kK = stops["Esztergom"], stops["Esztergom-Kertváros"]
    for i, (t0, d) in enumerate(((9 * 3600 + 35 * 60, -1), (11 * 3600 + 5 * 60, 1),
                                 (14 * 3600 + 50 * 60, -1), (16 * 3600 + 20 * 60, 1))):
        a, b = (kE, kK) if d < 0 else (kK, kE)
        out.append({"id": f"TEHER-{8800 + i}", "name": "tehervonat", "dir": d, "cars": 9,
                    "stock": "FREIGHT", "loco": "M44", "enter": a, "enter_s": t0,
                    "calls": [[a, t0, t0, 0], [b, t0 + 900, t0 + 960, 1]]})
    t0 = 21 * 3600 + 10 * 60
    out.append({"id": "TEHER-47790", "name": "tehervonat", "dir": -1, "cars": 18,
                "stock": "FREIGHT", "loco": "1116", "enter": kE, "enter_s": t0,
                "calls": [[kE, t0, t0, 0], [0.5, t0 + 4800, t0 + 4860, 1]]})
out.sort(key=lambda s: s["enter_s"])
dst = f"web/data/timetable_{LINE}.json"
if os.path.exists(dst) and not os.path.exists(dst.replace(".json", "_generated.json")):
    os.replace(dst, dst.replace(".json", "_generated.json"))
json.dump({"source": os.path.basename(pdf), "services": out}, open(dst, "w", encoding="utf-8"))
print(f"{len(out)} services from {doc.page_count} pages")
for s in out[:6]:
    print(s["id"], s["dir"], len(s["calls"]) - 1, "calls",
          f"{s['calls'][1][2] // 3600:02d}:{s['calls'][1][2] % 3600 // 60:02d}")
