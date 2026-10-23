import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';
import { GAME_CONFIG } from '../../../../config/gameConfig';

/**
 * After entering a bonus: show a short on-reel cue.
 * Tarot / Crimson / Miracles then continue via the spin button (gathering spins).
 */
export class BonusActive extends State {
  readonly name = 'BonusActive';

  async onCheck(ctx: GameContext): Promise<boolean> {
    return ctx.session.state?.phase === 'BONUS_ACTIVE';
  }

  async onProgress(ctx: GameContext): Promise<unknown> {
    const bonus = ctx.session.state?.bonus;
    if (!bonus) return ctx;

    const label =
      bonus.mode === 'TAROT_CLUB'
        ? `${GAME_CONFIG.bonuses.tarotClub.name} — ${bonus.spinsRemaining} gathering spins`
        : bonus.mode === 'CRIMSON_MOON'
          ? `${GAME_CONFIG.bonuses.crimsonMoon.name} — ${bonus.spinsRemaining} spins`
          : `${GAME_CONFIG.bonuses.foolsMiracles.name} — ${bonus.spinsRemaining} spins`;

    await ctx.stage.playFeaturePresentation({
      grid: ctx.session.state!.grid as import('../../../../config/gameConfig').SymbolId[][],
      feature: null,
      concealed: null,
      graftedReel: null,
      sequenceMultiplier: ctx.session.state!.sequenceMultiplier,
      tarotLabel: label,
    });
    return ctx;
  }
}
