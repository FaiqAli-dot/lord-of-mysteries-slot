import { utils } from 'pixi.js';

/** Game ↔ HUD event bus (mirrors reference naming; first-party, no ecl). */
export type UiEvents = {
  'update-balance': [number];
  'update-win': [number];
  'update-win-animated': [number];
  'update-bet': [number];
  'update-sequence': [number, number]; // mult, progress 0..1
  'update-spirituality': [number, number]; // charge, threshold
  'toggle-on-spin-button': [];
  'toggle-off-spin-button': [];
  'spin-button-pressed': [];
  'bet-increase': [];
  'bet-decrease': [];
  'open-paytable': [];
  'open-settings': [];
  'close-popups': [];
  'show-big-win': [number];
  'hide-big-win': [];
  'show-bonus-select': [];
  'show-bonus-summary': [string, number];
  'hide-bonus-overlay': [];
  'select-bonus': [string];
  'ack-bonus-summary': [];
  'grid-update': [string[][]]; // SymbolId grid [reel][row]
  'spin-start': [];
  'spin-stop': [];
  'resize': [];
  'toggle-sound': [];
  'status-message': [string];
};

export class EventBus {
  private ee = new utils.EventEmitter();

  on<K extends keyof UiEvents>(event: K, fn: (...args: UiEvents[K]) => void): this {
    this.ee.on(event, fn as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof UiEvents>(event: K, fn: (...args: UiEvents[K]) => void): this {
    this.ee.off(event, fn as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof UiEvents>(event: K, ...args: UiEvents[K]): boolean {
    return this.ee.emit(event, ...args);
  }
}

export const bus = new EventBus();
