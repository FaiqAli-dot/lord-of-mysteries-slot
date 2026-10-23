import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class BonusSummary extends State {
  readonly name = 'BonusSummary';

  async onCheck(ctx: GameContext): Promise<boolean> {
    return ctx.session.state?.phase === 'BONUS_SUMMARY';
  }

  async onProgress(ctx: GameContext): Promise<unknown> {
    await ctx.overlay.showBonusSummary();
    return ctx;
  }
}
