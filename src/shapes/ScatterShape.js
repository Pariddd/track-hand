/**
 * ScatterShape.js
 *
 * Generate posisi target partikel untuk kondisi "menyebar" (dipicu gesture telapak
 * terbuka / 5 jari).
 *
 * DESAIN: bukan sekadar noise acak dalam kubus — dipakai kombinasi 2 populasi
 * agar hasilnya terlihat seperti LEDAKAN dari titik tengah, bukan awan noise statis:
 *
 *   1. 70% partikel: uniform-volume di dalam bola radius besar (SCATTER_RADIUS),
 *      pakai distribusi radius r^(1/3) — pola yang SAMA seperti PlanetShape.js
 *      (isi volumetrik merata, bukan menumpuk di pusat/kulit).
 *   2. 30% partikel: dilempar ke shell luar (antara SCATTER_RADIUS dan ~1.6x-nya)
 *      untuk memberi kesan "serpihan terlempar jauh", memperkuat kesan dispersal
 *      dibanding cuma bola padat besar.
 *
 * Radius jauh lebih besar dari PlanetShape (radius 1) maupun cincin planet (s/d 2.3),
 * supaya morph ke shape ini SECARA VISUAL jelas berbeda: partikel benar-benar
 * "kabur" menjauhi kamera/pusat, bukan cuma ganti bentuk di volume yang sama.
 *
 * CATATAN PERFORMA/KONSISTENSI: count HARUS sama dengan shape lain (index-based
 * morph di ParticleSystem.js mensyaratkan parity jumlah titik di semua shape).
 */
export function generateScatterPositions(count) {
  const positions = new Float32Array(count * 3);

  const SCATTER_RADIUS = 3.4; // dibandingkan planet body radius=1.0 dan ring outer=2.3
  const SHELL_OUTER_MULT = 1.6;

  const shellRatio = 0.3;
  const shellCount = Math.floor(count * shellRatio);
  const volumeCount = count - shellCount;

  // --- Populasi 1: isi volumetrik bola besar (pola sama seperti badan planet) ---
  for (let i = 0; i < volumeCount; i++) {
    const r = SCATTER_RADIUS * Math.cbrt(Math.random());

    // Sampling arah uniform di permukaan unit sphere (metode Marsaglia sederhana
    // via theta/phi acak dengan koreksi cos agar tidak menumpuk di kutub).
    const u = Math.random() * 2 - 1; // cos(phi), uniform di [-1, 1]
    const theta = Math.random() * Math.PI * 2;
    const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));

    const x = Math.cos(theta) * sinPhi;
    const y = u;
    const z = Math.sin(theta) * sinPhi;

    const idx = i * 3;
    positions[idx] = x * r;
    positions[idx + 1] = y * r;
    positions[idx + 2] = z * r;
  }

  // --- Populasi 2: shell luar (serpihan terlempar jauh) ---
  for (let i = 0; i < shellCount; i++) {
    const r = SCATTER_RADIUS + Math.random() * (SCATTER_RADIUS * SHELL_OUTER_MULT - SCATTER_RADIUS);

    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));

    const x = Math.cos(theta) * sinPhi;
    const y = u;
    const z = Math.sin(theta) * sinPhi;

    const idx = (volumeCount + i) * 3;
    positions[idx] = x * r;
    positions[idx + 1] = y * r;
    positions[idx + 2] = z * r;
  }

  return positions;
}
