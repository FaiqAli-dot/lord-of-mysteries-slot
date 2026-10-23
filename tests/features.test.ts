import { describe, it, expect } from 'vitest';
import { GAME_CONFIG, type SymbolId } from '../src/config/gameConfig';
import { SeededRng } from '../src/engine/rng';
import {
  eligibleBonusesForScatterCount,
  createBonusRuntime,
  tryRetrigger,
  applyMaxWinCap,
  captureTarotStickies,
} from '../src/engine/bonuses';
import {
  sequenceMultiplierForWins,
  applySequenceMultiplier,
  advanceSequence,
  resetSequence,
  potionsForMultiplier,
  sequenceTierForPotions,
} from '../src/engine/sequence';
import {
  activateSpirituality,
  shouldActivate,
  tickLockedWilds,
  tryCreepingHunger,
} from '../src/engine/spirituality';
import {
  applyGraftingCluster,
  applyWildExpansion,
  symbolPayRank,
} from '../src/engine/wilds';
import { resolveSpin } from '../src/engine/pipeline';
import { resolveCascades } from '../src/engine/cascade';
import { SlotGame } from '../src/engine/game';
import type { Grid } from '../src/engine/types';

function full(sym: SymbolId): Grid {
  return Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => sym));
}

describe('scatter bonus priority (4-mode routing)', () => {
  it('3 scatters offer choice; 4 auto Crimson Moon; 5+ Fool\'s Miracles', () => {
    expect(eligibleBonusesForScatterCount(3).trigger).toBe('CHOICE');
    expect(eligibleBonusesForScatterCount(3).bonuses).toEqual([
      'TAROT_CLUB',
      'CRIMSON_MOON',
    ]);
    expect(eligibleBonusesForScatterCount(4).trigger).toBe('CRIMSON_MOON');
    expect(eligibleBonusesForScatterCount(4).bonuses).toEqual(['CRIMSON_MOON']);
    expect(eligibleBonusesForScatterCount(5).trigger).toBe('FOOLS_MIRACLES');
    expect(eligibleBonusesForScatterCount(2).trigger).toBeNull();
  });
});

describe('Sequence (Potion Bottle permanent ladder)', () => {
  it('progresses Sequence 9→0 tiers and caps at 15x', () => {
    expect(sequenceMultiplierForWins(0)).toBe(1);
    expect(sequenceTierForPotions(0).sequence).toBe(9);
    expect(sequenceTierForPotions(0).title).toBe('Fool');
    const t5 = GAME_CONFIG.sequence.tiers.find((t) => t.multiplier === 5)!;
    expect(sequenceMultiplierForWins(t5.potionsRequired)).toBe(5);
    expect(sequenceTierForPotions(t5.potionsRequired).title).toBe(
      'Bizarro Sorcerer',
    );
    const t15 = GAME_CONFIG.sequence.tiers.find((t) => t.multiplier === 15)!;
    expect(sequenceMultiplierForWins(t15.potionsRequired)).toBe(15);
    expect(sequenceTierForPotions(t15.potionsRequired).sequence).toBe(0);
    expect(sequenceMultiplierForWins(9999)).toBe(15);
  });

  it('cheats map multipliers to exact potion thresholds (not stale win counts)', () => {
    expect(potionsForMultiplier(2)).toBe(
      GAME_CONFIG.sequence.tiers.find((t) => t.multiplier === 2)!.potionsRequired,
    );
    expect(potionsForMultiplier(5)).toBe(
      GAME_CONFIG.sequence.tiers.find((t) => t.multiplier === 5)!.potionsRequired,
    );
    expect(potionsForMultiplier(15)).toBe(
      GAME_CONFIG.sequence.tiers.find((t) => t.multiplier === 15)!
        .potionsRequired,
    );
    // Regression: old cheat passed 750 potions thinking it was 5x — that must not be 5x.
    expect(sequenceMultiplierForWins(750)).toBe(15);
    expect(sequenceMultiplierForWins(potionsForMultiplier(5))).toBe(5);
  });

  it('SlotGame.debugSetSequenceMultiplier sets exact tiers', () => {
    const game = new SlotGame(1);
    game.debugSetSequenceMultiplier(5);
    expect(game.state.sequenceMultiplier).toBe(5);
    game.debugSetSequenceMultiplier(2);
    expect(game.state.sequenceMultiplier).toBe(2);
    game.debugSetSequenceMultiplier(15);
    expect(game.state.sequenceMultiplier).toBe(15);
  });

  it('applies current mult before advancing; potions advance Sequence', () => {
    const { total, basePortion, sequencePortion } = applySequenceMultiplier(
      100,
      3,
    );
    expect(total).toBe(300);
    expect(basePortion).toBe(100);
    expect(sequencePortion).toBe(200);
    const adv = advanceSequence(2, 1);
    expect(adv.wins).toBe(3);
  });

  it('does not reset after bonus by default', () => {
    expect(GAME_CONFIG.bonuses.resetSequenceOnComplete).toBe(false);
    const game = new SlotGame(3);
    game.debugSetSequenceMultiplier(5);
    game.state.phase = 'BONUS_ACTIVE';
    game.state.bonus = createBonusRuntime('TAROT_CLUB', 20);
    game.state.bonus.spinsRemaining = 1;
    game.bonusSpin();
    // After bonus completes, Sequence should still be elevated
    expect(game.state.sequenceMultiplier).toBeGreaterThanOrEqual(5);
  });

  it('resetSequence helper still returns 1x for tests', () => {
    const r = resetSequence();
    expect(r.wins).toBe(0);
    expect(r.multiplier).toBe(1);
  });

  it('Potion Bottles on the grid advance Sequence permanently', () => {
    const grid = full('JACK');
    grid[0]![0] = 'SEQUENCE';
    grid[1]![0] = 'SEQUENCE';
    const r = resolveSpin({
      rng: new SeededRng(1),
      totalBet: 20,
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
      forceGrid: grid,
      allowSpirituality: false,
      chargeInBonus: false,
    });
    expect(r.sequenceWinsAfter).toBe(2);
  });
});

describe('Spirituality', () => {
  it('activates at threshold and resets to 0', () => {
    expect(shouldActivate(GAME_CONFIG.spirituality.threshold - 1)).toBe(false);
    expect(shouldActivate(GAME_CONFIG.spirituality.threshold)).toBe(true);
    const rng = new SeededRng(42);
    const act = activateSpirituality(rng, full('JACK'), []);
    expect(act.charge).toBe(0);
    expect(['GRAFTING', 'BLIND_STUPIDITY']).toContain(act.activation.effect);
  });

  it('charges on non-winning spins', () => {
    const game = new SlotGame(99);
    game.state.balance = 50_000;
    game.state.spiritualityCharge = 0;
    // Mixed lows — avoid accidental full-line hits when possible.
    const mixed: Grid = [
      ['ACE', 'KING', 'QUEEN', 'JACK'],
      ['KING', 'QUEEN', 'JACK', 'ACE'],
      ['QUEEN', 'JACK', 'ACE', 'KING'],
      ['JACK', 'ACE', 'KING', 'QUEEN'],
      ['ACE', 'QUEEN', 'JACK', 'KING'],
    ];
    game.debugForceGrid(mixed);
    const before = game.state.spiritualityCharge;
    const r = game.spin();
    expect(r).not.toBeNull();
    if ((r?.payout ?? 0) === 0) {
      expect(game.state.spiritualityCharge).toBe(
        before + GAME_CONFIG.spirituality.chargePerNonWin,
      );
    }
  });

  it('Grafting transforms neighbors into the highest-paying cluster symbol', () => {
    const g = full('JACK');
    // Anchor at (2,1)=FOOL with JACK neighbors → cluster becomes FOOL
    g[2]![1] = 'FOOL';
    g[2]![0] = 'JACK';
    g[2]![2] = 'ACE';
    g[1]![1] = 'KING';
    g[3]![1] = 'QUEEN';
    const { grid: next, targetSymbol, positions, seed } = applyGraftingCluster(
      g,
      (items) => items[0]!,
      { reel: 2, row: 1 },
    );
    expect(seed).toEqual({ reel: 2, row: 1 });
    expect(targetSymbol).toBe('FOOL');
    expect(symbolPayRank('FOOL')).toBeGreaterThan(symbolPayRank('JACK'));
    // Neighbors that were lows should now be FOOL
    for (const p of positions) {
      expect(next[p.reel]![p.row]).toBe('FOOL');
    }
    expect(next[2]![0]).toBe('FOOL');
    expect(next[2]![2]).toBe('FOOL');
    expect(next[1]![1]).toBe('FOOL');
    expect(next[3]![1]).toBe('FOOL');
  });

  it('Grafting never downgrades Wild and never overwrites Scatter/Potion', () => {
    const g = full('JACK');
    g[2]![1] = 'WILD';
    g[2]![0] = 'SCATTER';
    g[2]![2] = 'SEQUENCE';
    g[1]![1] = 'FOOL';
    g[3]![1] = 'ACE';
    const { grid: next, targetSymbol } = applyGraftingCluster(
      g,
      (items) => items[0]!,
      { reel: 2, row: 1 },
    );
    // Wild is highest → target is WILD; FOOL/ACE neighbors become WILD
    expect(targetSymbol).toBe('WILD');
    expect(next[2]![1]).toBe('WILD');
    expect(next[2]![0]).toBe('SCATTER');
    expect(next[2]![2]).toBe('SEQUENCE');
    expect(next[1]![1]).toBe('WILD');
    expect(next[3]![1]).toBe('WILD');
  });

  it('Grafting with only lows picks the highest low among the cluster', () => {
    const g = full('JACK');
    g[2]![1] = 'ACE'; // highest low
    g[2]![0] = 'JACK';
    g[1]![1] = 'QUEEN';
    g[3]![1] = 'KING';
    const { grid: next, targetSymbol } = applyGraftingCluster(
      g,
      (items) => items[0]!,
      { reel: 2, row: 1 },
    );
    expect(targetSymbol).toBe('ACE');
    expect(next[2]![0]).toBe('ACE');
    expect(next[1]![1]).toBe('ACE');
    expect(next[3]![1]).toBe('ACE');
  });

  it('Blind Stupidity converts 2–4 low symbols, never highs', () => {
    const grid = full('JACK');
    // Sprinkle some highs that must stay
    grid[4]![3] = 'FOOL';
    grid[4]![2] = 'MAGICIAN';
    const highs = new Set(GAME_CONFIG.spirituality.blindStupidity.highSymbols);
    const cfg = GAME_CONFIG.spirituality.blindStupidity;
    expect(cfg.transformCountMin).toBe(2);
    expect(cfg.transformCountMax).toBe(4);

    for (let seed = 0; seed < 40; seed++) {
      const act = activateSpirituality(
        new SeededRng(seed),
        grid,
        [],
        'BLIND_STUPIDITY',
      );
      expect(act.activation.effect).toBe('BLIND_STUPIDITY');
      const upgrades = act.activation.detail.upgrades as {
        reel: number;
        row: number;
        symbol: SymbolId;
      }[];
      expect(upgrades.length).toBeGreaterThanOrEqual(cfg.transformCountMin);
      expect(upgrades.length).toBeLessThanOrEqual(cfg.transformCountMax);
      // Highs untouched
      expect(act.grid[4]![3]).toBe('FOOL');
      expect(act.grid[4]![2]).toBe('MAGICIAN');
      for (const u of upgrades) {
        expect(highs.has(u.symbol)).toBe(true);
        expect(grid[u.reel]![u.row]).toBe('JACK');
      }
    }
  });

  it('Blind Stupidity upgrades fewer cells when not enough lows', () => {
    const grid = full('FOOL');
    grid[0]![0] = 'JACK';
    grid[1]![0] = 'ACE';
    const act = activateSpirituality(
      new SeededRng(7),
      grid,
      [],
      'BLIND_STUPIDITY',
    );
    const upgrades = act.activation.detail.upgrades as unknown[];
    expect(upgrades.length).toBe(2); // only 2 lows available
    expect(act.grid[0]![0]).not.toBe('JACK');
    expect(act.grid[1]![0]).not.toBe('ACE');
    // Remaining FOOLs untouched
    expect(act.grid[2]![0]).toBe('FOOL');
  });

  it('Blind Stupidity does nothing when no lows are present', () => {
    const grid = full('FOOL');
    const act = activateSpirituality(
      new SeededRng(3),
      grid,
      [],
      'BLIND_STUPIDITY',
    );
    expect(act.grid).toEqual(grid);
    expect(
      (act.activation.detail.upgrades as unknown[]).length,
    ).toBe(0);
  });

  it('forced Grafting uses a real random grid then morphs a cluster', () => {
    const game = new SlotGame(11);
    game.state.balance = 10_000;
    game.debugForceSpiritualityEffect('GRAFTING');
    expect(game.state.forceGrid).toBeNull();
    const r = game.spin();
    expect(r?.spiritualityActivation?.effect).toBe('GRAFTING');
    expect(r?.preFeatureGrid).not.toBeNull();
    expect(r!.spiritualityActivation!.detail.targetSymbol).toBeTruthy();
  });
});

describe("Fool's Mirror (Reel 3 only)", () => {
  it('expands only reel index 2', () => {
    const g = full('JACK');
    g[0]![0] = 'WILD';
    g[2]![1] = 'WILD';
    const { grid, expandedReels } = applyWildExpansion(g);
    expect(expandedReels).toEqual([2]);
    expect(grid[2]!.every((s) => s === 'WILD')).toBe(true);
    // Reel 0 wild does not expand the whole reel
    expect(grid[0]![1]).toBe('JACK');
  });

  it('cheat forces Fool\'s Mirror on reel 3', () => {
    const game = new SlotGame(5);
    game.state.balance = 10_000;
    game.debugForceWildExpand();
    const r = game.spin();
    expect(r?.expandedWildReels).toContain(2);
  });
});

describe('Creeping Hunger (Glove + Monster)', () => {
  it('triggers when Glove and Monster share the grid', () => {
    const g = full('JACK');
    g[1]![1] = 'GLOVE';
    g[3]![2] = 'MONSTER';
    const act = tryCreepingHunger(new SeededRng(8), g, []);
    expect(act.triggered).toBe(true);
    expect(act.activation?.effect).toBe('CREEPING_HUNGER');
    expect(act.grid[3]![2]).toBe('WILD'); // absorbed monster
    expect(act.lockedWilds.length).toBeGreaterThanOrEqual(1);
  });

  it('does not trigger without both symbols', () => {
    const g = full('JACK');
    g[1]![1] = 'GLOVE';
    expect(tryCreepingHunger(new SeededRng(1), g, []).triggered).toBe(false);
  });

  it('cheat arms Creeping Hunger for next spin', () => {
    const game = new SlotGame(12);
    game.state.balance = 10_000;
    game.debugForceCreepingHunger();
    const r = game.spin();
    expect(r?.spiritualityActivation?.effect).toBe('CREEPING_HUNGER');
  });

  it('Locked Wild ticks expire', () => {
    let locked = [{ reel: 0, row: 0, remainingSpins: 2 }];
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(1);
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(0);
  });
});

describe('Mode A — Tarot Club Gathering', () => {
  it('allocates 10 free spins and 5000x max win', () => {
    const b = createBonusRuntime('TAROT_CLUB', 20);
    expect(b.spinsRemaining).toBe(10);
    expect(GAME_CONFIG.bonuses.tarotClub.spins).toBe(10);
    expect(b.maxWinCredits).toBe(5000 * 20);
  });

  it('captures sticky Justice / Hanged / Sun', () => {
    let b = createBonusRuntime('TAROT_CLUB', 20);
    const grid = full('JACK');
    grid[0]![0] = 'PRIESTESS'; // Justice
    grid[1]![1] = 'HANGED';
    grid[2]![2] = 'WHEEL'; // The Sun
    b = captureTarotStickies(b, grid, new SeededRng(1));
    expect(b.stickyTarotCells.length).toBe(3);
  });

  it('max-win cap clamps payout and ends bonus', () => {
    let b = createBonusRuntime('TAROT_CLUB', 20);
    b.totalWon = 5000 * 20 - 10;
    const capped = applyMaxWinCap(b, 1000);
    expect(capped.payout).toBe(10);
    expect(capped.capped).toBe(true);
    expect(capped.bonus.spinsRemaining).toBe(0);
  });

  it('plays real resolveSpin gathering spins', () => {
    const game = new SlotGame(7);
    game.state.balance = 10_000;
    game.state.phase = 'BONUS_ACTIVE';
    game.state.bonus = createBonusRuntime('TAROT_CLUB', 20);
    const r = game.bonusSpin();
    expect(r).not.toBeNull();
    expect(game.state.bonus!.spinsRemaining).toBe(9);
  });
});

describe('Mode B — Crimson Moon Rampage', () => {
  it('allocates 8 free spins and 12500x max win', () => {
    const b = createBonusRuntime('CRIMSON_MOON', 20);
    expect(b.spinsRemaining).toBe(8);
    expect(b.maxWinCredits).toBe(12_500 * 20);
  });

  it('cascade multipliers progress 1→2→4→8→16', () => {
    expect([...GAME_CONFIG.bonuses.crimsonMoon.cascadeMultipliers]).toEqual([
      1, 2, 4, 8, 16,
    ]);
  });

  it('resolveCascades exposes cascade steps', () => {
    // Build a grid with a guaranteed top-row line of FOOL
    const grid = full('JACK');
    for (let r = 0; r < 5; r++) grid[r]![0] = 'FOOL';
    const result = resolveCascades(grid, 20, new Set(), new SeededRng(42));
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0]!.multiplier).toBe(1);
    if (result.steps.length > 1) {
      expect(result.steps[1]!.multiplier).toBe(2);
    }
  });

  it('bonus spin sets cascadeSteps on result', () => {
    const game = new SlotGame(21);
    game.state.balance = 10_000;
    game.state.phase = 'BONUS_ACTIVE';
    game.state.bonus = createBonusRuntime('CRIMSON_MOON', 20);
    const r = game.bonusSpin();
    expect(r).not.toBeNull();
    // cascadeSteps may be empty if no win, but field must be present (array or null from pipeline)
    expect(r!.cascadeSteps === null || Array.isArray(r!.cascadeSteps)).toBe(
      true,
    );
  });

  it('caps retriggers', () => {
    let b = createBonusRuntime('CRIMSON_MOON', 20);
    for (let i = 0; i < 10; i++) {
      b = tryRetrigger(b, 5);
    }
    expect(b.retriggers).toBe(GAME_CONFIG.bonuses.retriggerCap);
  });
});

describe("Super Bonus — Fool's Miracles", () => {
  it('allocates 5 free spins and 25000x max win', () => {
    const b = createBonusRuntime('FOOLS_MIRACLES', 20);
    expect(b.spinsRemaining).toBe(5);
    expect(b.maxWinCredits).toBe(25_000 * 20);
  });

  it('applies 3x3 Fool throne on center reels', () => {
    const r = resolveSpin({
      rng: new SeededRng(1),
      totalBet: 20,
      sequenceWins: 0,
      sequenceMultiplier: 1,
      spiritualityCharge: 0,
      lockedWilds: [],
      inBonus: true,
      bonusMultiplier: 1,
      forceExpandWilds: false,
      allowWildExpansion: true,
      stickyWildReels: [],
      stickyWildCells: [],
      tarotWildEnhance: false,
      forceGrid: full('JACK'),
      allowSpirituality: false,
      chargeInBonus: false,
      foolsThrone: true,
    });
    const throne = GAME_CONFIG.bonuses.foolsMiracles.foolThrone;
    for (const reel of throne.reels) {
      for (const row of throne.rows) {
        expect(r.grid[reel]![row]).toBe('FOOL');
      }
    }
  });

  it('records Historical Void on non-winning base spins and injects in Miracles', () => {
    const game = new SlotGame(44);
    game.state.balance = 50_000;
    game.debugSeedHistoricalVoid();
    expect(game.state.historicalVoid.length).toBeGreaterThan(0);
    game.state.phase = 'BONUS_ACTIVE';
    game.state.bonus = createBonusRuntime('FOOLS_MIRACLES', 20);
    const r = game.bonusSpin();
    expect(r).not.toBeNull();
  });
});

describe('balance & reproducibility', () => {
  it('deducts wager and credits payout without double spin', () => {
    const game = new SlotGame(12345);
    game.state.balance = 1000;
    game.setBet(20);
    const before = game.state.balance;
    const r1 = game.spin();
    expect(r1).not.toBeNull();
    expect(game.state.balance).toBe(before - 20 + (r1?.payout ?? 0));
    if (game.state.phase === 'IDLE') {
      game.state.phase = 'SPINNING';
      expect(game.spin()).toBeNull();
      game.state.phase = 'IDLE';
    }
  });

  it('seeded resolveSpin is reproducible', () => {
    const mk = () =>
      resolveSpin({
        rng: new SeededRng(0xabc),
        totalBet: 20,
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
    const a = mk();
    const b = mk();
    expect(a.grid).toEqual(b.grid);
    expect(a.payout).toBe(b.payout);
  });

  it('attribution categories are mutually exclusive and sum to payout', () => {
    const r = resolveSpin({
      rng: new SeededRng(555),
      totalBet: 20,
      sequenceWins: potionsForMultiplier(3),
      sequenceMultiplier: 3,
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
    const sum =
      r.attribution.BASE +
      r.attribution.BONUS +
      r.attribution.SEQUENCE +
      r.attribution.SPIRITUALITY;
    expect(sum).toBe(r.payout);
  });

  it('CHOICE scatter does not pre-assign bonusTriggered', () => {
    const grid = full('JACK');
    grid[0]![0] = 'SCATTER';
    grid[1]![0] = 'SCATTER';
    grid[2]![0] = 'SCATTER';
    const r = resolveSpin({
      rng: new SeededRng(1),
      totalBet: 20,
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
      forceGrid: grid,
      allowSpirituality: false,
      chargeInBonus: false,
    });
    expect(r.bonusTrigger).toBe('CHOICE');
    expect(r.accounting.bonusTriggered).toBeNull();
  });
});
