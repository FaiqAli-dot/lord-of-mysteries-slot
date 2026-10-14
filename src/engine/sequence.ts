import { GAME_CONFIG } from '../config/gameConfig';

/** Current multiplier from cumulative win count since last reset. */
export function sequenceMultiplierForWins(wins: number): number {
  const tiers = GAME_CONFIG.sequence.tiers;
  let mult = tiers[0]!.multiplier;
  for (const t of tiers) {
    if (wins >= t.winsRequired) mult = t.multiplier;
  }
  return Math.min(mult, GAME_CONFIG.sequence.maxMultiplier);
}

/**
 * Apply Sequence to credits.
 * Convention: apply current multiplier to eligible payouts BEFORE advancing
 * for the next evaluation. Cap at 15x.
 *
 * Returns { total, basePortion, sequencePortion } where basePortion is the
 * 1x share and sequencePortion is the incremental Sequence attribution.
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

/** Advance Sequence by one winning combination; enforce single advance per call. */
export function advanceSequence(winsCount: number, by: number = 1): {
  wins: number;
  multiplier: number;
} {
  const wins = winsCount + by;
  return { wins, multiplier: sequenceMultiplierForWins(wins) };
}

export function resetSequence(): { wins: number; multiplier: number } {
  return { wins: 0, multiplier: 1 };
}

/** Progress 0–1 toward next tier (for UI). */
export function sequenceProgress(wins: number): {
  multiplier: number;
  nextMultiplier: number | null;
  progress: number;
  winsIntoTier: number;
  winsNeeded: number;
} {
  const tiers = GAME_CONFIG.sequence.tiers;
  const multiplier = sequenceMultiplierForWins(wins);
  let currentIdx = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (wins >= tiers[i]!.winsRequired) currentIdx = i;
  }
  const next = tiers[currentIdx + 1];
  if (!next) {
    return {
      multiplier,
      nextMultiplier: null,
      progress: 1,
      winsIntoTier: 0,
      winsNeeded: 0,
    };
  }
  const curReq = tiers[currentIdx]!.winsRequired;
  const span = next.winsRequired - curReq;
  const into = wins - curReq;
  return {
    multiplier,
    nextMultiplier: next.multiplier,
    progress: span <= 0 ? 1 : Math.min(1, into / span),
    winsIntoTier: into,
    winsNeeded: span,
  };
}
