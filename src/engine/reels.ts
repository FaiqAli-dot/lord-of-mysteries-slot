import { GAME_CONFIG, REEL_STRIPS, type SymbolId } from '../config/gameConfig';
import type { Grid } from './types';
import type { SeededRng } from './rng';

export function emptyGrid(): Grid {
  return Array.from({ length: GAME_CONFIG.reels }, () =>
    Array.from({ length: GAME_CONFIG.rows }, () => 'JACK' as SymbolId),
  );
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((reel) => [...reel]);
}

/** Generate a 5x4 grid from reel strips using seeded stops. */
export function spinReels(rng: SeededRng, strips: SymbolId[][] = REEL_STRIPS): Grid {
  const grid: Grid = [];
  for (let r = 0; r < GAME_CONFIG.reels; r++) {
    const strip = strips[r]!;
    const stop = rng.int(0, strip.length - 1);
    const column: SymbolId[] = [];
    for (let row = 0; row < GAME_CONFIG.rows; row++) {
      column.push(strip[(stop + row) % strip.length]!);
    }
    grid.push(column);
  }
  return grid;
}

/** Respin only non-preserved positions (Creeping Hunger). */
export function respinEligible(
  grid: Grid,
  preserveMask: boolean[][],
  rng: SeededRng,
  strips: SymbolId[][] = REEL_STRIPS,
): Grid {
  const next = cloneGrid(grid);
  for (let r = 0; r < GAME_CONFIG.reels; r++) {
    for (let row = 0; row < GAME_CONFIG.rows; row++) {
      if (!preserveMask[r]![row]) {
        const strip = strips[r]!;
        next[r]![row] = strip[rng.int(0, strip.length - 1)]!;
      }
    }
  }
  return next;
}

export function countSymbol(grid: Grid, id: SymbolId): number {
  let n = 0;
  for (const reel of grid) for (const s of reel) if (s === id) n++;
  return n;
}

export function findPositions(grid: Grid, id: SymbolId): { reel: number; row: number }[] {
  const out: { reel: number; row: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let row = 0; row < grid[r]!.length; row++) {
      if (grid[r]![row] === id) out.push({ reel: r, row });
    }
  }
  return out;
}
