/**
 * Fully client-side session — same engine as the server/simulator.
 * Used when no API URL is configured so GitHub Pages works standalone.
 */
import type { BonusModeId } from '../config/gameConfig';
import type { GameState } from '../engine/types';
import { SlotGame } from '../engine/game';

export class LocalSession {
  private game: SlotGame;
  status: 'idle' | 'connecting' | 'ready' | 'error' = 'ready';
  error: string | null = null;
  sessionId: string | null = 'local';
  /** Mimic RemoteSession.api.base for Settings UI. */
  api = { base: '' };
  private listeners = new Set<() => void>();

  constructor() {
    this.game = new SlotGame({ persist: true });
    this.game.subscribe(() => {
      for (const l of this.listeners) l();
    });
  }

  get state(): GameState | null {
    return this.game.state;
  }

  get configured(): boolean {
    return true;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setApiBase(_url: string): void {
    /* no-op — caller switches to remote mode */
  }

  async connect(): Promise<void> {
    this.status = 'ready';
    this.error = null;
    this.emit();
  }

  canSpin(): boolean {
    return this.game.canSpin();
  }

  async spin(): Promise<void> {
    this.game.spin();
  }

  async bonusSpin(): Promise<void> {
    this.game.bonusSpin();
  }

  async tarotPick(): Promise<void> {
    this.game.tarotPick();
  }

  async selectBonus(mode: BonusModeId): Promise<void> {
    this.game.selectBonus(mode);
  }

  async acknowledgeBonusSummary(): Promise<void> {
    this.game.acknowledgeBonusSummary();
  }

  async adjustBet(dir: 1 | -1): Promise<void> {
    this.game.adjustBet(dir);
  }

  async setMuted(muted: boolean): Promise<void> {
    this.game.setMuted(muted);
  }

  async resetDemo(): Promise<void> {
    this.game.resetDemo();
  }

  setReducedMotion(v: boolean): void {
    this.game.setReducedMotion(v);
  }
}
