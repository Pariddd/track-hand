/**
 * TextShape.js
 *
 * Generate posisi target partikel untuk teks (mendukung multi-baris dengan "\n").
 *
 * PENDEKATAN: render teks ke offscreen canvas 2D, baca pixel yang punya alpha > threshold
 * (area yang tertutup glyph huruf), lalu sample titik dari area itu.
 *
 * OVERSAMPLING: pixel valid dikumpulkan dulu, lalu titik final diambil dengan random
 * sampling BERULANG dari pool pixel valid (dengan sedikit jitter) sampai jumlah genap
 * `count`, karena morph index-based mensyaratkan jumlah titik SAMA di semua shape.
 */
export function generateTextPositions(count, text = "I LOVE U") {
  const canvas = document.createElement("canvas");
  const canvasSize = 1024;
  canvas.width = canvasSize;
  canvas.height = canvasSize / 2;
  const ctx = canvas.getContext("2d");

  // SENGAJA TIDAK di-fillRect background: canvas default transparan (alpha=0).
  // Deteksi glyph di bawah bergantung pada "alpha > 128 = bagian dari huruf".

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Mendukung teks MULTI-BARIS: pisahkan baris dengan "\n" (mis. "Baris 1\nBaris 2").
  // Ukuran font dipilih agar BARIS TERPANJANG muat di 85% lebar kanvas DAN seluruh blok
  // baris muat di 85% tinggi kanvas; mana yang lebih membatasi, itu yang dipakai.
  const lines = text.split("\n");
  const LINE_HEIGHT = 1.25; // jarak antar baris relatif terhadap fontSize
  const fontFamily = "'Segoe UI', system-ui, sans-serif";
  const maxWidth = canvas.width * 0.85;
  const maxHeight = canvas.height * 0.85;

  let fontSize = 160;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const totalHeight = fontSize * LINE_HEIGHT * lines.length;
  const shrink = Math.min(1, maxWidth / widest, maxHeight / totalHeight);
  fontSize = Math.floor(fontSize * shrink);
  ctx.font = `bold ${fontSize}px ${fontFamily}`;

  // Susun blok baris agar tengahnya berada di tengah kanvas
  const blockHeight = fontSize * LINE_HEIGHT * lines.length;
  const firstLineY =
    (canvas.height - blockHeight) / 2 + (fontSize * LINE_HEIGHT) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      canvas.width / 2,
      firstLineY + i * fontSize * LINE_HEIGHT,
    );
  });

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // Kumpulkan koordinat pixel valid (bagian dari glyph)
  const validPixels = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const alphaIdx = (y * canvas.width + x) * 4 + 3;
      if (imageData[alphaIdx] > 128) {
        validPixels.push({ x, y });
      }
    }
  }

  if (validPixels.length === 0) {
    console.warn(
      "[TextShape] Tidak ada pixel valid terdeteksi, fallback ke posisi random.",
    );
  }

  const positions = new Float32Array(count * 3);
  // scale menentukan ukuran AKHIR teks di world-space. Naikkan kalau ingin teks lebih besar.
  const scale = 9.0 / canvas.width;
  const jitterAmount = 1.2 / canvas.width;

  for (let i = 0; i < count; i++) {
    let px, py;
    if (validPixels.length > 0) {
      const p = validPixels[Math.floor(Math.random() * validPixels.length)];
      // Jitter kecil (±0.75px) supaya titik oversampling tidak identik, tapi tidak sampai
      // "meluber" keluar stroke huruf (sebelumnya ±2px membuat tepi huruf berbintik).
      px = p.x + (Math.random() - 0.5) * 1.5;
      py = p.y + (Math.random() - 0.5) * 1.5;
    } else {
      px = Math.random() * canvas.width;
      py = Math.random() * canvas.height;
    }

    const worldX = (px - canvas.width / 2) * scale;
    const worldY = -(py - canvas.height / 2) * scale; // flip Y: canvas y-down -> world y-up
    const worldZ = (Math.random() - 0.5) * 0.15;

    const idx = i * 3;
    positions[idx] = worldX + (Math.random() - 0.5) * jitterAmount;
    positions[idx + 1] = worldY;
    positions[idx + 2] = worldZ;
  }

  return positions;
}
