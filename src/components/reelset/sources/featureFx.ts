import gsap from 'gsap';
import { Graphics, Sprite, Text } from 'pixi.js';
import type { FeatureEffectId, SymbolId } from '../../../config/gameConfig';
import { GAME_CONFIG } from '../../../config/gameConfig';
import type { SpiritualityActivation } from '../../../engine/types';

const SPECIALS = new Set<SymbolId>([
  'WILD',
  'SCATTER',
  'SPIRIT',
  'SEQUENCE',
  'GLOVE',
  'MONSTER',
]);

const EFFECT_LABEL: Record<FeatureEffectId, string> = {
  GRAFTING: 'GRAFTING — Highest Neighbor',
  BLIND_STUPIDITY: 'BLIND STUPIDITY — 2–4 Lows → High',
  CREEPING_HUNGER: 'CREEPING HUNGER — Absorb & Respin',
};

export function effectBannerText(act: SpiritualityActivation): string {
  return EFFECT_LABEL[act.effect] ?? act.effect;
}

export function isSpecialSymbol(id: SymbolId): boolean {
  return SPECIALS.has(id);
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** Pulse a set of cell positions (win lines / specials) — scale big↔small. */
export async function pulseCellPositions(
  cells: Sprite[][],
  positions: { reel: number; row: number }[],
  opts: {
    reducedMotion: boolean;
    tint?: number;
    scaleTo?: number;
    repeats?: number;
  },
): Promise<void> {
  const seen = new Set<string>();
  const jobs: Promise<unknown>[] = [];
  const scaleTo = opts.scaleTo ?? 1.35;
  const repeats = opts.repeats ?? 4;
  for (const p of positions) {
    const key = `${p.reel},${p.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = cells[p.reel]?.[p.row];
    if (!s) continue;
    const base = s.scale.x;
    const prev = s.tint;
    if (opts.tint !== undefined) s.tint = opts.tint;
    if (opts.reducedMotion) {
      jobs.push(
        wait(220).then(() => {
          s.tint = prev;
        }),
      );
      continue;
    }
    gsap.killTweensOf(s.scale);
    jobs.push(
      gsap
        .to(s.scale, {
          x: base * scaleTo,
          y: base * scaleTo,
          duration: 0.18,
          yoyo: true,
          repeat: repeats,
          ease: 'sine.inOut',
        })
        .then(() => {
          s.tint = prev;
          s.scale.set(base);
        }),
    );
  }
  if (jobs.length) await Promise.all(jobs);
}

/** Pulse special symbols that landed on the grid. */
export async function pulseSpecialCells(
  cells: Sprite[][],
  grid: SymbolId[][],
  reducedMotion: boolean,
): Promise<void> {
  const positions: { reel: number; row: number }[] = [];
  for (let r = 0; r < GAME_CONFIG.reels; r++) {
    for (let row = 0; row < GAME_CONFIG.rows; row++) {
      const id = grid[r]?.[row];
      if (!id || !SPECIALS.has(id)) continue;
      positions.push({ reel: r, row });
    }
  }
  await pulseCellPositions(cells, positions, {
    reducedMotion,
    tint: 0xffe08a,
    scaleTo: 1.28,
    repeats: 3,
  });
}

/** Winning payline / scatter positions — stronger big↔small pulse. */
export async function pulseWinningCells(
  cells: Sprite[][],
  positions: { reel: number; row: number }[],
  reducedMotion: boolean,
): Promise<void> {
  if (!positions.length) return;
  await pulseCellPositions(cells, positions, {
    reducedMotion,
    tint: 0xffe4a0,
    scaleTo: 1.42,
    repeats: 5,
  });
}

export async function flashCell(
  cell: Sprite,
  color: number,
  reducedMotion: boolean,
): Promise<void> {
  const base = cell.scale.x;
  const prev = cell.tint;
  cell.tint = color;
  if (reducedMotion) {
    await wait(280);
    cell.tint = prev;
    return;
  }
  await gsap.to(cell.scale, {
    x: base * 1.45,
    y: base * 1.45,
    duration: 0.28,
    yoyo: true,
    repeat: 1,
    ease: 'back.out(2)',
  });
  cell.tint = prev;
  cell.scale.set(base);
}

export async function flashReel(
  cells: Sprite[][],
  reel: number,
  color: number,
  reducedMotion: boolean,
): Promise<void> {
  const col = cells[reel];
  if (!col) return;
  await Promise.all(col.map((c) => flashCell(c, color, reducedMotion)));
}

/** Opaque sealed tiles — must fully hide the symbol underneath. */
export function buildVeils(
  host: { addChild: (c: Graphics) => void },
  positions: { reel: number; row: number }[],
  cellHome: { x: number; y: number }[][],
  cellW: number,
  cellH: number,
): Graphics[] {
  const veils: Graphics[] = [];
  for (const p of positions) {
    const home = cellHome[p.reel]?.[p.row];
    if (!home) continue;
    const g = new Graphics();
    // Solid plate — player must not see the real symbol through it
    g.beginFill(0x12101a, 1);
    g.drawRoundedRect(-cellW / 2, -cellH / 2, cellW, cellH, 8);
    g.endFill();
    g.lineStyle(3, 0x3ecfcf, 0.95);
    g.drawRoundedRect(-cellW / 2 + 2, -cellH / 2 + 2, cellW - 4, cellH - 4, 6);
    // Closed-eye mark
    g.lineStyle(0);
    g.beginFill(0x3ecfcf, 0.35);
    g.drawEllipse(0, -4, cellW * 0.18, cellH * 0.1);
    g.endFill();
    g.lineStyle(2, 0x6ef0e8, 0.9);
    g.moveTo(-cellW * 0.16, 8);
    g.lineTo(cellW * 0.16, 8);
    g.position.set(home.x, home.y);
    g.alpha = 0;
    g.scale.set(0.85);
    host.addChild(g);
    veils.push(g);
    gsap.to(g, { alpha: 1, duration: 0.28 });
    gsap.to(g.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(1.6)' });
  }
  return veils;
}

export function clearVeils(
  host: { removeChild: (c: Graphics) => void },
  veils: Graphics[],
): void {
  for (const v of veils) {
    gsap.killTweensOf(v);
    host.removeChild(v);
    v.destroy();
  }
  veils.length = 0;
}

export function startMeterPulse(meter: Sprite, readyTint: number): () => void {
  gsap.killTweensOf(meter);
  gsap.killTweensOf(meter.scale);
  const sx = meter.scale.x;
  const sy = meter.scale.y;
  const baseTint = meter.tint;
  const tw = gsap.to(meter.scale, {
    x: sx * 1.07,
    y: sy * 1.07,
    duration: 0.5,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
  });
  const tw2 = gsap.to(meter, {
    duration: 0.5,
    yoyo: true,
    repeat: -1,
    ease: 'sine.inOut',
    onUpdate(this: gsap.core.Tween) {
      meter.tint = this.progress() > 0.45 ? readyTint : baseTint;
    },
  });
  return () => {
    tw.kill();
    tw2.kill();
    meter.scale.set(sx, sy);
    meter.tint = baseTint;
  };
}

export function showFeatureBanner(
  banner: Text,
  text: string,
  color: number,
  holdMs: number,
  reducedMotion: boolean,
): Promise<void> {
  banner.visible = true;
  banner.text = text;
  banner.style.fill = color;
  banner.alpha = 0;
  banner.scale.set(reducedMotion ? 1 : 0.55);
  gsap.killTweensOf(banner);
  gsap.killTweensOf(banner.scale);
  return new Promise((resolve) => {
    if (reducedMotion) {
      banner.alpha = 1;
      window.setTimeout(() => {
        banner.alpha = 0;
        banner.visible = false;
        resolve();
      }, Math.min(holdMs, 700));
      return;
    }
    gsap.to(banner, { alpha: 1, duration: 0.22 });
    gsap.to(banner.scale, {
      x: 1,
      y: 1,
      duration: 0.35,
      ease: 'back.out(1.7)',
    });
    gsap.to(banner, {
      alpha: 0,
      delay: holdMs / 1000,
      duration: 0.3,
      onComplete: () => {
        banner.visible = false;
        resolve();
      },
    });
  });
}
