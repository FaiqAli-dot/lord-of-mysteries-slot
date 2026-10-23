/**
 * Single source of truth for Lord of the Mysteries — Sefirah Castle Sanctum.
 * Shared by the live game and the RTP simulator.
 *
 * RTP attribution convention (mutually exclusive):
 * - BASE: line/scatter credits from the base outcome before Sequence/Spirituality increments
 * - SEQUENCE: incremental credits from Sequence multiplier above 1x
 * - SPIRITUALITY: incremental credits attributable to Spirituality effects
 *   (Grafting, Blind Stupidity) and Creeping Hunger respin delta
 * - BONUS: all credits awarded inside Tarot Club / Crimson Moon / Fool's Miracles
 *   (including bonus-spin line wins and cascade/multiplier increments). Sequence
 *   increments during bonus spins are still attributed to SEQUENCE (the delta only);
 *   the 1x portion of those wins is BONUS.
 */

export type SymbolId =
  | 'FOOL'
  | 'MAGICIAN'
  | 'PRIESTESS' // Justice (display)
  | 'WHEEL' // The Sun (display)
  | 'HANGED'
  | 'WORLD'
  | 'ACE'
  | 'KING'
  | 'QUEEN'
  | 'JACK'
  | 'WILD'
  | 'SCATTER' // Crimson Tarot Card
  | 'SEQUENCE' // Potion Bottle
  | 'SPIRIT'
  | 'GLOVE'
  | 'MONSTER';

export type RtpCategory = 'BASE' | 'BONUS' | 'SEQUENCE' | 'SPIRITUALITY';

/** Meter-awakened Spirituality effects (Grafting OR Blind Stupidity). */
export type SpiritualityEffectId = 'GRAFTING' | 'BLIND_STUPIDITY';

/** Grid-triggered features surfaced alongside Spirituality for UI. */
export type FeatureEffectId = SpiritualityEffectId | 'CREEPING_HUNGER';

export type BonusModeId = 'TAROT_CLUB' | 'CRIMSON_MOON' | 'FOOLS_MIRACLES';

export interface SymbolDef {
  id: SymbolId;
  name: string;
  tier: 'high' | 'low' | 'special';
  /** Pays for 3/4/5 of a kind as multiples of line bet (total bet / 20). */
  pays: [number, number, number];
  isWild?: boolean;
  isScatter?: boolean;
  /** Potion Bottle — advances Sequence permanently when landed. */
  isSequenceMarker?: boolean;
  /** Spirituality charge symbol. */
  isSpirit?: boolean;
  /** Creeping Hunger glove / monster roles. */
  isGlove?: boolean;
  isMonster?: boolean;
  /** Mode A sticky tarot member. */
  isStickyTarot?: boolean;
}

export interface SequenceTier {
  /** Fool pathway sequence number (9 = Fool … 0 = Lord of the Mysteries). */
  sequence: number;
  title: string;
  /** Cumulative Potion Bottles required to reach this tier. */
  potionsRequired: number;
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
    name: 'Justice',
    tier: 'high',
    pays: [8, 26, 78],
    isStickyTarot: true,
  },
  WHEEL: {
    id: 'WHEEL',
    name: 'The Sun',
    tier: 'high',
    pays: [6, 22, 60],
    isStickyTarot: true,
  },
  HANGED: {
    id: 'HANGED',
    name: 'The Hanged Man',
    tier: 'high',
    pays: [5, 17, 48],
    isStickyTarot: true,
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
    name: 'Crimson Tarot Card',
    tier: 'special',
    pays: [0, 0, 0],
    isScatter: true,
  },
  SEQUENCE: {
    id: 'SEQUENCE',
    name: 'Potion Bottle',
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
  GLOVE: {
    id: 'GLOVE',
    name: 'Glove',
    tier: 'special',
    pays: [0, 0, 0],
    isGlove: true,
  },
  MONSTER: {
    id: 'MONSTER',
    name: 'Monster',
    tier: 'special',
    pays: [0, 0, 0],
    isMonster: true,
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
 * Includes Potion Bottles (SEQUENCE), Glove, Monster, Crimson Tarot Cards.
 */
export const REEL_STRIPS: SymbolId[][] = [
  // Reel 0 — sparse Potion / Glove / Monster
  [
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN',
    'KING', 'JACK', 'WORLD', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'HANGED', 'KING', 'QUEEN', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'WHEEL', 'ACE',
    'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'PRIESTESS', 'KING', 'ACE', 'QUEEN',
    'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'MAGICIAN', 'KING', 'QUEEN', 'ACE', 'JACK',
    'QUEEN', 'KING', 'ACE', 'JACK', 'FOOL', 'QUEEN', 'KING', 'ACE', 'JACK', 'QUEEN',
    'WILD', 'KING', 'ACE', 'JACK', 'QUEEN', 'SPIRIT', 'KING', 'ACE', 'JACK', 'QUEEN',
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
    'SPIRIT', 'JACK', 'ACE', 'KING', 'QUEEN', 'QUEEN', 'JACK', 'ACE', 'SCATTER', 'KING',
    'QUEEN', 'JACK', 'ACE', 'KING', 'SCATTER', 'QUEEN', 'JACK',
  ],
  // Reel 2 — lengthened so Potion Bottle (SEQUENCE) is rare (~4/220 ≈ 1.8% visible)
  [
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'WORLD', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'JACK', 'KING', 'HANGED', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'WHEEL',
    'WILD', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'PRIESTESS', 'KING', 'QUEEN', 'ACE',
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'MAGICIAN', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'SPIRIT', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'FOOL', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'WORLD', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'SCATTER', 'KING', 'QUEEN', 'ACE', 'HANGED', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'JACK', 'WHEEL', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'PRIESTESS', 'ACE',
    'SCATTER', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'MAGICIAN', 'JACK', 'KING', 'QUEEN', 'ACE',
    'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING',
    'QUEEN', 'ACE', 'FOOL', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
    'GLOVE', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'WORLD',
    'SEQUENCE', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE', 'JACK', 'KING', 'QUEEN', 'ACE',
  ],
  // Reel 3
  [
    'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE',
    'WORLD', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'HANGED', 'KING', 'ACE',
    'QUEEN', 'JACK', 'KING', 'WHEEL', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'PRIESTESS',
    'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'MAGICIAN', 'JACK', 'KING', 'ACE', 'QUEEN',
    'JACK', 'FOOL', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'WILD', 'KING', 'ACE', 'QUEEN', 'SPIRIT', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'SCATTER', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK', 'KING', 'ACE', 'QUEEN', 'JACK',
    'KING', 'ACE', 'QUEEN', 'SCATTER', 'MONSTER', 'KING', 'ACE',
  ],
  // Reel 4
  [
    'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING',
    'JACK', 'WORLD', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'HANGED', 'QUEEN', 'KING',
    'JACK', 'ACE', 'QUEEN', 'WHEEL', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'PRIESTESS',
    'JACK', 'ACE', 'QUEEN', 'KING', 'MAGICIAN', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK',
    'FOOL', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE',
    'WILD', 'QUEEN', 'KING', 'SPIRIT', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'SCATTER',
    'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE', 'QUEEN', 'KING', 'JACK', 'ACE',
    'QUEEN', 'KING', 'JACK', 'SCATTER', 'ACE', 'QUEEN', 'KING',
  ],
];

export const GAME_CONFIG = {
  title: 'Lord of the Mysteries',
  subtitle: 'Sefirah Castle Sanctum — eternal grey fog and bronze grand halls',
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
   * Super Bonus math-model band: ~96.00%–96.45%.
   */
  rtpTolerance: 0.01,
  /**
   * Global scale applied to line-pay multiples at evaluation time.
   * Used for fine RTP tuning without rewriting the whole table.
   */
  payScale: 3.30,

  wild: {
    /**
     * Fool's Mirror: only the middle reel (index 2) expands to a full column
     * when ≥1 Wild lands there and the reel has no Scatter. Lines using it get 2×.
     */
    expandWhenPresent: true,
    expandReelOnly: 2,
    expandedMultiplier: 2,
    /** Wild never substitutes for Scatter / Sequence / Spirit / Glove / Monster. */
    cannotSubstitute: [
      'SCATTER',
      'SEQUENCE',
      'SPIRIT',
      'GLOVE',
      'MONSTER',
    ] as SymbolId[],
  },

  scatter: {
    /** 3 scatters → player chooses Mode A or Mode B. */
    choiceMin: 3,
    choiceMax: 3,
    /** 4 scatters → high-intensity auto Mode B (Crimson Moon). */
    highIntensityMin: 4,
    highIntensityMax: 4,
    highIntensityBonus: 'CRIMSON_MOON' as BonusModeId,
    /** 5+ scatters → Fool's Miracles directly (priority). */
    foolsMiraclesMin: 5,
    /** Eligible bonuses for the 3-scatter choice screen. */
    choiceBonuses: ['TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[],
  },

  sequence: {
    displayName: 'Sequence',
    displayHint:
      'Potion Bottles permanently advance Klein from Sequence 9: Fool toward Sequence 0: Lord of the Mysteries, raising the base payout multiplier (cap 15×). Does not reset after bonuses.',
    maxMultiplier: 15,
    /** Advance by counting Potion Bottles on the final evaluated grid. */
    advanceOnPotionBottles: true,
    /** Permanent — never reset after bonus. */
    resetAfterBonus: false,
    persistThroughBonus: true,
    /**
     * Fool pathway ladder. potionsRequired = cumulative Potion Bottles landed.
     * Steep thresholds + sparse Potion stops keep long-horizon SEQUENCE near ~10% RTP
     * while the permanent meter remains reachable for dedicated play.
     */
    tiers: [
      { sequence: 9, title: 'Fool', potionsRequired: 0, multiplier: 1 },
      { sequence: 8, title: 'Magician', potionsRequired: 4500, multiplier: 2 },
      { sequence: 7, title: 'Faceless', potionsRequired: 12000, multiplier: 3 },
      { sequence: 6, title: 'Marionettist', potionsRequired: 25000, multiplier: 4 },
      { sequence: 5, title: 'Bizarro Sorcerer', potionsRequired: 45000, multiplier: 5 },
      { sequence: 4, title: 'Scholar of Yore', potionsRequired: 75000, multiplier: 7 },
      { sequence: 3, title: 'Miracle Invoker', potionsRequired: 120000, multiplier: 9 },
      { sequence: 2, title: 'Troimere', potionsRequired: 180000, multiplier: 11 },
      { sequence: 1, title: 'Attendant of Mysteries', potionsRequired: 280000, multiplier: 13 },
      { sequence: 0, title: 'Lord of the Mysteries', potionsRequired: 450000, multiplier: 15 },
    ] as SequenceTier[],
  },

  spirituality: {
    displayName: 'Spirituality',
    displayHint:
      'Every non-winning spin (and Spirit Embers) feed Klein’s Spirituality. When full, the next spin awakens Grafting or Blind Stupidity, then the meter resets.',
    threshold: 16,
    /** Charge +1 on a non-winning spin (when Spirituality did not activate). */
    chargePerNonWin: 1,
    /** Optional pacing: also charge +1 on a winning spin (0 = disabled). */
    chargePerWin: 0,
    /** Charge also from SPIRIT symbols on the grid (each). */
    chargePerSpiritSymbol: 1,
    chargeInBonus: true,
    carryIntoBonus: true,
    overflowCarried: false,
    maxActivationsPerSpin: 1,
    effects: [
      {
        id: 'GRAFTING',
        name: 'Grafting',
        description:
          'Picks an anchor cell and its orthogonal neighbors, then transforms the cluster into whichever symbol among them has the highest payout value (Wild never downgrades). Improves the chance of forming a winning combination. Never overwrites Crimson Tarot Cards, Potion Bottles, Spirit Embers, Gloves, or Monsters.',
        weight: 50,
      },
      {
        id: 'BLIND_STUPIDITY',
        name: 'Blind Stupidity',
        description:
          'Randomly converts 2–4 low-paying symbols into high-value artifacts. Never picks an already high-paying or special cell.',
        weight: 50,
      },
    ] as SpiritualityEffectDef[],
    grafting: {
      /** Include the anchor cell itself in the cluster transform. */
      includeSeed: true,
      /** Orthogonal (up/down/left/right) neighbors form the graft cluster. */
      orthogonal: true,
      diagonals: false,
      /**
       * Specials never overwritten. Wilds participate in ranking as “highest”
       * but are never converted into a lower-paying symbol.
       */
      cannotTransform: [
        'SCATTER',
        'SEQUENCE',
        'SPIRIT',
        'GLOVE',
        'MONSTER',
      ] as SymbolId[],
    },
    creepingHunger: {
      /**
       * Triggered when Glove + Monster share the grid (not from the Spirituality meter).
       * Absorbs Monster(s), places locking wilds, then respins non-preserved cells.
       */
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
        'GLOVE',
      ] as SymbolId[],
      lockDurationSpins: 2,
    },
    blindStupidity: {
      /** Inclusive range: randomly upgrade this many low-paying cells. */
      transformCountMin: 2,
      transformCountMax: 4,
      /** Only low-paying cells are eligible sources. */
      lowSymbols: ['ACE', 'KING', 'QUEEN', 'JACK'] as SymbolId[],
      highSymbols: [
        'FOOL',
        'MAGICIAN',
        'PRIESTESS',
        'WHEEL',
        'HANGED',
        'WORLD',
      ] as SymbolId[],
      cannotTransform: [
        'SCATTER',
        'SEQUENCE',
        'SPIRIT',
        'WILD',
        'GLOVE',
        'MONSTER',
        'FOOL',
        'MAGICIAN',
        'PRIESTESS',
        'WHEEL',
        'HANGED',
        'WORLD',
      ] as SymbolId[],
    },
  },

  historicalVoid: {
    /** Max remembered high-pay seats from past non-winning base spins. */
    bufferSize: 12,
    /** How many void seats to inject during Fool's Miracles. */
    injectCount: 4,
    /** Chance each injected seat becomes a Void Wild instead of the recorded high. */
    voidWildChance: 0.35,
    highSymbols: [
      'FOOL',
      'MAGICIAN',
      'PRIESTESS',
      'WHEEL',
      'HANGED',
      'WORLD',
    ] as SymbolId[],
  },

  bonuses: {
    priority: ['FOOLS_MIRACLES', 'TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[],
    exclusive: true,
    /** Sequence is permanent — do not reset on bonus complete. */
    resetSequenceOnComplete: false,
    betsRequiredInBonus: false,
    retriggerCap: 2,

    tarotClub: {
      id: 'TAROT_CLUB' as BonusModeId,
      name: 'Tarot Club Gathering',
      volatility: 'Medium-High',
      /** Mode A: 10 free spins. */
      spins: 10,
      /** Sticky tarot members (Justice / Hanged Man / The Sun). */
      stickyTarotSymbols: ['PRIESTESS', 'HANGED', 'WHEEL'] as SymbolId[],
      /** Cap sticky wild seats so the board cannot brick. */
      maxStickyWildCells: 6,
      stickyWildChance: 0.35,
      /** Random multiplier cards applied as bonus multiplier for that spin. */
      multiplierCards: [
        { mult: 1, weight: 48 },
        { mult: 2, weight: 32 },
        { mult: 3, weight: 14 },
        { mult: 5, weight: 6 },
      ],
      /** Hard max win: 5,000× base stake. */
      maxWinMult: 5000,
    },

    crimsonMoon: {
      id: 'CRIMSON_MOON' as BonusModeId,
      name: 'Crimson Moon Rampage',
      volatility: 'Ultra-High',
      spins: 8,
      /** Avalanche cascade multipliers within a single spin. */
      cascadeMultipliers: [1, 2, 4, 8, 16] as const,
      stickyWildPerSpin: false,
      stickyMode: 'cell' as const,
      maxStickyWildCells: 0,
      maxStickyWildReels: 0,
      moonMultStart: 1,
      moonMultStepEvery: 2,
      moonMultCap: 1,
      retriggerScatters: 3,
      retriggerSpins: 2,
      /** Hard max win: 12,500× base stake. */
      maxWinMult: 12_500,
    },

    foolsMiracles: {
      id: 'FOOLS_MIRACLES' as BonusModeId,
      name: "Fool's Miracles",
      volatility: 'Very High',
      spins: 5,
      miracleMultStart: 1,
      miracleMultStepEvery: 2,
      miracleMultCap: 1,
      forceExpandWilds: false,
      /** 3×3 Fool manifestation on central throne (reels 1–3, rows 0–2). */
      foolThrone: {
        reels: [1, 2, 3] as const,
        rows: [0, 1, 2] as const,
        symbol: 'FOOL' as SymbolId,
      },
      historicalVoid: true,
      retriggerScatters: 3,
      retriggerSpins: 1,
      /** Hard max win: 25,000× base stake. */
      maxWinMult: 25_000,
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

/** Low-paying symbols eligible for Blind Stupidity conversion. */
export const LOW_SYMBOLS: SymbolId[] = ['ACE', 'KING', 'QUEEN', 'JACK'];

/** High-paying artifact symbols. */
export const HIGH_SYMBOLS: SymbolId[] = [
  'FOOL',
  'MAGICIAN',
  'PRIESTESS',
  'WHEEL',
  'HANGED',
  'WORLD',
];
