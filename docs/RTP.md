# RTP Methodology — Pathways of the Sealed

## Target

- **Total RTP:** 96.00%
- **Tolerance:** ±0.50 percentage points (configurable `GAME_CONFIG.rtpTolerance`)
- **Category contribution targets (not separate pools):**
  - Base-game wins: 50.00%
  - All bonus modes: 30.00%
  - Sequence progression: 10.00%
  - Spirituality effects: 6.00%

## Attribution convention (mutually exclusive)

Every credited unit belongs to **exactly one** category:

| Category | What it receives |
|---|---|
| **BASE** | Line + scatter credits from base-game spins after Fool's Mirror wild multipliers, **before** Sequence uplift and Spirituality incremental uplift. |
| **BONUS** | All credits awarded inside Tarot Club / Crimson Moon / Fool's Miracles, including the 1× portion of bonus-spin line wins and Tarot pick credits. Bonus-mode multipliers (moon / miracle) **increments** are BONUS. |
| **SEQUENCE** | Only the **incremental** credits from Sequence multiplier above 1× (`floor(credits × mult) − credits`). Applies in base and bonus. |
| **SPIRITUALITY** | Only the **incremental** credits caused by Spirituality grid modifications (Grafting, Glove, Locked Wild, Creeping Hunger respin delta). Blind Stupidity is visual-only → 0 incremental. Sequence uplift on the spirituality increment is attributed to SEQUENCE. |

**Gross feature influence** (non-exclusive) can be measured separately as: total credits on spins where Sequence mult > 1, or where Spirituality activated — these overlap with BASE/BONUS and must not be summed into RTP.

## Simulation

```bash
npm run simulate                 # default 200k spins
npm run simulate:quick           # 100k spins
npx tsx scripts/simulate.ts --spins 1000000 --seed 1577009918 --theory
```

The simulator:

- Uses the **same** `resolveSpin` pipeline and `gameConfig`
- Plays full bonus lifecycles (auto-picks Tarot; auto-chooses Tarot/Crimson on alternate choice triggers)
- Includes retriggers (capped), Sequence, Spirituality, Locked Wilds
- Reports RTP, 95% CI, hit frequency, bonus frequencies, volatility, max win, percentiles, category RTP

## Theoretical / analytic notes

Full exact enumeration of 5 reel strips (~60^5 ≈ 7.8×10^8) with stateful Sequence/Spirituality/bonuses is not practical. We provide:

1. **Base-only Monte Carlo** (`--theory`): Sequence locked at 1×, Spirituality disabled, no bonuses — estimates pure line+scatter+wild RTP.
2. **Full Monte Carlo**: complete game including stateful features.

Claimed 96% is only valid when full Monte Carlo (sufficient N) falls within tolerance of 0.96. Category targets are tuning goals; if they conflict with gameplay rules, parameters (strip composition, pays, bonus weights) are adjusted — rules are not silently changed.

## Honesty policy

Never omit losing spins, never exclude bonus wagers/payouts, never manipulate results. If measured RTP ≠ 96.00%, report the measured value and discrepancy.

## Latest measured results (engine v1 / payScale 1.18)

### Monte Carlo — 1,000,000 base spins (seed 7, bet 20)

| Metric | Value |
|---|---|
| RTP | **95.9791%** |
| 95% CI | [95.0613%, 96.8969%] |
| Δ vs 96.00% | **−0.0209 pp** (within ±1.0 pp tolerance) |
| Hit frequency | 61.563% |
| Losing-spin frequency | 38.437% |
| Volatility (σ of win/bet) | 4.68 |
| Max win | 285.6× bet |
| p50 / p90 / p95 / p99 / p99.9 (×bet) | 0.1 / 1.65 / 3.2 / 16.9 / 66 |

**RTP attribution (mutually exclusive):**

| Category | Measured | Target |
|---|---|---|
| BASE | 46.61% | 50.00% |
| BONUS | 31.73% | 30.00% |
| SEQUENCE | 12.33% | 10.00% |
| SPIRITUALITY | 5.31% | 6.00% |

**Bonus trigger frequencies (per base spin):**

| Mode | Frequency | Avg payout (credits @ bet 20) |
|---|---|---|
| Tarot Club | 0.511% | 868 |
| Crimson Moon | 0.509% | 417 |
| Fool's Miracles | 0.0046% | 421 |

### Theoretical base-only approx (`--theory`, 2M samples)

Sequence locked at 1×, Spirituality disabled, no bonuses:

- Line RTP ≈ 43.77%
- Scatter RTP ≈ 2.28%
- Combined base-only ≈ **46.04%**

Stateful Sequence / Spirituality / bonus EV make up the remainder toward ~96% in the full Monte Carlo.
