/**
 * RTP / statistics simulator — uses the exact same resolveSpin pipeline and config.
 */
import { GAME_CONFIG, type BonusModeId } from '../config/gameConfig';
import { SeededRng, deriveSeed } from '../engine/rng';
import { resolveSpin, emptyAttribution } from '../engine/pipeline';
import {
  createBonusRuntime,
  resolveTarotPick,
  tryRetrigger,
  advanceMoonMultiplier,
  advanceMiracleMultiplier,
  addStickyWildReel,
  addStickyWildCell,
} from '../engine/bonuses';
import { resetSequence } from '../engine/sequence';
import type { Attribution, LockedWildState } from '../engine/types';

export interface SimStats {
  spins: number;
  seed: number;
  totalWagered: number;
  totalReturned: number;
  rtp: number;
  rtpByCategory: Attribution & { total: number };
  categoryRtp: Record<keyof Attribution, number>;
  hitFrequency: number;
  losingSpinFrequency: number;
  bonusTriggers: Record<BonusModeId, { count: number; totalPayout: number; avgPayout: number; frequency: number }>;
  sequenceActivations: number; // spins where mult > 1 was applied
  sequenceMultHistogram: Record<number, number>;
  spiritualityActivations: number;
  spiritualityByEffect: Record<string, number>;
  volatilityStdDev: number;
  maxWinMult: number;
  percentiles: Record<string, number>;
  rtpCI95: [number, number];
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function runSimulation(opts: {
  spins: number;
  seed?: number;
  bet?: number;
}): SimStats {
  const spins = opts.spins;
  const seed = opts.seed ?? 0x5eedcafe;
  const bet = opts.bet ?? GAME_CONFIG.defaultBet;

  let totalWagered = 0;
  let totalReturned = 0;
  const attr = emptyAttribution();
  let hits = 0;
  let spinIndex = 0;

  let sequenceWins = 0;
  let sequenceMultiplier = 1;
  let spiritualityCharge = 0;
  let lockedWilds: LockedWildState[] = [];

  const bonusTriggers: Record<
    BonusModeId,
    { count: number; totalPayout: number }
  > = {
    TAROT_CLUB: { count: 0, totalPayout: 0 },
    CRIMSON_MOON: { count: 0, totalPayout: 0 },
    FOOLS_MIRACLES: { count: 0, totalPayout: 0 },
  };

  let sequenceActivations = 0;
  const sequenceMultHistogram: Record<number, number> = {};
  let spiritualityActivations = 0;
  const spiritualityByEffect: Record<string, number> = {};

  const winMultiples: number[] = [];

  const playBonus = (
    mode: BonusModeId,
    rngBaseSpin: number,
  ): { payout: number; attribution: Attribution } => {
    let bonus = createBonusRuntime(mode);
    let payout = 0;
    const a = emptyAttribution();
    let localSpin = rngBaseSpin;

    // All bonuses use gathering/free spins via resolveSpin (matches SlotGame.bonusSpin).
    // Tarot Club additionally draws one table reward after each reel result.
    while (bonus.spinsRemaining > 0) {
      bonus.spinsRemaining -= 1;
      bonus.spinsPlayed += 1;
      localSpin += 1;
      const rng = new SeededRng(deriveSeed(seed, localSpin));
      if (mode === 'CRIMSON_MOON') {
        if (GAME_CONFIG.bonuses.crimsonMoon.stickyMode === 'cell') {
          bonus = addStickyWildCell(bonus, rng);
        } else {
          bonus = addStickyWildReel(bonus, rng);
        }
      }

      const bonusMult =
        mode === 'CRIMSON_MOON'
          ? bonus.moonMultiplier
          : mode === 'FOOLS_MIRACLES'
            ? bonus.miracleMultiplier
            : mode === 'TAROT_CLUB'
              ? Math.max(1, bonus.tarotRunningMultiplier)
              : 1;

      const result = resolveSpin({
        rng,
        totalBet: bet,
        sequenceWins,
        sequenceMultiplier,
        spiritualityCharge,
        lockedWilds,
        inBonus: true,
        bonusMultiplier: bonusMult,
        forceExpandWilds:
          mode === 'FOOLS_MIRACLES' &&
          GAME_CONFIG.bonuses.foolsMiracles.forceExpandWilds,
        allowWildExpansion: mode !== 'CRIMSON_MOON',
        stickyWildReels: bonus.stickyWildReels,
        stickyWildCells: bonus.stickyWildCells,
        tarotWildEnhance: mode === 'TAROT_CLUB' && bonus.tarotWildEnhance,
        allowSpirituality: true,
        chargeInBonus: GAME_CONFIG.spirituality.chargeInBonus,
      });

      sequenceWins = result.sequenceWinsAfter;
      sequenceMultiplier = result.sequenceMultiplierAfter;
      spiritualityCharge = result.spiritualityChargeAfter;
      lockedWilds = result.lockedWildsAfter;
      payout += result.payout;
      a.BASE += result.attribution.BASE;
      a.BONUS += result.attribution.BONUS;
      a.SEQUENCE += result.attribution.SEQUENCE;
      a.SPIRITUALITY += result.attribution.SPIRITUALITY;

      if (result.spiritualityActivation) {
        spiritualityActivations += 1;
        const e = result.spiritualityActivation.effect;
        spiritualityByEffect[e] = (spiritualityByEffect[e] ?? 0) + 1;
      }

      if (mode === 'TAROT_CLUB') {
        const pick = resolveTarotPick(rng, bonus, bet);
        bonus = pick.bonus;
        if (pick.creditsAwarded > 0) {
          payout += pick.creditsAwarded;
          a.BONUS += pick.creditsAwarded;
        }
        if (bonus.tarotPicksRemaining > bonus.spinsRemaining) {
          bonus.spinsRemaining = bonus.tarotPicksRemaining;
        }
      } else {
        bonus = tryRetrigger(bonus, result.scatterCount);
        const hadPay = result.payout > 0;
        if (mode === 'CRIMSON_MOON') bonus = advanceMoonMultiplier(bonus, hadPay);
        if (mode === 'FOOLS_MIRACLES') bonus = advanceMiracleMultiplier(bonus, hadPay);
      }
      bonus.totalWon += result.payout;
    }

    // Reset sequence after bonus
    const r = resetSequence();
    sequenceWins = r.wins;
    sequenceMultiplier = r.multiplier;

    return { payout, attribution: a };
  };

  for (let i = 0; i < spins; i++) {
    spinIndex += 1;
    totalWagered += bet;

    const rng = new SeededRng(deriveSeed(seed, spinIndex));
    const result = resolveSpin({
      rng,
      totalBet: bet,
      sequenceWins,
      sequenceMultiplier,
      spiritualityCharge,
      lockedWilds,
      inBonus: false,
      bonusMultiplier: 1,
      forceExpandWilds: false,
      allowWildExpansion: true,
      stickyWildReels: [],
      stickyWildCells: [],
      tarotWildEnhance: false,
      allowSpirituality: true,
      chargeInBonus: false,
    });

    sequenceWins = result.sequenceWinsAfter;
    sequenceMultiplier = result.sequenceMultiplierAfter;
    spiritualityCharge = result.spiritualityChargeAfter;
    lockedWilds = result.lockedWildsAfter;

    let roundReturn = result.payout;
    attr.BASE += result.attribution.BASE;
    attr.BONUS += result.attribution.BONUS;
    attr.SEQUENCE += result.attribution.SEQUENCE;
    attr.SPIRITUALITY += result.attribution.SPIRITUALITY;

    if (result.sequenceMultiplierBefore > 1) sequenceActivations += 1;
    sequenceMultHistogram[result.sequenceMultiplierBefore] =
      (sequenceMultHistogram[result.sequenceMultiplierBefore] ?? 0) + 1;

    if (result.spiritualityActivation) {
      spiritualityActivations += 1;
      const e = result.spiritualityActivation.effect;
      spiritualityByEffect[e] = (spiritualityByEffect[e] ?? 0) + 1;
    }

    // Auto-resolve bonus choice: alternate Tarot / Crimson for choice; Fools direct
    if (result.bonusTrigger === 'FOOLS_MIRACLES') {
      const b = playBonus('FOOLS_MIRACLES', spinIndex);
      spinIndex += 50; // advance counter past bonus internal spins
      roundReturn += b.payout;
      attr.BASE += b.attribution.BASE;
      attr.BONUS += b.attribution.BONUS;
      attr.SEQUENCE += b.attribution.SEQUENCE;
      attr.SPIRITUALITY += b.attribution.SPIRITUALITY;
      bonusTriggers.FOOLS_MIRACLES.count += 1;
      bonusTriggers.FOOLS_MIRACLES.totalPayout += b.payout;
    } else if (result.bonusTrigger === 'CHOICE') {
      const mode: BonusModeId = i % 2 === 0 ? 'TAROT_CLUB' : 'CRIMSON_MOON';
      const b = playBonus(mode, spinIndex);
      spinIndex += 50;
      roundReturn += b.payout;
      attr.BASE += b.attribution.BASE;
      attr.BONUS += b.attribution.BONUS;
      attr.SEQUENCE += b.attribution.SEQUENCE;
      attr.SPIRITUALITY += b.attribution.SPIRITUALITY;
      bonusTriggers[mode].count += 1;
      bonusTriggers[mode].totalPayout += b.payout;
    }

    totalReturned += roundReturn;
    if (roundReturn > 0) hits += 1;
    winMultiples.push(roundReturn / bet);
  }

  const rtp = totalWagered > 0 ? totalReturned / totalWagered : 0;
  const sorted = [...winMultiples].sort((a, b) => a - b);
  const sd = stddev(winMultiples);
  // 95% CI for RTP via normal approx on mean win multiple
  const se = sd / Math.sqrt(spins);
  const ci: [number, number] = [rtp - 1.96 * se, rtp + 1.96 * se];

  const categoryRtp = {
    BASE: attr.BASE / totalWagered,
    BONUS: attr.BONUS / totalWagered,
    SEQUENCE: attr.SEQUENCE / totalWagered,
    SPIRITUALITY: attr.SPIRITUALITY / totalWagered,
  };

  const bonusOut = {} as SimStats['bonusTriggers'];
  for (const k of Object.keys(bonusTriggers) as BonusModeId[]) {
    const t = bonusTriggers[k];
    bonusOut[k] = {
      count: t.count,
      totalPayout: t.totalPayout,
      avgPayout: t.count ? t.totalPayout / t.count : 0,
      frequency: t.count / spins,
    };
  }

  return {
    spins,
    seed,
    totalWagered,
    totalReturned,
    rtp,
    rtpByCategory: { ...attr, total: attr.BASE + attr.BONUS + attr.SEQUENCE + attr.SPIRITUALITY },
    categoryRtp,
    hitFrequency: hits / spins,
    losingSpinFrequency: 1 - hits / spins,
    bonusTriggers: bonusOut,
    sequenceActivations,
    sequenceMultHistogram,
    spiritualityActivations,
    spiritualityByEffect,
    volatilityStdDev: sd,
    maxWinMult: sorted[sorted.length - 1] ?? 0,
    percentiles: {
      p50: percentile(sorted, 0.5),
      p90: percentile(sorted, 0.9),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      p99_9: percentile(sorted, 0.999),
    },
    rtpCI95: ci,
  };
}

/**
 * Theoretical base-game RTP approximation via reel-strip enumeration
 * of stop positions (independent reels). Does not include Sequence,
 * Spirituality state, or bonus lifecycles — those require Monte Carlo.
 */
export function theoreticalBaseLineRtp(bet: number = GAME_CONFIG.defaultBet): {
  lineRtp: number;
  scatterRtp: number;
  combinedBaseApprox: number;
  totalCombos: number;
} {
  // Full 5-reel enumeration of strip stops is feasible if strips ~60: 60^5 = 777.6M — too heavy.
  // Instead sample densely with a fixed seed for "theoretical Monte Carlo" of base-only
  // (no sequence/spirit/bonus) OR enumerate with reduced approach.
  // We provide an exact-per-line expected value sampling of 2M independent base spins
  // without stateful features for analytics documentation.
  const samples = 2_000_000;
  const seed = 0x7e07e711;
  let returned = 0;
  let scatterReturned = 0;
  let lineReturned = 0;
  // Use pipeline with sequence locked at 1x, no spirituality charge, no bonus
  for (let i = 0; i < samples; i++) {
    const rng = new SeededRng(deriveSeed(seed, i + 1));
    const result = resolveSpin({
      rng,
      totalBet: bet,
      sequenceWins: 0,
      sequenceMultiplier: 1,
      spiritualityCharge: 0,
      lockedWilds: [],
      inBonus: false,
      bonusMultiplier: 1,
      forceExpandWilds: false,
      allowWildExpansion: true,
      stickyWildReels: [],
      stickyWildCells: [],
      tarotWildEnhance: false,
      allowSpirituality: false,
      chargeInBonus: false,
    });
    // Attribute only BASE (no sequence/spirit)
    lineReturned += result.lineWins.reduce((s, w) => s + w.afterWildCredits, 0);
    scatterReturned += result.scatterWin?.baseCredits ?? 0;
    returned += result.attribution.BASE;
  }
  const wagered = samples * bet;
  return {
    lineRtp: lineReturned / wagered,
    scatterRtp: scatterReturned / wagered,
    combinedBaseApprox: returned / wagered,
    totalCombos: samples,
  };
}
