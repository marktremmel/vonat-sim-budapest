import json
import math
import sys

def lon2x(lon): return (lon - 19.04) * 75000.0
def lat2z(lat): return -(lat - 47.50) * 111000.0

try:
    with open("data/raw/pilis_landmarks.json", "r") as f:
        data = json.load(f)
except Exception:
    sys.exit(0)

nodes = {n["id"]: n for n in data.get("elements", []) if n.get("type") == "node"}
structs = []
landmarks = []

for e in data.get("elements", []):
    tags = e.get("tags", {})
    center = e.get("center")
    lat, lon = None, None
    if center:
        lat, lon = center["lat"], center["lon"]
    elif "lat" in e and "lon" in e:
        lat, lon = e["lat"], e["lon"]
    elif "nodes" in e and len(e["nodes"]) > 0:
        nid = e["nodes"][0]
        if nid in nodes:
            lat, lon = nodes[nid]["lat"], nodes[nid]["lon"]

    if not lat or not lon:
        continue

    # Identify tunnels or viaducts
    is_tunnel = tags.get("tunnel") == "yes"
    is_bridge = tags.get("bridge") == "yes"
    is_historic = "historic" in tags
    
    if not (is_tunnel or is_bridge or is_historic):
        continue

    # Determine angle
    bearing = 0.0
    nlist = [nodes[n] for n in e.get("nodes", []) if n in nodes]
    if len(nlist) >= 2:
        dlat = nlist[-1]["lat"] - nlist[0]["lat"]
        dlon = (nlist[-1]["lon"] - nlist[0]["lon"]) * math.cos(math.radians(nlist[0]["lat"]))
        bearing = math.atan2(dlat, dlon)

    # Basic shape mapping based on type
    x, z = lon2x(lon), lat2z(lat)
    
    landmarks.append({
        "id": "pilis_" + str(e["id"]),
        "type": "tunnel" if is_tunnel else "bridge" if is_bridge else "historic",
        "x": x, "y": z, "ang": bearing
    })

# Write to context_line2.json
with open("web/data/context_line2.json", "w") as f:
    json.dump({
        "buildings": [],
        "polys": [],
        "landmarks": landmarks,
        "structs": []
    }, f, indent=2)

print(f"Baked {len(landmarks)} landmarks for Line 2.")
