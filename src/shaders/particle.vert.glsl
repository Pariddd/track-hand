// particle.vert.glsl
//
// Morphing dilakukan DI SINI (GPU), bukan di CPU/JavaScript.
// Alasan (lihat diskusi sebelumnya): tween posisi ribuan partikel per-frame di CPU via GSAP/JS
// akan menyebabkan buffer upload cost tinggi + GC pressure. Dengan shader-based morph,
// JavaScript HANYA perlu men-tween satu scalar uniform (uMorphProgress), sisanya interpolasi
// posisi terjadi native di GPU untuk semua partikel sekaligus secara paralel.

attribute vec3 positionA;   // posisi shape asal
attribute vec3 positionB;   // posisi shape target
attribute float randomSeed; // seed unik per partikel untuk noise/turbulence independen
attribute float flowerCategory; // 0=kelopak, 1=tangkai, 2=daun (statis, tidak ikut morph posisi)
attribute float flowerShade;    // 0..1, gradasi warna dalam kategori

uniform float uMorphProgress; // 0.0 -> 1.0, di-drive oleh GSAP di JS (lihat ParticleSystem.js)
uniform float uTime;
uniform float uBaseSize;
uniform float uPulseAmount;   // dipakai untuk efek heartbeat saat shape = heart
uniform float uWaveAmount;    // dipakai untuk efek floating/wave saat shape = text
uniform float uTurbulenceAmount; // multiplier turbulence dasar, dinaikkan saat shape = scatter
uniform float uFlowerColorAmount; // 0..1, blend ke warna mawar (lihat ParticleSystem.js)
uniform float uButterflyColorAmount; // 0..1, blend ke warna kupu-kupu (pink/ungu)
uniform float uFlapAmount;           // 0..1, kekuatan kepakan sayap kupu-kupu
uniform float uViewportHeight; // dalam piksel, di-update saat resize (lihat main.js)

varying float vAlpha;
varying vec3 vColor;

// Simple pseudo-random & noise function (hash-based, murah secara komputasi untuk per-vertex)
float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec3 curlNoise(vec3 p, float seed) {
  // Bukan true curl noise (yang butuh gradient field), tapi APPROXIMATION murah
  // menggunakan kombinasi sin/cos berbeda frekuensi per axis, cukup untuk kesan
  // "turbulence organik" tanpa cost computational curl noise sesungguhnya.
  float t = uTime * 0.6 + seed * 10.0;
  return vec3(
    sin(t + p.y * 2.0) * cos(t * 0.7 + p.z),
    cos(t * 0.8 + p.x * 2.0) * sin(t * 0.5 + p.z),
    sin(t * 0.65 + p.x + p.y)
  );
}

void main() {
  // Easing morph progress (smoothstep) di GPU — tidak perlu easing function terpisah di GSAP,
  // GSAP cukup drive linear 0->1, easing visual dilakukan di sini.
  float t = smoothstep(0.0, 1.0, uMorphProgress);

  vec3 morphedPos = mix(positionA, positionB, t);

  // Floating + wave effect (untuk teks "I LOVE U", spek minta terlihat "hidup")
  float wave = sin(uTime * 1.5 + morphedPos.x * 3.0 + randomSeed * 6.28) * uWaveAmount;
  morphedPos.y += wave;

  // Heartbeat pulse (radial scale terhadap centroid, dipakai saat shape = heart)
  float pulse = 1.0 + sin(uTime * 3.2) * 0.06 * uPulseAmount;
  morphedPos *= pulse;

  // Turbulence/noise halus agar partikel terasa "hidup", bukan statis kaku.
  // uTurbulenceAmount dinaikkan saat shape = scatter (lihat ParticleSystem.js) supaya
  // kesan "menyebar" tetap dinamis, bukan cuma bola besar yang diam.
  vec3 turbulence = curlNoise(morphedPos, randomSeed) * 0.02 * uTurbulenceAmount;
  morphedPos += turbulence;

vec4 mvPosition = modelViewMatrix * vec4(morphedPos, 1.0);
gl_Position = projectionMatrix * mvPosition;

// Formula perspective-correct point size berbasis viewport height, BUKAN magic constant.
// uBaseSize sekarang merepresentasikan RADIUS PARTIKEL DALAM WORLD-UNIT (~0.01-0.05),
// bukan skala arbitrer. Dengan kamera di z=6 dan viewport height ~800px, uBaseSize=0.03
// menghasilkan point diameter ~4px — proporsional dan tidak overlap masif seperti sebelumnya
// (bug lama: uBaseSize=2.4 + constant 300 menghasilkan ~120px per partikel, itu penyebab whiteout).
gl_PointSize = uBaseSize * uViewportHeight / -mvPosition.z;

  // Variasi alpha & warna kecil antar partikel berdasar randomSeed agar tidak terlihat monoton
  vAlpha = 0.6 + hash(randomSeed) * 0.4;

  // Warna default: interpolasi biru neon <-> cyan berdasar seed
  float colorMix = hash(randomSeed * 3.1);
  vec3 baseColor = mix(vec3(0.2, 0.55, 1.0), vec3(0.3, 0.95, 1.0), colorMix);

  // Warna mawar: kelopak merah, tangkai & daun hijau (gradasi via flowerShade)
  vec3 flowerColor;
  if (flowerCategory < 0.5) {
    flowerColor = mix(vec3(0.55, 0.02, 0.05), vec3(0.95, 0.15, 0.12), flowerShade); // kelopak
  } else if (flowerCategory < 1.5) {
    flowerColor = mix(vec3(0.05, 0.25, 0.05), vec3(0.15, 0.45, 0.12), flowerShade); // tangkai
  } else {
    flowerColor = mix(vec3(0.10, 0.35, 0.08), vec3(0.20, 0.55, 0.15), flowerShade); // daun
  }

  vColor = mix(baseColor, flowerColor, uFlowerColorAmount);
  float wingDist = length(positionB.xy);
  vec3 wingColor = mix(vec3(1.0, 0.45, 0.75), vec3(0.6, 0.3, 1.0), smoothstep(0.3, 1.9, wingDist));
  float isBody = 1.0 - smoothstep(0.05, 0.10, abs(positionB.x));
  vec3 butterflyColor = mix(wingColor, vec3(1.0, 0.85, 0.6), isBody);

  vColor = mix(vColor, butterflyColor, uButterflyColorAmount);
}
