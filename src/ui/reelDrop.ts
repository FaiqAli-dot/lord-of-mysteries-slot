import gsap from 'gsap';
import type { Sprite } from 'pixi.js';
import reelDropConfig from './configs/reelDrop.json';

/** Maps to SF UIState.spinSpeedLevel + slam. */
export type DropMode = 'normal' | 'quick' | 'turbo' | 'slam';

export type ReelDropConfig = typeof reelDropConfig;
export const REEL_DROP: ReelDropConfig = reelDropConfig;

export type DropCell = {
  sprite: Sprite;
  homeX: number;
  homeY: number;
  reel: number;
  /** Row index: 0 = top */
  row: number;
};

/**
 * SF ReelView cell pitch: symbolWidth/Height = size + indent.
 * Fall distance Δy = rows * symbolHeight (one full grid).
 */
export function symbolPitch(cfg: ReelDropConfig = REEL_DROP): {
  symbolWidth: number;
  symbolHeight: number;
  rows: number;
  columns: number;
} {
  const reels = cfg.layout.reels;
  const s = reels.symbols;
  return {
    symbolWidth: s.width + s.indent,
    symbolHeight: s.height + s.indent,
    rows: s.count,
    columns: reels.count,
  };
}

/** Row/column stagger delays (SF DropReelModification). */
export function dropDelays(
  mode: DropMode,
  rows = REEL_DROP.layout.reels.symbols.count,
  skipping = false,
): {
  fallOut: number;
  fallIn: number;
  delayOut: (col: number, row: number) => number;
  delayIn: (row: number) => number;
} {
  const t = REEL_DROP.timings;
  const skipDelays = shouldSkipDelays(mode) || skipping;
  const fallOut = getSpinDuration(t.reelStartDuration, mode, skipping);
  const fallIn = getSpinDuration(t.reelStopDuration, mode, skipping);
  const dSymOut = (fallOut / rows) * t.reelStartSymbolsDelayCoefficient;
  const dSymIn = (fallIn / rows) * t.reelStopSymbolsDelayCoefficient;
  return {
    fallOut,
    fallIn,
    delayOut: (col, row) => (skipDelays ? 0 : t.reelStartDelay * col + (rows - row) * dSymOut),
    delayIn: (row) => (skipDelays ? 0 : (rows - row) * dSymIn),
  };
}

function mapEase(ease: string): string {
  // SF config uses "elastic(1,1)" → GSAP elastic.out(1, 1)
  if (ease === 'elastic(1,1)' || (ease.startsWith('elastic(') && !ease.includes('.out'))) {
    const inner = ease.replace(/^elastic\(/, '').replace(/\)$/, '');
    return `elastic.out(${inner})`;
  }
  return ease;
}

function speedLevel(mode: DropMode): 'normal' | 'fast' | 'very-fast' {
  if (mode === 'turbo' || mode === 'slam') return 'very-fast';
  if (mode === 'quick') return 'fast';
  return 'normal';
}

/** SF DropReelModification.getSpinDuration */
export function getSpinDuration(normalDuration: number, mode: DropMode, skipping = false): number {
  const sp = REEL_DROP.speed;
  if (skipping || mode === 'slam') return sp.skipDuration;
  const level = speedLevel(mode);
  if (level === 'very-fast') return Math.min(sp.veryFastDurationCap, normalDuration * sp.veryFastDurationScale);
  if (level === 'fast') return Math.min(sp.fastDurationCap, normalDuration * sp.fastDurationScale);
  return normalDuration;
}

export function shouldSkipDelays(mode: DropMode): boolean {
  return mode === 'turbo' || mode === 'slam';
}

/**
 * Per-column drop-out → texture swap → drop-in (SF Reelset.stopSpin Promise.all).
 * Δy = rows * H (one full grid). No alpha/scale. Drop-in has no column stagger.
 */
export function playReelDrop(opts: {
  cells: DropCell[];
  /** Step between row centers (= symbolHeight). */
  cellHeight: number;
  rows?: number;
  reels?: number;
  /** Apply outcome textures for one column only (called after that column’s drop-out). */
  applyColumnTextures: (reel: number) => void;
  mode?: DropMode;
  reducedMotion?: boolean;
  skipping?: boolean;
}): Promise<void> {
  const {
    cells,
    cellHeight: H,
    applyColumnTextures,
    mode = 'normal',
    reducedMotion = false,
    skipping = false,
  } = opts;
  const t = REEL_DROP.timings;
  const R = opts.rows ?? REEL_DROP.layout.reels.symbols.count;
  const C = opts.reels ?? REEL_DROP.layout.reels.count;

  for (const c of cells) gsap.killTweensOf(c.sprite);

  if (reducedMotion || cells.length === 0) {
    for (let col = 0; col < C; col++) applyColumnTextures(col);
    for (const c of cells) c.sprite.position.set(c.homeX, c.homeY);
    return Promise.resolve();
  }

  const { fallOut, fallIn, delayOut, delayIn } = dropDelays(mode, R, skipping);
  // Prefer stage pitch when provided; else SF formula height+indent from config.
  const pitchH = H > 0 ? H : symbolPitch().symbolHeight;
  const gridFall = pitchH * R;

  const byReel = new Map<number, DropCell[]>();
  for (const c of cells) {
    const list = byReel.get(c.reel) ?? [];
    list.push(c);
    byReel.set(c.reel, list);
  }

  const columnJobs: Promise<void>[] = [];
  for (let col = 0; col < C; col++) {
    const colCells = byReel.get(col);
    if (!colCells?.length) continue;

    columnJobs.push(
      new Promise<void>((resolveCol) => {
        const outTl = gsap.timeline({
          onComplete: () => {
            applyColumnTextures(col);
            for (const c of colCells) {
              c.sprite.y = c.homeY - gridFall;
            }
            const inTl = gsap.timeline({ onComplete: () => resolveCol() });
            for (const c of colCells) {
              inTl.fromTo(
                c.sprite,
                { y: c.homeY - gridFall },
                {
                  y: c.homeY,
                  duration: fallIn,
                  ease: mapEase(t.easeStop),
                  delay: delayIn(c.row),
                },
                0,
              );
            }
          },
        });

        for (const c of colCells) {
          outTl.to(
            c.sprite,
            {
              y: c.homeY + gridFall,
              duration: fallOut,
              ease: mapEase(t.easeStart),
            },
            delayOut(col, c.row),
          );
        }
      }),
    );
  }

  return Promise.all(columnJobs).then(() => undefined);
}
