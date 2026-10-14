import gsap from 'gsap';
import type { Sprite } from 'pixi.js';
import reelDropConfig from './configs/reelDrop.json';

export type DropMode = 'normal' | 'quick' | 'turbo' | 'slam';

export type ReelDropConfig = typeof reelDropConfig;

export const REEL_DROP: ReelDropConfig = reelDropConfig;

export type DropCell = {
  sprite: Sprite;
  homeX: number;
  homeY: number;
  reel: number;
  row: number;
};

function mapEase(ease: string): string {
  // Config may say elastic(1,1); GSAP wants elastic.out(1,1)
  if (ease.startsWith('elastic(')) return `elastic.out${ease.slice('elastic'.length)}`;
  if (ease === 'elastic.out(1,1)') return ease;
  return ease;
}

/**
 * Space Fortune–style drop-out / drop-in (visual only).
 * Timings come from `configs/reelDrop.json` so REEL_DROP_ANIMATION.md can retune without code churn.
 */
export function playReelDrop(opts: {
  cells: DropCell[];
  cellHeight: number;
  applyTextures: () => void;
  mode?: DropMode;
  reducedMotion?: boolean;
}): Promise<void> {
  const { cells, cellHeight, applyTextures, mode = 'normal', reducedMotion = false } = opts;
  const cfg = REEL_DROP;

  for (const c of cells) gsap.killTweensOf(c.sprite);

  if (reducedMotion || cells.length === 0) {
    for (const c of cells) {
      c.sprite.position.set(c.homeX, c.homeY);
      c.sprite.alpha = 1;
    }
    applyTextures();
    return Promise.resolve();
  }

  const turbo = mode === 'turbo' || mode === 'slam';
  const quick = mode === 'quick';

  let outDur = cfg.dropOut.duration;
  let inDur = cfg.dropIn.duration;
  let colStagger = cfg.dropOut.staggerPerColumn;

  if (quick && cfg.quickSpin.keepStagger) {
    outDur *= cfg.quickSpin.durationScale;
    inDur *= cfg.quickSpin.durationScale;
  }
  if (turbo && cfg.turboOrSlam.zeroStagger) {
    colStagger = 0;
    outDur = Math.min(outDur, cfg.turboOrSlam.clampDuration);
    inDur = Math.min(inDur, cfg.turboOrSlam.clampDuration);
  }

  const dist = cellHeight * cfg.dropOut.distanceInCellHeights;
  const rows = cfg.grid.rows;

  // Stagger: bottom row first → top last; +staggerPerColumn per reel
  const delayFor = (reel: number, row: number): number => {
    const rowFromBottom = cfg.stagger.rowOrder === 'bottom-first' ? rows - 1 - row : row;
    return reel * colStagger + rowFromBottom * colStagger * (cfg.stagger.rowStaggerScale ?? 1) * cfg.dropOut.coeff;
  };
  const delayIn = (reel: number, row: number): number => {
    const rowFromBottom = cfg.stagger.rowOrder === 'bottom-first' ? rows - 1 - row : row;
    return reel * colStagger + rowFromBottom * colStagger * (cfg.stagger.rowStaggerScale ?? 1) * cfg.dropIn.coeff;
  };

  return new Promise((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => resolve(),
    });

    // Phase 1: drop out (fall one cell height down)
    for (const c of cells) {
      tl.to(
        c.sprite,
        {
          y: c.homeY + dist,
          alpha: 0,
          duration: outDur,
          ease: mapEase(cfg.dropOut.ease),
        },
        delayFor(c.reel, c.row),
      );
    }

    // Swap textures at mid-point after longest drop-out
    const outEnd =
      outDur +
      (cfg.grid.reels - 1) * colStagger +
      (rows - 1) * colStagger * (cfg.dropOut.coeff || 0.5);
    tl.call(
      () => {
        applyTextures();
        for (const c of cells) {
          c.sprite.y = c.homeY - dist;
          c.sprite.alpha = 0;
        }
      },
      undefined,
      Math.max(outDur, outEnd * 0.85),
    );

    // Phase 2: drop in from above
    const inStart = Math.max(outDur, outEnd * 0.85);
    for (const c of cells) {
      tl.to(
        c.sprite,
        {
          y: c.homeY,
          alpha: 1,
          duration: inDur,
          ease: mapEase(cfg.dropIn.ease),
        },
        inStart + delayIn(c.reel, c.row),
      );
    }
  });
}
