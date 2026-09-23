import urllib.request
import json
import sys

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Bounding box for Piliscsaba and Line 2 area roughly (Budapest to Esztergom)
QUERY = """
[out:json][timeout:25];
(
  // Tunnels
  way["railway"="rail"]["tunnel"="yes"](47.53, 18.73, 47.74, 19.06);
  // Bridges / Viaducts
  way["railway"="rail"]["bridge"="yes"](47.53, 18.73, 47.74, 19.06);
  // Any historical/notable things near Piliscsaba
  node["historic"](47.60, 18.75, 47.66, 18.85);
  way["historic"](47.60, 18.75, 47.66, 18.85);
);
out body;
>;
out skel qt;
"""

print("Querying Overpass API for Piliscsaba / Line 2 landmarks...")
req = urllib.request.Request(OVERPASS_URL, data=QUERY.encode('utf-8'))
try:
    with urllib.request.urlopen(req) as response:
        data = json.load(response)
        with open("data/raw/pilis_landmarks.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Saved {len(data.get('elements', []))} elements to data/raw/pilis_landmarks.json")
except Exception as e:
    print(f"Error querying overpass: {e}")
