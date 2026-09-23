#!/usr/bin/env python3
import json
import math

data = json.load(open("/tmp/landmarks_query.json"))
nodes = {n["id"]: (n["lat"], n["lon"]) for n in data.get("elements", []) if n.get("type") == "node"}
for e in data.get("elements", []):
    t = e.get("tags") or {}
    if "name" in t:
        c = e.get("center") or ({"lat": e["lat"], "lon": e["lon"]} if "lat" in e else {})
        nodes_list = [nodes[nid] for nid in e.get("nodes", []) if nid in nodes]
        bearing = 0.0
        if len(nodes_list) >= 2:
            dlat = nodes_list[-1][0] - nodes_list[0][0]
            dlon = (nodes_list[-1][1] - nodes_list[0][1]) * math.cos(math.radians(nodes_list[0][0]))
            bearing = math.atan2(dlat, dlon)
        name = t.get("name")
        lat = c.get("lat")
        lon = c.get("lon")
        print(f"NAME: {name} | LAT: {lat} | LON: {lon} | ANGLE: {bearing:.3f} rad ({math.degrees(bearing):.1f} deg)")
