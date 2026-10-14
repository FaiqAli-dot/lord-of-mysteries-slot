import { GAME_CONFIG, SYMBOLS, PAYLINES, SCATTER_PAYS, type BonusModeId, type SymbolId } from '../config/gameConfig';
import { buildSymbolArt, ART_LICENSE_NOTES } from '../art/symbols';
import { SoftAudio } from './audio';
import { sequenceProgress } from '../engine/sequence';
import { getStoredApiBase, getBuildTimeApiBase } from '../api/apiConfig';
import { createSession, switchSessionApi, isRemote, type GameSession } from '../api/session';
import type { GameState } from '../engine/types';

type ModalId = 'none' | 'paytable' | 'help' | 'settings' | 'bonusSelect' | 'bonusSummary';

export class GameApp {
  private root: HTMLElement;
  private session: GameSession;
  private unsub: (() => void) | null = null;
  private art: Record<SymbolId, string>;
  private audio = new SoftAudio();
  private modal: ModalId = 'none';
  private helpTab: 'rules' | 'features' | 'bonuses' | 'licenses' = 'rules';
  private busy = false;
  private winDisplay = 0;
  private statusMessage = '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.session = createSession();
    this.art = buildSymbolArt();
    this.wireSession();

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.session.setReducedMotion(mq.matches);
    mq.addEventListener('change', (e) => this.session.setReducedMotion(e.matches));

    this.bindKeys();
    this.render();
    void this.bootstrap();
  }

  /** Exposed for QA / screenshots (local or remote). */
  get remote(): GameSession {
    return this.session;
  }

  private wireSession(): void {
    this.unsub?.();
    this.unsub = this.session.subscribe(() => {
      if (this.session.state?.muted !== undefined) {
        this.audio.setMuted(this.session.state.muted);
      }
      this.render();
    });
  }

  private async bootstrap(): Promise<void> {
    if (!isRemote(this.session)) {
      await this.session.connect();
      this.statusMessage = 'Client-side demo (no API) — works on GitHub Pages alone';
      this.audio.setMuted(this.session.state?.muted ?? false);
      this.render();
      return;
    }
    this.statusMessage = 'Connecting to server…';
    this.render();
    await this.session.connect();
    if (this.session.status === 'ready') {
      this.statusMessage = `Connected · ${this.session.api.base}`;
      this.audio.setMuted(this.session.state?.muted ?? false);
    } else {
      this.statusMessage = this.session.error ?? 'Connection failed — clear API URL for client-side play';
      this.modal = 'settings';
    }
    this.render();
  }

  private state(): GameState | null {
    return this.session.state;
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (this.busy || this.session.status !== 'ready' || !this.state()) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        void this.onSpin();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        void this.session.adjustBet(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        void this.session.adjustBet(-1);
      } else if (e.key === 'Escape') {
        this.modal = 'none';
        this.render();
      }
    });
  }

  private async onSpin(): Promise<void> {
    if (this.busy || this.session.status !== 'ready') return;
    const s = this.state();
    if (!s) return;

    if (s.phase === 'BONUS_SUMMARY') {
      this.modal = 'bonusSummary';
      this.render();
      return;
    }

    if (s.phase === 'BONUS_SELECT') {
      this.modal = 'bonusSelect';
      this.render();
      return;
    }

    if (s.phase === 'BONUS_ACTIVE' && s.bonus) {
      if (s.bonus.mode === 'TAROT_CLUB') return;
      this.busy = true;
      this.audio.spin();
      this.render();
      await this.wait(s.reducedMotion ? 120 : GAME_CONFIG.animation.spinMs);
      try {
        await this.session.bonusSpin();
        this.afterResult();
      } catch (e) {
        this.statusMessage = e instanceof Error ? e.message : String(e);
      }
      this.busy = false;
      if (this.state()?.phase === 'BONUS_SUMMARY') this.modal = 'bonusSummary';
      this.render();
      return;
    }

    if (!this.session.canSpin()) return;
    this.busy = true;
    this.audio.spin();
    this.winDisplay = 0;
    this.render();
    await this.wait(s.reducedMotion ? 120 : GAME_CONFIG.animation.spinMs);
    try {
      await this.session.spin();
      this.afterResult();
      const phase = this.state()?.phase;
      if (phase === 'BONUS_SELECT') {
        this.modal = 'bonusSelect';
        this.audio.bonus();
      } else if (phase === 'BONUS_ACTIVE') {
        this.audio.bonus();
      }
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
    this.render();
  }

  private afterResult(): void {
    const payout = this.state()?.lastPayout ?? 0;
    this.winDisplay = payout;
    const bet = this.state()?.bet ?? GAME_CONFIG.defaultBet;
    if (payout > 0) {
      this.audio.win(payout < bet * GAME_CONFIG.animation.countUpThreshold);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async onTarotPick(_index: number): Promise<void> {
    if (this.busy || this.session.status !== 'ready') return;
    this.audio.click();
    this.busy = true;
    try {
      await this.session.tarotPick();
      this.afterResult();
      if (this.state()?.phase === 'BONUS_SUMMARY') this.modal = 'bonusSummary';
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
    this.render();
  }

  private async selectBonus(mode: BonusModeId): Promise<void> {
    this.audio.bonus();
    try {
      await this.session.selectBonus(mode);
      this.modal = 'none';
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.render();
  }

  render(): void {
    const s = this.state();
    const ready = this.session.status === 'ready' && !!s;

    if (!ready) {
      this.root.innerHTML = `
        <div class="demo-banner">${GAME_CONFIG.demoLabel}</div>
        <div class="game-shell">
          <header class="brand-header">
            <h1>${GAME_CONFIG.title}</h1>
            <p>${GAME_CONFIG.subtitle}</p>
          </header>
          <div class="panel" style="margin:1rem auto;width:min(520px,100%)">
            <h2>Server connection</h2>
            <p>${this.statusMessage || this.session.error || 'Waiting…'}</p>
            <p style="color:var(--fog-dim);font-size:0.95rem">API: ${this.session.api.base || '(not set)'}</p>
            <div class="modal-actions">
              <button class="btn" type="button" data-action="settings">Settings</button>
              <button class="btn spin" type="button" data-action="reconnect">Reconnect</button>
            </div>
          </div>
        </div>
        ${this.modal === 'settings' ? this.modalSettings() : ''}
      `;
      this.bindUi();
      return;
    }

    const seq = sequenceProgress(s.sequenceWins);
    const spiritPct = Math.min(100, (s.spiritualityCharge / GAME_CONFIG.spirituality.threshold) * 100);
    const bonusClass =
      s.bonus?.mode === 'CRIMSON_MOON'
        ? 'crimson'
        : s.bonus?.mode === 'FOOLS_MIRACLES'
          ? 'miracles'
          : s.bonus?.mode === 'TAROT_CLUB'
            ? 'tarot'
            : '';

    const winning = new Set(
      s.lastLineWins.flatMap((w) => w.positions.map((p) => `${p.reel}-${p.row}`)),
    );
    if (s.lastScatterWin) {
      for (const p of s.lastScatterWin.positions) winning.add(`${p.reel}-${p.row}`);
    }
    const concealed = new Set(
      (s.concealedPositions ?? []).map((p) => `${p.reel}-${p.row}`),
    );

    const featureText = s.lastFeature
      ? `Spirituality: ${s.lastFeature.effect.replace(/_/g, ' ')}`
      : s.bonus
        ? `Bonus: ${s.bonus.mode.replace(/_/g, ' ')}`
        : s.phase === 'SPINNING'
          ? 'Sealing fate…'
          : this.statusMessage;

    this.root.innerHTML = `
      <div class="fog-particles" aria-hidden="true">
        <span style="left:10%;animation-delay:0s"></span>
        <span style="left:40%;animation-delay:6s"></span>
        <span style="left:70%;animation-delay:12s"></span>
      </div>
      <div class="demo-banner">${GAME_CONFIG.demoLabel} · ${isRemote(this.session) ? 'server-authoritative' : 'client-side'}</div>
      <div class="game-shell bonus-stage ${bonusClass}">
        <header class="brand-header">
          <h1>${GAME_CONFIG.title}</h1>
          <p>${GAME_CONFIG.subtitle}</p>
        </header>

        <div class="hud-top">
          <div class="hud-stat">
            <span class="label">Balance (demo)</span>
            <span class="value">${s.balance.toLocaleString()}</span>
          </div>
          <div class="hud-stat">
            <span class="label">Bet</span>
            <span class="value">${s.bet.toLocaleString()}</span>
          </div>
          <div class="hud-stat">
            <span class="label">Win</span>
            <span class="value win">${this.winDisplay.toLocaleString()}</span>
          </div>
          <div class="hud-stat">
            <span class="label">Lines</span>
            <span class="value">${GAME_CONFIG.paylineCount}</span>
          </div>
        </div>

        <div class="meters">
          <div class="meter">
            <div class="meter-title">
              <span>Sequence</span>
              <span>×${seq.multiplier}${seq.nextMultiplier ? ` → ×${seq.nextMultiplier}` : ' (max)'}</span>
            </div>
            <div class="meter-bar"><div class="meter-fill" style="width:${(seq.progress * 100).toFixed(1)}%"></div></div>
          </div>
          <div class="meter">
            <div class="meter-title">
              <span>Spirituality</span>
              <span>${s.spiritualityCharge}/${GAME_CONFIG.spirituality.threshold}</span>
            </div>
            <div class="meter-bar"><div class="meter-fill spirit" style="width:${spiritPct.toFixed(1)}%"></div></div>
          </div>
        </div>

        <div class="feature-indicator">${featureText}</div>

        <div class="reel-stage">
          <div class="moon-orb" aria-hidden="true"></div>
          ${
            s.bonus?.mode === 'TAROT_CLUB'
              ? this.renderTarot(s)
              : `<div class="reel-frame" role="grid" aria-label="5 by 4 reel grid">
            ${s.grid
              .map(
                (reel, ri) => `<div class="reel" role="rowgroup">
              ${reel
                .map((sym, row) => {
                  const key = `${ri}-${row}`;
                  const classes = [
                    'cell',
                    winning.has(key) ? 'winning' : '',
                    sym === 'WILD' ? 'wild-glow' : '',
                    s.graftedReel === ri ? 'grafted' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return `<div class="${classes}" role="gridcell" data-reel="${ri}" data-row="${row}">
                    <img src="${this.art[sym]}" alt="${SYMBOLS[sym].name}" />
                    ${concealed.has(key) ? `<div class="veil">?</div>` : ''}
                  </div>`;
                })
                .join('')}
            </div>`,
              )
              .join('')}
          </div>`
          }
        </div>

        <div class="controls">
          <button class="btn" type="button" data-action="paytable">Paytable</button>
          <button class="btn" type="button" data-action="help">Help</button>
          <button class="btn" type="button" data-action="settings">Settings</button>
          <div class="bet-group">
            <button class="btn" type="button" data-action="bet-down" ${s.phase !== 'IDLE' || this.busy ? 'disabled' : ''} aria-label="Decrease bet">−</button>
            <span class="bet-value">${s.bet}</span>
            <button class="btn" type="button" data-action="bet-up" ${s.phase !== 'IDLE' || this.busy ? 'disabled' : ''} aria-label="Increase bet">+</button>
          </div>
          ${this.renderPrimaryButton(s)}
        </div>
      </div>
      ${this.renderModal(s)}
    `;

    this.bindUi();
  }

  private renderPrimaryButton(s: GameState): string {
    if (s.phase === 'BONUS_ACTIVE' && s.bonus?.mode === 'TAROT_CLUB') {
      return `<button class="btn spin" type="button" disabled>Select a card</button>`;
    }
    if (s.phase === 'BONUS_ACTIVE') {
      const left = s.bonus?.spinsRemaining ?? 0;
      return `<button class="btn spin" type="button" data-action="spin" ${this.busy ? 'disabled' : ''}>Bonus Spin (${left})</button>`;
    }
    if (s.phase === 'BONUS_SUMMARY') {
      return `<button class="btn spin" type="button" data-action="ack-bonus">Continue</button>`;
    }
    if (s.phase === 'BONUS_SELECT') {
      return `<button class="btn spin" type="button" data-action="open-bonus">Choose Path</button>`;
    }
    const disabled = this.busy || !this.session.canSpin();
    return `<button class="btn spin" type="button" data-action="spin" ${disabled ? 'disabled' : ''}>Spin</button>`;
  }

  private renderTarot(s: GameState): string {
    const b = s.bonus!;
    const cards = Array.from({ length: Math.max(b.tarotPicksRemaining, 1) }, (_, i) => i);
    return `<div class="tarot-area">
      <h2 style="font-family:var(--font-display);color:var(--gold-soft);margin:0 0 0.5rem">${GAME_CONFIG.bonuses.tarotClub.name}</h2>
      <p style="color:var(--fog);margin:0">Picks remaining: ${b.tarotPicksRemaining} · Session multiplier ×${b.tarotRunningMultiplier}</p>
      <div class="tarot-cards">
        ${cards
          .map(
            (i) =>
              `<button class="tarot-card" type="button" data-tarot="${i}" ${b.tarotPicksRemaining <= 0 || this.busy ? 'disabled' : ''}>DRAW</button>`,
          )
          .join('')}
      </div>
      <div class="tarot-history">
        <strong style="color:var(--bronze)">Reward history</strong>
        <ul>${b.tarotHistory.map((r) => `<li>${r.label}</li>`).join('') || '<li>No picks yet</li>'}</ul>
        <p>Total won: ${b.totalWon.toLocaleString()} credits</p>
      </div>
    </div>`;
  }

  private renderModal(s: GameState): string {
    if (this.modal === 'none') return '';
    if (this.modal === 'bonusSelect') return this.modalBonusSelect(s);
    if (this.modal === 'bonusSummary') return this.modalBonusSummary(s);
    if (this.modal === 'paytable') return this.modalPaytable();
    if (this.modal === 'help') return this.modalHelp();
    if (this.modal === 'settings') return this.modalSettings();
    return '';
  }

  private modalBonusSelect(s: GameState): string {
    const choices = s.pendingBonusChoices ?? [];
    return `<div class="overlay" role="dialog" aria-modal="true">
      <div class="panel">
        <h2>Choose Your Path</h2>
        <p>Pathway Gates open. Select one bonus mode. Fool's Miracles requires 5+ scatters and is not listed here.</p>
        <div class="choices">
          ${choices
            .map((m) => {
              const name =
                m === 'TAROT_CLUB'
                  ? GAME_CONFIG.bonuses.tarotClub.name
                  : GAME_CONFIG.bonuses.crimsonMoon.name;
              const desc =
                m === 'TAROT_CLUB'
                  ? 'Interactive tarot picks with credits, multipliers, and wild enhancement.'
                  : 'Free spins under a crimson moon with sticky wild cells and rising moon multiplier.';
              return `<button class="btn" type="button" data-bonus="${m}" style="text-align:left">
                <strong style="display:block;color:var(--gold-soft)">${name}</strong>
                <span style="display:block;font-family:var(--font-body);text-transform:none;letter-spacing:0;font-size:1rem;color:var(--fog)">${desc}</span>
              </button>`;
            })
            .join('')}
        </div>
      </div>
    </div>`;
  }

  private modalBonusSummary(s: GameState): string {
    const b = s.bonus;
    return `<div class="overlay" role="dialog" aria-modal="true">
      <div class="panel">
        <h2>Path Complete</h2>
        <p>${b ? b.mode.replace(/_/g, ' ') : 'Bonus'} has closed.</p>
        <p>Total bonus credits: <strong style="color:var(--gold-soft)">${(b?.totalWon ?? 0).toLocaleString()}</strong></p>
        <p>Retriggers used: ${b?.retriggers ?? 0} / ${GAME_CONFIG.bonuses.retriggerCap}</p>
        <p>Sequence has been reset upon leaving the bonus.</p>
        <div class="modal-actions">
          <button class="btn spin" type="button" data-action="ack-bonus">Return to Base</button>
        </div>
      </div>
    </div>`;
  }

  private modalPaytable(): string {
    const lineBetNote = `Pays shown as multiples of line bet (total bet ÷ ${GAME_CONFIG.paylineCount}), scaled by payScale ${GAME_CONFIG.payScale}.`;
    const rows = (Object.keys(SYMBOLS) as SymbolId[])
      .filter((id) => SYMBOLS[id].tier === 'high' || SYMBOLS[id].tier === 'low')
      .map((id) => {
        const def = SYMBOLS[id];
        return `<div class="paytable-row">
          <img src="${this.art[id]}" alt=""/>
          <div><strong>${def.name}</strong><br/><span style="color:var(--fog-dim)">${def.tier}</span></div>
          <div style="font-family:var(--font-display);font-size:0.85rem">3×${def.pays[0]} · 4×${def.pays[1]} · 5×${def.pays[2]}</div>
        </div>`;
      })
      .join('');
    return `<div class="overlay"><div class="panel">
      <h2>Paytable</h2>
      <p>${lineBetNote}</p>
      <div class="paytable-grid">${rows}</div>
      <p style="margin-top:1rem"><strong>Scatter (Pathway Gate)</strong> — pays × total bet: 3→${SCATTER_PAYS[3]}, 4→${SCATTER_PAYS[4]}, 5+→${SCATTER_PAYS[5]}. Wild never substitutes for Scatter.</p>
      <p><strong>Fool's Mirror (Wild)</strong> — substitutes for paying symbols; may expand a reel; 2× applies once per line that uses the expanded wild.</p>
      <p>${PAYLINES.length} fixed left-to-right paylines. All eligible line wins are awarded.</p>
      <div class="modal-actions"><button class="btn" type="button" data-action="close">Close</button></div>
    </div></div>`;
  }

  private modalHelp(): string {
    const tabs = ['rules', 'features', 'bonuses', 'licenses'] as const;
    const body = {
      rules: `<p>5 reels × 4 rows, ${PAYLINES.length} fixed paylines, left-to-right. Manual spin only — no autoplay.</p>
        <p>Default play is <strong>fully client-side</strong> (works on GitHub Pages alone). Optional remote API makes spins/balance server-authoritative when an API URL is set.</p>
        <p>3–4 Scatters: choose Tarot Club or Crimson Moon. 5+ Scatters: Fool's Miracles (priority). Integer demo credits only.</p>`,
      features: `<p><strong>Sequence</strong> — gradual multiplier (max ${GAME_CONFIG.sequence.maxMultiplier}×) advancing on winning spins; applied before advancing; resets after every bonus.</p>
        <p><strong>Spirituality</strong> — charge to ${GAME_CONFIG.spirituality.threshold} from winning spins and Spirit Embers, then one effect: Grafting, Blind Stupidity, Creeping Hunger, Glove, or Locked Wild. Meter resets to 0 (no overflow).</p>
        <p><strong>Crimson Moon</strong> sticky wilds are single cells (not full reels) and do not trigger Fool's Mirror expansion.</p>
        <p><strong>Grafting</strong> — one reel → one paying symbol for one spin (never creates Scatters).</p>
        <p><strong>Blind Stupidity</strong> — veils 3 positions; outcomes already fixed.</p>
        <p><strong>Creeping Hunger</strong> — one respin preserving highs/wilds.</p>
        <p><strong>Glove</strong> — one symbol → Wild (not Scatter).</p>
        <p><strong>Locked Wild</strong> — lasts ${GAME_CONFIG.spirituality.lockedWild.durationSpins} applicable spins.</p>`,
      bonuses: `<p><strong>Tarot Club Gathering</strong> — ${GAME_CONFIG.bonuses.tarotClub.selections} picks; credits, multipliers, wild enhance, extra picks (capped).</p>
        <p><strong>Crimson Moon Rampage</strong> — ${GAME_CONFIG.bonuses.crimsonMoon.spins} free spins, sticky wild cells, moon multiplier up to ×${GAME_CONFIG.bonuses.crimsonMoon.moonMultCap}.</p>
        <p><strong>Fool's Miracles</strong> — ${GAME_CONFIG.bonuses.foolsMiracles.spins} enhanced spins (5+ scatters only), forced wild expansion, miracle multiplier.</p>
        <p>Retrigger cap: ${GAME_CONFIG.bonuses.retriggerCap}. No simultaneous bonuses. Always returns to base game.</p>`,
      licenses: `<pre style="white-space:pre-wrap;font-size:0.9rem;color:var(--fog)">${ART_LICENSE_NOTES}</pre>`,
    }[this.helpTab];

    return `<div class="overlay"><div class="panel">
      <h2>Help</h2>
      <div class="help-tabs">
        ${tabs.map((t) => `<button class="btn" type="button" data-helptab="${t}" ${this.helpTab === t ? 'style="border-color:var(--gold)"' : ''}>${t}</button>`).join('')}
      </div>
      ${body}
      <div class="modal-actions"><button class="btn" type="button" data-action="close">Close</button></div>
    </div></div>`;
  }

  private modalSettings(): string {
    const s = this.state();
    const apiValue = this.session.api.base || getStoredApiBase() || getBuildTimeApiBase();
    const mode = isRemote(this.session) ? 'Remote API' : 'Client-side (Pages-ready)';
    return `<div class="overlay"><div class="panel">
      <h2>Settings</h2>
      <p>${GAME_CONFIG.demoLabel}</p>
      <p style="color:var(--gold);font-size:0.9rem">Mode: ${mode}</p>
      <label style="display:block;margin:0.75rem 0;font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--bronze)">
        API base URL (optional)
        <input data-setting="api" type="url" value="${apiValue.replace(/"/g, '&quot;')}" placeholder="Leave empty for client-side play"
          style="display:block;width:100%;margin-top:0.35rem;padding:0.5rem;background:var(--ink);border:1px solid var(--bronze);color:var(--cream);font-family:var(--font-body);font-size:1rem"/>
      </label>
      <p style="font-size:0.85rem;color:var(--fog-dim)">Empty = fully client-side (GitHub Pages works alone). Or set <code>?api=https://…</code> / build-time <code>VITE_API_BASE</code> for a remote server.</p>
      <label style="display:flex;align-items:center;gap:0.5rem;margin:0.75rem 0">
        <input type="checkbox" data-setting="mute" ${s?.muted ? 'checked' : ''}/> Mute sound
      </label>
      <p style="font-size:0.9rem;color:var(--fog-dim)">Session: ${this.session.sessionId ?? '—'} · Spins: ${s?.spinCount ?? 0}</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-action="save-api">Save API & reconnect</button>
        <button class="btn" type="button" data-action="reset">Reset demo balance</button>
        <button class="btn" type="button" data-action="close">Close</button>
      </div>
    </div></div>`;
  }

  private bindUi(): void {
    this.root.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = (el as HTMLElement).dataset.action;
        void (async () => {
          switch (action) {
            case 'spin':
              await this.onSpin();
              break;
            case 'bet-up':
              await this.session.adjustBet(1);
              break;
            case 'bet-down':
              await this.session.adjustBet(-1);
              break;
            case 'paytable':
              this.modal = 'paytable';
              this.render();
              break;
            case 'help':
              this.modal = 'help';
              this.render();
              break;
            case 'settings':
              this.modal = 'settings';
              this.render();
              break;
            case 'close':
              this.modal = 'none';
              this.render();
              break;
            case 'reset':
              if (this.session.status === 'ready') await this.session.resetDemo();
              this.modal = 'none';
              this.render();
              break;
            case 'ack-bonus':
              await this.session.acknowledgeBonusSummary();
              this.modal = 'none';
              this.render();
              break;
            case 'open-bonus':
              this.modal = 'bonusSelect';
              this.render();
              break;
            case 'reconnect':
              await this.bootstrap();
              break;
            case 'save-api': {
              const input = this.root.querySelector('[data-setting="api"]') as HTMLInputElement | null;
              const url = input?.value?.trim() ?? '';
              this.session = switchSessionApi(this.session, url);
              this.wireSession();
              this.modal = 'none';
              await this.bootstrap();
              break;
            }
          }
        })();
      });
    });

    this.root.querySelectorAll('[data-bonus]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = (el as HTMLElement).dataset.bonus as BonusModeId;
        void this.selectBonus(mode);
      });
    });

    this.root.querySelectorAll('[data-tarot]').forEach((el) => {
      el.addEventListener('click', () => {
        const i = Number((el as HTMLElement).dataset.tarot);
        void this.onTarotPick(i);
      });
    });

    this.root.querySelectorAll('[data-helptab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.helpTab = (el as HTMLElement).dataset.helptab as typeof this.helpTab;
        this.render();
      });
    });

    const mute = this.root.querySelector('[data-setting="mute"]') as HTMLInputElement | null;
    mute?.addEventListener('change', () => {
      void this.session.setMuted(mute.checked).then(() => this.audio.setMuted(mute.checked));
    });
  }
}
