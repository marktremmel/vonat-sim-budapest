// Unified "One World" Geodesic Projection & Multi-Route Space
// Connects Line 70, Line 2, Line S21, and Budapest city into a single global metric frame.
// See docs/UNIFIED_ENGINE_SPEC.md.

export const UNIFIED_FRAME = {
  lat0: 47.5000,
  W0: 18.6000,
  S0: 46.9500,
  // WGS84 geodesic constants at lat0
  mlat: 111183.844,
  mlon: 75101.611
};

/** Convert geographic lat/lon to unified world coordinates (x East, z South/neg-North). */
export function geoToUnified(lat, lon, alt = 0) {
  const x = (lon - UNIFIED_FRAME.W0) * UNIFIED_FRAME.mlon;
  const y = alt;
  const z = -(lat - UNIFIED_FRAME.S0) * UNIFIED_FRAME.mlat;
  return [x, y, z];
}

/** Convert unified world coordinates (x, y, z) back to geographic lat/lon/alt. */
export function unifiedToGeo(x, y, z) {
  const lon = UNIFIED_FRAME.W0 + x / UNIFIED_FRAME.mlon;
  const lat = UNIFIED_FRAME.S0 + (-z) / UNIFIED_FRAME.mlat;
  return [lat, lon, y];
}

// Line local-to-unified coordinate translation offsets in metres
export const LINE_OFFSETS = {
  line70: { dx: 13025.81, dz: 56311.76 },
  line2:  { dx: 2483.11,  dz: 56311.66 },
  s21:    { dx: 28438.36, dz: 2458.00  }
};

/** Convert local line coordinates [x, y, z] to unified world coordinates. */
export function localToUnified(lineId, x, y, z) {
  const off = LINE_OFFSETS[lineId] || { dx: 0, dz: 0 };
  return [x + off.dx, y, z - off.dz];
}

/** Convert unified coordinates [ux, uy, uz] to line local coordinates. */
export function unifiedToLocal(lineId, ux, uy, uz) {
  const off = LINE_OFFSETS[lineId] || { dx: 0, dz: 0 };
  return [ux - off.dx, uy, uz + off.dz];
}

/**
 * MultiRoute container aggregating named railway and transit routes.
 */
export class MultiRoute {
  constructor() {
    this.routes = new Map();
  }

  register(lineId, routeInstance) {
    this.routes.set(lineId, routeInstance);
  }

  get(lineId) {
    return this.routes.get(lineId);
  }

  has(lineId) {
    return this.routes.has(lineId);
  }

  /**
   * Find the nearest route and chainage to a given unified world coordinate.
   */
  nearest(ux, uz) {
    let best = null;
    let minDist = Infinity;
    for (const [lineId, r] of this.routes.entries()) {
      const loc = unifiedToLocal(lineId, ux, 0, uz);
      // Sample track points
      if (!r || !r.at) continue;
      // Search nearest station or chainage
      const m = r.chainageAt ? r.chainageAt(loc[0], -loc[2]) : 0;
      const pt = r.at(m);
      const d = Math.hypot(loc[0] - pt[0], -loc[2] - pt[1]);
      if (d < minDist) {
        minDist = d;
        best = { lineId, m, dist: d };
      }
    }
    return best;
  }
}
