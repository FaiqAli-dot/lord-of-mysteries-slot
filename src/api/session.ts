import type { BonusModeId } from '../config/gameConfig';
import type { GameState } from '../engine/types';
import { resolveApiBase, setStoredApiBase } from './apiConfig';
import { LocalSession } from './localSession';
import { RemoteSession } from './remoteSession';
import { setStoredSessionId } from './client';

/** Unified session surface used by the UI (local or remote). */
export type GameSession = LocalSession | RemoteSession;

export function createSession(apiBase?: string): GameSession {
  const base = (apiBase ?? resolveApiBase()).trim();
  if (base) return new RemoteSession(base);
  return new LocalSession();
}

/**
 * Switch API mode. Empty URL → local client-side engine (Pages-friendly).
 * Non-empty → remote authoritative API.
 */
export function switchSessionApi(_current: GameSession, url: string): GameSession {
  const n = url.trim().replace(/\/+$/, '');
  setStoredApiBase(n);
  setStoredSessionId(null);
  if (!n) return new LocalSession();
  return new RemoteSession(n);
}

export function isRemote(s: GameSession): s is RemoteSession {
  return s instanceof RemoteSession;
}

export type { GameState, BonusModeId };
