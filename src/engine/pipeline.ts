import {
  GAME_CONFIG,
  HIGH_SYMBOLS,
  type SymbolId,
  type SpiritualityEffectId,
} from '../config/gameConfig';
import type {
  Attribution,
  Grid,
  HistoricalVoidEntry,
  LockedWildState,
  RoundAccounting,
  SpinResult,
  SpiritualityActivation,
} from './types';
import type { CascadeStep } from './cascade';
import { SeededRng } from './rng';
import { cloneGrid, countSymbol, spinReels } from './reels';
import { evaluateAllLines, evaluateScatter, countScatters } from './paylines';
import { applyWildExpansion, applyLockedWilds } from './wilds';
import { applySequenceMultiplier, advanceSequence } from './sequence';
import {
  addCharge,
  shouldActivate,
  activateSpirituality,
  tryCreepingHunger,
  tickLockedWilds,
} from './spirituality';
import { eligibleBonusesForScatterCount, applyStickyTarot } from './bonuses';
import { resolveCascades } from './cascade';

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
  /** Extra bonus multiplier (moon / miracle / tarot card). */
  bonusMultiplier: number;
  /** Force expand all wilds (legacy Fool's Miracles). */
  forceExpandWilds: boolean;
  /** When false, skip Fool's Mirror reel expansion (e.g. Crimson sticky cells). */
  allowWildExpansion: boolean;
  /** Sticky wild reels (legacy). */
  stickyWildReels: number[];
  /** Sticky wild cells. */
  stickyWildCells: { reel: number; row: number }[];
  /** Mode A sticky tarot members. */
  stickyTarotCells?: { reel: number; row: number; symbol: SymbolId }[];
  /** Tarot wild enhance: treat expanded wild multiplier as +1. */
  tarotWildEnhance: boolean;
  /** Optional forced grid (tests / cheats). */
  forceGrid?: Grid | null;
  /** Dev: force a specific Spirituality effect on activation. */
  forceSpiritualityEffect?: SpiritualityEffectId | null;
  /** Whether Spirituality may activate this spin. */
  allowSpirituality: boolean;
  /** Pre-existing charge earning context. */
  chargeInBonus: boolean;
  /** Enable Crimson Moon avalanche cascades. */
  cascadeEnabled?: boolean;
  /** Fool's Miracles: paint 3×3 Fool throne. */
  foolsThrone?: boolean;
  /** Historical Void buffer to inject during Fool's Miracles. */
  historicalVoid?: HistoricalVoidEntry[];
  /** Soft max-win remaining for this bonus (credits); null = uncapped. */
  maxWinRemaining?: number | null;
}

/**
 * Single central resolution pipeline for Sefirah Castle Sanctum.
 */
export function resolveSpin(input: PipelineInput): SpinResult & {
  lockedWildsAfter: LockedWildState[];
  concealed: { reel: number; row: number }[] | null;
  graftedReel: number | null;
  graftedSymbol: SymbolId | null;
  historicalVoidDelta: HistoricalVoidEntry[];
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
    stickyTarotCells = [],
    tarotWildEnhance,
    forceGrid,
    forceSpiritualityEffect,
    allowSpirituality,
    cascadeEnabled = false,
    foolsThrone = false,
    historicalVoid = [],
    maxWinRemaining = null,
  } = input;

  // 1. Base outcome
  let grid = forceGrid ? cloneGrid(forceGrid) : spinReels(rng);

  // Fool's Miracles: 3×3 Fool on central throne
  if (foolsThrone) {
    grid = cloneGrid(grid);
    const throne = GAME_CONFIG.bonuses.foolsMiracles.foolThrone;
    for (const r of throne.reels) {
      for (const row of throne.rows) {
        if (grid[r]![row] !== 'SCATTER') {
          grid[r]![row] = throne.symbol;
        }
      }
    }
  }

  // Historical Void injection
  if (historicalVoid.length > 0 && foolsThrone) {
    grid = injectHistoricalVoid(grid, historicalVoid, rng);
  }

  // Apply sticky wilds / tarot
  if (
    stickyWildReels.length > 0 ||
    stickyWildCells.length > 0 ||
    stickyTarotCells.length > 0
  ) {
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
    if (stickyTarotCells.length > 0) {
      grid = applyStickyTarot(grid, stickyTarotCells);
    }
  }

  // Apply existing locked wilds
  const activeLocked = lockedWilds.filter((lw) => lw.remainingSpins > 0);
  grid = applyLockedWilds(
    grid,
    activeLocked.map((lw) => ({ reel: lw.reel, row: lw.row })),
  );

  let charge = spiritualityCharge;
  let spiritualityActivation: SpiritualityActivation | null = null;
  let concealed: { reel: number; row: number }[] | null = null;
  let graftedReel: number | null = null;
  let graftedSymbol: SymbolId | null = null;
  let workingLocked = activeLocked;
  let spiritualityGridModified = false;

  const preFeatureGrid = cloneGrid(grid);
  const forceSpirit = allowSpirituality && forceSpiritualityEffect != null;
  const preArmed =
    allowSpirituality &&
    GAME_CONFIG.spirituality.maxActivationsPerSpin >= 1 &&
    (forceSpirit || shouldActivate(spiritualityCharge));

  if (preArmed) {
    if (forceSpirit && !shouldActivate(charge)) {
      charge = GAME_CONFIG.spirituality.threshold;
    }
    const act = activateSpirituality(
      rng,
      grid,
      workingLocked,
      forceSpiritualityEffect,
    );
    charge = act.charge;
    spiritualityActivation = act.activation;
    grid = act.grid;
    workingLocked = act.lockedWilds;
    concealed = act.concealed;
    graftedReel = act.graftedReel;
    graftedSymbol = act.graftedSymbol;
    spiritualityGridModified = true;
  }

  // Creeping Hunger: Glove + Monster on the grid (independent of meter)
  const hunger = tryCreepingHunger(rng, grid, workingLocked);
  if (hunger.triggered) {
    grid = hunger.grid;
    workingLocked = hunger.lockedWilds;
    spiritualityGridModified = true;
    // Prefer showing Creeping Hunger if it fired (or attach if no spirit effect)
    if (!spiritualityActivation) {
      spiritualityActivation = hunger.activation;
    } else if (hunger.activation) {
      spiritualityActivation = {
        ...spiritualityActivation,
        detail: {
          ...spiritualityActivation.detail,
          creepingHunger: hunger.activation.detail,
        },
      };
    }
  }

  const baselineEval = evaluateGridPayouts(
    preFeatureGrid,
    totalBet,
    forceExpandWilds,
    tarotWildEnhance,
    allowWildExpansion,
  );
  const spiritSymbols = countSymbol(preFeatureGrid, 'SPIRIT');

  // Charge from this spin — non-winning spins (+ SPIRIT) feed the meter for next spin.
  const winCombos =
    baselineEval.lineWins.length + (baselineEval.scatterWin ? 1 : 0);
  const mayCharge = !inBonus || GAME_CONFIG.spirituality.chargeInBonus;
  if (mayCharge && !spiritualityActivation) {
    const winCharge =
      winCombos > 0
        ? GAME_CONFIG.spirituality.chargePerWin
        : GAME_CONFIG.spirituality.chargePerNonWin;
    charge = addCharge(
      charge,
      winCharge + spiritSymbols * GAME_CONFIG.spirituality.chargePerSpiritSymbol,
    );
  }

  // Cascading Crimson Moon path
  let cascadeSteps: CascadeStep[] | null = null;
  let evalGrid: Grid;
  let expandedWildReels: number[];
  let lineWins = baselineEval.lineWins;
  let scatterWin = baselineEval.scatterWin;
  let combinedAfterWild = 0;

  if (cascadeEnabled) {
    const { grid: expanded, expandedReels } =
      allowWildExpansion || forceExpandWilds
        ? applyWildExpansion(grid)
        : { grid: cloneGrid(grid), expandedReels: [] as number[] };
    const cascade = resolveCascades(
      expanded,
      totalBet,
      new Set(expandedReels),
      rng,
    );
    cascadeSteps = cascade.steps;
    evalGrid = cascade.finalGrid;
    expandedWildReels = expandedReels;
    lineWins = cascade.lineWins;
    scatterWin = cascade.scatterWin;
    combinedAfterWild = cascade.totalCredits;
  } else {
    const finalEval = evaluateGridPayouts(
      grid,
      totalBet,
      forceExpandWilds,
      tarotWildEnhance,
      allowWildExpansion,
    );
    evalGrid = finalEval.evalGrid;
    expandedWildReels = finalEval.expandedWildReels;
    lineWins = finalEval.lineWins;
    scatterWin = finalEval.scatterWin;
    const lineCreditsAfterWild = lineWins.reduce(
      (s, w) => s + w.afterWildCredits,
      0,
    );
    combinedAfterWild = lineCreditsAfterWild + (scatterWin?.baseCredits ?? 0);
  }

  const scatterCount = countScatters(evalGrid);

  // Spirituality incremental: difference in after-wild line+scatter credits
  const baselineAfterWild =
    baselineEval.lineWins.reduce((s, w) => s + w.afterWildCredits, 0) +
    (baselineEval.scatterWin?.baseCredits ?? 0);
  let spiritualityIncrement = spiritualityGridModified
    ? Math.max(0, combinedAfterWild - baselineAfterWild)
    : 0;
  // Cascades attribute their full combined as the win pool; spirituality delta
  // is still isolated when features modified the pre-cascade grid.
  if (cascadeEnabled && spiritualityGridModified) {
    // Use first cascade step's pre-mult credits vs baseline if available
    const first = cascadeSteps?.[0];
    if (first) {
      const firstRaw =
        first.lineWins.reduce((s, w) => s + w.afterWildCredits, 0) +
        (first.scatterWin?.baseCredits ?? 0);
      spiritualityIncrement = Math.max(0, firstRaw - baselineAfterWild);
    }
  }

  const { trigger: bonusTrigger, bonuses: eligibleBonuses } =
    eligibleBonusesForScatterCount(scatterCount);

  const attr = emptyAttribution();
  const baseCategory: keyof Attribution = inBonus ? 'BONUS' : 'BASE';

  // Sequence multiplies base-game payouts only (permanent meter; does not inflate bonuses).
  const seqMultApplied = inBonus ? 1 : sequenceMultiplier;
  const afterWildForSeq = Math.max(0, combinedAfterWild - spiritualityIncrement);
  const seq = applySequenceMultiplier(afterWildForSeq, seqMultApplied);
  const seqOnSpirit = applySequenceMultiplier(
    spiritualityIncrement,
    seqMultApplied,
  );

  attr[baseCategory] += seq.basePortion;
  attr.SEQUENCE += seq.sequencePortion + seqOnSpirit.sequencePortion;
  attr.SPIRITUALITY += seqOnSpirit.basePortion;

  let payout = seq.total + seqOnSpirit.total;

  if (bonusMultiplier > 1 && payout > 0) {
    const boosted = Math.floor(payout * bonusMultiplier);
    const bonusInc = boosted - payout;
    attr.BONUS += bonusInc;
    payout = boosted;
  }

  // Soft max-win clamp (bonus session)
  if (maxWinRemaining != null && payout > maxWinRemaining) {
    const scale = maxWinRemaining / payout;
    payout = maxWinRemaining;
    attr.BASE = Math.floor(attr.BASE * scale);
    attr.BONUS = Math.floor(attr.BONUS * scale);
    attr.SEQUENCE = Math.floor(attr.SEQUENCE * scale);
    attr.SPIRITUALITY = Math.floor(attr.SPIRITUALITY * scale);
    // Fix rounding so categories still sum
    const sum = attr.BASE + attr.BONUS + attr.SEQUENCE + attr.SPIRITUALITY;
    if (sum !== payout) attr.BONUS += payout - sum;
  }

  // Advance Sequence by Potion Bottles on the final grid (permanent; base + bonus).
  let seqWinsAfter = sequenceWins;
  let seqMultAfter = sequenceMultiplier;
  if (GAME_CONFIG.sequence.advanceOnPotionBottles) {
    const potions = countSymbol(evalGrid, 'SEQUENCE');
    if (potions > 0) {
      const adv = advanceSequence(sequenceWins, potions);
      seqWinsAfter = adv.wins;
      seqMultAfter = adv.multiplier;
    }
  }

  const lockedWildsAfter = tickLockedWilds(workingLocked);

  // Historical Void: record highs from non-winning base spins
  const historicalVoidDelta: HistoricalVoidEntry[] = [];
  if (!inBonus && payout === 0) {
    const highs = new Set(HIGH_SYMBOLS as readonly SymbolId[]);
    for (let r = 0; r < evalGrid.length; r++) {
      for (let row = 0; row < evalGrid[r]!.length; row++) {
        const s = evalGrid[r]![row]!;
        if (highs.has(s)) {
          historicalVoidDelta.push({ symbol: s, reel: r, row });
        }
      }
    }
  }

  const accounting: RoundAccounting = {
    wager: inBonus ? 0 : totalBet,
    totalPayout: payout,
    attribution: { ...attr },
    hit: payout > 0,
    bonusTriggered:
      !inBonus && bonusTrigger === 'FOOLS_MIRACLES'
        ? 'FOOLS_MIRACLES'
        : !inBonus && bonusTrigger === 'CRIMSON_MOON'
          ? 'CRIMSON_MOON'
          : null,
    sequenceMultiplierApplied: seqMultApplied,
    spiritualityActivated: spiritualityActivation !== null,
    spiritualityEffect: spiritualityActivation?.effect ?? null,
  };

  return {
    grid: evalGrid,
    preFeatureGrid:
      spiritualityActivation || hunger.triggered ? preFeatureGrid : null,
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
    cascadeSteps,
    accounting,
    lockedWildsAfter,
    concealed,
    graftedReel,
    graftedSymbol,
    historicalVoidDelta,
  };
}

function injectHistoricalVoid(
  grid: Grid,
  voidBuf: HistoricalVoidEntry[],
  rng: SeededRng,
): Grid {
  const next = cloneGrid(grid);
  const cfg = GAME_CONFIG.historicalVoid;
  const picks = rng.shuffle([...voidBuf]).slice(0, cfg.injectCount);
  for (const entry of picks) {
    const reel = Math.max(0, Math.min(GAME_CONFIG.reels - 1, entry.reel));
    const row = Math.max(0, Math.min(GAME_CONFIG.rows - 1, entry.row));
    if (next[reel]![row] === 'SCATTER') continue;
    if (rng.next() < cfg.voidWildChance) {
      next[reel]![row] = 'WILD'; // Void Wild
    } else {
      next[reel]![row] = entry.symbol;
    }
  }
  return next;
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
    for (let r = 0; r < work.length; r++) {
      if (
        work[r]!.some((s) => s === 'WILD') &&
        !work[r]!.some((s) => s === 'SCATTER')
      ) {
        for (let row = 0; row < work[r]!.length; row++) {
          const s = work[r]![row]!;
          if (
            s !== 'SEQUENCE' &&
            s !== 'SPIRIT' &&
            s !== 'GLOVE' &&
            s !== 'MONSTER'
          ) {
            work[r]![row] = 'WILD';
          }
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
      const extra = GAME_CONFIG.wild.expandedMultiplier;
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
