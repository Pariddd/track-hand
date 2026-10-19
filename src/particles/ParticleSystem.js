import * as THREE from "three";
import gsap from "gsap";
import { Config } from "../utils/Config.js";
import {
  generatePlanetPositions,
  orbitPlanetPositions,
} from "../shapes/PlanetShape.js";
import { generateTextPositions } from "../shapes/TextShape.js";
import { generateHeartPositions } from "../shapes/HeartShape.js";
import { generateScatterPositions } from "../shapes/ScatterShape.js";
import { generateFlowerPositions } from "../shapes/FlowerShape.js";
import { generateButterflyPositions } from "../shapes/ButterflyShape.js";

import vertexShader from "../shaders/particle.vert.glsl?raw";
import fragmentShader from "../shaders/particle.frag.glsl?raw";

// Durasi efek "sedang ditulis" saat berpindah ke teks (detik). Lebih lama dari morph biasa
// karena huruf tersusun bertahap mengikuti urutan baca. Harus sinkron dengan shader
// (WRITE_SPREAD & WRITE_TAIL di particle.vert.glsl).
const TEXT_WRITE_DURATION = 3.2;

/**
 * ParticleSystem.js
 *
 * Mengelola satu BufferGeometry + ShaderMaterial untuk SEMUA shape.
 * Morph antar shape dilakukan dengan menukar attribute positionA/positionB lalu
 * men-tween SATU uniform scalar (uMorphProgress) via GSAP — bukan tween per-vertex.
 *
 * PENTING: semua shape di-generate dengan COUNT PARTIKEL YANG SAMA
 * (Config.particles.COUNT) agar index-based morph valid.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.count = Config.particles.COUNT;

    // Bunga mawar: posisi + kategori warna + shade per partikel
    const flowerData = generateFlowerPositions(this.count);
    // Hati: posisi + shade per partikel (0 = inti, 1 = tepi) untuk gradasi warna bara
    const heartData = generateHeartPositions(this.count);
    // Planet: posisi + bagian (badan/atmosfer/cincin/bulan) + kecepatan orbit + shade
    const planetData = generatePlanetPositions(this.count);
    // Kupu-kupu: posisi + bagian (badan/sayap/urat/tepi/bintik/antena) + shade corak
    const butterflyData = generateButterflyPositions(this.count);
    // Teks: posisi + peran (pesan / baris penutup / ikon hati) + urutan baca untuk efek menulis
    const textData = generateTextPositions(
      this.count,
      "Semangat Dilla\nPPL sama KPM-nya yaa\nkalo cape inget Farid yaa\nwkwkw\nLOVE YOU CANTIKKK <3",
    );

    this.shapes = {
      planet: planetData.positions,
      text: textData.positions,
      heart: heartData.positions,
      scatter: generateScatterPositions(this.count),
      flower: flowerData.positions,
      butterfly: butterflyData.positions,
    };
    this.flowerCategories = flowerData.categories;
    this.flowerShades = flowerData.shades;
    this.heartShades = heartData.shades;
    this.planetParts = planetData.parts;
    this.planetOrbits = planetData.orbits;
    this.planetShades = planetData.shades;
    this.planetRingAxis = planetData.ringAxis;
    this.planetMoonCenter = planetData.moonCenter;
    this.butterflyParts = butterflyData.parts;
    this.butterflyShades = butterflyData.shades;
    this.textRoles = textData.roles;
    this.textOrders = textData.orders;
    // Waktu orbit cincin: hanya bertambah selama planet tampil (lihat update())
    this.planetOrbitTime = 0;

    this.currentShapeName = "planet";
    this._morphTween = null;

    this._buildGeometry();
    this._buildMaterial();

    this.points = new THREE.Points(this.geometry, this.material);

    // Group pembungkus untuk transform posisi & rotasi tangan (lihat main.js).
    this.anchor = new THREE.Group();
    this.anchor.add(this.points);
    this.scene.add(this.anchor);
  }

  _buildGeometry() {
    this.geometry = new THREE.BufferGeometry();

    const initial = this.shapes.planet;

    // positionA & positionB awal sama-sama planet (belum ada morph berjalan)
    this.geometry.setAttribute(
      "positionA",
      new THREE.BufferAttribute(initial.slice(), 3),
    );
    this.geometry.setAttribute(
      "positionB",
      new THREE.BufferAttribute(initial.slice(), 3),
    );

    // position "asli" tetap di-set juga (dipakai Three.js untuk bounding sphere frustum culling)
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(initial.slice(), 3),
    );

    const randomSeed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) randomSeed[i] = Math.random();
    this.geometry.setAttribute(
      "randomSeed",
      new THREE.BufferAttribute(randomSeed, 1),
    );

    // Atribut statis per shape (tidak ikut morph posisi), dipakai shader untuk warna & efek
    this.geometry.setAttribute(
      "flowerCategory",
      new THREE.BufferAttribute(this.flowerCategories, 1),
    );
    this.geometry.setAttribute(
      "flowerShade",
      new THREE.BufferAttribute(this.flowerShades, 1),
    );
    this.geometry.setAttribute(
      "heartShade",
      new THREE.BufferAttribute(this.heartShades, 1),
    );
    this.geometry.setAttribute(
      "planetPart",
      new THREE.BufferAttribute(this.planetParts, 1),
    );
    this.geometry.setAttribute(
      "planetOrbit",
      new THREE.BufferAttribute(this.planetOrbits, 1),
    );
    this.geometry.setAttribute(
      "planetShade",
      new THREE.BufferAttribute(this.planetShades, 1),
    );
    this.geometry.setAttribute(
      "butterflyPart",
      new THREE.BufferAttribute(this.butterflyParts, 1),
    );
    this.geometry.setAttribute(
      "butterflyShade",
      new THREE.BufferAttribute(this.butterflyShades, 1),
    );
    this.geometry.setAttribute(
      "textRole",
      new THREE.BufferAttribute(this.textRoles, 1),
    );
    this.geometry.setAttribute(
      "textOrder",
      new THREE.BufferAttribute(this.textOrders, 1),
    );

    // Bounding sphere manual (cukup besar untuk cover semua shape)
    this.geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, 0),
      3.0,
    );
  }

  _buildMaterial() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false, // penting untuk blending partikel transparan yang saling overlap
      blending: THREE.AdditiveBlending,
      uniforms: {
        // 1 di awal: positionA = positionB = planet, dan orbit planet diterapkan ke positionB,
        // jadi nilai 1 membuat cincin langsung mengorbit sejak halaman dibuka.
        uMorphProgress: { value: 1 },
        uTime: { value: 0 },
        uBaseSize: { value: Config.particles.BASE_SIZE },
        uPulseAmount: { value: 0 }, // di-set 1 saat shape aktif = heart
        uWaveAmount: { value: 0 }, // di-set >0 saat shape aktif = text
        uTurbulenceAmount: { value: 1.0 }, // dinaikkan saat shape aktif = scatter
        // 0..1: blend ke warna mawar. Di-tween saat shape = flower.
        uFlowerColorAmount: { value: 0 },
        // 0..1: blend ke warna hati (bara merah). Di-tween saat shape = heart.
        uHeartColorAmount: { value: 0 },
        // Planet adalah shape awal, jadi warna & orbitnya aktif sejak mula (nilai 1).
        uPlanetAmount: { value: 1 },
        uOrbitOn: { value: 1 }, // 1 = cincin & bulan mengorbit (hanya saat target = planet)
        uPlanetTime: { value: 0 }, // detik orbit yang sudah berjalan
        uRingAxis: { value: new THREE.Vector3(...this.planetRingAxis) },
        uMoonCenter: { value: new THREE.Vector3(...this.planetMoonCenter) },
        // Teks: 1 = efek "sedang ditulis" aktif (hanya saat target = teks), warna teks 0..1
        uWriteAmount: { value: 0 },
        uTextColorAmount: { value: 0 },
        // Kupu-kupu: 0..1 blend ke warna kupu-kupu, dan 0..1 kekuatan kepakan sayap.
        uButterflyColorAmount: { value: 0 },
        uFlapAmount: { value: 0 },
        // WAJIB di-update tiap resize via setViewportHeight()
        uViewportHeight: { value: window.innerHeight },
      },
    });
  }

  /**
   * Dipanggil dari main.js saat window resize agar gl_PointSize tetap perspective-correct.
   */
  setViewportHeight(height) {
    this.material.uniforms.uViewportHeight.value = height;
  }

  /**
   * Trigger morph ke shape baru. Dipanggil dari main.js saat GestureStateMachine emit 'change'.
   * @param {string} targetShapeName - 'planet' | 'text' | 'heart' | 'scatter' | 'flower' | 'butterfly'
   */
  morphTo(targetShapeName) {
    if (targetShapeName === this.currentShapeName) return;
    if (!this.shapes[targetShapeName]) {
      console.warn(
        `[ParticleSystem] Shape "${targetShapeName}" tidak dikenal.`,
      );
      return;
    }

    const posAttr = this.geometry.attributes.position;
    let currentInterpolated;
    if (this.currentShapeName === "planet") {
      // Cincin & bulan sedang mengorbit di shader, jadi posisi yang TERLIHAT bukan posisi
      // statis. Hitung posisi orbit saat ini di CPU supaya morph mulai dari sana.
      currentInterpolated = orbitPlanetPositions(
        this.shapes.planet,
        this.planetOrbits,
        this.planetParts,
        this.planetRingAxis,
        this.planetMoonCenter,
        this.planetOrbitTime,
        new Float32Array(this.count * 3),
      );
    } else {
      currentInterpolated = new Float32Array(posAttr.array); // snapshot posisi saat ini
    }

    // Orbit hanya diterapkan pada target = planet. Diset langsung (bukan di-tween) karena
    // posisi awal sudah memperhitungkan orbit saat ini.
    this.material.uniforms.uOrbitOn.value =
      targetShapeName === "planet" ? 1 : 0;
    // Efek menulis hanya untuk morph MENUJU teks; diset langsung, bukan di-tween.
    const isText = targetShapeName === "text";
    this.material.uniforms.uWriteAmount.value = isText ? 1 : 0;

    this.geometry.attributes.positionA.array.set(currentInterpolated);
    this.geometry.attributes.positionA.needsUpdate = true;

    this.geometry.attributes.positionB.array.set(this.shapes[targetShapeName]);
    this.geometry.attributes.positionB.needsUpdate = true;

    if (this._morphTween) this._morphTween.kill();

    this.material.uniforms.uMorphProgress.value = 0;

    this._morphTween = gsap.to(this.material.uniforms.uMorphProgress, {
      value: 1,
      duration: isText ? TEXT_WRITE_DURATION : Config.particles.MORPH_DURATION,
      // sine.inOut: kurva paling landai -> morph terasa "mengalir".
      // Teks: linear, supaya "pena" menulis dengan kecepatan tetap; tiap huruf sudah punya
      // easing sendiri di shader.
      ease: isText ? "none" : "sine.inOut",
      onUpdate: () => this._syncPositionAttributeForCulling(),
      onComplete: () => this._syncPositionAttributeForCulling(),
    });

    this._setShapeEffects(targetShapeName);
    this.currentShapeName = targetShapeName;
  }

  /**
   * Attribute `position` hanya dipakai untuk snapshot morphTo() berikutnya, BUKAN untuk
   * render (render selalu lewat shader dari positionA/positionB).
   */
  _syncPositionAttributeForCulling() {
    if (this.material.uniforms.uMorphProgress.value >= 1) {
      const posAttr = this.geometry.attributes.position;
      posAttr.array.set(this.geometry.attributes.positionB.array);
      posAttr.needsUpdate = true;
    }
  }

  _setShapeEffects(shapeName) {
    // Semua tween efek memakai sine.inOut / 0.6s agar terasa satu transisi utuh.
    gsap.to(this.material.uniforms.uPulseAmount, {
      value: shapeName === "heart" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    // Teks: gelombang & turbulence dikecilkan supaya goresan huruf tetap tegas,
    // dan ukuran titik diperbesar karena teks besar membuat partikel lebih renggang.
    const isText = shapeName === "text";
    gsap.to(this.material.uniforms.uWaveAmount, {
      value: isText ? 0.012 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uTurbulenceAmount, {
      value: shapeName === "scatter" ? 3.5 : isText ? 0.25 : 1.0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uBaseSize, {
      value: isText
        ? Config.particles.BASE_SIZE * 1.3
        : Config.particles.BASE_SIZE,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uTextColorAmount, {
      value: isText ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uPlanetAmount, {
      value: shapeName === "planet" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uHeartColorAmount, {
      value: shapeName === "heart" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uFlowerColorAmount, {
      value: shapeName === "flower" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uButterflyColorAmount, {
      value: shapeName === "butterfly" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
    gsap.to(this.material.uniforms.uFlapAmount, {
      value: shapeName === "butterfly" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
  }

  update(deltaTime, elapsedTime) {
    this.material.uniforms.uTime.value = elapsedTime;

    // Waktu orbit cincin & bulan planet hanya maju saat planet tampil.
    if (this.currentShapeName === "planet") {
      this.planetOrbitTime += deltaTime;
      this.material.uniforms.uPlanetTime.value = this.planetOrbitTime;
    }

    // Rotasi Points tidak dipakai lagi. Kembalikan sisa rotasi lama (jika ada) ke 0
    // agar semua shape menghadap kamera.
    if (this.points.rotation.y !== 0) {
      const TWO_PI = Math.PI * 2;
      const r = ((this.points.rotation.y % TWO_PI) + TWO_PI) % TWO_PI;
      const target = r > Math.PI ? TWO_PI : 0;
      const next = r + (target - r) * Math.min(1, deltaTime * 4);
      this.points.rotation.y = Math.abs(target - next) < 0.001 ? 0 : next;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
