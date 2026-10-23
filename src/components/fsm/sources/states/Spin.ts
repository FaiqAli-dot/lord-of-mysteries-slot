import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';
import { setWinText, spinActive, setSpinEnabled } from '../../../../ui/pluginBridge';

export class Spin extends State {
  readonly name = 'Spin';

  async onCheck(ctx: GameContext): Promise<boolean> {
    if (ctx.isBusy() || ctx.session.status !== 'ready') return false;
    const s = ctx.session.state;
    if (!s) return false;
    // Choice / summary use Bonus sequence (modals)
    if (s.phase === 'BONUS_SELECT' || s.phase === 'BONUS_SUMMARY') return false;
    // Tarot Gathering / Crimson / Miracles — reel spins
    if (s.phase === 'BONUS_ACTIVE' && s.bonus) return true;
    return ctx.session.canSpin();
  }

  async onEnter(ctx: GameContext): Promise<unknown> {
    ctx.setBusy(true);
    ctx.clearSkip();
    setWinText(0);
    spinActive(true);
    setSpinEnabled(false);
    ctx.audio.spin();
    return ctx;
  }

  async onExit(ctx: GameContext): Promise<unknown> {
    spinActive(false);
    return ctx;
  }
}
