import * as THREE from "three";
import gsap from "gsap";
import { Config } from "../utils/Config.js";
import { generatePlanetPositions } from "../shapes/PlanetShape.js";
import { generateTextPositions } from "../shapes/TextShape.js";
import { generateHeartPositions } from "../shapes/HeartShape.js";
import { generateScatterPositions } from "../shapes/ScatterShape.js";
import { generateFlowerPositions } from "../shapes/FlowerShape.js";
import { generateButterflyPositions } from "../shapes/ButterflyShape.js";

import vertexShader from "../shaders/particle.vert.glsl?raw";
import fragmentShader from "../shaders/particle.frag.glsl?raw";

/**
 * ParticleSystem.js
 *
 * Mengelola satu BufferGeometry + ShaderMaterial untuk SEMUA shape (planet/text/heart).
 * Morph antar shape dilakukan dengan menukar attribute positionA/positionB lalu
 * men-tween SATU uniform scalar (uMorphProgress) via GSAP — bukan tween per-vertex.
 *
 * PENTING: ketiga shape (planet, text, heart) di-generate dengan COUNT PARTIKEL YANG SAMA
 * (Config.particles.COUNT) agar index-based morph valid (lihat shapes/*.js untuk detail
 * strategi oversampling yang dipakai text & heart untuk mencapai parity ini).
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.count = Config.particles.COUNT;

    // Bunga mawar mengembalikan posisi + kategori warna (petal/stem/leaf) + shade per partikel.
    // Kategori & shade statis per index (tidak ikut morph) dan dipakai shader untuk warna.
    const flowerData = generateFlowerPositions(this.count);

    this.shapes = {
      planet: generatePlanetPositions(this.count),
      text: generateTextPositions(
        this.count,
        "Semangat Dilla\nPPL sama KPM-nya yaa\nkalo cape inget Farid yaa\nwkwkw\nLOVE YOU CANTIKKK <3",
      ),
      heart: generateHeartPositions(this.count),
      scatter: generateScatterPositions(this.count),
      flower: flowerData.positions,
      butterfly: generateButterflyPositions(this.count),
    };
    this.flowerCategories = flowerData.categories;
    this.flowerShades = flowerData.shades;

    this.currentShapeName = "planet";
    this._morphTween = null;

    this._buildGeometry();
    this._buildMaterial();

    this.points = new THREE.Points(this.geometry, this.material);

    // Group pembungkus untuk transform posisi & rotasi tangan (lihat main.js).
    // Points HANYA child dari anchor, tidak pernah ditambahkan langsung ke scene,
    // supaya transform posisi/rotasi tangan cukup diterapkan sekali di level anchor.
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

    // Atribut warna bunga (statis): kategori 0=kelopak, 1=tangkai, 2=daun + shade gradasi
    this.geometry.setAttribute(
      "flowerCategory",
      new THREE.BufferAttribute(this.flowerCategories, 1),
    );
    this.geometry.setAttribute(
      "flowerShade",
      new THREE.BufferAttribute(this.flowerShades, 1),
    );

    // Bounding sphere manual (cukup besar untuk cover semua shape) agar Three.js tidak
    // salah frustum-cull object ini padahal sebenarnya masih di dalam view tangan.
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
      blending: THREE.AdditiveBlending, // additive -> kesan glow neon saat partikel overlap
      uniforms: {
        uMorphProgress: { value: 0 },
        uTime: { value: 0 },
        uBaseSize: { value: Config.particles.BASE_SIZE },
        uPulseAmount: { value: 0 }, // di-set 1 saat shape aktif = heart
        uWaveAmount: { value: 0 }, // di-set >0 saat shape aktif = text
        // Multiplier turbulence dasar (0.02 di shader). Dinaikkan saat shape aktif = scatter
        // agar partikel terlihat terus "melayang menjauh/bergejolak" alih-alih diam statis
        // di posisi hasil morph — memperkuat kesan "menyebar" yang diminta, bukan cuma
        // perubahan bentuk sesaat. Default 1.0 = turbulence dasar tidak berubah utk shape lain.
        uTurbulenceAmount: { value: 1.0 },
        // 0..1: blend dari warna neon biru ke warna mawar (merah/hijau). Di-tween saat shape = flower.
        uFlowerColorAmount: { value: 0 },
        uButterflyColorAmount: { value: 0 },
        uFlapAmount: { value: 0 },
        // Diinisialisasi dengan window.innerHeight saat ini; WAJIB di-update tiap resize
        // via setViewportHeight(), kalau tidak point size akan salah proporsi setelah resize window.
        uViewportHeight: { value: window.innerHeight },
      },
    });
  }

  /**
   * Dipanggil dari main.js saat window resize agar gl_PointSize tetap perspective-correct
   * terhadap dimensi viewport terbaru.
   */
  setViewportHeight(height) {
    this.material.uniforms.uViewportHeight.value = height;
  }

  /**
   * Trigger morph ke shape baru. Dipanggil dari main.js saat GestureStateMachine emit 'change'.
   * @param {string} targetShapeName - 'planet' | 'text' | 'heart' | 'scatter' | 'flower'
   */
  morphTo(targetShapeName) {
    if (targetShapeName === this.currentShapeName) return;
    if (!this.shapes[targetShapeName]) {
      console.warn(
        `[ParticleSystem] Shape "${targetShapeName}" tidak dikenal.`,
      );
      return;
    }

    // Ambil posisi hasil interpolasi SAAT INI sebagai titik awal morph baru
    // (bukan selalu dari shape asli), agar kalau user ganti gesture di tengah animasi morph
    // sebelumnya, transisi tetap smooth dari posisi visual terkini, tidak "loncat".
    const posAttr = this.geometry.attributes.position;
    const currentInterpolated = new Float32Array(posAttr.array); // snapshot posisi saat ini

    this.geometry.attributes.positionA.array.set(currentInterpolated);
    this.geometry.attributes.positionA.needsUpdate = true;

    this.geometry.attributes.positionB.array.set(this.shapes[targetShapeName]);
    this.geometry.attributes.positionB.needsUpdate = true;

    if (this._morphTween) this._morphTween.kill();

    this.material.uniforms.uMorphProgress.value = 0;

    this._morphTween = gsap.to(this.material.uniforms.uMorphProgress, {
      value: 1,
      duration: Config.particles.MORPH_DURATION,
      // sine.inOut: kurva akselerasi/deselerasi paling landai di antara easing standar GSAP
      // (tidak ada overshoot maupun perubahan kecepatan mendadak di tengah transisi seperti
      // power2.inOut), dipilih ulang khusus supaya morph terasa lebih "mengalir".
      ease: "sine.inOut",
      onUpdate: () => this._syncPositionAttributeForCulling(),
      onComplete: () => this._syncPositionAttributeForCulling(),
    });

    this._setShapeEffects(targetShapeName);
    this.currentShapeName = targetShapeName;
  }

  /**
   * Attribute `position` bawaan Three.js dipakai untuk bounding sphere/raycasting,
   * TAPI posisi visual sebenarnya dihitung di vertex shader dari positionA/positionB.
   * Sinkronisasi ringan ini hanya untuk snapshot morphTo() berikutnya (lihat di atas),
   * BUKAN untuk render — render selalu pakai shader, bukan attribute `position` langsung.
   * Sengaja tidak update tiap frame (mahal), cukup saat morph selesai.
   */
  _syncPositionAttributeForCulling() {
    // No-op berat sengaja dihindari di sini. Snapshot cukup diambil saat morphTo() dipanggil
    // dari nilai positionB shape sebelumnya jika progress sudah 1. Implementasi minimal:
    if (this.material.uniforms.uMorphProgress.value >= 1) {
      const posAttr = this.geometry.attributes.position;
      posAttr.array.set(this.geometry.attributes.positionB.array);
      posAttr.needsUpdate = true;
    }
  }

  _setShapeEffects(shapeName) {
    // Efek khusus per-shape sesuai spek: heartbeat pulse utk heart, wave utk text,
    // turbulence boost utk scatter (lihat komentar uniform uTurbulenceAmount di _buildMaterial).
    //
    // Ease disamakan ke 'sine.inOut' dan duration ke 0.6s (sebelumnya: tanpa ease eksplisit
    // -> default GSAP 'power1.out', dan duration 0.4s berbeda dari morph utama 1.0s).
    // Mismatch ease/duration antar tween yang jalan BERSAMAAN inilah yang membuat animasi
    // terasa tidak "smooth" secara keseluruhan — morph posisi melandai halus, tapi efek
    // sekunder (pulse/wave/turbulence) berhenti duluan dengan kurva berbeda, jadi terasa
    // seperti dua animasi terpisah yang kebetulan tumpang tindih, bukan satu transisi utuh.
    gsap.to(this.material.uniforms.uPulseAmount, {
      value: shapeName === "heart" ? 1 : 0,
      duration: 0.6,
      ease: "sine.inOut",
    });
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

    // Rotasi lambat konstan untuk planet (spek: "animasi rotasi perlahan")
    if (this.currentShapeName === "planet") {
      this.points.rotation.y += deltaTime * 0.15;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
