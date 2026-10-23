import {
  GAME_CONFIG,
  type SymbolId,
  type SpiritualityEffectId,
} from '../config/gameConfig';
import type { Grid, LockedWildState, SpiritualityActivation } from './types';
import type { SeededRng } from './rng';
import { cloneGrid, respinEligible } from './reels';
import { applyGlove, applyGrafting, ensureGraftSeed } from './wilds';

export function addCharge(current: number, amount: number): number {
  if (amount <= 0) return current;
  return current + amount;
}

export function shouldActivate(charge: number): boolean {
  return charge >= GAME_CONFIG.spirituality.threshold;
}

/**
 * Activate Spirituality: reset charge to 0 (no overflow), pick one weighted effect.
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
  let nextLocked = [...lockedWilds];
  let concealed: { reel: number; row: number }[] | null = null;
  let graftedReel: number | null = null;
  let graftedSymbol: SymbolId | null = null;
  let hungerRespinDone = false;
  const detail: Record<string, unknown> = {};

  switch (effect.id as SpiritualityEffectId) {
    case 'GRAFTING': {
      /**
       * Real spin grid first. Then:
       * - Natural Wild present → that seed spreads to orthogonal neighbors.
       * - No Wild → place ONE Wild (no spread) so Grafting still does something
       *   without the full neighbor EV every time.
       */
      const blocked = new Set(
        GAME_CONFIG.spirituality.grafting.cannotTransform as readonly SymbolId[],
      );
      const naturalWilds: { reel: number; row: number }[] = [];
      const eligible: { reel: number; row: number }[] = [];
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          const s = nextGrid[r]![row]!;
          if (s === 'WILD') naturalWilds.push({ reel: r, row });
          if (!blocked.has(s)) eligible.push({ reel: r, row });
        }
      }
      if (naturalWilds.length > 0) {
        const seed = rng.pick(naturalWilds);
        const seeded = ensureGraftSeed(nextGrid, seed);
        nextGrid = seeded.grid;
        const spread = applyGrafting(nextGrid, seeded.seed);
        nextGrid = spread.grid;
        graftedReel = seeded.seed.reel;
        graftedSymbol = 'WILD';
        detail.reel = seeded.seed.reel;
        detail.row = seeded.seed.row;
        detail.seedPlaced = false;
        detail.spread = true;
        detail.seed = seeded.seed;
        detail.positions = spread.transformed;
        detail.symbol = 'WILD';
      } else if (eligible.length > 0) {
        const seed = rng.pick(eligible);
        const seeded = ensureGraftSeed(nextGrid, seed);
        nextGrid = seeded.grid;
        graftedReel = seeded.seed.reel;
        graftedSymbol = 'WILD';
        detail.reel = seeded.seed.reel;
        detail.row = seeded.seed.row;
        detail.seedPlaced = seeded.placed;
        detail.spread = false;
        detail.seed = seeded.seed;
        detail.positions = [];
        detail.symbol = 'WILD';
      }
      break;
    }
    case 'BLIND_STUPIDITY': {
      // Upgrade random eligible cells into high-paying symbols (affects wins).
      const cfg = GAME_CONFIG.spirituality.blindStupidity;
      const blocked = new Set(cfg.cannotTransform as readonly SymbolId[]);
      const eligible: { reel: number; row: number }[] = [];
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          const s = nextGrid[r]![row]!;
          if (!blocked.has(s)) eligible.push({ reel: r, row });
        }
      }
      const shuffled = rng.shuffle(eligible);
      const picks = shuffled.slice(0, cfg.transformCount);
      const upgrades: { reel: number; row: number; symbol: SymbolId }[] = [];
      for (const pos of picks) {
        const symbol = rng.pick(cfg.highSymbols as readonly SymbolId[]);
        nextGrid[pos.reel]![pos.row] = symbol;
        upgrades.push({ reel: pos.reel, row: pos.row, symbol });
      }
      detail.positions = upgrades.map(({ reel, row }) => ({ reel, row }));
      detail.upgrades = upgrades;
      // No veil — grid itself changed (concealed stays null).
      break;
    }
    case 'CREEPING_HUNGER': {
      const preserve = new Set(
        GAME_CONFIG.spirituality.creepingHunger.preserve as readonly SymbolId[],
      );
      const mask: boolean[][] = nextGrid.map((reel) =>
        reel.map((s) => preserve.has(s)),
      );
      nextGrid = respinEligible(nextGrid, mask, rng);
      hungerRespinDone = true;
      detail.preserved = true;
      break;
    }
    case 'GLOVE': {
      const eligible: { reel: number; row: number }[] = [];
      const blocked = new Set(
        GAME_CONFIG.spirituality.glove.cannotTransform as readonly SymbolId[],
      );
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          const s = nextGrid[r]![row]!;
          if (!blocked.has(s)) eligible.push({ reel: r, row });
        }
      }
      if (eligible.length > 0) {
        const pos = rng.pick(eligible);
        nextGrid = applyGlove(nextGrid, pos.reel, pos.row);
        detail.reel = pos.reel;
        detail.row = pos.row;
      }
      break;
    }
    case 'LOCKED_WILD': {
      const blocked = new Set(
        GAME_CONFIG.spirituality.lockedWild.cannotPlaceOver as readonly SymbolId[],
      );
      const eligible: { reel: number; row: number }[] = [];
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          const s = nextGrid[r]![row]!;
          if (!blocked.has(s)) eligible.push({ reel: r, row });
        }
      }
      if (eligible.length > 0) {
        const pos = rng.pick(eligible);
        nextGrid[pos.reel]![pos.row] = 'WILD';
        const duration = GAME_CONFIG.spirituality.lockedWild.durationSpins;
        // One locked wild per cell — refresh duration instead of stacking entries.
        nextLocked = nextLocked.filter(
          (lw) => !(lw.reel === pos.reel && lw.row === pos.row),
        );
        nextLocked.push({
          reel: pos.reel,
          row: pos.row,
          remainingSpins: duration,
        });
        detail.reel = pos.reel;
        detail.row = pos.row;
        detail.duration = duration;
      }
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

/** Tick locked wild durations after a spin resolves. */
export function tickLockedWilds(locked: LockedWildState[]): LockedWildState[] {
  return locked
    .map((lw) => ({ ...lw, remainingSpins: lw.remainingSpins - 1 }))
    .filter((lw) => lw.remainingSpins > 0);
}
