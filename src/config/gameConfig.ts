/**
 * Single source of truth for Pathways of the Sealed.
 * Shared by the live game and the RTP simulator.
 *
 * RTP attribution convention (mutually exclusive):
 * - BASE: line/scatter credits from the base outcome before Sequence/Spirituality increments
 * - SEQUENCE: incremental credits from Sequence multiplier above 1x
 * - SPIRITUALITY: incremental credits attributable to Spirituality effects
 *   (extra wilds from Glove/Locked Wild, Grafting, Blind Stupidity high upgrades,
 *    Creeping Hunger respin delta)
 * - BONUS: all credits awarded inside Tarot Club / Crimson Moon / Fool's Miracles
 *   (including pick rewards and bonus-spin line wins). Sequence increments during bonus spins
 *   are still attributed to SEQUENCE (the delta only); the 1x portion of those wins is BONUS.
 */

export type SymbolId =
  | 'FOOL'
  | 'MAGICIAN'
  | 'PRIESTESS'
  | 'WHEEL'
  | 'HANGED'
  | 'WORLD'
  | 'ACE'
  | 'KING'
  | 'QUEEN'
  | 'JACK'
  | 'WILD'
  | 'SCATTER'
  | 'SEQUENCE'
  | 'SPIRIT';

export type RtpCategory = 'BASE' | 'BONUS' | 'SEQUENCE' | 'SPIRITUALITY';

export type SpiritualityEffectId =
  | 'GRAFTING'
  | 'BLIND_STUPIDITY'
  | 'CREEPING_HUNGER'
  | 'GLOVE'
  | 'LOCKED_WILD';

export type BonusModeId = 'TAROT_CLUB' | 'CRIMSON_MOON' | 'FOOLS_MIRACLES';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  tier: 'high' | 'low' | 'special';
  /** Pays for 3/4/5 of a kind as multiples of line bet (total bet / 20). */
  pays: [number, number, number];
  isWild?: boolean;
  isScatter?: boolean;
  /** Sequence Sigil — non-paying line-breaker / strip filler. Does NOT advance the Sequence meter. */
  isSequenceMarker?: boolean;
  /** Spirituality charge symbol. */
  isSpirit?: boolean;
}

export interface SequenceTier {
  /** Wins required to reach this tier (cumulative since last reset). */
  winsRequired: number;
  multiplier: number;
}

export interface SpiritualityEffectDef {
  id: SpiritualityEffectId;
  name: string;
  description: string;
  /** Relative weight when choosing an effect on activation. */
  weight: number;
}

/** 20 fixed left-to-right paylines on a 5x4 grid. Each entry is row index per reel (0=top). */
export const PAYLINES: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [0, 1, 2, 3, 2],
  [3, 2, 1, 0, 1],
  [0, 0, 1, 0, 0],
  [1, 1, 0, 1, 1],
  [2, 2, 3, 2, 2],
  [3, 3, 2, 3, 3],
  [0, 1, 0, 1, 0],
  [1, 0, 1, 0, 1],
  [2, 3, 2, 3, 2],
  [3, 2, 3, 2, 3],
  [0, 1, 1, 1, 0],
  [3, 2, 2, 2, 3],
  [1, 2, 3, 2, 1],
  [2, 1, 0, 1, 2],
  [0, 1, 2, 1, 0],
  [3, 2, 1, 2, 3],
] as const;

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  FOOL: {
    id: 'FOOL',
    name: 'The Fool',
    tier: 'high',
    pays: [12, 42, 120],
  },
  MAGICIAN: {
    id: 'MAGICIAN',
    name: 'The Magician',
    tier: 'high',
    pays: [10, 34, 100],
  },
  PRIESTESS: {
    id: 'PRIESTESS',
    name: 'The High Priestess',
    tier: 'high',
    pays: [8, 26, 78],
  },
  WHEEL: {
    id: 'WHEEL',
    name: 'Wheel of Fortune',
    tier: 'high',
    pays: [6, 22, 60],
  },
  HANGED: {
    id: 'HANGED',
    name: 'The Hanged Man',
    tier: 'high',
    pays: [5, 17, 48],
  },
  WORLD: {
    id: 'WORLD',
    name: 'The World',
    tier: 'high',
    pays: [5, 14, 38],
  },
  ACE: {
    id: 'ACE',
    name: 'Sealed Ace',
    tier: 'low',
    pays: [3, 8, 24],
  },
  KING: {
    id: 'KING',
    name: 'Occult King',
    tier: 'low',
    pays: [2, 6, 20],
  },
  QUEEN: {
    id: 'QUEEN',
    name: 'Occult Queen',
    tier: 'low',
    pays: [2, 5, 15],
  },
  JACK: {
    id: 'JACK',
    name: 'Occult Jack',
    tier: 'low',
    pays: [1, 4, 12],
  },
  WILD: {
    id: 'WILD',
    name: "Fool's Mirror",
    tier: 'special',
    pays: [0, 0, 0],
    isWild: true,
  },
  SCATTER: {
    id: 'SCATTER',
    name: 'Pathway Gate',
    tier: 'special',
    pays: [0, 0, 0],
    isScatter: true,
  },
  SEQUENCE: {
    id: 'SEQUENCE',
    name: 'Sequence Sigil',
    tier: 'special',
    pays: [0, 0, 0],
    isSequenceMarker: true,
  },
  SPIRIT: {
    id: 'SPIRIT',
    name: 'Spirit Ember',
    tier: 'special',
    pays: [0, 0, 0],
    isSpirit: true,
  },
};

/** Scatter pays as multiples of total bet (not line bet). */
export const SCATTER_PAYS: Record<number, number> = {
  3: 2,
  4: 8,
  5: 40,
};

/**
 * Reel strips — length and composition tuned for ~96% RTP.
 * Rows = 4 visible; stop index is top-of-window.
 * Design: heavy lows with mixed order to reduce natural line hits; sparse highs/wilds;
 * two SCATTER stops per reel (length 77) so P(3+) ≈ few × 10^-3 and P(5) remains rare.
 */
export const REEL_STRIPS: SymbolId[][] = [
  // Reel 0 (72)
  [
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN',
    'KING', 'JACK', 'WORLD', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'HANGED', 'KING', 'QUEEN', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'WHEEL', 'ACE',
    'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'PRIESTESS', 'KING', 'ACE', 'QUEEN',
    'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'MAGICIAN', 'KING', 'QUEEN', 'ACE', 'JACK',
    'QUEEN', 'KING', 'ACE', 'JACK', 'FOOL', 'QUEEN', 'KING', 'ACE', 'JACK', 'QUEEN',
    'WILD', 'KING', 'ACE', 'JACK', 'QUEEN', 'SPIRIT', 'KING', 'ACE', 'SEQUENCE', 'JACK',
    'SCATTER', 'QUEEN', 'KING', 'ACE', 'JACK', 'SCATTER', 'QUEEN',
  ],
  // Reel 1
  [
    'QUEEN', 'JACK', 'ACE', 'KING', 'QUEEN', 'JACK', 'ACE', 'KING', 'QUEEN', 'JACK',
    'WORLD', 'ACE', 'KING', 'QUEEN', 'JACK', 'ACE', 'KING', 'QUEEN', 'JACK', 'HANGED',
    'ACE', 'KING', 'QUEEN', 'JACK', 'ACE', 'KING', 'QUEEN', 'WHEEL', 'JACK', 'ACE',
    'KING', 'QUEEN', 'JACK', 'ACE', 'PRIESTESS', 'KING', 'QUEEN', 'JACK', 'ACE', 'KING',
    'QUEEN', 'MAGICIAN', 'JACK', 'ACE', 'KING', 'QUEEN', 'JACK', 'ACE', 'FOOL', 'KING',
    'QUEEN', 'JACK', 'ACE', 'KING', 'QUEEN', 'JACK', 'WILD', 'ACE', 'KING', 'QUEEN',
    'SPIRIT', 'JACK', 'ACE', 'KING', 'SEQUENCE', 'QUEEN', 'JACK', 'ACE', 'SCATTER', 'KING',
    'QUEEN', 'JACK', 'ACE', 'KING', 'SCATTER', 'QUEEN', 'JACK',
  ],
  // Reel 2
  [
    'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN',
    'JACK', 'WORLD', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'HANGED', 'QUEEN',
    'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'WHEEL', 'KING', 'ACE', 'QUEEN', 'JACK',
    'KING', 'ACE', 'PRIESTESS', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'MAGICIAN', 'JACK',
    'KING', 'ACE', 'QUEEN', 'JACK', 'FOOL', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING',
    'ACE', 'QUEEN', 'JACK', 'WILD', 'KING', 'ACE', 'QUEEN', 'SPIRIT', 'JACK', 'KING',
    'SEQUENCE', 'ACE', 'QUEEN', 'JACK', 'SCATTER', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING',
    'ACE', 'QUEEN', 'JACK', 'SCATTER', 'KING', 'ACE', 'QUEEN',
  ],
  // Reel 3
  [
    'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE',
    'WORLD', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'HANGED', 'KING', 'ACE',
    'QUEEN', 'JACK', 'KING', 'WHEEL', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'PRIESTESS',
    'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'MAGICIAN', 'JACK', 'KING', 'ACE', 'QUEEN',
    'JACK', 'FOOL', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'WILD', 'KING', 'ACE', 'QUEEN', 'SPIRIT', 'JACK', 'KING', 'SEQUENCE', 'ACE', 'QUEEN',
    'SCATTER', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'KING', 'ACE', 'QUEEN', 'SCATTER', 'JACK', 'KING', 'ACE',
  ],
  // Reel 4
  [
    'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING',
    'JACK', 'WORLD', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'HANGED', 'QUEEN', 'KING',
    'JACK', 'ACE', 'QUEEN', 'WHEEL', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'PRIESTESS',
    'JACK', 'ACE', 'QUEEN', 'KING', 'MAGICIAN', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK',
    'FOOL', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE',
    'WILD', 'QUEEN', 'KING', 'SPIRIT', 'JACK', 'ACE', 'SEQUENCE', 'QUEEN', 'KING', 'SCATTER',
    'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE',
    'QUEEN', 'KING', 'JACK', 'SCATTER', 'ACE', 'QUEEN', 'KING',
  ],
];

export const GAME_CONFIG = {
  title: 'Pathways of the Sealed',
  subtitle: 'A gothic occult pathways slot',
  demoLabel: 'DEMO CREDITS — NOT REAL MONEY',
  rows: 4,
  reels: 5,
  paylineCount: PAYLINES.length,
  /** Default starting demo balance (integer credits). */
  startingBalance: 10_000,
  betOptions: [10, 20, 50, 100, 200, 500, 1000] as const,
  defaultBet: 20,
  /** Target RTP and category contributions (documentation targets). */
  rtpTarget: 0.96,
  rtpAllocation: {
    BASE: 0.5,
    BONUS: 0.3,
    SEQUENCE: 0.1,
    SPIRITUALITY: 0.06,
  } as const,
  /**
   * Documented tolerance for measured RTP vs target.
   * Monte Carlo at N=1e6 typically lands inside ±0.5pp; N=2e5–5e5 may swing ~±1pp.
   */
  rtpTolerance: 0.01,
  /**
   * Global scale applied to line-pay multiples at evaluation time.
   * Used for fine RTP tuning without rewriting the whole table.
   */
  /** Fine RTP dial — set after Tarot sim fidelity + Sequence/Spirituality retune. */
  payScale: 1.155,

  wild: {
    /** Fool's Mirror expands to fill its reel when ≥1 Wild lands and the reel has no Scatter. */
    expandWhenPresent: true,
    /** 2× applies once per line win that uses any expanded wild reel (not stacked per reel). */
    expandedMultiplier: 2,
    /** Wild never substitutes for Scatter / Sequence / Spirit. */
    cannotSubstitute: ['SCATTER', 'SEQUENCE', 'SPIRIT'] as SymbolId[],
  },

  scatter: {
    /** 3–4 scatters → player chooses between eligible bonuses. */
    choiceMin: 3,
    choiceMax: 4,
    /** 5+ scatters → Fool's Miracles directly (priority). */
    foolsMiraclesMin: 5,
    /** Eligible bonuses for the 3–4 choice screen. */
    choiceBonuses: ['TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[],
  },

  sequence: {
    /**
     * Player-facing label. Internal id stays "sequence" for APIs/tests.
     * This is a ritual progress meter — not a simulation of Beyonder Sequence potions.
     */
    displayName: 'Sequence Resonance',
    displayHint:
      'Rises once per paying spin. This spin uses the current tier; the meter advances after. Resets when a bonus ends.',
    maxMultiplier: 15,
    /**
     * When true: advance once per spin that has ≥1 winning combination
     * (not once per individual line — that would spike Sequence RTP).
     */
    advanceOnWinningCombination: true,
    /** Reset after every completed bonus (return to base). Wired via bonuses.resetSequenceOnComplete. */
    resetAfterBonus: true,
    /** Persist through bonus spins until bonus completes. */
    persistThroughBonus: true,
    /**
     * Tuned with Tarot correctly resetting Sequence (old sim skipped that reset).
     * ~1% bonus frequency ≈ 60–70 paying spins between typical bonuses, so 2×
     * needs a mild no-bonus streak; 8×+ needs an unusual drought.
     */
    tiers: [
      { winsRequired: 0, multiplier: 1 },
      { winsRequired: 115, multiplier: 2 },
      { winsRequired: 230, multiplier: 3 },
      { winsRequired: 360, multiplier: 5 },
      { winsRequired: 520, multiplier: 8 },
      { winsRequired: 720, multiplier: 12 },
      { winsRequired: 1000, multiplier: 15 },
    ] as SequenceTier[],
  },

  spirituality: {
    displayName: 'Spirituality',
    displayHint:
      'Charges from paying spins and Spirit Embers. When full, the next eligible spin awakens one effect, then the meter resets.',
    /**
     * Raised from 12 → 18 after Blind Stupidity became a real payout modifier
     * and Grafting became a seed+neighbor Wild spread.
     */
    threshold: 18,
    /** Charge per winning spin (one advance event), not per line. */
    chargePerWin: 1,
    /** Charge also from SPIRIT symbols on the grid (each). */
    chargePerSpiritSymbol: 1,
    /** Earn charge during bonuses. */
    chargeInBonus: true,
    /** Carry meter from base into bonus (always; charge state is session-global). */
    carryIntoBonus: true,
    /** No overflow carried past activation. */
    overflowCarried: false,
    /** At most one activation per spin resolution. */
    maxActivationsPerSpin: 1,
    effects: [
      {
        id: 'GRAFTING',
        name: 'Grafting',
        description:
          'If a Fool’s Mirror is already on the grid, it spreads to orthogonal neighbors. If none landed, one Wild is placed without spreading. Scatters, Sequence Sigils, and Spirit Embers are never overwritten.',
        weight: 14,
      },
      {
        id: 'BLIND_STUPIDITY',
        name: 'Blind Stupidity',
        description:
          'One random eligible cell upgrades into a high-paying symbol for this spin. Scatters, Wilds, and special markers are never overwritten.',
        weight: 12,
      },
      {
        id: 'CREEPING_HUNGER',
        name: 'Creeping Hunger',
        description:
          'One respin: highs, Wilds, Scatters, Sequence, and Spirit stay; other positions respin once. No recursive respins.',
        weight: 24,
      },
      {
        id: 'GLOVE',
        name: 'Glove',
        description:
          'Transforms one eligible non-special symbol into Wild before final evaluation. Never transforms Scatter, Sequence, Spirit, or existing Wild.',
        weight: 26,
      },
      {
        id: 'LOCKED_WILD',
        name: 'Locked Wild',
        description:
          'Places a Locked Wild at an eligible cell for this spin and the next, then expires. Never overwrites Scatter, Sequence, or Spirit.',
        weight: 24,
      },
    ] as SpiritualityEffectDef[],
    grafting: {
      /** Include the seed cell itself as Wild (always applied in engine). */
      includeSeed: true,
      /** Convert up/down/left/right neighbors to Wild. */
      orthogonal: true,
      /** Also convert diagonal neighbors (stronger graft). */
      diagonals: false,
      /** Cells that grafting must never overwrite. */
      cannotTransform: ['SCATTER', 'SEQUENCE', 'SPIRIT'] as SymbolId[],
    },
    creepingHunger: {
      /** Symbols preserved across the hunger respin (Scatter also forced in code). */
      preserve: [
        'FOOL',
        'MAGICIAN',
        'PRIESTESS',
        'WHEEL',
        'HANGED',
        'WORLD',
        'WILD',
        'SEQUENCE',
        'SPIRIT',
        'SCATTER',
      ] as SymbolId[],
    },
    glove: {
      cannotTransform: ['SCATTER', 'SEQUENCE', 'SPIRIT', 'WILD'] as SymbolId[],
    },
    lockedWild: {
      /** Duration in applicable spins including creation spin. */
      durationSpins: 2,
      cannotPlaceOver: ['SCATTER', 'SEQUENCE', 'SPIRIT'] as SymbolId[],
    },
    blindStupidity: {
      /**
       * Cells upgraded to highs. Reduced from 3 → 1 so Blind remains a real
       * math event without dominating Spirituality category RTP.
       */
      transformCount: 1,
      /** High-paying targets (weighted equally when picked). */
      highSymbols: [
        'FOOL',
        'MAGICIAN',
        'PRIESTESS',
        'WHEEL',
        'HANGED',
        'WORLD',
      ] as SymbolId[],
      cannotTransform: ['SCATTER', 'SEQUENCE', 'SPIRIT', 'WILD'] as SymbolId[],
    },
  },

  bonuses: {
    /** Priority when multiple could apply: Fool's Miracles first, then Tarot Club, then Crimson Moon. */
    priority: ['FOOLS_MIRACLES', 'TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[],
    /** No simultaneous bonuses. */
    exclusive: true,
    /** Sequence resets when any bonus completes. */
    resetSequenceOnComplete: true,
    /** Bonus spins do not deduct additional wager; use the triggering total bet. */
    betsRequiredInBonus: false,
    retriggerCap: 2,

    tarotClub: {
      id: 'TAROT_CLUB' as BonusModeId,
      name: 'Tarot Club Gathering',
      /** Gathering free spins on the reels (each spin draws one reward). */
      selections: 5,
      /** Pick outcomes — weights sum for discrete distribution. Credits are multiples of total bet. */
      rewards: [
        { type: 'credits' as const, mult: 3, weight: 26 },
        { type: 'credits' as const, mult: 7, weight: 24 },
        { type: 'credits' as const, mult: 14, weight: 14 },
        { type: 'credits' as const, mult: 28, weight: 6 },
        { type: 'multiplier' as const, mult: 2, weight: 14 },
        { type: 'wildEnhance' as const, weight: 10 },
        { type: 'extraPick' as const, weight: 6 },
      ],
      maxExtraPicks: 2,
    },

    crimsonMoon: {
      id: 'CRIMSON_MOON' as BonusModeId,
      name: 'Crimson Moon Rampage',
      spins: 8,
      /**
       * Crimson mechanic: each spin adds one sticky wild CELL (not a full reel).
       * Expansion is disabled during this bonus so sticky cells stay single-cell wilds.
       */
      stickyWildPerSpin: true,
      stickyMode: 'cell' as const,
      maxStickyWildCells: 5,
      maxStickyWildReels: 0,
      moonMultStart: 1,
      moonMultStepEvery: 2,
      moonMultCap: 2,
      retriggerScatters: 3,
      retriggerSpins: 2,
    },

    foolsMiracles: {
      id: 'FOOLS_MIRACLES' as BonusModeId,
      name: "Fool's Miracles",
      /** Sequence of enhanced free spins with escalating miracle multiplier. */
      spins: 10,
      miracleMultStart: 2,
      miracleMultStepEvery: 2,
      miracleMultCap: 5,
      /** All wilds expand during Fool's Miracles. */
      forceExpandWilds: true,
      retriggerScatters: 3,
      retriggerSpins: 2,
    },
  },

  animation: {
    spinMs: 600,
    winPulseMs: 800,
    bonusFadeMs: 400,
    countUpThreshold: 10,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;

/** Paying symbols that can form line wins (Wild substitutes). */
export const PAYING_SYMBOLS: SymbolId[] = [
  'FOOL',
  'MAGICIAN',
  'PRIESTESS',
  'WHEEL',
  'HANGED',
  'WORLD',
  'ACE',
  'KING',
  'QUEEN',
  'JACK',
];
