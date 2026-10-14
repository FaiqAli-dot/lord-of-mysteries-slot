import {
  GAME_CONFIG,
  type SymbolId,
  type SpiritualityEffectId,
} from '../config/gameConfig';
import type { Grid, LockedWildState, SpiritualityActivation } from './types';
import type { SeededRng } from './rng';
import { cloneGrid, respinEligible } from './reels';
import { applyGlove, applyGrafting } from './wilds';

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
  const weights = effects.map((e) => e.weight);
  const idx = rng.weightedIndex(weights);
  const effect = effects[idx]!;

  let nextGrid = cloneGrid(grid);
  let nextLocked = [...lockedWilds];
  let concealed: { reel: number; row: number }[] | null = null;
  let graftedReel: number | null = null;
  let graftedSymbol: SymbolId | null = null;
  let hungerRespinDone = false;
  const detail: Record<string, unknown> = {};

  switch (effect.id as SpiritualityEffectId) {
    case 'GRAFTING': {
      const reel = rng.int(0, GAME_CONFIG.reels - 1);
      const symbol = rng.pick(GAME_CONFIG.spirituality.grafting.eligibleSymbols);
      nextGrid = applyGrafting(nextGrid, reel, symbol);
      graftedReel = reel;
      graftedSymbol = symbol;
      detail.reel = reel;
      detail.symbol = symbol;
      break;
    }
    case 'BLIND_STUPIDITY': {
      const positions: { reel: number; row: number }[] = [];
      for (let r = 0; r < GAME_CONFIG.reels; r++) {
        for (let row = 0; row < GAME_CONFIG.rows; row++) {
          positions.push({ reel: r, row });
        }
      }
      const shuffled = rng.shuffle(positions);
      concealed = shuffled.slice(0, GAME_CONFIG.spirituality.blindStupidity.concealCount);
      detail.positions = concealed;
      // Symbols unchanged — visual only.
      break;
    }
    case 'CREEPING_HUNGER': {
      const preserve = new Set(
        GAME_CONFIG.spirituality.creepingHunger.preserve as readonly SymbolId[],
      );
      const mask: boolean[][] = nextGrid.map((reel) =>
        reel.map((s) => preserve.has(s)),
      );
      // Also preserve scatters so hunger cannot invent/remove scatter triggers oddly —
      // underlying rule: preserve qualifying; respin rest once from strips.
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          if (nextGrid[r]![row] === 'SCATTER') mask[r]![row] = true;
        }
      }
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
      const eligible: { reel: number; row: number }[] = [];
      for (let r = 0; r < nextGrid.length; r++) {
        for (let row = 0; row < nextGrid[r]!.length; row++) {
          if (nextGrid[r]![row] !== 'SCATTER') eligible.push({ reel: r, row });
        }
      }
      if (eligible.length > 0) {
        const pos = rng.pick(eligible);
        nextGrid[pos.reel]![pos.row] = 'WILD';
        nextLocked.push({
          reel: pos.reel,
          row: pos.row,
          remainingSpins: GAME_CONFIG.spirituality.lockedWild.durationSpins,
        });
        detail.reel = pos.reel;
        detail.row = pos.row;
        detail.duration = GAME_CONFIG.spirituality.lockedWild.durationSpins;
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
