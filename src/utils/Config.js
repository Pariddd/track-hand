/**
 * Config.js
 * Semua konstanta yang bisa di-tuning terpusat di sini.
 * Jangan hardcode angka magic di modul lain — import dari sini.
 */

export const Config = {
  particles: {
    // Default 24.000, BUKAN 50.000 seperti spek awal.
    // Alasan: kombinasi UnrealBloomPass (multi-pass blur) + custom vertex shader morphing
    // pada 50k point berisiko tidak mencapai 60fps di GPU integrated (Intel Iris, dsb).
    // Naikkan nilai ini manual jika target hardware punya GPU diskrit.
    COUNT: 24000,
    // BASE_SIZE sekarang dalam WORLD-UNIT (radius partikel di ruang 3D scene), dipakai
    // bersama uniform uViewportHeight di shader untuk perspective-correct sizing.
    // Nilai lama (2.4) dikalibrasi untuk formula shader yang SALAH (magic constant 300)
    // dan menghasilkan point ~120px/partikel -> whiteout total. 0.03 terkalibrasi untuk
    // menghasilkan ~4px per partikel di viewport ~800px tinggi, jarak kamera z=6.
    BASE_SIZE: 0.03,
    MORPH_DURATION: 1.0, // detik, sesuai spek 0.8-1.2s
  },

  hand: {
    // Delegate untuk MediaPipe HandLandmarker.
    // GPU lebih cepat tapi kadang fallback silent di beberapa driver.
    // main.js akan retry ke CPU otomatis jika GPU gagal init.
    PREFERRED_DELEGATE: 'GPU',
    NUM_HANDS: 1,
    MIN_HAND_DETECTION_CONFIDENCE: 0.6,
    MIN_HAND_PRESENCE_CONFIDENCE: 0.6,
    MIN_TRACKING_CONFIDENCE: 0.6,

    // Inference loop di-throttle terpisah dari render loop (lihat main.js).
    // 30Hz cukup untuk gesture tracking tanpa membebani frame budget render 60fps.
    INFERENCE_TARGET_HZ: 30,
  },

  filter: {
    // One Euro Filter parameters.
    // minCutoff kecil -> smoothing lebih agresif saat gerakan lambat (mengurangi jitter idle).
    // beta besar -> filter lebih responsif saat gerakan cepat (mengurangi lag).
    MIN_CUTOFF: 1.0,
    BETA: 0.3,
    D_CUTOFF: 1.0,
  },

  gesture: {
    // Jumlah frame konsisten berturut-turut sebelum gesture dianggap valid (debounce/hysteresis).
    // Pada inference 30Hz, 8 frame ~ 266ms delay konfirmasi — trade-off responsivitas vs stabilitas.
    CONFIRM_FRAMES: 8,
  },

  scene: {
    BACKGROUND_COLOR: 0x000000,
    CAMERA_FOV: 50,
    CAMERA_NEAR: 0.1,
    CAMERA_FAR: 100,
    CAMERA_Z: 6,
  },

  bloom: {
    // Dimatikan atas permintaan eksplisit: UnrealBloomPass dengan RADIUS 0.5 mem-blur
    // cahaya tiap partikel sampai melebar ke celah antar-huruf pada TextShape (jarak antar
    // glyph di canvas 2D relatif kecil dibanding blur radius bloom di screen-space padat).
    // Hasilnya: partikel yang seharusnya membentuk huruf terpisah malah menyatu jadi satu
    // blob putih solid berbentuk bounding-box kata (persis kasus yang dilaporkan).
    // STRENGTH/RADIUS/THRESHOLD di bawah TETAP disimpan (bukan dihapus) supaya bisa
    // diaktifkan lagi tanpa perlu rekonstruksi nilai kalibrasi dari nol.
    ENABLED: false,
    STRENGTH: 1.1,   // diturunkan dari 1.4 — dengan tone mapping aktif, strength lama akan tetap terlalu terang
    RADIUS: 0.5,
    THRESHOLD: 0.4,  // dinaikkan dari 0.15 — threshold rendah + additive overlap = whiteout (lihat main.js)
  },

  colors: {
    NEON_BLUE: [0.2, 0.55, 1.0],
    CYAN: [0.3, 0.95, 1.0],
  },
};
