/**
 * VideoStream.js
 * Wrapper getUserMedia. Menangani permission error secara eksplisit
 * karena ini adalah salah satu kegagalan paling umum di deployment nyata
 * (HTTP non-secure context, browser tanpa kamera, permission ditolak user).
 */

export class VideoStream {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'getUserMedia tidak tersedia. Pastikan halaman diakses via HTTPS atau localhost.'
      );
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        // frameRate ideal 30 cukup untuk hand tracking; tidak perlu 60 di source video
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    this.video.srcObject = this.stream;

    // Tunggu metadata siap agar videoWidth/videoHeight valid sebelum dipakai HandLandmarker
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });

    return this.video;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
