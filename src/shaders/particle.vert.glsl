// particle.vert.glsl
//
// Morphing dilakukan DI SINI (GPU), bukan di CPU/JavaScript.
// JavaScript HANYA men-tween satu scalar uniform (uMorphProgress), sisanya interpolasi
// posisi terjadi native di GPU untuk semua partikel sekaligus secara paralel.

attribute vec3 positionA;   // posisi shape asal
attribute vec3 positionB;   // posisi shape target
attribute float randomSeed; // seed unik per partikel untuk noise/turbulence independen
attribute float flowerCategory; // kategori bagian buket (lihat FlowerShape.js)
attribute float planetPart;     // 0 = badan, 1 = atmosfer, 2 = cincin, 3 = bulan hati
attribute float planetOrbit;    // kecepatan orbit (rad/detik), 0 = tidak mengorbit
attribute float planetShade;    // 0..1, pita awan / posisi radial cincin
attribute float butterflyPart;  // 0 badan, 1 sayap, 2 urat, 3 tepi, 4 bintik, 5 antena
attribute float butterflyShade; // 0..1, pangkal (0) -> ujung sayap (1)
attribute float textRole;       // 0 pesan, 1 baris penutup, 2 ikon hati (lihat TextShape.js)
attribute float textOrder;      // 0..1 urutan baca (baris demi baris, kiri ke kanan)
attribute float heartShade;     // 0 = inti hati, 1 = tepi (lihat HeartShape.js)
attribute float flowerShade;    // 0..1, gradasi warna dalam kategori

uniform float uMorphProgress; // 0.0 -> 1.0, di-drive oleh GSAP di JS (lihat ParticleSystem.js)
uniform float uTime;
uniform float uBaseSize;
uniform float uPulseAmount;   // dipakai untuk efek heartbeat saat shape = heart
uniform float uWaveAmount;    // dipakai untuk efek floating/wave saat shape = text
uniform float uTurbulenceAmount; // multiplier turbulence dasar, dinaikkan saat shape = scatter
uniform float uPlanetAmount;   // 0..1, blend ke tampilan planet (warna, cahaya, oklusi)
uniform float uOrbitOn;        // 1 = cincin & bulan mengorbit (hanya saat target = planet)
uniform float uPlanetTime;     // detik orbit yang sudah berjalan
uniform vec3 uRingAxis;        // sumbu orbit = normal bidang cincin
uniform vec3 uMoonCenter;      // pusat bulan hati (posisi awal, sebelum orbit)
uniform float uHeartColorAmount; // 0..1, blend ke warna hati (bara merah)
uniform float uFlowerColorAmount;
uniform float uWriteAmount;     // 1 = efek "sedang ditulis" (hanya saat morph menuju teks)
uniform float uTextColorAmount; // 0..1, blend ke warna mawar (lihat ParticleSystem.js)
uniform float uButterflyColorAmount; // 0..1, blend ke warna kupu-kupu
uniform float uFlapAmount;           // 0..1, kekuatan kepakan sayap kupu-kupu (engsel 3D)
uniform float uViewportHeight; // dalam piksel, di-update saat resize (lihat main.js)

varying float vAlpha;
varying vec3 vColor;

// Simple pseudo-random & noise function (hash-based, murah secara komputasi untuk per-vertex)
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec3 curlNoise(vec3 p, float seed) {
  // Approximation murah untuk kesan "turbulence organik"
  float t = uTime * 0.6 + seed * 10.0;
  return vec3(
    sin(t + p.y * 2.0) * cos(t * 0.7 + p.z),
    cos(t * 0.8 + p.x * 2.0) * sin(t * 0.5 + p.z),
    sin(t * 0.65 + p.x + p.y)
  );
}

// Rotasi vektor v sebesar sudut a di sekitar sumbu satuan k (rumus Rodrigues).
// Versi CPU yang identik ada di PlanetShape.js -> orbitPlanetPositions().
vec3 rotateAxis(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

// Detak jantung "lub-dub": dua ketukan (kuat lalu lemah) lalu jeda, periode 70 bpm.
// Mengembalikan 0..1. Dipakai untuk skala & kilau hati.
const float BEAT_PERIOD = 60.0 / 70.0;
float heartbeat(float t) {
  float p = mod(t, BEAT_PERIOD);
  float lub = exp(-pow((p - 0.06) / 0.045, 2.0));
  float dub = 0.6 * exp(-pow((p - 0.26) / 0.05, 2.0));
  return lub + dub;
}

void main() {
  float t = smoothstep(0.0, 1.0, uMorphProgress);

  const float WRITE_SPREAD = 3.3;
  const float WRITE_TAIL = 0.7;
  float writeLocal = uMorphProgress * (1.0 + WRITE_SPREAD + WRITE_TAIL) - textOrder * WRITE_SPREAD;
  float tWrite = smoothstep(0.0, 1.0, clamp(writeLocal, 0.0, 1.0));
  t = mix(t, tWrite, uWriteAmount);
  // "Tinta basah": partikel yang baru mendarat bersinar sebentar lalu meredup
  float ink = uWriteAmount * smoothstep(0.55, 1.0, writeLocal) * (1.0 - smoothstep(1.0, 1.7, writeLocal));

  // Target posisi: untuk planet, cincin & bulan diputar sesuai orbit yang sudah berjalan
  vec3 targetPos = positionB;
  if (uOrbitOn > 0.5 && planetOrbit != 0.0) {
    float orbitAngle = planetOrbit * uPlanetTime;
    if (planetPart > 2.5) {
      // Bulan hati: hanya pusatnya yang mengorbit, bentuknya tetap tegak menghadap kamera
      targetPos = rotateAxis(uMoonCenter, uRingAxis, orbitAngle) + (positionB - uMoonCenter);
    } else {
      targetPos = rotateAxis(positionB, uRingAxis, orbitAngle);
    }
  }

  vec3 morphedPos = mix(positionA, targetPos, t);

  // Floating + wave effect (teks)
  float wave = sin(uTime * 1.5 + morphedPos.x * 3.0 + randomSeed * 6.28) * uWaveAmount;
  morphedPos.y += wave;

  // Detak jantung yang MERAMBAT: ketukan dimulai dari pusat dan sampai ke tepi sesaat
  // kemudian (delay sebanding jarak), seperti riak. Hanya aktif saat shape = heart.
  float beatDelay = length(positionB.xy) * 0.09;
  float beat = heartbeat(uTime - beatDelay) * uPulseAmount;
  morphedPos *= 1.0 + 0.09 * beat;

  // Kepakan kupu-kupu: sayap BERPUTAR pada engsel di badan (x = 0), jadi benar-benar 3D.
  // Sudut naik-turun antara sekitar -20° dan +63°. Sayap belakang (y < 0) tertinggal sedikit
  // fasenya agar terasa organik. Badan & antena tidak berputar, hanya naik-turun pelan.
  bool isWing = butterflyPart > 0.5 && butterflyPart < 4.5;
  float wingPhase = uTime * 6.0 - (positionB.y < 0.0 ? 0.45 : 0.0);
  float wingAngle = (0.38 + 0.72 * sin(wingPhase)) * uFlapAmount;
  if (isWing) {
    float side = sign(morphedPos.x);
    float hinge = abs(morphedPos.x);
    morphedPos.x = side * hinge * cos(wingAngle);
    morphedPos.z += hinge * sin(wingAngle);
  }
  morphedPos.y += 0.05 * cos(uTime * 6.0) * uFlapAmount; // badan ikut terangkat tiap kepakan

  // Turbulence halus agar partikel terasa "hidup", bukan statis kaku.
  vec3 turbulence = curlNoise(morphedPos, randomSeed) * 0.02 * uTurbulenceAmount;
  morphedPos += turbulence;

  vec4 mvPosition = modelViewMatrix * vec4(morphedPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Point size perspective-correct berbasis viewport height
  gl_PointSize = uBaseSize * uViewportHeight / -mvPosition.z;

  // Variasi alpha kecil antar partikel agar tidak monoton
  vAlpha = 0.6 + hash(randomSeed) * 0.4;

  // Warna default: interpolasi biru neon <-> cyan berdasar seed
  float colorMix = hash(randomSeed * 3.1);
  vec3 baseColor = mix(vec3(0.2, 0.55, 1.0), vec3(0.3, 0.95, 1.0), colorMix);

  // ---------- Buket mawar ----------
  vec3 flowerColor;
  float flowerAlpha = 1.0;
  if (flowerCategory < 0.5) {
    // kelopak: merah beludru gelap -> merah -> tepi terang
    flowerColor = mix(vec3(0.22, 0.01, 0.04), vec3(0.72, 0.05, 0.16), smoothstep(0.0, 0.6, flowerShade));
    flowerColor = mix(flowerColor, vec3(1.0, 0.25, 0.33), smoothstep(0.7, 1.0, flowerShade));
  } else if (flowerCategory < 1.5) {
    flowerColor = mix(vec3(0.10, 0.25, 0.10), vec3(0.18, 0.37, 0.16), flowerShade); // tangkai
  } else if (flowerCategory < 2.5) {
    flowerColor = mix(vec3(0.12, 0.35, 0.16), vec3(0.24, 0.56, 0.25), flowerShade); // daun
  } else if (flowerCategory < 3.5) {
    flowerColor = mix(vec3(0.85, 0.80, 0.84), vec3(1.0, 0.96, 0.97), flowerShade); // baby's breath
  } else if (flowerCategory < 4.5) {
    // kertas pembungkus: blush -> champagne; shade 1 = garis tepi kertas
    flowerColor = mix(vec3(0.93, 0.58, 0.70), vec3(0.99, 0.86, 0.76), smoothstep(0.0, 0.8, flowerShade));
    flowerAlpha = mix(0.55, 0.95, step(0.99, flowerShade));
  } else if (flowerCategory < 5.5) {
    flowerColor = mix(vec3(0.79, 0.59, 0.25), vec3(0.95, 0.84, 0.54), flowerShade); // pita emas
  } else {
    // serbuk emas: berkelip pelan, tiap titik dengan fase berbeda
    flowerColor = vec3(1.0, 0.86, 0.55);
    float twinkle = 0.5 + 0.5 * sin(uTime * 2.2 + randomSeed * 40.0);
    flowerAlpha = 0.15 + 0.85 * pow(twinkle, 6.0);
  }

  vAlpha *= mix(1.0, flowerAlpha, uFlowerColorAmount);
  vColor = mix(baseColor, flowerColor, uFlowerColorAmount);

    // ---------- Teks (pesan tulisan tangan) ----------
  // Pesan: krem keemasan hangat. Baris penutup: pink-merah. Ikon hati: merah.
  vec3 textColor;
  if (textRole < 0.5) {
    textColor = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.93, 0.80), hash(randomSeed * 7.3));
  } else if (textRole < 1.5) {
    textColor = mix(vec3(1.0, 0.30, 0.50), vec3(1.0, 0.48, 0.64), hash(randomSeed * 7.3));
  } else {
    textColor = vec3(1.0, 0.18, 0.32);
  }
  // Tinta basah: huruf yang baru tertulis lebih terang sesaat
  textColor *= 1.0 + 1.3 * ink;
  // Saat sedang ditulis, warna teks baru muncul ketika partikel itu mendarat (tWrite),
  // dan partikel yang belum gilirannya diredupkan supaya fokus ada di tulisan.
  float textMix = uTextColorAmount * mix(1.0, tWrite, uWriteAmount);
  vColor = mix(vColor, textColor, textMix);
  vAlpha *= mix(1.0, 0.3 + 0.7 * tWrite, uWriteAmount);

  // ---------- Kupu-kupu ----------
  // Sayap: magenta-pink di pangkal -> violet di ujung. Urat & tepi lebih gelap (alpha rendah,
  // karena blending aditif: "gelap" = sedikit cahaya), bintik putih di tepi.
  // Kilau sisik (iridescent): saat sayap terangkat/miring, warnanya bergeser ke biru-cyan,
  // seperti sisik kupu-kupu Morpho. Sumbernya sudut kepakan, jadi tiap kepakan berkilat.
  vec3 wingBase = mix(vec3(1.0, 0.37, 0.64), vec3(0.54, 0.36, 1.0), smoothstep(0.1, 0.95, butterflyShade));
  float sheen = clamp(sin(wingAngle), 0.0, 1.0) * smoothstep(0.25, 0.9, butterflyShade);
  vec3 butterflyColor;
  float butterflyAlpha = 1.0;
  if (butterflyPart < 0.5) {
    butterflyColor = mix(vec3(0.45, 0.28, 0.40), vec3(0.75, 0.55, 0.65), butterflyShade); // badan beruas
  } else if (butterflyPart < 1.5) {
    butterflyColor = mix(wingBase, vec3(0.37, 0.9, 1.0), sheen * 0.75);
  } else if (butterflyPart < 2.5) {
    butterflyColor = vec3(0.22, 0.04, 0.26); // urat
    butterflyAlpha = 0.18;
  } else if (butterflyPart < 3.5) {
    butterflyColor = mix(vec3(0.42, 0.08, 0.40), vec3(0.30, 0.55, 0.85), sheen * 0.5); // tepi gelap
    butterflyAlpha = 0.85;
  } else if (butterflyPart < 4.5) {
    butterflyColor = vec3(1.0, 0.95, 1.0); // bintik putih
  } else {
    butterflyColor = mix(vec3(0.75, 0.6, 0.75), vec3(1.0, 0.85, 0.95), butterflyShade); // antena
  }

  vAlpha *= mix(1.0, butterflyAlpha, uButterflyColorAmount);
  vColor = mix(vColor, butterflyColor, uButterflyColorAmount);

  // ---------- Hati ----------
  // Warna "bara": inti merah anggur gelap -> merah delima -> merah cerah -> tepi pink.
  vec3 heartColor = mix(vec3(0.48, 0.03, 0.10), vec3(0.92, 0.08, 0.22), smoothstep(0.0, 0.45, heartShade));
  heartColor = mix(heartColor, vec3(1.0, 0.24, 0.38), smoothstep(0.45, 0.85, heartShade));
  heartColor = mix(heartColor, vec3(1.0, 0.45, 0.60), smoothstep(0.9, 1.0, heartShade));
  // Saat gelombang detak lewat, hati lebih terang (tepi paling kuat), seperti aliran darah
  heartColor *= 1.0 + beat * (0.35 + 0.45 * heartShade);
  vColor = mix(vColor, heartColor, uHeartColorAmount);

  // ---------- Planet ----------
  // Normal permukaan di ruang pandang (view space) -> pencahayaan siang/malam & atmosfer.
  vec3 nView = normalize(normalMatrix * normalize(positionB + vec3(1e-5)));
  vec3 lightDir = normalize(vec3(-0.65, 0.55, 0.55)); // matahari dari kiri atas depan
  float lit = smoothstep(-0.25, 0.65, dot(nView, lightDir));
  float facing = nView.z; // >0 menghadap kamera, <0 sisi belakang bola
  float rim = pow(1.0 - clamp(abs(facing), 0.0, 1.0), 2.5);

  vec3 planetColor;
  float planetAlpha = 1.0;
  if (planetPart < 0.5) {
    // Pita awan: indigo -> lavender -> cyan, lalu diberi cahaya siang/malam + kilau tepi
    vec3 band = mix(vec3(0.30, 0.18, 0.72), vec3(0.72, 0.62, 1.0), smoothstep(0.15, 0.65, planetShade));
    band = mix(band, vec3(0.40, 0.95, 1.0), smoothstep(0.8, 0.98, planetShade));
    planetColor = band * (0.16 + 1.15 * lit) + vec3(0.30, 0.88, 1.0) * rim * 0.6 * lit;
    // Sisi belakang bola disembunyikan supaya planet terasa pejal, bukan bola kaca
    planetAlpha = facing > 0.0 ? 1.0 : 0.06;
  } else if (planetPart < 1.5) {
    // Atmosfer: hanya terlihat di tepi bola, paling terang di sisi yang tersinari
    planetColor = vec3(0.35, 0.9, 1.0);
    planetAlpha = pow(rim, 1.5) * (0.25 + 0.75 * lit) * 0.9;
  } else if (planetPart < 2.5) {
    // Cincin: emas champagne (dalam) -> blush (luar)
    planetColor = mix(vec3(0.95, 0.80, 0.50), vec3(1.0, 0.55, 0.72), planetShade);
    // Oklusi: bagian cincin yang lewat DI BELAKANG piringan planet disembunyikan
    vec4 centerView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 pView = modelViewMatrix * vec4(morphedPos, 1.0);
    float behind = step(pView.z, centerView.z);
    float insideDisk = 1.0 - smoothstep(0.92, 1.02, length(pView.xy - centerView.xy));
    planetAlpha = mix(0.85, 0.04, behind * insideDisk);
  } else {
    // Bulan hati: pink terang, tepi sedikit lebih putih
    planetColor = mix(vec3(1.0, 0.35, 0.55), vec3(1.0, 0.75, 0.85), smoothstep(0.9, 1.0, planetShade));
    vec4 centerView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 pView = modelViewMatrix * vec4(morphedPos, 1.0);
    float behind = step(pView.z, centerView.z);
    float insideDisk = 1.0 - smoothstep(0.92, 1.02, length(pView.xy - centerView.xy));
    planetAlpha = mix(1.0, 0.0, behind * insideDisk);
  }

  vAlpha *= mix(1.0, planetAlpha, uPlanetAmount);
  vColor = mix(vColor, planetColor, uPlanetAmount);
}