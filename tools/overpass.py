#!/usr/bin/env python3
"""Fetch an Overpass query to a JSON file, retrying across public mirrors.

Uses curl rather than urllib: this Python install has no CA bundle.
"""
import subprocess, sys, time, json, os

MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
UA = "szob-fele/0.1 (MAV line 70 simulator, personal project)"

def fetch(query, out, tries=3):
    tmp = out + ".part"
    last = "no attempt"
    for attempt in range(tries):
        for url in MIRRORS:
            host = url.split("/")[2]
            r = subprocess.run(
                ["curl", "-sS", "-m", "300", "-A", UA, "-o", tmp,
                 url, "--data-urlencode", "data@-"],
                input=query, text=True, capture_output=True,
            )
            if r.returncode == 0 and os.path.exists(tmp):
                head = open(tmp, "rb").read(1).lstrip()
                if head == b"{":
                    payload = json.load(open(tmp, encoding="utf-8"))
                    os.replace(tmp, out)
                    size = os.path.getsize(out) / 1e6
                    print(f"ok  {host:26s} {size:6.2f} MB  "
                          f"{len(payload.get('elements', []))} elements -> {out}")
                    return payload
                last = f"{host}: server returned non-JSON (busy or query error)"
            else:
                last = f"{host}: curl {r.returncode} {r.stderr.strip()[:90]}"
            print(f"    retry: {last}", file=sys.stderr)
            time.sleep(2)
        time.sleep(10 * (attempt + 1))
    raise SystemExit(f"all mirrors failed: {last}")

if __name__ == "__main__":
    fetch(open(sys.argv[1], encoding="utf-8").read(), sys.argv[2])
