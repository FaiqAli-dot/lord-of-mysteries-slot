# Reel drop animation

Implements [REEL_DROP_ANIMATION.md](./REEL_DROP_ANIMATION.md) (space-fortune `dev` drop modification) for our **5×4** grid.

## Config

`src/ui/configs/reelDrop.json` — mirrors SF `timings.json` + 5×4 layout port.

| Key | Value | Role |
|-----|-------|------|
| `reelStartDuration` | 0.5 | Drop-out |
| `reelStartSymbolsDelayCoefficient` | 0.5 | Row stagger out |
| `reelStartDelay` | 0.07 | Per-column stagger (out only) |
| `easeStart` | `power2.in` | |
| `reelStopDuration` | 0.8 | Drop-in |
| `reelStopSymbolsDelayCoefficient` | 0.3 | Row stagger in |
| `easeStop` | `elastic(1,1)` | Landing bounce |

## Formulas (5×4)

```
H = height + indent     // from reelDrop.json (desktop: 138+2 = 140)
R = 4
Δy = R * H              // one full grid
dSymOut = (fallOut / R) * 0.5
dSymIn  = (fallIn  / R) * 0.3
delayOut(col,row) = col*0.07 + (R-row)*dSymOut   // bottom first; +0.07s/col
delayIn(row)      = (R-row)*dSymIn               // no column delay
```

Speed: quick → `min(0.4, d*0.6)` keep stagger; turbo/slam → zero stagger, durations clamped to 0.2s.

## Flow

1. Spin result arrives (engine/server).
2. Enable reel mask.
3. Per column in parallel: drop-out → swap column textures → drop-in.
4. Disable mask. No cascades; no math changes.
