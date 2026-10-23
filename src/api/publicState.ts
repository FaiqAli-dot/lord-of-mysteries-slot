import type { GameState } from '../engine/types';

/**
 * Client-safe snapshot. Force/cheat fields are included so the demo cheats
 * panel can show "armed" state over RemoteSession.
 */
export type PublicGameState = GameState;

export function toPublicState(state: GameState): PublicGameState {
  return structuredClone(state);
}
