import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Config } from '../utils/Config.js';

/**
 * BloomComposer.js
 *
 * CATATAN PERFORMA: UnrealBloomPass melakukan multiple downsample + gaussian blur pass
 * (bukan single-pass effect), jadi cost-nya signifikan terutama di resolusi tinggi.
 * Kalau FPS drop di device lemah, langkah pertama yang paling efektif adalah MENURUNKAN
 * resolution renderer (lihat main.js — pixelRatio di-cap), BUKAN menurunkan particle count
 * dulu, karena bloom cost didominasi oleh resolusi screen-space, bukan jumlah geometri.
 */
export class BloomComposer {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom pass bersyarat (lihat Config.bloom.ENABLED). Kalau dimatikan, this.bloomPass
    // tetap dibuat (murah, cuma alokasi objek) supaya setSize() di bawah tidak perlu guard
    // null-check terpisah, tapi TIDAK ditambahkan ke composer pipeline -> tidak ada cost render.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      Config.bloom.STRENGTH,
      Config.bloom.RADIUS,
      Config.bloom.THRESHOLD
    );
    if (Config.bloom.ENABLED) {
      this.composer.addPass(this.bloomPass);
    }

    // OutputPass menangani color space conversion & tone mapping output akhir
    // (wajib di Three.js versi modern agar warna tidak washed-out setelah bloom pass).
    this.composer.addPass(new OutputPass());
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  render() {
    this.composer.render();
  }
}
