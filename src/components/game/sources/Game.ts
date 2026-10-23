import type { LayerManager } from './LayerManager';
import type { PixiStage } from '../../reelset/sources/Reelset';
import { Overlay } from '../../overlay/sources/Overlay';
import { Celebration } from '../../celebration/sources/Celebration';
import type { CheatsPanel } from '../../cheats/sources/CheatsPanel';

/**
 * Feature composition (Space Fortune Game.initializeComponents counterpart).
 * Mount order matches layers.json z-order expectations.
 */
export class Game {
  readonly celebration: Celebration;
  readonly overlay: Overlay;

  constructor(
    readonly stage: PixiStage,
    readonly layers: LayerManager,
    readonly cheats: CheatsPanel | null,
  ) {
    this.celebration = new Celebration(stage);
    this.overlay = new Overlay();
  }

  initializeComponents(): void {
    this.overlay.mount(this.layers);
    this.cheats?.mount();
  }
}
