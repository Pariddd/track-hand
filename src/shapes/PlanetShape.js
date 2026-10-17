/**
 * PlanetShape.js
 *
 * Generate posisi target partikel untuk bentuk "planet + cincin".
 * Memakai Fibonacci sphere (golden-angle spiral) untuk distribusi permukaan bola
 * yang MERATA — jauh lebih baik daripada random uniform sphere (yang cenderung
 * menumpuk di kutub jika tidak di-weight dengan benar).
 *
 * Alokasi: 80% partikel ke badan planet (isi solid, bukan cuma permukaan, agar
 * terlihat pejal & bercahaya dari dalam saat bloom), 20% ke cincin.
 */
export function generatePlanetPositions(count) {
  const positions = new Float32Array(count * 3);

  const ringRatio = 0.2;
  const ringCount = Math.floor(count * ringRatio);
  const bodyCount = count - ringCount;

  // --- Badan planet: isi volumetrik bola pakai Fibonacci sphere di berbagai radius shell ---
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399963 rad
  const planetRadius = 1.0;

  for (let i = 0; i < bodyCount; i++) {
    // Distribusi radius non-linear (radius^(1/3)) agar volumetrik merata di seluruh volume bola,
    // bukan menumpuk di pusat (yang terjadi jika radius di-sample linear uniform).
    const r = planetRadius * Math.cbrt(Math.random());

    const y = 1 - (i / (bodyCount - 1)) * 2; // dari 1 ke -1
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;

    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;

    const idx = i * 3;
    positions[idx] = x * r;
    positions[idx + 1] = y * r;
    positions[idx + 2] = z * r;
  }

  // --- Cincin: annulus flat di bidang XZ dengan sedikit noise vertikal agar tidak terlihat 2D kaku ---
  const ringInner = 1.5;
  const ringOuter = 2.3;

  for (let i = 0; i < ringCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE_lerp(ringInner, ringOuter, Math.random());
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = (Math.random() - 0.5) * 0.05; // ketebalan tipis cincin

    const idx = (bodyCount + i) * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
  }

  return positions;
}

function THREE_lerp(a, b, t) {
  return a + (b - a) * t;
}
