import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';
import { setAutoplayActive } from '../../../../ui/pluginBridge';

export class BonusSelect extends State {
  readonly name = 'BonusSelect';

  async onCheck(ctx: GameContext): Promise<boolean> {
    return ctx.session.state?.phase === 'BONUS_SELECT';
  }

  async onProgress(ctx: GameContext): Promise<unknown> {
    ctx.setAutoLeft(0);
    setAutoplayActive(false);
    await ctx.overlay.showBonusSelect();
    return ctx;
  }
}
