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
  HistoricalVoidEntry,
  SpinResult,
  TarotPickReward,
} from './types';
import { SeededRng, deriveSeed } from './rng';
import { spinReels } from './reels';
import { emptyAttribution, resolveSpin } from './pipeline';
import {
  createBonusRuntime,
  tryRetrigger,
  advanceMoonMultiplier,
  advanceMiracleMultiplier,
  addStickyWildReel,
  addStickyWildCell,
  drawTarotMultiplierCard,
  captureTarotStickies,
  applyMaxWinCap,
} from './bonuses';
import {
  resetSequence,
  sequenceMultiplierForWins,
  potionsForMultiplier,
  sequenceTierForPotions,
} from './sequence';

function fillGrid(sym: SymbolId): Grid {
  return Array.from({ length: GAME_CONFIG.reels }, () =>
    Array.from({ length: GAME_CONFIG.rows }, () => sym),
  );
}

const STORAGE_KEY = 'lotm-sefirah-castle-v2';

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
    historicalVoid: [],
    lastCascadeSteps: null,
    muted: false,
    reducedMotion: false,
    forceGrid: null,
    forceSpiritualityEffect: null,
    forceBonusMode: null,
    forceCreepingHunger: false,
    forceFoolsMirror: false,
    forceHighIntensity: false,
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
      if (
        typeof data.bet === 'number' &&
        (GAME_CONFIG.betOptions as readonly number[]).includes(data.bet)
      ) {
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
    this.state.lastCascadeSteps = null;
    this.emit();

    this.state.balance -= this.state.bet;
    this.state.spinCount += 1;

    // Apply armed cheats that build a force grid
    let forceGrid = this.state.forceGrid;
    if (this.state.forceCreepingHunger) {
      forceGrid = fillGrid('JACK');
      forceGrid[1]![1] = 'GLOVE';
      forceGrid[3]![2] = 'MONSTER';
    } else if (this.state.forceFoolsMirror) {
      forceGrid = fillGrid('JACK');
      forceGrid[2]![1] = 'WILD'; // Reel 3 (index 2)
    } else if (this.state.forceHighIntensity) {
      forceGrid = fillGrid('JACK');
      for (let i = 0; i < 4; i++) forceGrid[i]![0] = 'SCATTER';
    }

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
      forceGrid,
      forceSpiritualityEffect: this.state.forceSpiritualityEffect,
      allowSpirituality: true,
      chargeInBonus: false,
    });
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = null;
    this.state.forceCreepingHunger = false;
    this.state.forceFoolsMirror = false;
    this.state.forceHighIntensity = false;

    this.applyResult(result);
    this.mergeHistoricalVoid(result);

    // Bonus trigger handling
    const forcedMode = this.state.forceBonusMode;
    this.state.forceBonusMode = null;

    if (forcedMode && result.bonusTrigger) {
      this.enterBonus(forcedMode);
    } else if (result.bonusTrigger === 'FOOLS_MIRACLES') {
      this.enterBonus('FOOLS_MIRACLES');
    } else if (result.bonusTrigger === 'CRIMSON_MOON') {
      this.enterBonus('CRIMSON_MOON');
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
    this.state.bonus = createBonusRuntime(mode, this.state.bet);
    this.state.phase = 'BONUS_ACTIVE';
  }

  /**
   * Tarot Club gathering step (API compat) — same real resolveSpin path as bonusSpin.
   */
  tarotPick(): { reward: TarotPickReward; credits: number } | null {
    if (
      this.state.phase !== 'BONUS_ACTIVE' ||
      this.state.bonus?.mode !== 'TAROT_CLUB'
    ) {
      return null;
    }
    const result = this.bonusSpin();
    if (!result || !this.state.bonus) return null;
    const last =
      this.state.bonus.tarotHistory[this.state.bonus.tarotHistory.length - 1];
    if (!last) return null;
    return { reward: last, credits: result.payout };
  }

  /**
   * Bonus free spin for ALL modes.
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

    if (
      mode === 'CRIMSON_MOON' &&
      GAME_CONFIG.bonuses.crimsonMoon.stickyWildPerSpin
    ) {
      if (GAME_CONFIG.bonuses.crimsonMoon.stickyMode === 'cell') {
        bonus = addStickyWildCell(bonus, rng);
      } else {
        bonus = addStickyWildReel(bonus, rng);
      }
    }

    if (mode === 'TAROT_CLUB') {
      bonus = drawTarotMultiplierCard(rng, bonus);
    }

    const bonusMult =
      mode === 'CRIMSON_MOON'
        ? bonus.moonMultiplier
        : mode === 'FOOLS_MIRACLES'
          ? bonus.miracleMultiplier
          : mode === 'TAROT_CLUB'
            ? Math.max(1, bonus.tarotCardMultiplier)
            : 1;

    const room = Math.max(0, bonus.maxWinCredits - bonus.totalWon);

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
        mode === 'FOOLS_MIRACLES' &&
        GAME_CONFIG.bonuses.foolsMiracles.forceExpandWilds,
      allowWildExpansion: mode !== 'CRIMSON_MOON',
      stickyWildReels: bonus.stickyWildReels,
      stickyWildCells: bonus.stickyWildCells,
      stickyTarotCells: bonus.stickyTarotCells,
      tarotWildEnhance: mode === 'TAROT_CLUB' && bonus.tarotWildEnhance,
      forceGrid: null,
      allowSpirituality: true,
      chargeInBonus: GAME_CONFIG.spirituality.chargeInBonus,
      cascadeEnabled: mode === 'CRIMSON_MOON',
      foolsThrone: mode === 'FOOLS_MIRACLES',
      historicalVoid:
        mode === 'FOOLS_MIRACLES' ? this.state.historicalVoid : [],
      maxWinRemaining: room,
    });

    this.applyResult(result);
    this.state.lastCascadeSteps = result.cascadeSteps;

    // Mode A: capture sticky tarot members after the spin
    if (mode === 'TAROT_CLUB') {
      bonus = captureTarotStickies(bonus, result.grid, rng);
    }

    const capped = applyMaxWinCap(bonus, result.payout);
    bonus = capped.bonus;
    if (capped.capped && capped.payout < result.payout) {
      const delta = result.payout - capped.payout;
      this.state.balance -= delta;
      this.state.lastPayout = capped.payout;
      result.payout = capped.payout;
      result.accounting.totalPayout = capped.payout;
    }
    bonus.totalWon += result.payout;

    if (mode !== 'TAROT_CLUB') {
      bonus = tryRetrigger(bonus, result.scatterCount);
      const hadPay = result.payout > 0;
      if (mode === 'CRIMSON_MOON') bonus = advanceMoonMultiplier(bonus, hadPay);
      if (mode === 'FOOLS_MIRACLES')
        bonus = advanceMiracleMultiplier(bonus, hadPay);
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
    // Sequence is permanent — only reset if config says so (default false).
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

  private mergeHistoricalVoid(
    result: SpinResult & { historicalVoidDelta?: HistoricalVoidEntry[] },
  ): void {
    const delta = result.historicalVoidDelta ?? [];
    if (delta.length === 0) return;
    const buf = [...this.state.historicalVoid, ...delta];
    const cap = GAME_CONFIG.historicalVoid.bufferSize;
    this.state.historicalVoid = buf.slice(-cap);
  }

  private applyResult(
    result: SpinResult & {
      lockedWildsAfter?: GameState['lockedWilds'];
      concealed?: GameState['concealedPositions'];
      graftedReel?: number | null;
      graftedSymbol?: GameState['graftedSymbol'];
      historicalVoidDelta?: HistoricalVoidEntry[];
    },
  ): void {
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
    this.state.lastCascadeSteps = result.cascadeSteps;
    if (result.lockedWildsAfter) this.state.lockedWilds = result.lockedWildsAfter;
    if (result.concealed !== undefined)
      this.state.concealedPositions = result.concealed;
    if (result.graftedReel !== undefined)
      this.state.graftedReel = result.graftedReel;
    if (result.graftedSymbol !== undefined)
      this.state.graftedSymbol = result.graftedSymbol;

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
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = effect;
    this.state.spiritualityCharge = GAME_CONFIG.spirituality.threshold;
    this.emit();
  }

  /** Place N Crimson Tarot Cards on next spin. */
  debugForceScatters(count: number): void {
    const n = Math.max(0, Math.min(5, Math.floor(count)));
    const grid = fillGrid('JACK');
    for (let i = 0; i < n; i++) {
      grid[i]![0] = 'SCATTER';
    }
    this.state.forceGrid = grid;
    this.emit();
  }

  /** Next spin: Fool's Mirror wild on Reel 3 (index 2) only. */
  debugForceWildExpand(): void {
    this.state.forceFoolsMirror = true;
    this.state.forceGrid = null;
    this.emit();
  }

  /** Jump Sequence potions to the exact tier for a target multiplier. */
  debugSetSequenceWins(winsOrMult: number): void {
    // Accept either potion count OR a multiplier hint (>=1 and matching a tier).
    let potions = Math.max(0, Math.floor(winsOrMult));
    const asMult = potionsForMultiplier(winsOrMult);
    // If the value matches a known multiplier exactly, treat as multiplier request.
    const tierMults = GAME_CONFIG.sequence.tiers.map((t) => t.multiplier);
    if (tierMults.includes(winsOrMult)) {
      potions = asMult;
    }
    this.state.sequenceWins = potions;
    this.state.sequenceMultiplier = sequenceMultiplierForWins(
      this.state.sequenceWins,
    );
    this.emit();
  }

  /** Set Sequence to exact multiplier tier (preferred cheat API). */
  debugSetSequenceMultiplier(mult: number): void {
    const potions = potionsForMultiplier(mult);
    this.state.sequenceWins = potions;
    this.state.sequenceMultiplier = sequenceMultiplierForWins(potions);
    this.emit();
  }

  /** Arm Creeping Hunger (Glove + Monster) for next spin. */
  debugForceCreepingHunger(): void {
    this.state.forceCreepingHunger = true;
    this.state.forceGrid = null;
    this.emit();
  }

  /** Force Mode A / Mode B / Super entry after next scatter trigger. */
  debugForceBonusMode(mode: BonusModeId): void {
    this.state.forceBonusMode = mode;
    if (mode === 'FOOLS_MIRACLES') this.debugForceScatters(5);
    else if (mode === 'CRIMSON_MOON') {
      this.state.forceHighIntensity = true;
      this.state.forceGrid = null;
    } else {
      this.debugForceScatters(3);
    }
    this.emit();
  }

  /** Seed Historical Void with high symbols for Fool's Miracles testing. */
  debugSeedHistoricalVoid(): void {
    const highs = GAME_CONFIG.historicalVoid.highSymbols;
    const entries: HistoricalVoidEntry[] = [];
    for (let i = 0; i < GAME_CONFIG.historicalVoid.bufferSize; i++) {
      entries.push({
        symbol: highs[i % highs.length]!,
        reel: i % GAME_CONFIG.reels,
        row: i % GAME_CONFIG.rows,
      });
    }
    this.state.historicalVoid = entries;
    this.emit();
  }

  /** Clear pending cheat forces. */
  debugClearForces(): void {
    this.state.forceGrid = null;
    this.state.forceSpiritualityEffect = null;
    this.state.forceBonusMode = null;
    this.state.forceCreepingHunger = false;
    this.state.forceFoolsMirror = false;
    this.state.forceHighIntensity = false;
    this.emit();
  }

  getSequenceProgress() {
    const tier = sequenceTierForPotions(this.state.sequenceWins);
    return {
      wins: this.state.sequenceWins,
      potions: this.state.sequenceWins,
      multiplier: sequenceMultiplierForWins(this.state.sequenceWins),
      sequence: tier.sequence,
      title: tier.title,
    };
  }
}

export function sumAttribution(a: Attribution): number {
  return a.BASE + a.BONUS + a.SEQUENCE + a.SPIRITUALITY;
}
