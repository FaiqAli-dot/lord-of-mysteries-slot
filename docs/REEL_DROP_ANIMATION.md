# Reel Drop / Falling Animation Spec (space-fortune `dev`)

Read-only analysis of `origin/dev` (`2da75ac`).  
Primary implementation: `src/components/reelset/sources/modifications/drop/DropReelModification.ts`  
Timing config: `src/components/reelset/resources/configs/timings.json`  
Layout config: `src/components/reelset/resources/configs/config.json`  
Mask config: `src/components/reelset/resources/configs/mask.json`

This game uses a **6×5** grid (6 columns × 5 rows). Formulas are parameterized by `rows` / `reelIndex` / `symbolHeight`, so a **5×4** port keeps the same code with `count: 5` columns and `symbols.count: 4`.

---

## 1. Orchestration (when drops run)

| Phase | Where | What happens |
|-------|--------|----------------|
| Spin button / FSM `SpinStart` | `Reelset.startSpin()` | Only **enables the reel mask**. No symbols move yet. |
| Server result / FSM `SpinStop` | `Reelset.stopSpin(outcome)` | Per reel, **in parallel across columns**: `startSpin()` (drop-out) → then `stopSpin(columnOutcome)` (drop-in). |
| Avalanches | same `stopSpin` loop | Destroy winning symbols → (if more avalanches) enable mask → `addAndFallSymbols(nextWindow)` → disable mask. |

```145:151:src/components/reelset/sources/Reelset.ts
        await Promise.all(
            this.reels.map((reel, column) =>
                reel.startSpin().then(() => {
                    return reel.stopSpin(outcomeAfterSpin[column]);
                }),
            ),
        );
```

There is **no anticipation / scatter-column slow-down** anywhere in the drop modification or reelset stop path. Scatter only triggers landing SFX when a scatter spine is applied (`SymbolView` id `10`).

---

## 2. Geometry constants

### Config JSON (`config.json`)

```json
{
  "reelType": "drop",
  "layout": {
    "reels": {
      "count": 6,
      "indent": 2,
      "symbols": {
        "count": 5,
        "width": 151,
        "height": 148,
        "indent": 2
      }
    }
  }
}
```

### Derived cell size (`ReelView._initializeConfiguration`)

```ts
symbolWidth  = width  + indentX = 151 + 2 = 153
symbolHeight = height + indentY = 148 + 2 = 150
rows         = symbols.count     // 5 (use 4 for 5×4)
columns      = reels.count       // 6 (use 5 for 5×4)
```

### Rest position of a symbol in a column (`_addSymbol`)

Symbols are centered in their cell; **row 0 = top**, increasing downward:

```ts
x = symbolWidth  * 0.5
y = symbolHeight * 0.5 + symbolHeight * row
// restY(row) = H/2 + H*row
```

`SymbolView` applies a static `scale.set(0.75)` at init — **not** animated during fall.

Reel containers are laid out horizontally:

```ts
reel.position.x = reelWidth * reelIndex   // reelWidth = symbolWidth
reel.position.y = 0
```

---

## 3. Timing config (all numeric constants)

`src/components/reelset/resources/configs/timings.json`:

```json
{
  "reelStartDuration": 0.5,
  "reelStartSymbolsDelayCoefficient": 0.5,
  "reelStartDelay": 0.07,
  "easeStart": "power2.in",

  "reelStopDuration": 0.8,
  "reelStopSymbolsDelayCoefficient": 0.3,
  "reelStopDelay": 0.07,
  "easeStop": "elastic(1,1)",

  "avalancheDuration": 1,
  "easeAvalanche": "elastic(1,1)"
}
```

| Key | Value | Used? |
|-----|-------|--------|
| `reelStartDuration` | `0.5` s | Drop-out duration (normal) |
| `reelStartSymbolsDelayCoefficient` | `0.5` | Row stagger inside column (out) |
| `reelStartDelay` | `0.07` s | **Per-column** stagger (out only) |
| `easeStart` | `power2.in` | Drop-out ease (accelerate off-screen) |
| `reelStopDuration` | `0.8` s | Drop-in duration (normal) |
| `reelStopSymbolsDelayCoefficient` | `0.3` | Row stagger inside column (in) |
| `reelStopDelay` | `0.07` s | **Present in JSON but unused** in `DropReelModification` |
| `easeStop` | `elastic(1,1)` | Drop-in bounce |
| `avalancheDuration` | `1` s | Cascade refill duration (normal) |
| `easeAvalanche` | `elastic(1,1)` | Cascade bounce |

### GSAP eases

- **`power2.in`**: quadratic ease-in — symbols accelerate as they leave.
- **`elastic(1,1)`**: GSAP Elastic ease-out with **amplitude = 1**, **period = 1**. This is the only “landing bounce / overshoot”. There is **no** separate squash, scale pulse, or alpha tween on land.

---

## 4. Speed levels (turbo / quick / slam)

From `UIState.spinSpeedLevel` (`src/components/ui/sources/UIState.ts`):

| Level | Condition | Meaning |
|-------|-----------|---------|
| `normal` | default | Config durations + full stagger |
| `fast` | `globalStore.turbo` (quick spin) | Shorter duration, **stagger kept** |
| `very-fast` | `turbo2` **or** slam/Space hold (`isSlamStop` / `isSpacePressed`) | Shortest duration |

### Duration scaling (`getSpinDuration`)

```22:29:src/components/reelset/sources/modifications/drop/DropReelModification.ts
        private getSpinDuration(normalDuration: number): number {
            if (this.isSkipping) return 0.2;
            const level = this.getSpeedLevel();
            // Clear gap: quick ≈ 60% of normal, turbo ≈ 40% of normal (and no stagger).
            if (level === 'very-fast') return Math.min(0.2, normalDuration * 0.4);
            if (level === 'fast') return Math.min(0.4, normalDuration * 0.6);
            return normalDuration;
        }
```

Effective durations:

| Mode | Drop-out (from 0.5) | Drop-in (from 0.8) |
|------|---------------------|---------------------|
| normal | **0.5** | **0.8** |
| fast (quick / turbo) | `min(0.4, 0.5×0.6)` = **0.3** | `min(0.4, 0.8×0.6)` = **0.4** |
| very-fast (turbo2) | `min(0.2, 0.5×0.4)` = **0.2** | `min(0.2, 0.8×0.4)` = **0.2** |
| mid-spin slam (`isSkipping`) | **0.2** forced | **0.2** forced |

### Stagger kill (`shouldSkipDelays`)

```36:43:src/components/reelset/sources/modifications/drop/DropReelModification.ts
        private shouldSkipDelays(): boolean {
            return !!(
                globalStore.turbo2 ||
                this.isSkipping ||
                globalStore.isSpacePressed ||
                globalStore.slamStopHeld
            );
        }
```

When true → **all per-row and per-column delays = 0** (column falls as a block).  
**Quick spin (`turbo` / `fast`) does NOT skip delays** — only shortens duration.

### Slam mid-flight (`onSkip`)

If drop-in is already running (`isFalling && timeline`):

1. Speed up any in-progress win spines (`timeScale = 2.4`).
2. Clear timeline and **rebuild** fall tweens at slam speed (`_buildFallTweens`).
3. Else snap current timeline to end (`progress(1)`).

---

## 5. Drop-out (old symbols leave)

### Motion

For each symbol in `this.symbols` (index `i`, row `symbol.row`):

```ts
from: { y: symbol.y }          // current rest y
to:   {
  y: symbolHeight * symbol.row + symbolHeight / 2 + symbolHeight * rows
  // = restY(row) + rows * symbolHeight
  // falls exactly one full grid height downward
}
duration: fallDuration         // see speed table
ease: timings.easeStart        // "power2.in"
```

**No alpha / scale / x change** during drop-out.

Distance (always): `Δy = rows * symbolHeight`  
Example SF: `5 × 150 = 750` px in reel-local space.

### Stagger order

```ts
delayBetweenSymbols = (fallDuration / rows) * reelStartSymbolsDelayCoefficient
delayBetweenReels   = reelStartDelay * reelIndex
delay(i) = skipDelays ? 0 : delayBetweenReels + (rows - i) * delayBetweenSymbols
```

- **Row order:** bottom starts first, top last  
  (`i = rows-1` smallest delay, `i = 0` largest).
- **Column order:** left → right by `+0.07s` per column index (only when delays not skipped).

### Numeric example — normal, 6×5, `H=150`, `fallDuration=0.5`

```
delayBetweenSymbols = (0.5 / 5) * 0.5 = 0.05
```

| Symbol index (row) | Base delay | Col0 | Col1 | Col2 |
|--------------------|------------|------|------|------|
| 4 (bottom) | 1×0.05 = 0.05 | 0.05 | 0.12 | 0.19 |
| 3 | 0.10 | 0.10 | 0.17 | 0.24 |
| 2 | 0.15 | 0.15 | 0.22 | 0.29 |
| 1 | 0.20 | 0.20 | 0.27 | 0.34 |
| 0 (top) | 0.25 | 0.25 | 0.32 | 0.39 |

`startSpin` returns a `PromiseLast(rows)` that resolves when **all** symbols in that reel finish `onComplete`.

### Sound

- Timeline `onStart`: play `reels_move` only if level === `normal`.
- Timeline `onComplete`: play `reels_stop` if level !== `normal`.

---

## 6. Drop-in (new symbols enter)

Built in `_buildFallTweens(spin)` then played by `stopSpin`.

### Sequence on the timeline

1. Label `ReturnToPool`: `symbol.removeAnimation()` for all.
2. Next (`>`): `setAllSymbols(spin, 'static')` — swap to outcome spines **while still above**.
3. Next (`>`): parallel `fromTo` tweens for each symbol.

### Motion

```ts
restY = symbolHeight * index + symbolHeight / 2     // index == target row
fromY = restY - symbolHeight * rows                 // one full grid above

from: { y: fromY }
to:   {
  y: restY,
  duration: fallDuration,           // getSpinDuration(reelStopDuration)
  ease: timings.easeStop,           // "elastic(1,1)"
  delay: skipDelays ? 0 : (rows - index) * delayBetweenSymbols,
  onStart: () => { symbol.row = index }
}
```

```ts
delayBetweenSymbols = (fallDuration / rows) * reelStopSymbolsDelayCoefficient
```

**Start offset above reel:** exactly `rows * symbolHeight` (SF: 750).  
**Landing bounce:** solely via `elastic(1,1)` overshoot on `y` — no squash.

### Stagger order (drop-in)

Same formula as drop-out rows: **bottom lands first, top last**.  
**No per-column delay** on drop-in (`reelStopDelay` unused).

### Numeric example — normal, rows=5, `fallDuration=0.8`

```
delayBetweenSymbols = (0.8 / 5) * 0.3 = 0.048
```

| Row index | Delay |
|-----------|-------|
| 4 (bottom) | 0.048 |
| 3 | 0.096 |
| 2 | 0.144 |
| 1 | 0.192 |
| 0 (top) | 0.240 |

### Fast (quick) with stagger kept, `fallDuration=0.4`

```
delayBetweenSymbols = (0.4 / 5) * 0.3 = 0.024
→ delays: 0.024, 0.048, 0.072, 0.096, 0.120 (bottom→top)
```

### Sound

On first update of the top symbol (`index === 0`), if normal and not skipping: play `reels_stop`.

---

## 7. Mask and containers

### Layer tree (`src/data/layers.json`)

```
reelset
  └─ reelsMask          (masked during spin / cascade fall)
       └─ reels         (ReelView columns parented here)
```

### Mask creation (`Reelset._createMask`)

```ts
mask = new PIXI.Graphics()
mask.beginFill(0xffffff)
mask.alpha = 0
mask.drawRect(...configs.mask.rect)   // from mask.json
layer.scale.set(0.2)
layer.addChild(mask)
layer.mask = mask
```

`mask.json`:

```json
{ "rect": [-40, -71, 1000, 751] }
```

Pixi rect = `(x, y, width, height)` → local rect origin `(-40, -71)`, size `1000×751`, then the `reelsMask` layer is also scaled (`0.2` in code; layers.json also has a small additive scale).

### When mask is on/off (`Reelset.stopSpin`)

| Moment | Mask |
|--------|------|
| `Reelset.startSpin` (SpinStart) | **enable** |
| After all columns finish drop-in (before pay resolve) | **disable** |
| Before cascade `addAndFallSymbols` | **enable** |
| After cascade fall completes | **disable** |

Purpose: clip symbols while they travel above/below the visible window; disable so win spines / flyouts are not clipped.

### Reel frame

Separate Spine `reelset` at `(0, 575)`, scale `(1, 1.02)`, looping `'animation'` — decorative frame, not the mask.

---

## 8. Anticipation / scatter columns

**Not implemented** for drop timing.

- No extra delay on columns containing scatters.
- No slow-mo / anticipation tween before stop.
- Scatter (`id === 10`) only:
  - plays `scatter_landing_1` when static spine is set;
  - plays `scatter` during win destroy if in a pay cluster.

For a 5×4 port: if you need anticipation, you must add it — this codebase does not provide a reference implementation.

---

## 9. Avalanche / cascade refill

### Loop (`Reelset.stopSpin`)

For each avalanche index:

1. Disable mask.
2. If `pay_items`: `destroyPayItems` on all reels (await win spines), update multiplier UI, emit win HUD.
3. If more avalanches remain: enable mask → `addAndFallSymbols(nextWindow)` on all reels → disable mask.

### Destroy winning symbols (`destroySymbols`)

- `payItem.indexes[reelIndex]` = array of **rows** to remove on that column.
- Matching symbols play Spine `'win'` (timeScale 1 / 1.6 / 2.4 by speed), then are spliced out of `symbols`, removed from display, returned to pool.
- Crash SFX scheduled after: **2500 ms** (normal) / **1100 ms** (fast) / **450 ms** (very-fast) — sound only; removal still waits on spine completion.

### Refill (`addAndFallSymbols`)

```195:248:src/components/reelset/sources/modifications/drop/DropReelModification.ts
        async addAndFallSymbols(nextAvalanche: any): Promise<void> {
            const timings = this.configs.timings;
            const nextSymbols = nextAvalanche[this.reelIndex];
            if (this.symbols.length) {
                nextSymbols.splice(-this.symbols.length);
            }

            nextSymbols.forEach(({ id, row, animation, extra }: any) => {
                const newSymbol = this._addSymbol(-1 - row);
                newSymbol.setAnimation({ id, animation, extra });
            });
            // ... shiftRight so new symbols occupy top rows ...
            // all symbols tween y → restY in parallel (position 0 on timeline)
```

Interpretation:

1. `nextAvalanche[col]` is the **full** next column (top→bottom).
2. Remaining (non-winning) symbols already on the reel correspond to the **bottom** of the new window → those entries are spliced off the end of `nextSymbols`.
3. Only **new** symbols (that fill holes from above) are spawned at rows `-1 - row` (above the mask).
4. Array is rotated (`shiftRight`) so new symbols become the top indices; survivors become bottom indices; `symbol.row = index` updated.
5. **Every** symbol (new + survivor) tweens from its current `y` to its new rest `y` **in parallel** (`timeline` position `0` for all) — survivors slide down into vacated cells; new ones fall from above.

### Cascade duration

```ts
// normal 1.0 → quick 0.55 → turbo 0.28 (hold/slam even snappier)
avalancheDuration =
  spaceHold || turbo2 || slamStopHeld
    ? min(0.18, avalancheDuration * 0.2)     // → 0.18 with config 1.0
  : isSkipping || isSlamStop || very-fast
    ? avalancheDuration * 0.28               // → 0.28
  : fast
    ? avalancheDuration * 0.55               // → 0.55
  : avalancheDuration                        // → 1.0

ease: timings.easeAvalanche   // "elastic(1,1)"
```

**No per-row stagger** on cascade — unlike initial drop-in.

---

## 10. Alpha / scale summary

| Property | Drop-out | Drop-in | Cascade |
|----------|----------|---------|---------|
| `y` | yes | yes | yes |
| `x` | no | no | no |
| `alpha` | no | no | no |
| `scale` | no (static 0.75 on SymbolView) | no | no |
| Bounce | none | `elastic(1,1)` | `elastic(1,1)` |
| Squash | none | none | none |

---

## 11. Reproduce on a 5×4 grid (Pixi + GSAP)

### Config

```json
{
  "reelType": "drop",
  "layout": {
    "reels": {
      "count": 5,
      "indent": 2,
      "symbols": {
        "count": 4,
        "width": <yourCellW>,
        "height": <yourCellH>,
        "indent": 2
      }
    }
  }
}
```

Keep `timings.json` values identical unless art-direction changes.

### Formulas (copy)

```ts
const H = symbolHeight; // height + indent
const R = rows;         // 4

// DROP OUT
const fallOut = getSpinDuration(0.5);
const dSymOut = (fallOut / R) * 0.5;
const dCol    = 0.07 * colIndex;
for (let i = 0; i < R; i++) {
  const delay = skipDelays ? 0 : dCol + (R - i) * dSymOut;
  gsap.fromTo(sym[i], { y: sym[i].y }, {
    y: H * i + H / 2 + H * R, // or use symbol.row
    duration: fallOut,
    ease: 'power2.in',
    delay,
  });
}

// DROP IN
const fallIn = getSpinDuration(0.8);
const dSymIn = (fallIn / R) * 0.3;
for (let i = 0; i < R; i++) {
  const restY = H * i + H / 2;
  const fromY = restY - H * R;
  const delay = skipDelays ? 0 : (R - i) * dSymIn;
  gsap.fromTo(sym[i], { y: fromY }, {
    y: restY,
    duration: fallIn,
    ease: 'elastic(1,1)',
    delay,
  });
}

// CASCADE (after removing winners)
const dur =
  holdOrTurbo2 ? Math.min(0.18, 1 * 0.2) :
  slamOrVeryFast ? 1 * 0.28 :
  quick ? 1 * 0.55 : 1;
symbols.forEach((s, i) => {
  gsap.fromTo(s, { y: s.y }, {
    y: H * i + H / 2,
    duration: dur,
    ease: 'elastic(1,1)',
  }); // all at t=0
});
```

### Speed helpers (mirror)

```ts
function getSpinDuration(normal: number, skipping: boolean, level: 'normal'|'fast'|'very-fast') {
  if (skipping) return 0.2;
  if (level === 'very-fast') return Math.min(0.2, normal * 0.4);
  if (level === 'fast') return Math.min(0.4, normal * 0.6);
  return normal;
}
```

### Mask

Clip the reels container while falling; unclip for win presentations. Size the rect to your 5×4 frame (SF reference rect `[-40,-71,1000,751]` is for the 6×5 art).

---

## 12. Key file quote index

| File | Role |
|------|------|
| `.../drop/DropReelModification.ts` | All fall tweens, slam rebuild, avalanche |
| `.../configs/timings.json` | Durations, coefficients, eases |
| `.../configs/config.json` | Grid + cell size |
| `.../configs/mask.json` | Mask rect |
| `.../view/ReelView.ts` | Symbol spawn / rest Y / base stubs |
| `.../Reelset.ts` | Mask toggle, start/stop orchestration, cascade loop |
| `.../view/SymbolView.ts` | Win timeScale 1 / 1.6 / 2.4; no fall scale |
| `.../ui/sources/UIState.ts` | `spinSpeedLevel` |
| `.../fsm/sources/states/SpinStart.ts` | Enable mask only |
| `.../fsm/sources/states/SpinStop.ts` | Runs full drop + avalanches |

---

## 13. Worked timeline (one normal spin, col 0, 5 rows)

```
t=0.000  bottom (row4) starts drop-out (power2.in, 0.5s)
t=0.050  row3 out
t=0.100  row2 out
t=0.150  row1 out
t=0.200  row0 out
t≈0.700  last out completes → drop-in begins
t=0.700  bottom (row4) starts drop-in from y=restY-5H (elastic, 0.8s)
t=0.748  row3 in
t=0.796  row2 in
t=0.844  row1 in
t=0.892  row0 in
t≈1.500  elastic settle finishes (approx; elastic may ring past duration end)
```

Columns 1…N start their drop-out `+0.07s` later each; drop-in has no column offset.

---

*Generated read-only from `origin/dev`. No commits or PRs.*
