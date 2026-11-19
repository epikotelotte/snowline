/* Snow Line — gear reliefs.
   Every product line gets its own embossed relief, drawn from 2D signed-distance shapes
   (negative inside). Silhouettes are raised; seams, zips, baffles, lugs, vents and straps are
   carved in or built up, so the light-dot contour lines trace each product's character.
   Coordinates: u → right, v → up; objects sit within a radius of about 0.85. */

const { abs, min, max, hypot, sin, cos, atan2, sqrt, floor, PI } = Math;
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sm = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - floor(x);

/* ───────── Shapes (signed distance) ───────── */
const box = (u, v, cx, cy, hx, hy, r = 0) => {
  const qx = abs(u - cx) - hx + r, qy = abs(v - cy) - hy + r;
  return hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r;
};
const circ = (u, v, cx, cy, r) => hypot(u - cx, v - cy) - r;
const seg = (u, v, ax, ay, bx, by, r = 0) => {
  const px = u - ax, py = v - ay, vx = bx - ax, vy = by - ay;
  const h = sat((px * vx + py * vy) / (vx * vx + vy * vy));
  return hypot(px - vx * h, py - vy * h) - r;
};
const ell = (u, v, cx, cy, rx, ry) => (hypot((u - cx) / rx, (v - cy) / ry) - 1) * min(rx, ry);
// closed polygon from a flat [x0,y0, x1,y1, …] list
function poly(u, v, P) {
  const n = P.length / 2;
  let d = (u - P[0]) ** 2 + (v - P[1]) ** 2, s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const xi = P[2 * i], yi = P[2 * i + 1], xj = P[2 * j], yj = P[2 * j + 1];
    const ex = xj - xi, ey = yj - yi, wx = u - xi, wy = v - yi;
    const h = sat((wx * ex + wy * ey) / (ex * ex + ey * ey));
    const bx = wx - ex * h, by = wy - ey * h;
    d = min(d, bx * bx + by * by);
    const c1 = v >= yi, c2 = v < yj, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * sqrt(d);
}
// open polyline (a strap, a hose, a curved shaft)
function path(u, v, P, r = 0) {
  let d = 1e9;
  for (let i = 0; i + 3 < P.length; i += 2) d = min(d, seg(u, v, P[i], P[i + 1], P[i + 2], P[i + 3]));
  return d - r;
}
// right half outline [[x,y]…] (top → bottom, ending on the axis) mirrored into a full polygon
function mirror(half) {
  const out = [];
  for (const [x, y] of half) out.push(x, y);
  for (let i = half.length - 1; i >= 0; i--) if (half[i][0] !== 0) out.push(-half[i][0], half[i][1]);
  return out;
}

/* ───────── Height helpers ───────── */
const fill = (d, b = 0.02) => sm(0, b, -d);                                   // flat plateau
const puff = (d, r) => { const t = sat(-d / r); return sqrt(t * (2 - t)); };  // rounded cushion
const line = (d, w = 0.011) => 1 - sm(w, w * 1.9, abs(d));                    // thin line on a shape's edge
const dot = (u, v, cx, cy, r) => fill(circ(u, v, cx, cy, r), 0.012);
const mesh = (u, v, f = 22) => {                                              // diamond mesh texture, 0…1
  const a = abs(fract((u + v) * f) - 0.5), b = abs(fract((u - v) * f) - 0.5);
  return 1 - sm(0.08, 0.16, min(a, b));
};

/* ───────── Apparel: front view, hood at the top ───────── */
function jacket(o) {
  const w = o.w ?? 0.29, top = o.top ?? 0.42, hem = o.hem ?? -0.6, drop = o.drop ?? 0.03;
  const wy = o.wristY ?? max(hem + 0.08, -0.56), wx = w + 0.23 * (o.spread ?? 1);
  const P = mirror([[0.1, top + 0.03], [w + 0.06, top - 0.04], [wx + 0.1, wy + 0.04], [wx - 0.05, wy - 0.05],
    [w + 0.01, top - 0.36], [w + (o.flare ?? 0.015), hem], [0, hem - drop]]);
  const hooded = o.hood === "hood" || o.hood === "helmet" || o.hood === "fur";
  const hs = o.hood === "helmet" ? 1.15 : o.hood === "fur" ? 1.28 : 1;
  // sleeve axis (right side): s = 0 at the shoulder … 1 at the cuff
  const ax = w + 0.08, ay = top - 0.14, bx = wx + 0.025, by = wy;
  const sl = hypot(bx - ax, by - ay), dx = (bx - ax) / sl, dy = (by - ay) / sl;
  const zip = o.zip ?? (o.crew ? "none" : "full");
  return (u, v) => {
    const au = abs(u);
    let d = poly(u, v, P), hood = 1e3, face = 1e3;
    if (hooded) {
      hood = ell(u, v, 0, top + 0.12 * hs, 0.18 * hs, 0.155 * hs);
      face = ell(u, v, 0, top + 0.1 * hs, 0.095 * hs, 0.08 * hs);
      d = min(d, hood);
    } else if (o.hood === "collar") d = min(d, box(u, v, 0, top + 0.035, 0.12, 0.05, 0.03));
    else if (o.hood === "stand") d = min(d, box(u, v, 0, top + 0.055, 0.15, 0.075, 0.045));
    if (o.crew) d = max(d, -circ(u, v, 0, top + 0.07, 0.11));
    if (d > 0.03) return 0;
    let h = 0.6 * puff(d, o.loft ?? 0.07);
    const sleeve = au > w + 0.012 && v > wy - 0.12;
    const s = ((au - ax) * dx + (v - ay) * dy) / sl, n = (au - ax) * dy - (v - ay) * dx;

    // hood: face opening, helmet brim, fur ruff, seam to the body
    if (hooded) {
      h -= 0.3 * fill(face, 0.035);
      h -= 0.1 * line(hood) * sm(top - 0.05, top - 0.02, v) * (v < top + 0.02 ? 1 : 0);
      if (o.hood === "helmet") h += 0.13 * line(face - 0.03, 0.018);
      if (o.hood === "fur") {
        const a = atan2(v - top - 0.1 * hs, u);
        const ruff = face - 0.05 - 0.015 * sin(a * 38);
        h += 0.16 * fill(ruff, 0.02) * (1 - fill(face, 0.01)) * (0.7 + 0.3 * sin(a * 90));
      }
    }
    if (o.hood === "collar" || o.hood === "stand") h -= 0.08 * line(v - top - 0.005) * (au < 0.14 ? 1 : 0);

    // insulation baffles (horizontal on the body, across the sleeves)
    if (o.baffle && hood > 0) {
      const yokeY = o.yoke ? top - 0.1 - 0.28 * sat((au - w + 0.04) / 0.26) : o.flatShoulders ? top - 0.1 : 9;
      if (v < yokeY) {
        const pos = sleeve ? s * sl : v + (o.wave ? o.wave * sin(u * 17) : 0) - hem;
        const b = sin(PI * fract(pos / o.baffle));
        h += (o.bA ?? 0.18) * (sqrt(b) - 0.75);
      } else h += o.yoke ? 0.08 : 0;
      if (o.yoke || o.flatShoulders) h -= 0.12 * line(v - yokeY, 0.012);
    }
    // set-in or raglan sleeve seams, cuffs, elbows
    if (o.raglan) h -= 0.09 * line(seg(au, v, 0.1, top + 0.03, w + 0.01, top - 0.36));
    else if (!o.baffle || o.yoke) h -= 0.08 * line(au - w - 0.012) * (v > top - 0.36 && v < top ? 1 : 0);
    if (o.cuffs && sleeve && s > 0.86) h += 0.06;
    if (o.cuffs && sleeve) h -= 0.08 * line((s - 0.86) * sl);
    if (o.elbows && sleeve && abs(n) < 0.07) h -= 0.1 * (line((s - 0.5) * sl) + line((s - 0.58) * sl) * 0.7);
    if (o.hemBand) { h += 0.05 * sm(hem + 0.08, hem + 0.06, v); h -= 0.08 * line(v - hem - 0.07) * (au < w ? 1 : 0); }

    // closures
    const zTop = hooded ? top + 0.02 : top + 0.08;
    if (zip === "full" && v < zTop) h -= 0.13 * line(u, 0.009);
    if (zip === "half" && v < zTop && v > top - 0.3) h -= 0.13 * line(u, 0.009);
    if (o.storm && v < zTop) h += 0.08 * line(u - 0.032, 0.022);
    if (o.buttons) {
      h += 0.06 * line(u - 0.03, 0.03) * (v < zTop ? 1 : 0);
      for (let i = 0; i < 6; i++) h += 0.13 * dot(u, v, 0.03, top - 0.06 - i * ((top - hem - 0.1) / 5.5), 0.02);
    }
    // pockets
    if (o.chestDiag) {
      const a = o.chestDiag === 2 ? au : -u;
      h -= 0.12 * line(seg(a, v, 0.07, top - 0.1, 0.19, top - 0.34));
      h += 0.12 * dot(a, v, 0.07, top - 0.1, 0.018);
    }
    if (o.chest1) { h -= 0.12 * line(seg(-u, v, 0.07, top - 0.17, 0.21, top - 0.17)); h += 0.1 * dot(-u, v, 0.21, top - 0.17, 0.016); }
    if (o.napoleon) h -= 0.12 * line(seg(-u, v, 0.08, top - 0.06, 0.08, top - 0.34));
    if (o.hand) {
      h -= 0.12 * line(seg(au, v, 0.1, hem + 0.44, 0.2, hem + 0.17));
      if (o.hand === "flap") h += 0.08 * fill(box(au, v, 0.155, hem + 0.32, 0.07, 0.025, 0.01)) * 1;
    }
    if (o.flap4) {
      for (const [cy, hy, fy] of [[top - 0.27, 0.1, top - 0.16], [hem + 0.15, 0.11, hem + 0.27]]) {
        h -= 0.08 * line(box(au, v, 0.16, cy, 0.09, hy, 0.015));
        h += 0.1 * fill(box(au, v, 0.16, fy, 0.095, 0.035, 0.012));
        h += 0.08 * dot(au, v, 0.16, fy - 0.01, 0.012);
      }
    }
    if (o.pit) h -= 0.11 * line(seg(au, v, w - 0.005, top - 0.52, w + 0.07, top - 0.3));
    // panels and textures
    if (o.princess) h -= 0.08 * line(seg(au, v, 0.2, top - 0.02, 0.16, hem + 0.02)) * (sleeve ? 0 : 1);
    if (o.sidePanels && !sleeve && v < top - 0.34) {
      const inP = au > w - 0.075;
      h -= 0.08 * line(au - w + 0.075);
      if (inP) h -= 0.05 * sm(0.3, 0.4, max(abs(fract(u / 0.03) - 0.5), abs(fract(v / 0.03) - 0.5)));
    }
    if (o.grid) h -= 0.07 * sm(0.3, 0.42, max(abs(fract(u / 0.05) - 0.5), abs(fract(v / 0.05) - 0.5)));
    if (o.ribs && sleeve) h -= 0.05 * sm(0.3, 0.45, abs(fract(s * sl / 0.035) - 0.5));
    return max(0, h) * fill(d, 0.02);
  };
}

/* ───────── Footwear: side view, toe to the right ───────── */
const LUGS = {
  std: { depth: 0.032, freq: 22, duty: 0.55 }, deep: { depth: 0.055, freq: 15, duty: 0.5 },
  mountain: { depth: 0.042, freq: 13, duty: 0.62, brake: true }, sticky: { depth: 0.018, freq: 30, duty: 0.6 },
  climb: { depth: 0.022, freq: 26, duty: 0.6, climb: true }, flat: { depth: 0.012, freq: 34, duty: 0.6 }
};
function shoe(o) {
  const G = -0.34, t = o.sole ?? 0.085, rk = o.rocker ?? 0.3, lvl = o.shaft ?? 0;
  const base = (x) => G + rk * 0.11 * sm(0.12, 0.7, x) ** 2 + rk * 0.04 * sm(-0.42, -0.7, x);
  const sTop = (x) => base(x) + t;
  const S0 = G + t, heelX = -0.62, toeX = 0.68;
  const H = o.collar ?? [0.27, 0.43, 0.56, 0.84][lvl];
  const fx = o.front ?? [-0.12, -0.13, -0.1, 0.0][lvl];
  const P = [
    heelX + 0.03, S0 - 0.02, heelX - 0.015, S0 + 0.1, heelX + (lvl ? 0.04 : 0.02), S0 + H,
    -0.36, S0 + H - (lvl ? 0.01 : 0.075), fx, S0 + H + 0.03,
    0.14, sTop(0.14) + 0.2 + (lvl === 3 ? 0.04 : 0), 0.46, sTop(0.46) + 0.14 + (o.toeBox ?? 0),
    0.63, sTop(0.63) + 0.08 + (o.toeBox ?? 0) * 0.6, toeX, sTop(toeX) + 0.02, toeX - 0.03, sTop(toeX) - 0.03
  ];
  const lug = LUGS[o.lug ?? "std"];
  const flare = o.flare ?? 0;
  // the lacing runs parallel to the front edge of the shaft and vamp, just inside it
  const F0 = [fx, S0 + H + 0.03], F1 = [0.14, sTop(0.14) + 0.2 + (lvl === 3 ? 0.04 : 0)];
  const fl = hypot(F1[0] - F0[0], F1[1] - F0[1]), fdx = (F1[0] - F0[0]) / fl, fdy = (F1[1] - F0[1]) / fl;
  const L0 = [F0[0] + fdx * 0.05 + fdy * 0.06, F0[1] + fdy * 0.05 - fdx * 0.06];
  const lx = o.laces === "toe" ? 0.5 : 0.3;
  const L1 = [lx, sTop(lx) + (lx < 0.46 ? 0.14 + (0.46 - lx) * 0.19 : 0.14) - 0.055];
  const ldx = L1[0] - L0[0], ldy = L1[1] - L0[1], llen = hypot(ldx, ldy);
  const nEy = o.laces === "quick" ? 12 : max(4, Math.round(llen / 0.07));
  return (u, v) => {
    const st = sTop(u), b = base(u);
    const dU = max(poly(u, v, P), st - v);
    const xL = heelX - 0.01 - flare - (o.welt ? 0.035 : 0), xR = toeX + 0.012 + (o.welt ? 0.03 : 0);
    const dS = max(b - v, v - st, xL - u, u - xR);
    const lugZone = v < b && v > b - lug.depth && u > xL + 0.02 && u < xR - 0.03;
    let lugOn = fract(u * lug.freq) < lug.duty;
    if (lug.brake && abs(u + 0.36) < 0.05) lugOn = false;
    if (lug.climb && u > 0.38) lugOn = true;
    if (dU > 0.02 && dS > 0.02 && !lugZone) {
      // things outside the shoe body: heel pull loop
      if (o.heelTab) return 0.5 * fill(seg(u, v, heelX + 0.02, S0 + H - 0.04, heelX - 0.035, S0 + H + 0.05, 0.016));
      return 0;
    }
    let h = 0;
    if (lugZone && lugOn) h = 0.36;
    if (dS < 0.02) {
      const k = sat((v - b) / t);
      h = max(h, (0.42 + 0.08 * k) * fill(dS, 0.012));
      h -= 0.1 * line(v - b - t * (o.hoka ? 0.28 : 0.35));                               // outsole / midsole join
      if (o.plate) h += 0.08 * line(v - b - t * 0.62, 0.008);                              // propulsion plate
      if (o.hoka) h -= 0.07 * line(v - b - t * (0.62 + 0.12 * sin(u * 5 + 1)));          // sculpted midsole
      if (o.wave) h -= 0.07 * line(v - b - t * (0.6 + 0.15 * sin(u * 11)));
    }
    if (dU < 0.02) {
      let hu = 0.66 * puff(dU, 0.1);
      const ins = fill(dU, 0.015);
      // laces, tongue and eyelets
      const s = ((u - L0[0]) * ldx + (v - L0[1]) * ldy) / (llen * llen);
      const pc = ((u - L0[0]) * ldy - (v - L0[1]) * ldx) / llen;
      if (s > -0.02 && s < 1.02 && abs(pc) < 0.1) {
        const q = fract(s * nEy) - 0.5, qd = q * llen / nEy;
        if (abs(pc) < 0.04) hu += 0.04;
        const barW = o.laces === "quick" ? 0.006 : 0.011;
        if (abs(pc) < 0.036) hu += 0.16 * line(qd, barW);
        const hook = o.hooks && s < 0.38;
        hu += 0.16 * fill(hypot(qd, abs(pc) - (hook ? 0.06 : 0.046)) - (hook ? 0.022 : 0.015), 0.01);
        if (o.eyestay) { hu += 0.04 * (abs(pc) < 0.085 ? 1 : 0); hu -= 0.07 * line(abs(pc) - 0.085); }
      }
      if (o.laces === "quick") hu += 0.08 * fill(box(u, v, L0[0] + 0.01, L0[1] + 0.035, 0.035, 0.02, 0.01));
      // rubber rand, heel counter, chassis
      const above = v - st;
      if (o.rand === "full") { hu += 0.07 * sm(0.075, 0.06, above); hu -= 0.08 * line(above - 0.068); }
      if (o.rand === "toe") {
        const toe = max(0.44 - u, above - 0.085);
        hu += 0.08 * fill(toe, 0.015); hu -= 0.08 * line(toe);
      }
      if (o.counter) { const c = circ(u, v, heelX, S0, 0.25); hu += 0.05 * fill(c, 0.01); hu -= 0.08 * line(c); }
      if (o.chassis) {
        const c = poly(u, v, [-0.56, S0 + 0.005, -0.22, S0 + 0.005, -0.47, S0 + 0.19]);
        hu += 0.09 * fill(c, 0.01); hu -= 0.06 * line(c);
      }
      if (o.chevrons && u > -0.3 && u < 0.32 && above > 0.03) hu += 0.08 * line(fract((u - above * 0.7) * 7) - 0.5, 0.05);
      if (o.suede) { hu -= 0.08 * line(circ(u, v, 0.08, S0 + 0.02, 0.3)) * (v > S0 + 0.06 ? 1 : 0); hu -= 0.07 * line(u + 0.36) * (above > 0.02 ? 1 : 0); }
      if (o.flex) hu -= 0.1 * line(circ(u, v, -0.24, S0 + 0.14, 0.22)) * (v > S0 + 0.28 ? 1 : 0);
      // collar: padded, or a knitted sock
      const collar = sm(S0 + H - 0.08, S0 + H - 0.03, v);
      if (o.collarPad) hu += 0.07 * collar;
      if (o.sock) hu += collar * 0.06 * (0.5 + 0.5 * sin(u * 120));
      // integrated gaiter: zip and top strap
      if (o.gaiter) {
        hu -= 0.14 * line(path(u, v, [fx - 0.1, S0 + H - 0.02, -0.07, S0 + 0.45, 0.2, sTop(0.2) + 0.12]), 0.013);
        hu += 0.07 * (v > S0 + H - 0.09 && v < S0 + H - 0.03 ? 1 : 0);
        hu -= 0.06 * line(v - S0 - 0.27) * (u < 0.1 ? 1 : 0);   // gaiter meets the inner boot
      }
      h = max(h, hu * ins);
    }
    if (o.welt) {                                                                   // crampon welts
      h += 0.12 * fill(box(u, v, heelX - 0.03, S0 - 0.01, 0.035, 0.014, 0.005));
      h += 0.1 * fill(box(u, v, toeX + 0.015, sTop(toeX) - 0.01, 0.03, 0.012, 0.005));
    }
    return max(0, h);
  };
}

/* ───────── Packs: front view ───────── */
function pack(o) {
  const w = o.w ?? 0.3, hh = o.h ?? 0.5, cy = o.cy ?? -0.08, r = o.r ?? 0.12, tp = o.taper ?? 0.08;
  const top = cy + hh, bot = cy - hh, iw = w - r;
  const P = [-iw * (1 - tp), top - r, iw * (1 - tp), top - r, iw, bot + r, -iw, bot + r];
  const lidH = o.lid === "float" ? 0.12 : o.lid === "small" ? 0.085 : 0;
  const lidW = w * (o.lid === "small" ? 0.62 : 0.84);
  return (u, v) => {
    const au = abs(u);
    const body = poly(u, v, P) - r;
    let d = body, lid = 1e3, side = 1e3, hip = 1e3;
    if (lidH) { lid = box(u, v, 0, top + lidH * 0.35, lidW, lidH, 0.07); d = min(d, lid); }
    if (o.roll) d = min(d, box(u, v, 0, top + 0.03, w * 0.86, 0.055, 0.03));
    if (o.side) { side = box(au, v, w - 0.02, bot + 0.19, 0.075, 0.18, 0.05); d = min(d, side); }
    if (o.hip) {
      const k = o.hip;
      hip = poly(au, v, [w - 0.06, bot + 0.27, w + 0.15 * k, bot + 0.21, w + 0.19 * k, bot + 0.07, w - 0.06, bot + 0.04]) - 0.03;
      d = min(d, hip);
    }
    if (o.handle) d = min(d, abs(ell(u, v, 0, top + lidH * 0.6 + 0.01, 0.07, 0.06)) - 0.014);
    if (d > 0.03) return 0;
    let h = 0.42 * puff(d, 0.04) + 0.22 * puff(body, 0.2);
    if (lidH) {
      h += 0.12 * fill(lid, 0.02); h -= 0.09 * line(lid);
      if (v > top + lidH * 0.3) h -= 0.11 * line(ell(u, v, 0, top + lidH * 0.3, lidW * 0.72, lidH * 0.55));
    }
    if (o.roll) {
      h += 0.06 * (abs(v - top - 0.03) < 0.05 ? 1 : 0) * (0.5 + 0.5 * cos((v - top) * 120));
      h += 0.1 * fill(box(au, v, w * 0.86, top - 0.06, 0.035, 0.04, 0.01));         // side buckles
    }
    if (o.side && side < 0) { h += 0.05; h += 0.05 * mesh(u, v, 26); h -= 0.08 * line(v - bot - 0.36) * (au > w - 0.1 ? 1 : 0); }
    if (o.hip && hip < 0.02 && body > 0) {
      h = max(h, 0.48 * puff(hip, 0.06));
      h -= 0.1 * line(seg(au, v, w + 0.02, bot + 0.18, w + 0.13 * o.hip, bot + 0.15));   // hip-belt pocket zip
    }
    if (o.meshFront) {
      const m = box(u, v, 0, bot + hh * 0.55, w * 0.72, hh * 0.5, 0.1);
      h += (0.06 + 0.06 * mesh(u, v)) * fill(m, 0.015); h += 0.07 * line(m + 0.012, 0.014) * (v > bot + hh ? 1 : 0);
    }
    if (o.uZip) { const z = box(u, v, 0, cy + 0.02, w * 0.6, hh * 0.56, 0.14); h -= 0.11 * line(z) * (v > cy - hh * 0.45 ? 1 : 0); }
    if (o.jZip) h -= 0.11 * line(path(u, v, [w * 0.5, top - 0.12, w * 0.5, bot + 0.25, w * 0.35, bot + 0.14, -w * 0.35, bot + 0.14]));
    if (o.zipTop && v > top - 0.14) h -= 0.11 * line(ell(u, v, 0, top - 0.14, w * 0.84, 0.2));
    if (o.sbag && v > bot + 0.04) h -= 0.11 * line(ell(u, v, 0, bot + 0.04, w * 0.76, 0.13));
    if (o.sideZip) h -= 0.1 * line(au - w + 0.06) * (v > bot + 0.1 && v < top - 0.15 ? 1 : 0);
    if (o.frame) h += 0.09 * line(au - w + 0.03, 0.013) * (v > bot + 0.05 && v < top - 0.05 ? 1 : 0);
    for (const y of o.straps ?? []) {
      const sy = cy + y * hh;
      h += 0.12 * fill(seg(au, v, w - 0.12, sy, w + 0.02, sy + 0.03, 0.014));
      h += 0.1 * fill(box(au, v, w - 0.12, sy, 0.022, 0.025, 0.006));
    }
    if (o.iceAxe) h += 0.12 * line(ell(au, v, 0.13, bot + 0.08, 0.03, 0.05), 0.012);
    if (o.daisy) h += 0.09 * (au < 0.022 && abs(fract(v / 0.07) - 0.5) < 0.22 && v > bot + 0.1 && v < top - 0.12 ? 1 : 0);
    if (o.bungee) h += 0.1 * line(path(au, v, [0.03, top - 0.15, w * 0.62, top - 0.28, 0.03, top - 0.41, w * 0.62, top - 0.54]), 0.008);
    if (o.handle && v > top) h += 0.15;
    return max(0, h) * fill(d, 0.015);
  };
}

/* ───────── Pads and bags: lying horizontally, head to the left ───────── */
function pad(o) {
  return (u, v) => {
    const d = o.mummy
      ? poly(u, v, [-0.66, 0.24, 0.66, 0.15, 0.66, -0.15, -0.66, -0.24]) - 0.05
      : box(u, v, 0, 0, 0.72, 0.27, 0.06);
    if (d > 0.03) return 0;
    let h = 0.5 * puff(d, 0.06);
    const s = o.tube ?? 0.07;
    const railW = o.rails ? 0.06 : 0;
    const railZone = o.rails && abs(v) > (o.mummy ? 0.2 : 0.21);
    if (railZone) h += 0.18 * sin(PI * sat((abs(v) - 0.21) / 0.06));
    else h += 0.16 * (sqrt(sin(PI * fract((u + (o.chevron ? abs(v) * 0.25 : 0)) / s))) - 0.6);
    if (railW) h -= 0.1 * line(abs(v) - 0.21);
    h += 0.16 * dot(u, v, 0.6, -0.12, 0.025); h += 0.12 * line(circ(u, v, 0.6, -0.12, 0.042), 0.01);  // valve
    return max(0, h) * fill(d, 0.02);
  };
}
function foamPad() {
  return (u, v) => {
    const d = box(u, v, 0, 0, 0.72, 0.27, 0.025);
    if (d > 0.03) return 0;
    const fold = 0.14, k = floor((u + 0.72) / fold);
    let h = 0.42 + (k % 2 ? 0.05 : 0);                              // accordion panels
    h += 0.12 * (0.5 + 0.5 * sin(u * 2 * PI / 0.07) * sin(v * 2 * PI / 0.07));   // egg-crate bumps
    h -= 0.16 * line(fract((u + 0.72) / fold) * fold, 0.012);       // fold lines
    return max(0, h) * fill(d, 0.015);
  };
}
function sleepingBag() {
  const P = [-0.5, 0.26, 0.6, 0.15, 0.6, -0.15, -0.5, -0.26];
  return (u, v) => {
    const d = min(poly(u, v, P) - 0.02, ell(u, v, -0.52, 0, 0.21, 0.27), ell(u, v, 0.6, 0, 0.1, 0.16));
    if (d > 0.03) return 0;
    let h = 0.55 * puff(d, 0.12);
    const face = ell(u, v, -0.56, 0.0, 0.1, 0.12);
    h -= 0.32 * fill(face, 0.03); h += 0.1 * line(face - 0.03, 0.02);              // hood opening and drawcord
    if (u > -0.38) {
      const b = sin(PI * fract((u + 0.03 * sin(v * 26)) / 0.1));                    // stretch-stitched baffles
      h += 0.16 * (sqrt(b) - 0.7);
    }
    h -= 0.1 * line(v - 0.17 + (u + 0.3) * 0.05) * (u > -0.36 && u < 0.3 ? 1 : 0);    // side zip
    h -= 0.08 * line(u + 0.36) * (abs(v) < 0.27 ? 1 : 0);                          // draft collar
    return max(0, h) * fill(d, 0.02);
  };
}

/* ───────── Tents: side or front elevation, ground at the bottom ───────── */
function tunnel(o) {
  const G = -0.34, hp = o.hoops, x0 = o.start, x1 = o.end;
  const first = hp[0], last = hp[hp.length - 1];
  const prof = (x) => {
    if (x <= x0 || x >= x1) return 0;
    if (x < first[0]) return first[1] * ((x - x0) / (first[0] - x0)) ** 0.8;
    if (x > last[0]) return last[1] * ((x1 - x) / (x1 - last[0])) ** 0.8;
    for (let i = 0; i < hp.length - 1; i++) {
      if (x <= hp[i + 1][0]) {
        const t = (x - hp[i][0]) / (hp[i + 1][0] - hp[i][0]);
        return hp[i][1] + (hp[i + 1][1] - hp[i][1]) * t - 0.025 * sin(PI * t);
      }
    }
    return 0;
  };
  return (u, v) => {
    const p = prof(u), d = max(v - G - p, G - v);
    let h = 0;
    if (d < 0.02) {
      h = 0.5 * puff(d, 0.08) * fill(d, 0.015);
      for (const [x] of hp) h += 0.17 * line(u - x, 0.013) * (v < G + p ? 1 : 0);                 // pole sleeves
      const dx = x0 + (first[0] - x0) * 0.55;
      h -= 0.1 * line(u - dx) * (v < G + prof(dx) - 0.03 ? 1 : 0);                                 // vestibule door zip
      h += 0.1 * fill(box(u, v, first[0] + 0.05, G + first[1] - 0.07, 0.04, 0.022, 0.01));          // vents
      h += 0.1 * fill(box(u, v, last[0] - 0.05, G + last[1] - 0.07, 0.035, 0.02, 0.01));
      if (o.skirt) h += 0.07 * (v < G + 0.035 ? 1 : 0);
      if (o.windows) h -= 0.08 * line(box(u, v, (first[0] + last[0]) / 2, G + 0.17, 0.08, 0.06, 0.02));
    }
    // guy lines to the ground beyond each end, pegs, and the ground line
    h = max(h, 0.3 * line(seg(u, v, first[0], G + first[1], x0 - 0.12, G), 0.006));
    h = max(h, 0.3 * line(seg(u, v, last[0], G + last[1], x1 + 0.1, G), 0.006));
    h = max(h, 0.35 * dot(u, v, x0 - 0.12, G, 0.018), 0.35 * dot(u, v, x1 + 0.1, G, 0.018));
    if (abs(u) < 0.82) h = max(h, 0.12 * line(v - G + 0.01, 0.006));
    return h;
  };
}
function geodome() {
  const G = -0.4;
  const arcs = [[0, 0.6, 0.58], [-0.2, 0.42, 0.56], [0.2, 0.42, 0.56], [0, 0.6, 0.34], [-0.08, 0.5, 0.48], [0.08, 0.5, 0.48]];
  return (u, v) => {
    const dome = max(ell(u, v, 0, G, 0.6, 0.58), G - v);
    const vest = max(poly(u, v, [0.3, G, 0.82, G, 0.36, G + 0.36]) - 0.01, G - v);
    const d = min(dome, vest);
    let h = 0;
    if (d < 0.02) {
      h = 0.5 * puff(dome, 0.12) + 0.32 * puff(vest, 0.05) * (dome > 0 ? 1 : 0);
      if (dome < 0) for (const [c, rx, ry] of arcs) h += 0.16 * line(ell(u, v, c, G, rx, ry), 0.012);
      h -= 0.1 * line(ell(u, v, -0.12, G, 0.18, 0.3)) * (dome < 0 ? 1 : 0);                      // door
      h += 0.1 * fill(box(u, v, 0, G + 0.5, 0.06, 0.03, 0.015));                                   // vent hood
      h += 0.07 * (v < G + 0.04 ? 1 : 0);                                                         // snow flaps
      h *= fill(d, 0.015);
    }
    for (const [ax, ay, bx] of [[-0.42, G + 0.4, -0.78], [0.52, G + 0.2, 0.86], [-0.22, G + 0.55, -0.6]])
      h = max(h, 0.3 * line(seg(u, v, ax, ay, bx, G), 0.006), 0.35 * dot(u, v, bx, G, 0.018));
    if (abs(u) < 0.84) h = max(h, 0.12 * line(v - G + 0.01, 0.006));
    return h;
  };
}
function hubTent() {
  const G = -0.36;
  return (u, v) => {
    const fly = max(ell(u, v, 0, G, 0.68, 0.44), G - v);
    let h = 0;
    if (fly < 0.02) {
      h = 0.5 * puff(fly, 0.1) * fill(fly, 0.015);
      h += 0.17 * line(v - G - 0.42, 0.012) * (abs(u) < 0.26 ? 1 : 0);                            // ridge pole
      for (const s of [-1, 1]) {
        h += 0.2 * dot(u, v, s * 0.26, G + 0.41, 0.03);                                             // hubs
        h += 0.15 * line(path(s * u, v, [0.26, G + 0.41, 0.5, G + 0.3, 0.64, G + 0.08]), 0.012) * (fly < 0 ? 1 : 0);
      }
      // D-shaped door with its zip, pulled-back vestibule
      const D = max(ell(u, v, 0.02, G, 0.32, 0.36), -0.24 - u + 0.02);
      h -= 0.11 * line(D) * (v > G + 0.02 ? 1 : 0);
      h += 0.05 * fill(D, 0.01) * (u > 0.06 ? 1 : 0);
      h += 0.1 * fill(box(u, v, 0, G + 0.36, 0.08, 0.025, 0.012));                                // vent
    }
    for (const s of [-1, 1]) h = max(h, 0.3 * line(seg(s * u, v, 0.6, G + 0.18, 0.84, G), 0.006), 0.35 * dot(s * u, v, 0.84, G, 0.018));
    if (abs(u) < 0.84) h = max(h, 0.12 * line(v - G + 0.01, 0.006));
    return h;
  };
}
function steepWallTent() {
  const G = -0.36;
  const body = [-0.56, G, -0.5, G + 0.36, -0.3, G + 0.5, 0.26, G + 0.5, 0.44, G + 0.36, 0.48, G];
  return (u, v) => {
    const fly = poly(u, v, body) - 0.02, awning = poly(u, v, [0.3, G + 0.48, 0.8, G + 0.4, 0.8, G + 0.36, 0.3, G + 0.42]);
    const d = min(fly, awning);
    let h = 0;
    if (d < 0.02) {
      h = max(0.5 * puff(fly, 0.1), 0.42 * fill(awning, 0.01)) * fill(d, 0.015);
      h += 0.17 * line(v - G - 0.49, 0.012) * (u > -0.3 && u < 0.27 ? 1 : 0);                      // hub ridge
      h += 0.15 * line(path(u, v, [-0.3, G + 0.49, -0.5, G + 0.36, -0.55, G]), 0.012) * (fly < 0 ? 1 : 0);
      h -= 0.11 * line(box(u, v, 0.15, G + 0.2, 0.22, 0.2, 0.08)) * (fly < 0 && u < 0.37 ? 1 : 0);  // door
      h += 0.08 * mesh(u, v, 20) * fill(box(u, v, -0.25, G + 0.24, 0.14, 0.08, 0.04));              // mesh panel
    }
    h = max(h, 0.3 * line(seg(u, v, 0.79, G + 0.38, 0.79, G), 0.009));                               // awning poles
    h = max(h, 0.3 * line(seg(u, v, 0.79, G + 0.38, 0.88, G), 0.006), 0.35 * dot(u, v, 0.88, G, 0.018));
    if (abs(u) < 0.86) h = max(h, 0.12 * line(v - G + 0.01, 0.006));
    return h;
  };
}
function bigShelter() {
  const G = -0.4;
  const P = [-0.7, G, -0.66, G + 0.34, -0.42, G + 0.56, 0.42, G + 0.56, 0.66, G + 0.34, 0.7, G];
  return (u, v) => {
    const d = poly(u, v, P) - 0.03;
    let h = 0;
    if (d < 0.02) {
      h = 0.5 * puff(d, 0.12) * fill(d, 0.015);
      h += 0.15 * line(poly(u, v, P) + 0.04, 0.012);                                                 // frame arch
      const door = max(ell(u, v, 0, G, 0.36, 0.44), G - v);
      h -= 0.12 * line(door);
      h += 0.12 * fill(box(u, v, 0, G + 0.38, 0.3, 0.035, 0.03)) * (abs(u) < 0.3 ? 1 : 0);           // rolled-up door
      h -= 0.06 * fill(door) * (v < G + 0.34 ? 1 : 0);                                              // open doorway
      for (const s of [-1, 1]) h += (0.04 + 0.06 * mesh(u, v, 22)) * fill(box(u, v, s * 0.52, G + 0.24, 0.09, 0.1, 0.03));
    }
    for (const s of [-1, 1]) h = max(h, 0.3 * line(seg(s * u, v, 0.6, G + 0.42, 0.86, G), 0.006), 0.35 * dot(s * u, v, 0.86, G, 0.018));
    if (abs(u) < 0.88) h = max(h, 0.12 * line(v - G + 0.01, 0.006));
    return h;
  };
}

/* ───────── Small kit, each drawn individually ───────── */
const cyl = (u, cx, r) => sqrt(sat(1 - ((u - cx) / r) ** 2));     // cylinder shading across its width

function duffel() {
  return (u, v) => {
    const body = box(u, v, 0, -0.05, 0.7, 0.3, 0.26);
    const ends = min(abs(ell(u, v, -0.76, -0.05, 0.06, 0.11)), abs(ell(u, v, 0.76, -0.05, 0.06, 0.11))) - 0.016;
    const haul = abs(ell(u, v, 0, 0.25, 0.16, 0.12)) - 0.018;
    const d = min(body, ends, v > 0.25 ? haul : 1e3);
    if (d > 0.03) return 0;
    let h = 0.25 + 0.4 * puff(body, 0.26);
    if (body > 0) h = 0.45;
    const D = max(box(u, v, 0, -0.02, 0.52, 0.2, 0.18), -0.02 - v - 0.2);
    h -= 0.12 * line(D) * (body < 0 ? 1 : 0);                                                     // D-shaped lid zip
    for (const x of [-0.56, -0.26, 0.26, 0.56]) h += 0.1 * fill(abs(u - x) - 0.028, 0.01) * (body < 0 ? 1 : 0);   // straps
    for (const x of [-0.56, 0.56]) h += 0.1 * fill(box(u, v, x, -0.3, 0.045, 0.03, 0.008));        // buckles
    return max(0, h) * fill(d, 0.015);
  };
}
function boxyDaypack() {
  return (u, v) => {
    const body = box(u, v, 0, -0.07, 0.33, 0.5, 0.07) - 0.0;
    const handles = min(abs(ell(u, v, -0.03, 0.43, 0.1, 0.12)), abs(ell(u, v, 0.03, 0.43, 0.1, 0.12))) - 0.012;
    const d = min(body, v > 0.43 ? handles : 1e3);
    if (d > 0.03) return 0;
    let h = body < 0.01 ? 0.5 * puff(body, 0.07) : 0.4;
    if (v < 0.4) h -= 0.2 * line(box(u, v, 0, 0.12, 0.29, 0.3, 0.09), 0.013) * (v > -0.06 ? 1 : 0);    // U zip round the top
    const pocket = box(u, v, 0, -0.38, 0.24, 0.13, 0.03);
    h += 0.09 * fill(pocket, 0.012); h -= 0.11 * line(v + 0.28) * (abs(u) < 0.2 ? 1 : 0);
    h += 0.14 * fill(circ(u, v, 0, -0.04, 0.05), 0.012); h -= 0.06 * line(circ(u, v, 0, -0.04, 0.05));   // round badge
    return max(0, h) * fill(d, 0.015);
  };
}
function canisterStove(o) {
  const big = o.giga;
  return (u, v) => {
    const can = min(box(u, v, 0, -0.42, big ? 0.34 : 0.3, 0.17, 0.05), ell(u, v, 0, -0.27, big ? 0.34 : 0.3, 0.1));
    const neck = box(u, v, 0, -0.14, 0.07, 0.05, 0.015);
    const body = box(u, v, 0, -0.02, big ? 0.09 : 0.05, big ? 0.08 : 0.09, 0.02);
    const burner = big ? box(u, v, 0, 0.12, 0.17, 0.05, 0.02) : box(u, v, 0, 0.12, 0.09, 0.045, 0.02);
    const arms = big
      ? min(path(u, v, [-0.12, 0.07, -0.3, 0.09, -0.32, 0.22], 0.018), path(u, v, [0.12, 0.07, 0.3, 0.09, 0.32, 0.22], 0.018))
      : min(seg(u, v, -0.05, 0.12, -0.3, 0.3, 0.018), seg(u, v, 0.05, 0.12, 0.3, 0.3, 0.018), seg(u, v, 0, 0.13, 0.08, 0.33, 0.016));
    const key = big ? box(u, v, 0.15, -0.04, 0.07, 0.035, 0.015) : abs(ell(u, v, 0.15, -0.03, 0.07, 0.05)) - 0.013;
    const igniter = big ? box(u, v, -0.14, -0.02, 0.05, 0.04, 0.01) : 1e3;
    const d = min(can, neck, body, burner, arms, key, igniter);
    if (d > 0.03) return 0;
    let h = 0;
    if (can < 0.02) h = max(h, (0.3 + 0.32 * cyl(u, 0, big ? 0.34 : 0.3)) * fill(can));
    h -= 0.08 * line(v + 0.48) * (can < 0 ? 1 : 0); h -= 0.08 * line(v + 0.34) * (can < 0 ? 1 : 0);   // label bands
    h = max(h, 0.5 * fill(neck), 0.62 * fill(body), 0.7 * fill(burner), 0.66 * fill(arms), 0.5 * fill(key), 0.55 * fill(igniter));
    if (burner < 0) h -= 0.1 * (abs(fract(u / 0.03) - 0.5) < 0.2 ? 1 : 0);                        // flame ports
    if (!big) h += 0.1 * fill(box(u, v, -0.3, 0.3, 0.03, 0.012), 0.01) + 0.1 * fill(box(u, v, 0.3, 0.3, 0.03, 0.012), 0.01);
    return max(0, h);
  };
}
function liquidStove() {
  const B = [0.3, 0.2];
  return (u, v) => {
    const ru = u - B[0], rv = v - B[1], rr = hypot(ru, rv), a = atan2(rv, ru);
    const burner = rr - 0.15;
    let legs = 1e3, supports = 1e3;
    for (let i = 0; i < 3; i++) {
      const al = PI / 2 + (i * 2 * PI) / 3, as = al + PI / 3;
      legs = min(legs, seg(u, v, B[0], B[1], B[0] + cos(al) * 0.36, B[1] + sin(al) * 0.36, 0.022));
      supports = min(supports, seg(u, v, B[0] + cos(as) * 0.07, B[1] + sin(as) * 0.07, B[0] + cos(as) * 0.3, B[1] + sin(as) * 0.3, 0.016));
    }
    const hose = path(u, v, [0.16, 0.08, 0.0, -0.14, -0.08, -0.3, -0.12, -0.42], 0.018);
    const bottle = seg(u, v, -0.68, -0.42, -0.26, -0.42, 0.11);
    const pump = min(box(u, v, -0.16, -0.42, 0.06, 0.05, 0.015), circ(u, v, -0.08, -0.42, 0.035));
    const d = min(burner, legs, supports, hose, bottle, pump);
    if (d > 0.03) return 0;
    let h = 0;
    h = max(h, 0.42 * fill(legs), 0.32 * fill(hose), 0.48 * fill(pump));
    if (bottle < 0.02) h = max(h, (0.3 + 0.3 * sqrt(sat(1 - ((v + 0.42) / 0.11) ** 2))) * fill(bottle));
    if (burner < 0.02) { h = max(h, 0.55 * fill(burner)); h += 0.12 * line(rr - 0.09) + 0.1 * fill(rr - 0.04) - 0.08 * line(rr - 0.13); }
    h = max(h, 0.72 * fill(supports));
    h -= 0.08 * line(u + 0.44) * (bottle < 0 ? 1 : 0);                                            // bottle shoulder
    return max(0, h);
  };
}
function mug() {
  return (u, v) => {
    const pot = box(u, v, 0, -0.16, 0.28, 0.34, 0.035);
    const lid = box(u, v, 0, 0.2, 0.3, 0.035, 0.02), tab = box(u, v, 0, 0.26, 0.06, 0.03, 0.015);
    const handles = abs(ell(abs(u), v, 0.28, 0.0, 0.15, 0.12)) - 0.018;
    const d = min(pot, lid, tab, abs(u) > 0.28 ? handles : 1e3);
    if (d > 0.03) return 0;
    let h = 0;
    if (pot < 0.02) h = (0.28 + 0.34 * cyl(u, 0, 0.28)) * fill(pot);
    h = max(h, 0.62 * fill(lid), 0.68 * fill(tab), abs(u) > 0.28 ? 0.5 * fill(handles) : 0);
    if (pot < 0) for (let i = 0; i < 4; i++) h -= 0.09 * line(v + 0.4 - i * 0.1) * (u > 0.12 && u < 0.2 ? 1 : 0);   // measuring marks
    h -= 0.08 * line(v - 0.12) * (pot < 0 ? 1 : 0);
    return max(0, h);
  };
}
function headlamp(o) {
  const actik = o.actik;
  return (u, v) => {
    const band = abs(ell(u, v, 0, 0.04, 0.66, 0.38)) - 0.035;
    const body = actik ? box(u, v, 0, -0.33, 0.19, 0.11, 0.07) : box(u, v, 0, -0.33, 0.23, 0.12, 0.04);
    const button = actik ? box(u, v, 0, -0.205, 0.08, 0.025, 0.012) : box(u, v, 0.11, -0.2, 0.05, 0.02, 0.01);
    const buckle = box(u, v, 0, 0.42, 0.05, 0.04, 0.012);
    const d = min(band, body, button, buckle);
    if (d > 0.03) return 0;
    let h = 0;
    if (band < 0.02 && body > 0) {
      h = 0.32 * fill(band, 0.012);
      const a = atan2(v - 0.04, u / 0.66 * 0.38);
      h += actik ? 0.1 * (fract(a * 6) < 0.5 ? 1 : 0) * fill(band) : 0.05 * sin(a * 140) * fill(band);   // reflective dashes / weave
    }
    h = max(h, 0.4 * fill(buckle));
    if (body < 0.02) {
      h = max(h, 0.6 * puff(body, 0.05) * fill(body));
      const lx = actik ? -0.06 : -0.07, lr = actik ? 0.07 : 0.085;
      h += 0.18 * fill(circ(u, v, lx, -0.33, lr)) - 0.12 * fill(circ(u, v, lx, -0.33, lr * 0.5)) + 0.1 * dot(u, v, lx, -0.33, 0.015);
      if (actik) h += 0.1 * dot(u, v, 0.1, -0.36, 0.02);
      else { h += 0.12 * dot(u, v, 0.1, -0.29, 0.024); h += 0.12 * dot(u, v, 0.1, -0.375, 0.024); }
    }
    h = max(h, 0.66 * fill(button));
    return max(0, h);
  };
}
function ropeCoil() {
  return (u, v) => {
    const r = hypot(u, v + 0.05), a = atan2(v + 0.05, u);
    const coil = abs(r - 0.42) - 0.15;
    const wrap = box(u, v, 0, 0.42, 0.1, 0.09, 0.02);
    const tails = min(path(u, v, [-0.03, 0.5, -0.06, 0.62, -0.12, 0.74], 0.022), path(u, v, [0.03, 0.5, 0.07, 0.63, 0.14, 0.73], 0.022));
    const d = min(coil, wrap, tails);
    if (d > 0.03) return 0;
    let h = 0;
    if (coil < 0.02) h = (0.35 + 0.22 * abs(sin(r * PI / 0.034)) + 0.05 * sin(a * 80 + r * 300)) * fill(coil, 0.02);
    if (wrap < 0.02) h = max(h, (0.55 + 0.15 * abs(sin(v * PI / 0.03))) * fill(wrap, 0.015));    // wraps tying the coil
    h = max(h, 0.5 * fill(tails) * (0.8 + 0.2 * sin((u + v) * 160)));
    return max(0, h);
  };
}
function cam() {
  return (u, v) => {
    let lobes = 1e3;
    for (const [x, tilt] of [[-0.22, -0.35], [-0.08, -0.12], [0.08, 0.12], [0.22, 0.35]]) {
      const cu = u - x, cv = v - 0.22, ru = cu * cos(tilt) + cv * sin(tilt), rv = -cu * sin(tilt) + cv * cos(tilt);
      lobes = min(lobes, ell(ru, rv, 0, -0.02, 0.07, 0.17));
    }
    const axle = seg(u, v, -0.3, 0.32, 0.3, 0.32, 0.02);
    const stem = seg(u, v, 0, 0.14, 0, -0.4, 0.028);
    const trigger = seg(u, v, -0.17, -0.12, 0.17, -0.12, 0.024);
    const thumb = abs(circ(u, v, 0, -0.45, 0.05)) - 0.018;
    const sling = abs(ell(u, v, 0, -0.62, 0.08, 0.13)) - 0.026;
    const wires = min(seg(u, v, -0.16, -0.12, -0.2, 0.08, 0.007), seg(u, v, 0.16, -0.12, 0.2, 0.08, 0.007));
    const d = min(lobes, axle, stem, trigger, thumb, sling, wires);
    if (d > 0.03) return 0;
    let h = 0;
    if (lobes < 0.02) h = (0.55 + 0.08 * sin(v * 110)) * fill(lobes, 0.01);                       // toothed cam lobes
    h = max(h, 0.72 * fill(axle), 0.48 * fill(stem) * (0.85 + 0.15 * sin(v * 160)), 0.6 * fill(trigger),
      0.55 * fill(thumb), 0.4 * fill(sling) * (0.85 + 0.15 * sin((u + v) * 150)), 0.35 * fill(wires, 0.005));
    return max(0, h);
  };
}
function harness() {
  return (u, v) => {
    const waist = abs(ell(u, v, 0, 0.18, 0.58, 0.34)) - 0.065;
    const legs = min(abs(ell(u, v, -0.25, -0.45, 0.2, 0.14)) - 0.045, abs(ell(u, v, 0.25, -0.45, 0.2, 0.14)) - 0.045);
    const belay = abs(ell(u, v, 0, -0.26, 0.05, 0.1)) - 0.02;
    const buckle = box(u, v, 0, -0.15, 0.07, 0.035, 0.01);
    let loops = 1e3;
    for (const a of [-2.3, -0.8, 0.8, 2.3]) {
      const cx = 0.68 * cos(a), cy = 0.18 + 0.42 * sin(a) * 0.95;
      loops = min(loops, abs(ell(u, v, cx, cy, 0.08, 0.05)) - 0.012);
    }
    const d = min(waist, legs, belay, buckle, loops);
    if (d > 0.03) return 0;
    let h = 0;
    if (waist < 0.02) h = (0.45 + 0.06 * line(abs(ell(u, v, 0, 0.18, 0.58, 0.34)) - 0.04, 0.008)) * puff(waist, 0.04);
    h = max(h, 0.42 * puff(legs, 0.035), 0.5 * fill(belay), 0.7 * fill(buckle), 0.3 * fill(loops) * (waist > 0 ? 1 : 0));
    return max(0, h);
  };
}
function helmet() {
  const G = -0.26;
  const vents = [[-0.32, 0.0], [-0.12, 0.12], [0.1, 0.13], [0.3, 0.02], [-0.22, -0.13], [0.0, -0.06], [0.21, -0.12], [-0.02, 0.24]];
  return (u, v) => {
    const shell = max(ell(u, v, 0, G, 0.56, 0.6), G - 0.04 - v);
    const straps = min(seg(u, v, -0.24, G, 0, G - 0.32, 0.014), seg(u, v, 0.24, G, 0, G - 0.32, 0.014));
    const buckle = box(u, v, 0, G - 0.34, 0.04, 0.03, 0.01);
    const d = min(shell, straps, buckle);
    if (d > 0.03) return 0;
    let h = 0;
    if (shell < 0.02) {
      const r = hypot(u / 0.56, (v - G) / 0.6);
      h = (0.25 + 0.5 * sqrt(sat(1 - r * r))) * fill(shell, 0.015);
      for (const [x, y] of vents) h -= 0.3 * fill(ell(u, v, x, y, 0.07, 0.05), 0.012);
      h += 0.08 * line(v - G - 0.02, 0.014);                                                      // rim
      h += 0.1 * fill(box(abs(u), v, 0.42, G + 0.06, 0.03, 0.02, 0.008));                         // lamp clips
    }
    h = max(h, 0.32 * fill(straps), 0.45 * fill(buckle));
    return max(0, h);
  };
}
function belayDevice() {
  const P = [-0.32, -0.46, 0.28, -0.46, 0.34, 0.14, 0.06, 0.44, -0.27, 0.32];
  return (u, v) => {
    const body = poly(u, v, P) - 0.06;
    const lever = seg(u, v, 0.1, 0.34, 0.6, 0.52, 0.055);
    const d = min(body, lever);
    if (d > 0.03) return 0;
    let h = 0;
    if (body < 0.02) h = 0.55 * puff(body, 0.07) * fill(body);
    h = max(h, 0.68 * puff(lever, 0.045) * fill(lever));
    h -= 0.1 * line(circ(u, v, 0.02, 0.1, 0.12)) * (body < 0 ? 1 : 0);                           // cam pivot
    h -= 0.1 * line(path(u, v, [-0.2, 0.3, -0.02, 0.0, 0.2, -0.24])) * (body < 0 ? 1 : 0);        // rope path
    const hole = circ(u, v, -0.1, -0.3, 0.075);
    h = h * (1 - fill(hole, 0.012)) + 0.12 * line(hole - 0.02, 0.012);                            // karabiner hole
    for (const [x, y] of [[0.2, 0.1], [-0.16, 0.14]]) h += 0.1 * dot(u, v, x, y, 0.02);           // rivets
    return max(0, h);
  };
}
function iceTool() {
  const shaft = [-0.06, -0.6, -0.13, -0.3, -0.09, 0.0, 0.01, 0.28, 0.05, 0.5];
  return (u, v) => {
    const s = path(u, v, shaft, 0.033);
    const grip = path(u, v, [-0.06, -0.62, -0.13, -0.32], 0.058);
    const pommel = seg(u, v, -0.07, -0.66, 0.09, -0.62, 0.035);
    const rest = seg(u, v, -0.13, -0.3, 0.0, -0.27, 0.03);
    const head = box(u, v, 0.03, 0.53, 0.09, 0.05, 0.02);
    const pick = path(u, v, [0.1, 0.55, 0.36, 0.5, 0.62, 0.36], 0.03);
    const d = min(s, grip, pommel, rest, head, pick);
    if (d > 0.03) return 0;
    let h = max(0.5 * puff(s, 0.03), 0.62 * puff(grip, 0.05) * (0.85 + 0.15 * sin(v * 140)), 0.6 * fill(pommel), 0.55 * fill(rest),
      0.72 * fill(head), 0.6 * fill(pick));
    if (pick < 0.03 && v < 0.5 - (u - 0.1) * 0.4) h += 0.12 * (fract(u * 30) < 0.5 ? 1 : 0) * fill(pick + 0.012);   // pick teeth
    return max(0, h);
  };
}
function poles() {
  return (u, v) => {
    const pole = seg(u, v, -0.5, -0.62, 0.2, 0.4, 0.018);
    const grip = seg(u, v, 0.2, 0.4, 0.3, 0.56, 0.045);
    const strap = abs(ell(u, v, 0.33, 0.64, 0.06, 0.05)) - 0.012;
    const basket = abs(ell(u, v, -0.44, -0.53, 0.06, 0.025)) - 0.012;
    let folded = 1e3;
    for (const x of [0.46, 0.53, 0.6]) folded = min(folded, seg(u, v, x, -0.45, x, 0.18, 0.016));
    const fgrip = seg(u, v, 0.6, 0.18, 0.6, 0.4, 0.04);
    const cord = min(abs(ell(u, v, 0.495, 0.18, 0.035, 0.03)), abs(ell(u, v, 0.565, -0.45, 0.035, 0.03))) - 0.008;
    const band = box(u, v, 0.53, -0.1, 0.1, 0.022, 0.01);
    const d = min(pole, grip, strap, basket, folded, fgrip, cord, band);
    if (d > 0.03) return 0;
    let h = max(0.45 * fill(pole), 0.62 * puff(grip, 0.04) * (0.85 + 0.15 * sin((u + v) * 110)), 0.4 * fill(strap),
      0.4 * fill(basket), 0.45 * fill(folded), 0.62 * puff(fgrip, 0.04), 0.3 * fill(cord, 0.006), 0.6 * fill(band));
    for (const t of [0.34, 0.67]) h += 0.12 * dot(u, v, -0.5 + 0.7 * t, -0.62 + 1.02 * t, 0.028);   // joints
    return max(0, h);
  };
}
function beacon() {
  return (u, v) => {
    const body = box(u, v, 0, -0.04, 0.3, 0.46, 0.16);
    const slider = box(u, v, 0, 0.45, 0.12, 0.05, 0.02);
    const lug = abs(circ(u, v, 0, -0.56, 0.05)) - 0.016;
    const d = min(body, slider, lug);
    if (d > 0.03) return 0;
    let h = max(0.55 * puff(body, 0.08) * fill(body), 0.68 * fill(slider), 0.4 * fill(lug));
    if (body < 0) {
      const scr = box(u, v, 0, 0.13, 0.19, 0.15, 0.04);
      h -= 0.14 * fill(scr, 0.012);
      h += 0.1 * line(circ(u, v, 0, 0.13, 0.09), 0.008) * (scr < 0 ? 1 : 0);
      h += 0.1 * fill(poly(u, v, [0, 0.21, 0.04, 0.14, -0.04, 0.14]), 0.008);                       // direction arrow
      for (const x of [-0.1, 0.1]) { h += 0.12 * fill(circ(u, v, x, -0.22, 0.06)); h -= 0.06 * line(circ(u, v, x, -0.22, 0.06)); }
      h -= 0.06 * line(abs(u) - 0.27) * (abs(v + 0.04) < 0.3 ? 1 : 0);                                 // rubber grips
    }
    return max(0, h);
  };
}
function messenger() {
  return (u, v) => {
    const body = box(u, v, 0, -0.06, 0.27, 0.34, 0.08);
    const ant = box(u, v, -0.15, 0.32, 0.07, 0.06, 0.03);
    const clip = abs(box(u, v, 0.13, 0.34, 0.07, 0.045, 0.03)) - 0.016;
    const d = min(body, ant, clip);
    if (d > 0.03) return 0;
    let h = max(0.55 * puff(body, 0.06) * fill(body), 0.68 * fill(ant), 0.45 * fill(clip));
    if (body < 0) {
      h -= 0.14 * fill(box(u, v, 0, 0.06, 0.17, 0.13, 0.02), 0.012);
      for (const x of [-0.1, 0.1]) h += 0.12 * fill(circ(u, v, x, -0.24, 0.04));
      h -= 0.06 * line(box(u, v, 0, -0.06, 0.24, 0.31, 0.06));
    }
    return max(0, h);
  };
}
function watch() {
  return (u, v) => {
    const r = hypot(u, v);
    const caseD = r - 0.31;
    const straps = min(box(u, v, 0, 0.48, 0.16, 0.2, 0.04), box(u, v, 0, -0.48, 0.16, 0.2, 0.04));
    let buttons = 1e3;
    for (const a of [2.5, PI, 3.78, 0.6, -0.6]) buttons = min(buttons, circ(u, v, cos(a) * 0.32, sin(a) * 0.32, 0.03));
    const d = min(caseD, straps, buttons);
    if (d > 0.03) return 0;
    let h = max(0.38 * fill(straps), 0.55 * fill(buttons));
    if (straps < 0 && v < 0) for (let i = 0; i < 4; i++) h -= 0.12 * dot(u, v, 0, -0.4 - i * 0.065, 0.018);   // strap holes
    if (caseD < 0.02) {
      const a = atan2(v, u);
      let c = r > 0.24 ? 0.7 : 0.5;                                                                 // bezel, then the face
      if (r > 0.24) c -= 0.12 * (abs(fract(a / (PI / 6)) - 0.5) > 0.42 ? 1 : 0);                    // bezel ticks
      c -= 0.06 * line(r - 0.24);
      h = max(h, c * fill(caseD, 0.012));
    }
    return max(0, h);
  };
}
function handheldGps() {
  return (u, v) => {
    const body = box(u, v, 0, -0.08, 0.25, 0.54, 0.09);
    const top = box(u, v, 0, 0.47, 0.15, 0.05, 0.04);
    const lug = abs(circ(u, v, 0.19, -0.66, 0.04)) - 0.014;
    const d = min(body, top, lug);
    if (d > 0.03) return 0;
    let h = max(0.55 * puff(body, 0.07) * fill(body), 0.6 * fill(top), 0.4 * fill(lug));
    if (body < 0) {
      h -= 0.14 * fill(box(u, v, 0, 0.16, 0.18, 0.21, 0.02), 0.012);
      h += 0.12 * fill(circ(u, v, 0, -0.29, 0.08)); h -= 0.06 * line(circ(u, v, 0, -0.29, 0.035));     // rocker pad
      for (const [x, y] of [[-0.15, -0.21], [0.15, -0.21], [-0.15, -0.38], [0.15, -0.38], [-0.07, -0.47], [0.07, -0.47]])
        h += 0.11 * fill(box(u, v, x, y, 0.04, 0.025, 0.012));
    }
    return max(0, h);
  };
}

/* ───────── The 70 product lines ───────── */
const DESIGNS = {
  // shells
  "arcteryx/alpha": () => jacket({ hood: "helmet", chestDiag: 2, elbows: true, pit: true, w: 0.27, drop: 0.06, flare: 0 }),
  "arcteryx/beta": () => jacket({ hood: "hood", hand: true, pit: true, chestDiag: 1, w: 0.29, drop: 0.04 }),
  "patagonia/torrentshell": () => jacket({ hood: "hood", storm: true, hand: "flap", pit: true, w: 0.3, drop: 0.02 }),
  "mammut/eiger": () => jacket({ hood: "helmet", princess: true, chestDiag: 1, elbows: true, w: 0.27, drop: 0.05 }),
  "rab/kinetic": () => jacket({ hood: "hood", hand: true, princess: true, ribs: true, w: 0.28 }),
  "fjallraven/g1000": () => jacket({ hood: "stand", buttons: true, flap4: true, w: 0.31, hem: -0.64, drop: 0, flare: 0.03 }),
  "montbell/stormcruiser": () => jacket({ hood: "hood", chest1: true, hand: true, w: 0.29, drop: 0.02 }),
  // insulation
  "arcteryx/atom": () => jacket({ hood: "hood", loft: 0.11, baffle: 0.15, bA: 0.08, sidePanels: true, cuffs: true, hand: true }),
  "arcteryx/cerium": () => jacket({ hood: "hood", loft: 0.12, baffle: 0.075, bA: 0.16, flatShoulders: true, hand: true, w: 0.28 }),
  "patagonia/nanopuff": () => jacket({ hood: "collar", loft: 0.11, baffle: 0.1, wave: 0.028, bA: 0.14, hand: true, chest1: true }),
  "tnf/nuptse": () => jacket({ hood: "stand", w: 0.34, hem: -0.46, loft: 0.2, baffle: 0.16, bA: 0.3, yoke: true, cuffs: true, hand: true, drop: 0, spread: 1.05, hemBand: true }),
  "rab/neutrino": () => jacket({ hood: "helmet", loft: 0.17, baffle: 0.12, bA: 0.24, hem: -0.64, chest1: true, cuffs: true, w: 0.31 }),
  "rab/microlight": () => jacket({ hood: "hood", loft: 0.14, baffle: 0.105, bA: 0.18, hand: true, chestDiag: 1, w: 0.3 }),
  "montbell/plasma": () => jacket({ hood: "collar", loft: 0.09, baffle: 0.055, bA: 0.1, w: 0.28, hand: true }),
  "kolon/antarctica": () => jacket({ hood: "fur", w: 0.33, top: 0.38, hem: -0.78, wristY: -0.4, loft: 0.17, baffle: 0.17, bA: 0.2, storm: true, flap4: true, flare: 0.05, drop: 0 }),
  // mid and base layers
  "patagonia/r1": () => jacket({ hood: "collar", zip: "half", grid: true, loft: 0.05, chest1: true, cuffs: true, w: 0.28 }),
  "patagonia/capilene": () => jacket({ crew: true, raglan: true, loft: 0.05, w: 0.27, hemBand: true, cuffs: true, drop: 0.01 }),
  // packs
  "tnf/basecamp": () => duffel(),
  "fjallraven/kanken": () => boxyDaypack(),
  "fjallraven/kajka": () => pack({ w: 0.33, h: 0.52, lid: "float", uZip: true, sideZip: true, frame: true, hip: 1, straps: [0.45, -0.05], iceAxe: true }),
  "osprey/atmos": () => pack({ w: 0.31, h: 0.52, lid: "float", meshFront: true, side: true, hip: 1, straps: [0.5, 0.1], taper: 0.14, r: 0.16 }),
  "osprey/exos": () => pack({ w: 0.29, h: 0.54, lid: "small", meshFront: true, side: true, hip: 0.8, straps: [0.55, 0.2, -0.15], bungee: false, taper: 0.1 }),
  "osprey/talon": () => pack({ w: 0.27, h: 0.46, zipTop: true, meshFront: true, side: true, hip: 0.55, r: 0.16, taper: 0.12, handle: true }),
  "osprey/aether": () => pack({ w: 0.35, h: 0.54, lid: "float", jZip: true, side: true, hip: 1.15, sbag: true, iceAxe: true, straps: [0.45, 0.05] }),
  "gregory/baltoro": () => pack({ w: 0.34, h: 0.54, lid: "float", uZip: true, side: true, hip: 1.1, sbag: true, straps: [0.5, 0.1], daisy: true }),
  "gregory/focal": () => pack({ w: 0.29, h: 0.5, roll: true, meshFront: true, side: true, hip: 0.8, straps: [0.35], taper: 0.06 }),
  "gregory/zulu": () => pack({ w: 0.29, h: 0.46, zipTop: true, bungee: true, side: true, hip: 0.7, r: 0.15, handle: true, straps: [-0.1] }),
  // tents
  "tnf/ve25": () => geodome(),
  "msr/hubbahubba": () => hubTent(),
  "hilleberg/blacklabel": () => tunnel({ hoops: [[-0.3, 0.42], [0.0, 0.45], [0.3, 0.4]], start: -0.7, end: 0.66, skirt: true }),
  "hilleberg/redlabel": () => tunnel({ hoops: [[-0.16, 0.44], [0.24, 0.32]], start: -0.66, end: 0.64, skirt: true }),
  "hilleberg/yellowlabel": () => tunnel({ hoops: [[-0.14, 0.37], [0.2, 0.3]], start: -0.6, end: 0.56, windows: true }),
  "bigagnes/copperspur": () => steepWallTent(),
  "snowpeak/livingshell": () => bigShelter(),
  // footwear
  "tnf/vectiv": () => shoe({ sole: 0.13, rocker: 0.9, plate: true, collarPad: true, heelTab: true, lug: "std" }),
  "mammut/ducan": () => shoe({ shaft: 2, sole: 0.085, hooks: true, rand: "toe", eyestay: true, collarPad: true, heelTab: true }),
  "salomon/xultra": () => shoe({ sole: 0.09, chassis: true, rand: "toe", eyestay: true, collarPad: true }),
  "salomon/speedcross": () => shoe({ sole: 0.1, laces: "quick", chevrons: true, lug: "deep", rocker: 0.4, heelTab: true }),
  "salomon/quest": () => shoe({ shaft: 2, sole: 0.1, chassis: true, hooks: true, rand: "toe", eyestay: true, collarPad: true, lug: "mountain" }),
  "lasportiva/nepal": () => shoe({ shaft: 2, collar: 0.62, sole: 0.1, welt: true, hooks: true, flex: true, collarPad: true, lug: "mountain", counter: true, rocker: 0.15 }),
  "lasportiva/bushido": () => shoe({ sole: 0.075, rocker: 0.25, lug: "sticky", sock: true, rand: "toe", eyestay: true }),
  "lasportiva/tx": () => shoe({ sole: 0.07, laces: "toe", rand: "full", lug: "climb", suede: true, rocker: 0.2, heelTab: true }),
  "scarpa/phantom": () => shoe({ shaft: 3, sole: 0.1, welt: true, gaiter: true, lug: "mountain", rocker: 0.15, rand: "full" }),
  "scarpa/zodiac": () => shoe({ shaft: 1, sole: 0.085, laces: "toe", rand: "full", suede: true, lug: "climb", collarPad: true }),
  "scarpa/mojito": () => shoe({ sole: 0.07, laces: "toe", rand: "toe", suede: true, lug: "flat", toeBox: 0.03, rocker: 0.15 }),
  "hoka/speedgoat": () => shoe({ sole: 0.16, rocker: 0.85, hoka: true, flare: 0.05, heelTab: true, collarPad: true }),
  "hoka/kaha": () => shoe({ shaft: 2, sole: 0.15, rocker: 0.8, hoka: true, flare: 0.04, hooks: true, rand: "toe", collarPad: true }),
  "hoka/anacapa": () => shoe({ shaft: 1, sole: 0.14, rocker: 0.75, hoka: true, flare: 0.04, collarPad: true, eyestay: true }),
  "kailas/fuga": () => shoe({ sole: 0.12, rocker: 0.6, sock: true, wave: true, heelTab: true }),
  // sleep
  "bigagnes/rapide": () => pad({ tube: 0.085, rails: true }),
  "thermarest/neoair": () => pad({ mummy: true, tube: 0.065, chevron: true }),
  "thermarest/zlite": () => foamPad(),
  "montbell/downhugger": () => sleepingBag(),
  // cooking
  "msr/pocketrocket": () => canisterStove({}),
  "msr/whisperlite": () => liquidStove(),
  "snowpeak/titanium": () => mug(),
  "snowpeak/gigapower": () => canisterStove({ giga: true }),
  // lights, climbing, poles, safety, navigation
  "blackdiamond/spot": () => headlamp({}),
  "petzl/actik": () => headlamp({ actik: true }),
  "mammut/ropes": () => ropeCoil(),
  "blackdiamond/camalot": () => cam(),
  "blackdiamond/momentum": () => harness(),
  "petzl/sirocco": () => helmet(),
  "petzl/grigri": () => belayDevice(),
  "petzl/nomic": () => iceTool(),
  "blackdiamond/distance": () => poles(),
  "mammut/barryvox": () => beacon(),
  "garmin/inreach": () => messenger(),
  "garmin/fenix": () => watch(),
  "garmin/gpsmap": () => handheldGps()
};
// Any line added later without its own design falls back to its category.
const BY_CATEGORY = {
  shell: () => jacket({ hood: "hood", hand: true }), insulation: () => jacket({ hood: "hood", loft: 0.13, baffle: 0.11, bA: 0.18 }),
  midlayer: () => jacket({ hood: "collar", zip: "half", grid: true }), baselayer: () => jacket({ crew: true, raglan: true }),
  hiking: () => shoe({ shaft: 1, hooks: true }), mtnboots: () => shoe({ shaft: 2, welt: true, lug: "mountain" }),
  trailrun: () => shoe({ sole: 0.11, rocker: 0.6 }), approach: () => shoe({ laces: "toe", rand: "full" }),
  pack: () => pack({ lid: "float", side: true, hip: 1 }), tent: () => hubTent(), sleep: () => pad({}), stove: () => canisterStove({}),
  light: () => headlamp({}), climbing: () => cam(), poles: () => poles(), safety: () => beacon(), nav: () => messenger()
};

/* ───────── Sample a design onto the N×N point grid (normalised 0…1) ───────── */
function hash2(i, j, s) {
  let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, s) {
  const i = floor(x), j = floor(y), fx = x - i, fy = y - j, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), e = hash2(i + 1, j + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy;
}
const cache = new Map();
export function hasDesign(item) { return item.id in DESIGNS; }
// Footwear is long and low, so it is drawn a little larger to fill the frame like the other kit.
const SCALE = { hiking: 1.2, mtnboots: 1.2, trailrun: 1.18, approach: 1.18 };
export function gearRelief(item, N) {
  if (cache.has(item.id)) return cache.get(item.id);
  const f = (DESIGNS[item.id] || BY_CATEGORY[item.cat] || BY_CATEGORY.nav)();
  const scale = SCALE[item.cat] ?? 1.28;
  let seed = 0;
  for (const ch of item.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const H = new Float32Array(N * N);
  let top = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, z = (j / (N - 1)) * 2 - 1;
      const h = max(0, f(x * scale, -z * scale));
      H[j * N + i] = h;
      if (h > top) top = h;
    }
  }
  /* Contour lines light up within ~1.2% of every tenth of the height. Pick the overall scale that keeps
     the most surface away from those levels, so flat panels read clean and only real edges glow. */
  let best = 1, bestBad = Infinity;
  for (let sc = 1; sc >= 0.84; sc -= 0.005) {
    let bad = 0;
    for (let k = 0; k < H.length; k += 3) {
      const h = (H[k] / top) * sc;
      if (h < 0.12) continue;
      if (abs(fract(h * 10 + 0.5) - 0.5) < 0.2) bad++;
    }
    if (bad < bestBad) { bestBad = bad; best = sc; }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i, h = (H[k] / top) * best;
      // faint ground texture around the object only
      H[k] = h + (h < 0.02 ? noise(i * 0.09 + 7, j * 0.09 + 3, seed) * 0.02 : 0);
    }
  }
  // Detail: thin edge lines. Measure how sharply the surface changes, then keep only the crest
  // of each edge (the point steeper than its neighbours across the edge), so outlines, seams,
  // zips and baffles become crisp one-dot lines instead of wide glowing bands.
  const G = new Float32Array(N * N), GX = new Float32Array(N * N), GY = new Float32Array(N * N);
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i, gx = (H[k + 1] - H[k - 1]) * 0.5, gy = (H[k + N] - H[k - N]) * 0.5;
      GX[k] = gx; GY[k] = gy; G[k] = hypot(gx, gy);
    }
  }
  const D = new Float32Array(N * N);
  for (let j = 2; j < N - 2; j++) {
    for (let i = 2; i < N - 2; i++) {
      const k = j * N + i, g = G[k];
      if (g < 0.012) continue;
      // step one cell along the gradient direction (rounded to the 8 neighbours)
      const di = Math.round(GX[k] / g), dj = Math.round(GY[k] / g);
      const o = dj * N + di;
      if (g < G[k + o] || g < G[k - o]) continue;
      D[k] = sm(0.012, 0.045, g);
    }
  }
  const out = { H, D };
  cache.set(item.id, out);
  return out;
}
