import './pluginApi';
import type { GameUiConfig, UiPluginOrientation } from './pluginApi';
import { GAME_CONFIG, SYMBOLS, type SymbolId } from '../config/gameConfig';

const DESKTOP = { width: 2048, height: 1080 };

function call(id: string, method: string, ...args: unknown[]): unknown {
  return window.externalUi?.call?.(id, method, ...args);
}

export async function waitForPlugin(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (!window.externalUi) {
    if (Date.now() - start > timeoutMs) throw new Error('ui-plugin externalUi not available');
    await new Promise((r) => setTimeout(r, 50));
  }
  if (window.vueReady) {
    await Promise.race([
      window.vueReady,
      new Promise((_, rej) => setTimeout(() => rej(new Error('vueReady timeout')), timeoutMs)),
    ]);
  } else {
    // Plugin may still be mounting
    await new Promise((r) => setTimeout(r, 300));
  }
  // Ensure game_ui handle exists
  while (Date.now() - start < timeoutMs) {
    try {
      const vis = call('game_ui', 'isVisible');
      if (typeof vis === 'boolean' || vis === undefined) break;
    } catch {
      /* retry */
    }
    if (window.externalUi && 'game_ui' in window.externalUi) break;
    await new Promise((r) => setTimeout(r, 50));
  }
}

export function initPluginHud(): void {
  const cfg: GameUiConfig = {
    width: DESKTOP.width,
    height: DESKTOP.height,
    lang: 'en',
    gameName: GAME_CONFIG.title,
    scatterID: 'SCATTER',
    wildID: 'WILD',
    bonusID: null,
    maximumFractionDigits: 0,
    lobbyOnly: false,
  };
  call('game_ui', 'setGameConfig', cfg);
  applyPluginMode();
  call('game_ui', 'show');
  // Idle turbo = off visible
  call('turbo-on-button', 'hide');
  call('turbo-fast-button', 'hide');
  call('turbo-off-button', 'show');
  call('spin-stop-button', 'hide');
  call('autoplay-stop-button', 'hide');
  call('fs-amount', 'hide');
  call('fs-text', 'hide');
  call('auto-amount', 'hide');
  call('auto-text', 'hide');
}

export function applyPluginMode(): void {
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  if (w < 900) {
    const orientation: UiPluginOrientation = h >= w ? 'portrait' : 'landscape';
    call('game_ui', 'setMode', 'mobile', orientation);
  } else {
    call('game_ui', 'setMode', '', '');
  }
}

export function setBalanceText(n: number): void {
  call('balance-amount', 'setText', formatCredits(n));
}

export function setBetText(n: number): void {
  call('bet-amount', 'setText', formatCredits(n));
  call('bet-amount-popup', 'setText', formatCredits(n));
}

export function setWinText(n: number): void {
  call('win-amount', 'setText', formatCredits(n));
}

export function setSpinEnabled(enabled: boolean): void {
  call('spin-button', enabled ? 'enable' : 'disable');
  call('plus-button', enabled ? 'enable' : 'disable');
  call('minus-button', enabled ? 'enable' : 'disable');
}

export function setSpinningUi(spinning: boolean): void {
  if (spinning) {
    call('spin-button', 'hide');
    call('spin-stop-button', 'show');
    call('spin-stop-button', 'enable');
  } else {
    call('spin-stop-button', 'hide');
    call('spin-button', 'show');
  }
}

export function setTurboLevel(level: 0 | 1 | 2): void {
  call('turbo-off-button', level === 0 ? 'show' : 'hide');
  call('turbo-on-button', level === 1 ? 'show' : 'hide');
  call('turbo-fast-button', level === 2 ? 'show' : 'hide');
  try {
    call('ui-popup-settings', 'setToggle', 'turbo', level > 0);
  } catch {
    /* optional */
  }
}

export function setAutoplayActive(active: boolean, remaining?: number): void {
  if (active) {
    call('autoplay-button', 'hide');
    call('autoplay-stop-button', 'show');
    call('auto-amount', 'show');
    call('auto-text', 'show');
    if (remaining != null) call('auto-amount', 'setText', String(remaining));
  } else {
    call('autoplay-stop-button', 'hide');
    call('autoplay-button', 'show');
    call('auto-amount', 'hide');
    call('auto-text', 'hide');
  }
}

export function setSoundToggles(musicOn: boolean, soundOn: boolean): void {
  try {
    call('ui-popup-settings', 'setToggle', 'music', musicOn);
    call('ui-popup-settings', 'setToggle', 'sound', soundOn);
  } catch {
    /* optional before mount */
  }
}

export function showPaytableInPlugin(): void {
  const ids = (Object.keys(SYMBOLS) as SymbolId[]).filter(
    (id) => SYMBOLS[id].tier === 'high' || SYMBOLS[id].tier === 'low',
  );
  const rows = ids
    .map((id) => {
      const d = SYMBOLS[id];
      return `<tr><td>${d.name}</td><td>3×${d.pays[0]}</td><td>4×${d.pays[1]}</td><td>5×${d.pays[2]}</td></tr>`;
    })
    .join('');
  call('ui-help-popup', 'addPage', {
    html: `<div class="pathways-paytable"><h2>${GAME_CONFIG.title}</h2>
      <p>5×4 · 20 paylines · demo credits only</p>
      <table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Wild substitutes. Scatter does not. Sequence & Spirituality meters are on the game canvas.</p></div>`,
    css: `.pathways-paytable{color:#eee;font-family:Montserrat,sans-serif;padding:1rem}
      .pathways-paytable table{width:100%;border-collapse:collapse}
      .pathways-paytable td,.pathways-paytable th{border-bottom:1px solid #555;padding:0.35rem;text-align:left}`,
  });
  call('ui-help-popup', 'show');
  call('overlay', 'show');
}

function formatCredits(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export type PluginUiHandlers = {
  onSpin: () => void;
  onSpinStop: () => void;
  onBetUp: () => void;
  onBetDown: () => void;
  onMaxBet?: () => void;
  onAutoplayStart: (rounds: number) => void;
  onAutoplayStop: () => void;
  onTurboCycle: () => void;
  onSoundToggle: (kind: 'music' | 'sound', on: boolean) => void;
  onPaytable: () => void;
};

export function bindPluginEvents(h: PluginUiHandlers): () => void {
  const onButton = (ev: Event) => {
    const detail = (ev as CustomEvent).detail as string | { buttonId?: string };
    const id = typeof detail === 'string' ? detail : detail?.buttonId;
    if (!id) return;
    switch (id) {
      case 'spin-button':
        h.onSpin();
        break;
      case 'spin-stop-button':
        h.onSpinStop();
        break;
      case 'plus-button':
      case 'plus-button-popup':
        h.onBetUp();
        break;
      case 'minus-button':
      case 'minus-button-popup':
        h.onBetDown();
        break;
      case 'max-bet':
        h.onMaxBet?.();
        break;
      case 'autoplay-stop-button':
        h.onAutoplayStop();
        break;
      case 'turbo-off-button':
      case 'turbo-on-button':
      case 'turbo-fast-button':
        h.onTurboCycle();
        break;
      default:
        break;
    }
  };

  const onAutoStart = (ev: Event) => {
    const n = Number((ev as CustomEvent).detail);
    if (Number.isFinite(n) && n > 0) h.onAutoplayStart(n);
  };

  const onSettingsToggle = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { item?: string; state?: boolean };
    if (d?.item === 'turbo') {
      // Settings toggle: any change cycles; host maps level 0/1/2 via button clicks primarily.
      h.onTurboCycle();
    }
    if (d?.item === 'music' || d?.item === 'sound') {
      h.onSoundToggle(d.item, !!d.state);
    }
  };

  const onSettingsBtn = (ev: Event) => {
    const action = (ev as CustomEvent).detail as string;
    if (action === 'paytable') h.onPaytable();
  };

  window.addEventListener('ui-button-click', onButton);
  window.addEventListener('ui-start-autoplay', onAutoStart);
  window.addEventListener('ui-popup-settings-toggls', onSettingsToggle);
  window.addEventListener('ui-popup-settings-btns', onSettingsBtn);
  window.addEventListener('resize', applyPluginMode);
  window.addEventListener('orientationchange', applyPluginMode);

  return () => {
    window.removeEventListener('ui-button-click', onButton);
    window.removeEventListener('ui-start-autoplay', onAutoStart);
    window.removeEventListener('ui-popup-settings-toggls', onSettingsToggle);
    window.removeEventListener('ui-popup-settings-btns', onSettingsBtn);
    window.removeEventListener('resize', applyPluginMode);
    window.removeEventListener('orientationchange', applyPluginMode);
  };
}
