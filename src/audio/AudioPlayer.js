/**
 * AudioPlayer.js
 *
 * Pemutar musik latar sederhana (satu lagu, loop).
 *
 * KENDALA BROWSER: kebijakan autoplay (Chrome/Edge/Safari/Firefox) memblokir audio.play()
 * sebelum ada interaksi pengguna (klik / ketuk / tombol keyboard). Gerakan tangan di depan
 * kamera dan izin kamera TIDAK dihitung sebagai interaksi. Karena itu musik baru mulai
 * setelah klik/ketuk pertama di mana saja, atau lewat tombol di pojok kanan atas.
 */

// >>> GANTI PATH INI dengan file lagu Anda (taruh di folder public/audio/) <<<
// File di folder public/ disajikan dari root, jadi "public/audio/lagu.mp3" -> "/audio/lagu.mp3".
const SONG_URL = "/audio/lagu.mp3";
const DEFAULT_VOLUME = 0.5; // 0.0 - 1.0

export class AudioPlayer {
  constructor(buttonEl) {
    this.button = buttonEl;
    this.audio = new Audio(SONG_URL);
    this.audio.loop = true;
    this.audio.volume = DEFAULT_VOLUME;
    this.audio.preload = "auto";
    this.started = false; // sudah pernah berhasil diputar?
    this.userPaused = false; // pengguna sengaja menjeda lewat tombol?

    this._bindEvents();
    this._renderButton();
  }

  _bindEvents() {
    // Tombol: putar / jeda manual
    this.button.addEventListener("click", (e) => {
      e.stopPropagation(); // supaya tidak ikut memicu listener "interaksi pertama" di bawah
      this.toggle();
    });

    // Interaksi pertama di mana saja -> mulai musik (kecuali pengguna sudah menjeda sendiri)
    const startOnFirstInteraction = () => {
      if (!this.started && !this.userPaused) this.play();
    };
    window.addEventListener("pointerdown", startOnFirstInteraction, {
      once: true,
    });
    window.addEventListener("keydown", startOnFirstInteraction, { once: true });

    // Jaga ikon tombol selalu sinkron dengan kondisi audio sebenarnya
    this.audio.addEventListener("play", () => this._renderButton());
    this.audio.addEventListener("pause", () => this._renderButton());

    // File tidak ditemukan / format tidak didukung -> jangan crash, cukup beri tahu
    this.audio.addEventListener("error", () => {
      console.warn(
        `[AudioPlayer] Gagal memuat lagu: ${SONG_URL}. Pastikan file ada di public/audio/.`,
      );
      this.button.disabled = true;
      this.button.title = "File lagu tidak ditemukan";
      this.button.textContent = "🔇";
    });
  }

  async play() {
    try {
      await this.audio.play();
      this.started = true;
      this.userPaused = false;
    } catch (err) {
      // Biasanya NotAllowedError (belum ada interaksi) atau file tidak valid
      console.warn("[AudioPlayer] play() ditolak:", err.name);
    }
  }

  pause() {
    this.audio.pause();
    this.userPaused = true;
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  _renderButton() {
    const playing = !this.audio.paused;
    this.button.textContent = playing ? "🎵" : "🔇";
    this.button.setAttribute(
      "aria-label",
      playing ? "Jeda musik" : "Putar musik",
    );
    this.button.title = playing ? "Jeda musik" : "Putar musik";
  }
}
