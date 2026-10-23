import { GAME_CONFIG, type BonusModeId } from '../config/gameConfig';
import type { BonusRuntime, TarotPickReward } from './types';
import type { SeededRng } from './rng';

export function createBonusRuntime(mode: BonusModeId): BonusRuntime {
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
    tarotPicksRemaining: 0,
    tarotHistory: [],
    tarotRunningMultiplier: 1,
    tarotWildEnhance: false,
    tarotExtraPicksUsed: 0,
  };

  switch (mode) {
    case 'TAROT_CLUB': {
      // Gathering free spins on the reels (same count as former pick selections).
      const n = GAME_CONFIG.bonuses.tarotClub.selections;
      base.spinsRemaining = n;
      base.tarotPicksRemaining = n;
      break;
    }
    case 'CRIMSON_MOON':
      base.spinsRemaining = GAME_CONFIG.bonuses.crimsonMoon.spins;
      break;
    case 'FOOLS_MIRACLES':
      base.spinsRemaining = GAME_CONFIG.bonuses.foolsMiracles.spins;
      break;
  }
  return base;
}

export function eligibleBonusesForScatterCount(count: number): {
  trigger: 'CHOICE' | 'FOOLS_MIRACLES' | null;
  bonuses: BonusModeId[];
} {
  const { scatter } = GAME_CONFIG;
  if (count >= scatter.foolsMiraclesMin) {
    return { trigger: 'FOOLS_MIRACLES', bonuses: ['FOOLS_MIRACLES'] };
  }
  if (count >= scatter.choiceMin && count <= scatter.choiceMax) {
    return { trigger: 'CHOICE', bonuses: [...scatter.choiceBonuses] };
  }
  return { trigger: null, bonuses: [] };
}

/** Resolve a Tarot Club pick from configured weighted rewards. */
export function resolveTarotPick(
  rng: SeededRng,
  bonus: BonusRuntime,
  totalBet: number,
): { reward: TarotPickReward; bonus: BonusRuntime; creditsAwarded: number } {
  const cfg = GAME_CONFIG.bonuses.tarotClub;
  const weights = cfg.rewards.map((r) => r.weight);
  const idx = rng.weightedIndex(weights);
  const raw = cfg.rewards[idx]!;
  const next: BonusRuntime = {
    ...bonus,
    tarotHistory: [...bonus.tarotHistory],
  };
  let creditsAwarded = 0;
  let reward: TarotPickReward;

  switch (raw.type) {
    case 'credits': {
      const mult = raw.mult ?? 1;
      creditsAwarded = Math.floor(mult * totalBet * next.tarotRunningMultiplier);
      reward = {
        type: 'credits',
        mult,
        credits: creditsAwarded,
        label: `${mult}× bet (${creditsAwarded} credits)`,
      };
      break;
    }
    case 'multiplier': {
      const mult = raw.mult ?? 2;
      next.tarotRunningMultiplier *= mult;
      reward = {
        type: 'multiplier',
        mult,
        label: `Session ×${mult} (now ×${next.tarotRunningMultiplier})`,
      };
      break;
    }
    case 'wildEnhance': {
      next.tarotWildEnhance = true;
      reward = { type: 'wildEnhance', label: 'Wild enhancement granted' };
      break;
    }
    case 'extraPick': {
      if (next.tarotExtraPicksUsed < cfg.maxExtraPicks) {
        next.tarotPicksRemaining += 1;
        next.tarotExtraPicksUsed += 1;
        reward = { type: 'extraPick', label: 'Extra pick' };
      } else {
        // Cap reached — convert to small credit consolation.
        creditsAwarded = Math.floor(2 * totalBet * next.tarotRunningMultiplier);
        reward = {
          type: 'credits',
          mult: 2,
          credits: creditsAwarded,
          label: `Extra pick capped → ${creditsAwarded} credits`,
        };
      }
      break;
    }
  }

  next.tarotHistory.push(reward);
  next.tarotPicksRemaining = Math.max(0, next.tarotPicksRemaining - 1);
  next.totalWon += creditsAwarded;
  return { reward, bonus: next, creditsAwarded };
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
  if (bonus.stickyWildCells.length >= cap) return bonus;
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
