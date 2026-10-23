import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class SpinStart extends State {
  readonly name = 'SpinStart';

  async onProgress(ctx: GameContext): Promise<unknown> {
    const s = ctx.session.state;
    if (s?.phase === 'BONUS_ACTIVE' && s.bonus) {
      await ctx.session.bonusSpin();
    } else {
      await ctx.session.spin();
    }
    return ctx;
  }
}
