import fsmConfig from '../../../data/fsm.json';
import type { GameContext } from '../../game/sources/GameContext';
import { State } from './State';
import { Start } from './states/Start';
import { Load } from './states/Load';
import { Idle } from './states/Idle';
import { Spin } from './states/Spin';
import { SpinSymbols } from './states/SpinSymbols';
import { SpinStart } from './states/SpinStart';
import { SpinStop } from './states/SpinStop';
import { FeatureReveal } from './states/FeatureReveal';
import { Celebration } from './states/Celebration';
import { Bonus } from './states/Bonus';
import { BonusSelect } from './states/BonusSelect';
import { BonusActive } from './states/BonusActive';
import { BonusSummary } from './states/BonusSummary';

type FsmStateName = (typeof fsmConfig.states)[number];

const STATE_CTORS: Record<FsmStateName, new () => State> = {
  Start,
  Load,
  Idle,
  Spin,
  SpinSymbols,
  SpinStart,
  SpinStop,
  FeatureReveal,
  Celebration,
  Bonus,
  BonusSelect,
  BonusActive,
  BonusSummary,
};

/**
 * Declarative FSM (Space Fortune pattern): onCheck → onEnter → onProgress → child sequence → onExit.
 */
export class FSM {
  private static instance: FSM | null = null;
  private states = new Map<string, State>();
  private currentState?: State;
  private cancelCurrentSequence = false;
  private ctx!: GameContext;

  static get $instance(): FSM {
    if (!FSM.instance) FSM.instance = new FSM();
    return FSM.instance;
  }

  private constructor() {
    for (const name of fsmConfig.states) {
      const Ctor = STATE_CTORS[name as FsmStateName];
      if (Ctor) this.states.set(name, new Ctor());
    }
  }

  bind(ctx: GameContext): void {
    this.ctx = ctx;
  }

  getCurrentStateName(): string | undefined {
    return this.currentState?.name;
  }

  async setCurrentState(name: FsmStateName, data?: unknown): Promise<void> {
    this.cancelCurrentSequence = true;
    await Promise.resolve();
    this.cancelCurrentSequence = false;
    const state = this.states.get(name);
    if (!state) return;
    await this.executeState(state, data);
  }

  private async executeState(state: State, data?: unknown): Promise<unknown> {
    if (this.cancelCurrentSequence) return;

    this.currentState = state;
    const should = await state.onCheck(this.ctx, data);
    if (!should) return 'skipped';

    const enterData = await state.onEnter(this.ctx, data);
    const progressData = await state.onProgress(this.ctx, enterData);

    const sequence =
      (fsmConfig.sequences as Record<string, string[]>)[state.name] ?? [];
    for (const nextName of sequence) {
      const next = this.states.get(nextName);
      if (next) await this.executeState(next, progressData);
    }

    return state.onExit(this.ctx, progressData);
  }
}
