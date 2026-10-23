import type {
  BonusModeId,
  SymbolId,
  SpiritualityEffectId,
} from '../config/gameConfig';

export type { SpiritualityEffectId };

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
  effect: SpiritualityEffectId;
  /** Effect-specific payload. */
  detail: Record<string, unknown>;
}

export interface RoundAccounting {
  wager: number;
  totalPayout: number;
  attribution: Attribution;
  hit: boolean;
  bonusTriggered: BonusModeId | null;
  sequenceMultiplierApplied: number;
  spiritualityActivated: boolean;
  spiritualityEffect: SpiritualityEffectId | null;
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
  type: 'credits' | 'multiplier' | 'wildEnhance' | 'extraPick';
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
  tarotPicksRemaining: number;
  tarotHistory: TarotPickReward[];
  tarotRunningMultiplier: number;
  tarotWildEnhance: boolean;
  tarotExtraPicksUsed: number;
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
  muted: boolean;
  reducedMotion: boolean;
  /** Dev: forced outcome helpers. */
  forceGrid: Grid | null;
  /** Dev: force next Spirituality effect when meter activates (or when forced). */
  forceSpiritualityEffect: SpiritualityEffectId | null;
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
  bonusTrigger: 'CHOICE' | 'FOOLS_MIRACLES' | null;
  eligibleBonuses: BonusModeId[];
  expandedWildReels: number[];
  accounting: RoundAccounting;
}
