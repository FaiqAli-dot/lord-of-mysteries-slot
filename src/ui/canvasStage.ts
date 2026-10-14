import { GAME_CONFIG, type SymbolId } from '../config/gameConfig';
import { sequenceProgress } from '../engine/sequence';
import type { GameState } from '../engine/types';

const SYMBOL_PATH: Record<SymbolId, string> = {
  FOOL: 'symbols/high/hv_icon_r3c6_star.png',
  MAGICIAN: 'symbols/high/hv_icon_r1c2_staff.png',
  PRIESTESS: 'symbols/high/hv_icon_r1c3_mirror.png',
  WHEEL: 'symbols/high/hv_icon_r1c4_zodiac_disk.png',
  HANGED: 'symbols/high/hv_icon_r2c1_hanged_figure.png',
  WORLD: 'symbols/high/hv_icon_r2c2_armillary.png',
  ACE: 'symbols/low/low_ace.png',
  KING: 'symbols/low/low_king.png',
  QUEEN: 'symbols/low/low_queen.png',
  JACK: 'symbols/low/low_jack_swirl.png',
  WILD: 'symbols/wild/wild_basic.png',
  SCATTER: 'symbols/scatter/scatter_wax_seal.png',
  SEQUENCE: 'symbols/feature/feature_sequence.png',
  SPIRIT: 'symbols/feature/feature_spirituality.png',
};

function assetUrl(rel: string): string {
  const b = import.meta.env.BASE_URL || '/';
  const base = b.endsWith('/') ? b : `${b}/`;
  return `${base}game-assets/${rel.replace(/^\//, '')}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** Canvas layer under the ui-plugin HUD (reels / bg / logo / meters). */
export class CanvasStage {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLImageElement | null = null;
  private meterImg: HTMLImageElement | null = null;
  private symbols = new Map<SymbolId, HTMLImageElement>();
  private spinNudge = 0;
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context missing');
    this.ctx = ctx;
  }

  async load(): Promise<void> {
    const [bg, meter, ...syms] = await Promise.all([
      loadImage(assetUrl('backgrounds/bg_gothic_library.png')).catch(() => null),
      loadImage(assetUrl('ui/meters/ui_spirituality_meter.png')).catch(() => null),
      ...((Object.keys(SYMBOL_PATH) as SymbolId[]).map(async (id) => {
        try {
          const img = await loadImage(assetUrl(SYMBOL_PATH[id]));
          return [id, img] as const;
        } catch {
          return [id, null] as const;
        }
      })),
    ]);
    this.bg = bg;
    this.meterImg = meter;
    for (const [id, img] of syms) {
      if (img) this.symbols.set(id, img);
    }
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  startSpinMotion(): void {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.spinNudge = (this.spinNudge + 0.35) % 12;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopSpinMotion(): void {
    cancelAnimationFrame(this.raf);
    this.spinNudge = 0;
  }

  draw(state: GameState | null): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Background cover
    if (this.bg) {
      const scale = Math.max(w / this.bg.width, h / this.bg.height);
      const bw = this.bg.width * scale;
      const bh = this.bg.height * scale;
      ctx.drawImage(this.bg, (w - bw) / 2, (h - bh) / 2, bw, bh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#1a1410');
      g.addColorStop(1, '#0a0908');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const portrait = h > w;
    // Reserve bottom band for plugin HUD (desktop ~18%, portrait ~28%)
    const hudReserve = portrait ? h * 0.28 : h * 0.18;
    const topPad = portrait ? h * 0.08 : h * 0.06;
    const sidePad = portrait ? w * 0.08 : w * 0.14;

    // Logo
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c4a35a';
    ctx.font = `600 ${Math.max(18, Math.min(36, w * 0.028))}px Cinzel, serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 8;
    ctx.fillText(GAME_CONFIG.title.toUpperCase(), w / 2, topPad * 0.7);
    ctx.restore();

    // Reel frame region
    const gridW = w - sidePad * 2;
    const gridH = h - topPad - hudReserve;
    const cellW = gridW / GAME_CONFIG.reels;
    const cellH = gridH / GAME_CONFIG.rows;
    const ox = sidePad;
    const oy = topPad;

    ctx.fillStyle = 'rgba(10, 9, 8, 0.55)';
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.85)';
    ctx.lineWidth = 3;
    roundRect(ctx, ox - 12, oy - 12, gridW + 24, gridH + 24, 12);
    ctx.fill();
    ctx.stroke();

    const grid = state?.grid;
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const id = (grid?.[r]?.[row] ?? 'JACK') as SymbolId;
        const img = this.symbols.get(id);
        const cx = ox + r * cellW + cellW / 2;
        const cy = oy + row * cellH + cellH / 2 + (this.spinNudge ? Math.sin(r + row + this.spinNudge) * 4 : 0);
        const maxW = cellW * 0.88;
        const maxH = cellH * 0.88;
        if (img) {
          const s = Math.min(maxW / img.width, maxH / img.height);
          const dw = img.width * s;
          const dh = img.height * s;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        } else {
          ctx.fillStyle = '#3a1820';
          ctx.fillRect(cx - maxW / 2, cy - maxH / 2, maxW, maxH);
          ctx.fillStyle = '#e0c878';
          ctx.font = '14px Cinzel, serif';
          ctx.textAlign = 'center';
          ctx.fillText(id.slice(0, 3), cx, cy);
        }
      }
    }

    // Sequence / Spirituality meters flanking the reels (Space Fortune-style side chrome)
    const seq = state ? sequenceProgress(state.sequenceWins) : { progress: 0, multiplier: 1 };
    const spirit =
      state && GAME_CONFIG.spirituality.threshold
        ? state.spiritualityCharge / GAME_CONFIG.spirituality.threshold
        : 0;
    this.drawMeter(ox - Math.min(56, sidePad * 0.7), oy, Math.min(44, sidePad * 0.55), gridH, seq.progress, '#c4a35a', 'SEQ');
    this.drawMeter(
      ox + gridW + Math.min(12, sidePad * 0.15),
      oy,
      Math.min(44, sidePad * 0.55),
      gridH,
      spirit,
      '#3ecfcf',
      'SPI',
    );
  }

  private drawMeter(
    x: number,
    y: number,
    mw: number,
    mh: number,
    progress: number,
    color: string,
    label: string,
  ): void {
    const ctx = this.ctx;
    if (mw < 8) return;
    if (this.meterImg) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(this.meterImg, x, y, mw, mh);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(20,16,14,0.7)';
      ctx.fillRect(x, y, mw, mh);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, mw, mh);
    }
    const p = Math.max(0, Math.min(1, progress));
    const fh = mh * 0.82 * p;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + mw * 0.3, y + mh * 0.09 + (mh * 0.82 - fh), mw * 0.4, fh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e0c878';
    ctx.font = '11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + mw / 2, y - 6);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
