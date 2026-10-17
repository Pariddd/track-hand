/**
 * FlowerShape.js
 *
 * Bunga mawar: kelopak (rose curve r=cos(kθ), 2 lapis: luar+dalam), tangkai
 * (garis melengkung tipis), dan 2 daun (elips meruncing menempel di tangkai).
 * Tiap partikel diberi `category` (0=petal, 1=stem, 2=leaf) dan `shade` (0-1,
 * gradient warna dalam kategori) — dipakai shader untuk pewarnaan (lihat
 * particle.vert.glsl), TIDAK ikut proses morph posisi (statis per index).
 */
export function generateFlowerPositions(count) {
  const positions = new Float32Array(count * 3);
  const categories = new Float32Array(count); // 0=petal, 1=stem, 2=leaf
  const shades = new Float32Array(count); // 0..1 gradient warna dalam kategori

  const PETAL_RATIO = 0.62;
  const INNER_FILL_RATIO = 0.16; // lapisan kelopak dalam yang lebih rapat -> kesan mawar berlapis
  const STEM_RATIO = 0.14;
  const LEAF_RATIO = 0.08; // dibagi 2 daun

  const petalCount = Math.floor(count * PETAL_RATIO);
  const innerFillCount = Math.floor(count * INNER_FILL_RATIO);
  const stemCount = Math.floor(count * STEM_RATIO);
  const leafCountEach = Math.floor((count * LEAF_RATIO) / 2);
  // Sisa pembulatan diserap populasi petal (paling toleran terhadap selisih kecil)
  const petalCountFinal =
    petalCount +
    (count - (petalCount + innerFillCount + stemCount + leafCountEach * 2));

  const PETALS_K = 5; // rose curve: k ganjil -> k kelopak
  const PETAL_SCALE = 1.05;
  const BLOOM_CENTER_Y = 0.85; // bunga di atas, tangkai menjuntai ke bawah

  const STEM_TOP_Y = BLOOM_CENTER_Y - 0.4;
  const STEM_BOTTOM_Y = -1.55;
  const STEM_RADIUS = 0.045;
  const STEM_BEND = 0.12; // amplitudo lengkungan tangkai

  // x-offset tangkai pada tinggi t (0=bawah, 1=atas). Dipakai SAMA oleh partikel tangkai
  // dan titik tempel daun, supaya daun benar-benar menempel di kurva tangkai.
  function stemXAt(t) {
    return Math.sin(t * Math.PI * 1.2) * STEM_BEND;
  }

  let idx = 0;

  // --- Kelopak luar: rose curve, gradasi merah gelap (pangkal) -> terang (ujung) ---
  for (let i = 0; i < petalCountFinal; i++) {
    const theta = Math.random() * Math.PI * 2;
    const rBase = PETAL_SCALE * Math.cos(PETALS_K * theta);
    const noise = (Math.random() - 0.5) * PETAL_SCALE * 0.14;
    const r = rBase + noise;

    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta) + BLOOM_CENTER_Y;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.12;
    categories[idx] = 0;
    shades[idx] = Math.min(1, Math.abs(r) / PETAL_SCALE);
    idx++;
  }

  // --- Kelopak dalam: lapisan rapat dekat pusat, lebih gelap (kesan mawar berlapis) ---
  for (let i = 0; i < innerFillCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = PETAL_SCALE * 0.4 * Math.sqrt(Math.random());

    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(theta) + BLOOM_CENTER_Y;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.12;
    categories[idx] = 0;
    shades[idx] = Math.random() * 0.25;
    idx++;
  }

  // --- Tangkai: gradasi hijau tua (bawah) -> segar (dekat kuncup) ---
  for (let i = 0; i < stemCount; i++) {
    const t = Math.random();
    const y = STEM_BOTTOM_Y + t * (STEM_TOP_Y - STEM_BOTTOM_Y);
    const angle = Math.random() * Math.PI * 2;
    const radius = STEM_RADIUS * Math.sqrt(Math.random());

    positions[idx * 3] = stemXAt(t) + Math.cos(angle) * radius;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = Math.sin(angle) * radius;
    categories[idx] = 1;
    shades[idx] = t;
    idx++;
  }

  // --- Daun: 2 elips meruncing (envelope sinusoidal), menempel & menyerong dari tangkai ---
  const leafAttachT = [0.35, 0.65];
  const leafSide = [-1, 1]; // kiri / kanan
  const LEAF_LENGTH = 0.42;
  const LEAF_WIDTH = 0.2;
  const LEAF_ANGLE = Math.PI / 3.2;

  for (let leaf = 0; leaf < 2; leaf++) {
    const t = leafAttachT[leaf];
    const side = leafSide[leaf];
    const attachX = stemXAt(t);
    const attachY = STEM_BOTTOM_Y + t * (STEM_TOP_Y - STEM_BOTTOM_Y);
    const alpha = LEAF_ANGLE * side;
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);

    for (let i = 0; i < leafCountEach; i++) {
      const u = Math.random() * LEAF_LENGTH; // 0=pangkal daun, LEAF_LENGTH=ujung
      const halfWidth =
        0.5 * LEAF_WIDTH * Math.sin((Math.PI * u) / LEAF_LENGTH); // meruncing di kedua ujung
      const v = (Math.random() * 2 - 1) * halfWidth;

      positions[idx * 3] = attachX + u * sinA - v * cosA;
      positions[idx * 3 + 1] = attachY + u * cosA + v * sinA;
      positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.08;
      categories[idx] = 2;
      shades[idx] = 0.3 + Math.random() * 0.4;
      idx++;
    }
  }

  return { positions, categories, shades };
}
