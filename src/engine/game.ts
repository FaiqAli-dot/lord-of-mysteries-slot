import {
  GAME_CONFIG,
  type BonusModeId,
  type SpiritualityEffectId,
  type SymbolId,
} from '../config/gameConfig';
import type {
  Attribution,
  GameState,
  Grid,
  SpinResult,
  TarotPickReward,
} from './types';
import { SeededRng, deriveSeed } from './rng';
import { spinReels } from './reels';
import { emptyAttribution, resolveSpin } from './pipeline';
import {
  createBonusRuntime,
  resolveTarotPick,
  tryRetrigger,
  advanceMoonMultiplier,
  advanceMiracleMultiplier,
  addStickyWildReel,
  addStickyWildCell,
} from './bonuses';
import { resetSequence, sequenceMultiplierForWins } from './sequence';

function fillGrid(sym: SymbolId): Grid {
  return Array.from({ length: GAME_CONFIG.reels }, () =>
    Array.from({ length: GAME_CONFIG.rows }, () => sym),
  );
}

const STORAGE_KEY = 'pathways-of-the-sealed-v1';

export interface PersistedSettings {
  balance: number;
  bet: number;
  muted: boolean;
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

function defaultState(seed?: number): GameState {
  const s = seed ?? randomSeed();
  return {
    phase: 'IDLE',
    balance: GAME_CONFIG.startingBalance,
    bet: GAME_CONFIG.defaultBet,
    seed: s,
    spinCount: 0,
    // Idle board = real strip sample (not the fixed strip-head mock pattern)
    grid: spinReels(new SeededRng(s ^ 0x9e3779b9)),
    lastLineWins: [],
    lastScatterWin: null,
    lastPayout: 0,
    lastAttribution: emptyAttribution(),
    sequenceWins: 0,
    sequenceMultiplier: 1,
    spiritualityCharge: 0,
    lockedWilds: [],
    pendingBonusChoices: null,
    bonus: null,
    lastFeature: null,
    concealedPositions: null,
    graftedReel: null,
    graftedSymbol: null,
    lastPreFeatureGrid: null,
    muted: false,
    reducedMotion: false,
    forceGrid: null,
    forceSpiritualityEffect: null,
  };
}

export interface SlotGameOptions {
  seed?: number;
  /** When false (server), skip browser localStorage. Default true in browser. */
  persist?: boolean;
}

export class SlotGame {
  state: GameState;
  lastResult: SpinResult | null = null;
  listeners: Set<() => void> = new Set();
  private readonly persistEnabled: boolean;

  constructor(seedOrOpts?: number | SlotGameOptions) {
    const opts: SlotGameOptions =
      typeof seedOrOpts === 'number' ? { seed: seedOrOpts } : (seedOrOpts ?? {});
    this.persistEnabled =
      opts.persist !== false && typeof globalThis.localStorage !== 'undefined';
    this.state = defaultState(opts.seed);
    if (this.persistEnabled) this.hydrate();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    if (this.persistEnabled) this.persist();
    for (const fn of this.listeners) fn();
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedSettings;
      // Only restore bet/mute. Seed must stay fresh each load — restoring seed
      // without spinCount made every reload replay the same first spin.
      if (typeof data.bet === 'number' && (GAME_CONFIG.betOptions as readonly number[]).includes(data.bet)) {
        this.state.bet = data.bet;
      }
      if (typeof data.muted === 'boolean') this.state.muted = data.muted;
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    try {
      const data: PersistedSettings = {
        balance: this.state.balance,
        bet: this.state.bet,
        muted: this.state.muted,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  /** Replace state from a public API snapshot (client mirror). */
  applyPublicState(state: GameState): void {
    this.state = {
      ...structuredClone(state),
      reducedMotion: this.state.reducedMotion,
    };
    this.emit();
  }

  setBet(bet: number): void {
    if (this.state.phase !== 'IDLE') return;
    if (!(GAME_CONFIG.betOptions as readonly number[]).includes(bet)) return;
    this.state.bet = bet as (typeof GAME_CONFIG.betOptions)[number];
    this.emit();
  }

  adjustBet(dir: 1 | -1): void {
    const opts = GAME_CONFIG.betOptions as readonly number[];
    const idx = opts.indexOf(this.state.bet);
    const next = opts[Math.max(0, Math.min(opts.length - 1, idx + dir))];
    if (next !== undefined) this.setBet(next);
  }

  setMuted(muted: boolean): void {
    this.state.muted = muted;
    this.emit();
  }

  setReducedMotion(v: boolean): void {
    this.state.reducedMotion = v;
    this.emit();
  }

  resetDemo(): void {
    const muted = this.state.muted;
    const bet = this.state.bet;
    this.state = defaultState();
    this.state.muted = muted;
    this.state.bet = bet;
    this.lastResult = null;
    this.emit();
  }

  canSpin(): boolean {
    return (
      this.state.phase === 'IDLE' &&
      this.state.balance >= this.state.bet &&
      this.state.bonus === null
    );
  }

  /**
   * Base-game spin lifecycle:
   * validate → deduct → generate → evaluate → features → credit → UI
   */
  spin(): SpinResult | null {
    if (!this.canSpin()) return null;

    this.state.phase = 'SPINNING';
    this.state.concealedPositions = null;
    this.state.graftedReel = null;
    this.state.graftedSymbol = null;
    this.state.lastFeature = null;
    this.state.lastPayout = 0;
    this.emit();

    // Deduct wager (integer credits)
    this.state.balance -= this.state.bet;
    this.state.spinCount += 1;

    const rng = new SeededRng(deriveSeed(this.state.seed, this.state.spinCount));
    const result = resolveSpin({
      rng,
      totalBet: this.state.bet,
      sequenceWins: this.state.sequenceWins,
      sequenceMultiplier: this.state.sequenceMultiplier,
      spiritualityCharge: this.state.spiritualityCharge,
      lockedWilds: this.state.lockedWilds,
      inBonus: false,
      bonusMultiplier: 1,
      forceExpandWilds: false,
      allowWildExpansion: true,
      stickyWildReels: [],
      stickyWildCells: [],
      tarotWildEnhance: false,
      forceGrid: this.state.forceGrid,
      forceSpiritualityEffect: this.state.forceSpiritualityEffect,
      allowSpirituality: true,
      chargeInBonus: false,
    });
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = null;

    this.applyResult(result);

    // Bonus trigger handling
    if (result.bonusTrigger === 'FOOLS_MIRACLES') {
      this.enterBonus('FOOLS_MIRACLES');
    } else if (result.bonusTrigger === 'CHOICE') {
      this.state.phase = 'BONUS_SELECT';
      this.state.pendingBonusChoices = result.eligibleBonuses;
    } else {
      this.state.phase = 'IDLE';
    }

    this.lastResult = result;
    this.emit();
    return result;
  }

  selectBonus(mode: BonusModeId): void {
    if (this.state.phase !== 'BONUS_SELECT') return;
    if (!this.state.pendingBonusChoices?.includes(mode)) return;
    this.state.pendingBonusChoices = null;
    this.enterBonus(mode);
    this.emit();
  }

  private enterBonus(mode: BonusModeId): void {
    this.state.bonus = createBonusRuntime(mode);
    this.state.phase = 'BONUS_ACTIVE';
  }

  /**
   * Tarot Club gathering step (API compat) — same real resolveSpin path as bonusSpin.
   */
  tarotPick(): { reward: TarotPickReward; credits: number } | null {
    if (this.state.phase !== 'BONUS_ACTIVE' || this.state.bonus?.mode !== 'TAROT_CLUB') {
      return null;
    }
    const result = this.bonusSpin();
    if (!result || !this.state.bonus) return null;
    const last = this.state.bonus.tarotHistory[this.state.bonus.tarotHistory.length - 1];
    if (!last) return null;
    return { reward: last, credits: result.payout };
  }

  /**
   * Bonus free / gathering spin for ALL modes.
   * Always uses resolveSpin (same engine as base game + server) — never a decorative mock grid.
   * Tarot Club additionally draws one gathering-table reward after the reel result.
   */
  bonusSpin(): SpinResult | null {
    if (this.state.phase !== 'BONUS_ACTIVE' || !this.state.bonus) return null;
    const mode = this.state.bonus.mode;
    if (this.state.bonus.spinsRemaining <= 0) return null;

    this.state.phase = 'SPINNING';
    this.emit();

    let bonus = { ...this.state.bonus };
    bonus.spinsRemaining -= 1;
    bonus.spinsPlayed += 1;

    this.state.spinCount += 1;
    const rng = new SeededRng(deriveSeed(this.state.seed, this.state.spinCount));

    if (mode === 'CRIMSON_MOON' && GAME_CONFIG.bonuses.crimsonMoon.stickyWildPerSpin) {
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
      totalBet: this.state.bet,
      sequenceWins: this.state.sequenceWins,
      sequenceMultiplier: this.state.sequenceMultiplier,
      spiritualityCharge: this.state.spiritualityCharge,
      lockedWilds: this.state.lockedWilds,
      inBonus: true,
      bonusMultiplier: bonusMult,
      forceExpandWilds:
        mode === 'FOOLS_MIRACLES' && GAME_CONFIG.bonuses.foolsMiracles.forceExpandWilds,
      allowWildExpansion: mode !== 'CRIMSON_MOON',
      stickyWildReels: bonus.stickyWildReels,
      stickyWildCells: bonus.stickyWildCells,
      tarotWildEnhance: mode === 'TAROT_CLUB' && bonus.tarotWildEnhance,
      forceGrid: null,
      allowSpirituality: true,
      chargeInBonus: GAME_CONFIG.spirituality.chargeInBonus,
    });

    this.applyResult(result);
    bonus.totalWon += result.payout;

    // Tarot gathering card — real modifiers / credit prize on top of reel math
    if (mode === 'TAROT_CLUB') {
      const { bonus: next, creditsAwarded } = resolveTarotPick(
        rng,
        bonus,
        this.state.bet,
      );
      bonus = next;
      if (creditsAwarded > 0) {
        this.state.balance += creditsAwarded;
        this.state.lastPayout += creditsAwarded;
        this.state.lastAttribution = {
          ...this.state.lastAttribution,
          BONUS: this.state.lastAttribution.BONUS + creditsAwarded,
        };
        bonus.totalWon += creditsAwarded;
        result.payout += creditsAwarded;
        result.attribution.BONUS += creditsAwarded;
        result.accounting.totalPayout += creditsAwarded;
        result.accounting.attribution.BONUS += creditsAwarded;
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

    this.state.bonus = bonus;
    this.lastResult = result;

    if (bonus.spinsRemaining <= 0) {
      this.completeBonus();
    } else {
      this.state.phase = 'BONUS_ACTIVE';
    }
    this.emit();
    return result;
  }

  private completeBonus(): void {
    // Reset Sequence after every completed bonus
    if (GAME_CONFIG.bonuses.resetSequenceOnComplete) {
      const r = resetSequence();
      this.state.sequenceWins = r.wins;
      this.state.sequenceMultiplier = r.multiplier;
    }
    this.state.phase = 'BONUS_SUMMARY';
  }

  acknowledgeBonusSummary(): void {
    if (this.state.phase !== 'BONUS_SUMMARY') return;
    this.state.bonus = null;
    this.state.phase = 'IDLE';
    this.emit();
  }

  private applyResult(result: SpinResult & {
    lockedWildsAfter?: GameState['lockedWilds'];
    concealed?: GameState['concealedPositions'];
    graftedReel?: number | null;
    graftedSymbol?: GameState['graftedSymbol'];
  }): void {
    this.state.grid = result.grid;
    this.state.lastPreFeatureGrid = result.preFeatureGrid;
    this.state.lastLineWins = result.lineWins;
    this.state.lastScatterWin = result.scatterWin;
    this.state.lastPayout = result.payout;
    this.state.lastAttribution = result.attribution;
    this.state.sequenceWins = result.sequenceWinsAfter;
    this.state.sequenceMultiplier = result.sequenceMultiplierAfter;
    this.state.spiritualityCharge = result.spiritualityChargeAfter;
    this.state.lastFeature = result.spiritualityActivation;
    if (result.lockedWildsAfter) this.state.lockedWilds = result.lockedWildsAfter;
    if (result.concealed !== undefined) this.state.concealedPositions = result.concealed;
    if (result.graftedReel !== undefined) this.state.graftedReel = result.graftedReel;
    if (result.graftedSymbol !== undefined) this.state.graftedSymbol = result.graftedSymbol;

    // Credit payout
    this.state.balance += result.payout;
  }

  /** Test helper: force next grid. */
  debugForceGrid(grid: Grid): void {
    this.state.forceGrid = grid;
    this.emit();
  }

  /** Fill Spirituality meter to threshold (UI + next spin). */
  debugFillSpirituality(): void {
    this.state.spiritualityCharge = GAME_CONFIG.spirituality.threshold;
    this.emit();
  }

  /** Force next Spirituality effect (also fills meter so it fires on next spin). */
  debugForceSpiritualityEffect(effect: SpiritualityEffectId): void {
    // Clear forced grids — Spirituality must run on a real random reel result.
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = effect;
    this.state.spiritualityCharge = GAME_CONFIG.spirituality.threshold;
    this.emit();
  }

  /** Place N scatters on next spin (3–4 = choice, 5+ = Fool's Miracles). */
  debugForceScatters(count: number): void {
    const n = Math.max(0, Math.min(5, Math.floor(count)));
    const grid = fillGrid('JACK');
    for (let i = 0; i < n; i++) {
      grid[i]![0] = 'SCATTER';
    }
    this.state.forceGrid = grid;
    this.emit();
  }

  /** Next spin: one wild per reel 0–2 (triggers Fool's Mirror expand). */
  debugForceWildExpand(): void {
    const grid = fillGrid('JACK');
    for (let r = 0; r < 3; r++) {
      grid[r]![1] = 'WILD';
    }
    this.state.forceGrid = grid;
    this.emit();
  }

  /** Jump Sequence wins to a tier threshold. */
  debugSetSequenceWins(wins: number): void {
    this.state.sequenceWins = Math.max(0, Math.floor(wins));
    this.state.sequenceMultiplier = sequenceMultiplierForWins(this.state.sequenceWins);
    this.emit();
  }

  /** Clear pending cheat forces. */
  debugClearForces(): void {
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = null;
    this.emit();
  }

  getSequenceProgress() {
    return {
      wins: this.state.sequenceWins,
      multiplier: sequenceMultiplierForWins(this.state.sequenceWins),
    };
  }
}

export function sumAttribution(a: Attribution): number {
  return a.BASE + a.BONUS + a.SEQUENCE + a.SPIRITUALITY;
}
