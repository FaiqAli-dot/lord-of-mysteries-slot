import { GAME_CONFIG, type SequenceTier } from '../config/gameConfig';

/** Current tier from cumulative Potion Bottle count. */
export function sequenceTier(): readonly SequenceTier[] {
  return GAME_CONFIG.sequence.tiers;
}

/** Current multiplier from cumulative potion count. */
export function sequenceMultiplierForWins(potions: number): number {
  const tiers = GAME_CONFIG.sequence.tiers;
  let mult = tiers[0]!.multiplier;
  for (const t of tiers) {
    if (potions >= t.potionsRequired) mult = t.multiplier;
  }
  return Math.min(mult, GAME_CONFIG.sequence.maxMultiplier);
}

/** Active Sequence tier (9→0) for UI. */
export function sequenceTierForPotions(potions: number): SequenceTier {
  const tiers = GAME_CONFIG.sequence.tiers;
  let tier = tiers[0]!;
  for (const t of tiers) {
    if (potions >= t.potionsRequired) tier = t;
  }
  return tier;
}

/** Potion count required to reach a given multiplier (exact tier match). */
export function potionsForMultiplier(multiplier: number): number {
  const tiers = GAME_CONFIG.sequence.tiers;
  const match = tiers.find((t) => t.multiplier === multiplier);
  if (match) return match.potionsRequired;
  // Nearest tier at or below the requested multiplier
  let best = tiers[0]!;
  for (const t of tiers) {
    if (t.multiplier <= multiplier) best = t;
  }
  return best.potionsRequired;
}

/**
 * Apply Sequence to credits.
 * Convention: apply current multiplier to eligible payouts BEFORE advancing
 * for the next evaluation. Cap at 15x.
 */
export function applySequenceMultiplier(
  creditsAfterWild: number,
  currentMultiplier: number,
): { total: number; basePortion: number; sequencePortion: number } {
  const mult = Math.min(currentMultiplier, GAME_CONFIG.sequence.maxMultiplier);
  const total = Math.floor(creditsAfterWild * mult);
  const basePortion = creditsAfterWild;
  const sequencePortion = total - basePortion;
  return { total, basePortion, sequencePortion };
}

/** Advance Sequence by Potion Bottles landed this spin. */
export function advanceSequence(potionsCount: number, by: number = 1): {
  wins: number;
  multiplier: number;
} {
  const wins = potionsCount + by;
  return { wins, multiplier: sequenceMultiplierForWins(wins) };
}

/** Permanent Sequence — reset only for tests / explicit demo reset. */
export function resetSequence(): { wins: number; multiplier: number } {
  return { wins: 0, multiplier: 1 };
}

/** Progress 0–1 toward next Sequence tier (for UI). */
export function sequenceProgress(potions: number): {
  multiplier: number;
  sequence: number;
  title: string;
  nextMultiplier: number | null;
  nextTitle: string | null;
  progress: number;
  winsIntoTier: number;
  winsNeeded: number;
} {
  const tiers = GAME_CONFIG.sequence.tiers;
  const current = sequenceTierForPotions(potions);
  let currentIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (potions >= tiers[i]!.potionsRequired) currentIdx = i;
  }
  const next = tiers[currentIdx + 1];
  if (!next) {
    return {
      multiplier: current.multiplier,
      sequence: current.sequence,
      title: current.title,
      nextMultiplier: null,
      nextTitle: null,
      progress: 1,
      winsIntoTier: 0,
      winsNeeded: 0,
    };
  }
  const curReq = tiers[currentIdx]!.potionsRequired;
  const span = next.potionsRequired - curReq;
  const into = potions - curReq;
  return {
    multiplier: current.multiplier,
    sequence: current.sequence,
    title: current.title,
    nextMultiplier: next.multiplier,
    nextTitle: next.title,
    progress: span <= 0 ? 1 : Math.min(1, into / span),
    winsIntoTier: into,
    winsNeeded: span,
  };
}
