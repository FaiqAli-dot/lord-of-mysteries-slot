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
import { GAME_CONFIG, type SymbolId } from '../../../config/gameConfig';
import { sequenceProgress } from '../../../engine/sequence';
import type { GameState } from '../../../engine/types';
import { designSize, detectLayout, type LayoutKind } from '../../../ui/sizeConfig';
import { playReelDrop, type DropMode } from '../../../ui/reelDrop';
import type { LayerManager } from '../../game/sources/LayerManager';
import type { SpiritualityActivation } from '../../../engine/types';
import type { LineWin, ScatterWin } from '../../../engine/types';
import {
  clearVeils,
  effectBannerText,
  flashCell,
  pulseSpecialCells,
  pulseWinningCells,
  showFeatureBanner,
  startMeterPulse,
} from './featureFx';

const SYMBOL_PATH: Record<SymbolId, string> = {
  FOOL: 'symbols/high/hv_icon_r3c6_star.png',
  MAGICIAN: 'symbols/high/hv_icon_r1c2_staff.png',
  PRIESTESS: 'symbols/high/hv_icon_r1c3_mirror.png', // Justice
  WHEEL: 'symbols/high/hv_icon_r2c6_radiant_sun.png', // The Sun
  HANGED: 'symbols/high/hv_icon_r2c1_hanged_figure.png',
  WORLD: 'symbols/high/hv_icon_r2c2_armillary.png',
  ACE: 'symbols/low/low_ace.png',
  KING: 'symbols/low/low_king.png',
  QUEEN: 'symbols/low/low_queen.png',
  JACK: 'symbols/low/low_jack_swirl.png',
  WILD: 'symbols/wild/wild_basic.png',
  SCATTER: 'symbols/scatter/scatter_wax_seal.png', // Crimson Tarot Card
  SEQUENCE: 'symbols/feature/feature_sequence.png', // Potion Bottle
  SPIRIT: 'symbols/feature/feature_spirituality.png',
  GLOVE: 'symbols/feature/feature_glove.png',
  MONSTER: 'symbols/feature/feature_creeping_hunger.png',
};

function assetUrl(rel: string): string {
  const b = import.meta.env.BASE_URL || '/';
  const base = b.endsWith('/') ? b : `${b}/`;
  return `${base}game-assets/${rel.replace(/^\//, '')}`;
}

/**
 * Exact measurements of `reel-frame.png` (676×369 RGBA).
 * Symbols land on section centers; mask clips to the inner window.
 */
const FRAME_NATIVE = {
  path: 'ui/frames/reel-frame.png',
  width: 676,
  height: 369,
  /** Inner reel window (mask) in image coordinates. */
  inner: { x: 189, y: 83, w: 306, h: 239 },
  /** 5 column section centers (x) in image coordinates. */
  colCenters: [219.5, 280.5, 342.0, 403.5, 464.5] as const,
  /** 4 row section centers (y) in image coordinates. */
  rowCenters: [112.9, 172.6, 232.4, 292.1] as const,
  colW: 61.2,
  rowH: 59.75,
} as const;

const CHARACTER_NATIVE = {
  path: 'characters/character-right.png',
  width: 408,
  height: 612,
  /** Content bounding box used for visual centering. */
  content: { x: 19, y: 33, w: 389, h: 545 },
} as const;

/**
 * Layout in design space. `frame` is the center of the reel-frame sprite;
 * `frameScale` maps native frame pixels → design pixels.
 * Character sits to the right of the frame, facing the reels.
 */
const LAYOUT = {
  desktop: {
    logo: { x: 1024, y: 64, fontSize: 40 },
    frame: { x: 880, y: 500, scale: 2.05 },
    character: { x: 1580, y: 520, height: 720 },
    seqMeter: { x: 200, y: 200, w: 64, h: 480 },
    spiritMeter: { x: 1880, y: 200, w: 64, h: 480 },
  },
  landscape: {
    logo: { x: 1024, y: 56, fontSize: 36 },
    frame: { x: 860, y: 490, scale: 1.95 },
    character: { x: 1560, y: 510, height: 680 },
    seqMeter: { x: 180, y: 190, w: 58, h: 460 },
    spiritMeter: { x: 1900, y: 190, w: 58, h: 460 },
  },
  portrait: {
    logo: { x: 540, y: 48, fontSize: 28 },
    frame: { x: 460, y: 420, scale: 1.35 },
    character: { x: 900, y: 430, height: 480 },
    seqMeter: { x: 48, y: 160, w: 44, h: 360 },
    spiritMeter: { x: 1032, y: 160, w: 44, h: 360 },
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
  private reelFrame!: Sprite;
  private character!: Sprite;
  private cellsRoot = new Container();
  private reelMask = new Graphics();
  private cells: Sprite[][] = [];
  private cellHome: { x: number; y: number }[][] = [];
  private cellStepH = 140;
  /** Current section size in design pixels (for fitCell). */
  private cellW = 110;
  private cellH = 108;
  private dropping = false;
  private seqMeter!: Sprite;
  private spiritMeter!: Sprite;
  private seqFill = new Graphics();
  private spiritFill = new Graphics();
  private winBanner!: Text;
  private featureBanner!: Text;
  private fxOverlay = new Container();
  private veils: Graphics[] = [];
  private stopSeqPulse: (() => void) | null = null;
  private stopSpiritPulse: (() => void) | null = null;
  private prevSeqMult = 1;
  private seqLabel!: Text;
  private spiritLabel!: Text;
  private seqFrame = new Graphics();
  private spiritFrame = new Graphics();
  /** Letterbox target — LayerManager root after attach, else local root. */
  private stageRoot!: Container;

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
    this.stageRoot = this.root;
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.bgLayer,
      this.fxLayer,
      this.reelLayer,
      this.uiLayer,
      this.winLayer,
    );
  }

  /** Remount presentation layers into LayerManager named containers (SF pattern). */
  attachToLayers(layers: LayerManager): void {
    const stageRoot = layers.root;
    if (this.root.parent) this.root.parent.removeChild(this.root);
    this.app.stage.removeChildren();
    this.app.stage.addChild(stageRoot);
    this.stageRoot = stageRoot;

    const move = (layerName: string, child: Container) => {
      const host = layers.get(layerName);
      if (!host) return;
      if (child.parent) child.parent.removeChild(child);
      host.addChild(child);
    };
    move('background', this.bgLayer);
    move('fx', this.fxLayer);
    move('reelset', this.reelLayer);
    move('meters', this.uiLayer);
    move('celebration', this.winLayer);
  }

  async init(): Promise<void> {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const urls = [
      assetUrl('backgrounds/bg_gothic_library_full.jpg'),
      assetUrl('ui/meters/ui_spirituality_meter.png'),
      assetUrl(FRAME_NATIVE.path),
      assetUrl(CHARACTER_NATIVE.path),
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

    // Character sits beside the frame (drawn first so the frame can overlap its left edge).
    this.character = new Sprite(Texture.from(assetUrl(CHARACTER_NATIVE.path)));
    this.character.anchor.set(0.5);
    this.reelLayer.addChild(this.character);

    this.reelFrame = new Sprite(Texture.from(assetUrl(FRAME_NATIVE.path)));
    this.reelFrame.anchor.set(0.5);
    this.reelLayer.addChild(this.reelFrame);

    // Symbols live in cellsRoot; mask clips to the frame's inner window only.
    this.reelMask.alpha = 0;
    this.reelLayer.addChild(this.cellsRoot);
    this.reelLayer.addChild(this.reelMask);
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      this.cells[r] = [];
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = new Sprite(Texture.EMPTY);
        s.anchor.set(0.5);
        this.cells[r][row] = s;
        this.cellsRoot.addChild(s);
      }
    }

    this.seqMeter = new Sprite(Texture.from(assetUrl('ui/meters/ui_spirituality_meter.png')));
    this.spiritMeter = new Sprite(Texture.from(assetUrl('ui/meters/ui_spirituality_meter.png')));
    this.seqMeter.anchor.set(0.5, 0);
    this.spiritMeter.anchor.set(0.5, 0);
    this.seqMeter.tint = 0xc4a35a;
    this.spiritMeter.tint = 0x6ecfcf;
    this.seqLabel = new Text('SEQUENCE', {
      fontFamily: 'Cinzel, Times New Roman, serif',
      fontSize: 16,
      fill: 0xe0c878,
      fontWeight: '700',
      letterSpacing: 2,
    });
    this.spiritLabel = new Text('SPIRIT', {
      fontFamily: 'Cinzel, Times New Roman, serif',
      fontSize: 16,
      fill: 0x6ef0e8,
      fontWeight: '700',
      letterSpacing: 2,
    });
    this.seqLabel.anchor.set(0.5, 1);
    this.spiritLabel.anchor.set(0.5, 1);
    this.uiLayer.addChild(
      this.seqFrame,
      this.spiritFrame,
      this.seqMeter,
      this.spiritMeter,
      this.seqFill,
      this.spiritFill,
      this.seqLabel,
      this.spiritLabel,
    );

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

    this.featureBanner = new Text('', {
      fontFamily: 'Cinzel, Times New Roman, serif',
      fontSize: 36,
      fill: 0x6ef0e8,
      fontWeight: '700',
      align: 'center',
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 10,
      wordWrap: true,
      wordWrapWidth: 900,
    });
    this.featureBanner.anchor.set(0.5);
    this.featureBanner.visible = false;
    this.winLayer.addChild(this.featureBanner);

    // Keep FX overlay above symbols
    this.reelLayer.addChild(this.fxOverlay);

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
    // Leave bottom band for ui-plugin chrome (~12–14% of design height).
    const chromePad = height * 0.06;
    const scale = Math.min(vw / width, (vh - chromePad) / height);
    const target = this.stageRoot ?? this.root;
    target.pivot.set(width / 2, height / 2);
    target.position.set(vw / 2, (vh - chromePad) / 2);
    target.scale.set(scale);

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

    const frameScale = L.frame.scale;
    this.reelFrame.position.set(L.frame.x, L.frame.y);
    this.reelFrame.scale.set(frameScale);

    // Map native frame image coords → design space (sprite centered at L.frame).
    const frameLeft = L.frame.x - (FRAME_NATIVE.width * frameScale) / 2;
    const frameTop = L.frame.y - (FRAME_NATIVE.height * frameScale) / 2;

    // Clip symbols to the exact inner reel window so they drop in/out behind the frame.
    const maskX = frameLeft + FRAME_NATIVE.inner.x * frameScale;
    const maskY = frameTop + FRAME_NATIVE.inner.y * frameScale;
    const maskW = FRAME_NATIVE.inner.w * frameScale;
    const maskH = FRAME_NATIVE.inner.h * frameScale;
    this.reelMask.clear();
    this.reelMask.beginFill(0xffffff);
    this.reelMask.drawRect(maskX, maskY, maskW, maskH);
    this.reelMask.endFill();
    this.cellsRoot.mask = this.reelMask;

    this.cellW = FRAME_NATIVE.colW * frameScale;
    this.cellH = FRAME_NATIVE.rowH * frameScale;
    this.cellStepH = this.cellH;
    this.cellHome = [];
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      this.cellHome[r] = [];
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = this.cells[r][row]!;
        const x = frameLeft + FRAME_NATIVE.colCenters[r]! * frameScale;
        const y = frameTop + FRAME_NATIVE.rowCenters[row]! * frameScale;
        this.cellHome[r]![row] = { x, y };
        if (!this.dropping) s.position.set(x, y);
        this.fitCell(s, this.cellW * 0.92, this.cellH * 0.92);
      }
    }

    // Klein on the throne — right of the reel frame, facing the reels.
    const charScale = L.character.height / CHARACTER_NATIVE.height;
    this.character.scale.set(charScale);
    this.character.position.set(L.character.x, L.character.y);

    this.placeMeter(this.seqMeter, this.seqFill, this.seqFrame, this.seqLabel, L.seqMeter, 0xc4a35a);
    this.placeMeter(
      this.spiritMeter,
      this.spiritFill,
      this.spiritFrame,
      this.spiritLabel,
      L.spiritMeter,
      0x3ecfcf,
    );
    this.winBanner.position.set(this.designW / 2, L.frame.y);
    this.featureBanner.position.set(this.designW / 2, L.frame.y - 120);
  }

  private placeMeter(
    sprite: Sprite,
    fill: Graphics,
    frame: Graphics,
    label: Text,
    cfg: { x: number; y: number; w: number; h: number },
    accent: number,
  ): void {
    sprite.position.set(cfg.x, cfg.y);
    if (sprite.texture.width) {
      sprite.scale.set(cfg.w / sprite.texture.width, cfg.h / sprite.texture.height);
    }
    fill.position.set(0, 0);
    // Readable plate behind the meter (BG art has a baked green bar — ours must win).
    const pad = 10;
    frame.clear();
    frame.beginFill(0x0a0908, 0.72);
    frame.drawRoundedRect(cfg.x - cfg.w / 2 - pad, cfg.y - 8, cfg.w + pad * 2, cfg.h + 36, 10);
    frame.endFill();
    frame.lineStyle(2, accent, 0.85);
    frame.drawRoundedRect(cfg.x - cfg.w / 2 - pad, cfg.y - 8, cfg.w + pad * 2, cfg.h + 36, 10);
    label.position.set(cfg.x, cfg.y - 12);
    label.style.fontSize = Math.max(12, Math.round(cfg.w * 0.28));
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
        this.fitCell(s, this.cellW * 0.92, this.cellH * 0.92);
        const home = this.cellHome[r]?.[row];
        if (home && !this.dropping) s.position.set(home.x, home.y);
      }
    }
  }

  private setColumnTextures(grid: SymbolId[][], reel: number): void {
    for (let row = 0; row < GAME_CONFIG.rows; row++) {
      const id = grid[reel]?.[row];
      if (!id) continue;
      const s = this.cells[reel]?.[row];
      if (!s) continue;
      s.texture = Texture.from(assetUrl(SYMBOL_PATH[id]));
      this.fitCell(s, this.cellW * 0.92, this.cellH * 0.92);
    }
  }

  private setReelMask(_enabled: boolean): void {
    // Always clip symbols to the inner window so drop-in / land / drop-out stay inside the frame.
    // Mask targets cellsRoot only — ornate frame + character stay fully visible.
    this.cellsRoot.mask = this.reelMask;
  }

  /**
   * Falling/drop after spin result (REEL_DROP_ANIMATION.md). Visual only.
   */
  async playDropToGrid(grid: SymbolId[][], mode: DropMode = 'normal'): Promise<void> {
    if (!this.cells.length) {
      this.setGrid(grid);
      return;
    }
    this.dropping = true;
    this.setReelMask(true);
    const cells: {
      sprite: Sprite;
      homeX: number;
      homeY: number;
      reel: number;
      row: number;
    }[] = [];
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const sprite = this.cells[r]![row]!;
        const home = this.cellHome[r]?.[row] ?? { x: sprite.x, y: sprite.y };
        cells.push({ sprite, homeX: home.x, homeY: home.y, reel: r, row });
      }
    }
    try {
      await playReelDrop({
        cells,
        cellHeight: this.cellStepH,
        rows: GAME_CONFIG.rows,
        reels: GAME_CONFIG.reels,
        mode,
        reducedMotion: this.reducedMotion,
        skipping: mode === 'slam',
        applyColumnTextures: (reel) => this.setColumnTextures(grid, reel),
      });
    } finally {
      this.setReelMask(false);
      this.dropping = false;
      this.setGrid(grid);
    }
  }

  setMeters(state: GameState | null): void {
    if (!this.seqMeter || !this.spiritMeter) return;
    const L = LAYOUT[this.layoutKind];
    const seq = state ? sequenceProgress(state.sequenceWins).progress : 0;
    const spirit =
      state && GAME_CONFIG.spirituality.threshold
        ? Math.min(1, state.spiritualityCharge / GAME_CONFIG.spirituality.threshold)
        : 0;
    this.drawFill(this.seqFill, L.seqMeter, seq, 0xc4a35a);
    this.drawFill(this.spiritFill, L.spiritMeter, spirit, 0x3ecfcf);

    // Next-spin special cues (meter full / sequence armed at high tier)
    const spiritReady =
      !!state &&
      state.phase === 'IDLE' &&
      state.spiritualityCharge >= GAME_CONFIG.spirituality.threshold;
    const seqReady =
      !!state &&
      state.phase === 'IDLE' &&
      state.sequenceMultiplier >= 2;
    this.setMeterReady(spiritReady, seqReady);
  }

  /** Pulse meters when the next spin will feel special. */
  setMeterReady(spiritReady: boolean, sequenceReady: boolean): void {
    if (!this.seqMeter || !this.spiritMeter) return;
    if (spiritReady && !this.stopSpiritPulse) {
      this.spiritMeter.tint = 0x6ecfcf;
      this.stopSpiritPulse = startMeterPulse(this.spiritMeter, 0xb8fff8);
    } else if (!spiritReady && this.stopSpiritPulse) {
      this.stopSpiritPulse();
      this.stopSpiritPulse = null;
      this.spiritMeter.tint = 0x6ecfcf;
    }
    if (sequenceReady && !this.stopSeqPulse) {
      this.seqMeter.tint = 0xc4a35a;
      this.stopSeqPulse = startMeterPulse(this.seqMeter, 0xffe4a0);
    } else if (!sequenceReady && this.stopSeqPulse) {
      this.stopSeqPulse();
      this.stopSeqPulse = null;
      this.seqMeter.tint = 0xc4a35a;
    }
  }

  /**
   * Morph natural reel result → post-Spirituality grid.
   * Grafting: show seed Wild first, then neighbors flip to Wild.
   */
  async playFeatureMorph(opts: {
    from: SymbolId[][];
    to: SymbolId[][];
    feature: SpiritualityActivation;
  }): Promise<void> {
    this.setGrid(opts.from);
    await showFeatureBanner(
      this.featureBanner,
      effectBannerText(opts.feature),
      0x6ef0e8,
      700,
      this.reducedMotion,
    );

    const d = opts.feature.detail;
    const fitW = this.cellW * 0.92;
    const fitH = this.cellH * 0.92;

    if (opts.feature.effect === 'GRAFTING') {
      const targetId =
        typeof d.targetSymbol === 'string'
          ? (d.targetSymbol as SymbolId)
          : typeof d.symbol === 'string'
            ? (d.symbol as SymbolId)
            : 'WILD';
      const tex = Texture.from(assetUrl(SYMBOL_PATH[targetId] ?? SYMBOL_PATH.WILD));
      const seed =
        d.seed && typeof (d.seed as { reel?: number }).reel === 'number'
          ? (d.seed as { reel: number; row: number })
          : {
              reel: typeof d.reel === 'number' ? d.reel : 0,
              row: typeof d.row === 'number' ? d.row : 0,
            };
      const seedCell = this.cells[seed.reel]?.[seed.row];
      if (seedCell) {
        seedCell.texture = tex;
        this.fitCell(seedCell, fitW, fitH);
        await flashCell(seedCell, 0xffe08a, this.reducedMotion);
      }
      await new Promise((r) => window.setTimeout(r, this.reducedMotion ? 120 : 280));
      // Neighbors morph into the highest-paying cluster symbol
      const neighbors = Array.isArray(d.positions)
        ? (d.positions as { reel: number; row: number }[])
        : [];
      for (const p of neighbors) {
        const cell = this.cells[p.reel]?.[p.row];
        if (!cell) continue;
        cell.texture = tex;
        this.fitCell(cell, fitW, fitH);
        await flashCell(cell, 0xb48cff, this.reducedMotion);
      }
    } else {
      // Other features: flip changed cells from → to
      for (let r = 0; r < GAME_CONFIG.reels; r++) {
        for (let row = 0; row < GAME_CONFIG.rows; row++) {
          if (opts.from[r]![row] === opts.to[r]![row]) continue;
          const cell = this.cells[r]?.[row];
          if (!cell) continue;
          const id = opts.to[r]![row]!;
          cell.texture = Texture.from(assetUrl(SYMBOL_PATH[id]));
          this.fitCell(cell, fitW, fitH);
          await flashCell(cell, 0x6ef0e8, this.reducedMotion);
        }
      }
    }

    this.setGrid(opts.to);
  }

  /**
   * After reels land: special-symbol pops, spirituality effect on cells,
   * sequence tier-up banner, tarot gathering banner.
   */
  async playFeaturePresentation(opts: {
    grid: SymbolId[][];
    feature: SpiritualityActivation | null;
    concealed: { reel: number; row: number }[] | null;
    graftedReel: number | null;
    sequenceMultiplier: number;
    tarotLabel?: string | null;
    spiritualityJustArmed?: boolean;
    lineWins?: LineWin[];
    scatterWin?: ScatterWin | null;
  }): Promise<void> {
    clearVeils(this.fxOverlay, this.veils);

    const winPositions: { reel: number; row: number }[] = [];
    for (const w of opts.lineWins ?? []) {
      for (const p of w.positions) winPositions.push(p);
    }
    if (opts.scatterWin) {
      for (const p of opts.scatterWin.positions) winPositions.push(p);
    }

    // Winning symbols pulse
    if (winPositions.length) {
      await pulseWinningCells(this.cells, winPositions, this.reducedMotion);
    }
    await pulseSpecialCells(this.cells, opts.grid, this.reducedMotion);

    // Spirituality effect choreography on the reels
    if (opts.feature) {
      await showFeatureBanner(
        this.featureBanner,
        effectBannerText(opts.feature),
        0x6ef0e8,
        1100,
        this.reducedMotion,
      );
      const d = opts.feature.detail;
      switch (opts.feature.effect) {
        case 'BLIND_STUPIDITY': {
          // Grid already shows upgraded highs — flash those cells hard so the change is obvious.
          const positions = Array.isArray(d.positions)
            ? (d.positions as { reel: number; row: number }[])
            : [];
          if (positions.length) {
            await pulseWinningCells(this.cells, positions, this.reducedMotion);
            for (const p of positions) {
              const cell = this.cells[p.reel]?.[p.row];
              if (cell) await flashCell(cell, 0xffd078, this.reducedMotion);
            }
          }
          break;
        }
        case 'GRAFTING': {
          // Morph already showed seed → neighbor spread; pulse the cluster.
          const seed =
            d.seed && typeof (d.seed as { reel?: number }).reel === 'number'
              ? (d.seed as { reel: number; row: number })
              : null;
          const neighbors = Array.isArray(d.positions)
            ? (d.positions as { reel: number; row: number }[])
            : [];
          const cluster = seed ? [seed, ...neighbors] : neighbors;
          if (cluster.length) {
            await pulseWinningCells(this.cells, cluster, this.reducedMotion);
          }
          break;
        }
        case 'CREEPING_HUNGER': {
          await showFeatureBanner(
            this.featureBanner,
            'HUNGER RESPIN',
            0xff8a6a,
            700,
            this.reducedMotion,
          );
          if (!this.reducedMotion) {
            const jobs = this.cells.flat().map((s) =>
              gsap.to(s, {
                x: s.x + (Math.random() - 0.5) * 14,
                duration: 0.06,
                yoyo: true,
                repeat: 5,
              }),
            );
            await Promise.all(jobs);
            for (let r = 0; r < GAME_CONFIG.reels; r++) {
              for (let row = 0; row < GAME_CONFIG.rows; row++) {
                const home = this.cellHome[r]?.[row];
                const s = this.cells[r]?.[row];
                if (home && s) s.position.set(home.x, home.y);
              }
            }
          }
          break;
        }
      }
    } else if (opts.spiritualityJustArmed) {
      await showFeatureBanner(
        this.featureBanner,
        'SPIRITUALITY READY — next spin awakens',
        0x6ef0e8,
        1400,
        this.reducedMotion,
      );
    }

    if (opts.sequenceMultiplier > this.prevSeqMult) {
      await showFeatureBanner(
        this.featureBanner,
        `SEQUENCE ×${opts.sequenceMultiplier} — next wins boosted`,
        0xe0c878,
        1300,
        this.reducedMotion,
      );
    }
    this.prevSeqMult = opts.sequenceMultiplier;

    if (opts.tarotLabel) {
      await showFeatureBanner(
        this.featureBanner,
        `GATHERING — ${opts.tarotLabel}`,
        0xe0c878,
        1200,
        this.reducedMotion,
      );
      await pulseSpecialCells(this.cells, opts.grid, this.reducedMotion);
    }
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

  /** @deprecated Drop animation runs after result via playDropToGrid */
  startSpinMotion(): void {
    /* no pre-result strip spin — drop is result-driven */
  }

  stopSpinMotion(): void {
    /* no-op */
  }

  dropModeForTurbo(turbo: 0 | 1 | 2, slam: boolean): DropMode {
    if (slam) return 'slam';
    if (turbo >= 2) return 'turbo';
    if (turbo === 1) return 'quick';
    return 'normal';
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
    const target = this.stageRoot ?? this.root;
    target.eventMode = enabled ? 'passive' : 'none';
  }

  get layout(): LayoutKind {
    return this.layoutKind;
  }
}
