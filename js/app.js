/* Snow Line — a single-screen atlas of peaks and routes.
   One 3D point cloud is reshaped for every item:
   · peaks  → a terrain generated from the mountain's shape type
   · routes → a ribbon of terrain following the route's elevation profile,
              with the trail drawn as an aurora line and a light walking it. */

/* Gear is still in progress: it appears only when the site runs on this Mac (localhost)
   and is left out of the online version. */
const GEAR_ON = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname) || location.hostname.endsWith(".localhost");
const { gearRelief } = GEAR_ON ? await import("./gearforms.js") : { gearRelief: null };
// Product lines modelled in Blender (blender/*.py → models/gear/*.glb). Others use their dot relief.
const GEAR_MODELS = {
  "arcteryx/alpha": "models/gear/arcteryx-alpha.glb",
  "lasportiva/nepal": "models/gear/lasportiva-nepal.glb",
  "osprey/atmos": "models/gear/osprey-atmos.glb"
};
// Parts drawn as glowing detail lines (zips, laces, straps, bindings…); everything else is surface.
const TRIM = /zip|puller|slider|garage|dart|binding|ridge|brim|toggle|cord|lace|eyelet|hook|eyestay|pleat|loop|edge|strap|buckle|frame|web|compression|haul/i;

const { peaks, routes, brands } = window.ATLAS;
const $ = (s) => document.querySelector(s);
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const M_TO_FT = 3.28084;
const KM_TO_MI = 0.621371;

/* ───────── State ───────── */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
};
const byHeight = [...peaks].sort((a, b) => b.alt - a.alt);
const rankOf = Object.fromEntries(byHeight.map((p, i) => [p.id, i + 1]));
// Routes are listed grouped by region (stable within a region), whatever order they were added in.
const REGION_ORDER = ["Europe", "Asia", "North America", "South America", "Africa", "Oceania"];
const routesByRegion = [...routes].sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region));
const routeNo = Object.fromEntries(routesByRegion.map((r, i) => [r.id, i + 1]));
// Gear: every product line is an item ("brand/line"), carrying a reference to its brand.
const gearItems = brands.flatMap((b, bi) => b.lines.map((l) => ({ ...l, lineId: l.id, id: `${b.id}/${l.id}`, brand: b, bi })));
const viewFromHash = () => (location.hash === "#routes" ? "routes" : location.hash === "#gear" && GEAR_ON ? "gear" : "peaks");
const state = {
  view: viewFromHash(),
  units: store.get("ta-units", "metric"),
  lang: "en",
  peaks: { filter: "Iconic", current: byHeight[0].id },
  routes: { filter: "All", current: routes[0].id },
  gear: { filter: "All", current: gearItems[0].id }
};

/* ───────── Language ───────── */
const I18N = window.I18N;
const LANG_CODES = I18N.langs.map((l) => l.code);
function initialLang() {
  const saved = store.get("sl-lang", null);
  if (LANG_CODES.includes(saved)) return saved;
  for (const n of navigator.languages || [navigator.language]) {
    const code = String(n).slice(0, 2).toLowerCase();
    if (LANG_CODES.includes(code)) return code;
  }
  return "en";
}
state.lang = initialLang();
const langInfo = () => I18N.langs.find((l) => l.code === state.lang);
const t = (key) => I18N.ui[state.lang]?.[key] ?? I18N.ui.en[key];
const countryL = (c) => c.split(" · ").map((x) => I18N.countries[state.lang]?.[x] ?? x).join(" · ");
// An item with its text fields in the current language (falls back to English).
function loc(p) {
  const L = state.lang;
  if (L === "en") return p;
  return { ...p, range: I18N.ranges[L]?.[p.range] ?? p.range, country: countryL(p.country), ...(I18N.peaks[L]?.[p.id] || {}) };
}
function locG(it) {
  const tr = state.lang === "en" ? null : I18N.gear?.[state.lang]?.[it.id];
  return tr ? { ...it, ...tr } : it;
}
function locR(r) {
  const L = state.lang;
  if (L === "en") return r;
  return { ...r, country: countryL(r.country), ...(I18N.routes?.[L]?.[r.id] || {}) };
}

/* ───────── Helpers ───────── */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const metric = () => state.units === "metric";
const conv = (m) => (metric() ? m : m * M_TO_FT);
const fmt = (n) => Math.round(n).toLocaleString(langInfo().locale);
const fmt1 = (n) => (n < 100 && Math.abs(n - Math.round(n)) > 0.05
  ? n.toLocaleString(langInfo().locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  : fmt(n));
const altNum = (m) => fmt(conv(m));
const unit = () => (metric() ? "m" : "ft");
const dist = (km) => (metric() ? km : km * KM_TO_MI);
const distUnit = () => (metric() ? "km" : "mi");
const pad = (n) => String(n).padStart(2, "0");
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── Terrain generation ───────── */
function valueNoise(seed) {
  const r = rng(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512).map((_, i) => p[i & 255]);
  const val = new Float32Array(256).map(() => r() * 2 - 1);
  const h = (x, y) => val[perm[perm[x & 255] + (y & 255)]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function ridged(n, x, y) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < 5; o++) { const v = 1 - Math.abs(n(x * f, y * f)); s += v * v * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm;
}

const N = 190;                 // grid resolution → N² points
const SPAN = 1.15;             // half-width of the terrain in world units
const ZEROS = new Float32Array(N * N);
const CENTERS = {
  massif: [[0.05, 0, 1], [-0.36, 0.22, 0.8], [0.38, -0.16, 0.74], [-0.08, -0.42, 0.62], [0.3, 0.38, 0.55]],
  spire:  [[0, 0, 1], [-0.17, 0.06, 0.8], [0.15, -0.05, 0.86], [0.32, 0.12, 0.6], [-0.32, -0.1, 0.56]]
};

const terrainCache = new Map();
function terrain(p) {
  if (terrainCache.has(p.id)) return terrainCache.get(p.id);
  if (REAL[p.id]) {
    const H = realTerrain(p);
    terrainCache.set(p.id, H);
    return H;
  }
  const n = valueNoise(p.id), n2 = valueNoise(p.id + "f");
  const H = new Float32Array(N * N);
  const tw = rng(p.id + "tw")() * Math.PI;
  let max = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, z = (j / (N - 1)) * 2 - 1;
      const r = Math.hypot(x, z), th = Math.atan2(z, x) + tw;
      let f;
      switch (p.shape) {
        case "pyramid": {
          const re = r * (1 - 0.3 * Math.pow(Math.abs(Math.cos(2 * th)), 3));
          f = Math.pow(Math.max(0, 1 - re / 0.78), 1.6); break;
        }
        case "volcano": {
          f = Math.pow(Math.max(0, 1 - r / 0.95), 1.3);
          if (r < 0.12) f -= (0.12 - r) * 1.7; break;
        }
        case "dome": f = Math.exp(-Math.pow(r / 0.5, 2)); break;
        case "mesa": { // long flat-topped plateau with steep cliffs (Table Mountain)
          const d = Math.hypot(x / 1.35, z / 0.55);
          // plateau at ~80% so its flat top sits between contour lines; small summit knoll (Maclear's Beacon)
          f = 0.8 * (1 - smooth(0.42, 0.56, d)) + 0.2 * Math.exp(-Math.pow((x - 0.18) / 0.1, 2) - Math.pow(z / 0.14, 2));
          break;
        }
        case "wall": {
          const base = Math.exp(-Math.pow(x / 0.5, 2) - Math.pow(z / 0.78, 2));
          f = base * (x > 0.06 ? Math.exp(-Math.pow((x - 0.06) / 0.11, 2)) : 1); break;
        }
        case "spire": {
          f = 0.32 * Math.exp(-Math.pow(r / 0.5, 2));
          for (const [cx, cz, h] of CENTERS.spire) f = Math.max(f, h * Math.pow(Math.max(0, 1 - Math.hypot(x - cx, z - cz) / 0.2), 1.25));
          break;
        }
        default: { // massif
          f = 0;
          for (const [cx, cz, h] of CENTERS.massif) f = Math.max(f, h * Math.pow(Math.max(0, 1 - Math.hypot(x - cx, z - cz) / 0.6), 1.7));
        }
      }
      const rough = ridged(n, x * 3.1 + 7, z * 3.1 + 3);
      f += (rough - 0.55) * (p.shape === "mesa" ? 0.06 : 0.2) * (0.3 + f);
      const fall = 1 - smooth(0.78, 1.0, r);
      f = Math.max(0, f) * fall + (n2(x * 2.4, z * 2.4) * 0.5 + 0.5) * 0.06 * fall;
      H[j * N + i] = f;
      if (f > max) max = f;
    }
  }
  for (let k = 0; k < H.length; k++) H[k] /= max;
  terrainCache.set(p.id, H);
  return H;
}
/* Real terrain (tools/build_terrain.py → data/terrain.*): every peak's true shape from elevation
   data (AWS Terrain Tiles: SRTM, USGS 3DEP and others), centred on its summit. Each grid runs from
   the lowest point in the window (0) to the summit (65535); row 0 is north, column 0 west.
   If the file can't be loaded, peaks fall back to the generated shapes below. */
const REAL = await (async () => {
  try {
    const [meta, bin] = await Promise.all([
      fetch("data/terrain.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch("data/terrain.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))]);
    const S = meta.size, all = new Uint16Array(bin);
    return Object.fromEntries(meta.peaks.map((m, i) => [m.id, { ...m, size: S, h: all.subarray(i * S * S, (i + 1) * S * S) }]));
  } catch (err) {
    console.warn("Real terrain unavailable; using generated shapes", err);
    return {};
  }
})();
const latOf = (p) => { const m = /([\d.]+)°\s*([NS])/.exec(p.coords); return m ? parseFloat(m[1]) * (m[2] === "S" ? -1 : 1) : 0; };
// Rough permanent snow line by latitude (m): high in the tropics and the Himalaya, low near the poles.
const snowLine = (lat) => { const a = Math.abs(lat); return lat < -60 ? 0 : a < 12 ? 4900 : a < 32 ? 5400 : a < 40 ? 4800 : a < 50 ? 3000 : a < 62 ? 1900 : 900; };
function realTerrain(p, t = REAL[p.id]) {
  const S = t.size, H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * (S - 1), v = (j / (N - 1)) * (S - 1);
      const iu = Math.min(S - 2, Math.floor(u)), iv = Math.min(S - 2, Math.floor(v)), fu = u - iu, fv = v - iv;
      const a = t.h[iv * S + iu], b = t.h[iv * S + iu + 1], c = t.h[(iv + 1) * S + iu], d = t.h[(iv + 1) * S + iu + 1];
      H[j * N + i] = (a * (1 - fu) * (1 - fv) + b * fu * (1 - fv) + c * (1 - fu) * fv + d * fu * fv) / 65535;
    }
  }
  return H;
}
// Elevation data smooths sharp summits, so shift it to make the centre summit read its official height.
// (A higher neighbour in the window, e.g. Everest beside Lhotse, keeps its true relative height.)
const realRange = (p) => { const t = REAL[p.id], shift = p.alt - t.c; return [t.lo + shift, t.hi + shift]; };
// Height of the real relief on screen: true proportions, exaggerated ×1.7 (broad volcanoes read flat otherwise), within limits.
const realYs = (p) => { const t = REAL[p.id]; return Math.min(0.72, Math.max(0.32, 1.7 * 2 * SPAN * (t.hi - t.lo) / (2 * t.half * 1000))); };
function realSnow(p) {
  const [lo, hi] = realRange(p), line = snowLine(latOf(p));
  return hi <= line ? 0 : Math.min(0.85, 1 - (line - lo) / (hi - lo));
}

/* Real routes (tools/fetch_routes.py + build_terrain.py → data/routes.*): the landscape around each
   route's actual track from OpenStreetMap, turned so the route's long axis runs left to right.
   Loaded in the background; until it arrives (or if it fails) routes use the generated ribbon. */
let ROUTES_REAL = null;
const routesReady = fetch("data/routes.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((meta) => fetch("data/routes.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((bin) => {
    const S = meta.size, all = new Uint16Array(bin);
    ROUTES_REAL = Object.fromEntries(meta.routes.map((m, i) => [m.id, { ...m, size: S, h: all.subarray(i * S * S, (i + 1) * S * S) }]));
  }))
  .catch((err) => { ROUTES_REAL = {}; console.warn("Real route terrain unavailable; using generated ribbons", err); });

const realRouteCache = new Map();
function realRoute(r) {
  if (realRouteCache.has(r.id)) return realRouteCache.get(r.id);
  const t = ROUTES_REAL[r.id], H = realTerrain(r, t);
  // The track glows: for every dot near it, its distance to the line and how far along the route it is.
  const trail = new Float32Array(N * N), prog = new Float32Array(N * N), best = new Float32Array(N * N).fill(1);
  const P = t.pts, cum = [0];
  for (let s = 1; s < P.length; s++) cum.push(cum[s - 1] + Math.hypot(P[s][0] - P[s - 1][0], P[s][1] - P[s - 1][1]));
  const total = cum[cum.length - 1] || 1, R = 0.04, g = (v) => ((v + 1) / 2) * (N - 1);
  for (let s = 1; s < P.length; s++) {
    const [ax, az] = P[s - 1], [bx, bz] = P[s], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const i0 = Math.max(0, Math.floor(g(Math.min(ax, bx) - R))), i1 = Math.min(N - 1, Math.ceil(g(Math.max(ax, bx) + R)));
    const j0 = Math.max(0, Math.floor(g(Math.min(az, bz) - R))), j1 = Math.min(N - 1, Math.ceil(g(Math.max(az, bz) + R)));
    for (let j = j0; j <= j1; j++) {
      const z = (j / (N - 1)) * 2 - 1;
      for (let i = i0; i <= i1; i++) {
        const x = (i / (N - 1)) * 2 - 1, f = clamp01(((x - ax) * dx + (z - az) * dz) / L2);
        const d = Math.hypot(x - ax - f * dx, z - az - f * dz), k = j * N + i;
        if (d < best[k]) { best[k] = d; prog[k] = (cum[s - 1] + f * (cum[s] - cum[s - 1])) / total; }
      }
    }
  }
  for (let k = 0; k < N * N; k++) trail[k] = 1 - smooth(0.012, 0.034, best[k]);
  const relief = t.hi - t.lo, lat = t.lat;
  const line = snowLine(lat), snow = t.hi <= line ? 0 : Math.min(0.85, 1 - (line - t.lo) / relief);
  const out = {
    H, trail, prog, top: t.hi, base: t.lo, band: t.band, snow,
    // true proportions, exaggerated ×1.7 like the peaks, within limits (long trails are vast and flat)
    ys: Math.min(0.5, Math.max(0.16, 1.7 * 2 * SPAN * relief / (2 * t.half * 1000))),
    contour: relief < 400 ? 50 : relief < 1000 ? 100 : relief < 2500 ? 250 : 500
  };
  realRouteCache.set(r.id, out);
  return out;
}

const STEEP = { pyramid: 1.4, spire: 1.5, wall: 1.2, volcano: 1, dome: 1, massif: 1, mesa: 1.3 };
const yScale = (p) => Math.min(0.7, (0.16 + 0.42 * (p.alt / 8849)) * STEEP[p.shape]);
const snowFrac = (alt) => (alt < 3000 ? 0 : Math.min(0.42, Math.max(0.12, ((alt - 2500) / 8849) * 0.75)));

/* A route becomes a valley-like ribbon: the trail follows the elevation profile along x
   (meandering a little in z), with ridges rising on both sides. */
const ROUTE_X = 0.86;          // trail runs from -ROUTE_X to +ROUTE_X (normalised)
const routeCache = new Map();
function routeTerrain(r) {
  if (routeCache.has(r.id)) return routeCache.get(r.id);
  const n = valueNoise(r.id), n2 = valueNoise(r.id + "m");
  const prof = r.profile, segs = prof.length - 1;
  const hi = Math.max(...prof), lo = Math.min(...prof);
  const relief = 220 + 0.38 * hi + 0.12 * (hi - lo);
  const elevAt = (u) => {
    const x = Math.min(segs - 1e-6, Math.max(0, u * segs));
    const k = Math.floor(x), f = (1 - Math.cos(Math.PI * (x - k))) / 2;
    return prof[k] + (prof[k + 1] - prof[k]) * f;
  };
  const ph = rng(r.id + "z")() * 6.28;
  const z0 = (x) => 0.13 * Math.sin(x * 2.6 + ph) + 0.04 * Math.sin(x * 7.3 + ph * 2);
  const E = new Float32Array(N * N), trail = new Float32Array(N * N), prog = new Float32Array(N * N);
  let top = 1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = (i / (N - 1)) * 2 - 1, z = (j / (N - 1)) * 2 - 1;
      const u = clamp01((x + ROUTE_X) / (2 * ROUTE_X));
      const d = Math.abs(z - z0(x));
      const walls = smooth(0.04, 0.72, d) * relief * (0.3 + ridged(n, x * 2.3 + 5, z * 2.7 + 1));
      const e = Math.max(0, elevAt(u) + walls + n2(x * 7, z * 7) * 0.025 * relief);
      E[k] = e;
      trail[k] = (1 - smooth(0.011, 0.034, d)) * (1 - smooth(ROUTE_X, ROUTE_X + 0.03, Math.abs(x)));
      prog[k] = u;
      if (e > top) top = e;
    }
  }
  for (let k = 0; k < E.length; k++) E[k] /= top;
  const out = { H: E, top, trail, prog };
  routeCache.set(r.id, out);
  return out;
}

/* Gear: every product line has its own embossed relief (gearforms.js): silhouette plus signature
   details — hood, baffles, sole stack, lacing, lid and zips, poles and vents — traced by the contour lines. */
const gearTerrain = (item) => gearRelief(item, N);   // → { H: heights, D: detail glow }

/* ───────── 3D stage ───────── */
async function createStage(canvas) {
  const THREE = await import("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  const group = new THREE.Group();
  scene.add(group);



  const count = N * N;
  const pos = new Float32Array(count * 3);
  const elev = new Float32Array(count);    // metres
  const hNorm = new Float32Array(count);   // 0..1 of this shape
  const rand = new Float32Array(count);
  const edge = new Float32Array(count);
  const delay = new Float32Array(count);
  const baseX = new Float32Array(count), baseZ = new Float32Array(count);   // home position on the grid
  const trailA = new Float32Array(count);  // 1 on the trail (routes only)
  const progA = new Float32Array(count);   // 0..1 progress along the route
  const detA = new Float32Array(count);    // 0..1 gear detail glow (outlines, seams, zips)
  const normA = new Float32Array(count * 3);   // surface normal (gear models only)
  const r = rng("points");
  const step = (2 * SPAN) / (N - 1);
  for (let j = 0, k = 0; j < N; j++) {
    for (let i = 0; i < N; i++, k++) {
      const x = -SPAN + i * step + (r() - 0.5) * step * 0.8;
      const z = -SPAN + j * step + (r() - 0.5) * step * 0.8;
      pos[k * 3] = x; pos[k * 3 + 2] = z;
      baseX[k] = x; baseZ[k] = z;
      rand[k] = r();
      edge[k] = Math.pow(1 - smooth(0.4, 1.0, Math.hypot(x, z) / SPAN), 1.5);
      delay[k] = ((x / SPAN) * 0.5 + 0.5) * 0.75 + rand[k] * 0.25;
    }
  }
  const geo = new THREE.BufferGeometry();
  const dyn = (arr, size) => new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", dyn(pos, 3));
  geo.setAttribute("aElev", dyn(elev, 1));
  geo.setAttribute("aH", dyn(hNorm, 1));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  geo.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
  geo.setAttribute("aTrail", dyn(trailA, 1));
  geo.setAttribute("aProg", dyn(progA, 1));
  geo.setAttribute("aDetail", dyn(detA, 1));
  geo.setAttribute("aNormal", dyn(normA, 3));


  const uniforms = {
    uPR: { value: renderer.getPixelRatio() },
    uSize: { value: 3.0 },
    uMouse: { value: new THREE.Vector2(9, 9) },
    uAspect: { value: 1 },
    uContour: { value: 500 },
    uSnow: { value: 0.3 },
    uTime: { value: 0 },
    uDist: { value: 3.6 },
    uRoute: { value: 0 },     // 0 = peak shape, 1 = route ribbon (animated between)
    uWalk: { value: 0 },      // walker position along the route, 0..1
    uGear: { value: 0 },      // 1 = gear relief: wider edge fade so the whole object shows
    uDim: { value: 1 },       // overall point brightness
    uObj: { value: 0 },       // 1 = dots on a 3D gear model (shade by facing, glow at the silhouette)
    uBand: { value: 0.65 }    // route: how deep the visible band is (0..1 of the grid), wide for loops
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aElev; attribute float aH; attribute float aRand; attribute float aEdge;
      attribute float aTrail; attribute float aProg; attribute float aDetail; attribute vec3 aNormal;
      uniform float uPR, uSize, uAspect, uContour, uSnow, uTime, uDist, uRoute, uWalk, uGear, uDim, uObj, uBand; uniform vec2 uMouse;
      varying vec3 vColor; varying float vAlpha;

      // Aurora palette, t in 0..1: green → teal → blue → violet → pink.
      vec3 aurora(float t) {
        t = clamp(t, 0.0, 1.0) * 4.0;
        vec3 c0 = vec3(0.30, 1.00, 0.58);   // green
        vec3 c1 = vec3(0.10, 0.90, 0.80);   // teal
        vec3 c2 = vec3(0.25, 0.58, 1.00);   // blue
        vec3 c3 = vec3(0.62, 0.36, 1.00);   // violet
        vec3 c4 = vec3(1.00, 0.32, 0.72);   // pink
        if (t < 1.0) return mix(c0, c1, t);
        if (t < 2.0) return mix(c1, c2, t - 1.0);
        if (t < 3.0) return mix(c2, c3, t - 2.0);
        return mix(c3, c4, t - 3.0);
      }

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float band = abs(fract(aElev / uContour + 0.5) - 0.5) * uContour;   // metres to nearest contour
        float line = (1.0 - smoothstep(0.0, uContour * 0.12, band)) * smoothstep(0.1, 0.2, aH);
        vec2 ndc = gl_Position.xy / gl_Position.w;
        float m = 1.0 - smoothstep(0.0, 0.22, distance(ndc * vec2(uAspect, 1.0), uMouse * vec2(uAspect, 1.0)));
        vec3 rock = mix(vec3(0.2, 0.2, 0.23), vec3(0.72, 0.72, 0.76), pow(aH, 0.8));
        float snow = smoothstep(1.0 - uSnow - 0.03, 1.0 - uSnow + 0.05, aH + (aRand - 0.5) * 0.06);
        vec3 c = mix(rock, vec3(1.0), snow * step(0.001, uSnow));
        // Like real aurora: green low down, violet and pink up high,
        // with the colour band rippling sideways and breathing over time.
        float hue = aH * 0.95
                  + sin(position.x * 2.6 + position.z * 1.4 + uTime * 0.5) * 0.12
                  + sin(uTime * 0.23) * 0.06;
        float shimmer = 0.8 + 0.2 * sin(uTime * 1.6 + aRand * 40.0);
        c = mix(c, aurora(hue) * 1.15 * shimmer, line * (1.0 - 0.62 * uRoute));
        c = mix(c, aurora(hue + 0.3) * 1.05, m * 0.8);

        // Route: the trail glows along its length; the stretch just walked is brighter,
        // and a white light marks the walker.
        float tr = aTrail * uRoute;
        float behind = step(aProg, uWalk) * smoothstep(uWalk - 0.3, uWalk, aProg);
        float walker = tr * (1.0 - smoothstep(0.0, 0.014, abs(aProg - uWalk)));
        c = mix(c, aurora(aProg * 0.9 + 0.05) * (1.05 + behind * 0.7), tr);
        c = mix(c, vec3(1.0), walker);
        // Gear: the product's outline and details glow in aurora colours; flat panels stay soft grey.
        float det = aDetail * uGear;
        float up = mix(-position.z / ${SPAN.toFixed(2)}, position.y * 1.1 - 0.35, uObj);   // relief: depth is "up"; model: height
        float gHue = 0.48 + up * 0.55 + sin(position.x * 3.0 + uTime * 0.5) * 0.08;   // green at the base → pink at the top
        // 3D models: dots facing the camera read as surface, the far side fades, the silhouette glows
        float facing = dot(normalize(normalMatrix * aNormal), normalize(-mv.xyz));
        float rim = pow(1.0 - abs(facing), 3.0) * uObj;
        float lit = mix(1.0, 0.2 + 0.8 * smoothstep(-0.25, 0.6, facing), uObj);
        c = mix(c, aurora(gHue) * 1.5 * shimmer, max(det, rim * 0.7));
        vColor = c;

        // Peaks fade out in a disc, routes in a long ribbon.
        vec2 q = position.xz / ${SPAN.toFixed(2)};
        float rect = (1.0 - smoothstep(uBand - 0.25, uBand + 0.3, abs(q.y))) * (1.0 - smoothstep(0.88, 1.0, abs(q.x)));
        float wide = 1.0 - smoothstep(0.82, 1.0, length(q));
        float edge = mix(mix(aEdge, rect, uRoute), wide, uGear);
        // Fog and point size are relative to camera distance, so phones (camera further back) look the same.
        float depth = -mv.z / uDist;
        float fog = smoothstep(2.1, 0.67, depth);
        // Gear: flat panels recede to a faint dust so the crisp outline drawing leads.
        vAlpha = edge * (0.7 + 0.3 * fog) * uDim * (1.0 - uGear * 0.62 * (1.0 - det)) * (lit + rim * 0.8);
        gl_PointSize = uSize * uPR * (1.0 + line * (1.3 - 0.7 * uRoute) + m * 1.2 + tr * (1.1 + behind * 0.6) + walker * 3.0 + det * 0.55) * (0.72 / depth) * edge * (1.0 - uGear * 0.3);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.15, length(d)) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a, a);
      }`
  });
  group.add(new THREE.Points(geo, mat));

  // Morph between shapes
  const mk = () => ({ x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count), e: new Float32Array(count), h: new Float32Array(count), d: new Float32Array(count) });
  const from = mk(), to = mk();
  let morph = null, routeMode = false, walkT0 = performance.now(), spin = 0.08, tilt = 0;
  let faceFront = false;   // gear: sway gently around a front view instead of turning edge-on
  let settle = null;       // routes: turn side-on (long axis left to right) when a route opens
  let peakContour = 500;
  let wantRoute = null;    // the route waiting for its real terrain to load

  // obj (optional) = { X, Y, Z, NX, NY, NZ, H, D }: dots placed on a 3D model instead of a terrain grid
  function setShape({ H, top, ys, snow, contour, trail, prog, route, detail = ZEROS, obj = null, base = 0, band = 0.65 }, instant) {
    wantRoute = null;
    settle = null;
    for (let k = 0; k < count; k++) {
      from.x[k] = pos[k * 3]; from.y[k] = pos[k * 3 + 1]; from.z[k] = pos[k * 3 + 2];
      from.e[k] = elev[k]; from.h[k] = hNorm[k]; from.d[k] = detA[k];
      if (obj) {
        to.x[k] = obj.X[k]; to.y[k] = obj.Y[k]; to.z[k] = obj.Z[k];
        to.h[k] = obj.H[k]; to.e[k] = obj.H[k] * top; to.d[k] = obj.D[k];
        normA[k * 3] = obj.NX[k]; normA[k * 3 + 1] = obj.NY[k]; normA[k * 3 + 2] = obj.NZ[k];
      } else {
        to.x[k] = baseX[k]; to.y[k] = H[k] * ys; to.z[k] = baseZ[k];
        to.e[k] = base + H[k] * (top - base); to.h[k] = H[k]; to.d[k] = detail[k];
        normA[k * 3] = 0; normA[k * 3 + 1] = 1; normA[k * 3 + 2] = 0;
      }
    }
    geo.attributes.aNormal.needsUpdate = true;
    trailA.set(trail); progA.set(prog);
    geo.attributes.aTrail.needsUpdate = true;
    geo.attributes.aProg.needsUpdate = true;
    routeMode = route;
    spin = route ? 0.035 : 0.08;
    tilt = 0;
    faceFront = false;
    if (typeof applyLayout === "function") applyLayout();
    walkT0 = performance.now() + (instant ? 0 : 900);
    uniforms.uContour.value = contour;
    morph = {
      t0: performance.now(), dur: instant || REDUCED ? 1 : 1700,
      snow0: uniforms.uSnow.value, snow1: snow,
      route0: uniforms.uRoute.value, route1: route ? 1 : 0,
      gear0: uniforms.uGear.value, gear1: 0,
      dim0: uniforms.uDim.value, dim1: 1,
      obj0: uniforms.uObj.value, obj1: obj ? 1 : 0,
      band0: uniforms.uBand.value, band1: band
    };
    currentGear = null;
  }

  function setPeak(p, instant) {
    const real = REAL[p.id], [lo, hi] = real ? realRange(p) : [0, p.alt];
    setShape({ H: terrain(p), top: hi, base: lo, ys: real ? realYs(p) : yScale(p),
      snow: real ? realSnow(p) : snowFrac(p.alt), contour: peakContour, trail: ZEROS, prog: ZEROS, route: false }, instant);
  }
  /* Gear models: load the .glb, then scatter every dot over its surfaces (weighted by area, with
     extra dots on trims so zips, laces and straps read as lines). Cached per product line. */
  const modelDots = new Map();
  let currentGear = null, gltfLoader = null, Sampler = null;
  async function loadModelDots(id) {
    if (modelDots.has(id)) return modelDots.get(id);
    if (!gltfLoader) {
      const [{ GLTFLoader }, { MeshSurfaceSampler }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"), import("three/addons/math/MeshSurfaceSampler.js")]);
      gltfLoader = new GLTFLoader(); Sampler = MeshSurfaceSampler;
    }
    const gltf = await gltfLoader.loadAsync(GEAR_MODELS[id]);
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const p = g.attributes.position;
      let area = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(p, i + 1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(p, i + 2).applyMatrix4(o.matrixWorld);
        area += b.sub(a).cross(c.sub(a)).length() / 2;
      }
      const trim = TRIM.test(o.name);
      parts.push({ mesh: o, trim, weight: area * (trim ? 3.5 : 1) });
    });
    const total = parts.reduce((s, q) => s + q.weight, 0);
    let left = count;
    parts.forEach((q, i) => { q.n = i === parts.length - 1 ? left : Math.round(count * q.weight / total); left -= q.n; });
    const raw = new Float32Array(count * 3), nrm = new Float32Array(count * 3), D = new Float32Array(count);
    const pv = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3();
    let k = 0;
    for (const q of parts) {
      const sampler = new Sampler(q.mesh).build();
      nm.getNormalMatrix(q.mesh.matrixWorld);
      for (let i = 0; i < q.n && k < count; i++, k++) {
        sampler.sample(pv, nv);
        pv.applyMatrix4(q.mesh.matrixWorld); nv.applyMatrix3(nm).normalize();
        raw.set([pv.x, pv.y, pv.z], k * 3); nrm.set([nv.x, nv.y, nv.z], k * 3);
        D[k] = q.trim ? 1 : 0;
      }
    }
    // shuffle so the morph's per-dot delays spread evenly over the whole object
    const order = Array.from({ length: count }, (_, i) => i);
    const rr = rng(id + "order");
    for (let i = count - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // centre on the camera's focus and scale so the product fits the stage (1.45 units on its longest side)
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) for (let d = 0; d < 3; d++) { const v = raw[i * 3 + d]; if (v < lo[d]) lo[d] = v; if (v > hi[d]) hi[d] = v; }
    const sc = 1.45 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
    const out = { X: new Float32Array(count), Y: new Float32Array(count), Z: new Float32Array(count),
      NX: new Float32Array(count), NY: new Float32Array(count), NZ: new Float32Array(count), H: new Float32Array(count), D: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
      const s0 = order[i];
      out.X[i] = (raw[s0 * 3] - cx) * sc;
      out.Y[i] = (raw[s0 * 3 + 1] - cy) * sc + 0.1;
      out.Z[i] = (raw[s0 * 3 + 2] - cz) * sc;
      out.NX[i] = nrm[s0 * 3]; out.NY[i] = nrm[s0 * 3 + 1]; out.NZ[i] = nrm[s0 * 3 + 2];
      out.H[i] = (raw[s0 * 3 + 1] - lo[1]) / (hi[1] - lo[1]);
      out.D[i] = D[s0];
    }
    modelDots.set(id, out);
    return out;
  }

  function setGear(item, instant) {
    const model = modelDots.get(item.id);
    if (model) {
      setShape({ H: ZEROS, top: 1000, ys: 0, snow: 0, contour: 1e6, trail: ZEROS, prog: ZEROS, route: false, obj: model }, instant);
      currentGear = item.id;
      faceFront = true;
      applyLayout();
      tilt = 0;      // a real 3D object: stand it upright
      morph.gear1 = 1;
      return;
    }
    if (GEAR_MODELS[item.id]) {
      // show the relief while the model loads, then morph into it if this item is still showing
      loadModelDots(item.id).then(() => { if (currentGear === item.id) setGear(item, false); }, (err) => console.warn("Gear model failed", err));
    }
    const { H, D } = gearTerrain(item);
    setShape({ H, detail: D, top: 1000, ys: 0.13, snow: 0, contour: 1e6, trail: ZEROS, prog: ZEROS, route: false }, instant);
    faceFront = true;
    applyLayout();
    tilt = 0.85;   // stand the relief up toward the camera (≈15° short of face-on) so it reads like a product shot
    morph.gear1 = 1;
    currentGear = item.id;
  }
  function setRoute(rt, instant) {
    wantRoute = rt;
    if (!ROUTES_REAL) { routesReady.then(() => { if (wantRoute === rt) setRoute(rt, instant); }); return; }
    if (ROUTES_REAL[rt.id]) {
      const R = realRoute(rt);
      setShape({ ...R, route: true }, instant);
      settle = -0.3;
      return;
    }
    const { H, top, trail, prog } = routeTerrain(rt);
    const ys = Math.min(0.55, Math.max(0.2, 0.18 + 0.32 * (top / 6000)));
    const contour = top < 900 ? 100 : top < 2500 ? 250 : 500;
    setShape({ H, top, ys, snow: snowFrac(top), contour, trail, prog, route: true }, instant);
  }

  function stepMorph(now) {
    if (!morph) return;
    const T = clamp01((now - morph.t0) / morph.dur);
    for (let k = 0; k < count; k++) {
      const e = easeInOut(clamp01((T - delay[k] * 0.4) / 0.6));
      const lift = Math.sin(Math.PI * e) * 0.07 * (rand[k] - 0.25);
      pos[k * 3] = from.x[k] + (to.x[k] - from.x[k]) * e;
      pos[k * 3 + 1] = from.y[k] + (to.y[k] - from.y[k]) * e + lift;
      pos[k * 3 + 2] = from.z[k] + (to.z[k] - from.z[k]) * e;
      elev[k] = from.e[k] + (to.e[k] - from.e[k]) * e;
      hNorm[k] = from.h[k] + (to.h[k] - from.h[k]) * e;
      detA[k] = from.d[k] + (to.d[k] - from.d[k]) * e;
    }
    const eT = easeInOut(T);
    uniforms.uSnow.value = morph.snow0 + (morph.snow1 - morph.snow0) * eT;
    uniforms.uRoute.value = morph.route0 + (morph.route1 - morph.route0) * eT;
    uniforms.uGear.value = morph.gear0 + (morph.gear1 - morph.gear0) * eT;
    uniforms.uDim.value = morph.dim0 + (morph.dim1 - morph.dim0) * eT;
    uniforms.uObj.value = morph.obj0 + (morph.obj1 - morph.obj0) * eT;
    uniforms.uBand.value = morph.band0 + (morph.band1 - morph.band0) * eT;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aElev.needsUpdate = true;
    geo.attributes.aH.needsUpdate = true;
    geo.attributes.aDetail.needsUpdate = true;
    if (T >= 1) morph = null;
  }

  // Layout: on wide screens push the terrain to the right of the text.
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    uniforms.uAspect.value = w / h;
    const wide = w > 860;
    // Portrait screens: back the camera off until the terrain fits the width.
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = wide ? 3.6 : Math.max(2.8, 0.72 / (halfTan * camera.aspect));
    camera.position.set(0, dist * 0.5, dist);
    camera.lookAt(0, 0.12, 0);
    // On phones the text sits at the bottom, so shift the picture upward.
    if (wide) camera.clearViewOffset(); else camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    camera.updateProjectionMatrix();
    layout = { wide, aspect: camera.aspect };
    applyLayout();
    uniforms.uDist.value = dist;
  }
  // Routes are long ribbons: draw them a little smaller and further right so they clear the text.
  let layout = { wide: true, aspect: 1.6 };
  function applyLayout() {
    const { wide, aspect } = layout;
    // Gear stands upright, so on phones lift it and draw it a little smaller to clear the text below.
    const k = routeMode ? 0.8 : faceFront && !wide ? 0.86 : 1;
    const y = wide ? 0.16 : faceFront ? 0.2 : 0;
    group.position.set(wide ? Math.min(0.7, 0.29 * aspect) + (routeMode ? 0.08 : 0) : 0, y, 0);
    group.scale.setScalar((wide ? 1.12 : 1) * k);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Drag to rotate, with inertia; slow auto-rotation when idle.
  let rotV = 0, dragging = false, lastX = 0, idleAt = 0;
  group.rotation.y = -0.5;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; settle = null; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    uniforms.uMouse.value.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    if (!dragging) return;
    const dx = e.clientX - lastX; lastX = e.clientX;
    rotV = dx * 0.006; group.rotation.y += rotV; idleAt = performance.now();
  });
  const end = () => { dragging = false; idleAt = performance.now(); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => uniforms.uMouse.value.set(9, 9));

  let visible = true, last = performance.now();
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  const WALK = 16000;   // ms for one walk along the route, then a short pause
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible) return;
    stepMorph(now);
    if (!dragging) {
      rotV *= 0.94;
      group.rotation.y += rotV;
      // routes turn more slowly so the ribbon stays readable
      if (faceFront) {
        if (now - idleAt > 1500) {
          const target = REDUCED ? 0 : 0.28 * Math.sin(now / 4200);
          const diff = ((target - group.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          group.rotation.y += diff * Math.min(1, dt * 1.4);
        }
      } else if (settle !== null) {
        const diff = ((settle - group.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        group.rotation.y += diff * Math.min(1, dt * 2.2);
        if (Math.abs(diff) < 0.01) { settle = null; idleAt = now; }
      } else if (!REDUCED && now - idleAt > 1500) group.rotation.y += dt * spin;
    }
    group.rotation.x += (tilt - group.rotation.x) * Math.min(1, dt * 3);

    const w = Math.max(0, now - walkT0) % (WALK * 1.15);
    uniforms.uWalk.value = REDUCED ? 1 : Math.min(1, w / WALK);
    uniforms.uTime.value = now / 1000;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    setPeak, setRoute, setGear,
    setPeakContour(metres) { peakContour = metres; if (!routeMode) uniforms.uContour.value = metres; }
  };
}

/* ───────── Text effects ───────── */
const GLYPHS = "#%@*+=-:/<>01".split("");
function scramble(el, text, dur = 650) {
  cancelAnimationFrame(el._raf);
  if (REDUCED) { el.textContent = text; return; }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = [...text].map((ch, i) => (ch === " " || i / text.length < p ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}
function countTo(el, from, to, format = fmt, dur = 1100) {
  cancelAnimationFrame(el._raf);
  if (REDUCED || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
    el.textContent = p < 1 ? fmt(v) : format(to);
    if (p < 1) el._raf = requestAnimationFrame(tick);
  };
  el._raf = requestAnimationFrame(tick);
}
// Size the name to fit its column. Measures the final text in a hidden copy,
// so it stays correct while the visible text is mid-scramble.
const measurer = Object.assign(document.createElement("span"), { className: "v-name", ariaHidden: "true" });
measurer.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;--fit:96px;margin:0";
document.body.appendChild(measurer);
function currentName() {
  if (state.view === "gear") return gearItems.find((x) => x.id === state.gear.current).brand.name;
  return state.view === "routes"
    ? locR(routes.find((x) => x.id === state.routes.current)).name
    : loc(peaks.find((x) => x.id === state.peaks.current)).name;
}
function fitName() {
  const el = $("#vName"), box = el.parentElement;
  measurer.textContent = currentName();
  const cs = getComputedStyle(box);
  const max = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const cap = Math.min(96, innerHeight * (innerWidth <= 860 ? 0.075 : 0.105));
  const size = Math.min(cap, (96 * max) / measurer.offsetWidth);
  el.style.setProperty("--fit", `${Math.floor(size)}px`);
}

/* ───────── Views: filters and lists ───────── */
const PEAK_FILTERS = [
  { key: "Iconic", label: "fIconic", head: "hIconic", test: (p) => p.tags.includes("Iconic") },
  { key: "Top30", label: "fTop30", head: "hTop30", test: (p) => p.tags.includes("Top30") },
  { key: "8000er", label: "f8000", head: "h8000", test: (p) => p.tags.includes("8000er") },
  { key: "Seven Summits", label: "seven", head: "hSeven", test: (p) => p.tags.includes("Seven Summits") },
  { key: "Alps", label: "alps", head: "hAlps", test: (p) => p.tags.includes("Alps") },
  { key: "Volcano", label: "volcano", head: "hVolcano", test: (p) => p.tags.includes("Volcano") },
  { key: "All", label: "all", head: "hAll", test: () => true }
];
const REGION_KEY = { "Europe": "rEurope", "Asia": "rAsia", "North America": "rNorthAmerica", "South America": "rSouthAmerica", "Africa": "rAfrica", "Oceania": "rOceania" };
const TYPE_KEY = { day: "typeDay", trek: "typeTrek", long: "typeLong" };
const ROUTE_FILTERS = [
  { key: "All", label: "all", head: "greatRoutes", test: () => true },
  { key: "Europe", label: "rEurope", head: "rEurope", test: (r) => r.region === "Europe" },
  { key: "Asia", label: "rAsia", head: "rAsia", test: (r) => r.region === "Asia" },
  { key: "Americas", label: "rAmericas", head: "rAmericas", test: (r) => r.region.endsWith("America") },
  { key: "Africa", label: "rAfrica", head: "rAfrica", test: (r) => r.region === "Africa" },
  { key: "Oceania", label: "rOceania", head: "rOceania", test: (r) => r.region === "Oceania" },
  { key: "day", label: "fDay", head: "typeDay", test: (r) => r.type === "day" },
  { key: "trek", label: "fTrek", head: "typeTrek", test: (r) => r.type === "trek" },
  { key: "long", label: "fLong", head: "typeLong", test: (r) => r.type === "long" }
];
const CAT_GROUP = {
  apparel: ["shell", "insulation", "midlayer", "baselayer"],
  footwear: ["hiking", "trailrun", "mtnboots", "approach"],
  packs: ["pack"],
  shelter: ["tent", "sleep"],
  climbing: ["climbing", "poles", "safety"],
  cooking: ["stove"],
  tech: ["light", "nav"]
};
const GEAR_FILTERS = [
  { key: "All", label: "all", head: "hGear", test: () => true },
  ...Object.entries(CAT_GROUP).map(([k, cats]) => ({
    key: k, label: "g_" + k, head: "g_" + k, test: (it) => cats.includes(it.cat)
  }))
];
const VIEW = {
  peaks: { items: byHeight, filters: PEAK_FILTERS, no: (p) => rankOf[p.id] },
  routes: { items: routesByRegion, filters: ROUTE_FILTERS, no: (r) => routeNo[r.id] },
  gear: { items: gearItems, filters: GEAR_FILTERS, no: (it) => it.bi + 1 }
};
const V = () => VIEW[state.view];
const S = () => state[state.view];
const activeFilter = () => V().filters.find((f) => f.key === S().filter);
const list = () => V().items.filter(activeFilter().test);

function renderFilters() {
  const v = V();
  $("#filters").innerHTML = v.filters.map((f) =>
    `<button type="button" data-filter="${esc(f.key)}" aria-pressed="${S().filter === f.key}">${esc(t(f.label))}<sup>${v.items.filter(f.test).length}</sup></button>`).join("");
  $("#vHeadLabel").textContent = t(activeFilter().head);
}

function renderLangs() {
  $("#langs").innerHTML = I18N.langs.map((l) =>
    `<button type="button" data-lang="${l.code}" lang="${l.html}" aria-pressed="${l.code === state.lang}">${esc(l.label)}</button>`).join("");
}

function renderStrip() {
  if (state.view === "gear") {
    // Gear strip lists brands (that have lines in the current filter); a brand opens its first line.
    const cur = gearItems.find((x) => x.id === state.gear.current);
    const seen = new Set();
    $("#strip").innerHTML = list().filter((it) => !seen.has(it.brand.id) && seen.add(it.brand.id)).map((it) => `
      <li><button type="button" data-id="${it.id}" data-brand="${it.brand.id}" aria-current="${it.brand.id === cur.brand.id}">
        <span class="n">${pad(it.bi + 1)}</span>
        <span class="nm">${esc(it.brand.name)}</span>
        <span class="el">${esc(countryL(it.brand.country))}</span>
      </button></li>`).join("");
    return;
  }
  const routesView = state.view === "routes";
  $("#strip").innerHTML = list().map((it) => {
    const name = routesView ? locR(it).name : loc(it).name;
    const sub = routesView ? `${fmt1(dist(it.km))} ${distUnit()}` : `${altNum(it.alt)} ${unit()}`;
    return `<li><button type="button" data-id="${it.id}" aria-current="${it.id === S().current}">
      <span class="n">${pad(V().no(it))}</span>
      <span class="nm">${esc(name)}</span>
      <span class="el">${sub}</span>
    </button></li>`;
  }).join("");
}

function renderRuler() {
  const top = 9000;
  const y = (m) => `${(1 - m / top) * 100}%`;
  let html = `<div class="axis"></div>`;
  const step = metric() ? 2000 : 5000, lim = metric() ? 8000 : 25000;
  for (let v = 0; v <= lim; v += step) html += `<span class="grid" style="top:${y(metric() ? v : v / M_TO_FT)}">${fmt(v)}</span>`;
  html += `<div class="zone" style="top:${y(8000)}"><span>${esc(t("death").toUpperCase())}</span></div>`;
  html += byHeight.map((p) => `<span class="tick" style="top:${y(p.alt)}"></span>`).join("");
  const cur = peaks.find((p) => p.id === state.peaks.current);
  html += `<div class="marker" id="marker" style="top:${y(cur.alt)}"><span>${altNum(cur.alt)} ${unit()}</span></div>`;
  $("#ruler").innerHTML = html;
}

// Meta row: [{ label, value } | { label, html }], optional items hide on phones.
function renderMeta(items) {
  $("#vMeta").innerHTML = items.map((it, i) =>
    `<div${it.opt ? ' class="opt"' : ""}><dt>${esc(it.label)}</dt><dd data-i="${i}">${it.html ?? ""}</dd></div>`).join("");
  items.forEach((it, i) => { if (it.html == null) scramble($(`#vMeta dd[data-i="${i}"]`), String(it.value).toUpperCase(), 500 + i * 60); });
}

function seasonBar(season) {
  const on = (m) => season.some(([a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b));
  // CJK narrow month names are "1月" etc. — too wide for the bar, so plain numbers there.
  const cjk = ["ja", "ko", "zh"].includes(state.lang);
  const f = new Intl.DateTimeFormat(langInfo().locale, { month: "narrow" });
  const long = new Intl.DateTimeFormat(langInfo().locale, { month: "long" });
  return `<span class="months">${Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, i, 15);
    return `<i class="${on(i + 1) ? "on" : ""}" title="${esc(long.format(d))}">${esc(cjk ? String(i + 1) : f.format(d))}</i>`;
  }).join("")}</span>`;
}

function markActive(id, instant) {
  const brandId = state.view === "gear" ? id.split("/")[0] : null;
  const match = (b) => (brandId ? b.dataset.brand === brandId : b.dataset.id === id);
  document.querySelectorAll("#strip button").forEach((b) => b.setAttribute("aria-current", String(match(b))));
  const active = [...document.querySelectorAll("#strip button")].find(match);
  if (active) {
    const s = $("#strip");
    const left = active.parentElement.offsetLeft - s.clientWidth / 2 + active.offsetWidth / 2;
    s.scrollTo({ left: Math.max(0, left), behavior: instant || REDUCED ? "auto" : "smooth" });
  }
  const l = list();
  $("#vIndex").textContent = pad(Math.max(1, l.findIndex((x) => x.id === id) + 1));
  $("#vTotal").textContent = pad(l.length);
}

/* ───────── Showing an item ───────── */
let stage = null;
let shown = { view: null, value: 0 };

function showPeak(id, { instant = false, textOnly = false } = {}) {
  const base = peaks.find((x) => x.id === id);
  if (!base) return;
  const p = loc(base);
  state.peaks.current = id;
  markActive(id, instant);

  $("#vName").textContent = p.name; fitName();
  scramble($("#vName"), p.name);
  scramble($("#vRange"), p.range.toUpperCase(), 500);
  $("#vLocal").textContent = p.local;
  $("#vDesc").textContent = p.desc;
  $("#vDiff").hidden = true;
  $("#vLines").hidden = true;
  countTo($("#vAlt"), shown.view === "peaks" ? conv(shown.value) : 0, conv(p.alt));
  $("#vUnit").textContent = unit();
  shown = { view: "peaks", value: p.alt };
  renderMeta([
    { label: t("country"), value: p.country },
    { label: t("ascent"), value: p.ascent },
    { label: t("climbers"), value: p.climbers, opt: true },
    { label: t("coords"), value: p.coords, opt: true }
  ]);
  const m = $("#marker");
  if (m) { m.style.top = `${(1 - p.alt / 9000) * 100}%`; m.querySelector("span").textContent = `${altNum(p.alt)} ${unit()}`; }

  if (stage && !textOnly) stage.setPeak(base, instant);
}

function showRoute(id, { instant = false, textOnly = false } = {}) {
  const base = routes.find((x) => x.id === id);
  if (!base) return;
  const r = locR(base);
  state.routes.current = id;
  markActive(id, instant);

  $("#vName").textContent = r.name; fitName();
  scramble($("#vName"), r.name);
  scramble($("#vRange"), `${t(REGION_KEY[r.region])} · ${t(TYPE_KEY[r.type])}`.toUpperCase(), 500);
  const tail = r.loop ? ` · ${t("loop")}` : r.outBack ? ` · ${t("outBack")}` : "";
  $("#vLocal").textContent = r.loop || r.outBack ? `${r.start}${tail}` : `${r.start} → ${r.end}`;
  $("#vDesc").textContent = r.desc;
  $("#vLines").hidden = true;
  $("#vDiff").hidden = false;
  $("#vDiff").innerHTML = `<span class="dots" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= r.difficulty ? "on" : ""}"></b>`).join("")}</span>
    <span class="dl">${esc(t("difficulty"))}</span> <span class="dv">${esc(t("diff" + r.difficulty))}</span>`;
  countTo($("#vAlt"), shown.view === "routes" ? dist(shown.value) : 0, dist(r.km), fmt1);
  $("#vUnit").textContent = distUnit();
  shown = { view: "routes", value: r.km };
  const days = r.days === "1" ? t("dayOne") : t("daysFmt").replace("{n}", r.days);
  renderMeta([
    { label: t("duration"), value: days },
    { label: t("season"), html: seasonBar(r.season) },
    { label: t("highPoint"), value: `${altNum(r.maxAlt)} ${unit()}`, opt: true },
    { label: t("ascent2"), value: `${altNum(r.gain)} ${unit()}`, opt: true }
  ]);

  if (stage && !textOnly) stage.setRoute(base, instant);
}

// Weight as [number, unit]: g / kg, or oz / lb. null → "—".
function weightParts(g) {
  if (g == null) return ["—", ""];
  const f1 = (v) => v.toLocaleString(langInfo().locale, { maximumFractionDigits: 1 });
  if (metric()) return g >= 1000 ? [f1(g / 1000), "kg"] : [fmt(g), "g"];
  const oz = g * 0.035274;
  return oz >= 16 ? [f1(oz / 16), "lb"] : [f1(oz), "oz"];
}

function showGear(id, { instant = false, textOnly = false } = {}) {
  const base = gearItems.find((x) => x.id === id);
  if (!base) return;
  const it = locG(base), b = base.brand;
  state.gear.current = id;
  markActive(id, instant);

  $("#vName").textContent = b.name; fitName();
  scramble($("#vName"), b.name);
  scramble($("#vRange"), `${it.name} · ${t("cat_" + it.cat)}`.toUpperCase(), 500);
  $("#vLocal").textContent = `${b.city}, ${countryL(b.country)} · ${b.founded}`;
  $("#vDesc").textContent = it.desc;
  const [num, u] = weightParts(it.g);
  scramble($("#vAlt"), (it.g == null ? "" : "≈ ") + num, 600);
  $("#vUnit").textContent = u;
  shown = { view: "gear", value: 0 };
  $("#vDiff").hidden = false;
  $("#vDiff").innerHTML = `<span class="dl">${esc(t("typWeight"))}</span>
    <span class="uses">${["day", "trek", "alpine"].map((k) =>
      `<i class="${it.use.includes(k) ? "on" : ""}">${esc(t(k === "day" ? "typeDay" : k === "trek" ? "typeTrek" : "useAlpine"))}</i>`).join("")}</span>`;
  // This brand's product lines — ↑ ↓ steps through them
  const inFilter = new Set(list().map((x) => x.id));
  $("#vLines").hidden = false;
  $("#vLines").innerHTML = b.lines.map((l) => {
    const lid = `${b.id}/${l.id}`;
    return `<button type="button" data-id="${lid}" aria-current="${lid === id}"${inFilter.has(lid) ? "" : " disabled"}>${esc(l.name)}</button>`;
  }).join("");
  renderMeta([
    { label: t("models"), value: it.models.join(" · ") },
    { label: t("category"), value: t("cat_" + it.cat) },
    { label: t("origin"), value: `${b.city} · ${countryL(b.country)}`, opt: true },
    { label: t("founded"), value: String(b.founded), opt: true }
  ]);

  if (stage && !textOnly) stage.setGear(base, instant);
}

const show = (id, opts) => (state.view === "gear" ? showGear(id, opts) : state.view === "routes" ? showRoute(id, opts) : showPeak(id, opts));

// Gear only: jump to the previous / next brand (first line of that brand within the filter).
function goBrand(delta) {
  const l = list();
  const order = [...new Set(l.map((x) => x.brand.id))];
  const cur = state.gear.current.split("/")[0];
  const next = order[(order.indexOf(cur) + delta + order.length) % order.length];
  show(l.find((x) => x.brand.id === next).id);
}

function go(delta) {
  const l = list();
  const i = l.findIndex((x) => x.id === S().current);
  show(l[(i + delta + l.length) % l.length].id);
}

function setView(view, { instant = false } = {}) {
  state.view = view;
  $(".viewer").dataset.view = view;
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === view)));
  // (while the entry page is open the address stays bare, so reloading shows the entry again)
  if (document.getElementById("entry")?.hidden !== false) { try { history.replaceState(null, "", "#" + view); } catch { /* file:// */ } }
  $("#vHint").textContent = t(view === "gear" ? "hintGear" : "hint");
  renderFilters(); renderStrip();
  show(S().current, { instant });
}

/* ───────── Wiring ───────── */
// CJK fonts are large, so each is only fetched when its language is chosen.
const CJK_FONTS = {
  ja: "Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@400;500",
  ko: "Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@400;500",
  zh: "Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@400;500"
};
function loadFonts(lang) {
  if (!CJK_FONTS[lang] || document.getElementById(`font-${lang}`)) return;
  const link = Object.assign(document.createElement("link"), {
    id: `font-${lang}`, rel: "stylesheet",
    href: `https://fonts.googleapis.com/css2?family=${CJK_FONTS[lang]}&display=swap`
  });
  link.onload = () => document.fonts.ready.then(fitName);
  document.head.appendChild(link);
}

function applyLang(lang) {
  state.lang = lang;
  store.set("sl-lang", lang);
  document.documentElement.lang = langInfo().html;
  loadFonts(lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

function applyUnits() {
  document.querySelectorAll("[data-units]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.units === state.units)));
  if (stage) stage.setPeakContour(metric() ? 500 : 1500 / M_TO_FT);
  renderStrip(); renderRuler();
}

$("#langs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (!b || b.dataset.lang === state.lang) return;
  applyLang(b.dataset.lang);
  $("#vHint").textContent = t(state.view === "gear" ? "hintGear" : "hint");
  renderFilters(); renderStrip(); renderRuler();
  show(S().current, { instant: true, textOnly: true });
});

document.querySelector(".units").addEventListener("click", (e) => {
  const b = e.target.closest("[data-units]");
  if (!b || b.dataset.units === state.units) return;
  state.units = b.dataset.units;
  store.set("ta-units", state.units);
  applyUnits();
  show(S().current, { instant: true, textOnly: true });
});

if (!GEAR_ON) document.querySelector('.nav [data-view="gear"]')?.remove();
document.querySelector(".nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view]");
  if (b && b.dataset.view !== state.view) setView(b.dataset.view);
});
addEventListener("hashchange", () => {
  const v = viewFromHash();
  if (v !== state.view) setView(v);
});
$("#vLines").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b && !b.disabled && b.dataset.id !== S().current) show(b.dataset.id);
});

$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  S().filter = b.dataset.filter;
  renderFilters(); renderStrip();
  const l = list();
  show(l.some((x) => x.id === S().current) ? S().current : l[0].id);
});
$("#strip").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b && b.dataset.id !== S().current) show(b.dataset.id);
});
$("#prevBtn").addEventListener("click", () => go(-1));
$("#nextBtn").addEventListener("click", () => go(1));
document.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea")) return;
  const gear = state.view === "gear";
  // In Gear, ← → change brand and ↑ ↓ change product line; elsewhere all four step items.
  if (e.key === "ArrowRight") { e.preventDefault(); gear ? goBrand(1) : go(1); }
  if (e.key === "ArrowLeft") { e.preventDefault(); gear ? goBrand(-1) : go(-1); }
  if (e.key === "ArrowDown") { e.preventDefault(); go(1); }
  if (e.key === "ArrowUp") { e.preventDefault(); go(-1); }
});

// The page never scrolls: a scroll gesture steps to the next / previous item.
// While a gesture (incl. trackpad inertia) keeps arriving, stay locked to one step.
let wheelAcc = 0, wheelLock = 0;
addEventListener("wheel", (e) => {
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  if (horizontal && e.target.closest(".strip-list, .filters")) return; // let the strip scroll sideways
  e.preventDefault();
  if (horizontal) return;
  const now = performance.now();
  if (now < wheelLock) { wheelLock = Math.max(wheelLock, now + 180); return; }
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 40) { go(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; wheelLock = now + 900; }
}, { passive: false });

// Touch: swipe on the text area to browse (dragging the terrain rotates it).
let touch0 = null;
$(".viewer").addEventListener("touchstart", (e) => {
  touch0 = e.target.closest("#stage, .strip, button") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
$(".viewer").addEventListener("touchend", (e) => {
  if (!touch0) return;
  const dx = e.changedTouches[0].clientX - touch0.x, dy = e.changedTouches[0].clientY - touch0.y;
  touch0 = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 45) return;
  if (Math.abs(dx) > Math.abs(dy)) (state.view === "gear" ? goBrand : go)(dx < 0 ? 1 : -1);
  else go(dy < 0 ? 1 : -1);
}, { passive: true });

addEventListener("resize", fitName);

renderLangs();
applyLang(state.lang);
applyUnits();
setView(state.view, { instant: true });
document.fonts?.ready.then(fitName);
document.fonts?.addEventListener?.("loadingdone", fitName);
document.fonts?.load?.("800 96px Archivo").then(fitName, () => {});

try {
  stage = await createStage($("#stage"));
  stage.setPeakContour(metric() ? 500 : 1500 / M_TO_FT);
  // rise from flat on load
  if (state.view === "routes") stage.setRoute(routes.find((r) => r.id === state.routes.current), false);
  else if (state.view === "gear") stage.setGear(gearItems.find((x) => x.id === state.gear.current), false);
  else stage.setPeak(peaks.find((p) => p.id === state.peaks.current), false);
} catch (err) {
  console.error(err);
  $("#stage").hidden = true;
  $("#fallback").hidden = false;
}
