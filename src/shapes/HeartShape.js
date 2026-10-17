/**
 * HeartShape.js
 *
 * Generate posisi target partikel untuk ikon hati.
 * Memakai parametric heart curve klasik:
 *   x(t) = 16 sin^3(t)
 *   y(t) = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
 *
 * Curve ini hanya menghasilkan OUTLINE 2D. Untuk mengisi volume (bukan cuma garis tepi,
 * agar terlihat solid/pejal saat bloom seperti planet), dilakukan scaling radial random
 * dari titik outline menuju centroid (0,0), plus sedikit extrusion di sumbu Z agar hati
 * punya ketebalan tipis (bukan flat sempurna) — konsisten dengan pendekatan TextShape.
 */
export function generateHeartPositions(count) {
  const positions = new Float32Array(count * 3);

  const outlinePoints = [];
  const samples = 200;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    outlinePoints.push({ x, y });
  }

  // Normalisasi skala curve (rentang asli kira2 -16..16 x, -17..13 y) ke world-space ~radius 1.5-2
  const scale = 0.11;

  for (let i = 0; i < count; i++) {
    const p = outlinePoints[Math.floor(Math.random() * outlinePoints.length)];

    // Scaling radial dari centroid (bukan dari origin geometris curve, tapi dari titik
    // tengah visual hati) supaya isi volume merata, bukan menumpuk di satu sisi.
    const centroidY = -2; // offset empiris agar isi memenuhi bentuk dengan baik
    const fillFactor = Math.cbrt(Math.random()); // distribusi radial merata (sama alasan seperti PlanetShape)

    const x = p.x * scale * fillFactor;
    const y = (p.y * scale - centroidY * scale) * fillFactor + centroidY * scale;
    const z = (Math.random() - 0.5) * 0.2;

    const idx = i * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
  }

  return positions;
}
