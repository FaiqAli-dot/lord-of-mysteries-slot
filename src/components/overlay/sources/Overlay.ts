import { Graphics } from 'pixi.js';
import type { LayerManager } from '../../game/sources/LayerManager';

/** Full-screen dim — Space Fortune overlay counterpart. */
export class Overlay {
  private g = new Graphics();
  private visible = false;

  mount(layers: LayerManager): void {
    const host = layers.get('overlay');
    if (!host) return;
    host.addChild(this.g);
    this.g.eventMode = 'none';
    this.draw(2048, 1080);
    this.g.alpha = 0;
  }

  private draw(w: number, h: number): void {
    this.g.clear();
    this.g.beginFill(0x000000, 0.55);
    this.g.drawRect(-w / 2, -h / 2, w, h);
    this.g.endFill();
    this.g.position.set(w / 2, h / 2);
  }

  show(): void {
    this.visible = true;
    this.g.alpha = 1;
  }

  hide(): void {
    this.visible = false;
    this.g.alpha = 0;
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
