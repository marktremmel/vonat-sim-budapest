import urllib.request
import urllib.parse
import json
import os
import sys

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Bounding box covering Downtown Budapest:
# South: 47.485 (Gellert-hegy / Chain Bridge)
# North: 47.535 (Arpad hid / Margitsziget)
# West:  19.035 (Buda embankment)
# East:  19.085 (Keleti / Erzsebetvaros / Terezvaros)
QUERY = """
[out:json][timeout:90];
(
  way["building"](47.485,19.035,47.535,19.085);
  relation["building"](47.485,19.035,47.535,19.085);
  way["bridge"="yes"](47.485,19.035,47.535,19.085);
);
out body;
>;
out skel qt;
"""

def fetch():
    dest = "data/raw/downtown_osm.json"
    print(f"Fetching Downtown Budapest (Districts V, VI, VII, XIII, Margitsziget)...")
    data = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "VasutSim/1.0"})
    import ssl
    ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        content = resp.read()
    
    parsed = json.loads(content)
    elements = parsed.get("elements", [])
    print(f"Received {len(elements)} elements from Overpass.")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(content.decode("utf-8"))
    print(f"Saved to {dest} ({len(content) / (1024*1024):.2f} MB)")

if __name__ == "__main__":
    fetch()
