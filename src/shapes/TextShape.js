/**
 * TextShape.js — Pesan tulisan tangan dari partikel
 *
 * Teks dirender ke canvas offscreen, lalu piksel huruf dipakai sebagai posisi partikel.
 *
 * Gaya: font tulisan tangan Caveat (dibundel lewat @fontsource/caveat, lihat main.js).
 *   - Baris pesan biasa  -> peran 0 (warna krem keemasan di shader)
 *   - Baris TERAKHIR     -> peran 1 (lebih besar, pink-merah): penutup/inti pesan
 *   - "<3" di akhir baris -> diganti ikon hati sungguhan, peran 2
 *
 * Tiap partikel juga mendapat `order` (0..1) = urutan baca (baris demi baris, kiri ke kanan).
 * Shader memakainya untuk efek "sedang ditulis": huruf tersusun mengikuti urutan baca.
 *
 * Cara membedakan peran: tiap peran digambar dengan kanal warna berbeda di canvas
 * (merah = pesan, hijau = baris terakhir, biru = ikon hati), lalu dibaca saat sampling.
 *
 * PENTING: font harus sudah termuat sebelum fungsi ini dipanggil (lihat main.js), kalau
 * tidak canvas memakai font cadangan.
 *
 * Output: { positions, roles, orders }
 */

export const TEXT_ROLE = { MESSAGE: 0, EMPHASIS: 1, HEART: 2 };

const FONT_FAMILY = "Caveat, 'Segoe Script', cursive";
const FONT_WEIGHT = 700;
const EMPHASIS_SCALE = 1.28; // baris terakhir lebih besar
const LINE_HEIGHT = 1.08; // tulisan tangan lebih rapat dari font biasa
const CANVAS_W = 1024;
const CANVAS_H = 512;
const WORLD_WIDTH = 8.0; // lebar kanvas di world-space (teks ~7.2 unit, muat di layar lebar)

function drawHeart(ctx, cx, top, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, top + h * 0.3);
  ctx.bezierCurveTo(cx, top, cx - w / 2, top, cx - w / 2, top + h * 0.3);
  ctx.bezierCurveTo(cx - w / 2, top + h * 0.6, cx, top + h * 0.78, cx, top + h);
  ctx.bezierCurveTo(
    cx,
    top + h * 0.78,
    cx + w / 2,
    top + h * 0.6,
    cx + w / 2,
    top + h * 0.3,
  );
  ctx.bezierCurveTo(cx + w / 2, top, cx, top, cx, top + h * 0.3);
  ctx.closePath();
  ctx.fill();
}

export function generateTextPositions(count, text = "I LOVE U") {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  // Background SENGAJA tidak diisi: deteksi huruf bergantung pada alpha > 128.

  // --- Siapkan baris: baris terakhir = penekanan; "<3" di akhir diganti ikon hati ---
  const raw = text.split("\n");
  const lines = raw.map((s, i) => {
    let t = s.trimEnd();
    let heart = false;
    if (t.endsWith("<3")) {
      heart = true;
      t = t.slice(0, -2).trimEnd();
    }
    return { text: t, heart, emphasis: i === raw.length - 1 && raw.length > 1 };
  });

  const fontAt = (size) => `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;

  // Ukur di ukuran dasar 100px, lalu skala supaya pas lebar & tinggi kanvas
  const BASE = 100;
  const measure = (ln, base) => {
    const size = ln.emphasis ? base * EMPHASIS_SCALE : base;
    ctx.font = fontAt(size);
    const tw = ctx.measureText(ln.text).width;
    const heartW = ln.heart ? size * 0.62 : 0;
    const gap = ln.heart && ln.text ? size * 0.22 : 0;
    return {
      size,
      textW: tw,
      heartW,
      gap,
      total: tw + gap + heartW,
      lineH: size * LINE_HEIGHT,
    };
  };
  let m = lines.map((ln) => measure(ln, BASE));
  const widest = Math.max(...m.map((x) => x.total));
  const tallest = m.reduce((s, x) => s + x.lineH, 0);
  const k = Math.min((CANVAS_W * 0.9) / widest, (CANVAS_H * 0.9) / tallest);
  m = lines.map((ln) => measure(ln, BASE * k));

  // --- Gambar: tiap peran dengan kanal warna berbeda ---
  const blockH = m.reduce((s, x) => s + x.lineH, 0);
  let y = (CANVAS_H - blockH) / 2;
  const bands = []; // batas vertikal & horizontal tiap baris (untuk urutan baca)
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((ln, i) => {
    const mm = m[i];
    const midY = y + mm.lineH / 2;
    const left = (CANVAS_W - mm.total) / 2;
    ctx.font = fontAt(mm.size);
    ctx.fillStyle = ln.emphasis ? "rgb(0,255,0)" : "rgb(255,0,0)";
    ctx.fillText(ln.text, left, midY);
    if (ln.heart) {
      ctx.fillStyle = "rgb(0,0,255)";
      const hw = mm.heartW;
      drawHeart(
        ctx,
        left + mm.textW + mm.gap + hw / 2,
        midY - hw * 0.45,
        hw,
        hw * 0.9,
      );
    }
    bands.push({ top: y, bottom: y + mm.lineH, left, right: left + mm.total });
    y += mm.lineH;
  });

  // --- Kumpulkan piksel huruf beserta peran & urutan bacanya ---
  const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  const px = [];
  for (let yy = 0; yy < CANVAS_H; yy++) {
    for (let xx = 0; xx < CANVAS_W; xx++) {
      const o = (yy * CANVAS_W + xx) * 4;
      if (img[o + 3] <= 128) continue;
      const r = img[o];
      const g = img[o + 1];
      const b = img[o + 2];
      const role =
        b > r && b > g
          ? TEXT_ROLE.HEART
          : g > r
            ? TEXT_ROLE.EMPHASIS
            : TEXT_ROLE.MESSAGE;
      // Baris = pita vertikal tempat piksel berada (huruf bisa sedikit keluar pita: clamp)
      let li = bands.findIndex((bd) => yy < bd.bottom);
      if (li < 0) li = bands.length - 1;
      const bd = bands[li];
      const xNorm = Math.min(
        1,
        Math.max(0, (xx - bd.left) / (bd.right - bd.left || 1)),
      );
      px.push(xx, yy, role, (li + xNorm) / bands.length);
    }
  }

  const positions = new Float32Array(count * 3);
  const roles = new Float32Array(count);
  const orders = new Float32Array(count);
  const nPx = px.length / 4;
  if (nPx === 0) console.warn("[TextShape] Tidak ada piksel huruf terdeteksi.");

  const scale = WORLD_WIDTH / CANVAS_W;
  for (let i = 0; i < count; i++) {
    let x;
    let yv;
    let role = TEXT_ROLE.MESSAGE;
    let order = Math.random();
    if (nPx > 0) {
      const j = Math.floor(Math.random() * nPx) * 4;
      // Jitter sub-piksel kecil agar titik oversampling tidak identik
      x = px[j] + Math.random() - 0.5;
      yv = px[j + 1] + Math.random() - 0.5;
      role = px[j + 2];
      order = px[j + 3];
    } else {
      x = Math.random() * CANVAS_W;
      yv = Math.random() * CANVAS_H;
    }
    positions[i * 3] = (x - CANVAS_W / 2) * scale;
    positions[i * 3 + 1] = -(yv - CANVAS_H / 2) * scale; // canvas y-down -> world y-up
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
    roles[i] = role;
    orders[i] = order;
  }

  return { positions, roles, orders };
}
