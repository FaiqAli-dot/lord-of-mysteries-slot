import { describe, expect, it } from 'vitest';
import {
  dropDelays,
  getSpinDuration,
  REEL_DROP,
  shouldSkipDelays,
  symbolPitch,
} from '../src/ui/reelDrop';

describe('reelDrop SF timings', () => {
  it('uses 5×4 port cell pitch (height+indent)', () => {
    const p = symbolPitch();
    expect(p.columns).toBe(5);
    expect(p.rows).toBe(4);
    expect(p.symbolWidth).toBe(REEL_DROP.layout.reels.symbols.width + REEL_DROP.layout.reels.symbols.indent);
    expect(p.symbolHeight).toBe(REEL_DROP.layout.reels.symbols.height + REEL_DROP.layout.reels.symbols.indent);
    expect(p.symbolHeight).toBe(140);
  });

  it('scales durations: normal / quick / turbo', () => {
    expect(getSpinDuration(0.5, 'normal')).toBe(0.5);
    expect(getSpinDuration(0.8, 'normal')).toBe(0.8);
    expect(getSpinDuration(0.5, 'quick')).toBe(0.3); // min(0.4, 0.5*0.6)
    expect(getSpinDuration(0.8, 'quick')).toBe(0.4); // min(0.4, 0.8*0.6)
    expect(getSpinDuration(0.5, 'turbo')).toBe(0.2);
    expect(getSpinDuration(0.8, 'turbo')).toBe(0.2);
    expect(getSpinDuration(0.5, 'slam')).toBe(0.2);
    expect(getSpinDuration(0.8, 'normal', true)).toBe(0.2);
  });

  it('zeroes stagger for turbo/slam; keeps it for quick', () => {
    expect(shouldSkipDelays('turbo')).toBe(true);
    expect(shouldSkipDelays('slam')).toBe(true);
    expect(shouldSkipDelays('quick')).toBe(false);
    expect(shouldSkipDelays('normal')).toBe(false);

    const quick = dropDelays('quick', 4);
    expect(quick.delayOut(0, 3)).toBeGreaterThan(0); // bottom
    expect(quick.delayOut(0, 0)).toBeGreaterThan(quick.delayOut(0, 3)); // top later
    expect(quick.delayOut(1, 3)).toBeGreaterThan(quick.delayOut(0, 3)); // col stagger
    expect(quick.delayIn(3)).toBeGreaterThan(0);
    // drop-in has no column term — same for all cols
    expect(quick.delayIn(0)).toBe((4 - 0) * ((quick.fallIn / 4) * 0.3));

    const turbo = dropDelays('turbo', 4);
    expect(turbo.delayOut(2, 0)).toBe(0);
    expect(turbo.delayIn(0)).toBe(0);
  });

  it('staggers bottom row first on drop-out (normal 5×4)', () => {
    const d = dropDelays('normal', 4);
    // dSymOut = (0.5/4)*0.5 = 0.0625
    expect(d.delayOut(0, 3)).toBeCloseTo(0.0625); // bottom
    expect(d.delayOut(0, 0)).toBeCloseTo(0.25); // top
    expect(d.delayOut(1, 3)).toBeCloseTo(0.07 + 0.0625);
  });
});
