import { Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { assetUrl, UI_TEXTURE } from '../assets';
import { bus } from '../EventBus';
import { designSize, type LayoutMode } from '../layout';

export class BackgroundView {
  private sprite: Sprite;

  constructor(layer: Container) {
    this.sprite = new Sprite(Texture.from(assetUrl(UI_TEXTURE.background)));
    this.sprite.anchor.set(0.5);
    layer.addChild(this.sprite);
    bus.on('resize', () => this.apply(this.lastMode));
  }

  private lastMode: LayoutMode = 'Desktop';

  apply(mode: LayoutMode): void {
    this.lastMode = mode;
    const { width, height } = designSize(mode);
    const tex = this.sprite.texture;
    if (!tex || !tex.width) return;
    const scale = Math.max(width / tex.width, height / tex.height);
    this.sprite.scale.set(scale);
    this.sprite.position.set(width / 2, height / 2);
  }
}
