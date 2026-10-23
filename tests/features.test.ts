import { describe, it, expect } from 'vitest';
import { GAME_CONFIG, type SymbolId } from '../src/config/gameConfig';
import { SeededRng } from '../src/engine/rng';
import { eligibleBonusesForScatterCount, createBonusRuntime, tryRetrigger, resolveTarotPick } from '../src/engine/bonuses';
import {
  sequenceMultiplierForWins,
  applySequenceMultiplier,
  advanceSequence,
  resetSequence,
} from '../src/engine/sequence';
import { activateSpirituality, shouldActivate, tickLockedWilds } from '../src/engine/spirituality';
import { applyGrafting, applyGlove, applyLockedWilds } from '../src/engine/wilds';
import { resolveSpin } from '../src/engine/pipeline';
import { SlotGame } from '../src/engine/game';
import type { Grid } from '../src/engine/types';

function full(sym: SymbolId): Grid {
  return Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => sym));
}

describe('scatter bonus priority', () => {
  it('3 and 4 scatters offer choice; 5+ triggers Fool\'s Miracles', () => {
    expect(eligibleBonusesForScatterCount(3).trigger).toBe('CHOICE');
    expect(eligibleBonusesForScatterCount(4).trigger).toBe('CHOICE');
    expect(eligibleBonusesForScatterCount(5).trigger).toBe('FOOLS_MIRACLES');
    expect(eligibleBonusesForScatterCount(6).trigger).toBe('FOOLS_MIRACLES');
    expect(eligibleBonusesForScatterCount(2).trigger).toBeNull();
    expect(eligibleBonusesForScatterCount(5).bonuses).toEqual(['FOOLS_MIRACLES']);
    expect(eligibleBonusesForScatterCount(3).bonuses).not.toContain('FOOLS_MIRACLES');
  });
});

describe('Sequence', () => {
  it('progresses tiers and caps at 15x', () => {
    expect(sequenceMultiplierForWins(0)).toBe(1);
    expect(sequenceMultiplierForWins(GAME_CONFIG.sequence.tiers[1]!.winsRequired)).toBe(2);
    expect(sequenceMultiplierForWins(GAME_CONFIG.sequence.tiers[6]!.winsRequired)).toBe(15);
    expect(sequenceMultiplierForWins(9999)).toBe(15);
  });

  it('applies current mult before advancing; attribution splits base vs sequence', () => {
    const { total, basePortion, sequencePortion } = applySequenceMultiplier(100, 3);
    expect(total).toBe(300);
    expect(basePortion).toBe(100);
    expect(sequencePortion).toBe(200);
    const adv = advanceSequence(2, 1);
    expect(adv.wins).toBe(3);
  });

  it('resets after bonus', () => {
    const r = resetSequence();
    expect(r.wins).toBe(0);
    expect(r.multiplier).toBe(1);
  });
});

describe('Spirituality', () => {
  it('activates at threshold and resets to 0', () => {
    expect(shouldActivate(GAME_CONFIG.spirituality.threshold - 1)).toBe(false);
    expect(shouldActivate(GAME_CONFIG.spirituality.threshold)).toBe(true);
    const rng = new SeededRng(42);
    const act = activateSpirituality(rng, full('JACK'), []);
    expect(act.charge).toBe(0);
    expect(act.activation.effect).toBeTruthy();
  });

  it('Grafting spreads from one wild to neighbors; never overwrites scatters', () => {
    const g = full('JACK');
    g[2]![0] = 'WILD';
    g[2]![1] = 'SCATTER';
    const { grid: next, transformed } = applyGrafting(g, { reel: 2, row: 0 });
    expect(next[2]![0]).toBe('WILD'); // seed stays wild
    expect(next[2]![1]).toBe('SCATTER'); // blocked
    expect(transformed.some((p) => p.reel === 2 && p.row === 0)).toBe(false); // neighbors only
    expect(next[1]![0]).toBe('WILD');
    expect(next[3]![0]).toBe('WILD');
  });

  it('forced Grafting uses a real random grid then places or spreads a wild', () => {
    const game = new SlotGame(11);
    game.state.balance = 10_000;
    game.debugForceSpiritualityEffect('GRAFTING');
    expect(game.state.forceGrid).toBeNull();
    const r = game.spin();
    expect(r?.spiritualityActivation?.effect).toBe('GRAFTING');
    expect(r?.preFeatureGrid).not.toBeNull();
    // Final grid must differ from pre-feature when a seed is placed or neighbors convert
    expect(r!.preFeatureGrid).not.toEqual(r!.grid);
    const seed = r!.spiritualityActivation!.detail.seed as { reel: number; row: number };
    expect(r!.grid[seed.reel]![seed.row]).toBe('WILD');
  });

  it('Blind Stupidity upgrades random cells into high-paying symbols', () => {
    const grid = full('JACK');
    const highs = new Set(GAME_CONFIG.spirituality.blindStupidity.highSymbols);
    const act = activateSpirituality(new SeededRng(7), grid, [], 'BLIND_STUPIDITY');
    expect(act.activation.effect).toBe('BLIND_STUPIDITY');
    const positions = act.activation.detail.positions as { reel: number; row: number }[];
    expect(positions).toHaveLength(GAME_CONFIG.spirituality.blindStupidity.transformCount);
    let upgraded = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let row = 0; row < grid[r]!.length; row++) {
        if (act.grid[r]![row] !== grid[r]![row]) {
          expect(highs.has(act.grid[r]![row]!)).toBe(true);
          upgraded++;
        }
      }
    }
    expect(upgraded).toBe(GAME_CONFIG.spirituality.blindStupidity.transformCount);
  });

  it('Creeping Hunger performs a single respin of non-preserved cells', () => {
    let found = false;
    for (let s = 0; s < 300; s++) {
      const grid = full('JACK');
      grid[0]![0] = 'FOOL';
      const act = activateSpirituality(new SeededRng(s), grid, []);
      if (act.activation.effect === 'CREEPING_HUNGER') {
        expect(act.hungerRespinDone).toBe(true);
        expect(act.grid[0]![0]).toBe('FOOL'); // preserved high
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('Glove transforms eligible symbol to wild, not scatter', () => {
    const g = full('SCATTER');
    const next = applyGlove(g, 0, 0);
    expect(next[0]![0]).toBe('SCATTER');
    const g2 = full('JACK');
    expect(applyGlove(g2, 1, 1)[1]![1]).toBe('WILD');
  });

  it('forceSpiritualityEffect bypasses weights (cheat path)', () => {
    const act = activateSpirituality(new SeededRng(1), full('JACK'), [], 'GLOVE');
    expect(act.activation.effect).toBe('GLOVE');
    expect(act.grid.flat().some((s) => s === 'WILD')).toBe(true);
  });

  it('debugForceSpiritualityEffect arms glove for next spin', () => {
    const game = new SlotGame(99);
    game.state.balance = 10_000;
    game.debugForceSpiritualityEffect('GLOVE');
    expect(game.state.spiritualityCharge).toBe(GAME_CONFIG.spirituality.threshold);
    expect(game.state.forceSpiritualityEffect).toBe('GLOVE');
    const r = game.spin();
    expect(r?.spiritualityActivation?.effect).toBe('GLOVE');
    expect(game.state.forceSpiritualityEffect).toBeNull();
  });

  it('meter fill defers activation to the following spin', () => {
    const game = new SlotGame(42);
    game.state.balance = 10_000;
    game.state.spiritualityCharge = GAME_CONFIG.spirituality.threshold;
    // No force effect — pre-armed charge fires on this spin
    const r1 = game.spin();
    expect(r1?.spiritualityActivation).not.toBeNull();
    expect(game.state.spiritualityCharge).toBe(0);

    // Fill without spinning past threshold via cheat, leave armed for next
    game.debugFillSpirituality();
    expect(game.state.spiritualityCharge).toBe(GAME_CONFIG.spirituality.threshold);
  });

  it('Tarot Club gathering uses real resolveSpin (not a mock grid)', () => {
    const b = createBonusRuntime('TAROT_CLUB');
    expect(b.spinsRemaining).toBe(GAME_CONFIG.bonuses.tarotClub.selections);
    const game = new SlotGame(7);
    game.state.balance = 10_000;
    game.state.phase = 'BONUS_ACTIVE';
    game.state.bonus = b;
    const beforeBal = game.state.balance;
    const r = game.bonusSpin();
    expect(r).not.toBeNull();
    expect(r!.grid).toHaveLength(GAME_CONFIG.reels);
    expect(r!.grid[0]).toHaveLength(GAME_CONFIG.rows);
    // Real evaluation fields present (may be empty wins, but structure is live)
    expect(Array.isArray(r!.lineWins)).toBe(true);
    expect(game.state.bonus!.tarotHistory.length).toBe(1);
    expect(game.state.bonus!.spinsRemaining).toBe(
      GAME_CONFIG.bonuses.tarotClub.selections - 1,
    );
    // Balance moved by reel payout + optional gathering credits
    expect(game.state.balance).toBe(beforeBal + r!.payout);
  });

  it('Locked Wild expires after duration ticks', () => {
    let locked = [{ reel: 0, row: 0, remainingSpins: 2 }];
    const g = applyLockedWilds(full('JACK'), locked);
    expect(g[0]![0]).toBe('WILD');
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(1);
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(0);
  });

  it('Locked Wild never places over Scatter / Sequence / Spirit', () => {
    const g = full('JACK');
    g[0]![0] = 'SCATTER';
    g[1]![0] = 'SEQUENCE';
    g[2]![0] = 'SPIRIT';
    const act = activateSpirituality(new SeededRng(3), g, [], 'LOCKED_WILD');
    expect(act.grid[0]![0]).toBe('SCATTER');
    expect(act.grid[1]![0]).toBe('SEQUENCE');
    expect(act.grid[2]![0]).toBe('SPIRIT');
    expect(act.lockedWilds.length).toBe(1);
    const lw = act.lockedWilds[0]!;
    expect(act.grid[lw.reel]![lw.row]).toBe('WILD');
  });

  it('Locked Wild dedupes the same cell instead of stacking', () => {
    const g = full('JACK');
    const a1 = activateSpirituality(new SeededRng(1), g, [], 'LOCKED_WILD');
    const pos = a1.lockedWilds[0]!;
    const a2 = activateSpirituality(new SeededRng(2), a1.grid, a1.lockedWilds, 'LOCKED_WILD');
    const same = a2.lockedWilds.filter((lw) => lw.reel === pos.reel && lw.row === pos.row);
    expect(same.length).toBeLessThanOrEqual(1);
  });

  it('Creeping Hunger preserves Sequence and Spirit markers', () => {
    const grid = full('JACK');
    grid[0]![0] = 'SEQUENCE';
    grid[1]![0] = 'SPIRIT';
    grid[2]![0] = 'FOOL';
    const act = activateSpirituality(new SeededRng(9), grid, [], 'CREEPING_HUNGER');
    expect(act.grid[0]![0]).toBe('SEQUENCE');
    expect(act.grid[1]![0]).toBe('SPIRIT');
    expect(act.grid[2]![0]).toBe('FOOL');
  });

  it('Sequence thresholds cover every tier boundary', () => {
    const tiers = GAME_CONFIG.sequence.tiers;
    for (const t of tiers) {
      expect(sequenceMultiplierForWins(t.winsRequired)).toBe(t.multiplier);
      if (t.winsRequired > 0) {
        expect(sequenceMultiplierForWins(t.winsRequired - 1)).toBeLessThan(t.multiplier);
      }
    }
  });

  it('CHOICE scatter does not pre-assign bonusTriggered to Tarot', () => {
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

describe('bonus retriggers and caps', () => {
  it('caps retriggers', () => {
    let b = createBonusRuntime('CRIMSON_MOON');
    for (let i = 0; i < 10; i++) {
      b = tryRetrigger(b, 5);
    }
    expect(b.retriggers).toBe(GAME_CONFIG.bonuses.retriggerCap);
  });

  it('tarot picks resolve from config weights', () => {
    let b = createBonusRuntime('TAROT_CLUB');
    const rng = new SeededRng(99);
    const r = resolveTarotPick(rng, b, 20);
    expect(r.reward.label).toBeTruthy();
    expect(r.bonus.tarotPicksRemaining).toBe(GAME_CONFIG.bonuses.tarotClub.selections - 1);
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
    // While not IDLE (e.g. if bonus), or if somehow mid-resolve — second spin blocked when not idle after bonus select
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

  it('attribution categories are mutually exclusive and sum to payout (no bonus mult)', () => {
    const r = resolveSpin({
      rng: new SeededRng(555),
      totalBet: 20,
      sequenceWins: 10,
      sequenceMultiplier: sequenceMultiplierForWins(10),
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
});
