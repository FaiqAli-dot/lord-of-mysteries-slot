import './pluginApi';
import type { GameUiConfig } from './pluginApi';
import { GAME_CONFIG, SYMBOLS, type SymbolId } from '../config/gameConfig';
import { detectLayout, type LayoutKind } from './sizeConfig';

/** Game → plugin RPC (errors swallowed, matching UIController.externalUiCall). */
export function externalUiCall(id: string, method: string, ...args: unknown[]): unknown {
  try {
    return window.externalUi?.call?.(id, method, ...args);
  } catch {
    return undefined;
  }
}

/** Guide: await vueReady with ~3s timeout race. */
export async function waitForHostUi(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!window.externalUi && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 40));
  }
  if (window.vueReady) {
    await Promise.race([
      window.vueReady,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } else {
    await new Promise((r) => setTimeout(r, Math.min(400, timeoutMs)));
  }
}

/**
 * Startup after vueReady (Load.onExit order):
 * setGameConfig → setMode (via resizeExternalUi) → show
 */
export function initPluginHud(lang = 'en'): void {
  const cfg: GameUiConfig = {
    width: 2048,
    height: 1080,
    lang,
    gameName: 'pathways-of-the-sealed',
    scatterID: 'SCATTER',
    wildID: 'WILD',
    bonusID: null,
    maximumFractionDigits: 0,
    lobbyOnly: false,
  };
  externalUiCall('game_ui', 'setGameConfig', cfg);
  resizeExternalUi();
  externalUiCall('game_ui', 'show');

  externalUiCall('turbo-on-button', 'hide');
  externalUiCall('turbo-fast-button', 'hide');
  externalUiCall('turbo-off-button', 'show');
  externalUiCall('spin-stop-button', 'hide');
  externalUiCall('autoplay-stop-button', 'hide');
  externalUiCall('fs-amount', 'hide');
  externalUiCall('fs-text', 'hide');
  externalUiCall('auto-amount', 'hide');
  externalUiCall('auto-text', 'hide');
}

/** LayerManager.resizeExternalUi → game_ui.setMode */
export function resizeExternalUi(kind: LayoutKind = detectLayout()): void {
  if (kind === 'portrait') externalUiCall('game_ui', 'setMode', 'mobile', 'portrait');
  else if (kind === 'landscape') externalUiCall('game_ui', 'setMode', 'mobile', 'landscape');
  else externalUiCall('game_ui', 'setMode', '', '');
}

export function setBalanceText(n: number): void {
  externalUiCall('balance-amount', 'setText', formatCredits(n));
}

export function setBetText(n: number): void {
  const t = formatCredits(n);
  externalUiCall('bet-amount', 'setText', t);
  externalUiCall('bet-amount-popup', 'setText', t);
  externalUiCall('ui-help-popup', 'setBet', n);
}

export function setWinText(n: number): void {
  if (n <= 0) {
    externalUiCall('win-amount', 'setText', '');
    externalUiCall('win-amount', 'hide');
  } else {
    externalUiCall('win-amount', 'show');
    externalUiCall('win-amount', 'setText', formatCredits(n));
  }
}

export function updateBetButtons(bet: number, min: number, max: number): void {
  externalUiCall('minus-button', bet <= min ? 'disable' : 'enable');
  externalUiCall('plus-button', bet >= max ? 'disable' : 'enable');
  externalUiCall('minus-button-popup', bet <= min ? 'disable' : 'enable');
  externalUiCall('plus-button-popup', bet >= max ? 'disable' : 'enable');
}

export function setSpinEnabled(enabled: boolean): void {
  externalUiCall('spin-button', enabled ? 'enable' : 'disable');
  if (enabled) {
    externalUiCall('autoplay-button', 'enable');
  } else {
    externalUiCall('autoplay-button', 'disable');
  }
}

export function spinActive(active: boolean): void {
  if (active) {
    externalUiCall('spin-button', 'hide');
    externalUiCall('spin-stop-button', 'show');
    externalUiCall('spin-stop-button', 'enable');
    externalUiCall('plus-button', 'disable');
    externalUiCall('minus-button', 'disable');
    externalUiCall('autoplay-button', 'disable');
  } else {
    externalUiCall('spin-stop-button', 'hide');
    externalUiCall('spin-button', 'show');
  }
}

/**
 * Turbo levels per guide:
 * 0 off → turbo-off; 1 quick → turbo-fast (+ settings turbo true); 2 max → turbo-on
 */
export function setTurboLevel(level: 0 | 1 | 2): void {
  externalUiCall('turbo-off-button', level === 0 ? 'show' : 'hide');
  externalUiCall('turbo-fast-button', level === 1 ? 'show' : 'hide');
  externalUiCall('turbo-on-button', level === 2 ? 'show' : 'hide');
  try {
    externalUiCall('ui-popup-settings', 'setToggle', 'turbo', level === 1);
  } catch {
    /* optional */
  }
}

export function setAutoplayActive(active: boolean, remaining?: number): void {
  if (active) {
    externalUiCall('autoplay-button', 'hide');
    externalUiCall('autoplay-stop-button', 'show');
    externalUiCall('auto-amount', 'show');
    externalUiCall('auto-text', 'show');
    if (remaining != null) externalUiCall('auto-amount', 'setText', String(remaining));
    externalUiCall('info-board', 'show');
    externalUiCall('info-board', 'setText', 'Autoplay active');
  } else {
    externalUiCall('autoplay-stop-button', 'hide');
    externalUiCall('autoplay-button', 'show');
    externalUiCall('auto-amount', 'hide');
    externalUiCall('auto-text', 'hide');
    externalUiCall('info-board', 'hide');
  }
}

export function setSoundToggles(musicOn: boolean, soundOn: boolean): void {
  externalUiCall('ui-popup-settings', 'setToggle', 'music', musicOn);
  externalUiCall('ui-popup-settings', 'setToggle', 'sound', soundOn);
  externalUiCall('music-on-button', musicOn ? 'show' : 'hide');
  externalUiCall('music-off-button', musicOn ? 'hide' : 'show');
}

export function showPaytableInPlugin(): void {
  const css = `.pathways-paytable{color:#eee;font-family:Montserrat,sans-serif;padding:calc(var(--game-ui-percent) * 2);max-width:42rem}
      .pathways-paytable table{width:100%;border-collapse:collapse;margin:0.75rem 0}
      .pathways-paytable td,.pathways-paytable th{border-bottom:1px solid #555;padding:0.35rem;text-align:left;vertical-align:top}
      .pathways-paytable h2,.pathways-paytable h3{margin:0.6rem 0 0.35rem;font-weight:600}
      .pathways-paytable p,.pathways-paytable li{line-height:1.45;opacity:0.92}
      .pathways-paytable ul{padding-left:1.1rem;margin:0.4rem 0}`;

  const payIds = (Object.keys(SYMBOLS) as SymbolId[]).filter(
    (id) => SYMBOLS[id].tier === 'high' || SYMBOLS[id].tier === 'low',
  );
  const payRows = payIds
    .map((id) => {
      const d = SYMBOLS[id];
      return `<tr><td>${d.name}</td><td>3×${d.pays[0]}</td><td>4×${d.pays[1]}</td><td>5×${d.pays[2]}</td></tr>`;
    })
    .join('');

  const specialRows = (['WILD', 'SCATTER', 'SEQUENCE', 'SPIRIT'] as SymbolId[])
    .map((id) => {
      const d = SYMBOLS[id];
      const role =
        id === 'WILD'
          ? 'Substitutes for paying symbols; may expand a reel (2× on lines that use it). Never substitutes for Pathway Gate, Sequence Sigil, or Spirit Ember.'
          : id === 'SCATTER'
            ? '3–4 open a bonus choice (Tarot Club or Crimson Moon). 5+ start Fool’s Miracles. Pays 2× / 8× / 40× total bet for 3 / 4 / 5.'
            : id === 'SEQUENCE'
              ? 'Breaks paylines. Does not advance the Sequence Resonance meter.'
              : 'Charges Spirituality (+1 each on the grid). Breaks paylines.';
      return `<tr><td>${d.name}</td><td>${role}</td></tr>`;
    })
    .join('');

  const spiritEffects = GAME_CONFIG.spirituality.effects
    .map((e) => `<li><strong>${e.name}</strong> — ${e.description}</li>`)
    .join('');

  const seqTiers = GAME_CONFIG.sequence.tiers
    .map((t) => `${t.multiplier}× at ${t.winsRequired}+ paying spins`)
    .join(' · ');

  externalUiCall('ui-help-popup', 'addPage', {
    html: `<div class="pathways-paytable"><h2>${GAME_CONFIG.title}</h2>
      <p>5×4 · 20 fixed paylines · left-to-right · ${GAME_CONFIG.demoLabel}</p>
      <p>Pays below are line-bet multiples (total bet ÷ 20), before the global pay scale.</p>
      <table><thead><tr><th>Symbol</th><th>3</th><th>4</th><th>5</th></tr></thead><tbody>${payRows}</tbody></table></div>`,
    css,
  });
  externalUiCall('ui-help-popup', 'addPage', {
    html: `<div class="pathways-paytable"><h2>Special symbols</h2>
      <table><thead><tr><th>Symbol</th><th>What it does</th></tr></thead><tbody>${specialRows}</tbody></table></div>`,
    css,
  });
  externalUiCall('ui-help-popup', 'addPage', {
    html: `<div class="pathways-paytable"><h2>Meters</h2>
      <h3>${GAME_CONFIG.sequence.displayName}</h3>
      <p>${GAME_CONFIG.sequence.displayHint}</p>
      <p>Tiers: ${seqTiers}. Cap ${GAME_CONFIG.sequence.maxMultiplier}×.</p>
      <h3>${GAME_CONFIG.spirituality.displayName}</h3>
      <p>${GAME_CONFIG.spirituality.displayHint}</p>
      <p>Threshold: ${GAME_CONFIG.spirituality.threshold}. Effects (one per awakening):</p>
      <ul>${spiritEffects}</ul></div>`,
    css,
  });
  externalUiCall('ui-help-popup', 'addPage', {
    html: `<div class="pathways-paytable"><h2>Bonus rounds</h2>
      <h3>${GAME_CONFIG.bonuses.tarotClub.name}</h3>
      <p>${GAME_CONFIG.bonuses.tarotClub.selections} gathering free spins. Each spin pays on the reels, then draws one random gathering reward (credits, session multiplier, wild enhance, or extra spin). Rewards are random — not player decisions.</p>
      <h3>${GAME_CONFIG.bonuses.crimsonMoon.name}</h3>
      <p>${GAME_CONFIG.bonuses.crimsonMoon.spins} free spins. Sticky Wild cells accumulate (cap ${GAME_CONFIG.bonuses.crimsonMoon.maxStickyWildCells}). Wild expansion is off. Moon multiplier starts at ${GAME_CONFIG.bonuses.crimsonMoon.moonMultStart}×, steps every ${GAME_CONFIG.bonuses.crimsonMoon.moonMultStepEvery} paying spins, caps at ${GAME_CONFIG.bonuses.crimsonMoon.moonMultCap}×. Retriggers capped.</p>
      <h3>${GAME_CONFIG.bonuses.foolsMiracles.name}</h3>
      <p>${GAME_CONFIG.bonuses.foolsMiracles.spins} free spins with forced Wild expansion. Miracle multiplier starts at ${GAME_CONFIG.bonuses.foolsMiracles.miracleMultStart}×, steps every ${GAME_CONFIG.bonuses.foolsMiracles.miracleMultStepEvery} paying spins, caps at ${GAME_CONFIG.bonuses.foolsMiracles.miracleMultCap}×. Triggered by 5+ Pathway Gates.</p>
      <p>No extra wager in bonus. ${GAME_CONFIG.sequence.displayName} resets when a bonus ends.</p></div>`,
    css,
  });
  externalUiCall('ui-help-popup', 'show');
  externalUiCall('overlay', 'show');
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
  /** Toolbar turbo button → cycle 0→1→2→0 */
  onTurboCycle: () => void;
  /** Settings turbo toggle → level 0↔1 only */
  onTurboToggle: (on: boolean) => void;
  onSoundToggle: (kind: 'music' | 'sound', on: boolean) => void;
  onSoundVolume: (vol0to100: number) => void;
  onPaytable: () => void;
  onPopupStatus: (popup: string, isOpen: boolean) => void;
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
      case 'autoplay-button':
        externalUiCall('ui-popup-autoplay', 'show');
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
    if (d?.item === 'turbo') h.onTurboToggle(!!d.state);
    if (d?.item === 'music' || d?.item === 'sound') h.onSoundToggle(d.item, !!d.state);
  };

  const onSettingsBtn = (ev: Event) => {
    const action = (ev as CustomEvent).detail as string;
    if (action === 'paytable') h.onPaytable();
  };

  const onSoundRange = (ev: Event) => {
    const v = Number((ev as CustomEvent).detail);
    if (Number.isFinite(v)) h.onSoundVolume(v);
  };

  const onPopupStatus = (ev: Event) => {
    const d = (ev as CustomEvent).detail as { popup?: string; isOpen?: boolean };
    if (d?.popup) h.onPopupStatus(d.popup, !!d.isOpen);
  };

  window.addEventListener('ui-button-click', onButton);
  window.addEventListener('ui-start-autoplay', onAutoStart);
  window.addEventListener('ui-popup-settings-toggls', onSettingsToggle);
  window.addEventListener('ui-popup-settings-btns', onSettingsBtn);
  window.addEventListener('ui-sound-range', onSoundRange);
  window.addEventListener('status-ui-popups', onPopupStatus);

  return () => {
    window.removeEventListener('ui-button-click', onButton);
    window.removeEventListener('ui-start-autoplay', onAutoStart);
    window.removeEventListener('ui-popup-settings-toggls', onSettingsToggle);
    window.removeEventListener('ui-popup-settings-btns', onSettingsBtn);
    window.removeEventListener('ui-sound-range', onSoundRange);
    window.removeEventListener('status-ui-popups', onPopupStatus);
  };
}
