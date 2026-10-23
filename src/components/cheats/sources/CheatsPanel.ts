import type { SpiritualityEffectId, BonusModeId } from '../../../config/gameConfig';
import { GAME_CONFIG } from '../../../config/gameConfig';
import type { GameState, Grid } from '../../../engine/types';
import { potionsForMultiplier } from '../../../engine/sequence';

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
  debugForceCreepingHunger?(): void | Promise<void>;
  debugForceBonusMode?(mode: BonusModeId): void | Promise<void>;
  debugSeedHistoricalVoid?(): void | Promise<void>;
  debugSetSequenceMultiplier?(mult: number): void | Promise<void>;
}

const EFFECTS: { id: SpiritualityEffectId; label: string }[] = [
  { id: 'GRAFTING', label: 'Grafting' },
  { id: 'BLIND_STUPIDITY', label: 'Blind Stupidity' },
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
          <h4>Base mechanics</h4>
          <button type="button" data-act="fools-mirror">Fool's Mirror (Reel 3)</button>
          <button type="button" data-act="creeping-hunger">Creeping Hunger (Glove+Monster)</button>
        </section>
        <section>
          <h4>Bonuses</h4>
          <button type="button" data-act="scatter-3">3 Tarot → Choice (A/B)</button>
          <button type="button" data-act="mode-a">Mode A: Tarot Club 10FS</button>
          <button type="button" data-act="mode-b">Mode B: Crimson Moon 8FS Avalanche</button>
          <button type="button" data-act="scatter-5">5 Tarot → Fool's Miracles</button>
          <button type="button" data-act="seed-void">Seed Historical Void</button>
        </section>
        <section>
          <h4>Sequence (permanent)</h4>
          <button type="button" data-act="seq-2">Sequence ×2 (Magician)</button>
          <button type="button" data-act="seq-5">Sequence ×5 (Bizarro Sorcerer)</button>
          <button type="button" data-act="seq-15">Sequence ×15 (LotM)</button>
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
    if (s?.forceCreepingHunger) bits.push('Creeping Hunger armed');
    if (s?.forceFoolsMirror) bits.push("Fool's Mirror armed");
    if (s?.forceBonusMode) bits.push(`Bonus: ${s.forceBonusMode}`);
    this.pendingLabel = bits.length
      ? `Armed: ${bits.join(' · ')}`
      : 'Nothing armed — pick a cheat, then spin.';
    const el = this.root?.querySelector('.cheats-pending');
    if (el) el.textContent = this.pendingLabel;
  }

  private async setSequenceMult(mult: number): Promise<void> {
    if (this.session.debugSetSequenceMultiplier) {
      await this.session.debugSetSequenceMultiplier(mult);
      return;
    }
    // Fallback: pass multiplier; SlotGame.debugSetSequenceWins detects tier mults.
    // Also compute potions so older servers still land on the right tier.
    await this.session.debugSetSequenceWins(potionsForMultiplier(mult));
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
      case 'scatter-5':
        if (this.session.debugForceBonusMode) {
          await this.session.debugForceBonusMode('FOOLS_MIRACLES');
        } else {
          await this.session.debugForceScatters(5);
        }
        break;
      case 'mode-a':
        if (this.session.debugForceBonusMode) {
          await this.session.debugForceBonusMode('TAROT_CLUB');
        } else {
          await this.session.debugForceScatters(3);
        }
        break;
      case 'mode-b':
        if (this.session.debugForceBonusMode) {
          await this.session.debugForceBonusMode('CRIMSON_MOON');
        } else {
          await this.session.debugForceScatters(4);
        }
        break;
      case 'fools-mirror':
        await this.session.debugForceWildExpand();
        break;
      case 'creeping-hunger':
        if (this.session.debugForceCreepingHunger) {
          await this.session.debugForceCreepingHunger();
        }
        break;
      case 'seed-void':
        if (this.session.debugSeedHistoricalVoid) {
          await this.session.debugSeedHistoricalVoid();
        }
        break;
      case 'seq-2':
        await this.setSequenceMult(2);
        break;
      case 'seq-5':
        await this.setSequenceMult(5);
        break;
      case 'seq-15':
        await this.setSequenceMult(15);
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
