import {
  GAME_CONFIG,
  type SymbolId,
  type SpiritualityEffectId,
} from '../config/gameConfig';
import type { Grid, LockedWildState, SpiritualityActivation } from './types';
import type { SeededRng } from './rng';
import { cloneGrid, findPositions, respinEligible } from './reels';
import { applyGraftingCluster } from './wilds';

export function addCharge(current: number, amount: number): number {
  if (amount <= 0) return current;
  return current + amount;
}

export function shouldActivate(charge: number): boolean {
  return charge >= GAME_CONFIG.spirituality.threshold;
}

/**
 * Activate Spirituality: reset charge to 0 (no overflow), pick Grafting or Blind Stupidity.
 */
export function activateSpirituality(
  rng: SeededRng,
  grid: Grid,
  lockedWilds: LockedWildState[],
  forceEffect?: SpiritualityEffectId | null,
): {
  charge: number;
  activation: SpiritualityActivation;
  grid: Grid;
  lockedWilds: LockedWildState[];
  concealed: { reel: number; row: number }[] | null;
  graftedReel: number | null;
  graftedSymbol: SymbolId | null;
  hungerRespinDone: boolean;
  spiritualityIncrementalHint: number;
} {
  const effects = GAME_CONFIG.spirituality.effects;
  const forced = forceEffect
    ? effects.find((e) => e.id === forceEffect)
    : undefined;
  const effect =
    forced ??
    effects[rng.weightedIndex(effects.map((e) => e.weight))]!;

  let nextGrid = cloneGrid(grid);
  const nextLocked = [...lockedWilds];
  const concealed: { reel: number; row: number }[] | null = null;
  let graftedReel: number | null = null;
  let graftedSymbol: SymbolId | null = null;
  const hungerRespinDone = false;
  const detail: Record<string, unknown> = {};

  switch (effect.id as SpiritualityEffectId) {
    case 'GRAFTING': {
      // Neighbor cluster → highest-paying symbol among them (Wild never downgrades).
      const result = applyGraftingCluster(nextGrid, (items) => rng.pick(items));
      nextGrid = result.grid;
      if (result.seed) {
        graftedReel = result.seed.reel;
        graftedSymbol = result.targetSymbol;
        detail.reel = result.seed.reel;
        detail.row = result.seed.row;
        detail.seed = result.seed;
      }
      detail.positions = result.positions;
      detail.cluster = result.cluster;
      detail.targetSymbol = result.targetSymbol;
      detail.symbol = result.targetSymbol;
      detail.spread = result.positions.length > 0;
      break;
    }
    case 'BLIND_STUPIDITY': {
      // Convert 2–4 random LOW-paying symbols into highs — never downgrade highs.
      const cfg = GAME_CONFIG.spirituality.blindStupidity;
      const lows = new Set(cfg.lowSymbols as readonly SymbolId[]);
      const eligible: { reel: number; row: number }[] = [];
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          const s = nextGrid[r]![row]!;
          if (lows.has(s)) eligible.push({ reel: r, row });
        }
      }
      const want = rng.int(cfg.transformCountMin, cfg.transformCountMax);
      const count = Math.min(want, eligible.length);
      const shuffled = rng.shuffle(eligible);
      const picks = shuffled.slice(0, count);
      const upgrades: { reel: number; row: number; symbol: SymbolId }[] = [];
      for (const pos of picks) {
        const symbol = rng.pick(cfg.highSymbols as readonly SymbolId[]);
        nextGrid[pos.reel]![pos.row] = symbol;
        upgrades.push({ reel: pos.reel, row: pos.row, symbol });
      }
      detail.positions = upgrades.map(({ reel, row }) => ({ reel, row }));
      detail.upgrades = upgrades;
      detail.transformCount = upgrades.length;
      detail.requestedCount = want;
      break;
    }
  }

  return {
    charge: 0,
    activation: { effect: effect.id, detail },
    grid: nextGrid,
    lockedWilds: nextLocked,
    concealed,
    graftedReel,
    graftedSymbol,
    hungerRespinDone,
    spiritualityIncrementalHint: 0,
  };
}

/**
 * Creeping Hunger: Glove + Monster on the same grid.
 * Absorbs Monster(s) into locking wilds, converts Glove seats to wild,
 * then respins non-preserved cells once.
 */
export function tryCreepingHunger(
  rng: SeededRng,
  grid: Grid,
  lockedWilds: LockedWildState[],
): {
  triggered: boolean;
  grid: Grid;
  lockedWilds: LockedWildState[];
  activation: SpiritualityActivation | null;
} {
  const gloves = findPositions(grid, 'GLOVE');
  const monsters = findPositions(grid, 'MONSTER');
  if (gloves.length === 0 || monsters.length === 0) {
    return {
      triggered: false,
      grid,
      lockedWilds,
      activation: null,
    };
  }

  let nextGrid = cloneGrid(grid);
  let nextLocked = [...lockedWilds];
  const duration = GAME_CONFIG.spirituality.creepingHunger.lockDurationSpins;
  const absorbed: { reel: number; row: number }[] = [];

  // Absorb every Monster → locking wild
  for (const m of monsters) {
    nextGrid[m.reel]![m.row] = 'WILD';
    nextLocked = nextLocked.filter(
      (lw) => !(lw.reel === m.reel && lw.row === m.row),
    );
    nextLocked.push({
      reel: m.reel,
      row: m.row,
      remainingSpins: duration,
    });
    absorbed.push(m);
  }

  // Glove seats become wild (not necessarily locked)
  for (const g of gloves) {
    nextGrid[g.reel]![g.row] = 'WILD';
  }

  // Respin non-preserved cells (highs / wilds / specials stay)
  const preserve = new Set(
    GAME_CONFIG.spirituality.creepingHunger.preserve as readonly SymbolId[],
  );
  // Also preserve newly placed wilds from absorption
  const mask: boolean[][] = nextGrid.map((reel) =>
    reel.map((s) => preserve.has(s) || s === 'WILD'),
  );
  nextGrid = respinEligible(nextGrid, mask, rng);

  // Re-apply locked wilds after respin
  for (const lw of nextLocked) {
    if (nextGrid[lw.reel]?.[lw.row] && nextGrid[lw.reel]![lw.row] !== 'SCATTER') {
      nextGrid[lw.reel]![lw.row] = 'WILD';
    }
  }

  return {
    triggered: true,
    grid: nextGrid,
    lockedWilds: nextLocked,
    activation: {
      effect: 'CREEPING_HUNGER',
      detail: {
        absorbed,
        gloves,
        lockDuration: duration,
      },
    },
  };
}

/** Tick locked wild durations after a spin resolves. */
export function tickLockedWilds(locked: LockedWildState[]): LockedWildState[] {
  return locked
    .map((lw) => ({ ...lw, remainingSpins: lw.remainingSpins - 1 }))
    .filter((lw) => lw.remainingSpins > 0);
}
