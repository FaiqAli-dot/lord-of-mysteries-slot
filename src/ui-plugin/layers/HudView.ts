import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import gsap from 'gsap';
import { assetUrl, UI_TEXTURE } from '../assets';
import { bus } from '../EventBus';
import { layoutConfig, layoutOf, type LayoutMode } from '../layout';

function makeLabel(text: string, size: number, fill = 0xe0c878): Text {
  return new Text(text, {
    fontFamily: 'Cinzel, Times New Roman, serif',
    fontSize: size,
    fill,
    fontWeight: '600',
  });
}

export class HudView {
  private info = new Container();
  private buttons = new Container();
  private shadow = new Graphics();
  private spinBtn: Sprite;
  private betMinus: Container;
  private betPlus: Container;
  private balanceLabel = makeLabel('BALANCE', 22);
  private balanceValue = makeLabel('0', 28, 0xd8d2c8);
  private betLabel = makeLabel('BET', 22);
  private betValue = makeLabel('0', 28, 0xd8d2c8);
  private winLabel = makeLabel('WIN', 22);
  private winValue = makeLabel('0', 32, 0xd8d2c8);
  private title = makeLabel('PATHWAYS OF THE SEALED', 36, 0xc4a35a);
  private seqMeter: Sprite;
  private spiritMeter: Sprite;
  private seqFill = new Graphics();
  private spiritFill = new Graphics();
  private infoBtn: Container;
  private settingsBtn: Container;
  private spinEnabled = true;
  private winTween = { v: 0 };

  constructor(infoLayer: Container, buttonsLayer: Container) {
    infoLayer.addChild(this.info);
    buttonsLayer.addChild(this.buttons);

    this.info.addChild(this.shadow);
    this.title.anchor.set(0.5);
    this.info.addChild(this.title);

    this.seqMeter = new Sprite(Texture.from(assetUrl(UI_TEXTURE.meter)));
    this.spiritMeter = new Sprite(Texture.from(assetUrl(UI_TEXTURE.meter)));
    this.seqMeter.anchor.set(0.5, 0);
    this.spiritMeter.anchor.set(0.5, 0);
    this.seqMeter.tint = 0xc4a35a;
    this.spiritMeter.tint = 0x6ecfcf;
    this.info.addChild(this.seqMeter, this.spiritMeter, this.seqFill, this.spiritFill);

    for (const t of [
      this.balanceLabel,
      this.balanceValue,
      this.betLabel,
      this.betValue,
      this.winLabel,
      this.winValue,
    ]) {
      this.info.addChild(t);
    }

    this.spinBtn = new Sprite(Texture.from(assetUrl(UI_TEXTURE.spin)));
    this.spinBtn.anchor.set(0.5);
    this.spinBtn.eventMode = 'static';
    this.spinBtn.cursor = 'pointer';
    this.spinBtn.on('pointertap', () => {
      if (!this.spinEnabled) return;
      bus.emit('spin-button-pressed');
    });
    this.buttons.addChild(this.spinBtn);

    this.betMinus = this.makeCircleBtn('−', () => bus.emit('bet-decrease'));
    this.betPlus = this.makeCircleBtn('+', () => bus.emit('bet-increase'));
    this.buttons.addChild(this.betMinus, this.betPlus);

    this.infoBtn = this.makeCircleBtn('i', () => bus.emit('open-paytable'), 0x6b2e3a);
    this.settingsBtn = this.makeCircleBtn('⚙', () => bus.emit('open-settings'), 0x3a1820);
    this.buttons.addChild(this.infoBtn, this.settingsBtn);

    bus.on('resize', () => this.layout(this.mode));
    bus.on('update-balance', (n) => {
      this.balanceValue.text = formatCredits(n);
    });
    bus.on('update-bet', (n) => {
      this.betValue.text = formatCredits(n);
    });
    bus.on('update-win', (n) => {
      gsap.killTweensOf(this.winTween);
      this.winTween.v = n;
      this.winValue.text = formatCredits(n);
    });
    bus.on('update-win-animated', (n) => {
      gsap.killTweensOf(this.winTween);
      gsap.to(this.winTween, {
        v: n,
        duration: 0.7,
        ease: 'power1.out',
        onUpdate: () => {
          this.winValue.text = formatCredits(Math.round(this.winTween.v));
        },
      });
    });
    bus.on('toggle-on-spin-button', () => {
      this.spinEnabled = true;
      this.spinBtn.alpha = 1;
    });
    bus.on('toggle-off-spin-button', () => {
      this.spinEnabled = false;
      this.spinBtn.alpha = 0.55;
    });
    bus.on('update-sequence', (_mult, progress) => this.setMeter(this.seqFill, this.seqMeter, progress, 0xc4a35a));
    bus.on('update-spirituality', (charge, threshold) =>
      this.setMeter(this.spiritFill, this.spiritMeter, threshold ? charge / threshold : 0, 0x3ecfcf),
    );
  }

  private mode: LayoutMode = 'Desktop';

  private makeCircleBtn(label: string, onClick: () => void, fill = 0x1c1815): Container {
    const c = new Container();
    const g = new Graphics();
    g.beginFill(fill, 0.9);
    g.lineStyle(2, 0xc4a35a, 0.8);
    g.drawCircle(0, 0, 32);
    g.endFill();
    const t = makeLabel(label, 28, 0xe0c878);
    t.anchor.set(0.5);
    c.addChild(g, t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }

  private setMeter(fill: Graphics, meter: Sprite, progress: number, color: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const h = meter.height * 0.82;
    const w = Math.max(8, meter.width * 0.28);
    fill.clear();
    fill.beginFill(color, 0.75);
    const fh = h * p;
    fill.drawRoundedRect(meter.x - w / 2, meter.y + meter.height * 0.09 + (h - fh), w, fh, 4);
    fill.endFill();
  }

  layout(mode: LayoutMode): void {
    this.mode = mode;
    const sh = layoutOf(layoutConfig.shadow, mode);
    this.shadow.clear();
    this.shadow.beginFill(0x000000, sh.alpha);
    this.shadow.drawRect(sh.x, sh.y, sh.width, sh.height);
    this.shadow.endFill();

    const placeText = (node: Text, key: keyof typeof layoutConfig) => {
      const cfg = layoutOf(layoutConfig[key] as { Desktop: Record<string, number>; Portrait: Record<string, number> }, mode);
      node.position.set(cfg.x, cfg.y);
      node.style.fontSize = cfg.fontSize;
      node.anchor.set(cfg.anchorX ?? 0, 0);
    };
    placeText(this.balanceLabel, 'balanceLabel');
    placeText(this.balanceValue, 'balanceValue');
    placeText(this.betLabel, 'betLabel');
    placeText(this.betValue, 'betValue');
    placeText(this.winLabel, 'winLabel');
    placeText(this.winValue, 'winValue');

    const title = layoutOf(layoutConfig.title, mode);
    this.title.position.set(title.x, title.y);
    this.title.style.fontSize = title.fontSize;

    const spin = layoutOf(layoutConfig.spin, mode);
    this.spinBtn.position.set(spin.x + spin.size / 2, spin.y + spin.size / 2);
    const ts = this.spinBtn.texture;
    if (ts.width) this.spinBtn.scale.set(spin.size / Math.max(ts.width, ts.height));

    const bm = layoutOf(layoutConfig.betMinus, mode);
    const bp = layoutOf(layoutConfig.betPlus, mode);
    this.betMinus.position.set(bm.x + bm.size / 2, bm.y + bm.size / 2);
    this.betPlus.position.set(bp.x + bp.size / 2, bp.y + bp.size / 2);
    this.betMinus.scale.set(bm.size / 64);
    this.betPlus.scale.set(bp.size / 64);

    const ib = layoutOf(layoutConfig.infoButton, mode);
    const sb = layoutOf(layoutConfig.settingsButton, mode);
    this.infoBtn.position.set(ib.x + ib.size / 2, ib.y + ib.size / 2);
    this.settingsBtn.position.set(sb.x + sb.size / 2, sb.y + sb.size / 2);
    this.infoBtn.scale.set(ib.size / 64);
    this.settingsBtn.scale.set(sb.size / 64);

    const sm = layoutOf(layoutConfig.sequenceMeter, mode);
    const sp = layoutOf(layoutConfig.spiritMeter, mode);
    for (const [sprite, cfg] of [
      [this.seqMeter, sm],
      [this.spiritMeter, sp],
    ] as const) {
      sprite.position.set(cfg.x + cfg.width / 2, cfg.y);
      if (sprite.texture.width) {
        sprite.scale.set(cfg.width / sprite.texture.width, cfg.height / sprite.texture.height);
      }
    }
  }
}

function formatCredits(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
