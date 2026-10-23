import type { SymbolId } from '../../../../config/gameConfig';
import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class SpinStop extends State {
  readonly name = 'SpinStop';

  async onProgress(ctx: GameContext): Promise<unknown> {
    const s = ctx.session.state;
    if (!s) return ctx;

    // If Spirituality will morph the board, drop the *natural* reel result first.
    const dropGrid = (s.lastFeature && s.lastPreFeatureGrid
      ? s.lastPreFeatureGrid
      : s.grid) as SymbolId[][];

    await ctx.stage.playDropToGrid(
      dropGrid,
      ctx.stage.dropModeForTurbo(ctx.getTurbo(), ctx.getSkip()),
    );
    ctx.afterResult();
    return ctx;
  }
}
