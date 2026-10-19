import * as THREE from "three";
import { Config } from "./utils/Config.js";
import { VideoStream } from "./camera/VideoStream.js";
import { HandTracker } from "./hand/HandTracker.js";
import {
  computeHandOrientation,
  computePalmCenter,
} from "./hand/HandOrientation.js";
import {
  OneEuroVector3Filter,
  OneEuroQuaternionFilter,
} from "./hand/OneEuroFilter.js";
import { classifyGesture } from "./gestures/GestureClassifier.js";
import { GestureStateMachine } from "./gestures/GestureStateMachine.js";
import { ParticleSystem } from "./particles/ParticleSystem.js";
import { BloomComposer } from "./effects/BloomComposer.js";
import { AudioPlayer } from "./audio/AudioPlayer.js";
import { CameraHud } from "./ui/CameraHud.js";
// Font tulisan tangan Caveat DIBUNDEL ke project (bukan dari Google Fonts), supaya pasti
// tersedia saat teks partikel digambar ke canvas, termasuk saat offline.
// 600 = judul lagu di pemutar musik, 700 = teks partikel.
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";

/**
 * main.js
 *
 * ARSITEKTUR KUNCI: render loop (rAF, target 60fps) TERPISAH dari inference loop
 * (throttled ~30Hz di dalam HandTracker.detect()). Render loop selalu jalan penuh
 * memakai landmark terakhir yang sudah difilter, tidak menunggu inference selesai.
 * Ini adalah keputusan arsitektur paling penting untuk mencapai 60fps di GPU non-diskrit
 * (lihat analisis performa sebelumnya).
 */

const loadingEl = document.getElementById("loading-overlay");
const errorEl = document.getElementById("permission-error");
const videoEl = document.getElementById("camera-video");
const canvasEl = document.getElementById("three-canvas");

// Musik latar. Diinisialisasi di luar App.init() supaya tombol & listener interaksi-pertama
// sudah aktif sejak halaman dibuka, tidak menunggu kamera/model selesai dimuat.
new AudioPlayer(document.getElementById("music-player"));

// Bingkai kamera, keterangan bentuk aktif & panduan gerakan (lihat src/ui/CameraHud.js)
const hud = new CameraHud(document.getElementById("camera-hud"));

/**
 * Tunggu font Caveat siap dipakai canvas. Teks partikel digambar SEKALI saat partikel dibuat,
 * jadi kalau font belum termuat, canvas memakai font cadangan dan hasilnya tidak berubah lagi.
 * Dibatasi waktu (timeout) supaya halaman tidak pernah tertahan di layar loading.
 */
async function waitForFonts(timeoutMs = 3000) {
  if (!document.fonts || !document.fonts.load) return;
  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  try {
    await Promise.race([document.fonts.load('700 100px "Caveat"'), timeout]);
  } catch (err) {
    console.warn("[App] Font Caveat gagal dimuat, memakai font cadangan:", err);
  }
}

const IDENTITY_QUAT = new THREE.Quaternion();

const GESTURE_TO_SHAPE = {
  fist: "planet",
  peace: "text", // 2 jari -> teks "I LOVE U" (lihat TextShape.js)
  iloveyou: "heart",
  open: "scatter", // 5 jari / telapak terbuka -> partikel menyebar (lihat ScatterShape.js)
  threeFingers: "flower", // 3 jari -> bunga mawar (lihat FlowerShape.js)
  pointing: "butterfly", // telunjuk -> kupu-kupu (lihat ButterflyShape.js)
  none: null, // gesture 'none' sengaja TIDAK memicu morph — shape terakhir dipertahankan
};

class App {
  constructor() {
    this.clock = new THREE.Clock();
    this.mappedTargetPos = new THREE.Vector3();
    this.mappedQuat = new THREE.Quaternion();

    this.posFilter = new OneEuroVector3Filter(
      Config.filter.MIN_CUTOFF,
      Config.filter.BETA,
      Config.filter.D_CUTOFF,
    );
    this.quatFilter = new OneEuroQuaternionFilter(
      Config.filter.MIN_CUTOFF,
      Config.filter.BETA,
      Config.filter.D_CUTOFF,
    );

    this.handVisible = false;
    // 0 = ikut rotasi tangan, 1 = menghadap kamera lurus. Dipakai untuk teks (lihat _renderLoop).
    this.textLock = 0;
    this._rawPalmPos = new THREE.Vector3();
    this._rawQuat = new THREE.Quaternion();
  }

  async init() {
    await waitForFonts(); // HARUS sebelum _initParticles() (teks partikel dibuat di sana)
    this._initScene();
    this._initParticles();
    this._initPostProcessing();

    this.gestureStateMachine = new GestureStateMachine((newState) => {
      const targetShape = GESTURE_TO_SHAPE[newState];
      if (!targetShape) return;
      this.particleSystem.morphTo(targetShape);
      hud.setShape(targetShape);
    });

    try {
      this.videoStream = new VideoStream(videoEl);
      await this.videoStream.start();
    } catch (err) {
      console.error("[App] Gagal mengakses kamera:", err);
      hud.error(
        "Kamera tidak aktif",
        "Izinkan akses kamera, lalu muat ulang halaman",
      );
      errorEl.style.display = "flex";
      loadingEl.classList.add("hidden");
      return;
    }

    try {
      this.handTracker = new HandTracker();
      await this.handTracker.init();
    } catch (err) {
      console.error("[App] Gagal inisialisasi HandLandmarker:", err);
      hud.error(
        "Pelacak tangan gagal dimuat",
        "Periksa koneksi internet, lalu muat ulang halaman",
      );
      loadingEl.classList.add("hidden");
      return;
    }

    loadingEl.classList.add("hidden");
    hud.ready();

    window.addEventListener("resize", () => this._onResize());

    this._renderLoop();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(Config.scene.BACKGROUND_COLOR);

    this.camera = new THREE.PerspectiveCamera(
      Config.scene.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      Config.scene.CAMERA_NEAR,
      Config.scene.CAMERA_FAR,
    );
    this.camera.position.z = Config.scene.CAMERA_Z;

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // WAJIB untuk additive blending: tanpa tone mapping, nilai warna hasil AdditiveBlending
    // yang overlap (bisa jauh > 1.0 di area padat) tidak di-clamp, sehingga area padat
    // bisa clip ke putih polos secara kasar. ACESFilmicToneMapping dipilih karena kurva
    // roll-off highlight-nya halus dibanding ReinhardToneMapping yang cenderung lebih flat.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Exposure dikembalikan ke 1.0 (dari 0.9): nilai 0.9 sebelumnya sengaja diturunkan
    // untuk memberi headroom SEBELUM bloom pass, supaya highlight tidak langsung clip ke
    // bloom threshold. Karena bloom sekarang dimatikan (lihat Config.bloom.ENABLED),
    // headroom itu tidak relevan lagi dan hanya membuat partikel terlihat sedikit redup.
    this.renderer.toneMappingExposure = 1.0;

    // Cap pixelRatio ke 1.5 (bukan devicePixelRatio penuh yang bisa 2-3 di layar retina/4K).
    // Ini adalah tuas performa PALING signifikan untuk bloom pass (lihat catatan di BloomComposer.js) —
    // menurunkan resolusi render jauh lebih efektif daripada menurunkan particle count.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // OrbitControls HANYA untuk debugging, dinonaktifkan di mode produksi.
    // Uncomment blok di bawah ini saat development jika perlu inspeksi manual scene:
    //
    // import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }

  _initParticles() {
    this.particleSystem = new ParticleSystem(this.scene);
  }

  _initPostProcessing() {
    this.bloomComposer = new BloomComposer(
      this.renderer,
      this.scene,
      this.camera,
    );
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.bloomComposer.setSize(window.innerWidth, window.innerHeight);
    this.particleSystem.setViewportHeight(window.innerHeight);
  }

  /**
   * Proses hasil deteksi tangan terbaru: hitung target posisi/rotasi, filter, klasifikasi gesture.
   * Dipanggil tiap frame render, tapi hanya BEREAKSI ke data baru jika HandTracker sudah infer ulang
   * (HandTracker.detect() sendiri yang menangani throttle-nya, lihat HandTracker.js).
   */
  _processHandTracking(timestampMs) {
    const result = this.handTracker.detect(videoEl);

    if (!result || !result.landmarks || result.landmarks.length === 0) {
      this.handVisible = false;
      hud.setHandVisible(false);
      // Tangan hilang dari frame -> JANGAN reset gesture state paksa ke 'none' secara instan.
      // GestureStateMachine tetap menerima 'none' sebagai candidate, tapi baru benar2 berubah
      // setelah CONFIRM_FRAMES — ini mencegah morph balik ke shape default hanya karena
      // oklusi/tracking loss sesaat (misal tangan lewat cepat di depan wajah).
      this.gestureStateMachine.update("none");
      return;
    }

    this.handVisible = true;
    hud.setHandVisible(true);
    const landmarks = result.landmarks[0]; // NUM_HANDS = 1, ambil tangan pertama

    computePalmCenter(landmarks, this._rawPalmPos);
    // Mapping dari normalized image space (0-1, origin top-left) ke world space Three.js,
    // dengan mirror X (karena video sudah di-mirror CSS untuk UX selfie-view yang natural).
    this.mappedTargetPos.set(
      (0.5 - this._rawPalmPos.x) * 6, // mirror + scale ke world units
      (0.5 - this._rawPalmPos.y) * 6,
      -this._rawPalmPos.z * 4,
    );
    this.posFilter.filter(this.mappedTargetPos, timestampMs);

    const orientationValid = computeHandOrientation(landmarks, this._rawQuat);
    if (orientationValid) {
      this.quatFilter.filter(this._rawQuat, timestampMs);
      this.mappedQuat.copy(this._rawQuat);
    }
    // Jika orientationValid false (basis degenerate), this.mappedQuat mempertahankan nilai
    // filter frame sebelumnya (lihat guard di HandOrientation.js) — mencegah snap rotasi aneh.

    const gesture = classifyGesture(landmarks);
    this.gestureStateMachine.update(gesture);
  }

  _renderLoop = () => {
    requestAnimationFrame(this._renderLoop);

    const deltaTime = Math.min(this.clock.getDelta(), 1 / 30); // clamp delta agar tidak meledak saat tab inactive lalu kembali
    const elapsedTime = this.clock.getElapsedTime();
    const timestampMs = performance.now();

    this._processHandTracking(timestampMs);

    // Terapkan posisi & rotasi hasil filter ke anchor group (parent dari particle Points).
    // Pakai copy() langsung — smoothing sudah dilakukan oleh One Euro Filter di atas.
    // Lerp/slerp tambahan di titik ini hanya menambah lag berlapis tanpa manfaat.
    this.particleSystem.anchor.position.copy(this.mappedTargetPos);

    // Teks ("Semangat Dilla...") TIDAK ikut rotasi tangan supaya selalu enak dibaca.
    // textLock dibawa halus ke 0/1 (exponential smoothing, ~0.3 dtk) lalu dipakai untuk slerp
    // antara rotasi tangan dan rotasi identitas (menghadap kamera). Saat textLock = 0, hasilnya
    // persis rotasi tangan (tanpa lag tambahan); saat 1, teks diam menghadap kamera.
    const lockTarget = this.particleSystem.currentShapeName === "text" ? 1 : 0;
    this.textLock +=
      (lockTarget - this.textLock) * (1 - Math.exp(-deltaTime * 10));
    if (Math.abs(lockTarget - this.textLock) < 1e-3) this.textLock = lockTarget;
    this.particleSystem.anchor.quaternion.slerpQuaternions(
      this.mappedQuat,
      IDENTITY_QUAT,
      this.textLock,
    );

    this.particleSystem.update(deltaTime, elapsedTime);

    this.bloomComposer.render();
  };
}

const app = new App();
app.init();
