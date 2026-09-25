#!/usr/bin/env python3
"""Budapest's tree and park cadastre (BP Fatár, FŐKERT / Budapesti Közművek,
Info-Garden Kft.): every municipal tree with its species, and the park
objects we can draw (shrubs, hedges, flower beds, roses, benches, bins,
statues).

    python3 tools/fetch_bpfatar.py          # -> data/raw/bpfatar/*.json

The API was found by reading the web app (see ~/Downloads/BP Fatár_files/
extraction.md, written by an earlier Antigravity session):
  api/tree/supplies/categories                 574 species and cultivars
  api/tree/supplies/clusterdata?categoryId=…   every tree of one: lat, lon, ids
  api/tree/supplies/{store}/{id}               one tree: height, crown, trunk
  api/park/supplies/…                          the same for park objects

Dimensions exist only per tree, one request each; 310k requests would be
unkind to a municipal server. So only a SAMPLE per species is asked for
(up to SAMPLE trees, 3 at a time), and the bake gives every tree its
species' typical height and crown with a spread. Everything is cached: a
rerun asks only for what is missing.
"""
import json, os, ssl, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://infogardenweb.hu/bpfatar/api"
OUT = "data/raw/bpfatar"
SAMPLE = 6
CTX = ssl._create_unverified_context()     # their chain does not verify on this Mac
HDR = {"User-Agent": "Mozilla/5.0 (Dunakanyar Szimulator bake; github.com/marktremmel/vonat-sim-budapest)",
       "Accept": "application/json"}
PARK = {  # park category id -> our kind
    "000000600": "shrub", "000000700": "shrubs", "100000700": "shrubs", "000000800": "hedge",
    "000000900": "groundshrub", "000001000": "groundcover",
    "000001100": "flowers", "100001100": "flowers", "000001200": "perennials", "100001200": "perennials",
    "000035800": "roses", "000035900": "flowerbox", "000001700": "flowerpole", "000070300": "meadow",
    "000008500": "bench", "000012000": "bin", "000011900": "container", "000001900": "statue",
    "000002700": "fountain", "000029100": "lamp",
}

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=30, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if k == tries - 1:
                print("  failed", url, e, file=sys.stderr)
                return None
            time.sleep(1.0 + 2 * k)

def cached(name, url):
    f = f"{OUT}/{name}.json"
    if os.path.exists(f):
        return json.load(open(f, encoding="utf-8"))
    d = get(url)
    if d is not None:
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False)
    return d

def main():
    os.makedirs(OUT + "/tree", exist_ok=True)
    os.makedirs(OUT + "/park", exist_ok=True)
    cats = cached("tree_categories", f"{API}/tree/supplies/categories")
    print(f"{len(cats)} tree categories")

    def pts(c):
        return c, cached(f"tree/{c['id']}", f"{API}/tree/supplies/clusterdata?categoryId={c['id']}") or []
    with ThreadPoolExecutor(3) as ex:
        trees = list(ex.map(pts, cats))
    print(f"{sum(len(p) for _, p in trees):,} trees")

    for cid, kind in PARK.items():
        d = cached(f"park/{cid}", f"{API}/park/supplies/clusterdata?categoryId={cid}") or []
        print(f"  park {kind:12s} {len(d):7,}")

    # the dimension sample: evenly through each species' list
    dims = json.load(open(f"{OUT}/dims.json")) if os.path.exists(f"{OUT}/dims.json") else {}
    todo = []
    for c, p in trees:
        have = dims.setdefault(c["id"], [])
        if len(have) >= min(SAMPLE, len(p)):
            continue
        n = min(SAMPLE, len(p))
        for k in range(n):
            t = p[(k * len(p)) // n]
            todo.append((c["id"], t["storeNumber"], t["supplyId"]))
    print(f"asking for {len(todo)} trees' dimensions")

    def one(job):
        cid, store, sid = job
        d = get(f"{API}/tree/supplies/{store}/{sid}")
        return cid, d
    done = 0
    with ThreadPoolExecutor(3) as ex:
        for cid, d in ex.map(one, todo):
            done += 1
            if d:
                dims[cid].append([d.get("height"), d.get("crownDiameter"), d.get("trunkDiameter"), d.get("trunkHeight")])
            if done % 200 == 0:
                json.dump(dims, open(f"{OUT}/dims.json", "w"))
                print(f"  {done}/{len(todo)}")
    json.dump(dims, open(f"{OUT}/dims.json", "w"))
    print("done")

if __name__ == "__main__":
    main()
