/**
 * Subtle original Web Audio tones — no external audio files required.
 * Soft chime on spin / win; respects mute and reduced motion preferences.
 */
export class SoftAudio {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.03): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  spin(): void {
    this.tone(180, 0.12, 'sine', 0.025);
  }

  win(small: boolean): void {
    if (small) {
      this.tone(440, 0.15, 'triangle', 0.03);
    } else {
      this.tone(523, 0.12, 'triangle', 0.03);
      setTimeout(() => this.tone(659, 0.18, 'triangle', 0.028), 80);
    }
  }

  bonus(): void {
    this.tone(260, 0.2, 'sine', 0.035);
    setTimeout(() => this.tone(330, 0.25, 'sine', 0.03), 100);
  }

  click(): void {
    this.tone(520, 0.05, 'square', 0.015);
  }
}
