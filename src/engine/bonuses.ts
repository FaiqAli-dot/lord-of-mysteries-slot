import {
  GAME_CONFIG,
  type BonusModeId,
  type SymbolId,
} from '../config/gameConfig';
import type { BonusRuntime, Grid, TarotPickReward } from './types';
import type { SeededRng } from './rng';

export function createBonusRuntime(
  mode: BonusModeId,
  totalBet: number,
): BonusRuntime {
  const base: BonusRuntime = {
    mode,
    spinsRemaining: 0,
    spinsPlayed: 0,
    retriggers: 0,
    totalWon: 0,
    moonMultiplier: GAME_CONFIG.bonuses.crimsonMoon.moonMultStart,
    moonPayingSpins: 0,
    miracleMultiplier: GAME_CONFIG.bonuses.foolsMiracles.miracleMultStart,
    miraclePayingSpins: 0,
    stickyWildReels: [],
    stickyWildCells: [],
    stickyTarotCells: [],
    tarotCardMultiplier: 1,
    tarotPicksRemaining: 0,
    tarotHistory: [],
    tarotRunningMultiplier: 1,
    tarotWildEnhance: false,
    tarotExtraPicksUsed: 0,
    maxWinCredits: Number.POSITIVE_INFINITY,
  };

  switch (mode) {
    case 'TAROT_CLUB': {
      const n = GAME_CONFIG.bonuses.tarotClub.spins;
      base.spinsRemaining = n;
      base.tarotPicksRemaining = n;
      base.maxWinCredits = GAME_CONFIG.bonuses.tarotClub.maxWinMult * totalBet;
      break;
    }
    case 'CRIMSON_MOON':
      base.spinsRemaining = GAME_CONFIG.bonuses.crimsonMoon.spins;
      base.maxWinCredits = GAME_CONFIG.bonuses.crimsonMoon.maxWinMult * totalBet;
      break;
    case 'FOOLS_MIRACLES':
      base.spinsRemaining = GAME_CONFIG.bonuses.foolsMiracles.spins;
      base.maxWinCredits = GAME_CONFIG.bonuses.foolsMiracles.maxWinMult * totalBet;
      break;
  }
  return base;
}

export function eligibleBonusesForScatterCount(count: number): {
  trigger: 'CHOICE' | 'FOOLS_MIRACLES' | 'CRIMSON_MOON' | null;
  bonuses: BonusModeId[];
} {
  const { scatter } = GAME_CONFIG;
  if (count >= scatter.foolsMiraclesMin) {
    return { trigger: 'FOOLS_MIRACLES', bonuses: ['FOOLS_MIRACLES'] };
  }
  if (
    count >= scatter.highIntensityMin &&
    count <= scatter.highIntensityMax
  ) {
    return {
      trigger: 'CRIMSON_MOON',
      bonuses: [scatter.highIntensityBonus],
    };
  }
  if (count >= scatter.choiceMin && count <= scatter.choiceMax) {
    return { trigger: 'CHOICE', bonuses: [...scatter.choiceBonuses] };
  }
  return { trigger: null, bonuses: [] };
}

/** Draw a random Mode A multiplier card for this spin. */
export function drawTarotMultiplierCard(
  rng: SeededRng,
  bonus: BonusRuntime,
): BonusRuntime {
  const cards = GAME_CONFIG.bonuses.tarotClub.multiplierCards;
  const idx = rng.weightedIndex(cards.map((c) => c.weight));
  const mult = cards[idx]!.mult;
  const reward: TarotPickReward = {
    type: 'multiplierCard',
    mult,
    label: `Multiplier card ×${mult}`,
  };
  return {
    ...bonus,
    tarotCardMultiplier: mult,
    tarotHistory: [...bonus.tarotHistory, reward],
    tarotPicksRemaining: Math.max(0, bonus.tarotPicksRemaining - 1),
  };
}

/** Lock sticky tarot members + optional sticky wild seats from the current grid. */
export function captureTarotStickies(
  bonus: BonusRuntime,
  grid: Grid,
  rng: SeededRng,
): BonusRuntime {
  const stickySyms = new Set(
    GAME_CONFIG.bonuses.tarotClub.stickyTarotSymbols as readonly SymbolId[],
  );
  const nextCells = [...bonus.stickyTarotCells];
  const occupied = new Set(nextCells.map((c) => `${c.reel}-${c.row}`));

  for (let r = 0; r < grid.length; r++) {
    for (let row = 0; row < grid[r]!.length; row++) {
      const s = grid[r]![row]!;
      if (!stickySyms.has(s)) continue;
      const key = `${r}-${row}`;
      if (occupied.has(key)) continue;
      nextCells.push({ reel: r, row, symbol: s });
      occupied.add(key);
    }
  }

  let stickyWilds = [...bonus.stickyWildCells];
  const wildCap = GAME_CONFIG.bonuses.tarotClub.maxStickyWildCells;
  if (
    stickyWilds.length < wildCap &&
    rng.next() < GAME_CONFIG.bonuses.tarotClub.stickyWildChance
  ) {
    const available: { reel: number; row: number }[] = [];
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        if (!occupied.has(`${r}-${row}`)) available.push({ reel: r, row });
      }
    }
    if (available.length > 0) {
      const cell = rng.pick(available);
      stickyWilds = [...stickyWilds, cell];
    }
  }

  return {
    ...bonus,
    stickyTarotCells: nextCells,
    stickyWildCells: stickyWilds,
  };
}

/** Apply sticky tarot symbols onto a grid. */
export function applyStickyTarot(
  grid: Grid,
  cells: { reel: number; row: number; symbol: SymbolId }[],
): Grid {
  const next = grid.map((reel) => [...reel]);
  for (const c of cells) {
    if (next[c.reel]?.[c.row] && next[c.reel]![c.row] !== 'SCATTER') {
      next[c.reel]![c.row] = c.symbol;
    }
  }
  return next;
}

/** @deprecated Mode A no longer uses gathering pick table — kept for API compat. */
export function resolveTarotPick(
  rng: SeededRng,
  bonus: BonusRuntime,
  _totalBet: number,
): { reward: TarotPickReward; bonus: BonusRuntime; creditsAwarded: number } {
  const next = drawTarotMultiplierCard(rng, bonus);
  const last = next.tarotHistory[next.tarotHistory.length - 1]!;
  return { reward: last, bonus: next, creditsAwarded: 0 };
}

export function tryRetrigger(
  bonus: BonusRuntime,
  scatterCount: number,
): BonusRuntime {
  const cap = GAME_CONFIG.bonuses.retriggerCap;
  if (bonus.retriggers >= cap) return bonus;

  if (bonus.mode === 'CRIMSON_MOON') {
    const cfg = GAME_CONFIG.bonuses.crimsonMoon;
    if (scatterCount >= cfg.retriggerScatters) {
      return {
        ...bonus,
        spinsRemaining: bonus.spinsRemaining + cfg.retriggerSpins,
        retriggers: bonus.retriggers + 1,
      };
    }
  }
  if (bonus.mode === 'FOOLS_MIRACLES') {
    const cfg = GAME_CONFIG.bonuses.foolsMiracles;
    if (scatterCount >= cfg.retriggerScatters) {
      return {
        ...bonus,
        spinsRemaining: bonus.spinsRemaining + cfg.retriggerSpins,
        retriggers: bonus.retriggers + 1,
      };
    }
  }
  return bonus;
}

export function advanceMoonMultiplier(bonus: BonusRuntime, hadPay: boolean): BonusRuntime {
  if (!hadPay) return bonus;
  const cfg = GAME_CONFIG.bonuses.crimsonMoon;
  const paying = bonus.moonPayingSpins + 1;
  let mult = bonus.moonMultiplier;
  if (paying % cfg.moonMultStepEvery === 0) {
    mult = Math.min(cfg.moonMultCap, mult + 1);
  }
  return { ...bonus, moonPayingSpins: paying, moonMultiplier: mult };
}

export function advanceMiracleMultiplier(bonus: BonusRuntime, hadPay: boolean): BonusRuntime {
  if (!hadPay) return bonus;
  const cfg = GAME_CONFIG.bonuses.foolsMiracles;
  const paying = bonus.miraclePayingSpins + 1;
  let mult = bonus.miracleMultiplier;
  if (paying % cfg.miracleMultStepEvery === 0) {
    mult = Math.min(cfg.miracleMultCap, mult + 1);
  }
  return { ...bonus, miraclePayingSpins: paying, miracleMultiplier: mult };
}

/** Add a sticky wild reel for Crimson Moon (legacy reel mode). */
export function addStickyWildReel(bonus: BonusRuntime, rng: SeededRng): BonusRuntime {
  const cap = GAME_CONFIG.bonuses.crimsonMoon.maxStickyWildReels;
  if (cap <= 0 || bonus.stickyWildReels.length >= cap) return bonus;
  const available = [0, 1, 2, 3, 4].filter((r) => !bonus.stickyWildReels.includes(r));
  if (available.length === 0) return bonus;
  const reel = rng.pick(available);
  return { ...bonus, stickyWildReels: [...bonus.stickyWildReels, reel] };
}

/** Add one sticky wild cell for Crimson Moon (preferred mode). */
export function addStickyWildCell(bonus: BonusRuntime, rng: SeededRng): BonusRuntime {
  const cap = GAME_CONFIG.bonuses.crimsonMoon.maxStickyWildCells;
  if (cap <= 0 || bonus.stickyWildCells.length >= cap) return bonus;
  const occupied = new Set(bonus.stickyWildCells.map((c) => `${c.reel}-${c.row}`));
  const available: { reel: number; row: number }[] = [];
  for (let r = 0; r < GAME_CONFIG.reels; r++) {
    for (let row = 0; row < GAME_CONFIG.rows; row++) {
      if (!occupied.has(`${r}-${row}`)) available.push({ reel: r, row });
    }
  }
  if (available.length === 0) return bonus;
  const cell = rng.pick(available);
  return { ...bonus, stickyWildCells: [...bonus.stickyWildCells, cell] };
}

/** Enforce bonus max-win cap; returns clamped payout + remaining room. */
export function applyMaxWinCap(
  bonus: BonusRuntime,
  payout: number,
): { payout: number; bonus: BonusRuntime; capped: boolean } {
  const room = Math.max(0, bonus.maxWinCredits - bonus.totalWon);
  if (payout <= room) {
    return { payout, bonus, capped: false };
  }
  return {
    payout: room,
    bonus: { ...bonus, spinsRemaining: 0 },
    capped: true,
  };
}
