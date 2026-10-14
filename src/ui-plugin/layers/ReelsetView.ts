import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { GAME_CONFIG, type SymbolId } from '../../config/gameConfig';
import { assetUrl, SYMBOL_TEXTURE } from '../assets';
import { bus } from '../EventBus';
import { layoutConfig, layoutOf, type LayoutMode } from '../layout';

export class ReelsetView {
  private root = new Container();
  private frame = new Graphics();
  private cells: Sprite[][] = [];
  private maskG = new Graphics();
  private spinning = false;

  constructor(layer: Container) {
    this.root.addChild(this.frame);
    this.root.addChild(this.maskG);
    layer.addChild(this.root);

    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      this.cells[r] = [];
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = new Sprite(Texture.EMPTY);
        s.anchor.set(0.5);
        this.cells[r][row] = s;
        this.root.addChild(s);
      }
    }
    this.root.mask = this.maskG;

    bus.on('resize', () => this.layout(this.mode));
    bus.on('grid-update', (grid) => this.setGrid(grid as SymbolId[][]));
    bus.on('spin-start', () => this.playSpin());
    bus.on('spin-stop', () => {
      this.spinning = false;
    });
  }

  private mode: LayoutMode = 'Desktop';

  layout(mode: LayoutMode): void {
    this.mode = mode;
    const cfg = layoutOf(layoutConfig.reel, mode);
    const { cellWidth: cw, cellHeight: ch, gapX, gapY, framePad, x, y } = cfg;
    const w = GAME_CONFIG.reels * cw + (GAME_CONFIG.reels - 1) * gapX;
    const h = GAME_CONFIG.rows * ch + (GAME_CONFIG.rows - 1) * gapY;

    this.root.position.set(x, y);

    this.frame.clear();
    this.frame.lineStyle(4, 0xc4a35a, 0.85);
    this.frame.beginFill(0x0a0908, 0.55);
    this.frame.drawRoundedRect(-framePad, -framePad, w + framePad * 2, h + framePad * 2, 12);
    this.frame.endFill();
    // Inner gold rule
    this.frame.lineStyle(1.5, 0x8a734a, 0.7);
    this.frame.drawRoundedRect(-framePad + 8, -framePad + 8, w + framePad * 2 - 16, h + framePad * 2 - 16, 8);

    this.maskG.clear();
    this.maskG.beginFill(0xffffff);
    this.maskG.drawRect(0, 0, w, h);
    this.maskG.endFill();

    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = this.cells[r][row];
        s.position.set(r * (cw + gapX) + cw / 2, row * (ch + gapY) + ch / 2);
        this.fitCell(s, cw - 8, ch - 8);
      }
    }
  }

  private fitCell(s: Sprite, maxW: number, maxH: number): void {
    const tex = s.texture;
    if (!tex || !tex.width) {
      s.width = maxW;
      s.height = maxH;
      return;
    }
    const scale = Math.min(maxW / tex.width, maxH / tex.height);
    s.scale.set(scale);
  }

  setGrid(grid: SymbolId[][]): void {
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const id = grid[r]?.[row];
        if (!id) continue;
        const path = SYMBOL_TEXTURE[id];
        const s = this.cells[r][row];
        s.texture = Texture.from(assetUrl(path));
        const cfg = layoutOf(layoutConfig.reel, this.mode);
        this.fitCell(s, cfg.cellWidth - 8, cfg.cellHeight - 8);
      }
    }
  }

  private playSpin(): void {
    this.spinning = true;
    const cfg = layoutOf(layoutConfig.reel, this.mode);
    for (let r = 0; r < GAME_CONFIG.reels; r++) {
      for (let row = 0; row < GAME_CONFIG.rows; row++) {
        const s = this.cells[r][row];
        const baseY = row * (cfg.cellHeight + cfg.gapY) + cfg.cellHeight / 2;
        gsap.killTweensOf(s);
        gsap.to(s, {
          y: baseY + 18,
          duration: 0.08,
          yoyo: true,
          repeat: 6 + r,
          ease: 'sine.inOut',
          onComplete: () => {
            s.y = baseY;
          },
        });
      }
    }
    window.setTimeout(() => {
      if (this.spinning) this.spinning = false;
    }, GAME_CONFIG.animation.spinMs + 200);
  }
}
