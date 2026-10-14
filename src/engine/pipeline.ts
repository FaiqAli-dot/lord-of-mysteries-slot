import { GAME_CONFIG, type SymbolId } from '../config/gameConfig';
import type {
  Attribution,
  Grid,
  LockedWildState,
  RoundAccounting,
  SpinResult,
  SpiritualityActivation,
} from './types';
import { SeededRng } from './rng';
import { cloneGrid, countSymbol, spinReels } from './reels';
import { evaluateAllLines, evaluateScatter, countScatters } from './paylines';
import { applyWildExpansion, applyLockedWilds } from './wilds';
import { applySequenceMultiplier, advanceSequence } from './sequence';
import {
  addCharge,
  shouldActivate,
  activateSpirituality,
  tickLockedWilds,
} from './spirituality';
import { eligibleBonusesForScatterCount } from './bonuses';

export function emptyAttribution(): Attribution {
  return { BASE: 0, BONUS: 0, SEQUENCE: 0, SPIRITUALITY: 0 };
}

export interface PipelineInput {
  rng: SeededRng;
  totalBet: number;
  sequenceWins: number;
  sequenceMultiplier: number;
  spiritualityCharge: number;
  lockedWilds: LockedWildState[];
  /** When true, payouts attribute base portion to BONUS instead of BASE. */
  inBonus: boolean;
  /** Extra bonus multiplier (moon / miracle / tarot). */
  bonusMultiplier: number;
  /** Force expand all wilds (Fool's Miracles). */
  forceExpandWilds: boolean;
  /** When false, skip Fool's Mirror reel expansion (e.g. Crimson sticky cells). */
  allowWildExpansion: boolean;
  /** Sticky wild reels (Crimson Moon legacy). */
  stickyWildReels: number[];
  /** Sticky wild cells (Crimson Moon). */
  stickyWildCells: { reel: number; row: number }[];
  /** Tarot wild enhance: treat expanded wild multiplier as +1. */
  tarotWildEnhance: boolean;
  /** Optional forced grid (tests). */
  forceGrid?: Grid | null;
  /** Whether Spirituality may activate this spin. */
  allowSpirituality: boolean;
  /** Pre-existing charge earning context. */
  chargeInBonus: boolean;
}

/**
 * Single central resolution pipeline (spec order):
 * 1 base outcome
 * 2 pre-evaluation transformations (Spirituality may alter grid)
 * 3 Grafting and grid mods
 * 4 expansions and Locked Wild positions
 * 5 scatter counts and bonus eligibility
 * 6 evaluate 20 lines
 * 7 base payouts
 * 8 Fool's Mirror multipliers
 * 9 Sequence and Spirituality modifiers per attribution
 * 10 bonus-specific rules
 * 11 aggregate without double counting
 * 12 update accounting (caller applies balance/UI)
 *
 * Spirituality activation timing:
 * Charge is computed from the *pre-effect* win potential when possible, but
 * activation that modifies the grid must occur before final evaluation.
 * Convention used here:
 * - Generate base grid + apply locked wilds / sticky wilds
 * - Tentatively evaluate to decide charge from wins + spirit symbols
 * - If threshold reached, activate effect (may modify grid), then re-evaluate fully
 * - Blind Stupidity does not change math
 * - Spirituality incremental attribution = max(0, finalAfterWild - baselineAfterWild)
 *   where baseline is evaluation without spirituality grid mods (same seed outcome base)
 */
export function resolveSpin(input: PipelineInput): SpinResult & {
  lockedWildsAfter: LockedWildState[];
  concealed: { reel: number; row: number }[] | null;
  graftedReel: number | null;
  graftedSymbol: SymbolId | null;
} {
  const {
    rng,
    totalBet,
    sequenceWins,
    sequenceMultiplier,
    spiritualityCharge,
    lockedWilds,
    inBonus,
    bonusMultiplier,
    forceExpandWilds,
    allowWildExpansion,
    stickyWildReels,
    stickyWildCells,
    tarotWildEnhance,
    forceGrid,
    allowSpirituality,
  } = input;

  // 1. Base outcome
  let grid = forceGrid ? cloneGrid(forceGrid) : spinReels(rng);

  // Apply sticky wilds (bonus) — reels and/or cells
  if (stickyWildReels.length > 0 || stickyWildCells.length > 0) {
    grid = cloneGrid(grid);
    for (const r of stickyWildReels) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        if (grid[r]![row] !== 'SCATTER') grid[r]![row] = 'WILD';
      }
    }
    for (const c of stickyWildCells) {
      if (grid[c.reel]?.[c.row] && grid[c.reel]![c.row] !== 'SCATTER') {
        grid[c.reel]![c.row] = 'WILD';
      }
    }
  }

  // Apply existing locked wilds
  const activeLocked = lockedWilds.filter((lw) => lw.remainingSpins > 0);
  grid = applyLockedWilds(
    grid,
    activeLocked.map((lw) => ({ reel: lw.reel, row: lw.row })),
  );

  // Baseline evaluation (before spirituality mods) for incremental attribution
  const baselineEval = evaluateGridPayouts(
    grid,
    totalBet,
    forceExpandWilds,
    tarotWildEnhance,
    allowWildExpansion,
  );
  const spiritSymbols = countSymbol(grid, 'SPIRIT');

  // Charge: +chargePerWin once per winning spin (not per line), plus spirit symbols.
  // Avoids multi-line spins dumping the entire meter in one hit.
  const winCombos =
    baselineEval.lineWins.length + (baselineEval.scatterWin ? 1 : 0);
  let charge = spiritualityCharge;
  const mayCharge = !inBonus || GAME_CONFIG.spirituality.chargeInBonus;
  if (mayCharge) {
    const winCharge =
      winCombos > 0 ? GAME_CONFIG.spirituality.chargePerWin : 0;
    charge = addCharge(
      charge,
      winCharge + spiritSymbols * GAME_CONFIG.spirituality.chargePerSpiritSymbol,
    );
  }

  let spiritualityActivation: SpiritualityActivation | null = null;
  let concealed: { reel: number; row: number }[] | null = null;
  let graftedReel: number | null = null;
  let graftedSymbol: SymbolId | null = null;
  let workingLocked = activeLocked;
  let spiritualityGridModified = false;

  // 2–3. Spirituality pre-evaluation transformations
  if (
    allowSpirituality &&
    shouldActivate(charge) &&
    GAME_CONFIG.spirituality.maxActivationsPerSpin >= 1
  ) {
    const act = activateSpirituality(rng, grid, workingLocked);
    charge = act.charge;
    spiritualityActivation = act.activation;
    grid = act.grid;
    workingLocked = act.lockedWilds;
    concealed = act.concealed;
    graftedReel = act.graftedReel;
    graftedSymbol = act.graftedSymbol;
    spiritualityGridModified =
      act.activation.effect !== 'BLIND_STUPIDITY';
  }

  // 4. Expansions (after spirituality mods)
  const finalEval = evaluateGridPayouts(
    grid,
    totalBet,
    forceExpandWilds,
    tarotWildEnhance,
    allowWildExpansion,
  );
  const evalGrid = finalEval.evalGrid;
  const expandedWildReels = finalEval.expandedWildReels;
  const lineWins = finalEval.lineWins;
  const scatterWin = finalEval.scatterWin;
  const scatterCount = countScatters(evalGrid);

  // Spirituality incremental: difference in after-wild line+scatter credits
  const baselineAfterWild =
    baselineEval.lineWins.reduce((s, w) => s + w.afterWildCredits, 0) +
    (baselineEval.scatterWin?.baseCredits ?? 0);
  const finalAfterWild =
    lineWins.reduce((s, w) => s + w.afterWildCredits, 0) +
    (scatterWin?.baseCredits ?? 0);
  let spiritualityIncrement = spiritualityGridModified
    ? Math.max(0, finalAfterWild - baselineAfterWild)
    : 0;

  // 5. Scatter bonus eligibility (from final grid, post-mods but grafting cannot add scatters)
  const { trigger: bonusTrigger, bonuses: eligibleBonuses } =
    eligibleBonusesForScatterCount(scatterCount);

  // 7–9. Aggregate with attribution
  const attr = emptyAttribution();
  const baseCategory: keyof Attribution = inBonus ? 'BONUS' : 'BASE';

  // Line wins: wild already in afterWildCredits
  let lineCreditsAfterWild = 0;
  for (const w of lineWins) {
    lineCreditsAfterWild += w.afterWildCredits;
  }
  const scatterCredits = scatterWin?.baseCredits ?? 0;
  let combinedAfterWild = lineCreditsAfterWild + scatterCredits;

  // Subtract spirituality increment from the combined pool before Sequence split
  // so spirituality is attributed exclusively.
  const afterWildForSeq = Math.max(0, combinedAfterWild - spiritualityIncrement);

  // Sequence applies to eligible payouts (after wild, after isolating spirituality increment)
  const seq = applySequenceMultiplier(afterWildForSeq, sequenceMultiplier);
  const seqOnSpirit = applySequenceMultiplier(spiritualityIncrement, sequenceMultiplier);

  // Attribution (mutually exclusive):
  // - baseCategory gets seq.basePortion
  // - SEQUENCE gets seq.sequencePortion + seqOnSpirit.sequencePortion
  // - SPIRITUALITY gets seqOnSpirit.basePortion (the 1x spirituality increment)
  attr[baseCategory] += seq.basePortion;
  attr.SEQUENCE += seq.sequencePortion + seqOnSpirit.sequencePortion;
  attr.SPIRITUALITY += seqOnSpirit.basePortion;

  let payout = seq.total + seqOnSpirit.total;

  // 10. Bonus-specific multiplier (moon/miracle) — attributed to BONUS for the incremental part
  if (bonusMultiplier > 1 && payout > 0) {
    const boosted = Math.floor(payout * bonusMultiplier);
    const bonusInc = boosted - payout;
    // Re-attribute: scale categories proportionally would double-count complexity;
    // Convention: bonus mode multiplier increment → BONUS exclusively.
    attr.BONUS += bonusInc;
    payout = boosted;
  }

  // Advance Sequence AFTER applying current multiplier (one advance per winning combo this spin)
  let seqWinsAfter = sequenceWins;
  let seqMultAfter = sequenceMultiplier;
  const finalWinCombos = lineWins.length + (scatterWin ? 1 : 0);
  if (GAME_CONFIG.sequence.advanceOnWinningCombination && finalWinCombos > 0) {
    // Advance once per spin that has ≥1 winning combination (not per line),
    // to avoid unintentional multi-advance from many lines.
    const adv = advanceSequence(sequenceWins, 1);
    seqWinsAfter = adv.wins;
    seqMultAfter = adv.multiplier;
  }

  // Tick locked wilds after resolution
  const lockedWildsAfter = tickLockedWilds(workingLocked);

  const accounting: RoundAccounting = {
    wager: inBonus ? 0 : totalBet,
    totalPayout: payout,
    attribution: { ...attr },
    hit: payout > 0,
    bonusTriggered:
      !inBonus && bonusTrigger === 'FOOLS_MIRACLES'
        ? 'FOOLS_MIRACLES'
        : !inBonus && bonusTrigger === 'CHOICE'
          ? eligibleBonuses[0] ?? null
          : null,
    sequenceMultiplierApplied: sequenceMultiplier,
    spiritualityActivated: spiritualityActivation !== null,
    spiritualityEffect: spiritualityActivation?.effect ?? null,
  };

  return {
    grid: evalGrid,
    lineWins,
    scatterWin,
    scatterCount,
    payout,
    attribution: attr,
    sequenceMultiplierBefore: sequenceMultiplier,
    sequenceMultiplierAfter: seqMultAfter,
    sequenceWinsBefore: sequenceWins,
    sequenceWinsAfter: seqWinsAfter,
    spiritualityChargeBefore: spiritualityCharge,
    spiritualityChargeAfter: charge,
    spiritualityActivation,
    bonusTrigger: inBonus ? null : bonusTrigger,
    eligibleBonuses: inBonus ? [] : eligibleBonuses,
    expandedWildReels,
    accounting,
    lockedWildsAfter,
    concealed,
    graftedReel,
    graftedSymbol,
  };
}

function evaluateGridPayouts(
  grid: Grid,
  totalBet: number,
  forceExpandWilds: boolean,
  tarotWildEnhance: boolean,
  allowWildExpansion: boolean,
) {
  let work = cloneGrid(grid);
  if (forceExpandWilds) {
    // Force all wild-bearing non-scatter reels to expand
    for (let r = 0; r < work.length; r++) {
      if (work[r]!.some((s) => s === 'WILD') && !work[r]!.some((s) => s === 'SCATTER')) {
        for (let row = 0; row < work[r]!.length; row++) {
          const s = work[r]![row]!;
          if (s !== 'SEQUENCE' && s !== 'SPIRIT') work[r]![row] = 'WILD';
        }
      }
    }
  }
  const { grid: expanded, expandedReels } =
    allowWildExpansion || forceExpandWilds
      ? applyWildExpansion(work)
      : { grid: work, expandedReels: [] as number[] };
  const expandedSet = new Set(expandedReels);
  let lineWins = evaluateAllLines(expanded, totalBet, expandedSet);
  if (tarotWildEnhance) {
    lineWins = lineWins.map((w) => {
      if (!w.usedExpandedWild) return w;
      const extra = GAME_CONFIG.wild.expandedMultiplier; // already applied once; enhance adds +1 → treat as 3x total from base
      // afterWild currently = base * 2; enhance to base * 3
      const afterWildCredits = Math.floor(w.baseCredits * (extra + 1));
      return { ...w, wildMultiplier: extra + 1, afterWildCredits };
    });
  }
  const scatterWin = evaluateScatter(expanded, totalBet);
  return {
    evalGrid: expanded,
    expandedWildReels: expandedReels,
    lineWins,
    scatterWin,
  };
}
