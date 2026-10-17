import { smoothingFactor as sf, expSmooth as es } from '../utils/MathUtils.js';

/**
 * OneEuroFilter.js
 *
 * Implementasi One Euro Filter (Casiez et al., 2012).
 * Dipilih dibanding exponential smoothing / lerp naif karena filter ini ADAPTIF:
 * - Saat sinyal input berubah lambat (tangan diam) -> smoothing agresif, jitter minimal.
 * - Saat sinyal berubah cepat (tangan bergerak cepat) -> smoothing dikurangi otomatis,
 *   sehingga lag berkurang.
 *
 * Trade-off yang diselesaikan: lerp/exponential smoothing dengan alpha FIXED harus memilih
 * salah satu antara "stabil tapi lag" atau "responsif tapi jitter" — tidak bisa dua-duanya.
 * One Euro Filter mengatasi ini dengan menghitung cutoff frequency secara dinamis berdasarkan
 * estimasi kecepatan perubahan sinyal (derivative), lalu memakainya untuk menentukan alpha.
 *
 * Referensi: https://cristal.univ-lille.fr/~casiez/1euro/
 */
class LowPassFilter {
  constructor() {
    this.initialized = false;
    this.hatXPrev = 0;
  }

  filter(x, alpha) {
    if (!this.initialized) {
      this.hatXPrev = x;
      this.initialized = true;
      return x;
    }
    const hatX = es(this.hatXPrev, x, alpha);
    this.hatXPrev = hatX;
    return hatX;
  }

  lastValue() {
    return this.hatXPrev;
  }
}

export class OneEuroFilter {
  /**
   * @param {number} minCutoff - cutoff frequency minimum (saat sinyal statis). Lebih kecil = lebih smooth saat idle.
   * @param {number} beta - koefisien speed coefficient. Lebih besar = lebih responsif saat gerakan cepat.
   * @param {number} dCutoff - cutoff frequency untuk filtering derivative sinyal.
   */
  constructor(minCutoff = 1.0, beta = 0.3, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();

    this.lastTime = null;
  }

  /**
   * @param {number} x - nilai scalar mentah yang mau difilter
   * @param {number} timestampMs - waktu saat ini dalam milidetik (performance.now())
   */
  filter(x, timestampMs) {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(x, 1.0);
    }

    let dt = (timestampMs - this.lastTime) / 1000;
    this.lastTime = timestampMs;

    // Guard: dt invalid (0 atau negatif akibat timestamp tidak monoton) -> pakai fallback kecil
    if (dt <= 0) dt = 1 / 30;

    const prevX = this.xFilter.initialized ? this.xFilter.lastValue() : x;
    const dx = (x - prevX) / dt;

    const edx = this.dxFilter.filter(dx, sf(dt, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(x, sf(dt, cutoff));
  }
}

/**
 * Wrapper untuk memfilter Vector3 (posisi) menggunakan 3 instance OneEuroFilter independen per axis.
 */
export class OneEuroVector3Filter {
  constructor(minCutoff, beta, dCutoff) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(vec3, timestampMs) {
    vec3.x = this.fx.filter(vec3.x, timestampMs);
    vec3.y = this.fy.filter(vec3.y, timestampMs);
    vec3.z = this.fz.filter(vec3.z, timestampMs);
    return vec3;
  }
}

/**
 * Wrapper untuk quaternion: filter tiap komponen (x,y,z,w) lalu normalize ulang.
 * Catatan teknis: filtering komponen quaternion secara independen bukan cara paling matematis
 * benar (idealnya SLERP-based smoothing), tapi untuk noise kecil frame-to-frame ini adalah
 * pendekatan standar yang cukup baik dan jauh lebih murah secara komputasi.
 */
export class OneEuroQuaternionFilter {
  constructor(minCutoff, beta, dCutoff) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fw = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(quat, timestampMs) {
    quat.x = this.fx.filter(quat.x, timestampMs);
    quat.y = this.fy.filter(quat.y, timestampMs);
    quat.z = this.fz.filter(quat.z, timestampMs);
    quat.w = this.fw.filter(quat.w, timestampMs);
    quat.normalize();
    return quat;
  }
}
