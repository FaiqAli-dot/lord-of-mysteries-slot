import {
  Application,
  Assets,
  BLEND_MODES,
  Container,
  Graphics,
  ParticleContainer,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import gsap from 'gsap';
import { GAME_CONFIG, type SymbolId } from '../config/gameConfig';
import { sequenceProgress } from '../engine/sequence';
import type { GameState } from '../engine/types';
import { designSize, detectLayout, type LayoutKind } from './sizeConfig';

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

/** 5×4 layout tuned so reels sit above plugin chrome (bottom ~12–15%). */
const LAYOUT = {
  desktop: {
    logo: { x: 1024, y: 72, fontSize: 42 },
    reel: { x: 1024, y: 470, cellW: 168, cellH: 132, gapX: 10, gapY: 8, scale: 1 },
    seqMeter: { x: 210, y: 200, w: 52, h: 520 },
    spiritMeter: { x: 1838, y: 200, w: 52, h: 520 },
  },
  landscape: {
    logo: { x: 1024, y: 64, fontSize: 38 },
    reel: { x: 1024, y: 460, cellW: 160, cellH: 126, gapX: 8, gapY: 6, scale: 0.95 },
    seqMeter: { x: 180, y: 180, w: 48, h: 500 },
    spiritMeter: { x: 1868, y: 180, w: 48, h: 500 },
  },
  portrait: {
    logo: { x: 540, y: 56, fontSize: 30 },
    reel: { x: 540, y: 430, cellW: 150, cellH: 118, gapX: 8, gapY: 6, scale: 0.92 },
    seqMeter: { x: 48, y: 160, w: 40, h: 420 },
    spiritMeter: { x: 992, y: 160, w: 40, h: 420 },
  },
} as const;

type Mote = {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
};

/**
 * Pixi stage under ui-plugin: background + ambient FX, logo, 5×4 reels, meters, wins.
 * Design space: 2048×1080 (desktop/landscape) or 1080×1080 (portrait).
 */
export class PixiStage {
  readonly app: Application;
  private root = new Container();
  private bgLayer = new Container();
  private fxLayer = new Container();
  private reelLayer = new Container();
  private uiLayer = new Container(); // logo + meters (not plugin chrome)
  private winLayer = new Container();

  private bgSprite!: Sprite;
  private mist!: Graphics;
  private moonGlow!: Graphics;
  private bookGlow!: Graphics;
  private lampGlows: Graphics[] = [];
  private particles!: ParticleContainer;
  private motes: Mote[] = [];
  private moteTex!: Texture;

  private logo!: Text;
  private reelFrame!: Graphics;
  private cells: Sprite[][] = [];
  private seqMeter!: Sprite;
  private spiritMeter!: Sprite;
  private seqFill = new Graphics();
  private spiritFill = new Graphics();
  private winBanner!: Text;

  private layoutKind: LayoutKind = 'desktop';
  private designW = 2048;
  private designH = 1080;
  private reducedMotion = false;
  private tickerBound = false;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new Application({
      view: canvas,
      backgroundColor: 0x0a0908,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: window,
    });
    this.app.stage.addChild(this.root);
    this.root.addChild(this.bgLayer, this.fxLayer, this.reelLayer, this.uiLayer, this.winLayer);
  }

  async init(): Promise<void> {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const urls = [
      assetUrl('backgrounds/bg_gothic_library_full.jpg'),
      assetUrl('ui/meters/ui_spirituality_meter.png'),
      ...Object.values(SYMBOL_PATH).map((p) => assetUrl(p)),
    ];
    await Assets.load(urls);

    this.bgSprite = new Sprite(Texture.from(assetUrl('backgrounds/bg_gothic_library_full.jpg')));
    this.bgSprite.anchor.set(0.5);
    this.bgLayer.addChild(this.bgSprite);

    this.moonGlow = new Graphics();
    this.bookGlow = new Graphics();
    this.mist = new Graphics();
    this.fxLayer.addChild(this.moonGlow, this.bookGlow, this.mist);

    // Soft lamp glows near typical lantern positions (relative design space)
    for (let i = 0; i < 4; i++) {
      const g = new Graphics();
      this.lampGlows.push(g);
      this.fxLayer.addChild(g);
    }

    this.moteTex = this.makeDotTexture();
    this.particles = new ParticleContainer(120, {
      scale: true,
      position: true,
      alpha: true,
      tint: true,
    });
    this.fxLayer.addChild(this.particles);
    if (!this.reducedMotion) this.seedMotes(90);

    this.logo = new Text(GAME_CONFIG.title.toUpperCase(), {
      fontFamily: 'Cinzel, Times New Roman, serif',
      fontSize: 42,
      fill: 0xc4a35a,
      fontWeight: '700',
    });
    this.logo.anchor.set(0.5);
    this.uiLayer.addChild(this.logo);

    this.reelFrame = new Graphics();
    this.reelLayer.addChild(this.reelFrame);
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      this.cells[r] = [];
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = new Sprite(Texture.EMPTY);
        s.anchor.set(0.5);
        this.cells[r][row] = s;
        this.reelLayer.addChild(s);
      }
    }

    this.seqMeter = new Sprite(Texture.from(assetUrl('ui/meters/ui_spirituality_meter.png')));
    this.spiritMeter = new Sprite(Texture.from(assetUrl('ui/meters/ui_spirituality_meter.png')));
    this.seqMeter.anchor.set(0.5, 0);
    this.spiritMeter.anchor.set(0.5, 0);
    this.seqMeter.tint = 0xc4a35a;
    this.spiritMeter.tint = 0x6ecfcf;
    this.uiLayer.addChild(this.seqMeter, this.spiritMeter, this.seqFill, this.spiritFill);

    this.winBanner = new Text('', {
      fontFamily: 'Cinzel, serif',
      fontSize: 56,
      fill: 0xe0c878,
      fontWeight: '700',
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 8,
    });
    this.winBanner.anchor.set(0.5);
    this.winBanner.visible = false;
    this.winLayer.addChild(this.winBanner);

    if (!this.tickerBound) {
      this.app.ticker.add(this.onTick);
      this.tickerBound = true;
    }
    this.onResize();
  }

  private makeDotTexture(): Texture {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    return Texture.from(c);
  }

  private seedMotes(n: number): void {
    for (let i = 0; i < n; i++) {
      const s = new Sprite(this.moteTex);
      s.anchor.set(0.5);
      s.blendMode = BLEND_MODES.ADD;
      const teal = Math.random() > 0.45;
      s.tint = teal ? 0x3ecfcf : 0x7ad7ff;
      s.alpha = 0.15 + Math.random() * 0.35;
      s.scale.set(0.25 + Math.random() * 0.7);
      const mote: Mote = {
        sprite: s,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.05 - Math.random() * 0.2,
        life: Math.random() * 200,
        maxLife: 180 + Math.random() * 220,
      };
      this.motes.push(mote);
      this.particles.addChild(s);
      this.resetMote(mote, true);
    }
  }

  private resetMote(m: Mote, randomY: boolean): void {
    m.sprite.x = Math.random() * this.designW;
    m.sprite.y = randomY ? Math.random() * this.designH : this.designH + 10;
    m.life = 0;
    m.maxLife = 180 + Math.random() * 220;
  }

  private onTick = (): void => {
    if (this.reducedMotion) return;
    const t = performance.now() * 0.001;
    // Moon / window pulse (center-upper)
    const pulse = 0.25 + Math.sin(t * 0.7) * 0.08;
    this.moonGlow.clear();
    this.moonGlow.beginFill(0x5ec8e8, pulse);
    this.moonGlow.drawEllipse(this.designW * 0.5, this.designH * 0.32, this.designW * 0.18, this.designH * 0.16);
    this.moonGlow.endFill();

    // Floating book glows (left / right mid)
    const bp = 0.12 + Math.sin(t * 1.1) * 0.05;
    this.bookGlow.clear();
    this.bookGlow.beginFill(0x3ecfcf, bp);
    this.bookGlow.drawCircle(this.designW * 0.18, this.designH * 0.42, 36);
    this.bookGlow.drawCircle(this.designW * 0.82, this.designH * 0.4, 40);
    this.bookGlow.drawCircle(this.designW * 0.22, this.designH * 0.55, 28);
    this.bookGlow.endFill();

    // Lantern flicker
    const lamps = [
      [0.12, 0.28],
      [0.88, 0.28],
      [0.08, 0.48],
      [0.92, 0.48],
    ];
    for (let i = 0; i < this.lampGlows.length; i++) {
      const g = this.lampGlows[i]!;
      const [lx, ly] = lamps[i]!;
      const flick = 0.18 + Math.sin(t * 9 + i * 2.1) * 0.06 + Math.sin(t * 17 + i) * 0.03;
      g.clear();
      g.beginFill(0xffc070, flick);
      g.drawCircle(this.designW * lx, this.designH * ly, 22);
      g.endFill();
    }

    // Floor mist scroll
    const mistY = this.designH * 0.78;
    const ox = (t * 18) % 80;
    this.mist.clear();
    this.mist.beginFill(0xb8d4e8, 0.06);
    for (let i = -1; i < 8; i++) {
      this.mist.drawEllipse(i * 140 + ox, mistY + Math.sin(t + i) * 6, 120, 28);
    }
    this.mist.endFill();

    for (const m of this.motes) {
      m.life += 1;
      m.sprite.x += m.vx;
      m.sprite.y += m.vy;
      m.sprite.alpha = 0.1 + 0.35 * Math.sin((m.life / m.maxLife) * Math.PI);
      if (m.life > m.maxLife || m.sprite.y < -20) this.resetMote(m, false);
    }
  };

  onResize(): LayoutKind {
    this.layoutKind = detectLayout();
    const { width, height } = designSize(this.layoutKind);
    this.designW = width;
    this.designH = height;

    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const scale = Math.min(vw / width, vh / height);
    this.root.pivot.set(width / 2, height / 2);
    this.root.position.set(vw / 2, vh / 2);
    this.root.scale.set(scale);

    this.layoutContent();
    return this.layoutKind;
  }

  private layoutContent(): void {
    const L = LAYOUT[this.layoutKind];
    // Cover-fit background; keep arched window centered behind reels
    const tex = this.bgSprite.texture;
    if (tex.width) {
      const s = Math.max(this.designW / tex.width, this.designH / tex.height);
      this.bgSprite.scale.set(s);
      this.bgSprite.position.set(this.designW / 2, this.designH / 2);
    }

    this.logo.position.set(L.logo.x, L.logo.y);
    this.logo.style.fontSize = L.logo.fontSize;

    const { cellW, cellH, gapX, gapY, scale } = L.reel;
    const gridW = GAME_CONFIG.reels * cellW + (GAME_CONFIG.reels - 1) * gapX;
    const gridH = GAME_CONFIG.rows * cellH + (GAME_CONFIG.rows - 1) * gapY;
    const ox = L.reel.x - (gridW * scale) / 2;
    const oy = L.reel.y - (gridH * scale) / 2;

    this.reelFrame.clear();
    this.reelFrame.lineStyle(4, 0xc4a35a, 0.9);
    this.reelFrame.beginFill(0x0a0908, 0.5);
    this.reelFrame.drawRoundedRect(ox - 16, oy - 16, gridW * scale + 32, gridH * scale + 32, 12);
    this.reelFrame.endFill();

    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = this.cells[r][row]!;
        s.position.set(
          ox + (r * (cellW + gapX) + cellW / 2) * scale,
          oy + (row * (cellH + gapY) + cellH / 2) * scale,
        );
        this.fitCell(s, cellW * scale * 0.9, cellH * scale * 0.9);
      }
    }

    this.placeMeter(this.seqMeter, this.seqFill, L.seqMeter);
    this.placeMeter(this.spiritMeter, this.spiritFill, L.spiritMeter);
    this.winBanner.position.set(this.designW / 2, L.reel.y);
  }

  private placeMeter(
    sprite: Sprite,
    fill: Graphics,
    cfg: { x: number; y: number; w: number; h: number },
  ): void {
    sprite.position.set(cfg.x, cfg.y);
    if (sprite.texture.width) {
      sprite.scale.set(cfg.w / sprite.texture.width, cfg.h / sprite.texture.height);
    }
    fill.position.set(0, 0);
  }

  private fitCell(s: Sprite, maxW: number, maxH: number): void {
    const tex = s.texture;
    if (!tex.width) {
      s.width = maxW;
      s.height = maxH;
      return;
    }
    const sc = Math.min(maxW / tex.width, maxH / tex.height);
    s.scale.set(sc);
  }

  setGrid(grid: SymbolId[][]): void {
    if (!this.cells.length || !this.cells[0]?.length) return;
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const id = grid[r]?.[row];
        if (!id) continue;
        const s = this.cells[r]?.[row];
        if (!s) continue;
        s.texture = Texture.from(assetUrl(SYMBOL_PATH[id]));
        const L = LAYOUT[this.layoutKind].reel;
        this.fitCell(s, L.cellW * L.scale * 0.9, L.cellH * L.scale * 0.9);
      }
    }
  }

  setMeters(state: GameState | null): void {
    if (!this.seqMeter || !this.spiritMeter) return;
    const L = LAYOUT[this.layoutKind];
    const seq = state ? sequenceProgress(state.sequenceWins).progress : 0;
    const spirit =
      state && GAME_CONFIG.spirituality.threshold
        ? state.spiritualityCharge / GAME_CONFIG.spirituality.threshold
        : 0;
    this.drawFill(this.seqFill, L.seqMeter, seq, 0xc4a35a);
    this.drawFill(this.spiritFill, L.spiritMeter, spirit, 0x3ecfcf);
  }

  private drawFill(
    g: Graphics,
    cfg: { x: number; y: number; w: number; h: number },
    p: number,
    color: number,
  ): void {
    const prog = Math.max(0, Math.min(1, p));
    const h = cfg.h * 0.82;
    const w = Math.max(8, cfg.w * 0.28);
    const fh = h * prog;
    g.clear();
    g.beginFill(color, 0.75);
    g.drawRoundedRect(cfg.x - w / 2, cfg.y + cfg.h * 0.09 + (h - fh), w, fh, 4);
    g.endFill();
  }

  startSpinMotion(): void {
    const L = LAYOUT[this.layoutKind].reel;
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = this.cells[r][row]!;
        const baseY = s.y;
        gsap.killTweensOf(s);
        gsap.to(s, {
          y: baseY + 14,
          duration: 0.07,
          yoyo: true,
          repeat: 8 + r,
          ease: 'sine.inOut',
          onComplete: () => {
            s.y = baseY;
          },
        });
      }
    }
    void L;
  }

  stopSpinMotion(): void {
    /* tweens complete on their own */
  }

  showWinCelebration(amount: number): void {
    if (amount <= 0) return;
    this.winBanner.visible = true;
    this.winBanner.text = amount.toLocaleString('en-US');
    this.winBanner.alpha = 0;
    this.winBanner.scale.set(0.4);
    gsap.killTweensOf(this.winBanner);
    gsap.killTweensOf(this.winBanner.scale);
    gsap.to(this.winBanner, { alpha: 1, duration: 0.25 });
    gsap.to(this.winBanner.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(1.6)' });
    gsap.to(this.winBanner, {
      alpha: 0,
      delay: 1.6,
      duration: 0.35,
      onComplete: () => {
        this.winBanner.visible = false;
      },
    });
  }

  setInteractive(enabled: boolean): void {
    this.root.eventMode = enabled ? 'passive' : 'none';
  }

  get layout(): LayoutKind {
    return this.layoutKind;
  }
}
