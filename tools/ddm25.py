#!/usr/bin/env python3
"""Lechner's DDM25: Hungary's 25 m ground model, sampled onto our grids.

A bare-ground model (from the 1:10,000 contour maps), unlike the terrarium
tiles, which are a surface model with the trees and the city in them: line
70's wooded hills came out 4 m too high (half the forest more than 5 m off)
and inner Pest 3 m too high even after ground_filter.py.

Licence CC BY 4.0. Credit: "Based on geospatial data provided by Lechner
Knowledge Center, modified by …" (the menu's credits line carries it).

Download (372 MB, 292 GeoTIFF sheets, float32, EOV / EPSG:23700):
    mkdir -p data/raw/ddm25 && cd data/raw/ddm25
    curl -LO https://inspire.lechnerkozpont.hu/inspire/atom/data/ddm/out_25m.zip
    unzip -q out_25m.zip -d tiles

The GeoTIFF tie point is a pixel CORNER (PixelIsArea). The .tfw files carry
the same number but a world file means the pixel centre, so reading those
puts everything 12.5 m off. Checked against the terrarium tiles' hillsides:
corner convention leaves 1.5 m / 3.4 m, centre convention 10 m / 5 m.

Outside Hungary (the Slovak bank above Szob) there are no sheets: callers get
NaN there and fall back to the terrarium tiles.
"""
import glob, math, os
import numpy as np

ROOT = "data/raw/ddm25/tiles"
CELL = 25.0

def available(root=ROOT):
    return bool(glob.glob(os.path.join(root, "*.tif")))

# WGS84 -> HD72: the EPSG 3-parameter shift (HD72 = WGS84 - T), good to 1-2 m
_T = (52.17, -71.82, -14.9)
_A84, _F84 = 6378137.0, 1 / 298.257223563
_A67, _F67 = 6378160.0, 1 / 298.247167427     # GRS67, HD72's ellipsoid

def _to_ecef(lat, lon, a, f):
    e2 = 2 * f - f * f
    n = a / np.sqrt(1 - e2 * np.sin(lat) ** 2)
    return (n * np.cos(lat) * np.cos(lon), n * np.cos(lat) * np.sin(lon),
            n * (1 - e2) * np.sin(lat))

def _from_ecef(x, y, z, a, f):
    e2 = 2 * f - f * f
    p = np.hypot(x, y)
    lat = np.arctan2(z, p * (1 - e2))
    for _ in range(6):
        n = a / np.sqrt(1 - e2 * np.sin(lat) ** 2)
        lat = np.arctan2(z + e2 * n * np.sin(lat), p)
    return lat, np.arctan2(y, x)

# EOV is proj's "somerc" (oblique Mercator on the Gauss sphere) with these
_PHI0 = math.radians(47.14439372222222)
_LAM0 = math.radians(19.04857177777778)
_K0, _E0, _N0 = 0.99993, 650000.0, 200000.0
_es = 2 * _F67 - _F67 * _F67
_e = math.sqrt(_es)
_c = math.sqrt(1 + _es * math.cos(_PHI0) ** 4 / (1 - _es))
_sp0 = math.sin(_PHI0)
_sinp0 = _sp0 / _c
_phip0 = math.asin(_sinp0)
_cosp0 = math.cos(_phip0)
_K = (math.log(math.tan(math.pi / 4 + _phip0 / 2))
      - _c * (math.log(math.tan(math.pi / 4 + _PHI0 / 2))
              - _e / 2 * math.log((1 + _e * _sp0) / (1 - _e * _sp0))))
_kR = _K0 * math.sqrt(1 - _es) / (1 - _es * _sp0 * _sp0)

def to_eov(lat_deg, lon_deg):
    """WGS84 degrees (arrays) -> EOV easting, northing in metres."""
    lat = np.radians(np.asarray(lat_deg, float))
    lon = np.radians(np.asarray(lon_deg, float))
    x, y, z = _to_ecef(lat, lon, _A84, _F84)
    phi, lam = _from_ecef(x - _T[0], y - _T[1], z - _T[2], _A67, _F67)
    s = _e * np.sin(phi)
    phip = 2 * np.arctan(np.exp(_c * (np.log(np.tan(np.pi / 4 + 0.5 * phi))
                                      - _e / 2 * np.log((1 + s) / (1 - s))) + _K)) - np.pi / 2
    lamp = _c * (lam - _LAM0)
    cp = np.cos(phip)
    phipp = np.arcsin(np.clip(_cosp0 * np.sin(phip) - _sinp0 * cp * np.cos(lamp), -1, 1))
    lampp = np.arcsin(np.clip(cp * np.sin(lamp) / np.cos(phipp), -1, 1))
    return (_A67 * _kR * lampp + _E0,
            _A67 * _kR * np.log(np.tan(np.pi / 4 + 0.5 * phipp)) + _N0)

class Mosaic:
    """The sheets that touch an EOV box, glued into one array (NaN = no data)."""
    def __init__(self, emin, emax, nmin, nmax, root=ROOT, margin=1000.0):
        import tifffile
        sheets = []
        for tif in glob.glob(os.path.join(root, "*.tif")):
            t = tifffile.TiffFile(tif)
            p = t.pages[0]
            tie = p.tags["ModelTiepointTag"].value
            h, w = p.shape
            e, n = tie[3], tie[4]                     # top-left CORNER
            if (e > emax + margin or e + w * CELL < emin - margin
                    or n < nmin - margin or n - h * CELL > nmax + margin):
                t.close(); continue
            sheets.append((e, n, p.asarray().astype(np.float32)))
            t.close()
        if not sheets:
            self.a = None; return
        self.e0 = min(s[0] for s in sheets)           # corner of the mosaic
        self.n1 = max(s[1] for s in sheets)
        W = int(round((max(s[0] + s[2].shape[1] * CELL for s in sheets) - self.e0) / CELL))
        H = int(round((self.n1 - min(s[1] - s[2].shape[0] * CELL for s in sheets)) / CELL))
        self.a = np.full((H, W), np.nan, np.float32)
        for e, n, d in sheets:
            d[d < -1000] = np.nan                      # GDAL_NODATA is -1e10
            ox = int(round((e - self.e0) / CELL)); oy = int(round((self.n1 - n) / CELL))
            blk = self.a[oy:oy + d.shape[0], ox:ox + d.shape[1]]
            np.copyto(blk, d, where=np.isnan(blk))
        self.sheets = len(sheets)

    def sample(self, E, N):
        """Bilinear between pixel centres; NaN where any corner has no data."""
        if self.a is None:
            return np.full(np.shape(E), np.nan)
        fx = (E - self.e0) / CELL - 0.5
        fy = (self.n1 - N) / CELL - 0.5
        x = np.floor(fx).astype(int); y = np.floor(fy).astype(int)
        tx = fx - x; ty = fy - y
        H, W = self.a.shape
        ok = (x >= 0) & (y >= 0) & (x < W - 1) & (y < H - 1)
        x = np.clip(x, 0, W - 2); y = np.clip(y, 0, H - 2)
        a = self.a
        v = (a[y, x] * (1 - tx) * (1 - ty) + a[y, x + 1] * tx * (1 - ty)
             + a[y + 1, x] * (1 - tx) * ty + a[y + 1, x + 1] * tx * ty)
        return np.where(ok, v, np.nan)

def grid(reg, w, h, sub=1):
    """DDM25 at the pixel centres of a bake_world grid (rows from the north
    edge, as bake_height lays them out). sub > 1 averages sub x sub samples
    per pixel, for grids coarser than 25 m. NaN where there is no data."""
    j, i = np.mgrid[0:h * sub, 0:w * sub]
    lat = reg["north"] - (j + 0.5) / (h * sub) * (reg["north"] - reg["south"])
    lon = reg["west"] + (i + 0.5) / (w * sub) * (reg["east"] - reg["west"])
    E, N = to_eov(lat, lon)
    m = Mosaic(E.min(), E.max(), N.min(), N.max())
    v = m.sample(E, N)
    if sub > 1:
        v = v.reshape(h, sub, w, sub).mean(axis=(1, 3))   # NaN if any sample is
    return v

def blend(terr, ddm, feather_px):
    """DDM where it has data, terrarium outside, ramped over feather_px pixels
    from the edge of the data so the two models' few metres of disagreement
    (trees, mostly) never shows as a step."""
    valid = ~np.isnan(ddm)
    wgt = valid.astype(np.float32)
    inner = valid.copy()
    for _ in range(feather_px):                      # distance by erosion
        p = np.pad(inner, 1, constant_values=False)
        inner = (p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1]
                 & p[1:-1, :-2] & p[1:-1, 2:])
        wgt += inner
    wgt = np.clip((wgt - 1) / max(feather_px, 1), 0, 1) * valid
    return np.where(valid, terr + (np.nan_to_num(ddm) - terr) * wgt, terr), valid
