# Interactive 3D Hand Tracking Particle System

## Setup

```bash
npm install
npm run dev
```

Buka URL yang muncul (default `http://localhost:5173`). Browser akan meminta izin kamera.

**Produksi/deploy:** wajib HTTPS (atau domain localhost) — `getUserMedia` diblokir browser di HTTP non-secure context.

```bash
npm run build
npm run preview
```

## Gesture Mapping

| Gesture | Trigger | Shape |
|---|---|---|
| Fist (kepal) | index+middle+ring+pinky semua tertekuk | Planet + cincin |
| Peace (✌️) | index+middle terbuka, ring+pinky tertekuk | Teks "I LOVE U" |
| I Love You (ASL) | thumb+index+pinky terbuka, middle+ring tertekuk | Hati (heartbeat) |

Gesture butuh **~8 frame konsisten** (di inference 30Hz ≈ 260ms) sebelum trigger morph — ini disengaja untuk menghindari flicker, lihat `GestureStateMachine.js`.

## Known Limitations (baca sebelum lapor "bug")

1. **Rotasi roll (memutar sepanjang sumbu lengan) lebih noisy** dibanding pitch/yaw — ini keterbatasan akurasi depth (z-axis) MediaPipe landmark, bukan bug filter. Lihat komentar di `HandOrientation.js`.
2. **Default particle count = 24.000**, bukan 50.000 seperti draft awal spek. Naikkan `Config.particles.COUNT` di `src/utils/Config.js` jika target hardware punya GPU diskrit — tapi uji FPS ulang setelah naik.
3. **60 FPS tidak dijamin di GPU integrated** (Intel Iris, dsb) terutama dengan bloom aktif di resolusi tinggi. Tuas performa pertama: turunkan `renderer.setPixelRatio()` cap di `main.js` (saat ini 1.5), BUKAN particle count — bloom cost didominasi resolusi screen-space.
4. **Delegate GPU MediaPipe** bisa gagal init di beberapa kombinasi browser/driver — kode sudah fallback otomatis ke CPU delegate, cek console untuk warning.
5. **Hanya 1 tangan** dilacak (`Config.hand.NUM_HANDS = 1`). Bisa dinaikkan tapi belum ada logic untuk resolve konflik gesture jika 2 tangan menunjukkan gesture berbeda.

## Tuning Cepat

Semua konstanta ada di `src/utils/Config.js` — jangan hardcode angka baru di file lain.

- Filter terasa lag → naikkan `Config.filter.BETA`.
- Filter terasa jitter saat diam → turunkan `Config.filter.MIN_CUTOFF`.
- Morph terasa terlalu cepat/lambat → `Config.particles.MORPH_DURATION`.
- Gesture terlalu lambat konfirmasi → turunkan `Config.gesture.CONFIRM_FRAMES` (risiko: lebih rentan flicker).
