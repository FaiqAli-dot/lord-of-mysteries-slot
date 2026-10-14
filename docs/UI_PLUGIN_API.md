# Ninja `ui-plugin` public API (reverse-engineered)

Source: vendored `public/ui-plugin/game-ui.js` / `game-ui.css` (Vue 3 IIFE → `window.GameUI`).

Space Fortune loads it from `index.html`:

```js
appendCss('game-ui.css'); appendJs('game-ui.js');
// base = localhost ? demo.ninjagaming.com/ui-plugin/ : origin + '/ui-plugin/'
```

## Globals

| Name | Role |
|------|------|
| `window.GameUI` / `GameUI.initGameUI` | Module + mount helper |
| `window.initGameUI()` | Creates `#game-ui-root` (fixed, full viewport, `z-index:2`, `pointer-events:none`) and mounts Vue |
| `window.externalUi` | Registry: `register(id, api)`, `call(id, method, …args)` with queue-until-ready |
| `window.vueReady` | Promise resolved after `game_ui` mounts |
| `window.__GAME_UI_BASE__` | Optional asset base (else derived from `game-ui.js` script URL) |

## Host → plugin (`externalUi.call`)

| Id | Methods |
|----|---------|
| `game_ui` | `show`, `hide`, `setGameConfig({width,height,lang,gameName,scatterID,wildID,bonusID,maximumFractionDigits,lobbyOnly})`, `setMode(''|'mobile', ''\|'portrait'\|'landscape')`, `setSymbols`, `isVisible` |
| `balance-amount` / `bet-amount` / `win-amount` | `setText`, `getText`, `show`/`hide` |
| `spin-button` / `spin-stop-button` / `plus-button` / `minus-button` / turbo\* / autoplay\* | `enable`, `disable`, `show`, `hide` |
| `ui-help-popup` | `show`, `hide`, `addPage({html,css?})`, `setBet`, `setCurrency` |
| `ui-popup-settings` | `show`, `hide`, `setToggle(item, bool)` |
| `overlay` | `show`, `hide` |

Desktop design size default: **2048×1080**.

## Plugin → host (`CustomEvent` on `window`)

| Event | Detail |
|-------|--------|
| `ui-button-click` | `"spin-button"`, `"spin-stop-button"`, `"plus-button"`, `"minus-button"`, `"max-bet"`, turbo/autoplay ids… |
| `ui-start-autoplay` | round count (number) |
| `ui-popup-settings-toggls` | `{ item: 'music'\|'sound'\|'turbo'\|…, state: boolean }` |
| `ui-popup-settings-btns` | `"paytable"`, `"history"`, … |
| `status-ui-popups` | `{ popup, isOpen }` |
| `ui-session-inactive` | inactivity timeout |

## Our integration

- Loader in `index.html` with `VITE_UI_PLUGIN_URL` (remote default `https://demo.ninjagaming.com/ui-plugin/`).
- On GitHub Pages, `origin + '/ui-plugin/'` is **not** used; remote CDN is default; vendored `public/ui-plugin/` is the onerror fallback.
- Game canvas draws BG / 5×4 reels / logo / Sequence & Spirituality meters under the plugin.
- Bonus select / summary / Tarot picks remain first-party overlays (plugin has no LotM bonus UI).
