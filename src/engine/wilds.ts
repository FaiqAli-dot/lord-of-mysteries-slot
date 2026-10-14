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

export function applyGrafting(
  grid: Grid,
  reel: number,
  symbol: SymbolId,
): Grid {
  const next = cloneGrid(grid);
  for (let row = 0; row < next[reel]!.length; row++) {
    // Never overwrite scatters — grafting cannot create/bypass scatter triggers.
    if (next[reel]![row] !== 'SCATTER') {
      next[reel]![row] = symbol;
    }
  }
  return next;
}
