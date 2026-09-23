#!/usr/bin/env python3
import json
import math

# Load existing runtimes
RT = json.load(open("data/runtimes.json", encoding="utf-8"))

def make_runtime(line_name, speed_kmh=60):
    # Find stations on this line
    try:
        st = json.load(open("data/stations.json", encoding="utf-8"))
    except FileNotFoundError:
        return []
    
    stops = st.get(f"on_{line_name}", [])
    if not stops:
        return []
        
    # Sort stops by km (if km exists)
    stops = sorted(stops, key=lambda s: s.get("km", 0))
    
    # Build schedule
    sched = []
    current_time = 0.0
    last_km = 0.0
    for s in stops:
        km = s.get("km", 0)
        dist = abs(km - last_km)
        
        # Add time based on distance (time = dist / speed) + dwell
        if dist > 0:
            time_secs = (dist / (speed_kmh / 3.6)) * 1000
            current_time += time_secs + 60.0 # 60 sec dwell
            
        sched.append([s["name"], round(current_time, 1)])
        last_km = km
        
    return sched

# Mock S72 and S71
s72 = make_runtime("line2", speed_kmh=55)
z72 = make_runtime("line2", speed_kmh=75) # faster
s71 = make_runtime("line71", speed_kmh=50)

if s72: RT["S72"] = s72
if z72: RT["Z72"] = z72
if s71: RT["S71"] = s71

# Write back
with open("data/runtimes.json", "w", encoding="utf-8") as f:
    json.dump(RT, f)

print("Mocked runtimes for S72, Z72, S71 added to data/runtimes.json")
