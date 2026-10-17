import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Config } from '../utils/Config.js';

/**
 * HandTracker.js
 *
 * PENTING: ini memakai MediaPipe TASKS VISION API (HandLandmarker), BUKAN
 * legacy @mediapipe/hands (Solution API) yang sudah maintenance mode.
 * Perbedaan: Tasks Vision punya delegate GPU opsional dan API async modern
 * (detectForVideo), sementara legacy API pakai callback-based Camera utility.
 *
 * Loop inference di sini SENGAJA DIPISAH dari render loop (lihat main.js).
 * Alasan: inference (bahkan dengan GPU delegate) memakan beberapa ms yang
 * signifikan terhadap budget 16.6ms/frame untuk 60fps. Dengan throttle ke
 * ~30Hz, render loop tetap bisa jalan penuh 60fps memakai hasil landmark
 * terakhir yang sudah difilter (One Euro Filter), sementara inference update
 * di background pada interval lebih jarang.
 */
export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.lastResult = null;
    this._lastInferenceTime = 0;
    this._inferenceIntervalMs = 1000 / Config.hand.INFERENCE_TARGET_HZ;
    this._running = false;
  }

  async init() {
    // WASM files di-load dari CDN jsDelivr resmi MediaPipe.
    // Catatan: ini BUKAN cdnjs.cloudflare.com karena project ini adalah
    // build standalone Vite (bukan Claude Artifact), sehingga tidak terikat
    // pembatasan allowed-domain artifact.
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm'
    );

    const baseOptions = {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: Config.hand.PREFERRED_DELEGATE,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions,
        runningMode: 'VIDEO',
        numHands: Config.hand.NUM_HANDS,
        minHandDetectionConfidence: Config.hand.MIN_HAND_DETECTION_CONFIDENCE,
        minHandPresenceConfidence: Config.hand.MIN_HAND_PRESENCE_CONFIDENCE,
        minTrackingConfidence: Config.hand.MIN_TRACKING_CONFIDENCE,
      });
    } catch (err) {
      if (Config.hand.PREFERRED_DELEGATE === 'GPU') {
        // Fallback eksplisit ke CPU delegate jika GPU init gagal
        // (driver/browser tidak stabil dengan WebGL delegate MediaPipe).
        console.warn('[HandTracker] GPU delegate gagal, fallback ke CPU delegate.', err);
        baseOptions.delegate = 'CPU';
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions,
          runningMode: 'VIDEO',
          numHands: Config.hand.NUM_HANDS,
          minHandDetectionConfidence: Config.hand.MIN_HAND_DETECTION_CONFIDENCE,
          minHandPresenceConfidence: Config.hand.MIN_HAND_PRESENCE_CONFIDENCE,
          minTrackingConfidence: Config.hand.MIN_TRACKING_CONFIDENCE,
        });
      } else {
        throw err;
      }
    }
  }

  /**
   * Dipanggil dari main.js di dalam rAF loop, tapi internal throttle
   * memastikan inference sesungguhnya cuma jalan di INFERENCE_TARGET_HZ.
   * @returns {object|null} hasil deteksi terbaru (bisa cache lama jika belum waktunya infer)
   */
  detect(videoElement) {
    if (!this.landmarker) return this.lastResult;

    const now = performance.now();
    if (now - this._lastInferenceTime < this._inferenceIntervalMs) {
      return this.lastResult; // belum waktunya infer ulang, pakai hasil cache
    }
    this._lastInferenceTime = now;

    // Guard: video belum punya frame valid
    if (videoElement.readyState < 2) return this.lastResult;

    const result = this.landmarker.detectForVideo(videoElement, now);
    this.lastResult = result;
    return result;
  }

  dispose() {
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
