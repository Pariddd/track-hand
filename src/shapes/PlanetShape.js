/**
 * PlanetShape.js — Raksasa gas bercincin + bulan berbentuk hati
 *
 * Komposisi:
 *   - Badan planet: permukaan bola (Fibonacci sphere) dengan pita awan berliuk.
 *     Pencahayaan siang/malam & cahaya atmosfer di tepi dihitung di shader dari normal.
 *   - Atmosfer: kulit tipis sedikit di luar permukaan, hanya terlihat di tepi bola.
 *   - Cincin: 3 pita dengan celah (seperti Saturnus), dimiringkan agar terlihat elips.
 *   - Bulan berbentuk hati yang mengorbit di bidang cincin.
 *
 * Cincin & bulan MENGORBIT di shader (rotasi di sekitar RING_AXIS). Kecepatan sudut per
 * partikel ada di `orbits` (rad/detik): cincin dalam lebih cepat dari luar (mirip Kepler).
 *
 * Output: { positions, parts, orbits, shades, ringAxis, moonCenter }
 *   parts:  0 = badan planet, 1 = atmosfer, 2 = cincin, 3 = bulan hati
 *   shades: 0..1, gradasi warna di dalam bagian (pita awan / posisi radial cincin)
 */

export const PLANET_PART = { BODY: 0, ATMOS: 1, RING: 2, MOON: 3 };

const R = 1.0; // radius planet
const TILT_X = (24 * Math.PI) / 180; // kemiringan cincin ke arah kamera
const TILT_Z = (-12 * Math.PI) / 180; // sedikit miring ke samping agar lebih dinamis

// Pita cincin: [radius dalam, radius luar, porsi partikel cincin]
const RING_BANDS = [
  [1.42, 1.78, 0.42],
  [1.9, 2.3, 0.46], // celah 1.78–1.90 = "divisi Cassini"
  [2.42, 2.5, 0.12], // cincin luar tipis
];

const MOON_ORBIT = 3.0;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// Rotasi vektor bidang cincin (y = 0) -> bidang miring
function tilt([x, y, z]) {
  // rotasi sumbu X
  const cx = Math.cos(TILT_X);
  const sx = Math.sin(TILT_X);
  const y1 = y * cx - z * sx;
  const z1 = y * sx + z * cx;
  // rotasi sumbu Z
  const cz = Math.cos(TILT_Z);
  const sz = Math.sin(TILT_Z);
  return [x * cz - y1 * sz, x * sz + y1 * cz, z1];
}

// Kecepatan orbit (rad/s), turun dengan radius^1.5 (dalam lebih cepat)
function orbitSpeed(r) {
  return 0.32 * Math.pow(1.42 / r, 1.5);
}

export function generatePlanetPositions(count) {
  const positions = new Float32Array(count * 3);
  const parts = new Float32Array(count);
  const orbits = new Float32Array(count);
  const shades = new Float32Array(count);
  let idx = 0;

  function push(p, part, orbit, shade) {
    if (idx >= count) return;
    positions[idx * 3] = p[0];
    positions[idx * 3 + 1] = p[1];
    positions[idx * 3 + 2] = p[2];
    parts[idx] = part;
    orbits[idx] = orbit;
    shades[idx] = Math.min(1, Math.max(0, shade));
    idx++;
  }

  const nBody = Math.floor(count * 0.5);
  const nAtmos = Math.floor(count * 0.06);
  const nMoon = Math.floor(count * 0.035);
  const nRing = count - nBody - nAtmos - nMoon;

  // ---------- 1. BADAN PLANET (permukaan, Fibonacci sphere) ----------
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < nBody; i++) {
    const y = 1 - (i / (nBody - 1)) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN * i;
    const x = Math.cos(th) * rr;
    const z = Math.sin(th) * rr;
    // Sedikit ketebalan ke dalam agar permukaan tidak terlalu tipis/berpola
    const d = R * (1 - Math.random() * 0.03);
    // Pita awan: fungsi lintang yang dibelokkan oleh bujur -> pita berliuk, bukan garis lurus
    const lon = Math.atan2(z, x);
    const warp =
      0.18 * Math.sin(lon * 2 + y * 6) + 0.08 * Math.sin(lon * 5 - y * 11);
    const band = 0.5 + 0.5 * Math.sin((y + warp) * 10.5);
    push([x * d, y * d, z * d], PLANET_PART.BODY, 0, band);
  }

  // ---------- 2. ATMOSFER (kulit tipis di luar permukaan) ----------
  for (let i = 0; i < nAtmos; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = R * rand(1.03, 1.09);
    push(
      [Math.cos(th) * s * d, u * d, Math.sin(th) * s * d],
      PLANET_PART.ATMOS,
      0,
      Math.random(),
    );
  }

  // ---------- 3. CINCIN (3 pita dengan celah) ----------
  let ringLeft = nRing;
  RING_BANDS.forEach(([rIn, rOut, share], bi) => {
    const n =
      bi === RING_BANDS.length - 1 ? ringLeft : Math.floor(nRing * share);
    ringLeft -= n;
    for (let i = 0; i < n; i++) {
      // Merata per luas annulus
      const r = Math.sqrt(
        rIn * rIn + Math.random() * (rOut * rOut - rIn * rIn),
      );
      // Ringlet: kepadatan bergelombang halus di dalam pita
      const ringlet = 0.5 + 0.5 * Math.sin(r * 38);
      const rr = Math.random() < 0.25 * ringlet ? r + rand(-0.01, 0.01) : r;
      const a = Math.random() * Math.PI * 2;
      const p = tilt([Math.cos(a) * rr, rand(-0.012, 0.012), Math.sin(a) * rr]);
      const radial = (rr - 1.42) / (2.5 - 1.42); // 0 = dalam, 1 = luar
      push(p, PLANET_PART.RING, orbitSpeed(rr), radial);
    }
  });

  // ---------- 4. BULAN BERBENTUK HATI ----------
  // Hanya PUSAT bulan yang mengorbit (di shader). Bentuk hatinya sendiri selalu tegak di
  // bidang XY (menghadap kamera), jadi tetap terbaca sebagai hati di posisi orbit mana pun.
  const moonAngle = Math.PI * 0.62; // posisi awal: kiri depan
  const moonCenter = tilt([
    Math.cos(moonAngle) * MOON_ORBIT,
    0,
    Math.sin(moonAngle) * MOON_ORBIT,
  ]);
  // Bentuk hati dari persamaan implisit (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0: titik acak diterima
  // hanya jika di dalam hati -> isi merata, tanpa garis atau gumpalan.
  const MOON_SIZE = 0.2;
  const heartF = (x, y) => {
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y;
  };
  // Perkiraan jarak ke tepi = |f| / |grad f|. Dipakai agar garis tepi sama tebal di mana-mana
  // (memakai |f| saja membuat tepi menebal di lekukan atas & sisi, tampak sebagai titik putih).
  const edgeDist = (x, y) => {
    const a = x * x + y * y - 1;
    const fx = 6 * x * a * a - 2 * x * y * y * y;
    const fy = 6 * y * a * a - 3 * x * x * y * y;
    return Math.abs(heartF(x, y)) / (Math.hypot(fx, fy) + 1e-6);
  };
  for (let i = 0; i < nMoon; i++) {
    const wantEdge = Math.random() < 0.5; // separuh titik di tepi agar kontur hati tegas
    let hx;
    let hy;
    let f;
    do {
      hx = rand(-1.2, 1.2);
      hy = rand(-1.05, 1.3);
      f = heartF(hx, hy);
    } while (f > 0 || (wantEdge && edgeDist(hx, hy) > 0.045));
    push(
      [
        moonCenter[0] + hx * MOON_SIZE,
        moonCenter[1] + hy * MOON_SIZE,
        moonCenter[2] + rand(-0.02, 0.02),
      ],
      PLANET_PART.MOON,
      orbitSpeed(MOON_ORBIT) * 1.6,
      wantEdge ? 1 : 0.5,
    );
  }

  while (idx < count) push([0, 0, R], PLANET_PART.BODY, 0, 0.5);

  // Sumbu orbit = normal bidang cincin setelah dimiringkan
  const ringAxis = tilt([0, 1, 0]);

  return { positions, parts, orbits, shades, ringAxis, moonCenter };
}

/**
 * Hitung posisi planet SETELAH orbit berjalan selama `orbitTime` detik (versi CPU dari rotasi
 * di shader). Dipakai ParticleSystem saat berpindah DARI planet, agar titik awal morph sama
 * dengan posisi yang sedang terlihat (cincin tidak "melompat" balik ke posisi awalnya).
 */
export function orbitPlanetPositions(
  base,
  orbits,
  parts,
  axis,
  moonCenter,
  orbitTime,
  out,
) {
  const rotate = (vx, vy, vz, a, o, i) => {
    const [kx, ky, kz] = axis;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dot = kx * vx + ky * vy + kz * vz;
    // Rumus rotasi Rodrigues: v cos + (k x v) sin + k (k.v)(1 - cos)
    out[i * 3] = vx * c + (ky * vz - kz * vy) * s + kx * dot * (1 - c) + o[0];
    out[i * 3 + 1] =
      vy * c + (kz * vx - kx * vz) * s + ky * dot * (1 - c) + o[1];
    out[i * 3 + 2] =
      vz * c + (kx * vy - ky * vx) * s + kz * dot * (1 - c) + o[2];
  };
  const n = orbits.length;
  for (let i = 0; i < n; i++) {
    const vx = base[i * 3];
    const vy = base[i * 3 + 1];
    const vz = base[i * 3 + 2];
    const w = orbits[i];
    if (w === 0) {
      out[i * 3] = vx;
      out[i * 3 + 1] = vy;
      out[i * 3 + 2] = vz;
    } else if (parts[i] === PLANET_PART.MOON) {
      // Bulan: putar pusatnya saja, lalu tambahkan offset bentuk hati (tetap tegak)
      const off = [vx - moonCenter[0], vy - moonCenter[1], vz - moonCenter[2]];
      rotate(
        moonCenter[0],
        moonCenter[1],
        moonCenter[2],
        w * orbitTime,
        off,
        i,
      );
    } else {
      rotate(vx, vy, vz, w * orbitTime, [0, 0, 0], i);
    }
  }
  return out;
}
