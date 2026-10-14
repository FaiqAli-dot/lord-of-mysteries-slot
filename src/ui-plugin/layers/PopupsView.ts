import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import gsap from 'gsap';
import { SYMBOLS, type BonusModeId } from '../../config/gameConfig';
import { assetUrl, UI_TEXTURE } from '../assets';
import { bus } from '../EventBus';
import { designSize, layoutConfig, layoutOf, type LayoutMode } from '../layout';

export class PopupsView {
  private root = new Container();
  private dim = new Graphics();
  private bigWin: Sprite;
  private bigWinAmount = new Text('', {
    fontFamily: 'Cinzel, serif',
    fontSize: 48,
    fill: 0xe0c878,
    fontWeight: '700',
  });
  private panel = new Container();
  private panelChrome = new Graphics();
  private panelParchment: Sprite;
  private panelDivider: Sprite;
  private panelTitle = new Text('', {
    fontFamily: 'Cinzel, serif',
    fontSize: 32,
    fill: 0xc4a35a,
    fontWeight: '700',
    wordWrap: true,
    wordWrapWidth: 520,
    align: 'center',
  });
  private panelBody = new Text('', {
    fontFamily: 'Cormorant Garamond, Georgia, serif',
    fontSize: 24,
    fill: 0xd8d2c8,
    wordWrap: true,
    wordWrapWidth: 520,
    align: 'center',
  });
  private actions = new Container();
  private mode: LayoutMode = 'Desktop';
  private panelW = 640;
  private panelH = 420;

  constructor(layer: Container) {
    layer.addChild(this.root);
    this.root.visible = false;
    this.root.addChild(this.dim);

    this.bigWin = new Sprite(Texture.from(assetUrl(UI_TEXTURE.bigWin)));
    this.bigWin.anchor.set(0.5);
    this.bigWin.visible = false;
    this.bigWinAmount.anchor.set(0.5);
    this.bigWinAmount.visible = false;
    this.root.addChild(this.bigWin, this.bigWinAmount);

    // Parchment kit piece is a multi-element sheet — use as a muted underlay, not a full modal.
    this.panelParchment = new Sprite(Texture.from(assetUrl(UI_TEXTURE.parchment)));
    this.panelParchment.anchor.set(0.5);
    this.panelDivider = new Sprite(Texture.from(assetUrl(UI_TEXTURE.divHGold)));
    this.panelDivider.anchor.set(0.5);
    this.panelTitle.anchor.set(0.5);
    this.panelBody.anchor.set(0.5, 0);
    this.panel.addChild(
      this.panelChrome,
      this.panelParchment,
      this.panelDivider,
      this.panelTitle,
      this.panelBody,
      this.actions,
    );
    this.panel.visible = false;
    this.root.addChild(this.panel);

    bus.on('resize', () => this.layout(this.mode));
    bus.on('show-big-win', (amount) => this.showBigWin(amount));
    bus.on('hide-big-win', () => this.hideBigWin());
    bus.on('show-bonus-select', () => this.showBonusSelect());
    bus.on('show-bonus-summary', (name, total) => this.showBonusSummary(name, total));
    bus.on('hide-bonus-overlay', () => this.hidePanel());
    bus.on('open-paytable', () => this.showPaytable());
    bus.on('open-settings', () => this.showSettings());
    bus.on('close-popups', () => {
      this.hideBigWin();
      this.hidePanel();
    });
  }

  layout(mode: LayoutMode): void {
    this.mode = mode;
    const { width, height } = designSize(mode);
    this.dim.clear();
    this.dim.beginFill(0x000000, 0.55);
    this.dim.drawRect(0, 0, width, height);
    this.dim.endFill();

    const bw = layoutOf(layoutConfig.bigWin, mode);
    this.bigWin.position.set(bw.x, bw.y);
    const fitted = this.bigWin.texture.width
      ? (720 * bw.scale) / this.bigWin.texture.width
      : bw.scale;
    if (this.bigWin.visible && this.bigWin.alpha > 0.9) {
      this.bigWin.scale.set(fitted);
    }
    this.bigWinAmount.position.set(bw.x, bw.y + 120 * bw.scale);

    this.panelW = mode === 'Portrait' ? 780 : 640;
    this.relayoutPanel();
    this.panel.position.set(width / 2, height / 2);
  }

  private relayoutPanel(): void {
    const actionCount = this.actions.children.length;
    const bodyLines = Math.max(1, this.panelBody.text.split('\n').length);
    const contentH = 90 + bodyLines * 28 + actionCount * 70 + 48;
    this.panelH = Math.max(360, Math.min(560, contentH));

    this.panelChrome.clear();
    this.panelChrome.beginFill(0x1a1410, 0.94);
    this.panelChrome.lineStyle(3, 0xc4a35a, 0.9);
    this.panelChrome.drawRoundedRect(-this.panelW / 2, -this.panelH / 2, this.panelW, this.panelH, 16);
    this.panelChrome.endFill();
    this.panelChrome.lineStyle(1, 0x8a734a, 0.55);
    this.panelChrome.drawRoundedRect(
      -this.panelW / 2 + 10,
      -this.panelH / 2 + 10,
      this.panelW - 20,
      this.panelH - 20,
      12,
    );

    if (this.panelParchment.texture.width) {
      const targetW = this.panelW - 64;
      const s = Math.min(targetW / this.panelParchment.texture.width, (this.panelH - 40) / this.panelParchment.texture.height);
      this.panelParchment.scale.set(s);
      this.panelParchment.alpha = 0.22;
      this.panelParchment.position.set(0, 0);
    }

    this.panelTitle.style.wordWrapWidth = this.panelW - 80;
    this.panelBody.style.wordWrapWidth = this.panelW - 80;
    this.panelTitle.position.set(0, -this.panelH / 2 + 56);
    if (this.panelDivider.texture.width) {
      this.panelDivider.scale.set((this.panelW - 120) / this.panelDivider.texture.width);
      this.panelDivider.position.set(0, -this.panelH / 2 + 96);
    }
    this.panelBody.position.set(0, -this.panelH / 2 + 120);

    const actionsTop = -this.panelH / 2 + 120 + bodyLines * 28 + 36;
    this.actions.position.set(0, actionsTop);
    for (let i = 0; i < this.actions.children.length; i++) {
      this.actions.children[i]!.y = i * 70;
    }
  }

  private showRoot(): void {
    this.root.visible = true;
  }

  private showBigWin(amount: number): void {
    this.showRoot();
    this.bigWin.visible = true;
    this.bigWinAmount.visible = true;
    this.bigWinAmount.text = amount.toLocaleString('en-US');
    this.bigWin.alpha = 0;
    const target = this.bigWin.texture.width
      ? (720 * layoutOf(layoutConfig.bigWin, this.mode).scale) / this.bigWin.texture.width
      : 1;
    this.bigWin.scale.set(target * 0.35);
    gsap.killTweensOf(this.bigWin);
    gsap.killTweensOf(this.bigWin.scale);
    gsap.to(this.bigWin, { alpha: 1, duration: 0.25 });
    gsap.to(this.bigWin.scale, { x: target, y: target, duration: 0.45, ease: 'back.out(1.6)' });
    window.setTimeout(() => this.hideBigWin(), 2200);
  }

  private hideBigWin(): void {
    this.bigWin.visible = false;
    this.bigWinAmount.visible = false;
    if (!this.panel.visible) this.root.visible = false;
  }

  private clearActions(): void {
    this.actions.removeChildren();
  }

  private addAction(label: string, onClick: () => void): void {
    const btn = new Container();
    const g = new Graphics();
    g.beginFill(0x3a1820, 0.95);
    g.lineStyle(2, 0xc4a35a, 0.9);
    g.drawRoundedRect(-130, -28, 260, 56, 8);
    g.endFill();
    const t = new Text(label, {
      fontFamily: 'Cinzel, serif',
      fontSize: 22,
      fill: 0xe0c878,
      fontWeight: '600',
    });
    t.anchor.set(0.5);
    btn.addChild(g, t);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onClick);
    this.actions.addChild(btn);
  }

  private showPanel(title: string, body: string): void {
    this.showRoot();
    this.panel.visible = true;
    this.panelTitle.text = title.toUpperCase();
    this.panelBody.text = body;
    this.clearActions();
  }

  private hidePanel(): void {
    this.panel.visible = false;
    this.clearActions();
    if (!this.bigWin.visible) this.root.visible = false;
  }

  private showBonusSelect(): void {
    this.showPanel('Choose Your Path', 'Three or four Seals have opened.\nSelect a bonus.');
    this.addAction('Tarot Club', () => bus.emit('select-bonus', 'TAROT_CLUB' as BonusModeId));
    this.addAction('Crimson Moon', () => bus.emit('select-bonus', 'CRIMSON_MOON' as BonusModeId));
    this.layout(this.mode);
  }

  private showBonusSummary(name: string, total: number): void {
    this.showPanel(String(name), `Bonus complete\nTotal won: ${total.toLocaleString('en-US')}`);
    this.addAction('Continue', () => {
      bus.emit('ack-bonus-summary');
      this.hidePanel();
    });
    this.layout(this.mode);
  }

  private showPaytable(): void {
    const lines = Object.values(SYMBOLS)
      .filter((s) => s.tier === 'high' || s.tier === 'low')
      .slice(0, 8)
      .map((s) => `${s.name}: ${s.pays.join(' / ')}`)
      .join('\n');
    this.showPanel('Paytable', `20 paylines · 5×4\n\n${lines}\n\n(Demo credits only)`);
    this.addAction('Close', () => this.hidePanel());
    this.layout(this.mode);
  }

  private showSettings(): void {
    this.showPanel(
      'Settings',
      'M mute · R reset demo · Esc close\nSpace / Enter spins.',
    );
    this.addAction('Toggle Sound', () => bus.emit('toggle-sound'));
    this.addAction('Close', () => this.hidePanel());
    this.layout(this.mode);
  }
}
