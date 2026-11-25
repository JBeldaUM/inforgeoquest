// Lightweight Web Audio API sound effects (no external audio files required)
(function () {
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    ensureContext() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    tone(freq, duration = 0.14, type = 'triangle', volume = 0.14, delay = 0) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playerJoin() {
      this.tone(523.25, 0.09, 'sine', 0.12, 0);
      this.tone(659.25, 0.12, 'sine', 0.12, 0.07);
    }

    countdownTick(urgent = false) {
      this.tone(urgent ? 880 : 620, 0.07, 'square', 0.06, 0);
    }

    questionReveal() {
      this.tone(392, 0.12, 'triangle', 0.14, 0);
      this.tone(523.25, 0.18, 'triangle', 0.16, 0.1);
    }

    timeUp() {
      this.tone(587.33, 0.14, 'triangle', 0.16, 0);
      this.tone(440, 0.25, 'triangle', 0.16, 0.12);
    }

    correct() {
      this.tone(523.25, 0.1, 'triangle', 0.16, 0);
      this.tone(659.25, 0.1, 'triangle', 0.16, 0.08);
      this.tone(783.99, 0.22, 'triangle', 0.18, 0.16);
    }

    wrong() {
      this.tone(280, 0.14, 'sawtooth', 0.1, 0);
      this.tone(210, 0.22, 'sawtooth', 0.1, 0.12);
    }

    podiumFanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => {
        this.tone(n, 0.22, 'triangle', 0.18, i * 0.12);
      });
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }
  }

  window.soundEngine = new SoundEngine();
})();
