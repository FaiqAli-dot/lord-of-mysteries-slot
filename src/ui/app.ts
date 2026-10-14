import { GAME_CONFIG, type BonusModeId } from '../config/gameConfig';
import { SoftAudio } from './audio';
import { createSession, type GameSession } from '../api/session';
import type { GameState } from '../engine/types';
import { PixiStage } from './pixiStage';
import {
  bindPluginEvents,
  initPluginHud,
  resizeExternalUi,
  setAutoplayActive,
  setBalanceText,
  setBetText,
  setSoundToggles,
  setSpinEnabled,
  setTurboLevel,
  setWinText,
  showPaytableInPlugin,
  spinActive,
  updateBetButtons,
  waitForHostUi,
} from './pluginBridge';
import type { SymbolId } from '../config/gameConfig';

type ModalId = 'none' | 'bonusSelect' | 'bonusSummary';

/**
 * Pixi game stage + Ninja ui-plugin host chrome (per UI_PLUGIN_INTEGRATION.md).
 */
export class GameApp {
  private root: HTMLElement;
  private session: GameSession;
  private unsub: (() => void) | null = null;
  private audio = new SoftAudio();
  private stage!: PixiStage;
  private overlay!: HTMLElement;
  private modal: ModalId = 'none';
  private ready = false;
  private busy = false;
  private skipSpin = false;
  private turbo: 0 | 1 | 2 = 0;
  private autoLeft = 0;
  private musicOn = true;
  private soundOn = true;
  private statusMessage = '';
  private openPopups = 0;

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
      <div class="game-shell">
        <canvas id="game-canvas"></canvas>
        <div id="game-overlay" class="game-overlay"></div>
      </div>
    `;
    const canvas = this.root.querySelector<HTMLCanvasElement>('#game-canvas');
    const overlay = this.root.querySelector<HTMLElement>('#game-overlay');
    if (!canvas || !overlay) throw new Error('shell missing');
    this.stage = new PixiStage(canvas);
    this.overlay = overlay;
  }

  private wireSession(): void {
    this.unsub?.();
    this.unsub = this.session.subscribe(() => {
      if (!this.ready) return;
      if (this.session.state?.muted !== undefined) this.audio.setMuted(this.session.state.muted);
      this.pushStateToPlugin();
      this.pushStateToPixi();
      this.renderOverlay();
    });
  }

  private async bootstrap(): Promise<void> {
    this.statusMessage = 'Loading…';
    this.renderOverlay();
    try {
      await this.stage.init();
      // 1) wait vueReady  2) setGameConfig  3) setMode  4) show
      await waitForHostUi(3000);
      initPluginHud('en');
      bindPluginEvents({
        onSpin: () => void this.onSpin(),
        onSpinStop: () => {
          this.skipSpin = true;
        },
        onBetUp: () => void this.onBet(1),
        onBetDown: () => void this.onBet(-1),
        onMaxBet: () => {
          const levels = GAME_CONFIG.betOptions;
          const max = levels[levels.length - 1]!;
          const s = this.session.state;
          if (!s) return;
          while ((this.session.state?.bet ?? 0) < max) {
            void this.session.adjustBet(1);
            if ((this.session.state?.bet ?? 0) >= max) break;
          }
        },
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
        onTurboToggle: (on) => {
          this.turbo = on ? 1 : 0;
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
        onSoundVolume: (v) => {
          this.audio.setMuted(v <= 0);
        },
        onPaytable: () => showPaytableInPlugin(),
        onPopupStatus: (_popup, isOpen) => {
          this.openPopups += isOpen ? 1 : -1;
          if (this.openPopups < 0) this.openPopups = 0;
          this.stage.setInteractive(this.openPopups === 0);
        },
      });

      window.addEventListener('resize', () => this.onResize());
      window.addEventListener('orientationchange', () => this.onResize());
      window.visualViewport?.addEventListener('resize', () => this.onResize());

      setTurboLevel(0);
      setSoundToggles(true, true);

      await this.session.connect();
      this.ready = true;
      this.statusMessage = this.session.api.base
        ? `API ${this.session.api.base}`
        : 'Client-side demo (no API)';
      this.audio.setMuted(this.session.state?.muted ?? false);
      this.onResize();
      this.pushStateToPlugin();
      this.pushStateToPixi();
      // Bet push race safety (SF emits update-bet multiple times)
      setBetText(this.session.state?.bet ?? GAME_CONFIG.defaultBet);
      setBetText(this.session.state?.bet ?? GAME_CONFIG.defaultBet);
      this.renderOverlay();
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
      this.renderOverlay();
      console.error(e);
    }
  }

  private onResize(): void {
    const kind = this.stage.onResize();
    resizeExternalUi(kind);
  }

  private pushStateToPlugin(): void {
    const s = this.session.state;
    if (!s) return;
    setBalanceText(s.balance);
    setBetText(s.bet);
    setWinText(s.lastPayout ?? 0);
    const levels = GAME_CONFIG.betOptions;
    updateBetButtons(s.bet, levels[0]!, levels[levels.length - 1]!);
    const can =
      !this.busy &&
      this.session.status === 'ready' &&
      (this.session.canSpin() ||
        s.phase === 'BONUS_ACTIVE' ||
        s.phase === 'BONUS_SELECT' ||
        s.phase === 'BONUS_SUMMARY');
    setSpinEnabled(can);
  }

  private pushStateToPixi(): void {
    const s = this.session.state;
    if (!s) return;
    this.stage.setGrid(s.grid as SymbolId[][]);
    this.stage.setMeters(s);
  }

  private async onBet(dir: 1 | -1): Promise<void> {
    await this.session.adjustBet(dir);
    // Open bet popup like SF on ± toolbar
    try {
      window.externalUi?.call?.('ui-bet-popup', 'show');
    } catch {
      /* optional */
    }
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
      spinActive(true);
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
      spinActive(false);
      this.busy = false;
      if (this.session.state?.phase === 'BONUS_SUMMARY') this.modal = 'bonusSummary';
      this.pushStateToPlugin();
      this.pushStateToPixi();
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
    spinActive(true);
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
    spinActive(false);
    this.busy = false;
    this.pushStateToPlugin();
    this.pushStateToPixi();
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
    if (payout > 0) {
      this.audio.win(payout >= s.bet * 10);
      if (payout >= s.bet * 15) this.stage.showWinCelebration(payout);
    }
  }

  private async selectBonus(mode: BonusModeId): Promise<void> {
    this.audio.bonus();
    try {
      await this.session.selectBonus(mode);
      this.modal = 'none';
    } catch (e) {
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
    this.pushStateToPlugin();
    this.pushStateToPixi();
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
    this.pushStateToPlugin();
    this.pushStateToPixi();
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
          this.pushStateToPlugin();
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

    this.overlay.innerHTML = this.statusMessage
      ? `<p class="status-chip">${this.statusMessage}</p>`
      : '';
    this.overlay.style.pointerEvents = 'none';
  }
}
