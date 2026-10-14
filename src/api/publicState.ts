import type { GameState } from '../engine/types';

/** Client-safe snapshot — omits server-only forceGrid. */
export type PublicGameState = Omit<GameState, 'forceGrid'>;

export function toPublicState(state: GameState): PublicGameState {
  const { forceGrid: _fg, ...rest } = state;
  return structuredClone(rest);
}
