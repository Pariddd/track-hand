/**
 * CameraHud.js — Bingkai kamera, keterangan bentuk aktif, dan panduan gerakan tangan
 *
 * Elemen <video id="camera-video"> TETAP sama dan tetap jadi sumber frame MediaPipe. HUD ini
 * hanya mengatur tampilan di sekitarnya, jadi tidak memengaruhi akurasi tracking sama sekali.
 *
 * Tiga hal yang dikerjakan:
 *   1. Warna bingkai kamera mengikuti bentuk partikel yang aktif (CSS var --cam-accent).
 *   2. Keterangan di bawah kamera: nama bentuk + status tangan (terbaca / belum terlihat).
 *   3. Panduan 6 gerakan. Ikon tiap gerakan = 5 batang jari (naik = jari terbuka), jadi
 *      tampil sama di semua perangkat (emoji tangan berbeda-beda tiap OS, dan tidak ada emoji
 *      untuk "tiga jari").
 *
 * Status tangan diberi jeda saat HILANG (HIDE_DELAY_MS) supaya tidak berkedip ketika tracking
 * lepas sesaat. Saat tangan MUNCUL, status langsung berubah agar terasa responsif.
 */

// Urutan = jumlah jari terbuka (0 → 5). Pola jari: [jempol, telunjuk, tengah, manis, kelingking].
// Jempol hanya "naik" di gerakan yang memang mensyaratkannya (lihat GestureClassifier.js).
export const GESTURES = [
  {
    id: "fist",
    shape: "planet",
    label: "Kepalan",
    result: "Planet",
    fingers: [0, 0, 0, 0, 0],
    accent: "#b89eff",
  },
  {
    id: "pointing",
    shape: "butterfly",
    label: "Telunjuk",
    result: "Kupu-kupu",
    fingers: [0, 1, 0, 0, 0],
    accent: "#d08bff",
  },
  {
    id: "peace",
    shape: "text",
    label: "Dua jari",
    result: "Pesan untukmu",
    fingers: [0, 1, 1, 0, 0],
    accent: "#ffd99a",
  },
  {
    id: "threeFingers",
    shape: "flower",
    label: "Tiga jari",
    result: "Buket mawar",
    fingers: [0, 1, 1, 1, 0],
    accent: "#ff5468",
  },
  {
    id: "iloveyou",
    shape: "heart",
    label: "Isyarat I love you",
    result: "Hati",
    fingers: [1, 1, 0, 0, 1],
    accent: "#ff4d7d",
  },
  {
    id: "open",
    shape: "scatter",
    label: "Lima jari",
    result: "Taburan partikel",
    fingers: [1, 1, 1, 1, 1],
    accent: "#4de1ff",
  },
];

const BY_SHAPE = Object.fromEntries(GESTURES.map((g) => [g.shape, g]));
const HIDE_DELAY_MS = 450;
const SEEN_KEY = "particle-hand.guide-seen";

function fingersMarkup(fingers) {
  return `<span class="fingers" aria-hidden="true">${fingers
    .map((up) => `<i${up ? ' class="up"' : ""}></i>`)
    .join("")}</span>`;
}

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* mode privat / storage diblokir: panduan akan muncul lagi, tidak masalah */
  }
}

export class CameraHud {
  /** @param {HTMLElement} root elemen #camera-hud */
  constructor(root) {
    this.root = root;
    this.shapeEl = root.querySelector("[data-cam-shape]");
    this.hintEl = root.querySelector("[data-cam-hint]");
    this.glyphEl = root.querySelector("[data-cam-glyph]");
    this.guideEl = root.querySelector("[data-cam-guide]");
    this.listEl = root.querySelector("[data-cam-list]");
    this.toggleEl = root.querySelector("[data-cam-toggle]");

    this.handVisible = null;
    this._hideTimer = 0;
    this.shape = null;

    this.listEl.innerHTML = GESTURES.map(
      (g) => `
        <li class="guide__row" data-shape="${g.shape}" style="--row-accent:${g.accent}">
          ${fingersMarkup(g.fingers)}
          <span class="guide__gesture">${g.label}</span>
          <span class="guide__result">${g.result}</span>
        </li>`,
    ).join("");

    this.toggleEl.addEventListener("click", () =>
      this.setGuideOpen(!this.guideOpen),
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.guideOpen) {
        this.setGuideOpen(false);
        this.toggleEl.focus();
      }
    });

    this.setGuideOpen(false);
    this.setShape("planet"); // bentuk awal ParticleSystem
  }

  /** Dipanggil setelah kamera & model siap. Panduan dibuka otomatis pada kunjungan pertama. */
  ready() {
    this.root.dataset.state = "ready";
    this._applyPresence(false);
    if (!readSeen()) this.setGuideOpen(true);
  }

  /** Kamera atau model gagal. Keterangan menjelaskan apa yang terjadi dan cara memperbaikinya. */
  error(title, hint) {
    clearTimeout(this._hideTimer);
    this.root.dataset.state = "error";
    this.root.dataset.presence = "none";
    this.shapeEl.textContent = title;
    this.hintEl.textContent = hint;
  }

  setShape(shape) {
    const g = BY_SHAPE[shape];
    if (!g || shape === this.shape) return;
    this.shape = shape;
    this.root.style.setProperty("--cam-accent", g.accent);
    this.shapeEl.textContent = g.result;
    this.glyphEl.innerHTML = fingersMarkup(g.fingers);
    this.glyphEl.setAttribute("aria-label", g.label);
    this.listEl.querySelectorAll(".guide__row").forEach((row) => {
      if (row.dataset.shape === shape) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    });
  }

  /** Dipanggil tiap frame; DOM hanya disentuh saat status benar-benar berubah. */
  setHandVisible(visible) {
    if (this.root.dataset.state !== "ready") return;
    if (visible) {
      clearTimeout(this._hideTimer);
      this._hideTimer = 0;
      if (this.handVisible !== true) this._applyPresence(true);
    } else if (this.handVisible !== false && !this._hideTimer) {
      this._hideTimer = setTimeout(() => {
        this._hideTimer = 0;
        this._applyPresence(false);
      }, HIDE_DELAY_MS);
    }
  }

  _applyPresence(visible) {
    this.handVisible = visible;
    this.root.dataset.presence = visible ? "hand" : "none";
    this.hintEl.textContent = visible
      ? "Tangan terbaca"
      : "Arahkan tangan ke kamera";
  }

  setGuideOpen(open) {
    this.guideOpen = open;
    this.root.dataset.guide = open ? "open" : "closed";
    this.guideEl.inert = !open;
    this.guideEl.setAttribute("aria-hidden", String(!open));
    this.toggleEl.setAttribute("aria-expanded", String(open));
    this.toggleEl.querySelector("[data-cam-toggle-label]").textContent = open
      ? "Tutup"
      : "Gerakan";
    if (!open && this.root.dataset.state === "ready") writeSeen();
  }
}
