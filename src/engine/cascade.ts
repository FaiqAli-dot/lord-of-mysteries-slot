import { GAME_CONFIG, type SymbolId } from '../config/gameConfig';
import type { Grid, LineWin, ScatterWin } from './types';
import { cloneGrid } from './reels';
import { evaluateAllLines, evaluateScatter } from './paylines';
import type { SeededRng } from './rng';
import { REEL_STRIPS } from '../config/gameConfig';

export interface CascadeStep {
  stepIndex: number;
  multiplier: number;
  gridBefore: Grid;
  gridAfterRemove: Grid;
  gridAfterDrop: Grid;
  lineWins: LineWin[];
  scatterWin: ScatterWin | null;
  /** Credits for this step after cascade multiplier (before Sequence). */
  stepCredits: number;
}

/**
 * Avalanche / cascade for Crimson Moon:
 * Winning symbols explode → remaining drop down → new symbols fall in.
 * Multiplier progression: 1x → 2x → 4x → 8x → 16x across consecutive cascades.
 */
export function resolveCascades(
  initialGrid: Grid,
  totalBet: number,
  expandedReels: ReadonlySet<number>,
  rng: SeededRng,
  multipliers: readonly number[] = GAME_CONFIG.bonuses.crimsonMoon.cascadeMultipliers,
): {
  finalGrid: Grid;
  steps: CascadeStep[];
  totalCredits: number;
  lineWins: LineWin[];
  scatterWin: ScatterWin | null;
} {
  let grid = cloneGrid(initialGrid);
  const steps: CascadeStep[] = [];
  let totalCredits = 0;
  let lastLineWins: LineWin[] = [];
  let lastScatter: ScatterWin | null = null;

  for (let step = 0; step < multipliers.length; step++) {
    const mult = multipliers[step]!;
    const gridBefore = cloneGrid(grid);
    const lineWins = evaluateAllLines(grid, totalBet, expandedReels);
    // Scatter only pays on the first cascade step (standard avalanche convention).
    const scatterWin = step === 0 ? evaluateScatter(grid, totalBet) : null;

    if (lineWins.length === 0 && !scatterWin) break;

    lastLineWins = lineWins;
    if (scatterWin) lastScatter = scatterWin;

    const lineCredits = lineWins.reduce((s, w) => s + w.afterWildCredits, 0);
    const scatterCredits = scatterWin?.baseCredits ?? 0;
    const stepCredits = Math.floor((lineCredits + scatterCredits) * mult);
    totalCredits += stepCredits;

    // Remove winning line positions
    const remove = new Set<string>();
    for (const w of lineWins) {
      for (const p of w.positions) remove.add(`${p.reel}-${p.row}`);
    }

    const afterRemove = cloneGrid(grid);
    for (const key of remove) {
      const [rs, rows] = key.split('-');
      const reel = Number(rs);
      const row = Number(rows);
      afterRemove[reel]![row] = null as unknown as SymbolId;
    }

    // Drop remaining symbols down; fill from strips
    const afterDrop = dropAndFill(afterRemove, rng);

    steps.push({
      stepIndex: step,
      multiplier: mult,
      gridBefore,
      gridAfterRemove: afterRemove.map((reel) =>
        reel.map((s) => (s == null ? 'JACK' : s)),
      ),
      gridAfterDrop: afterDrop,
      lineWins,
      scatterWin,
      stepCredits,
    });

    grid = afterDrop;
  }

  return {
    finalGrid: grid,
    steps,
    totalCredits,
    lineWins: lastLineWins,
    scatterWin: lastScatter,
  };
}

function dropAndFill(grid: Grid, rng: SeededRng): Grid {
  const next: Grid = [];
  for (let r = 0; r < GAME_CONFIG.reels; r++) {
    const kept: SymbolId[] = [];
    for (let row = GAME_CONFIG.rows - 1; row >= 0; row--) {
      const s = grid[r]![row];
      if (s != null) kept.push(s);
    }
    // kept is bottom-up; pad from top with strip samples
    const strip = REEL_STRIPS[r]!;
    while (kept.length < GAME_CONFIG.rows) {
      kept.push(strip[rng.int(0, strip.length - 1)]!);
    }
    // Reverse back to top→bottom
    const column: SymbolId[] = [];
    for (let i = GAME_CONFIG.rows - 1; i >= 0; i--) {
      column.push(kept[i]!);
    }
    next.push(column);
  }
  return next;
}
