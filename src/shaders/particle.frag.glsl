// particle.frag.glsl
//
// Soft circular falloff (bukan hard square point default WebGL) supaya partikel
// terlihat seperti titik cahaya lembut, bukan kotak pixelated — penting untuk
// kesan "glow" sebelum masuk ke UnrealBloomPass.

varying float vAlpha;
varying vec3 vColor;

void main() {
  // gl_PointCoord: koordinat 0-1 dalam quad point. Hitung jarak dari pusat.
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);

  // Soft falloff dengan kernel gaussian-ish, dan discard di luar radius agar tidak ada
  // artefak kotak tajam di tepi quad point.
  if (dist > 0.5) discard;

  float falloff = smoothstep(0.5, 0.0, dist);
  float glow = pow(falloff, 1.8); // exponent > 1 -> inti lebih terang, tepi lebih lembut

  gl_FragColor = vec4(vColor, glow * vAlpha);
}
