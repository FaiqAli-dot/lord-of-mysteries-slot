import { GAME_CONFIG, type SymbolId } from '../config/gameConfig';
import type { Grid } from './types';
import { cloneGrid } from './reels';

/**
 * Fool's Mirror expansion:
 * When expandWhenPresent is true and a reel contains ≥1 WILD, the entire reel
 * becomes WILD for evaluation (temporary grid copy). Configurable.
 * Expansion does not create Scatters and does not replace Scatter cells —
 * Scatter cells on an expanding reel are preserved (cannot expand over Scatter).
 */
export function applyWildExpansion(grid: Grid): {
  grid: Grid;
  expandedReels: number[];
} {
  if (!GAME_CONFIG.wild.expandWhenPresent) {
    return { grid: cloneGrid(grid), expandedReels: [] };
  }

  const next = cloneGrid(grid);
  const expandedReels: number[] = [];

  for (let r = 0; r < next.length; r++) {
    const reel = next[r]!;
    const hasWild = reel.some((s) => s === 'WILD');
    const hasScatter = reel.some((s) => s === 'SCATTER');
    // Expand only if wild present and no scatter on that reel (preserve scatter integrity).
    if (hasWild && !hasScatter) {
      for (let row = 0; row < reel.length; row++) {
        const s = reel[row]!;
        if (s !== 'SEQUENCE' && s !== 'SPIRIT') {
          reel[row] = 'WILD';
        }
      }
      expandedReels.push(r);
    }
  }

  return { grid: next, expandedReels };
}

/** Apply Locked Wild positions onto the grid (before evaluation). */
export function applyLockedWilds(
  grid: Grid,
  locked: { reel: number; row: number }[],
): Grid {
  const next = cloneGrid(grid);
  for (const lw of locked) {
    const cell = next[lw.reel]?.[lw.row];
    if (cell && cell !== 'SCATTER') {
      next[lw.reel]![lw.row] = 'WILD';
    }
  }
  return next;
}

export function applyGlove(
  grid: Grid,
  reel: number,
  row: number,
): Grid {
  const next = cloneGrid(grid);
  const s = next[reel]?.[row];
  if (!s) return next;
  if ((GAME_CONFIG.spirituality.glove.cannotTransform as readonly SymbolId[]).includes(s)) {
    return next;
  }
  next[reel]![row] = 'WILD';
  return next;
}

/**
 * Grafting step 1: ensure exactly one seed Wild exists (prefer a natural Wild).
 * Returns the seed position and whether we had to place it.
 */
export function ensureGraftSeed(
  grid: Grid,
  seed: { reel: number; row: number },
): { grid: Grid; seed: { reel: number; row: number }; placed: boolean } {
  const next = cloneGrid(grid);
  const wasWild = next[seed.reel]![seed.row] === 'WILD';
  if (!wasWild) next[seed.reel]![seed.row] = 'WILD';
  return { grid: next, seed, placed: !wasWild };
}

/**
 * Grafting step 2: seed Wild spreads — neighboring cells become WILD.
 * Seed itself is already Wild; only neighbors are listed in `transformed`.
 */
export function applyGrafting(
  grid: Grid,
  seed: { reel: number; row: number },
): { grid: Grid; transformed: { reel: number; row: number }[] } {
  const cfg = GAME_CONFIG.spirituality.grafting;
  const blocked = new Set(cfg.cannotTransform as readonly SymbolId[]);
  const next = cloneGrid(grid);
  // Seed must be Wild before spread
  if (next[seed.reel]?.[seed.row] && next[seed.reel]![seed.row] !== 'SCATTER') {
    next[seed.reel]![seed.row] = 'WILD';
  }
  const transformed: { reel: number; row: number }[] = [];

  const offsets: { dr: number; drow: number }[] = [];
  if (cfg.orthogonal) {
    offsets.push(
      { dr: -1, drow: 0 },
      { dr: 1, drow: 0 },
      { dr: 0, drow: -1 },
      { dr: 0, drow: 1 },
    );
  }
  if (cfg.diagonals) {
    offsets.push(
      { dr: -1, drow: -1 },
      { dr: -1, drow: 1 },
      { dr: 1, drow: -1 },
      { dr: 1, drow: 1 },
    );
  }

  for (const { dr, drow } of offsets) {
    const reel = seed.reel + dr;
    const row = seed.row + drow;
    if (reel < 0 || reel >= next.length) continue;
    if (row < 0 || row >= next[reel]!.length) continue;
    const s = next[reel]![row]!;
    if (blocked.has(s)) continue;
    if (s === 'WILD') continue;
    next[reel]![row] = 'WILD';
    transformed.push({ reel, row });
  }

  return { grid: next, transformed };
}
