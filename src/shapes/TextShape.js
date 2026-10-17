/**
 * TextShape.js
 *
 * Generate posisi target partikel untuk teks "I LOVE U".
 *
 * PENDEKATAN: render teks ke offscreen canvas 2D, baca pixel yang punya alpha > threshold
 * (area yang tertutup glyph huruf), lalu sample titik dari area itu.
 *
 * GAP YANG DISELESAIKAN DI SINI (particle count parity, lihat diskusi sebelumnya):
 * Text punya "surface area" jauh lebih kecil dari planet solid, sehingga kalau di-sample
 * sekali per pixel akan menghasilkan jauh lebih sedikit titik dari `count` yang dibutuhkan
 * untuk morph index-based (yang mensyaratkan jumlah titik SAMA persis di semua shape).
 *
 * Solusi: OVERSAMPLING — pixel valid dikumpulkan dulu, lalu titik final diambil dengan
 * random sampling BERULANG dari pool pixel valid tsb (dengan sedikit jitter offset per titik)
 * sampai jumlah genap `count`. Ini membuat teks tetap terlihat solid/padat wajar (bukan blok),
 * karena titik-titik tambahan menumpuk di area yang sama, bukan menyebar ke luar bentuk huruf.
 */
export function generateTextPositions(count, text = 'I LOVE U') {
  const canvas = document.createElement('canvas');
  const canvasSize = 1024;
  canvas.width = canvasSize;
  canvas.height = canvasSize / 2;
  const ctx = canvas.getContext('2d');

  // SENGAJA TIDAK di-fillRect background: canvas 2D default transparan (alpha=0 di semua
  // piksel). Deteksi glyph di bawah bergantung pada "alpha > 128 = bagian dari huruf" —
  // kalau background di-fillRect solid (bug versi sebelumnya: fillRect('#000000') membuat
  // SELURUH kanvas alpha=255), maka SEMUA piksel lolos threshold, bukan cuma piksel huruf,
  // sehingga hasil sampling jadi kotak penuh seukuran kanvas, bukan bentuk teks.

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Font size disesuaikan agar teks memenuhi lebar canvas secara proporsional
  let fontSize = 160;
  ctx.font = `bold ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  let textWidth = ctx.measureText(text).width;
  const maxWidth = canvas.width * 0.85;
  if (textWidth > maxWidth) {
    fontSize = Math.floor(fontSize * (maxWidth / textWidth));
    ctx.font = `bold ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  }

  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // Kumpulkan koordinat pixel valid (alpha channel > 0 berarti bagian dari glyph)
  const validPixels = [];
  for (let y = 0; y < canvas.height; y += 2) {
    // step 2px untuk mengurangi jumlah kandidat awal (performa build-time), masih cukup rapat
    for (let x = 0; x < canvas.width; x += 2) {
      const alphaIdx = (y * canvas.width + x) * 4 + 3;
      if (imageData[alphaIdx] > 128) {
        validPixels.push({ x, y });
      }
    }
  }

  if (validPixels.length === 0) {
    console.warn('[TextShape] Tidak ada pixel valid terdeteksi, fallback ke posisi random.');
  }

  const positions = new Float32Array(count * 3);
  // scale menentukan ukuran AKHIR teks di world-space (bukan fontSize — fontSize di atas
  // auto-shrink mengikuti maxWidth, jadi hasil akhirnya selalu proporsional terhadap
  // canvas.width, bukan terhadap fontSize mentah). Dinaikkan dari 4.0 -> 6.0 (+50%) untuk
  // memperbesar "I LOVE U". Naikkan lagi angka ini kalau masih ingin lebih besar.
  const scale = 6.0 / canvas.width; // normalisasi ke skala world-space serupa PlanetShape (radius ~1-2.3)
  const jitterAmount = 1.2 / canvas.width; // jitter kecil agar oversampling tidak terlihat sebagai titik identik persis

  for (let i = 0; i < count; i++) {
    let px, py;
    if (validPixels.length > 0) {
      const p = validPixels[Math.floor(Math.random() * validPixels.length)];
      px = p.x + (Math.random() - 0.5) * 4;
      py = p.y + (Math.random() - 0.5) * 4;
    } else {
      px = Math.random() * canvas.width;
      py = Math.random() * canvas.height;
    }

    const worldX = (px - canvas.width / 2) * scale;
    const worldY = -(py - canvas.height / 2) * scale; // flip Y: canvas y-down -> world y-up
    const worldZ = (Math.random() - 0.5) * 0.15; // sedikit ketebalan Z agar teks tidak flat 2D sempurna

    const idx = i * 3;
    positions[idx] = worldX + (Math.random() - 0.5) * jitterAmount;
    positions[idx + 1] = worldY;
    positions[idx + 2] = worldZ;
  }

  return positions;
}
