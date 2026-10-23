import type { GameContext } from '../../game/sources/GameContext';

/** SF-style state hooks. Return false from onCheck to skip. */
export abstract class State {
  abstract readonly name: string;

  async onCheck(_ctx: GameContext, _data?: unknown): Promise<boolean> {
    return true;
  }

  async onEnter(ctx: GameContext, data?: unknown): Promise<unknown> {
    return data ?? ctx;
  }

  async onProgress(ctx: GameContext, data?: unknown): Promise<unknown> {
    return data ?? ctx;
  }

  async onExit(ctx: GameContext, data?: unknown): Promise<unknown> {
    return data ?? ctx;
  }
}
