import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

/** Parent: runs BonusSelect / BonusActive / BonusSummary children (each may skip). */
export class Bonus extends State {
  readonly name = 'Bonus';

  async onCheck(ctx: GameContext): Promise<boolean> {
    const phase = ctx.session.state?.phase;
    return (
      phase === 'BONUS_SELECT' ||
      phase === 'BONUS_ACTIVE' ||
      phase === 'BONUS_SUMMARY'
    );
  }

  async onEnter(ctx: GameContext): Promise<unknown> {
    ctx.audio.bonus();
    const auto = ctx.getAutoLeft();
    if (auto > 0 && ctx.session.state?.phase === 'BONUS_SELECT') {
      ctx.setAutoLeft(0);
    }
    return ctx;
  }
}
