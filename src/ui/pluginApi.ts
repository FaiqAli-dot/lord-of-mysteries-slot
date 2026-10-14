/** Reverse-engineered types for Ninja `game-ui.js` (Vue GameUI / window.externalUi). */

export type UiPluginMode = '' | 'mobile';
export type UiPluginOrientation = '' | 'portrait' | 'landscape';

export interface GameUiConfig {
  width: number;
  height: number;
  lang?: string;
  gameName?: string;
  scatterID?: string | null;
  wildID?: string | null;
  bonusID?: string | null;
  additionalReel?: unknown;
  maximumFractionDigits?: number;
  lobbyOnly?: boolean;
}

export interface ExternalUiHandle {
  show?: () => void;
  hide?: () => void;
  enable?: () => void;
  disable?: () => void;
  isVisible?: () => boolean;
  isDisabled?: () => boolean;
  setText?: (text: string) => void;
  getText?: () => string;
  setGameConfig?: (cfg: GameUiConfig) => void;
  setMode?: (mode?: UiPluginMode, orientation?: UiPluginOrientation) => void;
  setSymbols?: (symbols: unknown) => void;
  setToggle?: (item: string, state: boolean) => void;
  addPage?: (page: { html: string; css?: string }) => void;
  setBet?: (bet: number) => void;
  setCurrency?: (currency: string) => void;
  setValue?: (n: number) => void;
  toggleMute?: () => void;
  [key: string]: unknown;
}

export interface ExternalUiRegistry {
  _queue: Record<string, Array<() => void>>;
  register: (id: string, api: ExternalUiHandle) => void;
  call: (id: string, method: string, ...args: unknown[]) => unknown;
  [id: string]: unknown;
}

declare global {
  interface Window {
    GameUI?: { initGameUI?: () => Promise<void> | void };
    initGameUI?: () => Promise<void> | void;
    externalUi?: ExternalUiRegistry;
    vueReady?: Promise<void>;
    vueReadyResolve?: () => void;
    __GAME_UI_BASE__?: string;
    __UI_PLUGIN_BASE__?: string;
    __pathwaysApp?: unknown;
  }
}

export {};
