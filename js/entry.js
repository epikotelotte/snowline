/* Snow Line — the entry page.
   The whole screen is a mountain range of stacked dot ridgelines, cut by one line: the snow line.
   Above it the world is frozen (still, white); below it everything melts and moves (aurora dots
   drifting downhill). Hover a side and that world grows; choose it and you fall through the line
   into Peaks (above) or Routes (below). The logo in the top bar brings you back here. */
const root = document.getElementById("entry");
const main = document.querySelector("main.viewer");
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOUCH = matchMedia("(hover: none)").matches;

/* ── text, in the visitor's language (same rule as the main page) ── */
const I18N = window.I18N;
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } } };
function lang() {
  const codes = I18N.langs.map((l) => l.code), saved = store.get("sl-lang", null);
  if (codes.includes(saved)) return saved;
  for (const n of navigator.languages || [navigator.language]) { const c = String(n).slice(0, 2).toLowerCase(); if (codes.includes(c)) return c; }
  return "en";
}
const t = (k) => I18N.ui[lang()]?.[k] ?? I18N.ui.en[k];
const imperial = () => store.get("ta-units", "metric") === "imperial";
function applyText() {
  root.querySelectorAll("[data-e]").forEach((el) => { el.textContent = t(el.dataset.e); });
  root.querySelector("#eHint").textContent = t(TOUCH ? "entryHintTouch" : "entryHint");
}

/* ── canvas ── */
const c = root.querySelector("canvas"), x = c.getContext("2d");
let W = 0, H = 0;
function size() {
  const d = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  c.width = W * d; c.height = H * d;
  x.setTransform(d, 0, 0, d, 0, 0);
}

// ridged value noise for the range
const P = new Uint8Array(512);
{ let s = 7; for (let i = 0; i < 256; i++) P[i] = i; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[i + 256] = P[i]; }
const fade = (v) => v * v * (3 - 2 * v);
function n1(a, b) {
  const xi = Math.floor(a) & 255, yi = Math.floor(b) & 255, xf = a - Math.floor(a), yf = b - Math.floor(b);
  const p = P[P[xi] + yi] / 255, q = P[P[xi + 1] + yi] / 255, r = P[P[xi] + yi + 1] / 255, s = P[P[xi + 1] + yi + 1] / 255, u = fade(xf), v = fade(yf);
  return p + (q - p) * u + (r - p) * v + (p - q - r + s) * u * v;
}
function ridge(a, b) { let s = 0, amp = 0.55, f = 1; for (let o = 0; o < 5; o++) { s += amp * (1 - Math.abs(n1(a * f, b * f) * 2 - 1)); amp *= 0.5; f *= 2.03; } return s; }

const AU = [[108, 255, 168], [52, 224, 200], [90, 168, 255], [167, 123, 255], [255, 111, 200]];
const AUS = Array.from({ length: 64 }, (_, i) => {
  const v = (i / 63) * 3.999, k = v | 0, f = v - k, a = AU[k], b = AU[k + 1];
  return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
});
const aurora = (v) => AUS[Math.max(0, Math.min(63, (v * 63) | 0))];

const ROWS = 54;
const MAX_ALT = 8849;
// stacked ridgelines, far (top) to near (bottom); one dominant massif just right of centre
let cache = null;
function build() {
  const step = W > 900 ? 4 : 3, rows = [];
  for (let r = 0; r < ROWS; r++) {
    const z = r / (ROWS - 1), by = H * (0.3 + z * 0.78), A = H * (0.44 - z * 0.2), pts = [];
    for (let px = -step; px <= W + step; px += step) {
      const u = px / W, pk = (cx, w) => Math.exp(-(((u - cx) / w) ** 2));
      const massif = (pk(0.64, 0.1) * 1.25 + pk(0.53, 0.07) * 0.55 + pk(0.33, 0.11) * 0.6 + pk(0.88, 0.07) * 0.45) * (1 - z * 0.7);
      const h = (ridge(u * 4.5 + r * 0.09, r * 0.06) * (0.35 + 0.25 * z) + massif) * (1 - z * 0.45);
      pts.push(px, by - h * A);
    }
    rows.push({ z, pts });
  }
  cache = { step, rows };
}

/* ── the snow line ── */
let lineY = 0, target = 0, mx = -1, my = -1, side = 0, leaving = 0, leaveTo = null, running = false, visible = false;
const altAt = (y) => Math.max(0, Math.min(MAX_ALT, (1 - (y - H * 0.12) / (H * 0.8)) * MAX_ALT));
const el = {
  snow: root.querySelector(".e-snow"), line: root.querySelector(".e-line"), alt: root.querySelector(".e-alt"),
  def: root.querySelector(".e-def"), up: root.querySelector(".e-up"), down: root.querySelector(".e-down")
};

function draw(now) {
  const T = now / 1000;
  if (leaving) {
    const k = Math.min(1, (now - leaving) / 1000);
    target = leaveTo === "peaks" ? H * (0.5 + 0.75 * k * k) : H * (0.5 - 0.75 * k * k);
  } else if (side) target = H * (0.5 + side * 0.17);
  else target = H * (0.5 + (REDUCED ? 0 : 0.05 * Math.sin(T * 0.35)));
  lineY += (target - lineY) * (REDUCED ? 1 : leaving ? 0.22 : 0.07);

  x.fillStyle = "#020203";
  x.fillRect(0, 0, W, H);
  const { step, rows } = cache;
  for (let r = 0; r < rows.length; r++) {
    const { z, pts } = rows[r];
    // each ridge hides the ones behind it
    x.beginPath(); x.moveTo(-10, H + 10);
    for (let i = 0; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
    x.lineTo(W + 10, H + 10); x.closePath();
    x.fillStyle = "#020203"; x.fill();
    const aFrozen = 0.35 + 0.6 * (1 - z * 0.6), aMelt = 0.4 + 0.6 * (1 - z * 0.4);
    for (let i = 0, n = 0; i < pts.length; i += 2, n++) {
      const px = pts[i], py = pts[i + 1];
      if (py < lineY) {           // frozen: still, white, crisp
        x.globalAlpha = aFrozen;
        x.fillStyle = "#f2f2ee";
        x.fillRect(px, py, 1.6, 1.6);
      } else {                    // melting: drifting downhill in aurora colours
        const flow = REDUCED ? 0.8 : (T * 0.9 + n * 0.045 - r * 0.13) % 1;
        const drift = REDUCED ? 0 : Math.sin(T * 1.3 + n * 0.21 + r) * 1.2;
        x.globalAlpha = aMelt * (0.35 + 0.65 * flow);
        x.fillStyle = aurora(0.1 + (1 - (py - lineY) / (H - lineY + 1)) * 0.5 + 0.15 * Math.sin(T * 0.4 + px * 0.006 + r * 0.2));
        x.fillRect(px, py + drift, 1.7, 1.7);
      }
    }
  }
  x.globalAlpha = 1;
  const ly = Math.round(lineY);
  x.fillStyle = "rgba(242,242,238,.92)";
  x.fillRect(0, ly, W, 1);
  // altimeter ticks
  x.fillStyle = "rgba(242,242,238,.28)";
  for (let a = 0; a <= MAX_ALT; a += 500) x.fillRect(W - 18, H * 0.12 + (1 - a / MAX_ALT) * H * 0.8, a % 1000 ? 5 : 10, 1);
  if (mx >= 0 && !TOUCH) { x.fillStyle = "#fff"; x.fillRect(mx - 7, my, 15, 1); x.fillRect(mx, my - 7, 1, 15); }

  // the type rides on the line
  root.style.setProperty("--ly", ly + "px");
  const a = altAt(lineY);
  el.alt.textContent = imperial()
    ? `${(Math.round((a * 3.28084) / 10) * 10).toLocaleString("en").replace(/,/g, " ")} FT`
    : `${(Math.round(a / 10) * 10).toLocaleString("en").replace(/,/g, " ")} M`;
  el.up.classList.toggle("on", side === 1); el.up.classList.toggle("off", side === -1);
  el.down.classList.toggle("on", side === -1); el.down.classList.toggle("off", side === 1);
}

function frame(now) {
  if (!visible) { running = false; return; }
  draw(now);
  if (leaving && now - leaving > 1000) return finish();
  if (REDUCED && !leaving) { running = false; return; }   // one still frame
  requestAnimationFrame(frame);
}
const kick = () => { if (!running && visible) { running = true; requestAnimationFrame(frame); } };

/* ── entering and leaving ── */
function choose(view) {
  if (leaving || !visible) return;
  leaveTo = view;
  // the main page switches behind the entry while the line falls away
  if (location.hash !== "#" + view) location.hash = view;
  if (REDUCED) return finish();
  leaving = performance.now();
  root.classList.add("leaving");
  kick();
}
function finish() {
  leaving = 0;
  running = false;
  root.classList.add("gone");
  main.inert = false;
  setTimeout(() => { root.hidden = true; root.classList.remove("gone", "leaving"); visible = false; }, REDUCED ? 0 : 600);
}
function open() {
  visible = true;
  root.hidden = false;
  main.inert = true;
  applyText();
  size(); build();
  lineY = target = H * 0.5; side = 0; mx = my = -1;
  kick();
  root.querySelector(".e-up").focus({ preventScroll: true });
}

addEventListener("resize", () => { if (!visible) return; size(); build(); kick(); });
root.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  mx = e.clientX; my = e.clientY; side = my < lineY ? 1 : -1; kick();
});
root.addEventListener("pointerleave", () => { mx = my = -1; side = 0; });
root.addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  choose(b ? b.dataset.go : e.clientY < lineY ? "peaks" : "routes");
});
root.addEventListener("focusin", (e) => { const b = e.target.closest("[data-go]"); if (b) { side = b.dataset.go === "peaks" ? 1 : -1; kick(); } });
root.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") { root.querySelector(".e-up").focus(); e.preventDefault(); }
  if (e.key === "ArrowDown") { root.querySelector(".e-down").focus(); e.preventDefault(); }
});

// The logo returns to the entry; Back from a section does too.
document.querySelector(".brand")?.addEventListener("click", (e) => {
  e.preventDefault();
  history.pushState(null, "", location.pathname + location.search);
  open();
});
addEventListener("popstate", () => { if (!location.hash) open(); });
addEventListener("hashchange", () => { if (location.hash && visible && !leaving) finish(); });

if (location.hash) { root.hidden = true; main.inert = false; } else open();
