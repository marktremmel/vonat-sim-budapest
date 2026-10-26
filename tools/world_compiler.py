#!/usr/bin/env python3
"""World Compiler for Dunakanyar & Budapest Simulation.

Compiles an entire Geofabrik OSM extract (.osm.pbf) into clean, unified
simulation context using rules.json. Replaces 128 fragile, timing-out
Overpass scripts with a single deterministic, offline compilation pass.

Usage:
    python3 tools/world_compiler.py --help
    python3 tools/world_compiler.py --rules tools/rules.json --pbf hungary-latest.osm.pbf
    python3 tools/world_compiler.py --download-extract   # fetches Geofabrik extract
"""
import argparse
import json
import os
import sys
import urllib.request
import time

try:
    import osmium
    HAS_OSMIUM = True
except ImportError:
    HAS_OSMIUM = False

# Default regional simulation bounding box (Danube Bend, Budapest, S21 rural corridor)
# South: 47.0 (Lajosmizse / Kecskemét north)
# North: 47.95 (Szob / Börzsöny / Slovak border)
# West: 18.65 (Esztergom / Pilis / Dorog)
# East: 19.85 (Alföld / Cegléd / Dabas)
DEFAULT_BBOX = (18.65, 47.00, 19.85, 47.95)
GEOFABRIK_URL = "https://download.geofabrik.de/europe/hungary-latest.osm.pbf"


class SimulationWorldHandler(osmium.SimpleHandler if HAS_OSMIUM else object):
    def __init__(self, rules, bbox):
        if HAS_OSMIUM:
            super().__init__()
        self.rules = rules
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = bbox
        self.bld_classes = rules.get("buildings", {}).get("classes", {})
        self.default_levels = rules.get("buildings", {}).get("default_levels", {})
        self.level_h = rules.get("buildings", {}).get("level_height", 3.1)
        self.road_classes = rules.get("roads", {})
        self.rail_classes = rules.get("railways", {})
        self.prop_rules = rules.get("props", {})

        # Extracted data
        self.buildings = []
        self.roads = []
        self.rails = []
        self.props = []
        self.barriers = []

        self.node_count = 0
        self.way_count = 0
        self.rel_count = 0

    def in_bbox(self, lat, lon):
        return self.min_lat <= lat <= self.max_lat and self.min_lon <= lon <= self.max_lon

    def node(self, n):
        self.node_count += 1
        lat, lon = n.location.lat, n.location.lon
        if not self.in_bbox(lat, lon):
            return

        # Check props (amenity=bench, waste_basket, etc.)
        for tag, val in n.tags:
            key_val = f"{tag}={val}"
            if key_val in self.prop_rules:
                rule = self.prop_rules[key_val]
                self.props.append({
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "kind": rule.get("kind"),
                    "model": rule.get("model")
                })
                break

    def way(self, w):
        self.way_count += 1
        tags = dict(w.tags)

        # Quick bbox check on nodes
        try:
            pts = [(n.lat, n.lon) for n in w.nodes if n.is_valid()]
        except Exception:
            return

        if not pts:
            return
        
        # Check if at least one node is in bbox
        if not any(self.in_bbox(lat, lon) for lat, lon in pts):
            return

        # 1. Buildings
        if "building" in tags:
            b_kind = tags.get("building")
            cls = self.bld_classes.get(b_kind, self.bld_classes.get(tags.get("amenity"), 1))
            levels = tags.get("building:levels")
            height = tags.get("height")
            h = None
            if height:
                try:
                    h = float(height.split()[0].replace(",", "."))
                except Exception:
                    pass
            if h is None and levels:
                try:
                    h = float(levels.split()[0].replace(",", ".")) * self.level_h
                except Exception:
                    pass
            if h is None:
                h = self.default_levels.get(b_kind, 2.5) * self.level_h

            self.buildings.append({
                "id": w.id,
                "cls": cls,
                "h": round(h, 1),
                "pts": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in pts],
                "tags": {k: tags[k] for k in ["name", "building:colour", "roof:colour", "roof:shape"] if k in tags}
            })
            return

        # 2. Railways
        if "railway" in tags:
            r_kind = tags.get("railway")
            if r_kind in self.rail_classes:
                info = self.rail_classes[r_kind]
                self.rails.append({
                    "id": w.id,
                    "cls": info["cls"],
                    "gauge": info.get("gauge", 1.435),
                    "pts": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in pts],
                    "bridge": tags.get("bridge") == "yes",
                    "tunnel": tags.get("tunnel") == "yes"
                })
                return

        # 3. Roads / Highways
        if "highway" in tags:
            h_kind = tags.get("highway")
            if h_kind in self.road_classes:
                info = self.road_classes[h_kind]
                lanes = tags.get("lanes")
                try:
                    l_count = int(lanes) if lanes else info["lanes"]
                except Exception:
                    l_count = info["lanes"]
                self.roads.append({
                    "id": w.id,
                    "cls": info["cls"],
                    "lanes": l_count,
                    "width": info["width"],
                    "bridge": tags.get("bridge") == "yes",
                    "tunnel": tags.get("tunnel") == "yes",
                    "oneway": tags.get("oneway") in ("yes", "1", "true"),
                    "pts": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in pts]
                })
                return

        # 4. Barriers (walls, fences)
        if "barrier" in tags:
            b_type = tags.get("barrier")
            key_val = f"barrier={b_type}"
            if key_val in self.prop_rules:
                rule = self.prop_rules[key_val]
                self.barriers.append({
                    "id": w.id,
                    "kind": rule.get("kind"),
                    "height": rule.get("height", 1.5),
                    "pts": [{"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in pts]
                })


def download_geofabrik_extract(dest_path):
    print(f"Downloading Geofabrik Hungary extract from {GEOFABRIK_URL}...")
    t0 = time.time()
    def reporthook(blocknum, blocksize, totalsize):
        read = blocknum * blocksize
        if totalsize > 0:
            pct = read * 100 / totalsize
            speed = read / (time.time() - t0 + 1e-5) / 1024 / 1024
            sys.stdout.write(f"\r  {read // (1024*1024)} MB / {totalsize // (1024*1024)} MB ({pct:.1f}%) — {speed:.1f} MB/s")
            sys.stdout.flush()
    urllib.request.urlretrieve(GEOFABRIK_URL, dest_path, reporthook)
    print(f"\nDone: {dest_path} ({os.path.getsize(dest_path) // (1024*1024)} MB)")


def main():
    parser = argparse.ArgumentParser(description="World Compiler for Dunakanyar & Budapest Simulation")
    parser.add_argument("--rules", default="tools/rules.json", help="Path to rules.json")
    parser.add_argument("--pbf", help="Input .osm.pbf file")
    parser.add_argument("--bbox", help="minlon,minlat,maxlon,maxlat", default=None)
    parser.add_argument("--out", default="web/data/compiled_world.json", help="Output JSON path")
    parser.add_argument("--download", action="store_true", help="Download Hungary extract from Geofabrik")
    args = parser.parse_args()

    if not HAS_OSMIUM:
        print("Error: pyosmium is required. Install with: pip3 install osmium", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.rules):
        print(f"Error: rules file {args.rules} not found", file=sys.stderr)
        sys.exit(1)

    rules = json.load(open(args.rules, "r", encoding="utf-8"))

    if args.download or (not args.pbf and not os.path.exists("hungary-latest.osm.pbf")):
        pbf_path = "hungary-latest.osm.pbf"
        if not os.path.exists(pbf_path):
            download_geofabrik_extract(pbf_path)
        args.pbf = pbf_path

    if not args.pbf or not os.path.exists(args.pbf):
        print(f"Error: PBF file {args.pbf} not found. Run with --download to fetch.", file=sys.stderr)
        sys.exit(1)

    bbox = DEFAULT_BBOX
    if args.bbox:
        bbox = tuple(map(float, args.bbox.split(",")))

    print(f"=== Compiling World with rules: {args.rules} ===")
    print(f"PBF input: {args.pbf} ({os.path.getsize(args.pbf) // (1024*1024)} MB)")
    print(f"BBox filter: lon [{bbox[0]}, {bbox[2]}], lat [{bbox[1]}, {bbox[3]}]")

    handler = SimulationWorldHandler(rules, bbox)
    t0 = time.time()
    print("Reading OSM entities and resolving node geometries with pyosmium flex_mem...")
    # apply_file with location store
    handler.apply_file(args.pbf, locations=True, idx="flex_mem")
    elapsed = time.time() - t0

    print(f"Compilation finished in {elapsed:.1f} s:")
    print(f"  Nodes processed: {handler.node_count:,}")
    print(f"  Ways processed:  {handler.way_count:,}")
    print(f"  Buildings extracted: {len(handler.buildings):,}")
    print(f"  Roads extracted:     {len(handler.roads):,}")
    print(f"  Rails extracted:     {len(handler.rails):,}")
    print(f"  Props extracted:     {len(handler.props):,}")
    print(f"  Barriers extracted:  {len(handler.barriers):,}")

    out_data = {
        "bbox": bbox,
        "rules_version": rules.get("version"),
        "compiled_at": time.strftime("%Y-%m-%d %H:%M:%SZ", time.gmtime()),
        "buildings": handler.buildings,
        "roads": handler.roads,
        "rails": handler.rails,
        "props": handler.props,
        "barriers": handler.barriers
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out_data, f, separators=(",", ":"))
    print(f"Wrote compiled world to {args.out} ({os.path.getsize(args.out) // (1024*1024)} MB)")


if __name__ == "__main__":
    main()
