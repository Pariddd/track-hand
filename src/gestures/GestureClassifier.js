import * as THREE from "three";

/**
 * GestureClassifier.js
 *
 * KEPUTUSAN DESAIN: deteksi "jari terbuka/tertekuk" pakai SUDUT antar 3 joint berurutan
 * (MCP -> PIP -> TIP), BUKAN jarak Euclidean tip-ke-wrist.
 *
 * Alasan: jarak tip-ke-wrist sangat sensitif terhadap ORIENTASI tangan relatif kamera —
 * jari yang lurus tapi menghadap kamera (foreshortening) akan punya jarak tip-wrist pendek
 * walau sebenarnya terbuka penuh, menyebabkan false negative saat tangan diputar.
 * Sudut antar joint jauh lebih invariant terhadap rotasi tangan karena murni mengukur
 * kelengkungan sendi, independen dari sudut pandang kamera (dengan asumsi landmark 3D valid).
 */

const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function toVec3(lm, i, out) {
  return out.set(lm[i].x, lm[i].y, lm[i].z);
}

/**
 * Hitung sudut (derajat) di titik tengah b, antara segmen a-b dan b-c.
 * Sudut mendekati 180° = jari lurus (terbuka). Sudut kecil = jari tertekuk.
 */
function jointAngleDeg(lm, iA, iB, iC) {
  toVec3(lm, iA, _a);
  toVec3(lm, iB, _b);
  toVec3(lm, iC, _c);
  _v1.subVectors(_a, _b).normalize();
  _v2.subVectors(_c, _b).normalize();
  const dot = THREE.MathUtils.clamp(_v1.dot(_v2), -1, 1);
  return THREE.MathUtils.radToDeg(Math.acos(dot));
}

// Threshold: jari dianggap "terbuka/lurus" jika sudut PIP > 150°, "tertekuk" jika < 100°.
// Gap 100-150° sengaja dibiarkan sebagai zona ambigu untuk mengurangi flicker di boundary.
const STRAIGHT_THRESHOLD = 150;
const BENT_THRESHOLD = 100;

function fingerState(lm, mcp, pip, dip) {
  const angle = jointAngleDeg(lm, mcp, pip, dip);
  if (angle > STRAIGHT_THRESHOLD) return "open";
  if (angle < BENT_THRESHOLD) return "closed";
  return "ambiguous";
}

/**
 * @param {Array} landmarks - 21 landmark MediaPipe untuk satu tangan
 * @returns {string} salah satu dari: 'fist', 'peace', 'iloveyou', 'open', 'threeFingers', 'none'
 */
export function classifyGesture(landmarks) {
  const lm = landmarks;

  const thumb = fingerState(
    lm,
    LANDMARK.THUMB_MCP,
    LANDMARK.THUMB_IP,
    LANDMARK.THUMB_TIP,
  );
  const index = fingerState(
    lm,
    LANDMARK.INDEX_MCP,
    LANDMARK.INDEX_PIP,
    LANDMARK.INDEX_DIP,
  );
  const middle = fingerState(
    lm,
    LANDMARK.MIDDLE_MCP,
    LANDMARK.MIDDLE_PIP,
    LANDMARK.MIDDLE_DIP,
  );
  const ring = fingerState(
    lm,
    LANDMARK.RING_MCP,
    LANDMARK.RING_PIP,
    LANDMARK.RING_DIP,
  );
  const pinky = fingerState(
    lm,
    LANDMARK.PINKY_MCP,
    LANDMARK.PINKY_PIP,
    LANDMARK.PINKY_DIP,
  );

  // FIST: semua jari (kecuali ibu jari, yang topologinya beda) tertekuk penuh
  if (
    index === "closed" &&
    middle === "closed" &&
    ring === "closed" &&
    pinky === "closed"
  ) {
    return "fist";
  }

  // OPEN HAND (lima jari terbuka / telapak terbuka penuh): index+middle+ring+pinky terbuka.
  // Ibu jari SENGAJA tidak dijadikan syarat wajib (alasan sama seperti PEACE di bawah) —
  // adduksi/abduksi ibu jari saat telapak terbuka penuh bervariasi cukup besar antar orang
  // tergantung sudut kamera & fleksibilitas sendi CMC, jadi mensyaratkan thumb === 'open'
  // di sini hanya menaikkan false negative tanpa menambah presisi berarti (4 jari lain sudah
  // cukup diskriminatif). Precedence: dicek SETELAH fist (mutually exclusive: fist butuh index
  // closed) dan SEBELUM peace/iloveyou (keduanya mensyaratkan ring === 'closed', jadi tidak akan
  // pernah bentrok logis dengan cabang ini).
  if (
    index === "open" &&
    middle === "open" &&
    ring === "open" &&
    pinky === "open"
  ) {
    return "open";
  }

  // THREE FINGERS (tiga jari): index + middle + ring terbuka, pinky tertekuk. Ibu jari diabaikan
  // (variasi natural antar orang). Tidak overlap dengan OPEN (butuh pinky open) maupun PEACE
  // (butuh ring closed), jadi aman tanpa exclusion tambahan.
  if (
    index === "open" &&
    middle === "open" &&
    ring === "open" &&
    pinky === "closed"
  ) {
    return "threeFingers";
  }

  // PEACE (dua jari): index + middle terbuka, ring + pinky tertekuk. Ibu jari diabaikan
  // (tidak dipakai sebagai syarat) karena posisi natural ibu jari saat peace sign bervariasi antar orang.
  if (
    index === "open" &&
    middle === "open" &&
    ring === "closed" &&
    pinky === "closed"
  ) {
    return "peace";
  }

  if (
    index === "open" &&
    middle === "closed" &&
    ring === "closed" &&
    pinky === "closed"
  ) {
    return "pointing";
  }

  // I LOVE YOU (ASL sign): thumb + index + pinky terbuka, middle + ring tertekuk.
  if (
    thumb === "open" &&
    index === "open" &&
    pinky === "open" &&
    middle === "closed" &&
    ring === "closed"
  ) {
    return "iloveyou";
  }

  return "none";
}
