import { Container } from 'pixi.js';
import { designSize, detectLayout, type LayoutMode } from './layout';
import { bus } from './EventBus';

/**
 * Layered stage mirroring reference order (Containers stand in for @pixi/layers
 * Layer nodes — same z-order contract: background → reelset → ui_info → ui_buttons → ui_popups).
 */
export class LayerManager {
  readonly stage = new Container();
  readonly root = new Container();
  readonly background = new Container();
  readonly reelset = new Container();
  readonly uiInfo = new Container();
  readonly uiButtons = new Container();
  readonly uiPopups = new Container();

  mode: LayoutMode = 'Desktop';
  scale = 1;
  offsetX = 0;
  offsetY = 0;

  constructor() {
    this.stage.sortableChildren = true;
    this.root.sortableChildren = true;
    this.stage.addChild(this.root);

    const layers: [Container, number][] = [
      [this.background, 0],
      [this.reelset, 10],
      [this.uiInfo, 20],
      [this.uiButtons, 30],
      [this.uiPopups, 40],
    ];
    for (const [layer, z] of layers) {
      layer.zIndex = z;
      layer.sortableChildren = true;
      this.root.addChild(layer);
    }
  }

  onResize(viewW: number, viewH: number): void {
    this.mode = detectLayout(viewW, viewH);
    const design = designSize(this.mode);
    this.scale = Math.min(viewW / design.width, viewH / design.height);
    this.offsetX = (viewW - design.width * this.scale) / 2;
    this.offsetY = (viewH - design.height * this.scale) / 2;
    this.root.scale.set(this.scale);
    this.root.position.set(this.offsetX, this.offsetY);
    bus.emit('resize');
  }
}
