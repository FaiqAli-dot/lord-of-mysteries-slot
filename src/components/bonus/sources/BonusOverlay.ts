import { GAME_CONFIG, type BonusModeId } from '../../../config/gameConfig';
import type { GameSession } from '../../../api/session';

type ModalId = 'none' | 'bonusSelect' | 'bonusSummary' | 'tarot';

/**
 * DOM bonus overlays (choice / Tarot / summary) — mounts under #game-overlay.
 * Separated from GameApp so FSM Bonus* states can await player input.
 */
export class BonusOverlay {
  private modal: ModalId = 'none';
  private statusMessage = '';
  private resolveWait: (() => void) | null = null;

  constructor(
    private el: HTMLElement,
    private getSession: () => GameSession,
    private onStateChange: () => void,
  ) {}

  setStatus(msg: string): void {
    this.statusMessage = msg;
    if (this.modal === 'none') this.render();
  }

  hide(): void {
    this.modal = 'none';
    this.render();
  }

  /** Blocks until player picks a bonus mode. */
  showBonusSelect(): Promise<void> {
    this.modal = 'bonusSelect';
    this.render();
    return this.waitClose();
  }

  /** Blocks until player acknowledges summary. */
  showBonusSummary(): Promise<void> {
    this.modal = 'bonusSummary';
    this.render();
    return this.waitClose();
  }

  /** @deprecated Tarot Club is gathering free spins on the reels now. */
  showTarot(): Promise<void> {
    this.modal = 'none';
    this.render();
    return Promise.resolve();
  }

  private waitClose(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveWait = resolve;
    });
  }

  private finishWait(): void {
    const r = this.resolveWait;
    this.resolveWait = null;
    r?.();
  }

  render(): void {
    const session = this.getSession();
    const s = session.state;
    if (session.status !== 'ready' || !s) {
      this.el.innerHTML = `<div class="boot-panel"><p>${this.statusMessage || 'Connecting…'}</p></div>`;
      this.el.style.pointerEvents = 'auto';
      return;
    }

    if (this.modal === 'bonusSelect') {
      const choices =
        s.pendingBonusChoices && s.pendingBonusChoices.length > 0
          ? s.pendingBonusChoices
          : (['TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[]);
      this.el.style.pointerEvents = 'auto';
      this.el.innerHTML = `<div class="overlay-panel" role="dialog">
        <h2>Choose Your Path</h2>
        <p>Select a bonus. Fool's Miracles (5+ scatters) is not listed here.</p>
        <div class="choices">
          ${choices
            .map((m) => {
              const name =
                m === 'TAROT_CLUB'
                  ? GAME_CONFIG.bonuses.tarotClub.name
                  : GAME_CONFIG.bonuses.crimsonMoon.name;
              return `<button type="button" class="choice-btn" data-bonus="${m}">${name}</button>`;
            })
            .join('')}
        </div>
      </div>`;
      this.el.querySelectorAll('[data-bonus]').forEach((node) => {
        node.addEventListener('click', () => {
          void this.selectBonus((node as HTMLElement).dataset.bonus as BonusModeId);
        });
      });
      return;
    }

    if (this.modal === 'bonusSummary') {
      this.el.style.pointerEvents = 'auto';
      const b = s.bonus;
      this.el.innerHTML = `<div class="overlay-panel" role="dialog">
        <h2>Path Complete</h2>
        <p>${b ? b.mode.replace(/_/g, ' ') : 'Bonus'} closed.</p>
        <p>Total: <strong>${(b?.totalWon ?? 0).toLocaleString()}</strong></p>
        <button type="button" class="choice-btn" data-ack>Continue</button>
      </div>`;
      this.el.querySelector('[data-ack]')?.addEventListener('click', () => {
        void session.acknowledgeBonusSummary().then(() => {
          this.modal = 'none';
          this.onStateChange();
          this.render();
          this.finishWait();
        });
      });
      return;
    }

    // Tarot Club Gathering runs on the reels — show a light status chip only.
    if (s.phase === 'BONUS_ACTIVE' && s.bonus?.mode === 'TAROT_CLUB') {
      const b = s.bonus;
      const last = b.tarotHistory[b.tarotHistory.length - 1];
      this.el.style.pointerEvents = 'none';
      this.el.innerHTML = `<p class="status-chip tarot-chip">${GAME_CONFIG.bonuses.tarotClub.name}: ${b.spinsRemaining} left${last ? ` · ${last.label}` : ''} · ×${b.tarotRunningMultiplier}</p>`;
      return;
    }

    if (s.phase === 'BONUS_ACTIVE' && s.bonus) {
      const b = s.bonus;
      const name =
        b.mode === 'CRIMSON_MOON'
          ? GAME_CONFIG.bonuses.crimsonMoon.name
          : GAME_CONFIG.bonuses.foolsMiracles.name;
      this.el.style.pointerEvents = 'none';
      this.el.innerHTML = `<p class="status-chip">${name}: ${b.spinsRemaining} spins · ×${b.mode === 'CRIMSON_MOON' ? b.moonMultiplier : b.miracleMultiplier}</p>`;
      return;
    }

    // Idle: keep overlay empty so meters / reels stay readable.
    this.el.innerHTML = '';
    this.el.style.pointerEvents = 'none';
  }

  private async selectBonus(mode: BonusModeId): Promise<void> {
    try {
      await this.getSession().selectBonus(mode);
      this.modal = 'none';
      this.onStateChange();
      this.render();
      this.finishWait();
    } catch (e) {
      this.setStatus(e instanceof Error ? e.message : String(e));
    }
  }
}
