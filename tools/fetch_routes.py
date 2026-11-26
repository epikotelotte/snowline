"""Fetch the real track of every route in js/data.js from OpenStreetMap and save it simplified.

Source: OpenStreetMap hiking-route relations (© OpenStreetMap contributors, ODbL), read through the
Waymarked Trails API, which returns each relation's member ways in walking order. Routes with no
usable relation are traced instead along the OSM path network between hand-placed waypoints
(Overpass API + shortest path), falling back to straight lines where no path is mapped.

Output: data/tracks.json  { id: { src, pts: [[lat, lon], ...] } }

Run:  python3 tools/fetch_routes.py <cache dir>
"""
import heapq
import json
import math
import os
import subprocess
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".osm-cache")
os.makedirs(CACHE, exist_ok=True)
WMT = "https://hiking.waymarkedtrails.org/api/v1/details/relation/{}"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]

# OSM relations for each route, joined in this order (e.g. up one trail and down another).
REL = {
    "tmb": [124456], "gr20": [101692], "av1": [177743], "whw": [16287], "camino": [2163573], "laugavegur": [1225037],
    "kungsleden": [1657661], "ebc": [1189003], "annapurna": [1187310], "manaslu": [1328173], "k2bc": [21993817],
    "snowman": [13373158], "kumano": [17094646, 17097854, 17095001], "at": [156553], "pct": [1225378], "jmt": [1244828],
    "r2r": [2836789, 2836803], "wct": [6955341], "inca": [15703494], "salkantay": [2376237], "wtrek": [2203617],
    "kili": [8737224, 8737225], "otter": [1383551], "milford": [1385121], "tongariro": [104369], "haute": [3020521],
    "av2": [404914], "lycian": [51855], "balkans": [4726204], "c2c": [12145], "swcp": [2376086], "abc": [17548991],
    "langtang": [1269089], "kailash": [1661963], "cdt": [921198], "colorado": [3445384], "wonderland": [4111743],
    "chilkoot": [1225005], "angels": [7387173], "ocircuit": [7705906], "huayhuash": [1112639], "lostcity": [1562608],
    "routeburn": [1385139], "kepler": [1385141], "overland": [1673569], "larapinta": [3066363], "tmr": [10353523],
    "pennine": [4080347], "caminoport": [12786090], "fishermen": [20810829], "kerry": [183744], "trolltunga": [4270209],
    "godspath": [4757514], "cinqueterre": [7797964], "threepasses": [3777292], "tigerleaping": [18731549],
    "fujiyoshida": [19354640], "halfdometrail": [6451906, 16315186], "skyline": [18816093],
    "kalalau": [9146299], "tetoncrest": [3895101], "choquequirao": [2072730], "lagunatres": [4485261],
    "ausangate": [3475867], "kenyatrek": [416424, 416423], "fishriver": [9517875], "abeltasman": [5987159],
    "bibbulmun": [400098], "greatocean": [1951913], "adlerweg": [3305327], "gr10": [7411272], "hadrian": [38791],
    "preikestolen": [4270259], "besseggen": [1417687], "samaria": [9634834], "snowdon": [4004182],
    "jordantrail": [19065729], "nakasendo": [10128790], "huangshan": [18970848],
    "longtrail": [391736], "whitney": [3289187], "berglake": [6035635], "santacruz": [1732163], "quilotoa": [20978783],
    "dientes": [2683305], "rwenzori": [8386254], "heaphy": [1385145], "threecapes": [5693084], "aawt": [1644959],
}
# Keep only the stretch between two points (lat, lon) of a longer relation.
CLIP = {"nakasendo": [(35.5266, 137.5657), (35.5768, 137.5961)], "caminoport": [(41.1429, -8.6110), (42.8806, -8.5446)],
        "fujiyoshida": [(35.3953, 138.7330), (35.3628, 138.7310)]}
# Routes traced along the OSM path network between waypoints (lat, lon).
_gokyo = [(27.6875, 86.7319), (27.7400, 86.7130), (27.8050, 86.7136), (27.8570, 86.7340), (27.8800, 86.7110),
          (27.9000, 86.7050), (27.9530, 86.6950), (27.9620, 86.6830)]
_kinabalu = [(6.0335, 116.5577), (6.0500, 116.5560), (6.0660, 116.5550), (6.0753, 116.5583)]
_meru = [(-3.2400, 36.8700), (-3.2167, 36.8106), (-3.2260, 36.7790), (-3.2470, 36.7480)]
WAYPOINTS = {
    "olympus": [(40.0770, 22.4180), (40.0827, 22.3885), (40.0870, 22.3640), (40.0856, 22.3586)],
    "trecime": [(46.6123, 12.2950), (46.6150, 12.3080), (46.6230, 12.3110), (46.6315, 12.3100), (46.6290, 12.2870),
                (46.6200, 12.2870), (46.6123, 12.2950)],
    "markha": [(34.0250, 77.3700), (33.9800, 77.3900), (33.9300, 77.3800), (33.9000, 77.3700), (33.8900, 77.2700),
               (33.8500, 77.4200), (33.8000, 77.5300), (33.8000, 77.6000), (33.8200, 77.6600), (33.8700, 77.7100)],
    "gokyo": _gokyo + _gokyo[::-1][1:],
    "poonhill": [(28.2937, 83.8247), (28.3300, 83.7780), (28.3480, 83.7680), (28.4005, 83.7000), (28.4003, 83.6945),
                 (28.4005, 83.7000), (28.4000, 83.7220), (28.3880, 83.7660), (28.3760, 83.8060), (28.2937, 83.8247)],
    "kinabalu": _kinabalu + _kinabalu[::-1][1:],
    "meru": _meru + _meru[::-1][1:],
    "toubkal": [(31.1366, -7.9195), (31.1150, -7.9550), (31.1050, -7.9950), (31.0850, -8.0050), (31.0400, -7.9500),
                (31.0250, -7.8850), (31.0625, -7.9145), (31.0597, -7.9154), (31.0625, -7.9145), (31.0960, -7.9120),
                (31.1366, -7.9195)],
    "simien": [(13.1550, 37.8950), (13.2350, 38.0400), (13.2700, 38.1100), (13.2500, 38.1900), (13.2400, 38.2200),
               (13.2250, 38.3300), (13.2365, 38.3725)],
    "greatwall": [(40.4500, 116.4900), (40.4480, 116.5150), (40.4400, 116.5400), (40.4350, 116.5630)],
    "drakensberg": [(-28.7290, 28.8930), (-28.7525, 28.8970), (-28.8600, 29.0100), (-28.9000, 29.0500), (-28.9630, 29.2050),
                    (-29.0900, 29.2900), (-29.3380, 29.4950), (-29.4670, 29.2670), (-29.5850, 29.2900), (-29.7000, 29.2500),
                    (-29.8400, 29.2000)],
}


def curl(url, path, data=None):
    if isinstance(url, list):      # mirrors: try each in turn
        for i, u in enumerate(url):
            try:
                return curl(u, path, data)
            except subprocess.CalledProcessError:
                if i == len(url) - 1:
                    raise
    if not os.path.exists(path):
        tmp = path + ".part"
        cmd = ["curl", "-sS", "--fail", "--retry", "2", "--retry-all-errors", "--retry-delay", "3", "--max-time", "180", "-A", "snowline-builder", "-o", tmp]
        if data:
            cmd += ["--data-urlencode", "data@-"]
        subprocess.run(cmd + [url], input=data.encode() if data else None, check=True)
        os.replace(tmp, path)
    with open(path) as f:
        return json.load(f)


def merc_to_ll(x, y):
    return math.degrees(2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2), math.degrees(x / 6378137.0)


def km(a, b):
    """Distance in km between (lat, lon) points (equirectangular, fine at trail scale)."""
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 110.57, (a[1] - b[1]) * 111.32 * math.cos(la))


def collect(node, out):
    """The pieces of a route's main line (each a list of ways in order); alternatives and side trips are skipped."""
    t = node.get("route_type")
    if "ways" in node:
        out.append([[merc_to_ll(x, y) for x, y in w["geometry"]["coordinates"]] for w in node["ways"] if w.get("geometry")])
    for m in node.get("main", []):
        collect(m, out)
    if t == "split":
        for m in node.get("forward", []):
            collect(m, out)


def chain(lines):
    """Join way geometries into one line, flipping each way to continue from the last."""
    lines = [l for l in lines if len(l) > 1]
    if not lines:
        return []
    first = lines[0]
    if len(lines) > 1:
        nxt = lines[1]
        if min(km(first[0], nxt[0]), km(first[0], nxt[-1])) < min(km(first[-1], nxt[0]), km(first[-1], nxt[-1])):
            first = first[::-1]
    pts = list(first)
    for l in lines[1:]:
        if km(pts[-1], l[-1]) < km(pts[-1], l[0]):
            l = l[::-1]
        pts += l[1:] if km(pts[-1], l[0]) < 1e-3 else l
    return pts


def order(pieces):
    """Put the pieces of a gappy relation in walking order: from the first piece, always continue with the
    nearest remaining piece. Stray fragments far from everything else are dropped."""
    pieces = [p for p in pieces if len(p) > 1]
    if len(pieces) > 2:
        def near(i):
            return min(km(a, b) for j, q in enumerate(pieces) if j != i for a in (pieces[i][0], pieces[i][-1]) for b in (q[0], q[-1]))
        pieces = [p for i, p in enumerate(pieces) if not (length(p) < 1.0 and near(i) > 5.0)]
    if not pieces:
        return [], 0.0

    def greedy(i0, flip0):
        rest = pieces[:i0] + pieces[i0 + 1:]
        pts = list(pieces[i0][::-1] if flip0 else pieces[i0])
        total = worst = 0.0
        while rest:
            i, flip, d = min(((i, e == -1, km(pts[-1], q[e])) for i, q in enumerate(rest) for e in (0, -1)), key=lambda x: x[2])
            q = rest.pop(i)
            q = q[::-1] if flip else q
            total, worst = total + d, max(worst, d)
            pts += q[1:] if d < 1e-3 else q
        return total, worst, pts

    # try starting from every piece end, keep the order with the least straight-line filling
    best = min((greedy(i, f) for i in range(len(pieces)) for f in (False, True)), key=lambda r: r[0])
    return best[2], best[1]


def clip(pts, a, b):
    ia = min(range(len(pts)), key=lambda i: km(pts[i], a))
    ib = min(range(len(pts)), key=lambda i: km(pts[i], b))
    return pts[min(ia, ib):max(ia, ib) + 1]


def length(pts):
    return sum(km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def simplify(pts, tol):
    """Douglas–Peucker in km."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        a, b = pts[i], pts[j]
        ab = km(a, b)
        best, bi = 0.0, -1
        for k in range(i + 1, j):
            if ab < 1e-9:
                d = km(a, pts[k])
            else:   # cross-track distance in a local flat frame
                c = math.cos(math.radians(a[0]))
                ax, ay = 0, 0
                bx, by = (b[1] - a[1]) * 111.32 * c, (b[0] - a[0]) * 110.57
                px, py = (pts[k][1] - a[1]) * 111.32 * c, (pts[k][0] - a[0]) * 110.57
                t = max(0, min(1, (px * bx + py * by) / (bx * bx + by * by)))
                d = math.hypot(px - t * bx, py - t * by)
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def trace(rid, wps):
    """Shortest path along mapped OSM paths and tracks through the waypoints."""
    lats, lons = [p[0] for p in wps], [p[1] for p in wps]
    pad = 0.03
    bbox = f"{min(lats) - pad},{min(lons) - pad},{max(lats) + pad},{max(lons) + pad}"
    q = (f'[out:json][timeout:120];(way["highway"~"path|footway|track|steps|bridleway|unclassified|service"]({bbox});'
         f'way["barrier"="city_wall"]({bbox});way["historic"="citywalls"]({bbox}););out geom;')
    d = curl(OVERPASS, os.path.join(CACHE, f"overpass_{rid}.json"), data=q)
    nodes, adj = {}, {}
    for w in d.get("elements", []):
        g = w.get("geometry") or []
        ids = w.get("nodes") or []
        for k in range(len(g)):
            nodes[ids[k]] = (g[k]["lat"], g[k]["lon"])
        for k in range(len(g) - 1):
            a, b = ids[k], ids[k + 1]
            c = km(nodes[a], nodes[b])
            adj.setdefault(a, []).append((b, c))
            adj.setdefault(b, []).append((a, c))
    ids = list(nodes)
    out = []
    for s, e in zip(wps, wps[1:]):
        src = min(ids, key=lambda n: km(nodes[n], s)) if ids else None
        dst = min(ids, key=lambda n: km(nodes[n], e)) if ids else None
        path = None
        if src is not None and km(nodes[src], s) < 1.0 and km(nodes[dst], e) < 1.0:
            dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
            while pq:
                du, u = heapq.heappop(pq)
                if u == dst:
                    break
                if du > dist.get(u, 1e18):
                    continue
                for v, c in adj.get(u, []):
                    if du + c < dist.get(v, 1e18):
                        dist[v], prev[v] = du + c, u
                        heapq.heappush(pq, (du + c, v))
            if dst in dist and dist[dst] < 3.0 * km(s, e) + 2:
                path, u = [nodes[dst]], dst
                while u != src:
                    u = prev[u]
                    path.append(nodes[u])
                path = path[::-1]
        seg = [s] + (path or []) + [e]
        out += seg if not out else seg[1:]
    return out


routes = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};require(process.argv[1]);console.log(JSON.stringify(window.ATLAS.routes.map(r=>({id:r.id,km:r.km,coords:r.coords}))))",
     os.path.join(ROOT, "js", "data.js")]))
tracks = {}
for r in routes:
    rid = r["id"]
    if rid in REL:
        parts, gap = [], 0.0
        for rel in REL[rid]:
            d = curl(WMT.format(rel), os.path.join(CACHE, f"wmt_{rel}.json"))
            pieces = []
            collect(d["route"], pieces)
            pts, g = order([chain(p) for p in pieces])
            if parts and pts:
                # join where the two relations meet; the first may still be turned round
                ends = [(km(parts[-1], pts[0]), False, False), (km(parts[-1], pts[-1]), False, True)]
                if len(REL[rid]) and rel == REL[rid][1]:
                    ends += [(km(parts[0], pts[0]), True, False), (km(parts[0], pts[-1]), True, True)]
                _, flip_parts, flip_pts = min(ends)
                if flip_parts:
                    parts = parts[::-1]
                if flip_pts:
                    pts = pts[::-1]
            parts += pts
            gap = max(gap, g)
        if rid in CLIP:
            parts = clip(parts, *CLIP[rid])
        src = "osm"
    elif rid in WAYPOINTS:
        parts, gap, src = trace(rid, WAYPOINTS[rid]), 0.0, "osm-traced"
    else:
        print(f"{rid:14s} — no track")
        continue
    L = length(parts)
    lat0 = sum(p[0] for p in parts) / len(parts)
    span = max(km(parts[0], p) for p in parts) + 1
    pts = simplify(parts, max(0.004, span / 900))
    tracks[rid] = {"src": src, "pts": [[round(a, 5), round(b, 5)] for a, b in pts]}
    flag = "  <-- check length" if not 0.6 < L / r["km"] < 1.6 else ""
    print(f"{rid:14s} {src:10s} {L:7.1f} km (listed {r['km']:>6}) gap {gap:5.2f} km  {len(parts):6d}->{len(pts):4d} pts{flag}")

with open(os.path.join(ROOT, "data", "tracks.json"), "w") as f:
    json.dump(tracks, f, separators=(",", ":"))
print("WROTE", len(tracks), "tracks,", os.path.getsize(os.path.join(ROOT, "data", "tracks.json")), "bytes")
