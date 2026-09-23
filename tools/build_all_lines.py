#!/usr/bin/env python3
import subprocess
import os

lines = ["line71", "line2"]

for line in lines:
    print(f"\n=======================")
    print(f"Building {line}...")
    print(f"=======================")
    
    env = os.environ.copy()
    env["LINE"] = line
    
    # Bake route
    subprocess.run(["python3", "tools/bake_route.py", line], env=env, check=True)
    
    # Bake world
    subprocess.run(["python3", "tools/bake_world.py", line], env=env, check=True)
    
    # Bake timetable
    subprocess.run(["python3", "tools/bake_timetable.py", line], env=env, check=True)

print("\nBuilding simulator JS bundle...")
subprocess.run(["python3", "tools/build_sim.py"], check=True)
print("Done!")
