import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

export class Idle extends State {
  readonly name = 'Idle';

  async onEnter(ctx: GameContext): Promise<unknown> {
    ctx.setBusy(false);
    ctx.pushStateToPlugin();
    ctx.pushStateToPixi();
    return ctx;
  }
}
