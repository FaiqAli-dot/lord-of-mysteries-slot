import type { BonusModeId, SpiritualityEffectId } from '../config/gameConfig';
import type { GameState, Grid } from '../engine/types';
import type { PublicGameState } from './publicState';
import {
  PathwaysApi,
  getStoredSessionId,
  setStoredSessionId,
} from './client';
import { resolveApiBase, setStoredApiBase } from './apiConfig';

function asGameState(pub: PublicGameState): GameState {
  return structuredClone(pub);
}

/**
 * Client-side session mirror. All spins / balance mutations go through the API.
 */
export class RemoteSession {
  api: PathwaysApi;
  sessionId: string | null = null;
  state: GameState | null = null;
  status: 'idle' | 'connecting' | 'ready' | 'error' = 'idle';
  error: string | null = null;
  private listeners = new Set<() => void>();

  constructor(apiBase?: string) {
    this.api = new PathwaysApi(apiBase ?? resolveApiBase());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get configured(): boolean {
    return this.api.configured;
  }

  setApiBase(url: string): void {
    setStoredApiBase(url);
    this.api.setBase(url);
    setStoredSessionId(null);
    this.sessionId = null;
    this.state = null;
    this.status = 'idle';
    this.error = null;
    this.emit();
  }

  async connect(): Promise<void> {
    if (!this.api.configured) {
      this.status = 'error';
      this.error = 'No API URL configured. Set it in Settings or via ?api=https://…';
      this.emit();
      return;
    }
    this.status = 'connecting';
    this.error = null;
    this.emit();
    try {
      await this.api.health();
      const existing = getStoredSessionId();
      if (existing) {
        try {
          const res = await this.api.getSession(existing);
          this.sessionId = res.sessionId;
          this.state = asGameState(res.state);
          this.status = 'ready';
          this.emit();
          return;
        } catch {
          setStoredSessionId(null);
        }
      }
      const created = await this.api.createSession();
      this.sessionId = created.sessionId;
      setStoredSessionId(created.sessionId);
      this.state = asGameState(created.state);
      this.status = 'ready';
      this.emit();
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      this.emit();
    }
  }

  private requireId(): string {
    if (!this.sessionId) throw new Error('No session');
    return this.sessionId;
  }

  private apply(res: { sessionId: string; state: PublicGameState }): void {
    this.sessionId = res.sessionId;
    setStoredSessionId(res.sessionId);
    this.state = asGameState(res.state);
    this.status = 'ready';
    this.error = null;
    this.emit();
  }

  canSpin(): boolean {
    const s = this.state;
    return (
      !!s &&
      s.phase === 'IDLE' &&
      s.balance >= s.bet &&
      s.bonus === null
    );
  }

  async spin(): Promise<void> {
    this.apply(await this.api.spin(this.requireId()));
  }

  async bonusSpin(): Promise<void> {
    this.apply(await this.api.bonusSpin(this.requireId()));
  }

  async tarotPick(): Promise<void> {
    this.apply(await this.api.tarotPick(this.requireId()));
  }

  async selectBonus(mode: BonusModeId): Promise<void> {
    this.apply(await this.api.selectBonus(this.requireId(), mode));
  }

  async acknowledgeBonusSummary(): Promise<void> {
    this.apply(await this.api.ackBonus(this.requireId()));
  }

  async adjustBet(dir: 1 | -1): Promise<void> {
    this.apply(await this.api.adjustBet(this.requireId(), dir));
  }

  async setMuted(muted: boolean): Promise<void> {
    this.apply(await this.api.setMuted(this.requireId(), muted));
  }

  async resetDemo(): Promise<void> {
    this.apply(await this.api.reset(this.requireId()));
  }

  setReducedMotion(v: boolean): void {
    if (this.state) this.state.reducedMotion = v;
    this.emit();
  }

  async debugForceGrid(grid: Grid): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'forceGrid', grid }));
  }

  async debugFillSpirituality(): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'fillSpirituality' }));
  }

  async debugForceSpiritualityEffect(effect: SpiritualityEffectId): Promise<void> {
    this.apply(
      await this.api.debug(this.requireId(), { op: 'forceSpiritualityEffect', effect }),
    );
  }

  async debugForceScatters(count: number): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'forceScatters', count }));
  }

  async debugForceWildExpand(): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'forceWildExpand' }));
  }

  async debugSetSequenceWins(wins: number): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'setSequenceWins', wins }));
  }

  async debugSetSequenceMultiplier(mult: number): Promise<void> {
    this.apply(
      await this.api.debug(this.requireId(), { op: 'setSequenceMultiplier', mult }),
    );
  }

  async debugForceCreepingHunger(): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'forceCreepingHunger' }));
  }

  async debugForceBonusMode(mode: BonusModeId): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'forceBonusMode', mode }));
  }

  async debugSeedHistoricalVoid(): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'seedHistoricalVoid' }));
  }

  async debugClearForces(): Promise<void> {
    this.apply(await this.api.debug(this.requireId(), { op: 'clearForces' }));
  }
}
