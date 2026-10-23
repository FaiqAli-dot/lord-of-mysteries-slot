import type { BonusModeId, SpiritualityEffectId } from '../config/gameConfig';
import type { Grid } from '../engine/types';
import type { PublicGameState } from './publicState';
import { resolveApiBase, SESSION_STORAGE_KEY, tunnelRequestHeaders } from './apiConfig';

export type DebugOp =
  | { op: 'forceGrid'; grid: Grid }
  | { op: 'fillSpirituality' }
  | { op: 'forceSpiritualityEffect'; effect: SpiritualityEffectId }
  | { op: 'forceScatters'; count: number }
  | { op: 'forceWildExpand' }
  | { op: 'setSequenceWins'; wins: number }
  | { op: 'setSequenceMultiplier'; mult: number }
  | { op: 'forceCreepingHunger' }
  | { op: 'forceBonusMode'; mode: BonusModeId }
  | { op: 'seedHistoricalVoid' }
  | { op: 'clearForces' };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SessionResponse {
  sessionId: string;
  state: PublicGameState;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
  time: string;
}

async function request<T>(
  base: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...tunnelRequestHeaders(base),
        ...init?.headers,
      },
    });
  } catch (e) {
    throw new ApiError(
      `Network error talking to API at ${base}: ${e instanceof Error ? e.message : String(e)}`,
      0,
    );
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export class PathwaysApi {
  base: string;

  constructor(base?: string) {
    this.base = (base ?? resolveApiBase()).replace(/\/+$/, '');
  }

  get configured(): boolean {
    return this.base.length > 0;
  }

  setBase(url: string): void {
    this.base = url.replace(/\/+$/, '');
  }

  health(): Promise<HealthResponse> {
    return request(this.base, '/health');
  }

  createSession(): Promise<SessionResponse> {
    return request(this.base, '/api/session', { method: 'POST', body: '{}' });
  }

  getSession(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}`);
  }

  spin(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/spin`, {
      method: 'POST',
      body: '{}',
    });
  }

  setBet(id: string, bet: number): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/bet`, {
      method: 'POST',
      body: JSON.stringify({ bet }),
    });
  }

  adjustBet(id: string, dir: 1 | -1): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/bet/adjust`, {
      method: 'POST',
      body: JSON.stringify({ dir }),
    });
  }

  selectBonus(id: string, mode: BonusModeId): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/bonus/select`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  bonusSpin(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/bonus/spin`, {
      method: 'POST',
      body: '{}',
    });
  }

  tarotPick(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/tarot/pick`, {
      method: 'POST',
      body: '{}',
    });
  }

  ackBonus(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/bonus/ack`, {
      method: 'POST',
      body: '{}',
    });
  }

  reset(id: string): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
      body: '{}',
    });
  }

  setMuted(id: string, muted: boolean): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/mute`, {
      method: 'POST',
      body: JSON.stringify({ muted }),
    });
  }

  debug(id: string, body: DebugOp): Promise<SessionResponse> {
    return request(this.base, `/api/session/${encodeURIComponent(id)}/debug`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

export function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SESSION_STORAGE_KEY, id);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
