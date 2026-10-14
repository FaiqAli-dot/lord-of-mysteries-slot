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
    expect(sequenceMultiplierForWins(200)).toBe(2);
    expect(sequenceMultiplierForWins(2000)).toBe(15);
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

  it('Grafting lasts one spin conceptually and cannot create scatters', () => {
    const g = full('JACK');
    g[2]![1] = 'SCATTER';
    const next = applyGrafting(g, 2, 'FOOL');
    expect(next[2]![1]).toBe('SCATTER');
    expect(next[2]![0]).toBe('FOOL');
  });

  it('Blind Stupidity preserves underlying symbols', () => {
    const rng = new SeededRng(7);
    const grid = full('ACE');
    // Force blind by retrying until we get it (weights equal — try many seeds)
    let found = false;
    for (let s = 0; s < 200; s++) {
      const r = new SeededRng(s);
      const act = activateSpirituality(r, grid, []);
      if (act.activation.effect === 'BLIND_STUPIDITY') {
        expect(act.grid).toEqual(grid);
        expect(act.concealed).toHaveLength(GAME_CONFIG.spirituality.blindStupidity.concealCount);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    void rng;
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

  it('Locked Wild expires after duration ticks', () => {
    let locked = [{ reel: 0, row: 0, remainingSpins: 2 }];
    const g = applyLockedWilds(full('JACK'), locked);
    expect(g[0]![0]).toBe('WILD');
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(1);
    locked = tickLockedWilds(locked);
    expect(locked).toHaveLength(0);
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
