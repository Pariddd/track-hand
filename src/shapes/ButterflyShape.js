/**
 * ButterflyShape.js
 *
 * Kupu-kupu dari "butterfly curve" (Temple H. Fay):
 *   x = sin(t) * (e^cos(t) - 2cos(4t) - sin^5(t/12))
 *   y = cos(t) * (e^cos(t) - 2cos(4t) - sin^5(t/12)),   t ∈ [0, 12π]
 *
 * Kurva ini hanya garis (outline sayap), jadi tiap titik diskalakan radial terhadap
 * titik asal dengan faktor acak `s` agar bagian dalam sayap ikut terisi partikel
 * (bentuk kurva ini star-shaped terhadap origin, jadi pengisian radial aman).
 * Badan (kolom tipis) dan 2 antena ditambahkan sebagai populasi terpisah.
 *
 * Tidak ada atribut warna per-partikel: warna dihitung di shader dari posisi target
 * (jarak dari pusat -> gradasi pink ke ungu, strip tengah -> badan), lihat particle.vert.glsl.
 */
export function generateButterflyPositions(count) {
  const positions = new Float32Array(count * 3);

  // Dimensi asli kurva: x ±2.9, y -1.8..3.1. Diskalakan ke ±1.8 dan digeser ke tengah.
  const SCALE = 0.62;
  const Y_OFFSET = -0.41;

  const BODY_RATIO = 0.08;
  const ANTENNA_RATIO = 0.03; // total untuk 2 antena
  const bodyCount = Math.floor(count * BODY_RATIO);
  const antennaCount = Math.floor(count * ANTENNA_RATIO);
  const wingCount = count - bodyCount - antennaCount;

  let idx = 0;

  // --- Sayap: outline (45%) + isian dalam (55%) ---
  for (let i = 0; i < wingCount; i++) {
    const t = Math.random() * 12 * Math.PI;
    const r =
      Math.exp(Math.cos(t)) -
      2 * Math.cos(4 * t) -
      Math.pow(Math.sin(t / 12), 5);
    const cx = Math.sin(t) * r;
    const cy = Math.cos(t) * r;

    // Outline: s mendekati 1. Isian: s menyebar, dijaga >= 0.25 agar tidak menumpuk di pusat.
    const isOutline = Math.random() < 0.45;
    const s = isOutline
      ? 0.92 + Math.random() * 0.08
      : 0.25 + 0.75 * Math.sqrt(Math.random());

    positions[idx * 3] = cx * s * SCALE;
    positions[idx * 3 + 1] = cy * s * SCALE + Y_OFFSET;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.08;
    idx++;
  }

  // --- Badan: kolom tipis vertikal di sumbu tengah ---
  const BODY_TOP = 0.9;
  const BODY_BOTTOM = -1.1;
  for (let i = 0; i < bodyCount; i++) {
    const y = BODY_BOTTOM + Math.random() * (BODY_TOP - BODY_BOTTOM);
    // Badan sedikit menggemuk di tengah (dada) dan mengecil di ujung
    const u = (y - BODY_BOTTOM) / (BODY_TOP - BODY_BOTTOM);
    const halfWidth = 0.035 + 0.03 * Math.sin(Math.PI * u);

    positions[idx * 3] = (Math.random() * 2 - 1) * halfWidth * SCALE * 2;
    positions[idx * 3 + 1] = y * SCALE + Y_OFFSET;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.05;
    idx++;
  }

  // --- Antena: 2 garis melengkung tipis dari kepala ke kiri/kanan atas ---
  const antennaEach = Math.floor(antennaCount / 2);
  for (let side = 0; side < 2; side++) {
    const dir = side === 0 ? -1 : 1;
    const n = side === 0 ? antennaEach : antennaCount - antennaEach;
    for (let i = 0; i < n; i++) {
      const u = Math.random(); // 0=pangkal (kepala), 1=ujung
      const x = dir * (0.05 + 0.5 * u);
      const y = BODY_TOP + 0.55 * Math.sin(u * Math.PI * 0.55);

      positions[idx * 3] = x * SCALE + (Math.random() - 0.5) * 0.012;
      positions[idx * 3 + 1] =
        y * SCALE + Y_OFFSET + (Math.random() - 0.5) * 0.012;
      positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.03;
      idx++;
    }
  }

  return positions;
}
