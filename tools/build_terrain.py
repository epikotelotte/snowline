"""Build real-terrain heightmaps for every peak in js/data.js.

Elevation source: AWS Open Data "Terrain Tiles" (Mapzen Terrarium format), which combine public
datasets such as SRTM, USGS 3DEP, GMTED2010 and ETOPO1. For each peak we download the tiles around
its coordinates, find the true summit nearby (stored coordinates are rounded to ~1 km), cut a square
window centred on it, and resample it to a 128 × 128 grid.

Output (loaded by js/app.js):
  data/terrain.bin   one Uint16 grid per peak (0 = lowest point in the window, 65535 = summit)
  data/terrain.json  per peak: id, window half-size in km, lowest and highest DEM elevation (m)

Routes (tracks from tools/fetch_routes.py → data/tracks.json): a window around the whole track,
turned so the route's long axis runs left to right (start on the left), resampled the same way.
  data/routes.bin    one Uint16 grid per route
  data/routes.json   per route: id, window half-size (km), band (visible depth, 0..1), lo, hi,
                     and the track in window coordinates (x, z in -1..1; z = -1 is the far edge)

Run with Blender's Python (for PNG decoding and numpy):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/build_terrain.py -- <tile cache dir>
"""
import json
import math
import os
import re
import subprocess
import sys

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(ROOT, ".tile-cache")
os.makedirs(CACHE, exist_ok=True)
OUT = 128
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# Read the peak list straight from js/data.js with Node (the file is plain JS).
peaks = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};require(process.argv[1]);console.log(JSON.stringify(window.ATLAS.peaks.map(p=>({id:p.id,coords:p.coords,alt:p.alt,shape:p.shape}))))",
     os.path.join(ROOT, "js", "data.js")]))

# Window half-size (km): big enough to show the mountain's form and its neighbours.
HALF = {"volcano": 12, "dome": 8, "mesa": 4.5, "spire": 5, "wall": 6, "massif": 8, "pyramid": 6}
OVERRIDE = {"everest": 8, "kilimanjaro": 18, "fuji": 14, "rainier": 10, "elbrus": 10, "ararat": 14,
            "chimborazo": 10, "denali": 12, "halfdome": 3.5, "table": 4.5, "bennevis": 6, "kosciuszko": 8,
            "montblanc": 7, "matterhorn": 4.5, "eiger": 5, "fitzroy": 5, "kenya": 8, "aconcagua": 9,
            "vinson": 10, "puncakjaya": 6, "cook": 7, "grandteton": 5, "huascaran": 8}


def parse(coords):
    m = re.findall(r"([\d.]+)°\s*([NSEW])", coords)
    (a, ha), (b, hb) = m
    lat = float(a) * (1 if ha == "N" else -1)
    lon = float(b) * (1 if hb == "E" else -1)
    return lat, lon


def world_px(lat, lon, z):
    """Global pixel coordinates (Web Mercator) at zoom z."""
    n = 256 * 2 ** z
    x = (np.asarray(lon) + 180) / 360 * n
    s = np.sin(np.radians(lat))
    y = (0.5 - np.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


tiles = {}


def tile(z, x, y):
    key = (z, x, y)
    if key in tiles:
        return tiles[key]
    path = os.path.join(CACHE, f"{z}_{x}_{y}.png")
    if not os.path.exists(path):
        tmp = path + ".part"       # only a complete download gets the real name
        subprocess.check_call(["curl", "-sS", "--fail", "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
                               "-A", "terrain-builder", "-o", tmp, URL.format(z=z, x=x, y=y)])
        os.replace(tmp, path)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = np.round(px.reshape(h, w, 4)[::-1] * 255.0)          # Blender stores rows bottom-up
    elev = px[..., 0] * 256 + px[..., 1] + px[..., 2] / 256 - 32768
    bpy.data.images.remove(img)
    tiles[key] = elev
    return elev


def sampler(lat0, lon0, half_km, z):
    """Return a function (lat, lon) -> elevation, bilinear over a mosaic of tiles."""
    dlat = half_km / 110.57
    dlon = half_km / (111.32 * math.cos(math.radians(lat0)))
    x0, y0 = world_px(lat0 + dlat, lon0 - dlon, z)
    x1, y1 = world_px(lat0 - dlat, lon0 + dlon, z)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float64)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = tile(z, tx, ty)

    def at(lat, lon):
        x, y = world_px(lat, lon, z)
        x, y = x - tx0 * 256 - 0.5, y - ty0 * 256 - 0.5
        xi, yi = np.clip(np.floor(x).astype(int), 0, mosaic.shape[1] - 2), np.clip(np.floor(y).astype(int), 0, mosaic.shape[0] - 2)
        fx, fy = np.clip(x - xi, 0, 1), np.clip(y - yi, 0, 1)
        a, b = mosaic[yi, xi], mosaic[yi, xi + 1]
        c, d = mosaic[yi + 1, xi], mosaic[yi + 1, xi + 1]
        return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    return at


def grid(at, lat0, lon0, half_km, n):
    """n × n elevations; row 0 is the north edge, column 0 the west edge."""
    t = (np.arange(n) + 0.5) / n * 2 - 1
    dx, dy = np.meshgrid(t * half_km, t * half_km)
    lat = lat0 - dy / 110.57
    lon = lon0 + dx / (111.32 * math.cos(math.radians(lat0)))
    return at(lat, lon)


def zoom_for(lat, half_km):
    target = half_km * 2000 / OUT            # metres per output cell
    for z in range(2, 14):
        if 156543.03 * math.cos(math.radians(lat)) / 2 ** z <= target * 0.75:
            return z
    return 13


meta, blob = [], bytearray()
for p in peaks:
    lat, lon = parse(p["coords"])
    half = OVERRIDE.get(p["id"], HALF.get(p["shape"], 7))
    # 1. find the true summit: the highest point within 2 km of the stored coordinates
    z_fine = zoom_for(lat, 2.5)
    at = sampler(lat, lon, 2.5, z_fine)
    g = grid(at, lat, lon, 2.0, 81)
    yy, xx = np.unravel_index(np.argmax(g), g.shape)
    t = (np.array([xx, yy]) + 0.5) / 81 * 2 - 1
    moved = math.hypot(t[0], t[1]) * 2.0
    if moved > 2.5:      # the highest point sits on the search edge: the data here is too coarse (e.g. Antarctica)
        print(f"{p['id']:14s} skipped: no clear summit within 2 km (coarse elevation data); keeps its generated shape")
        continue
    lat_s = lat - t[1] * 2.0 / 110.57
    lon_s = lon + t[0] * 2.0 / (111.32 * math.cos(math.radians(lat)))
    # 2. the window centred on the summit
    z = zoom_for(lat_s, half)
    at = sampler(lat_s, lon_s, half, z)
    e = grid(at, lat_s, lon_s, half, OUT)
    lo, hi = float(np.percentile(e, 1)), float(e.max())
    h = np.clip((e - lo) / max(1.0, hi - lo), 0, 1)
    blob += (np.round(h * 65535).astype("<u2")).tobytes()
    centre = float(e[OUT // 2 - 1:OUT // 2 + 1, OUT // 2 - 1:OUT // 2 + 1].max())   # the summit at the window centre
    meta.append({"id": p["id"], "half": half, "lo": round(lo), "hi": round(hi), "c": round(centre)})
    print(f"{p['id']:14s} z{z} half={half:>4}km  DEM summit {centre:7.0f} m (official {p['alt']}, window max {hi:.0f})  base {lo:6.0f} m  moved {moved:.2f} km")

os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
with open(os.path.join(ROOT, "data", "terrain.bin"), "wb") as f:
    f.write(blob)
with open(os.path.join(ROOT, "data", "terrain.json"), "w") as f:
    json.dump({"size": OUT, "source": "AWS Terrain Tiles (Mapzen Terrarium): SRTM, USGS 3DEP, GMTED2010, ETOPO1 and others",
               "peaks": meta}, f, separators=(",", ":"))
print("WROTE", len(meta), "peaks,", len(blob), "bytes;", len(tiles), "tiles")


# ───────── routes ─────────
FLOOR = {"jordantrail": -430}      # sea level is the floor (no sea bed), except beside the Dead Sea


def simplify_xy(pts, tol):
    """Douglas–Peucker on window coordinates."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        a, b = np.array(pts[i]), np.array(pts[j])
        seg = np.array(pts[i + 1:j])
        if len(seg) == 0:
            continue
        ab = b - a
        L2 = float(ab @ ab)
        t = np.clip(((seg - a) @ ab) / L2, 0, 1) if L2 > 1e-12 else np.zeros(len(seg))
        d = np.linalg.norm(seg - (a + t[:, None] * ab), axis=1)
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return [p for p, k in zip(pts, keep) if k]


with open(os.path.join(ROOT, "data", "tracks.json")) as f:
    tracks = json.load(f)
rmeta, rblob = [], bytearray()
for rid, tr in tracks.items():
    ll = np.array(tr["pts"], dtype=np.float64)
    lat0, lon0 = float(ll[:, 0].mean()), float(ll[:, 1].mean())
    kx = 111.32 * math.cos(math.radians(lat0))
    xy = np.stack([(ll[:, 1] - lon0) * kx, (ll[:, 0] - lat0) * 110.57], axis=1)       # km, x east, y north
    # long axis of the track (principal component), start on the left
    seg = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    w = np.concatenate([[0], seg]) + np.concatenate([seg, [0]])
    m = (xy * w[:, None]).sum(0) / w.sum()
    c = xy - m
    sxx, syy, sxy = (w * c[:, 0] ** 2).sum(), (w * c[:, 1] ** 2).sum(), (w * c[:, 0] * c[:, 1]).sum()
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)
    u = xy[:, 0] * math.cos(th) + xy[:, 1] * math.sin(th)
    span = float(u.max() - u.min())
    if u[0] - u[-1] > 0.1 * span:
        th += math.pi
    ct, st = math.cos(th), math.sin(th)
    u = xy[:, 0] * ct + xy[:, 1] * st
    v = -xy[:, 0] * st + xy[:, 1] * ct
    uc, vc = (u.max() + u.min()) / 2, (v.max() + v.min()) / 2
    hu, hv = (u.max() - u.min()) / 2, (v.max() - v.min()) / 2
    half = max(hu / 0.8, hv / 0.82, 2.2)
    band = float(min(1.0, max(0.5, hv / half + 0.2)))
    cx, cy = uc * ct - vc * st, uc * st + vc * ct                     # window centre, km
    # grid: column i → u from -half to +half, row j → v from +half (far) to -half (near)
    t = np.arange(OUT) / (OUT - 1) * 2 - 1
    gu, gv = np.meshgrid(t * half, -t * half)
    gx, gy = gu * ct - gv * st + cx, gu * st + gv * ct + cy
    glat, glon = lat0 + gy / 110.57, lon0 + gx / kx
    clat, clon = lat0 + cy / 110.57, lon0 + cx / kx
    z = zoom_for(clat, half)
    at = sampler(clat, clon, half * 1.45, z)
    e = np.maximum(at(glat, glon), FLOOR.get(rid, 0.0))
    lo, hi = float(e.min()), float(e.max())
    h = np.clip((e - lo) / max(1.0, hi - lo), 0, 1)
    rblob += (np.round(h * 65535).astype("<u2")).tobytes()
    px, pz = (u - uc) / half, -(v - vc) / half
    pts = simplify_xy([[float(a), float(b)] for a, b in zip(px, pz)], 0.0025)
    rmeta.append({"id": rid, "half": round(half, 2), "band": round(band, 3), "lo": round(lo), "hi": round(hi),
                  "lat": round(clat, 3), "src": tr["src"], "pts": [[round(a, 4), round(b, 4)] for a, b in pts]})
    print(f"{rid:14s} z{z} half={half:7.1f} km band {band:.2f}  {lo:6.0f}–{hi:5.0f} m  {len(pts)} pts")

with open(os.path.join(ROOT, "data", "routes.bin"), "wb") as f:
    f.write(rblob)
with open(os.path.join(ROOT, "data", "routes.json"), "w") as f:
    json.dump({"size": OUT, "source": "Tracks: © OpenStreetMap contributors (ODbL). Terrain: AWS Terrain Tiles", "routes": rmeta},
              f, separators=(",", ":"))
print("WROTE", len(rmeta), "routes,", len(rblob), "bytes;", len(tiles), "tiles in total")
