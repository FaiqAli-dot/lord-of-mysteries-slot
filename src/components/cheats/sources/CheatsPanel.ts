import type { SpiritualityEffectId } from '../../../config/gameConfig';
import { GAME_CONFIG } from '../../../config/gameConfig';
import type { GameState, Grid } from '../../../engine/types';

/** Shared cheat surface for LocalSession and RemoteSession. */
export interface CheatSession {
  state: GameState | null;
  subscribe(fn: () => void): () => void;
  debugForceGrid(grid: Grid): void | Promise<void>;
  debugFillSpirituality(): void | Promise<void>;
  debugForceSpiritualityEffect(effect: SpiritualityEffectId): void | Promise<void>;
  debugForceScatters(count: number): void | Promise<void>;
  debugForceWildExpand(): void | Promise<void>;
  debugSetSequenceWins(wins: number): void | Promise<void>;
  debugClearForces(): void | Promise<void>;
}

const EFFECTS: { id: SpiritualityEffectId; label: string }[] = [
  { id: 'GLOVE', label: 'Glove' },
  { id: 'GRAFTING', label: 'Grafting' },
  { id: 'BLIND_STUPIDITY', label: 'Blind Stupidity' },
  { id: 'CREEPING_HUNGER', label: 'Creeping Hunger' },
  { id: 'LOCKED_WILD', label: 'Locked Wild' },
];

/**
 * Dev/demo feature forcer — works for local and remote sessions.
 * Toggle with backtick (`) or the CHEATS button.
 */
export class CheatsPanel {
  private root: HTMLElement | null = null;
  private open = false;
  private pendingLabel = '';

  constructor(
    private host: HTMLElement,
    private session: CheatSession,
    private onArmed: () => void,
  ) {}

  mount(): void {
    if (this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'cheats-root';
    this.root.innerHTML = `
      <button type="button" class="cheats-toggle" title="Toggle cheats (\`)">CHEATS</button>
      <div class="cheats-panel" hidden>
        <header>
          <strong>Feature cheats</strong>
          <span class="cheats-hint">Arm → Spin (real RNG)</span>
        </header>
        <p class="cheats-pending"></p>
        <section>
          <h4>Spirituality</h4>
          <button type="button" data-act="fill-spirit">Fill meter → next spin awakens</button>
          ${EFFECTS.map(
            (e) =>
              `<button type="button" data-effect="${e.id}">Force ${e.label} (this spin)</button>`,
          ).join('')}
        </section>
        <section>
          <h4>Bonuses / wilds</h4>
          <button type="button" data-act="scatter-3">3 Scatters (choice)</button>
          <button type="button" data-act="scatter-4">4 Scatters (choice)</button>
          <button type="button" data-act="scatter-5">5 Scatters (Fool's Miracles)</button>
          <button type="button" data-act="wild-expand">Wild expand</button>
        </section>
        <section>
          <h4>Sequence</h4>
          <button type="button" data-act="seq-2">Sequence ×2</button>
          <button type="button" data-act="seq-5">Sequence ×5</button>
          <button type="button" data-act="seq-15">Sequence ×15</button>
        </section>
        <section>
          <button type="button" data-act="clear" class="cheats-clear">Clear forces</button>
        </section>
      </div>
    `;
    this.host.appendChild(this.root);

    this.root.querySelector('.cheats-toggle')?.addEventListener('click', () => {
      this.setOpen(!this.open);
    });

    this.root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!t || t.classList.contains('cheats-toggle')) return;
      void this.handle(t);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.setOpen(!this.open);
      }
    });

    this.session.subscribe(() => this.syncPending());
    this.syncPending();
  }

  private setOpen(v: boolean): void {
    this.open = v;
    const panel = this.root?.querySelector('.cheats-panel');
    if (panel) panel.toggleAttribute('hidden', !v);
  }

  private syncPending(): void {
    const s = this.session.state;
    const bits: string[] = [];
    if (s?.forceSpiritualityEffect) bits.push(`Spirit: ${s.forceSpiritualityEffect}`);
    else if ((s?.spiritualityCharge ?? 0) >= GAME_CONFIG.spirituality.threshold) {
      bits.push(`Meter full (${s?.spiritualityCharge})`);
    }
    if (s?.forceGrid) bits.push('Forced grid armed');
    this.pendingLabel = bits.length ? `Armed: ${bits.join(' · ')}` : 'Nothing armed — pick a cheat, then spin.';
    const el = this.root?.querySelector('.cheats-pending');
    if (el) el.textContent = this.pendingLabel;
  }

  private async handle(btn: HTMLElement): Promise<void> {
    const effect = btn.dataset.effect as SpiritualityEffectId | undefined;
    if (effect) {
      await this.session.debugForceSpiritualityEffect(effect);
      this.onArmed();
      this.syncPending();
      return;
    }
    switch (btn.dataset.act) {
      case 'fill-spirit':
        await this.session.debugFillSpirituality();
        break;
      case 'scatter-3':
        await this.session.debugForceScatters(3);
        break;
      case 'scatter-4':
        await this.session.debugForceScatters(4);
        break;
      case 'scatter-5':
        await this.session.debugForceScatters(5);
        break;
      case 'wild-expand':
        await this.session.debugForceWildExpand();
        break;
      case 'seq-2':
        await this.session.debugSetSequenceWins(200);
        break;
      case 'seq-5':
        await this.session.debugSetSequenceWins(750);
        break;
      case 'seq-15':
        await this.session.debugSetSequenceWins(2000);
        break;
      case 'clear':
        await this.session.debugClearForces();
        break;
      default:
        return;
    }
    this.onArmed();
    this.syncPending();
  }
}
