# First-party `ui-plugin` (Pixi HUD)

This project’s HUD is **not** the private EJAW `ecl` library and **not** a missing npm `ui-plugin`. It is a first-party module at `src/ui-plugin/` that mirrors the **structure** of [space-fortune-client](https://github.com/FaiqAli-dot/space-fortune-client)’s Pixi UI:

| Reference concept | Our implementation |
|-------------------|--------------------|
| `UIController` + button/popup widgets | `HudView`, `PopupsView` |
| Desktop / Portrait JSON layouts | `configs/layout.json` + `layoutOf()` |
| Layer order `background → reelset → ui_info → ui_buttons → ui_popups` | `LayerManager` (sorted `Container`s) |
| Event bus `update-balance` / `update-win` / `update-bet` / spin toggles | `EventBus.ts` |
| Pixi 7 + GSAP | `pixi.js@7`, `gsap` |

**Not used:** private `ecl` from `git.ejaw.net`, Space Fortune art/audio, or their 6×5 reel layout.

**Kept:** our 5×4 grid, 20 paylines, engine, server API, RTP math, Sequence/Spirituality, bonuses, tests, Pages CI.

Assets load from `public/game-assets/` (copied from `assets/library/`).
