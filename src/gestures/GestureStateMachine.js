import { Config } from '../utils/Config.js';

/**
 * GestureStateMachine.js
 *
 * Tanpa debounce, gesture yang borderline (misal jari setengah tertekuk karena
 * hasil klasifikasi ada di zona 'ambiguous') akan menyebabkan output classifier
 * flicker antar label tiap frame, memicu morph animation re-trigger berkali-kali.
 *
 * Solusi: gesture baru hanya dianggap VALID dan men-trigger event 'change' setelah
 * terdeteksi konsisten selama CONFIRM_FRAMES frame berturut-turut. Sekali confirmed,
 * state tidak berubah lagi sampai ada gesture BEDA yang juga bertahan CONFIRM_FRAMES.
 *
 * Ini murni state machine berbasis counter, bukan hidden Markov / probabilistic —
 * cukup untuk kasus ini karena confidence classifier sendiri sudah threshold-based.
 */
export class GestureStateMachine {
  constructor(onChange) {
    this.currentState = 'none'; // state yang sudah confirmed & aktif
    this.candidateState = 'none';
    this.candidateCount = 0;
    this.onChange = onChange; // callback(newState, prevState)
  }

  /**
   * @param {string} rawGesture - hasil mentah dari classifyGesture() frame ini
   */
  update(rawGesture) {
    if (rawGesture === this.candidateState) {
      this.candidateCount += 1;
    } else {
      this.candidateState = rawGesture;
      this.candidateCount = 1;
    }

    if (
      this.candidateCount >= Config.gesture.CONFIRM_FRAMES &&
      this.candidateState !== this.currentState
    ) {
      const prev = this.currentState;
      this.currentState = this.candidateState;
      if (this.onChange) this.onChange(this.currentState, prev);
    }

    return this.currentState;
  }
}
