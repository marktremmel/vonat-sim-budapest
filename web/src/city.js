// The Budapest city layer: 1 km tiles (tools/bake_city.py) fetched as the
// camera comes near and dropped when it leaves, so the whole city — the 8th
// and 9th districts, Keleti, Kelenföld, Budafok, Kispest — can be there
// without every line carrying all of it.
//
// A tile's coordinates are metres from its south-west corner in line 70's
// frame; each line has its own frame, so a tile is placed by its corner's
// latitude and longitude and scaled by the ratio of metres-per-degree.

/** Metres per degree of latitude and longitude, as tools/geo.py frame(). */
export function metresPerDegree(lat0) {
  const p = lat0 * Math.PI / 180;
  return [111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
          111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p)];
}

export class CityTiles {
  /**
   * @param index   web/data/city/index.json
   * @param near    the line's world.near (west, south, north)
   * @param build   (tile) => meshes, called once per loaded tile, with the
   *                tile already in the line's frame: {polys, parts, roads,
   *                roadIds, portals}
   * @param free    (meshes) => void, when a tile is dropped
   */
  constructor(index, near, build, free) {
    this.index = index; this.build = build; this.free = free;
    const [mlat, mlon] = metresPerDegree(near.frame_lat ?? (near.south + near.north) / 2);
    this.W = near; this.mlat = mlat; this.mlon = mlon;
    this.kx = mlon / index.mlon70; this.ky = mlat / index.mlat70;
    this.loaded = new Map();       // file -> {meshes, cx, cy}
    this.pending = new Map();      // file -> promise
    this.queue = [];               // fetched, waiting to be built (a few ms a frame)
    this.queued = new Set();
    this.tiles = index.tiles.map(t => {
      const x0 = (t.lon0 - near.west) * mlon, y0 = (t.lat0 - near.south) * mlat;
      return { ...t, x0, y0, cx: x0 + index.dlon * mlon * 0.5, cy: y0 + index.dlat * mlat * 0.5 };
    });
    this.R = 3200;                 // load within this of the camera
  }
  toLine(t, x, y) { return [t.x0 + x * this.kx, t.y0 + y * this.ky]; }

  /** Call every frame with the camera's (east, north). */
  update(x, y) {
    // start fetches for tiles in range, nearest first, three at a time
    const want = this.tiles
      .map(t => ({ t, d: Math.hypot(t.cx - x, t.cy - y) }))
      .filter(o => o.d < this.R)
      .sort((a, b) => a.d - b.d);
    for (const { t } of want) {
      if (this.loaded.has(t.file) || this.pending.has(t.file) || this.queued.has(t.file)) continue;
      if (this.pending.size >= 3) break;
      const p = fetch(`${window.DATA_BASE || "data/"}city/${t.file}`).then(r => r.ok ? r.json() : null)
        .then(body => { this.pending.delete(t.file); if (body) { this.queue.push({ t, body }); this.queued.add(t.file); } })
        .catch(() => this.pending.delete(t.file));
      this.pending.set(t.file, p);
    }
    // build fetched tiles, nearest first, for at most ~6 ms a frame, so
    // loading never stalls the picture for long
    this.queue.sort((a, b) => Math.hypot(a.t.cx - x, a.t.cy - y) - Math.hypot(b.t.cx - x, b.t.cy - y));
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 6) {
      const { t, body } = this.queue.shift();
      this.queued.delete(t.file);
      if (Math.hypot(t.cx - x, t.cy - y) < this.R + 600 && !this.loaded.has(t.file)) {
        const meshes = this.build(this.place(t, body));
        this.loaded.set(t.file, { meshes, cx: t.cx, cy: t.cy });
      }
    }
    // drop what is well out of range
    for (const [f, L] of this.loaded) {
      if (Math.hypot(L.cx - x, L.cy - y) > this.R + 1200) {
        this.free(L.meshes);
        this.loaded.delete(f);
      }
    }
  }

  /** The tile's contents, moved into the line's frame. */
  place(t, body) {
    const tx = (x, y) => this.toLine(t, x, y);
    return { t, body, tx, kx: this.kx, ky: this.ky };
  }

  each(fn) { for (const L of this.loaded.values()) fn(L.meshes); }
}
