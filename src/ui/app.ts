import { GAME_CONFIG } from '../config/gameConfig';
import { SoftAudio } from './audio';
import { createSession, type GameSession } from '../api/session';
import { PixiStage } from '../components/reelset/sources/Reelset';
import { LayerManager } from '../components/game/sources/LayerManager';
import type { GameContext } from '../components/game/sources/GameContext';
import { FSM } from '../components/fsm/sources/FSM';
import { BonusOverlay } from '../components/bonus/sources/BonusOverlay';
import { CheatsPanel } from '../components/cheats/sources/CheatsPanel';
import { Game } from '../components/game/sources/Game';
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
  updateBetButtons,
  waitForHostUi,
} from './pluginBridge';
import type { SymbolId } from '../config/gameConfig';

/**
 * SF-shaped shell: FSM sequences + LayerManager + feature packages.
 * Math stays in engine/ via LocalSession | RemoteSession.
 */
export class GameApp {
  private root: HTMLElement;
  private session: GameSession;
  private unsub: (() => void) | null = null;
  private audio = new SoftAudio();
  private stage!: PixiStage;
  private layers = new LayerManager();
  private overlay!: BonusOverlay;
  private game: Game | null = null;
  private cheats: CheatsPanel | null = null;
  private ready = false;
  private busy = false;
  private skipSpin = false;
  private turbo: 0 | 1 | 2 = 0;
  private autoLeft = 0;
  private musicOn = true;
  private soundOn = true;
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

  private mountShell(): void {
    this.root.innerHTML = `
      <div class="demo-banner">${GAME_CONFIG.demoLabel}</div>
      <div class="game-shell">
        <canvas id="game-canvas"></canvas>
        <div id="game-overlay" class="game-overlay"></div>
        <div id="cheats-host" class="cheats-host"></div>
      </div>
    `;
    const canvas = this.root.querySelector<HTMLCanvasElement>('#game-canvas');
    const overlayEl = this.root.querySelector<HTMLElement>('#game-overlay');
    const cheatsHost = this.root.querySelector<HTMLElement>('#cheats-host');
    if (!canvas || !overlayEl || !cheatsHost) throw new Error('shell missing');

    this.stage = new PixiStage(canvas);
    this.overlay = new BonusOverlay(
      overlayEl,
      () => this.session,
      () => {
        this.pushStateToPlugin();
        this.pushStateToPixi();
      },
    );

    this.cheats = new CheatsPanel(cheatsHost, this.session, () => {
      this.pushStateToPixi();
    });
  }

  private wireSession(): void {
    this.unsub?.();
    this.unsub = this.session.subscribe(() => {
      if (!this.ready) return;
      if (this.session.state?.muted !== undefined) this.audio.setMuted(this.session.state.muted);
      this.pushStateToPlugin();
      this.pushStateToPixi();
      this.overlay.render();
    });
  }

  private buildContext(): GameContext {
    return {
      session: this.session,
      stage: this.stage,
      audio: this.audio,
      overlay: this.overlay,
      cheats: this.cheats,
      layers: this.layers,
      getTurbo: () => this.turbo,
      getSkip: () => this.skipSpin,
      clearSkip: () => {
        this.skipSpin = false;
      },
      isBusy: () => this.busy,
      setBusy: (v) => {
        this.busy = v;
      },
      getAutoLeft: () => this.autoLeft,
      setAutoLeft: (n) => {
        this.autoLeft = n;
        setAutoplayActive(n > 0, n);
      },
      pushStateToPlugin: () => this.pushStateToPlugin(),
      pushStateToPixi: () => this.pushStateToPixi(),
      afterResult: () => this.afterResult(),
      continueAutoplay: () => this.continueAutoplay(),
      onResize: () => this.onResize(),
      setStatus: (msg) => this.overlay.setStatus(msg),
    };
  }

  private async bootstrap(): Promise<void> {
    this.overlay.setStatus('Loading…');
    try {
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

      const fsm = FSM.$instance;
      fsm.bind(this.buildContext());
      await fsm.setCurrentState('Start');

      this.game = new Game(this.stage, this.layers, this.cheats);
      this.game.initializeComponents();
      this.ready = true;
      // Don't leave a permanent status chip over the reels — cheats button is enough.
      this.overlay.setStatus('');
      this.audio.setMuted(this.session.state?.muted ?? false);
      this.onResize();
      this.pushStateToPlugin();
      this.pushStateToPixi();
      setBetText(this.session.state?.bet ?? GAME_CONFIG.defaultBet);
      this.overlay.render();
    } catch (e) {
      this.overlay.setStatus(e instanceof Error ? e.message : String(e));
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
    if (!this.busy) this.stage.setGrid(s.grid as SymbolId[][]);
    this.stage.setMeters(s);
  }

  private async onBet(dir: 1 | -1): Promise<void> {
    await this.session.adjustBet(dir);
    try {
      window.externalUi?.call?.('ui-bet-popup', 'show');
    } catch {
      /* optional */
    }
  }

  private async onSpin(): Promise<void> {
    const s = this.session.state;
    if (!s || this.session.status !== 'ready') return;

    const fsm = FSM.$instance;
    fsm.bind(this.buildContext());

    if (s.phase === 'BONUS_SELECT' || s.phase === 'BONUS_SUMMARY') {
      await fsm.setCurrentState('Bonus');
      this.pushStateToPlugin();
      this.pushStateToPixi();
      return;
    }

    if (!this.session.canSpin() && !(s.phase === 'BONUS_ACTIVE' && s.bonus)) {
      this.autoLeft = 0;
      setAutoplayActive(false);
      return;
    }

    await fsm.setCurrentState('Spin');
    this.pushStateToPlugin();
    this.pushStateToPixi();
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
    setWinText(s.lastPayout ?? 0);
    // Win SFX + symbol pulse live in FeatureReveal; big-win banner in Celebration
  }
}
