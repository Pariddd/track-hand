/**
 * ButterflyShape.js — Kupu-kupu beranatomi lengkap
 *
 * Komposisi (dilihat dari atas, sumbu badan = sumbu Y):
 *   - Sayap depan (besar, ujung membulat) & sayap belakang (lebih kecil, berekor pendek),
 *     kiri-kanan simetris. Bentuk sayap = kurva Catmull-Rom halus lewat titik kontrol,
 *     diisi MERATA per luas (uji titik-di-dalam-poligon), jadi tidak ada titik menumpuk.
 *   - Corak sayap: urat yang memancar dari pangkal, tepi gelap, dan bintik putih di tepi.
 *   - Badan beruas: kepala, dada, perut. Antena melengkung dengan ujung bulat.
 *
 * Kepakan dihitung di shader: sayap berputar pada engsel di badan (x = 0), jadi kepakan
 * benar-benar 3D. Sayap belakang dikenali dari y < 0 dan diberi jeda fase sedikit.
 *
 * Output: { positions, parts, shades }
 *   parts:  0 = badan, 1 = sayap, 2 = urat, 3 = tepi gelap, 4 = bintik putih, 5 = antena
 *   shades: 0..1 — untuk sayap: jarak dari pangkal (0) ke ujung (1); untuk badan: ruas.
 */

export const BUTTERFLY_PART = {
  BODY: 0,
  WING: 1,
  VEIN: 2,
  BORDER: 3,
  DOT: 4,
  ANTENNA: 5,
};

const WING_SCALE = 0.95;

// Titik kontrol sayap KANAN (x > 0). Sisi kiri = cermin.
const FOREWING = [
  [0.08, 0.3],
  [0.35, 0.7],
  [0.8, 1.05],
  [1.3, 1.2],
  [1.62, 1.05],
  [1.7, 0.7],
  [1.45, 0.3],
  [1.05, 0.05],
  [0.55, -0.05],
  [0.1, 0.02],
];
const HINDWING = [
  [0.08, -0.02],
  [0.55, -0.02],
  [1.0, -0.15],
  [1.25, -0.45],
  [1.15, -0.85],
  [0.85, -1.1],
  [0.62, -1.18],
  [0.55, -1.45],
  [0.45, -1.5],
  [0.4, -1.25],
  [0.2, -0.85],
  [0.07, -0.4],
];

// Pangkal sayap (asal urat & gradasi warna)
const FORE_BASE = [0.1, 0.18];
const HIND_BASE = [0.1, -0.06];

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Kurva Catmull-Rom tertutup lewat titik kontrol -> poligon halus
function smoothClosed(ctrl, perSeg = 20) {
  const pts = ctrl.map(([x, y]) => [x * WING_SCALE, y * WING_SCALE]);
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t2 +
          (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function inside(poly, px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

function distToEdge(poly, px, py) {
  let best = Infinity;
  for (const [x, y] of poly) {
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Siapkan data satu sayap (sisi kanan): poligon, batas, sudut-sudut urat, pusat bintik.
 */
function buildWing(ctrl, baseRaw, veinCount) {
  const poly = smoothClosed(ctrl);
  const base = [baseRaw[0] * WING_SCALE, baseRaw[1] * WING_SCALE];

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let maxR = 0;
  let minA = Infinity,
    maxA = -Infinity;
  let cx = 0,
    cy = 0;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    maxR = Math.max(maxR, Math.hypot(x - base[0], y - base[1]));
    const a = Math.atan2(y - base[1], x - base[0]);
    minA = Math.min(minA, a);
    maxA = Math.max(maxA, a);
    cx += x;
    cy += y;
  }
  cx /= poly.length;
  cy /= poly.length;

  // Urat: sudut-sudut merata di dalam rentang sudut sayap (tidak di tepi persis)
  const veins = [];
  for (let k = 1; k <= veinCount; k++)
    veins.push(minA + ((maxA - minA) * k) / (veinCount + 1));

  // Bintik putih: berjajar di sepanjang tepi luar, sedikit masuk ke dalam
  const dots = [];
  const cum = [0];
  for (let i = 1; i <= poly.length; i++) {
    const [x0, y0] = poly[i - 1];
    const [x1, y1] = poly[i % poly.length];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[cum.length - 1];
  const SPACING = 0.12;
  for (let L = SPACING / 2; L < total; L += SPACING) {
    let i = 1;
    while (cum[i] < L) i++;
    const [x, y] = poly[i % poly.length];
    // Hanya di tepi LUAR (jauh dari badan) supaya tidak menempel ke badan
    if (x < 0.32) continue;
    const dx = cx - x;
    const dy = cy - y;
    const dl = Math.hypot(dx, dy) || 1;
    dots.push([x + (dx / dl) * 0.042, y + (dy / dl) * 0.042]);
  }

  return { poly, base, minX, maxX, minY, maxY, maxR, veins, dots };
}

function classify(w, x, y) {
  const r = Math.hypot(x - w.base[0], y - w.base[1]);
  const shade = Math.min(1, r / w.maxR);
  const edge = distToEdge(w.poly, x, y);

  // Tepi gelap & bintik hanya di tepi LUAR sayap. Di dekat badan (x kecil) tepi sayap depan
  // dan belakang bertumpuk dan akan tampak sebagai garis terang mendatar di badan.
  if (edge < 0.08 && x > 0.3) {
    for (const [dx, dy] of w.dots) {
      if ((x - dx) * (x - dx) + (y - dy) * (y - dy) < 0.022 * 0.022)
        return [BUTTERFLY_PART.DOT, shade];
    }
    return [BUTTERFLY_PART.BORDER, shade];
  }
  if (r > 0.12) {
    const a = Math.atan2(y - w.base[1], x - w.base[0]);
    for (const va of w.veins) {
      if (Math.abs(a - va) * r < 0.018) return [BUTTERFLY_PART.VEIN, shade];
    }
  }
  return [BUTTERFLY_PART.WING, shade];
}

export function generateButterflyPositions(count) {
  const positions = new Float32Array(count * 3);
  const parts = new Float32Array(count);
  const shades = new Float32Array(count);
  let idx = 0;

  function push(x, y, z, part, shade) {
    if (idx >= count) return;
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    parts[idx] = part;
    shades[idx] = Math.min(1, Math.max(0, shade));
    idx++;
  }

  const fore = buildWing(FOREWING, FORE_BASE, 6);
  const hind = buildWing(HINDWING, HIND_BASE, 5);

  const nBody = Math.floor(count * 0.08);
  const nAntenna = Math.floor(count * 0.03);
  const nWings = count - nBody - nAntenna;
  const nFore = Math.floor(nWings * 0.6);
  const nHind = nWings - nFore;

  // ---------- SAYAP ----------
  function fillWing(w, n, zLayer) {
    // 10% titik tepat di garis luar agar siluet sayap tegas
    const nOutline = Math.floor(n * 0.1);
    const outer = w.poly.filter(([x]) => x > 0.3); // garis luar tanpa sisi yang menempel badan
    for (let i = 0; i < nOutline; i++) {
      const p = outer[Math.floor(Math.random() * outer.length)];
      const side = Math.random() < 0.5 ? -1 : 1;
      const r = Math.hypot(p[0] - w.base[0], p[1] - w.base[1]);
      push(side * p[0], p[1], zLayer, BUTTERFLY_PART.BORDER, r / w.maxR);
    }
    let left = n - nOutline;
    while (left > 0) {
      const x = rand(w.minX, w.maxX);
      const y = rand(w.minY, w.maxY);
      if (!inside(w.poly, x, y)) continue;
      const [part, shade] = classify(w, x, y);
      const side = Math.random() < 0.5 ? -1 : 1;
      push(side * x, y, zLayer + rand(-0.008, 0.008), part, shade);
      left--;
    }
  }
  fillWing(fore, nFore, 0.012); // sayap depan sedikit di atas sayap belakang
  fillWing(hind, nHind, -0.012);

  // ---------- BADAN (kepala, dada, perut beruas) ----------
  const segments = [
    { c: [0, 0.47], r: [0.075, 0.075], share: 0.15 }, // kepala
    { c: [0, 0.2], r: [0.095, 0.2], share: 0.35 }, // dada
    { c: [0, -0.45], r: [0.07, 0.52], share: 0.5 }, // perut
  ];
  let bodyLeft = nBody;
  segments.forEach((sg, si) => {
    const n =
      si === segments.length - 1 ? bodyLeft : Math.floor(nBody * sg.share);
    bodyLeft -= n;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const y = sg.c[1] + u * sg.r[1];
      // Perut beruas: shade bergelombang sepanjang badan
      const ring = si === 2 ? 0.5 + 0.5 * Math.sin(y * 42) : 0.6;
      push(
        Math.cos(th) * s * sg.r[0],
        y,
        Math.sin(th) * s * sg.r[0] + 0.03,
        BUTTERFLY_PART.BODY,
        ring,
      );
    }
  });

  // ---------- ANTENA (melengkung, ujung bulat) ----------
  for (let i = 0; i < nAntenna; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const isTip = Math.random() < 0.3;
    // Kurva Bezier kuadrat: kepala -> kontrol -> ujung
    const p0 = [side * 0.03, 0.52];
    const p1 = [side * 0.07, 0.95];
    const p2 = [side * 0.34, 1.18];
    if (isTip) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = 0.034 * Math.cbrt(Math.random());
      push(
        p2[0] + Math.cos(th) * s * rr,
        p2[1] + u * rr,
        0.03 + Math.sin(th) * s * rr,
        BUTTERFLY_PART.ANTENNA,
        1,
      );
    } else {
      const t = Math.random();
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      push(
        a * p0[0] + b * p1[0] + c * p2[0] + rand(-0.006, 0.006),
        a * p0[1] + b * p1[1] + c * p2[1] + rand(-0.006, 0.006),
        0.03,
        BUTTERFLY_PART.ANTENNA,
        0.5,
      );
    }
  }

  while (idx < count) push(0, 0.2, 0.03, BUTTERFLY_PART.BODY, 0.6);

  return { positions, parts, shades };
}
