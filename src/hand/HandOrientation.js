import * as THREE from "three";

/**
 * HandOrientation.js
 *
 * MediaPipe HandLandmarker TIDAK menyediakan quaternion rotasi tangan secara langsung.
 * Ia hanya memberi 21 landmark posisi (x,y,z normalized, z relatif terhadap wrist).
 * Rotasi harus diturunkan manual dari basis vector antar landmark.
 *
 * GAP TEKNIS YANG PERLU DISADARI (bukan bug, ini limitasi data):
 * - Akurasi x/y landmark cukup baik (dilatih di ribuan gambar 2D).
 * - Akurasi z (depth) jauh lebih noisy karena diestimasi, bukan diukur langsung.
 * - Akibatnya: rotasi pitch & yaw (miring depan-belakang, kiri-kanan) relatif stabil,
 *   tapi rotasi ROLL (memutar sepanjang sumbu lengan) akan terasa lebih jitter,
 *   terutama pada delegate CPU dengan confidence lebih rendah.
 * - One Euro Filter di layer atas mengurangi ini, tapi tidak menghilangkan sepenuhnya.
 *   Kalau butuh roll yang sangat presisi, satu-satunya solusi nyata adalah sensor IMU
 *   tambahan (di luar scope computer-vision-only project ini).
 *
 * Landmark index yang dipakai (MediaPipe Hand topology):
 * 0  = wrist
 * 5  = index_finger_mcp
 * 9  = middle_finger_mcp
 * 17 = pinky_mcp
 */

const _wrist = new THREE.Vector3();
const _middleMcp = new THREE.Vector3();
const _indexMcp = new THREE.Vector3();
const _pinkyMcp = new THREE.Vector3();

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const _matrix = new THREE.Matrix4();

/**
 * @param {Array} landmarks - array 21 landmark dari MediaPipe (masing2 {x,y,z} normalized 0-1)
 * @param {THREE.Quaternion} outQuat - quaternion output (di-mutate in-place untuk hindari alokasi tiap frame)
 */
export function computeHandOrientation(landmarks, outQuat) {
  // Konversi landmark normalized MediaPipe (y-down, seperti koordinat image)
  // ke ruang yang konsisten dengan Three.js (y-up) dengan flip sumbu Y dan Z.
  // X JUGA di-flip (mirror) di sini agar KONSISTEN dengan mirroring posisi di main.js
  // (mappedTargetPos.x = (0.5 - raw.x) * 6). Sebelumnya X tidak di-flip di sini, sehingga
  // posisi anchor berada di ruang koordinat X-mirrored sementara rotasinya dihitung dari
  // ruang koordinat X-asli (un-mirrored) — dua basis X yang tidak sinkron. Untuk shape
  // simetris (planet, heart) ini tidak kelihatan, tapi untuk shape asimetris seperti teks
  // ("I LOVE U" harus terbaca kiri-ke-kanan yang benar), mismatch ini membuat teks
  // terlihat seperti cermin/terbalik saat tangan diputar.
  _wrist.set(-landmarks[0].x, -landmarks[0].y, -landmarks[0].z);
  _middleMcp.set(-landmarks[9].x, -landmarks[9].y, -landmarks[9].z);
  _indexMcp.set(-landmarks[5].x, -landmarks[5].y, -landmarks[5].z);
  _pinkyMcp.set(-landmarks[17].x, -landmarks[17].y, -landmarks[17].z);

  // forward: dari wrist menuju pangkal jari tengah -> arah "telapak menghadap ke depan"
  _forward.subVectors(_middleMcp, _wrist).normalize();

  // right: dari pinky_mcp ke index_mcp (across the palm)
  _right.subVectors(_pinkyMcp, _indexMcp).normalize();
  // up: cross(right, forward) untuk dapat basis tegak lurus
  _up.crossVectors(_right, _forward).normalize();

  // Re-orthogonalize right agar basis benar2 orthonormal (right, forward tidak selalu tegak lurus persis)
  _right.crossVectors(_forward, _up).normalize();

  // Guard: kalau basis degenerate (misal tangan hampir sejajar kamera, cross product ~0),
  // jangan update quaternion, biarkan nilai filter sebelumnya dipertahankan.
  if (_up.lengthSq() < 1e-6 || _right.lengthSq() < 1e-6) {
    return false;
  }

  _matrix.makeBasis(_right, _up, _forward);
  outQuat.setFromRotationMatrix(_matrix);
  return true;
}

/**
 * Estimasi posisi pusat telapak tangan (bukan wrist) untuk anchor object 3D,
 * karena wrist saja terasa kurang natural sebagai titik tengah efek visual.
 */
export function computePalmCenter(landmarks, outVec3) {
  // Rata-rata wrist + semua *_mcp (pangkal jari) sebagai estimasi pusat telapak
  const indices = [0, 5, 9, 13, 17];
  let x = 0,
    y = 0,
    z = 0;
  for (const i of indices) {
    x += landmarks[i].x;
    y += landmarks[i].y;
    z += landmarks[i].z;
  }
  const n = indices.length;
  outVec3.set(x / n, y / n, z / n);
  return outVec3;
}
