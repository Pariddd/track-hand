/**
 * MathUtils.js
 * Fungsi easing dan helper matematika umum.
 */

// Easing halus untuk morph progress (dipakai jika tidak pakai GSAP ease string langsung).
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Alpha untuk low-pass filter eksponensial berbasis cutoff frequency & delta time.
 * Dipakai internal oleh OneEuroFilter.
 */
export function smoothingFactor(dt, cutoff) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

export function expSmooth(prev, current, alpha) {
  return alpha * current + (1 - alpha) * prev;
}
