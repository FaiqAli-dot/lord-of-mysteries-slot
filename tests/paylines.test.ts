import { describe, it, expect } from 'vitest';
import { GAME_CONFIG, PAYLINES, SYMBOLS, type SymbolId } from '../src/config/gameConfig';
import { evaluateAllLines, evaluateLine, evaluateScatter, countScatters } from '../src/engine/paylines';
import { applyWildExpansion } from '../src/engine/wilds';
import type { Grid } from '../src/engine/types';

function gridFrom(rows: SymbolId[][]): Grid {
  // rows is [row][reel] convenience → convert to [reel][row]
  const g: Grid = [[], [], [], [], []];
  for (let row = 0; row < rows.length; row++) {
    for (let reel = 0; reel < 5; reel++) {
      g[reel]![row] = rows[row]![reel]!;
    }
  }
  return g;
}

describe('paylines', () => {
  it('defines exactly 20 paylines of length 5 with valid rows', () => {
    expect(PAYLINES).toHaveLength(20);
    for (const line of PAYLINES) {
      expect(line).toHaveLength(5);
      for (const row of line) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(GAME_CONFIG.rows);
      }
    }
  });

  it('pays 3/4/5 of a kind for a high symbol on line 0', () => {
    const make = (n: number): Grid => {
      const row0: SymbolId[] = ['FOOL', 'FOOL', 'FOOL', 'FOOL', 'FOOL'];
      for (let i = n; i < 5; i++) row0[i] = 'JACK';
      return gridFrom([
        row0,
        ['KING', 'KING', 'KING', 'KING', 'KING'],
        ['QUEEN', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN'],
        ['ACE', 'ACE', 'ACE', 'ACE', 'ACE'],
      ]);
    };
    const bet = 20;
    const lineBet = bet / 20;
    for (const n of [3, 4, 5] as const) {
      const g = make(n);
      const w = evaluateLine(g, 0, lineBet, new Set());
      expect(w).not.toBeNull();
      expect(w!.count).toBe(n);
      expect(w!.baseCredits).toBe(
        Math.floor(SYMBOLS.FOOL.pays[n - 3]! * GAME_CONFIG.payScale * lineBet),
      );
    }
  });

  it('awards all eligible line wins on 20 lines', () => {
    // Fill entire grid with JACK → every line should win 5oak JACK
    const g: Grid = Array.from({ length: 5 }, () =>
      Array.from({ length: 4 }, () => 'JACK' as SymbolId),
    );
    const wins = evaluateAllLines(g, 20, new Set());
    expect(wins).toHaveLength(20);
  });

  it('wild substitutes but not for scatter', () => {
    const g = gridFrom([
      ['FOOL', 'WILD', 'FOOL', 'KING', 'QUEEN'],
      ['ACE', 'ACE', 'ACE', 'ACE', 'ACE'],
      ['KING', 'KING', 'KING', 'KING', 'KING'],
      ['QUEEN', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN'],
    ]);
    const w = evaluateLine(g, 0, 1, new Set());
    expect(w?.symbol).toBe('FOOL');
    expect(w?.count).toBe(3);
  });

  it('scatter pays and counts 3/4/5/>5 boundaries', () => {
    const place = (n: number): Grid => {
      const g: Grid = Array.from({ length: 5 }, () =>
        Array.from({ length: 4 }, () => 'JACK' as SymbolId),
      );
      let left = n;
      for (let r = 0; r < 5 && left > 0; r++) {
        for (let row = 0; row < 4 && left > 0; row++) {
          g[r]![row] = 'SCATTER';
          left--;
        }
      }
      return g;
    };
    expect(countScatters(place(3))).toBe(3);
    expect(evaluateScatter(place(3), 20)?.baseCredits).toBe(40);
    expect(evaluateScatter(place(4), 20)?.baseCredits).toBe(160);
    expect(evaluateScatter(place(5), 20)?.baseCredits).toBe(800);
    expect(evaluateScatter(place(6), 20)?.baseCredits).toBe(800);
    expect(evaluateScatter(place(2), 20)).toBeNull();
  });

  it('expanded wild applies 2x only to wins using expanded wild', () => {
    const g = gridFrom([
      ['WILD', 'FOOL', 'FOOL', 'KING', 'QUEEN'],
      ['WILD', 'ACE', 'ACE', 'ACE', 'ACE'],
      ['WILD', 'KING', 'KING', 'KING', 'KING'],
      ['WILD', 'QUEEN', 'QUEEN', 'QUEEN', 'QUEEN'],
    ]);
    const { grid: expanded, expandedReels } = applyWildExpansion(g);
    expect(expandedReels).toContain(0);
    const wins = evaluateAllLines(expanded, 20, new Set(expandedReels));
    const line0 = wins.find((w) => w.lineIndex === 0);
    expect(line0?.usedExpandedWild).toBe(true);
    expect(line0?.wildMultiplier).toBe(2);
    expect(line0!.afterWildCredits).toBe(line0!.baseCredits * 2);
  });
});
