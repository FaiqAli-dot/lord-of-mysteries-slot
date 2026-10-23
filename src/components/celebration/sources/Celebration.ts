import type { PixiStage } from '../../reelset/sources/Reelset';

/** Thin wrapper so celebration lives as its own SF-style feature package. */
export class Celebration {
  constructor(private stage: PixiStage) {}

  play(amount: number): void {
    this.stage.showWinCelebration(amount);
  }
}
