import { GAME_CONFIG, type BonusModeId } from '../config/gameConfig';
import { SoftAudio } from './audio';
import { createSession, type GameSession } from '../api/session';
import type { GameState } from '../engine/types';
import { CanvasStage } from './canvasStage';
import {
  applyPluginMode,
  bindPluginEvents,
  initPluginHud,
  setAutoplayActive,
  setBalanceText,
  setBetText,
  setSoundToggles,
  setSpinEnabled,
  setSpinningUi,
  setTurboLevel,
  setWinText,
  showPaytableInPlugin,
  waitForPlugin,
} from './pluginBridge';

type ModalId = 'none' | 'bonusSelect' | 'bonusSummary';

/**
 * Canvas game stage + Ninja ui-plugin HUD bridge.
 * Plugin owns spin/bet/balance/win/autoplay/turbo/sound/paytable chrome.
 */
export class GameApp {
  private root: HTMLElement;
  private session: GameSession;
  private unsub: (() => void) | null = null;
  private audio = new SoftAudio();
  private stage!: CanvasStage;
  private overlay!: HTMLElement;
  private modal: ModalId = 'none';
  private busy = false;
  private skipSpin = false;
  private turbo: 0 | 1 | 2 = 0;
  private autoLeft = 0;
  private musicOn = true;
  private soundOn = true;
  private statusMessage = '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.session = createSession();
    this.mountShell();
    this.wireSession();

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.session.setReducedMotion(mq.matches);
    mq.addEventListener('change', (e) => this.session.setReducedMotion(e.matches));

    void this.bootstrap();
  }

  get remote(): GameSession {
    return this.session;
  }

  /** QA / screenshot helpers */
  showBonusSelect(): void {
    this.modal = 'bonusSelect';
    this.renderOverlay();
  }

  hideGameOverlays(): void {
    this.modal = 'none';
    this.renderOverlay();
  }

  private mountShell(): void {
    this.root.innerHTML = `
      <div class="demo-banner">${GAME_CONFIG.demoLabel}</div>
      <div class="pixi-shell">
        <canvas id="game-canvas" aria-label="Game stage"></canvas>
        <div id="game-overlay" class="game-overlay"></div>
      </div>
    `;
    const canvas = this.root.querySelector<HTMLCanvasElement>('#game-canvas');
    const overlay = this.root.querySelector<HTMLElement>('#game-overlay');
    if (!canvas || !overlay) throw new Error('shell missing');
    this.stage = new CanvasStage(canvas);
    this.overlay = overlay;
  }

  private wireSession(): void {
    this.unsub?.();
    this.unsub = this.session.subscribe(() => {
      if (this.session.state?.muted !== undefined) this.audio.setMuted(this.session.state.muted);
      this.syncPluginMeters();
      this.renderOverlay();
    });
  }

  private async bootstrap(): Promise<void> {
    this.statusMessage = 'Loading…';
    this.renderOverlay();
    try {
      await this.stage.load();
      this.stage.resize();
      window.addEventListener('resize', () => {
        this.stage.resize();
        applyPluginMode();
      });
      await waitForPlugin();
      initPluginHud();
      bindPluginEvents({
        onSpin: () => void this.onSpin(),
        onSpinStop: () => {
          this.skipSpin = true;
        },
        onBetUp: () => void this.session.adjustBet(1),
        onBetDown: () => void this.session.adjustBet(-1),
        onAutoplayStart: (n) => {
          this.autoLeft = n;
          setAutoplayActive(true, this.autoLeft);
          void this.onSpin();
        },
        onAutoplayStop: () => {
          this.autoLeft = 0;
          setAutoplayActive(false);
        },
        onTurboCycle: () => {
          this.turbo = ((this.turbo + 1) % 3) as 0 | 1 | 2;
          setTurboLevel(this.turbo);
        },
        onSoundToggle: (kind, on) => {
          if (kind === 'music') this.musicOn = on;
          if (kind === 'sound') this.soundOn = on;
          const muted = !this.musicOn && !this.soundOn;
          void this.session.setMuted(muted);
          this.audio.setMuted(muted);
          setSoundToggles(this.musicOn, this.soundOn);
        },
        onPaytable: () => showPaytableInPlugin(),
      });
      setTurboLevel(0);
      setSoundToggles(true, true);

      await this.session.connect();
      this.statusMessage = this.session.api.base
        ? `API ${this.session.api.base}`
        : 'Client-side demo (no API)';
      this.audio.setMuted(this.session.state?.muted ?? false);
      this.syncPluginMeters();
      this.startDrawLoop();
      this.renderOverlay();
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
      this.renderOverlay();
      console.error(e);
    }
  }

  private startDrawLoop(): void {
    const loop = () => {
      this.stage.draw(this.session.state);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private syncPluginMeters(): void {
    const s = this.session.state;
    if (!s) return;
    setBalanceText(s.balance);
    setBetText(s.bet);
    setWinText(s.lastPayout ?? 0);
    const can = !this.busy && this.session.status === 'ready' && this.session.canSpin();
    setSpinEnabled(can || s.phase === 'BONUS_ACTIVE' || s.phase === 'BONUS_SELECT' || s.phase === 'BONUS_SUMMARY');
  }

  private spinDelayMs(s: GameState): number {
    if (s.reducedMotion) return 80;
    if (this.turbo === 2) return 120;
    if (this.turbo === 1) return Math.floor(GAME_CONFIG.animation.spinMs * 0.45);
    return GAME_CONFIG.animation.spinMs;
  }

  private async waitSpin(ms: number): Promise<void> {
    this.skipSpin = false;
    const step = 40;
    let left = ms;
    while (left > 0 && !this.skipSpin) {
      await new Promise((r) => setTimeout(r, Math.min(step, left)));
      left -= step;
    }
  }

  private async onSpin(): Promise<void> {
    if (this.busy || this.session.status !== 'ready') return;
    const s = this.session.state;
    if (!s) return;

    if (s.phase === 'BONUS_SUMMARY') {
      this.modal = 'bonusSummary';
      this.renderOverlay();
      return;
    }
    if (s.phase === 'BONUS_SELECT') {
      this.modal = 'bonusSelect';
      this.renderOverlay();
      return;
    }

    if (s.phase === 'BONUS_ACTIVE' && s.bonus) {
      if (s.bonus.mode === 'TAROT_CLUB') return;
      this.busy = true;
      setSpinningUi(true);
      this.stage.startSpinMotion();
      this.audio.spin();
      await this.waitSpin(this.spinDelayMs(s));
      try {
        await this.session.bonusSpin();
        this.afterResult();
      } catch (e) {
        this.statusMessage = e instanceof Error ? e.message : String(e);
      }
      this.stage.stopSpinMotion();
      setSpinningUi(false);
      this.busy = false;
      if (this.session.state?.phase === 'BONUS_SUMMARY') this.modal = 'bonusSummary';
      this.syncPluginMeters();
      this.renderOverlay();
      this.continueAutoplay();
      return;
    }

    if (!this.session.canSpin()) {
      this.autoLeft = 0;
      setAutoplayActive(false);
      return;
    }

    this.busy = true;
    setWinText(0);
    setSpinningUi(true);
    setSpinEnabled(false);
    this.stage.startSpinMotion();
    this.audio.spin();
    await this.waitSpin(this.spinDelayMs(s));
    try {
      await this.session.spin();
      this.afterResult();
      const phase = this.session.state?.phase;
      if (phase === 'BONUS_SELECT') {
        this.modal = 'bonusSelect';
        this.audio.bonus();
        this.autoLeft = 0;
        setAutoplayActive(false);
      } else if (phase === 'BONUS_ACTIVE') {
        this.audio.bonus();
      }
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.stage.stopSpinMotion();
    setSpinningUi(false);
    this.busy = false;
    this.syncPluginMeters();
    this.renderOverlay();
    this.continueAutoplay();
  }

  private continueAutoplay(): void {
    if (this.autoLeft <= 0) return;
    const phase = this.session.state?.phase;
    if (phase && phase !== 'IDLE' && phase !== 'BONUS_ACTIVE') {
      this.autoLeft = 0;
      setAutoplayActive(false);
      return;
    }
    this.autoLeft -= 1;
    setAutoplayActive(this.autoLeft > 0, this.autoLeft);
    if (this.autoLeft > 0) {
      window.setTimeout(() => void this.onSpin(), this.turbo === 2 ? 80 : 220);
    }
  }

  private afterResult(): void {
    const s = this.session.state;
    if (!s) return;
    const payout = s.lastPayout ?? 0;
    setWinText(payout);
    if (payout > 0) this.audio.win(payout >= s.bet * 10);
  }

  private async selectBonus(mode: BonusModeId): Promise<void> {
    this.audio.bonus();
    try {
      await this.session.selectBonus(mode);
      this.modal = 'none';
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.syncPluginMeters();
    this.renderOverlay();
  }

  private async onTarotPick(): Promise<void> {
    if (this.busy || this.session.status !== 'ready') return;
    this.busy = true;
    try {
      await this.session.tarotPick();
      this.afterResult();
      if (this.session.state?.phase === 'BONUS_SUMMARY') this.modal = 'bonusSummary';
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
    this.syncPluginMeters();
    this.renderOverlay();
  }

  private renderOverlay(): void {
    const s = this.session.state;
    if (this.session.status !== 'ready' || !s) {
      this.overlay.innerHTML = `<div class="boot-panel"><p>${this.statusMessage || 'Connecting…'}</p></div>`;
      this.overlay.style.pointerEvents = 'auto';
      return;
    }

    if (this.modal === 'bonusSelect') {
      const choices =
        s.pendingBonusChoices && s.pendingBonusChoices.length > 0
          ? s.pendingBonusChoices
          : (['TAROT_CLUB', 'CRIMSON_MOON'] as BonusModeId[]);
      this.overlay.style.pointerEvents = 'auto';
      this.overlay.innerHTML = `<div class="overlay-panel" role="dialog">
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
      this.overlay.querySelectorAll('[data-bonus]').forEach((el) => {
        el.addEventListener('click', () => {
          void this.selectBonus((el as HTMLElement).dataset.bonus as BonusModeId);
        });
      });
      return;
    }

    if (this.modal === 'bonusSummary') {
      this.overlay.style.pointerEvents = 'auto';
      const b = s.bonus;
      this.overlay.innerHTML = `<div class="overlay-panel" role="dialog">
        <h2>Path Complete</h2>
        <p>${b ? b.mode.replace(/_/g, ' ') : 'Bonus'} closed.</p>
        <p>Total: <strong>${(b?.totalWon ?? 0).toLocaleString()}</strong></p>
        <button type="button" class="choice-btn" data-ack>Continue</button>
      </div>`;
      this.overlay.querySelector('[data-ack]')?.addEventListener('click', () => {
        void this.session.acknowledgeBonusSummary().then(() => {
          this.modal = 'none';
          this.syncPluginMeters();
          this.renderOverlay();
        });
      });
      return;
    }

    if (s.phase === 'BONUS_ACTIVE' && s.bonus?.mode === 'TAROT_CLUB') {
      this.overlay.style.pointerEvents = 'auto';
      const b = s.bonus;
      this.overlay.innerHTML = `<div class="overlay-panel tarot">
        <h2>${GAME_CONFIG.bonuses.tarotClub.name}</h2>
        <p>Picks left: ${b.tarotPicksRemaining} · ×${b.tarotRunningMultiplier}</p>
        <button type="button" class="choice-btn" data-tarot>Draw</button>
        <ul>${b.tarotHistory.map((r) => `<li>${r.label}</li>`).join('') || '<li>No picks yet</li>'}</ul>
      </div>`;
      this.overlay.querySelector('[data-tarot]')?.addEventListener('click', () => void this.onTarotPick());
      return;
    }

    // Clear overlay — plugin HUD handles controls (pointer-events none so clicks pass to plugin)
    this.overlay.innerHTML = this.statusMessage
      ? `<p class="status-chip">${this.statusMessage}</p>`
      : '';
    this.overlay.style.pointerEvents = 'none';
  }
}
