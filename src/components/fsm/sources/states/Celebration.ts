import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class Celebration extends State {
  readonly name = 'Celebration';

  async onCheck(ctx: GameContext): Promise<boolean> {
    const s = ctx.session.state;
    if (!s) return false;
    const payout = s.lastPayout ?? 0;
    return payout >= s.bet * 15;
  }

  async onProgress(ctx: GameContext): Promise<unknown> {
    const s = ctx.session.state;
    if (s) ctx.stage.showWinCelebration(s.lastPayout);
    return ctx;
  }
}
