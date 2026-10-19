/**
 * FlowerShape.js — Buket mawar mewah
 *
 * Komposisi (dari depan, menghadap kamera):
 *   - 7 kepala mawar 3D tersusun membentuk kubah. Tiap mawar = kelopak spiral berlapis:
 *     kuncup rapat di tengah, kelopak luar terbuka & melengkung keluar.
 *   - Baby's breath (kuntum putih kecil) di sela-sela mawar.
 *   - Daun mengintip di tepi kubah.
 *   - Kertas pembungkus kerucut: bagian DEPAN rendah (tidak menutupi mawar),
 *     bagian BELAKANG tinggi & bergelombang seperti kertas buket sungguhan.
 *   - Pita emas melingkar di pinggang buket + simpul (2 loop, 2 ekor).
 *   - Tangkai yang muncul di bawah ujung kerucut.
 *   - Serbuk emas tipis di sekitar buket (berkelip di shader).
 *
 * Output: { positions, categories, shades } — antarmuka SAMA dengan versi sebelumnya,
 * jadi ParticleSystem.js tidak perlu diubah. `categories` dipakai shader untuk warna:
 *   0 = kelopak mawar, 1 = tangkai, 2 = daun, 3 = baby's breath,
 *   4 = kertas pembungkus, 5 = pita emas, 6 = serbuk emas (berkelip)
 * `shades` (0..1) = gradasi warna di dalam kategori.
 */

const CAT = {
  PETAL: 0,
  STEM: 1,
  LEAF: 2,
  BABY: 3,
  WRAP: 4,
  RIBBON: 5,
  GOLD: 6,
};

// Seluruh buket digeser agar titik tengah visualnya dekat (0,0)
const Y_SHIFT = 0.2;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// Basis ortonormal (e1, e2) yang tegak lurus terhadap sumbu d
function basisFor(d) {
  const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = normalize(cross(d, helper));
  const e2 = cross(d, e1);
  return [e1, e2];
}

export function generateFlowerPositions(count) {
  const positions = new Float32Array(count * 3);
  const categories = new Float32Array(count);
  const shades = new Float32Array(count);
  let idx = 0;

  function push(x, y, z, cat, shade) {
    if (idx >= count) return;
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y + Y_SHIFT;
    positions[idx * 3 + 2] = z;
    categories[idx] = cat;
    shades[idx] = Math.min(1, Math.max(0, shade));
    idx++;
  }

  // ---------- Anggaran partikel (sisa pembulatan masuk ke mawar) ----------
  const nStem = Math.floor(count * 0.04);
  const nLeaf = Math.floor(count * 0.07);
  const nBaby = Math.floor(count * 0.08);
  const nWrap = Math.floor(count * 0.17);
  const nRibbon = Math.floor(count * 0.07);
  const nGold = Math.floor(count * 0.02);
  const nRose = count - (nStem + nLeaf + nBaby + nWrap + nRibbon + nGold);

  // ---------- Geometri kertas pembungkus (dipakai juga oleh pita) ----------
  const CONE_TIP_Y = -1.5;
  const CONE_HEIGHT = 2.25;
  const CONE_Z = -0.25; // sumbu kerucut sedikit ke belakang agar mawar ada di depannya
  const coneRadius = (s) => 0.12 + 1.25 * Math.pow(s, 1.1);
  const coneY = (s) => CONE_TIP_Y + s * CONE_HEIGHT;

  // ---------- 1. MAWAR ----------
  const DOME_C = [0, 0.95, 0.15];
  const roses = [{ c: DOME_C, d: normalize([0, 0.25, 1]), R: 0.42 }];
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI * 2 + Math.PI / 6;
    roses.push({
      c: [
        DOME_C[0] + Math.cos(th) * 0.84,
        DOME_C[1] + Math.sin(th) * 0.64,
        DOME_C[2] - 0.2,
      ],
      d: normalize([Math.cos(th) * 0.6, Math.sin(th) * 0.5 + 0.2, 1]),
      R: 0.36,
    });
  }

  const PETALS = 18; // per mawar, spiral golden-angle
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const petalWeights = [];
  let wSum = 0;
  for (let k = 0; k < PETALS; k++) {
    const t = k / (PETALS - 1);
    const w = 0.4 + t; // kelopak luar lebih besar -> lebih banyak titik
    petalWeights.push(w);
    wSum += w;
  }

  function pickPetal() {
    let r = Math.random() * wSum;
    for (let k = 0; k < PETALS; k++) {
      r -= petalWeights[k];
      if (r <= 0) return k;
    }
    return PETALS - 1;
  }

  const perRose = Math.floor(nRose / roses.length);
  roses.forEach((rose, ri) => {
    const n =
      ri === roses.length - 1 ? nRose - perRose * (roses.length - 1) : perRose;
    const [e1, e2] = basisFor(rose.d);
    const R = rose.R;
    const twist = Math.random() * Math.PI * 2; // tiap mawar diputar beda agar tidak kembar

    for (let i = 0; i < n; i++) {
      const k = pickPetal();
      const t = k / (PETALS - 1); // 0 = kelopak terdalam, 1 = terluar
      const center = twist + k * GOLDEN;
      const halfWidth = 1.45 - 0.8 * t; // kelopak dalam membungkus lebar, luar lebih sempit
      const rBase = R * (0.06 + 0.32 * t);
      const rTop = R * (0.22 + 0.78 * t);
      const height = R * (0.78 - 0.25 * t);

      // 35% titik ditaruh tepat di tepi atas kelopak -> garis tepi spiral terlihat jelas
      const onEdge = Math.random() < 0.35;
      const u = onEdge ? rand(0.9, 1.0) : Math.pow(Math.random(), 0.8); // 0 = pangkal, 1 = tepi
      const v = Math.random() * 2 - 1; // melintang kelopak
      const ang = center + v * halfWidth * (0.55 + 0.45 * u);

      // Kelopak luar melengkung keluar & sedikit merunduk di tepi atas
      let r = rBase + (rTop - rBase) * Math.pow(u, 0.7);
      r += t * Math.pow(u, 3) * R * 0.28;
      r += R * 0.05 * t * v * v; // tepi kelopak sedikit menggulung
      const h = height * u - t * Math.pow(u, 3) * R * 0.18;

      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      const px = rose.c[0] + rose.d[0] * h + e1[0] * x + e2[0] * y;
      const py = rose.c[1] + rose.d[1] * h + e1[1] * x + e2[1] * y;
      const pz = rose.c[2] + rose.d[2] * h + e1[2] * x + e2[2] * y;

      // Inti & pangkal gelap, tepi kelopak terang -> tiap mawar punya kedalaman
      const shade = onEdge ? 0.75 + 0.25 * t : 0.05 + 0.35 * t + 0.25 * u * u;
      push(px, py, pz, CAT.PETAL, shade);
    }
  });

  // ---------- 2. BABY'S BREATH ----------
  const babyClusters = [];
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI * 2; // di sela-sela mawar cincin
    babyClusters.push([
      Math.cos(th) * 0.95,
      DOME_C[1] + Math.sin(th) * 0.72,
      -0.05,
    ]);
  }
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2 + 0.2;
    babyClusters.push([
      Math.cos(th) * 1.28,
      DOME_C[1] + Math.sin(th) * 0.95,
      -0.3,
    ]);
  }
  const babyEach = Math.floor(nBaby / babyClusters.length);
  babyClusters.forEach((c, ci) => {
    const n =
      ci === babyClusters.length - 1
        ? nBaby - babyEach * (babyClusters.length - 1)
        : babyEach;
    // Tiap gugus = beberapa kuntum kecil (bola mini), bukan awan acak
    const florets = Array.from({ length: 9 }, () => [
      c[0] + rand(-0.17, 0.17),
      c[1] + rand(-0.15, 0.15),
      c[2] + rand(-0.1, 0.1),
    ]);
    for (let i = 0; i < n; i++) {
      const f = florets[Math.floor(Math.random() * florets.length)];
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = 0.028 * Math.cbrt(Math.random());
      push(
        f[0] + Math.cos(th) * s * rr,
        f[1] + u * rr,
        f[2] + Math.sin(th) * s * rr,
        CAT.BABY,
        Math.random(),
      );
    }
  });

  // ---------- 3. DAUN ----------
  const leafAngles = [
    Math.PI * 0.08,
    Math.PI * 0.42,
    Math.PI * 0.62,
    Math.PI * 0.92,
    Math.PI * 1.15,
    Math.PI * 1.85,
  ];
  const leafEach = Math.floor(nLeaf / leafAngles.length);
  leafAngles.forEach((th, li) => {
    const n =
      li === leafAngles.length - 1
        ? nLeaf - leafEach * (leafAngles.length - 1)
        : leafEach;
    const base = [Math.cos(th) * 1.0, DOME_C[1] + Math.sin(th) * 0.75, -0.35];
    const dir = normalize([Math.cos(th), Math.sin(th) * 0.9, -0.1]);
    const side = normalize(cross(dir, [0, 0, 1]));
    const L = 0.55;
    const W = 0.24;
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const half = 0.5 * W * Math.sin(Math.PI * u) * (1 - 0.25 * u);
      // 25% titik di tulang daun agar daun punya garis tengah yang terlihat
      const v = Math.random() < 0.25 ? rand(-0.008, 0.008) : rand(-half, half);
      const bend = 0.08 * u * u; // ujung daun sedikit melengkung ke belakang
      push(
        base[0] + dir[0] * u * L + side[0] * v,
        base[1] + dir[1] * u * L + side[1] * v,
        base[2] + dir[2] * u * L + side[2] * v - bend,
        CAT.LEAF,
        0.25 + 0.6 * u,
      );
    }
  });

  // ---------- 4. KERTAS PEMBUNGKUS ----------
  // phi = PI/2 adalah sisi DEPAN (menghadap kamera, +z). Tepi depan rendah, belakang tinggi.
  for (let i = 0; i < nWrap; i++) {
    const phi = Math.random() * Math.PI * 2;
    const front = (Math.sin(phi) + 1) / 2; // 1 = depan, 0 = belakang
    const sMax = 0.48 + 0.62 * (1 - front) + 0.05 * Math.sin(phi * 7); // tepi bergelombang
    // 12% titik di tepi atas kertas (garis lipatan terang), sisanya merata per luas permukaan
    const onRim = Math.random() < 0.12;
    const s = onRim ? sMax * rand(0.97, 1.0) : sMax * Math.sqrt(Math.random());
    const flare = s > 0.8 ? (s - 0.8) * 0.6 : 0; // kertas belakang mekar keluar di atas
    const r = coneRadius(s) + flare;
    // Dua lapis kertas: lapis luar (shade rendah) dan lapis dalam sedikit lebih kecil
    const inner = Math.random() < 0.35;
    const rr = inner ? r * 0.93 : r;
    const shade = onRim ? 1 : inner ? rand(0.55, 0.8) : rand(0.1, 0.45);
    push(
      Math.cos(phi) * rr,
      coneY(s),
      CONE_Z + Math.sin(phi) * rr,
      CAT.WRAP,
      shade,
    );
  }

  // ---------- 5. PITA EMAS ----------
  const RIBBON_Y = -0.5;
  const sRib = (RIBBON_Y - CONE_TIP_Y) / CONE_HEIGHT;
  const rRib = coneRadius(sRib);
  const knot = [0, RIBBON_Y, CONE_Z + rRib + 0.04];
  const nBand = Math.floor(nRibbon * 0.3);
  const nLoops = Math.floor(nRibbon * 0.45);
  const nTails = nRibbon - nBand - nLoops;

  for (let i = 0; i < nBand; i++) {
    const phi = Math.random() * Math.PI * 2;
    const ds = rand(-0.025, 0.025);
    const r = coneRadius(sRib + ds) + 0.012;
    push(
      Math.cos(phi) * r,
      coneY(sRib + ds),
      CONE_Z + Math.sin(phi) * r,
      CAT.RIBBON,
      rand(0.3, 0.8),
    );
  }
  for (let i = 0; i < nLoops; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.12) {
      // simpul di tengah
      push(
        knot[0] + rand(-0.05, 0.05),
        knot[1] + rand(-0.05, 0.05),
        knot[2] + rand(0, 0.04),
        CAT.RIBBON,
        1,
      );
      continue;
    }
    // Loop = elips miring ke atas di kiri/kanan simpul; pita punya lebar (offset w)
    const a = Math.random() * Math.PI * 2;
    const w = rand(-0.035, 0.035);
    const lx = side * (0.26 + 0.24 * Math.cos(a));
    const ly = 0.07 + 0.12 * Math.sin(a) + 0.06 * (1 + Math.cos(a));
    push(
      knot[0] + lx,
      knot[1] + ly + w,
      knot[2] + 0.04 * Math.sin(a) + w * 0.5,
      CAT.RIBBON,
      0.5 + 0.5 * Math.abs(Math.sin(a)),
    );
  }
  for (let i = 0; i < nTails; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const t = Math.random();
    const w = rand(-0.03, 0.03);
    push(
      knot[0] + side * (0.04 + 0.2 * t) + w,
      knot[1] - 0.05 - 0.55 * t,
      knot[2] + 0.03 * Math.sin(t * Math.PI * 2),
      CAT.RIBBON,
      0.35 + 0.4 * (1 - t),
    );
  }

  // ---------- 6. TANGKAI (muncul di bawah ujung kerucut) ----------
  const STEMS = 7;
  for (let i = 0; i < nStem; i++) {
    const k = i % STEMS;
    const spread = (k - (STEMS - 1) / 2) * 0.035;
    const t = Math.random(); // 0 = ujung kerucut, 1 = ujung bawah tangkai
    const y = CONE_TIP_Y + 0.05 - t * 0.6;
    const a = Math.random() * Math.PI * 2;
    const rr = 0.018 * Math.sqrt(Math.random());
    push(
      spread * (1 + t * 1.6) + Math.cos(a) * rr,
      y,
      CONE_Z + Math.sin(a) * rr,
      CAT.STEM,
      1 - t,
    );
  }

  // ---------- 7. SERBUK EMAS ----------
  for (let i = 0; i < nGold; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(1.1, 1.9);
    push(
      Math.cos(a) * r,
      DOME_C[1] + Math.sin(a) * r * 0.75 - 0.2,
      rand(-0.6, 0.4),
      CAT.GOLD,
      Math.random(),
    );
  }

  // Pengaman: kalau ada sisa slot karena pembulatan, isi ke pusat mawar tengah
  while (idx < count) {
    push(
      DOME_C[0] + rand(-0.05, 0.05),
      DOME_C[1] + rand(-0.05, 0.05),
      DOME_C[2] + 0.2,
      CAT.PETAL,
      0.1,
    );
  }

  return { positions, categories, shades };
}
