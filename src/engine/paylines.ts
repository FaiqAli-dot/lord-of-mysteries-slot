import {
  GAME_CONFIG,
  PAYLINES,
  SYMBOLS,
  SCATTER_PAYS,
  type SymbolId,
} from '../config/gameConfig';
import type { Grid, LineWin, ScatterWin } from './types';

function isWild(s: SymbolId): boolean {
  return SYMBOLS[s].isWild === true;
}

function canSubstitute(wild: SymbolId, target: SymbolId): boolean {
  if (!isWild(wild)) return false;
  return !(GAME_CONFIG.wild.cannotSubstitute as readonly SymbolId[]).includes(target);
}

/**
 * Evaluate one payline left-to-right.
 * Wilds substitute for paying symbols; never for Scatter/Sequence/Spirit.
 * Award longest match of a single paying symbol (≥3).
 * SEQUENCE / SPIRIT / SCATTER break the line for paying purposes.
 */
export function evaluateLine(
  grid: Grid,
  lineIndex: number,
  lineBet: number,
  expandedWildReels: ReadonlySet<number>,
): LineWin | null {
  const pattern = PAYLINES[lineIndex]!;
  const cells: { reel: number; row: number; symbol: SymbolId }[] = [];
  for (let reel = 0; reel < GAME_CONFIG.reels; reel++) {
    const row = pattern[reel]!;
    cells.push({ reel, row, symbol: grid[reel]![row]! });
  }

  // Determine target paying symbol from first non-wild paying cell.
  let target: SymbolId | null = null;
  for (const c of cells) {
    const def = SYMBOLS[c.symbol];
    if (def.isScatter || def.isSequenceMarker || def.isSpirit) break;
    if (isWild(c.symbol)) continue;
    if (def.tier === 'high' || def.tier === 'low') {
      target = c.symbol;
      break;
    }
    break;
  }

  // All wilds with no paying symbol → no line win (wilds have 0 pays).
  if (!target) return null;

  let count = 0;
  const positions: { reel: number; row: number }[] = [];
  let usedExpandedWild = false;

  for (const c of cells) {
    const def = SYMBOLS[c.symbol];
    if (def.isScatter || def.isSequenceMarker || def.isSpirit) break;
    if (c.symbol === target || (isWild(c.symbol) && canSubstitute(c.symbol, target))) {
      count++;
      positions.push({ reel: c.reel, row: c.row });
      if (expandedWildReels.has(c.reel) && isWild(c.symbol)) {
        usedExpandedWild = true;
      }
      // Also mark expanded if the cell was forced wild via expansion on that reel
      if (expandedWildReels.has(c.reel) && grid[c.reel]![c.row] === 'WILD') {
        usedExpandedWild = true;
      }
    } else {
      break;
    }
  }

  if (count < 3) return null;

  const pays = SYMBOLS[target].pays;
  const payIndex = count - 3; // 0→3oak, 1→4oak, 2→5oak
  const mult = pays[Math.min(payIndex, 2)]! * GAME_CONFIG.payScale;
  const baseCredits = Math.floor(mult * lineBet);
  if (baseCredits <= 0) return null;

  const wildMultiplier =
    usedExpandedWild ? GAME_CONFIG.wild.expandedMultiplier : 1;
  const afterWildCredits = Math.floor(baseCredits * wildMultiplier);

  return {
    lineIndex,
    symbol: target,
    count,
    positions,
    baseCredits,
    usedExpandedWild,
    wildMultiplier,
    afterWildCredits,
  };
}

export function evaluateAllLines(
  grid: Grid,
  totalBet: number,
  expandedWildReels: ReadonlySet<number>,
): LineWin[] {
  const lineBet = totalBet / GAME_CONFIG.paylineCount;
  const wins: LineWin[] = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const w = evaluateLine(grid, i, lineBet, expandedWildReels);
    if (w) wins.push(w);
  }
  return wins;
}

export function evaluateScatter(grid: Grid, totalBet: number): ScatterWin | null {
  const positions: { reel: number; row: number }[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let row = 0; row < grid[r]!.length; row++) {
      if (grid[r]![row] === 'SCATTER') positions.push({ reel: r, row });
    }
  }
  const count = positions.length;
  if (count < 3) return null;
  const key = Math.min(count, 5);
  const mult = SCATTER_PAYS[key] ?? SCATTER_PAYS[5]!;
  // 5+ uses the 5-scatter pay; >5 still pays the 5 rate (documented).
  return {
    count,
    positions,
    baseCredits: Math.floor(mult * totalBet),
  };
}

export function countScatters(grid: Grid): number {
  let n = 0;
  for (const reel of grid) for (const s of reel) if (s === 'SCATTER') n++;
  return n;
}
