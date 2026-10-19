/**
 * HeartShape.js — Hati 3D menggembung ("bantal")
 *
 * Bentuk dasar: kurva hati parametrik klasik
 *   x(t) = 16 sin^3(t)
 *   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
 *
 * PERBAIKAN dari versi lama:
 * - Versi lama mengambil 200 titik tepi TETAP lalu menarik tiap titik lurus ke pusat.
 *   Akibatnya muncul 200 garis "jari-jari" dan garis putih terang di sumbu tengah.
 * - Versi ini mengisi bagian DALAM hati secara merata per luas (rejection sampling
 *   dengan uji titik-di-dalam-poligon), jadi tidak ada pola garis.
 * - Ketebalan Z mengikuti jarak ke tepi: tebal di tengah, menipis ke tepi, sehingga
 *   hati terlihat 3D saat tangan diputar (bukan lembaran pipih).
 *
 * Output: { positions, shades }
 *   shades (0..1): 0 = jauh di dalam (inti), 1 = tepat di tepi. Dipakai shader untuk
 *   gradasi warna "bara": inti gelap, tepi menyala.
 */

const OUTLINE_SAMPLES = 400;
const SCALE = 0.11; // rentang kurva asli ±16 (x), sekitar -17..12 (y) -> sekitar ±1.8 unit
const THICKNESS = 0.42; // ketebalan maksimum (setengah) di bagian paling tengah
const RIM_RATIO = 0.14; // porsi titik tepat di garis tepi (kontur tegas)
const SURFACE_RATIO = 0.65; // porsi titik isi yang menempel di permukaan depan/belakang

function heartPoint(t) {
  const s = Math.sin(t);
  return [
    16 * s * s * s,
    13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t),
  ];
}

export function generateHeartPositions(count) {
  // --- Poligon tepi (sudah diskalakan & dipusatkan di (0,0)) ---
  const raw = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < OUTLINE_SAMPLES; i++) {
    const [x, y] = heartPoint((i / OUTLINE_SAMPLES) * Math.PI * 2);
    raw.push([x, y]);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const yCenter = (minY + maxY) / 2;
  const poly = raw.map(([x, y]) => [x * SCALE, (y - yCenter) * SCALE]);

  let minX = Infinity;
  let maxX = -Infinity;
  let pMinY = Infinity;
  let pMaxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    pMinY = Math.min(pMinY, y);
    pMaxY = Math.max(pMaxY, y);
  }

  // Uji titik di dalam poligon (ray casting)
  function inside(px, py) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
        hit = !hit;
    }
    return hit;
  }

  // Jarak terdekat ke tepi (pakai titik poligon; 400 titik cukup rapat)
  function distToEdge(px, py) {
    let best = Infinity;
    for (const [x, y] of poly) {
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  const positions = new Float32Array(count * 3);
  const shades = new Float32Array(count);

  const rimCount = Math.floor(count * RIM_RATIO);
  const fillCount = count - rimCount;

  // --- Isi: sampling merata per luas di dalam hati ---
  const fillXY = new Float32Array(fillCount * 2);
  const fillDist = new Float32Array(fillCount);
  let maxDist = 0;
  let n = 0;
  while (n < fillCount) {
    const x = minX + Math.random() * (maxX - minX);
    const y = pMinY + Math.random() * (pMaxY - pMinY);
    if (!inside(x, y)) continue;
    const d = distToEdge(x, y);
    fillXY[n * 2] = x;
    fillXY[n * 2 + 1] = y;
    fillDist[n] = d;
    if (d > maxDist) maxDist = d;
    n++;
  }

  let idx = 0;
  for (let i = 0; i < fillCount; i++) {
    const depth = fillDist[i] / maxDist; // 0 = di tepi, 1 = paling dalam
    const halfThick = THICKNESS * Math.sqrt(depth); // profil bantal: tebal di tengah
    const z =
      Math.random() < SURFACE_RATIO
        ? (Math.random() < 0.5 ? -1 : 1) *
          halfThick *
          (0.9 + 0.1 * Math.random())
        : (Math.random() * 2 - 1) * halfThick;

    positions[idx * 3] = fillXY[i * 2];
    positions[idx * 3 + 1] = fillXY[i * 2 + 1];
    positions[idx * 3 + 2] = z;
    shades[idx] = 1 - Math.pow(depth, 0.8); // inti gelap -> tepi terang
    idx++;
  }

  // --- Tepi: garis kontur tegas, disebar MERATA MENURUT PANJANG GARIS ---
  // Kalau t diacak langsung, titik menumpuk di lekukan atas & ujung bawah (kurva bergerak
  // paling lambat di sana) dan tampak sebagai gumpalan putih. Jadi pilih posisi berdasarkan
  // panjang busur kumulatif.
  const cum = [0];
  for (let i = 1; i <= poly.length; i++) {
    const [x0, y0] = poly[i - 1];
    const [x1, y1] = poly[i % poly.length];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[cum.length - 1];
  for (let i = 0; i < rimCount; i++) {
    const target = Math.random() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const f = (target - cum[lo]) / (cum[hi] - cum[lo] || 1);
    const [x0, y0] = poly[lo];
    const [x1, y1] = poly[hi % poly.length];
    positions[idx * 3] = x0 + (x1 - x0) * f + (Math.random() - 0.5) * 0.02;
    positions[idx * 3 + 1] = y0 + (y1 - y0) * f + (Math.random() - 0.5) * 0.02;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.04;
    shades[idx] = 1;
    idx++;
  }

  return { positions, shades };
}
