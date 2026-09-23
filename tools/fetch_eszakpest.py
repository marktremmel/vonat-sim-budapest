#!/usr/bin/env python3
"""
Fetch OSM buildings for Northern Budapest (District IV Újpest, District XV Rákospalota,
Angyalföld, Káposztásmegyer, Dunakeszi south) from Overpass API.
"""
import urllib.request
import urllib.parse
import json
import os
import sys

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
]

# Bounding box for Northern Budapest / Észak-Pest:
# south: 47.53, west: 19.04, north: 47.62, east: 19.16
QUERY = """
[out:json][timeout:60];
(
  way["building"](47.53, 19.04, 47.62, 19.16);
  relation["building"](47.53, 19.04, 47.62, 19.16);
);
out body;
>;
out skel qt;
"""

def main():
    os.makedirs("data/raw", exist_ok=True)
    out_path = "data/raw/eszakpest_osm.json"
    
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    for url in OVERPASS_URLS:
        print(f"Fetching Észak-Pest buildings from {url}...")
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"User-Agent": "SzobFeleSimulator/1.0 (train-sim-research)"}
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                content = resp.read()
                parsed = json.loads(content)
                elements = parsed.get("elements", [])
                print(f"Successfully fetched {len(elements)} elements for Észak-Pest!")
                with open(out_path, "wb") as f:
                    f.write(content)
                print(f"Saved to {out_path} ({len(content) / 1024 / 1024:.2f} MB)")
                return
        except Exception as e:
            print(f"Failed with {url}: {e}, trying next...")

if __name__ == "__main__":
    main()
