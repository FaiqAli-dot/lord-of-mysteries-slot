# Reel drop animation (config-driven)

Visual-only falling/drop transition inspired by Space Fortune. **No cascades, no math changes.**

## Config

`src/ui/configs/reelDrop.json` — durations, easings, stagger, quick/turbo clamps.

## Flow

1. Host requests spin / bonus spin (engine/server result first).
2. `PixiStage.playDropToGrid(grid, mode)` reads config and runs:
   - **drop-out**: old symbols fall one cell height (`power2.in`)
   - texture swap to result grid
   - **drop-in**: new symbols fall from one cell above (`elastic.out`)
3. Stagger: bottom row first, top last; per-column delay from config.
4. Modes: `normal` | `quick` (turbo level 1) | `turbo`/`slam` (zero stagger, clamp duration).

When `REEL_DROP_ANIMATION.md` arrives from the reference, only the JSON (and optional ease name mapping) should need retuning.
