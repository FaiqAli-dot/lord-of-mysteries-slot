# UI Plugin Integration Guide (space-fortune `dev`)

Read-only analysis of branch `origin/dev` (`2da75ac`) vs `origin/main`.  
Fetched plugin assets (HTTP 200):

- `/opt/cursor/artifacts/game-ui.js` (~434 KB, UMD → `window.GameUI` / `window.initGameUI`)
- `/opt/cursor/artifacts/game-ui.css` (~161 KB)

**Goal for consumers:** reproduce the same host-chrome integration in a Vite + TypeScript + Pixi slot. The HTML/plugin contract is **grid-agnostic**. This game’s Pixi reel config is **6 reels × 5 rows** (`src/components/reelset/resources/configs/config.json`); a 5×4 game only needs different Pixi layout numbers — the `externalUi` bridge stays the same.

---

## 1. HTML loader snippet

File: `src/public/index.html`

```html
<canvas id="game-canvas"></canvas>

<style>
  :root {
    --game-ui-width: 0;
    --game-ui-percent: calc(var(--game-ui-width) * 0.01);
  }
  .game-ui:not(.visible) * {
    visibility: hidden !important;
  }
</style>

<script>
  (function () {
    const devUrl = 'https://demo.ninjagaming.com/ui-plugin/';
    const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(location.hostname);
    const base = isLocalhost ? devUrl : location.origin + '/ui-plugin/';

    function appendCss(src) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + src;
      document.head.appendChild(link);
    }
    function appendJs(src) {
      const script = document.createElement('script');
      script.src = base + src;
      script.defer = true;
      document.body.appendChild(script);
    }
    appendCss('game-ui.css');
    appendJs('game-ui.js');
  })();
</script>
```

Also in the same file:

- Viewport: `viewport-fit=cover`, no user scaling.
- Gesture / pinch / dblclick / ctrl-wheel prevention.
- Parent `postMessage` for iframe diagnostics: `iframeError`, `iframeUnhandledRejection`, `iframeConsoleError`.

**Vite equivalent:** put the same `<canvas id="game-canvas">` + loader script in `index.html` (or inject CSS/JS URLs from env). Serve or proxy `/ui-plugin/` in non-localhost builds.

---

## 2. Global bridge: `window.externalUi` / `window.vueReady` / `window.GameUI`

### Types (`src/types/externalUi.d.ts`)

```ts
declare global {
  interface Window {
    externalUi: {
      call(id: string, method: string, ...args: unknown[]): unknown;
      register(id: string, methods: Record<string, Function>): void;
      [key: string]: any;
    };
    vueReady?: Promise<void>;
    vueReadyResolve?: () => void;
  }
}
```

### Plugin bootstrap (from fetched `game-ui.js`)

On load, the UMD bundle:

1. Defines `window.externalUi`:

```js
window.externalUi = {
  _queue: {},
  register(id, methods) {
    this[id] = methods;
    if (this._queue[id]) {
      this._queue[id].forEach((fn) => fn());
      delete this._queue[id];
    }
  },
  call(id, method, ...args) {
    const target = this[id];
    if (target && typeof target[method] === 'function') {
      return target[method](...args);
    }
    // Queue until register(id) runs
    this._queue[id] ||= [];
    this._queue[id].push(() => this.call(id, method, ...args));
  },
};
```

2. Exposes `window.initGameUI` / `GameUI.initGameUI`.
3. Auto-runs `initGameUI` on `DOMContentLoaded` (or after 100ms if already loaded).
4. Creates `#game-ui-root` if missing:

```text
position: fixed; top/left 0; width/height 100%;
pointer-events: none; z-index: 2;
```

5. Mounts the Vue app into `#game-ui-root`.
6. Sets `window.vueReady = new Promise(...)` at App setup; resolves after fonts + first paint (`vueReadyResolve`).

**Important:** early `externalUi.call` before a component `register`s is **queued**, not dropped. Unknown methods on a registered id are also queued forever (e.g. game calls `game_ui.setCurrency`, but only `ui-help-popup` implements `setCurrency`).

Game helper: `UIController.externalUiCall` swallows errors (`src/components/ui/sources/UIController.ts`).

---

## 3. Init / loading sequence

| Step | Where | What |
|------|--------|------|
| 1 | `index.html` | Load `game-ui.css` + deferred `game-ui.js` in parallel with webpack bundle |
| 2 | Plugin | `initGameUI` → mount Vue → register widgets → `vueReady` resolves |
| 3 | FSM `Load.onEnter` | Preload loader assets → `App.createApp()` (Pixi on `#game-canvas`, layer tree) |
| 4 | `Load.onProgress` | Logo loader, network, assets, onboarding; **`await waitForHostUi()`** (`vueReady` race 3s timeout) |
| 5 | `Load.onExit` | `createGame()` → **`ui.init()`** (`UIController`) → configure + show host UI |
| 6 | Resize | Every `LayerManager.onResize` calls `game_ui.setMode(...)` |

### Critical `Load.onExit` block (`src/components/fsm/sources/states/Load.ts`)

```ts
window.externalUi?.call?.('ui-help-popup', 'setCurrency', currency);
window.externalUi?.call?.('game_ui', 'setGameConfig', {
  width: 2048,
  height: 1080,
  lang: App.$instance.network.serverAdapter.lang,
  gameName: 'space-fortune',
});
LayerManager.onResize();
window.externalUi?.call?.('game_ui', 'show');
// bet pushed via eventEmitter 'update-bet' (multiple times for race safety)
```

### `App.createGame` (`src/components/game/sources/App.ts`)

```ts
this.game = new Game();
this.ui.init(); // UIController + UIIndicators + HelpPage + Music
this.eventEmitter.emit('update-balance', globalStore.balance);
this.eventEmitter.emit('update-bet', this.network.bet);
await this.game.initialize(); // reelset, bonus, celebration, etc.
```

`UI.ts` comment: *“Host game-ui bridge; Pixi chrome is owned by `ui-plugin`.”*

---

## 4. `game_ui` API (root host control)

Registered by plugin App:

| Method | Args | Effect |
|--------|------|--------|
| `show` | — | Sets visible; CSS `.game-ui` / wrapper shown |
| `hide` | — | Hides chrome (replay panel uses this) |
| `isVisible` | — | `boolean` |
| `setGameConfig` | config object | See below |
| `setMode` | `(platform, orientation)` | Desktop vs mobile layout |
| `setSymbols` | `Array<{ id: string; image: string }>` | Base64 PNG map for help/paytable |

### `setGameConfig(config)`

```ts
{
  width: number;              // design width, SF uses 2048
  height: number;             // design height, SF uses 1080
  lang?: string;              // default "en" — drives i18n
  gameName?: string;          // e.g. "space-fortune"
  scatterID?: string | null;
  wildID?: string | null;
  bonusID?: string | null;
  additionalReel?: unknown | null;
  maximumFractionDigits?: number; // default 2 (autoplay cost math)
  lobbyOnly?: boolean;        // default false — strips most chrome
}
```

Desktop mode scales the fixed `width×height` wrapper with `transform: scale(min(vw/w, vh/h))` centered. Mobile mode sets wrapper to `100% × 100dvh` and recomputes `--game-ui-width`.

### `setMode(platform, orientation)`

Called from `LayerManager.resizeExternalUi()`:

| Game layout | Call |
|-------------|------|
| Portrait mobile | `setMode('mobile', 'portrait')` |
| Landscape mobile | `setMode('mobile', 'landscape')` |
| Desktop | `setMode('', '')` |

Adds CSS classes on `.ui-wrapper`: `mobile`, `portrait`, and/or `landscape` (array joined).

### `setSymbols` from game (`UIController.addSymbolsInUI`)

Extracts Pixi `symbols` / `all_symbols` sheet textures → canvas → `toDataURL('image/png')` in batches of 5, then:

```ts
await window.externalUi.call('game_ui', 'setSymbols', results);
// results: { id: textureKey, image: 'data:image/png;base64,...' }[]
```

---

## 5. Widget IDs the game calls

### Buttons (`enable` / `disable` / `show` / `hide` / `isVisible` / `isDisabled`)

| id | Notes |
|----|--------|
| `spin-button` | Idle spin |
| `spin-stop-button` | Slam / skip while spinning |
| `plus-button` / `minus-button` | Bet change (opens bet popup) |
| `plus-button-popup` / `minus-button-popup` | Inside bet popup |
| `autoplay-button` / `autoplay-stop-button` | Autoplay |
| `settings-button` | Opens settings |
| `turbo-off-button` / `turbo-fast-button` / `turbo-on-button` | 3-level turbo cycle |
| `music-on-button` / `music-off-button` | Toolbar mute icon pair (show/hide toggles which face) |
| `fullscreen-on-button` / `fullscreen-off-button` | Hidden on Apple devices |
| `buy-bonus-button` / `double-chance-button` / `ante-bet-button` | Optional; SF replay mask hides if present |

Click path: plugin dispatches `CustomEvent('ui-button-click', { detail: buttonId })`.

Also handled though not registered as a button id: **`max-bet`** (from bet popup Max).

### Text widgets (`show` / `hide` / `setText` / `getText` / `rescaleToFit`)

| id | Use |
|----|-----|
| `balance-amount` / `balance-text` | Balance |
| `win-amount` / `win-text` | Win / “TOTAL WIN” in FS |
| `bet-amount` / `bet-amount-popup` | Bet |
| `fs-amount` / `fs-text` | Free spins left |
| `auto-amount` / `auto-text` | Autoplay counter |
| `info-board` | Banner text (e.g. autoplay activated) — also `setText` |

`setText(value, mode?)` — optional second arg `"compactNumber"` in plugin (game usually passes formatted money strings).

### Popups / composites

| id | Methods used by game |
|----|----------------------|
| `game_ui` | `show`, `hide`, `setGameConfig`, `setMode`, `setSymbols` |
| `ui-popup-settings` | `show`, `hide`, `setToggle(item, boolean)`, `isVisible` |
| `ui-popup-autoplay` | `show`, `hide`, `disable`, `isVisible` |
| `ui-bet-popup` | `show`, `hide`, `isVisible` |
| `ui-help-popup` | `show`, `hide`, `addPage({html,css})`, `setBet(number)`, `setCurrency(code)`, `isVisible` |
| `ui-sound-range` | `show`, `hide`, `setValue(0–100)`, `isVisible` |
| `overlay` | Used internally by plugin when opening settings |
| `ui-history` | Plugin-internal history table (`setData`); SF opens custom replay instead |
| `ui-popup-inactivity` | Plugin inactivity watchdog |
| `elapsed-time` | Plugin session timer |

### Settings toggles (`setToggle` / events)

| item | Meaning |
|------|---------|
| `music` | Music channel on/off |
| `sound` | SFX channel on/off |
| `turbo` | “Quick spin” (maps to turbo level 1) |
| `intro_screen` | Intro / onboarding preference |

---

## 6. Events / callbacks / postMessage (both directions)

### Plugin → Game (`window` `CustomEvent`)

| Event | `detail` | Game handler |
|-------|----------|--------------|
| `ui-button-click` | `string` button id | `UIController.handleUIButton` |
| `ui-popup-settings-btns` | `'paytable' \| 'history' \| …` | Settings actions → help / replay |
| `ui-popup-settings-toggls` | `{ item, state }` | Music/SFX/turbo/intro |
| `ui-start-autoplay` | rounds as string/number | Start autoplay |
| `ui-get-history` | page number (plugin history) | SF: closes settings → `openGameReplayFlow()` |
| `ui-other-buttons` | e.g. `autoplay-select`, `settings-close`, `help-page-*` | Click SFX |
| `status-ui-popups` | `{ popup, isOpen }` | Disables Pixi `root.interactiveChildren` when open |
| `ui-sound-range` | volume 0–100 | `Music` applies volumes |
| `ui-reset-buttons` | `{ buttonId }` | Plugin-internal (clear hover/active) |
| `ui-session-inactive` | — | Plugin fires on idle timeout; **SF game does not listen** |

### Game → Plugin

Primarily `externalUi.call(...)`. Also game re-dispatches `ui-button-click` for Space key → spin/stop.

### Plugin ↔ Parent lobby (`postMessage`)

| Direction | type | Notes |
|-----------|------|--------|
| Plugin → parent | `LOBBY_MINIMIZE` | Opening embedded lobby overlay |
| Parent → plugin | `CLOSE_LOBBY` | Close overlay |
| Parent → plugin (relay) | `LAUNCH_GAME` | Relayed to parent if nested |

### Game → Parent (iframe diagnostics, `index.html`)

`iframeError`, `iframeUnhandledRejection`, `iframeConsoleError`.

### Internal game emitters synced to plugin

| Emitter | UI effect |
|---------|-----------|
| `update-bet` | bet texts + ± enable/disable + `ui-help-popup.setBet` |
| `update-balance` | `balance-amount.setText` |
| `update-win` / `update-win-animated` / `accumulate-win` / `reset-win` | win amount |
| `show-fs-left` / `update-fs-left` / `update-freespins-amount` | FS labels; hide autoplay count |
| `freespins-toolbar-hide` / `show` | Autoplay vs FS toolbar |
| `toggle-on/off-spin-button` | `UIController.updateButtons` |
| `start-autospins` / `stop-autospins` / `update-autospins-counter` | Autoplay chrome |
| `spin-in-progress` | Flag for Space/slam |
| `mute-sounds` / `set-music-volume` / `set-sfx-volume` | Audio |

---

## 7. Feature-by-feature contract

### Spin

1. Plugin: click `spin-button` → `ui-button-click`.
2. Game: funds check → `FSM.setCurrentState('Spin')` → `spinActive(true)`:
   - hide `spin-button`, show `spin-stop-button`
   - disable autoplay / ± (unless PFR rules)
3. Stop / slam: `spin-stop-button` or Space → `slam-stop` + `skip` if slam enabled.
4. End: `spinActive(false)` / `updateButtons(false)`.

### Bet change

- `plus-button` / `minus-button` → `network.increaseBet/decreaseBet` + show `ui-bet-popup` + SFX.
- Popup ± and `max-bet` same without re-showing popup.
- `update-bet` refreshes `bet-amount`, popup amount, ± disable at min/max, `ui-help-popup.setBet(bet)` (bet/1000 for help coefficients).

### Balance / win

- Balance: formatted via `serverAdapter.formatMoney`.
- Replay watch: balance forced to `****`.
- Win amount hidden when 0; label switches to localized “TOTAL WIN” during free spins.

### Autoplay

1. Idle + `autoplay-button` toggles `ui-popup-autoplay`.
2. Plugin consent → `ui-start-autoplay` with round count.
3. Game sets `globalStore.autoSpin`, starts Spin, shows info-board + auto counter + stop button.
4. Stop: `autoplay-stop-button` or `stop-autospins`.
5. PFR free-spinning: autoplay button starts remaining PFR spins (no popup).

### Turbo (3 levels)

| Level | Flags | Visible button | Settings `turbo` toggle |
|-------|-------|----------------|-------------------------|
| 0 | turbo=false | `turbo-off-button` | false |
| 1 quick | turbo=true, turbo2=false | `turbo-fast-button` (fallback `turbo-on`) | true |
| 2 max | turbo=true, turbo2=true | `turbo-on-button` | false |

Cycles on toolbar turbo clicks; settings toggle only maps to level 0↔1.

### Sound

- Toolbar music buttons toggle `ui-sound-range` visibility.
- Slider → `ui-sound-range` event → volumes + optional settings toggle sync.
- Settings `music` / `sound` toggles → `mute-sounds`.
- Persistence: `localStorage` keys `SoundsVolume`, `MusicMute`, `SFXMute`.

### Settings / paytable / history

- Settings open: `ui-popup-settings.show`.
- Paytable: `ui-popup-settings-btns` detail `paytable` → `HelpPage.ensureRegistered()` → `ui-help-popup.show`.
- Help pages: game calls `ui-help-popup.addPage({ html, css })` for **game-specific** pages; plugin already appends How to Play + General Rules.
- History: settings `history` or `ui-get-history` → SF custom HTML replay (`openGameReplayFlow`), not plugin `ui-history.setData`.

### Free spins / bonus

- Pixi still owns bonus buy UI, FS intro/outro, celebrations.
- Host FS text/amount via indicators; spin ± disabled while PFR free spinning.
- Toolbar hide/show events prevent autoplay count overlapping FS label.

### Errors / inactivity

- Insufficient funds: game ECL popup (not plugin).
- Plugin inactivity (~30 min default, override `?inactivity_ms=`): closes popups, fake-clicks autoplay-stop + spin-stop, fires `ui-session-inactive`, shows inactivity modal.

### Replay watch mask

`applyReplayWatchExternalToolbarMask()` (`src/components/replay/replayWatchExternalUi.ts`): show bar, hide spin/autoplay/settings/turbo/bonus, disable ±, mask balance, sync win/FS.

---

## 8. What the plugin renders vs Pixi

| Responsibility | Owner |
|----------------|--------|
| Spin / stop / bet ± / autoplay / turbo / settings / sound / fullscreen | **Plugin (HTML/Vue)** |
| Balance / win / bet / FS / autoplay counters + bottom plate | **Plugin** |
| Settings / autoplay / bet / help / sound-range / overlay / inactivity | **Plugin** |
| Reels, symbols, drops, win lines / cluster anims | **Pixi** |
| Background spines | **Pixi** |
| Logo spine | **Pixi** |
| Celebration / big win overlays | **Pixi** |
| Free-spin intro/outro | **Pixi** |
| Buy bonus / double chance (in-canvas) | **Pixi** |
| Onboarding / loader logo | **Pixi** |
| History spin strip | **Pixi** |
| Custom replay panel | **Game HTML** (not plugin) |
| Help paytable pages (HTML fragments + CSS) | **Game → plugin `addPage`** |

Pixi layer names `ui_buttons` / `ui_info` still exist in `layers.json` for legacy positioning math; chrome interaction is on the HTML layer (`z-index: 2`, canvas below).

---

## 9. Canvas layout vs plugin UI

### Design sizes (`src/utils/SizeConfig.ts`)

| Mode | Logical size |
|------|----------------|
| Desktop / landscape | **2048 × 1080** |
| Portrait mobile | **1080 × 1080** |

Must match `setGameConfig({ width: 2048, height: 1080 })` for desktop chrome scaling.

### Pixi stage (`LayerManager.onResize`)

1. Read `visualViewport` (fallback body rect).
2. `scaleFactor = min(vw/configW, vh/configH)`.
3. Renderer resized to full window; stage centered with pivot at config center.
4. Per-layer x/y/scale from `src/data/layers.json` (`$[NNww|wh|sw|sh|…]` units).
5. Call `game_ui.setMode`.

### Reel container / logo (game-specific overrides in `LayerManager`)

**Desktop landscape**

- `reelset`: position `(975, 495)`, scale `0.95`
- `multiplier`: `(970, 435)`, scale `0.95`
- `logo` (from layers.json): `(228, 265)`, scale `-0.73` (additive scale semantics)

**Portrait mobile (base)**

- `reelset`: `(455, 380)`, scale `0.9`
- `multiplier`: `(480, 327)`, scale `(0.85, 0.9)`
- Logo y depends on device height / available UI slot:
  - large mobile: `(542, 10)` or `(542, 20)` if height ≥ 900
  - smaller: `(542, -60)`
  - cramped (`uiLayerButtons.y` thresholds): further y/scale adjustments; reel scale down to `0.85` / `0.75`
- Logo scale: `0.2` if width ≥ 500 && height ≤ 1400, else `0.35`

**Mobile landscape**

- Shifts `ui_buttons` / `ui_info` y using letterbox math; reel defaults from layers.json center.

`layers.json` portrait defaults for reelset: `x: $[39sw], y: $[26sh], scale: -0.15` before JS overrides.

### Plugin chrome positioning

- `#game-ui-root`: full viewport, `pointer-events: none` (children re-enable clicks).
- `.ui-wrapper`: desktop fixed center + scale; mobile `100% × 100dvh`, no transform.
- CSS vars: `--game-ui-width` (px), `--game-ui-percent` (= width × 0.01). Help pages in the game also use `--game-ui-percent`.
- Orientation modifiers: `.ui-wrapper.portrait|landscape|desktop-portrait`.
- Bottom bar controls use `%` on desktop and `calc(var(--game-ui-percent) * N)` on mobile (spin lower-right, settings lower-left, bet plate lower-right, etc.).
- Portrait-only `.mob-text-plate` gradient strip at bottom.

### Safe areas

- HTML sets `viewport-fit=cover`.
- **Fetched `game-ui.css` does not use `env(safe-area-inset-*)`.** Layout is percentage / `--game-ui-*` based. Notch devices rely on bottom % padding and mobile `100dvh`, not explicit safe-area insets.
- Game may further push logo/reels when `uiLayerButtons.y` is small (proxy for short usable height).

### Canvas stacking

```text
#game-canvas          → Pixi (full window, under UI)
#game-ui-root z-index:2 → Vue chrome (pointer-events none root)
```

No CSS size on `#game-canvas` in `index.html`; Pixi renderer owns width/height.

---

## 10. Fetched plugin public API & DOM summary

### Public JS surface

| Global | Role |
|--------|------|
| `window.GameUI` | UMD export namespace |
| `window.initGameUI` / `GameUI.initGameUI` | Mount Vue UI |
| `window.externalUi` | `register` / `call` / queued RPC |
| `window.vueReady` | Promise resolved when UI ready |
| `window.__gameUiMobileLobbyDebug` | Lobby debug helper |
| `window.__gameUiApplyCatalogGameSettings` | Catalog settings helper |

### DOM structure (simplified)

```text
#game-ui-root
  └─ .ui-wrapper[.mobile][.portrait|.landscape]
       └─ .ui-container[.ui-container--lobby-only]
            ├─ img.ui-plate
            ├─ buttons: .spin-button, .spin-stop-button, .plus-button, .minus-button,
            │           .autoplay-button, .autoplay-stop-button, .settings-button,
            │           .turbo-*-button, .music-button, .fullscreen-button, …
            ├─ .ui-container__balance-wrapper → balance text widgets
            ├─ .ui-container__win-wrapper
            ├─ .ui-container__fs-wrapper
            ├─ .ui-container__auto-wrapper
            ├─ .info-board
            ├─ .ui-popup-settings / .ui-popup-autoplay / .ui-bet-popup
            ├─ .ui-help-popup / .ui-history / .ui-sound-range
            ├─ .overlay
            ├─ .mob-text-plate
            └─ (lobby / inactivity overlays as siblings)
```

Hidden until `game_ui.show` (game CSS: `.game-ui:not(.visible) * { visibility: hidden }`).

### CSS design tokens

- `--game-ui-width`, `--game-ui-percent` (and `*-points` variants set from JS).
- Fonts loaded from plugin `/fonts` (Montserrat, Roboto, NotoSansJavanese).

---

## 11. Minimal reproduction checklist (Vite + TS + Pixi, e.g. 5×4)

1. Copy HTML loader + `--game-ui-*` CSS vars + `#game-canvas`.
2. Wait for `window.vueReady` (timeout ~3s).
3. After session/lang known:

```ts
externalUi.call('game_ui', 'setGameConfig', {
  width: 2048, height: 1080, lang, gameName: 'your-game',
});
externalUi.call('game_ui', 'setMode', /* ''|mobile */, /* ''|portrait|landscape */);
externalUi.call('game_ui', 'show');
```

4. Listen for `ui-button-click`, settings, autoplay, sound-range, `status-ui-popups`.
5. Drive balance/bet/win/FS/spin chrome via `externalUi.call`.
6. Optionally `setSymbols` + `ui-help-popup.addPage` for paytable.
7. Keep Pixi responsible for reels/background/wins; size stage to 2048×1080 (landscape) / 1080×1080 (portrait) and leave bottom ~10–15% for HTML chrome.
8. Re-tune only Pixi reel/logo positions for a 5×4 grid — do not change the plugin RPC.

---

## 12. `dev` vs `main` — UI-related diff

**Headline:** `main` had in-Pixi UI chrome; `dev` moves chrome to host `ui-plugin` and adds replay/history.

| Area | Change |
|------|--------|
| `src/public/index.html` | Adds ui-plugin loader, `--game-ui-*` vars, `.game-ui:not(.visible)`, gesture guards |
| `src/types/externalUi.d.ts` | **New** bridge typings |
| `UI.ts` / `UIController.ts` | Reworked into thin host bridge + event handlers (~plugin RPC) |
| `UIIndicators.ts`, `HelpPage.ts`, `settings/Music.ts` | **New** host-driven indicators / help / volume |
| `Load.ts` | `vueReady` wait, `setGameConfig` / `show`, bet push |
| `LayerManager.ts` | `visualViewport`, `resizeExternalUi` → `setMode`, portrait/desktop reel/logo overrides |
| `src/components/replay/**` | **New** replay panel + external UI mask |
| Help HTML/CSS under `ui/resources/help-pages/` | **New** pages injected into plugin |
| Legacy Pixi button/popup configs & spritesheets | Still in repo / manifest; interaction path is HTML |

`git diff --stat origin/main...origin/dev` for UI-touched paths: ~150 files, large churn in `UIController`, `LayerManager`, `index.html`, replay, help pages.

---

## 13. Key file index

| Path | Role |
|------|------|
| `src/public/index.html` | Loader + CSS vars |
| `src/types/externalUi.d.ts` | Globals |
| `src/components/ui/sources/UI.ts` | `ui.init()` |
| `src/components/ui/sources/UIController.ts` | All button/settings/autoplay/turbo RPC |
| `src/components/ui/sources/UIIndicators.ts` | Balance/win/FS |
| `src/components/ui/sources/HelpPage.ts` | `addPage` paytable |
| `src/components/ui/sources/settings/Music.ts` | Volume slider bridge |
| `src/components/fsm/sources/states/Load.ts` | Host UI bring-up |
| `src/components/game/sources/LayerManager.ts` | Canvas layout + `setMode` |
| `src/components/game/sources/App.ts` | Pixi app + `createGame` |
| `src/data/layers.json` | Layer tree positions |
| `src/utils/SizeConfig.ts` | 2048×1080 / 1080×1080 |
| `src/components/reelset/resources/configs/config.json` | **6×5** reel grid |
| `src/components/replay/replayWatchExternalUi.ts` | Replay toolbar mask |

---

*Generated from read-only inspection of `origin/dev` and live fetch of `https://demo.ninjagaming.com/ui-plugin/{game-ui.js,game-ui.css}`. No commits or PRs were created.*
