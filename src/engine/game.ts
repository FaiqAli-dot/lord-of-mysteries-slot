import { GAME_CONFIG, type BonusModeId } from '../config/gameConfig';
import type {
  Attribution,
  GameState,
  Grid,
  SpinResult,
  TarotPickReward,
} from './types';
import { SeededRng, deriveSeed } from './rng';
import { emptyGrid } from './reels';
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

const STORAGE_KEY = 'pathways-of-the-sealed-v1';

export interface PersistedSettings {
  balance: number;
  bet: number;
  muted: boolean;
  seed: number;
}

function defaultState(seed = 0x5eedcafe): GameState {
  return {
    phase: 'IDLE',
    balance: GAME_CONFIG.startingBalance,
    bet: GAME_CONFIG.defaultBet,
    seed,
    spinCount: 0,
    grid: emptyGrid(),
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
    muted: false,
    reducedMotion: false,
    forceGrid: null,
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
      // Balance is server-authoritative when using the API — local hydrate
      // only applies to legacy offline/demo mute & bet preferences when persist is on.
      if (typeof data.bet === 'number' && (GAME_CONFIG.betOptions as readonly number[]).includes(data.bet)) {
        this.state.bet = data.bet;
      }
      if (typeof data.muted === 'boolean') this.state.muted = data.muted;
      if (typeof data.seed === 'number') this.state.seed = data.seed >>> 0;
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
        seed: this.state.seed,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  /** Replace state from a public API snapshot (client mirror). */
  applyPublicState(state: Omit<GameState, 'forceGrid'> & { forceGrid?: null }): void {
    this.state = {
      ...structuredClone(state),
      forceGrid: null,
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
    const seed = this.state.seed;
    const muted = this.state.muted;
    this.state = defaultState(seed);
    this.state.muted = muted;
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
      allowSpirituality: true,
      chargeInBonus: false,
    });
    this.state.forceGrid = null;

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

  /** Tarot Club interactive pick. */
  tarotPick(): { reward: TarotPickReward; credits: number } | null {
    if (this.state.phase !== 'BONUS_ACTIVE' || this.state.bonus?.mode !== 'TAROT_CLUB') {
      return null;
    }
    const bonus = this.state.bonus;
    if (bonus.tarotPicksRemaining <= 0) return null;

    this.state.spinCount += 1;
    const rng = new SeededRng(deriveSeed(this.state.seed, this.state.spinCount));
    const { reward, bonus: next, creditsAwarded } = resolveTarotPick(
      rng,
      bonus,
      this.state.bet,
    );
    this.state.bonus = next;
    this.state.balance += creditsAwarded;
    this.state.lastPayout = creditsAwarded;
    this.state.lastAttribution = {
      ...emptyAttribution(),
      BONUS: creditsAwarded,
    };

    if (next.tarotPicksRemaining <= 0) {
      this.completeBonus();
    }
    this.emit();
    return { reward, credits: creditsAwarded };
  }

  /** Crimson Moon / Fool's Miracles bonus spin. */
  bonusSpin(): SpinResult | null {
    if (this.state.phase !== 'BONUS_ACTIVE' || !this.state.bonus) return null;
    const mode = this.state.bonus.mode;
    if (mode === 'TAROT_CLUB') return null;
    if (this.state.bonus.spinsRemaining <= 0) return null;

    this.state.phase = 'SPINNING';
    this.emit();

    let bonus = { ...this.state.bonus };
    bonus.spinsRemaining -= 1;
    bonus.spinsPlayed += 1;

    // Crimson Moon: add sticky wild reel each spin
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
      // Crimson sticky cells must not trigger full-reel Fool's Mirror expansion.
      allowWildExpansion: mode !== 'CRIMSON_MOON',
      stickyWildReels: bonus.stickyWildReels,
      stickyWildCells: bonus.stickyWildCells,
      tarotWildEnhance: false,
      forceGrid: null,
      allowSpirituality: true,
      chargeInBonus: GAME_CONFIG.spirituality.chargeInBonus,
    });

    this.applyResult(result);
    bonus.totalWon += result.payout;

    // Retriggers
    bonus = tryRetrigger(bonus, result.scatterCount);

    // Progress multipliers
    const hadPay = result.payout > 0;
    if (mode === 'CRIMSON_MOON') bonus = advanceMoonMultiplier(bonus, hadPay);
    if (mode === 'FOOLS_MIRACLES') bonus = advanceMiracleMultiplier(bonus, hadPay);

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
