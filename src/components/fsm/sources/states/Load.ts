import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class Load extends State {
  readonly name = 'Load';

  async onEnter(ctx: GameContext): Promise<unknown> {
    ctx.setStatus('Loading…');
    await ctx.stage.init();
    ctx.layers.buildStage();
    ctx.stage.attachToLayers(ctx.layers);
    ctx.onResize();
    ctx.cheats?.mount();
    return ctx;
  }
}
