import { Application, Assets } from 'pixi.js';
import { GAME_CONFIG, type BonusModeId, type SymbolId } from '../config/gameConfig';
import { sequenceProgress } from '../engine/sequence';
import type { GameSession } from '../api/session';
import { SoftAudio } from '../ui/audio';
import { allAssetUrls } from './assets';
import { bus } from './EventBus';
import { LayerManager } from './LayerManager';
import { BackgroundView } from './layers/BackgroundView';
import { ReelsetView } from './layers/ReelsetView';
import { HudView } from './layers/HudView';
import { PopupsView } from './layers/PopupsView';

/**
 * First-party Pixi HUD + reel presentation (“ui-plugin”).
 * Mirrors space-fortune layout/event patterns without using ecl or their art.
 */
export class PixiGame {
  private app: Application;
  private layers = new LayerManager();
  private session: GameSession;
  private audio = new SoftAudio();
  private unsub: (() => void) | null = null;
  private busy = false;
  private bg!: BackgroundView;
  private reels!: ReelsetView;
  private hud!: HudView;
  private popups!: PopupsView;

  constructor(canvas: HTMLCanvasElement, session: GameSession) {
    this.session = session;
    this.app = new Application({
      view: canvas,
      backgroundColor: 0x0a0908,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    // Mount layered root (background → reelset → ui_*) onto the Pixi stage.
    this.app.stage.removeChildren();
    this.app.stage.addChild(this.layers.stage);
  }

  async init(): Promise<void> {
    await Assets.load(allAssetUrls());

    this.bg = new BackgroundView(this.layers.background);
    this.reels = new ReelsetView(this.layers.reelset);
    this.hud = new HudView(this.layers.uiInfo, this.layers.uiButtons);
    this.popups = new PopupsView(this.layers.uiPopups);

    this.wireBus();
    this.wireSession();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKey(e));

    await this.session.connect();
    this.pushState();
    bus.emit('status-message', this.session.api.base ? `API ${this.session.api.base}` : 'Client-side demo (no API)');
  }

  get pixi(): Application {
    return this.app;
  }

  get gameSession(): GameSession {
    return this.session;
  }

  setSession(session: GameSession): void {
    this.unsub?.();
    this.session = session;
    this.wireSession();
    void this.session.connect().then(() => this.pushState());
  }

  private wireSession(): void {
    this.unsub = this.session.subscribe(() => {
      if (this.session.state?.muted !== undefined) this.audio.setMuted(this.session.state.muted);
      this.pushState();
    });
  }

  private wireBus(): void {
    bus.on('spin-button-pressed', () => void this.onSpin());
    bus.on('bet-increase', () => void this.session.adjustBet(1));
    bus.on('bet-decrease', () => void this.session.adjustBet(-1));
    bus.on('select-bonus', (mode) => void this.onSelectBonus(mode as BonusModeId));
    bus.on('ack-bonus-summary', () => void this.session.acknowledgeBonusSummary());
    bus.on('toggle-sound', () => {
      const muted = !(this.session.state?.muted ?? false);
      void this.session.setMuted(muted);
    });
    bus.on('resize', () => {
      this.bg.apply(this.layers.mode);
      this.reels.layout(this.layers.mode);
      this.hud.layout(this.layers.mode);
      this.popups.layout(this.layers.mode);
    });
  }

  private onResize(): void {
    const parent = (this.app.view as HTMLCanvasElement).parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.app.renderer.resize(w, h);
    this.layers.onResize(w, h);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.busy || this.session.status !== 'ready') return;
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
      bus.emit('close-popups');
    } else if (e.key === 'm' || e.key === 'M') {
      bus.emit('toggle-sound');
    } else if (e.key === 'r' || e.key === 'R') {
      void this.session.resetDemo();
    }
  }

  private pushState(): void {
    const s = this.session.state;
    if (!s) return;
    bus.emit('update-balance', s.balance);
    bus.emit('update-bet', s.bet);
    bus.emit('update-win', s.lastPayout ?? 0);
    bus.emit('grid-update', s.grid as SymbolId[][]);
    const prog = sequenceProgress(s.sequenceWins);
    bus.emit('update-sequence', prog.multiplier, prog.progress);
    bus.emit(
      'update-spirituality',
      s.spiritualityCharge,
      GAME_CONFIG.spirituality.threshold,
    );

    if (s.phase === 'BONUS_SELECT') bus.emit('show-bonus-select');
    else if (s.phase === 'BONUS_SUMMARY') {
      const name = s.bonus?.mode ?? 'Bonus';
      bus.emit('show-bonus-summary', String(name), s.bonus?.totalWon ?? s.lastPayout ?? 0);
    }

    if (this.busy) bus.emit('toggle-off-spin-button');
    else bus.emit('toggle-on-spin-button');
  }

  private async onSpin(): Promise<void> {
    if (this.busy || this.session.status !== 'ready') return;
    const s = this.session.state;
    if (!s) return;

    if (s.phase === 'BONUS_SUMMARY') {
      bus.emit('show-bonus-summary', String(s.bonus?.mode ?? 'Bonus'), s.bonus?.totalWon ?? s.lastPayout ?? 0);
      return;
    }
    if (s.phase === 'BONUS_SELECT') {
      bus.emit('show-bonus-select');
      return;
    }

    if (s.phase === 'BONUS_ACTIVE' && s.bonus) {
      if (s.bonus.mode === 'TAROT_CLUB') {
        await this.session.tarotPick();
        this.afterResult();
        return;
      }
      this.busy = true;
      bus.emit('toggle-off-spin-button');
      bus.emit('spin-start');
      this.audio.spin();
      await wait(s.reducedMotion ? 120 : GAME_CONFIG.animation.spinMs);
      try {
        await this.session.bonusSpin();
        bus.emit('spin-stop');
        this.afterResult();
      } catch (e) {
        bus.emit('status-message', e instanceof Error ? e.message : String(e));
      }
      this.busy = false;
      this.pushState();
      return;
    }

    if (!this.session.canSpin()) return;
    this.busy = true;
    bus.emit('toggle-off-spin-button');
    bus.emit('update-win', 0);
    bus.emit('spin-start');
    this.audio.spin();
    await wait(s.reducedMotion ? 120 : GAME_CONFIG.animation.spinMs);
    try {
      await this.session.spin();
      bus.emit('spin-stop');
      this.afterResult();
      const phase = this.session.state?.phase;
      if (phase === 'BONUS_SELECT' || phase === 'BONUS_ACTIVE') this.audio.bonus();
    } catch (e) {
      bus.emit('status-message', e instanceof Error ? e.message : String(e));
    }
    this.busy = false;
    this.pushState();
  }

  private async onSelectBonus(mode: BonusModeId): Promise<void> {
    bus.emit('hide-bonus-overlay');
    await this.session.selectBonus(mode);
    this.audio.bonus();
    this.pushState();
  }

  private afterResult(): void {
    const s = this.session.state;
    if (!s) return;
    const win = s.lastPayout ?? 0;
    if (win > 0) {
      bus.emit('update-win-animated', win);
      this.audio.win(win >= s.bet * 10);
    }
    if (win >= s.bet * 15) {
      bus.emit('show-big-win', win);
      this.audio.bonus();
    }
    bus.emit('grid-update', s.grid as SymbolId[][]);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
