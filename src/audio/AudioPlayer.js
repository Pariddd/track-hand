/**
 * AudioPlayer.js
 *
 * Pemutar musik latar (satu lagu, loop) dengan UI "piringan titik" yang berputar saat lagu
 * jalan dan berpendar mengikuti bass lagu (Web Audio AnalyserNode).
 *
 * KENDALA BROWSER: kebijakan autoplay memblokir audio.play() sebelum ada interaksi pengguna
 * (klik / ketuk / tombol keyboard). Gerakan tangan di depan kamera dan izin kamera TIDAK
 * dihitung sebagai interaksi. Karena itu lagu baru mulai setelah ketukan pertama di mana saja,
 * atau lewat tombol piringan.
 */

// >>> GANTI SESUAI LAGU ANDA <<<
// File di folder public/ disajikan dari root: "public/audio/lagu.mp3" -> "/audio/lagu.mp3".
const SONG = {
  url: "/audio/lagu.mp3",
  title: "Best Friend",
  artist: "Parid Soft Spoken",
};
const DEFAULT_VOLUME = 0.5; // 0.0 - 1.0

const HINT_TEXT = {
  idle: "Ketuk layar untuk memutar",
  error: "Lagu tidak dapat dimuat",
};

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class AudioPlayer {
  /** @param {HTMLElement} root - elemen #music-player */
  constructor(root) {
    this.root = root;
    this.toggleBtn = root.querySelector("[data-music-toggle]");
    this.timeEl = root.querySelector("[data-music-time]");
    this.progressEl = root.querySelector("[data-music-progress]");
    this.hintEl = root.querySelector("[data-music-hint]");
    root.querySelector("[data-music-title]").textContent = SONG.title;
    root.querySelector("[data-music-artist]").textContent = SONG.artist;

    this.audio = new Audio(SONG.url);
    this.audio.loop = true;
    this.audio.volume = DEFAULT_VOLUME;
    this.audio.preload = "metadata";

    this.state = "idle";
    this.isSeeking = false;

    // Web Audio untuk pendar yang mengikuti bass. Dibuat malas (saat play pertama) karena
    // AudioContext juga butuh interaksi pengguna.
    this.ctx = null;
    this.analyser = null;
    this.levelData = null;
    this._analyserFailed = false;
    this._raf = 0;
    this._reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this._bindEvents();
    this._setState("idle");
  }

  _bindEvents() {
    this.toggleBtn.addEventListener("click", () => this.toggle());

    // Interaksi pertama di mana saja -> mulai lagu.
    // PENTING: abaikan interaksi DI DALAM pemutar. Tanpa ini, ketukan pertama pada tombol
    // memicu dua aksi: pointerdown di window memutar lagu, lalu click tombol menjalankan
    // toggle() yang langsung menjedanya lagi (bug versi sebelumnya).
    this._onFirstInteraction = (e) => {
      if (this.root.contains(e.target)) return;
      if (this.state === "idle") this.play();
    };
    window.addEventListener("pointerdown", this._onFirstInteraction);
    window.addEventListener("keydown", this._onFirstInteraction);

    this.audio.addEventListener("play", () => this._setState("playing"));
    this.audio.addEventListener("pause", () => {
      if (this.state !== "error") this._setState("paused");
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.progressEl.disabled = false;
      this._renderProgress();
    });
    this.audio.addEventListener("timeupdate", () => this._renderProgress());
    this.audio.addEventListener("error", () => {
      console.warn(
        `[AudioPlayer] Gagal memuat lagu: ${SONG.url}. Pastikan file ada di public/audio/.`,
      );
      this._setState("error");
    });

    // Seek: 'input' saat digeser (pratinjau waktu), 'change' saat dilepas (lompat ke posisi)
    this.progressEl.addEventListener("input", () => {
      this.isSeeking = true;
      const d = this.audio.duration;
      if (Number.isFinite(d))
        this._renderTime((d * this.progressEl.value) / 1000, d);
      this._paintProgress();
    });
    this.progressEl.addEventListener("change", () => {
      const d = this.audio.duration;
      if (Number.isFinite(d))
        this.audio.currentTime = (d * this.progressEl.value) / 1000;
      this.isSeeking = false;
    });
  }

  async play() {
    if (this.state === "error") return;
    this._ensureAnalyser();
    try {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      await this.audio.play();
      // Lagu sudah jalan, listener interaksi-pertama tidak diperlukan lagi
      window.removeEventListener("pointerdown", this._onFirstInteraction);
      window.removeEventListener("keydown", this._onFirstInteraction);
    } catch (err) {
      console.warn("[AudioPlayer] play() ditolak:", err.name);
    }
  }

  pause() {
    this.audio.pause();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  _ensureAnalyser() {
    if (this.ctx || this._analyserFailed || this._reducedMotion) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      const source = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256; // 128 bin, ~172 Hz per bin pada 44.1 kHz
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination); // wajib, kalau tidak lagu jadi senyap
      this.levelData = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (err) {
      // Pendar bass hanya hiasan: kalau gagal, lagu tetap diputar lewat <audio> biasa
      console.warn("[AudioPlayer] Analyser tidak tersedia:", err.name);
      this._analyserFailed = true;
      this.ctx = null;
      this.analyser = null;
    }
  }

  _tick = () => {
    this._raf = requestAnimationFrame(this._tick);
    this.analyser.getByteFrequencyData(this.levelData);
    // Bin 1..6 ≈ 170 Hz - 1.2 kHz: area bass & kick, paling terasa sebagai "denyut"
    let sum = 0;
    for (let i = 1; i <= 6; i++) sum += this.levelData[i];
    this.root.style.setProperty("--level", (sum / (6 * 255)).toFixed(3));
  };

  _startLevelLoop() {
    if (!this.analyser || this._raf) return;
    this._tick();
  }

  _stopLevelLoop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.root.style.setProperty("--level", "0");
  }

  _setState(state) {
    this.state = state;
    this.root.dataset.state = state;

    const labels = {
      idle: "Putar lagu",
      paused: "Putar lagu",
      playing: "Jeda lagu",
      error: "Lagu tidak dapat dimuat",
    };
    this.toggleBtn.setAttribute("aria-label", labels[state]);
    this.toggleBtn.title = labels[state];
    this.toggleBtn.disabled = state === "error";
    this.hintEl.textContent = HINT_TEXT[state] || "";

    if (state === "playing") this._startLevelLoop();
    else this._stopLevelLoop();
  }

  _renderProgress() {
    const { currentTime, duration } = this.audio;
    if (!this.isSeeking && Number.isFinite(duration) && duration > 0) {
      this.progressEl.value = Math.round((currentTime / duration) * 1000);
    }
    if (!this.isSeeking) this._renderTime(currentTime, duration);
    this._paintProgress();
  }

  _renderTime(current, duration) {
    this.timeEl.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  _paintProgress() {
    this.progressEl.style.setProperty(
      "--progress",
      `${this.progressEl.value / 10}%`,
    );
  }
}
