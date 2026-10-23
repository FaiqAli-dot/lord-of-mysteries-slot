import { GAME_CONFIG, type SymbolId } from '../../../../config/gameConfig';
import { State } from '../State';
import type { GameContext } from '../../../game/sources/GameContext';

/** After reels land: morph Spirituality changes, then win/special pulses. */
export class FeatureReveal extends State {
  readonly name = 'FeatureReveal';

  async onCheck(_ctx: GameContext): Promise<boolean> {
    return true;
  }

  async onProgress(ctx: GameContext): Promise<unknown> {
    const s = ctx.session.state;
    if (!s) return ctx;

    const tarotLabel =
      s.bonus?.mode === 'TAROT_CLUB'
        ? s.bonus.tarotHistory[s.bonus.tarotHistory.length - 1]?.label
        : null;

    // Morph natural board → post-feature board (Grafting: one wild → neighbors)
    if (s.lastFeature && s.lastPreFeatureGrid) {
      await ctx.stage.playFeatureMorph({
        from: s.lastPreFeatureGrid as SymbolId[][],
        to: s.grid as SymbolId[][],
        feature: s.lastFeature,
      });
    }

    await ctx.stage.playFeaturePresentation({
      grid: s.grid as SymbolId[][],
      feature: s.lastFeature,
      concealed: s.concealedPositions,
      graftedReel: s.graftedReel,
      sequenceMultiplier: s.sequenceMultiplier,
      tarotLabel: tarotLabel ?? null,
      spiritualityJustArmed:
        !s.lastFeature &&
        s.spiritualityCharge >= GAME_CONFIG.spirituality.threshold,
      lineWins: s.lastLineWins,
      scatterWin: s.lastScatterWin,
    });

    if ((s.lastPayout ?? 0) > 0) ctx.audio.win((s.lastPayout ?? 0) < s.bet * 10);
    if (s.lastFeature || tarotLabel) ctx.audio.bonus();
    return ctx;
  }
}
