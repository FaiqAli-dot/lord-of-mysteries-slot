import type {
  BonusModeId,
  SymbolId,
  SpiritualityEffectId,
  FeatureEffectId,
} from '../config/gameConfig';
import type { CascadeStep } from './cascade';

export type { SpiritualityEffectId, FeatureEffectId };

export type Grid = SymbolId[][]; // [reel][row]

export interface LineWin {
  lineIndex: number;
  symbol: SymbolId;
  count: number;
  positions: { reel: number; row: number }[];
  /** Credits before wild / sequence / spirituality increments. */
  baseCredits: number;
  usedExpandedWild: boolean;
  wildMultiplier: number;
  /** Credits after wild multiplier, before sequence. */
  afterWildCredits: number;
}

export interface ScatterWin {
  count: number;
  positions: { reel: number; row: number }[];
  baseCredits: number;
}

export interface Attribution {
  BASE: number;
  BONUS: number;
  SEQUENCE: number;
  SPIRITUALITY: number;
}

export interface LockedWildState {
  reel: number;
  row: number;
  /** Remaining applicable spins including current if just placed. */
  remainingSpins: number;
}

export interface SpiritualityActivation {
  effect: FeatureEffectId;
  /** Effect-specific payload. */
  detail: Record<string, unknown>;
}

export interface HistoricalVoidEntry {
  symbol: SymbolId;
  reel: number;
  row: number;
}

export interface RoundAccounting {
  wager: number;
  totalPayout: number;
  attribution: Attribution;
  hit: boolean;
  bonusTriggered: BonusModeId | null;
  sequenceMultiplierApplied: number;
  spiritualityActivated: boolean;
  spiritualityEffect: FeatureEffectId | null;
}

export type GamePhase =
  | 'IDLE'
  | 'SPINNING'
  | 'RESOLVING'
  | 'BONUS_SELECT'
  | 'BONUS_ACTIVE'
  | 'BONUS_SUMMARY'
  | 'FEATURE_REVEAL';

export interface TarotPickReward {
  type: 'credits' | 'multiplier' | 'wildEnhance' | 'extraPick' | 'multiplierCard';
  mult?: number;
  credits?: number;
  label: string;
}

export interface BonusRuntime {
  mode: BonusModeId;
  spinsRemaining: number;
  spinsPlayed: number;
  retriggers: number;
  totalWon: number;
  /** Mode-specific. */
  moonMultiplier: number;
  moonPayingSpins: number;
  miracleMultiplier: number;
  miraclePayingSpins: number;
  stickyWildReels: number[];
  stickyWildCells: { reel: number; row: number }[];
  /** Mode A: sticky Justice / Hanged / Sun seats. */
  stickyTarotCells: { reel: number; row: number; symbol: SymbolId }[];
  /** Mode A: current spin's random multiplier card. */
  tarotCardMultiplier: number;
  tarotPicksRemaining: number;
  tarotHistory: TarotPickReward[];
  tarotRunningMultiplier: number;
  tarotWildEnhance: boolean;
  tarotExtraPicksUsed: number;
  /** Session win cap remaining (credits). */
  maxWinCredits: number;
}

export interface GameState {
  phase: GamePhase;
  balance: number;
  bet: number;
  seed: number;
  spinCount: number;
  grid: Grid;
  lastLineWins: LineWin[];
  lastScatterWin: ScatterWin | null;
  lastPayout: number;
  lastAttribution: Attribution;
  /** Cumulative Potion Bottles landed (Sequence progress). */
  sequenceWins: number;
  sequenceMultiplier: number;
  spiritualityCharge: number;
  lockedWilds: LockedWildState[];
  pendingBonusChoices: BonusModeId[] | null;
  bonus: BonusRuntime | null;
  lastFeature: SpiritualityActivation | null;
  concealedPositions: { reel: number; row: number }[] | null;
  graftedReel: number | null;
  graftedSymbol: SymbolId | null;
  /** Grid after reel stop, before Spirituality mods (for drop → feature morph). */
  lastPreFeatureGrid: Grid | null;
  /** High symbols from past non-winning base spins (Fool's Miracles void). */
  historicalVoid: HistoricalVoidEntry[];
  /** Last cascade steps (Crimson Moon) for UI animation. */
  lastCascadeSteps: CascadeStep[] | null;
  muted: boolean;
  reducedMotion: boolean;
  /** Dev: forced outcome helpers. */
  forceGrid: Grid | null;
  /** Dev: force next Spirituality effect when meter activates (or when forced). */
  forceSpiritualityEffect: SpiritualityEffectId | null;
  /** Dev: force bonus mode after scatter choice / routing. */
  forceBonusMode: BonusModeId | null;
  /** Dev: force Creeping Hunger setup (Glove+Monster) on next spin. */
  forceCreepingHunger: boolean;
  /** Dev: force Fool's Mirror on reel 3. */
  forceFoolsMirror: boolean;
  /** Dev: force high-intensity Crimson Moon (4 scatters). */
  forceHighIntensity: boolean;
}

export interface SpinResult {
  grid: Grid;
  /** Natural reel result before Spirituality (null if no feature ran). */
  preFeatureGrid: Grid | null;
  lineWins: LineWin[];
  scatterWin: ScatterWin | null;
  scatterCount: number;
  payout: number;
  attribution: Attribution;
  sequenceMultiplierBefore: number;
  sequenceMultiplierAfter: number;
  sequenceWinsBefore: number;
  sequenceWinsAfter: number;
  spiritualityChargeBefore: number;
  spiritualityChargeAfter: number;
  spiritualityActivation: SpiritualityActivation | null;
  bonusTrigger: 'CHOICE' | 'FOOLS_MIRACLES' | 'CRIMSON_MOON' | null;
  eligibleBonuses: BonusModeId[];
  expandedWildReels: number[];
  cascadeSteps: CascadeStep[] | null;
  accounting: RoundAccounting;
}
