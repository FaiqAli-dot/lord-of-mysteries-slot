# RTP Methodology — Pathways of the Sealed

## Target

- **Total RTP:** 96.00%
- **Tolerance:** ±1.00 percentage points (`GAME_CONFIG.rtpTolerance`)
- **Category contribution targets (tuning goals, not separate pools):**
  - Base-game wins: 50.00%
  - All bonus modes: 30.00%
  - Sequence progression: 10.00%
  - Spirituality effects: 6.00%

## Attribution convention (mutually exclusive)

Every credited unit belongs to **exactly one** category:

| Category | What it receives |
|---|---|
| **BASE** | Line + scatter credits from base-game spins after Fool's Mirror wild multipliers, **before** Sequence uplift and Spirituality incremental uplift. |
| **BONUS** | All credits awarded inside Tarot Club / Crimson Moon / Fool's Miracles, including the 1× portion of bonus-spin line wins and Tarot pick credits. Bonus-mode multipliers (moon / miracle / tarot) **increments** are BONUS. |
| **SEQUENCE** | Only the **incremental** credits from Sequence multiplier above 1× (`floor(credits × mult) − credits`). Applies in base and bonus. |
| **SPIRITUALITY** | Only the **incremental** credits caused by Spirituality grid modifications (Grafting neighbor→highest-pay cluster, Blind Stupidity 2–4 low→high upgrades, Creeping Hunger Glove+Monster respin delta). Sequence uplift on the spirituality increment is attributed to SEQUENCE. |

## Simulation

```bash
npm run simulate                 # default 200k spins
npm run simulate:quick           # 100k spins
npm run simulate:smoke           # 20k spins, seed 7 (CI)
npx tsx scripts/simulate.ts --spins 500000 --seed 7
npx tsx scripts/simulate.ts --spins 1000000 --seed 7 --theory
```

The simulator:

- Uses the **same** `resolveSpin` pipeline and `gameConfig`
- Plays full bonus lifecycles matching `SlotGame.bonusSpin` (Tarot = reel spins **+** gathering picks; Crimson / Miracles = free spins + retriggers)
- Includes Sequence reset after every completed bonus
- Reports RTP, 95% CI, hit frequency, bonus frequencies, volatility, max win, percentiles, category RTP

### Known historical simulator bug (fixed)

Prior to this redesign pass, the Tarot Club path in `simulator.ts` awarded **pick credits only** and **returned before Sequence reset**. That understated Tarot reel EV and **inflated Sequence** (meter climbed across Tarot triggers). Live `SlotGame.bonusSpin` always reset Sequence; docs that cited ~96% @ 1e6 under the old sim are **not comparable** to post-fix runs.

## Theoretical / analytic notes

Full exact enumeration of 5 reel strips with stateful Sequence/Spirituality/bonuses is not practical. We provide:

1. **Base-only Monte Carlo** (`--theory`): Sequence locked at 1×, Spirituality disabled, no bonuses — estimates pure line+scatter+wild RTP.
2. **Full Monte Carlo**: complete game including stateful features.

Claimed 96% is only valid when full Monte Carlo (sufficient N) falls within tolerance of 0.96.

## Honesty policy

Never omit losing spins, never exclude bonus wagers/payouts, never manipulate results. If measured RTP ≠ 96.00%, report the measured value and discrepancy.

## Baseline (pre-redesign) — 100,000 spins, seed 7, bet 20

Captured **before** Tarot sim fix / Spirituality retune / Sequence retune (Blind + Grafting already pay-affecting):

| Metric | Value |
|---|---|
| RTP | **108.4239%** |
| 95% CI | [105.41%, 111.44%] |
| Hit frequency | 62.868% |
| Volatility σ | 4.86 |
| Max win | 186.0× bet |
| BASE / BONUS / SEQUENCE / SPIRITUALITY | 47.63% / 30.18% / 13.51% / **17.11%** |

Spirituality far above the 6% allocation after Blind Stupidity became a real upgrade and Grafting became seed+neighbor Wilds.

## Final (post-redesign) — 500,000 spins, seed 7, bet 20

Config highlights: see `GAME_CONFIG` — Blind Stupidity upgrades **2–4** lows; Grafting morphs an orthogonal cluster into the **highest-paying** neighbor symbol; Sequence is permanent (base-game mult only).

| Metric | Value |
|---|---|
| RTP | **95.1862%** |
| 95% CI | [93.8023%, 96.5702%] |
| Δ vs 96.00% | **−0.8138 pp** (within ±1.0 pp tolerance) |
| Hit frequency | 62.695% |
| Losing-spin frequency | 37.305% |
| Volatility (σ of win/bet) | 4.99 |
| Max win (observed) | 687.3× bet (observation, not a hard cap) |
| p50 / p90 / p95 / p99 / p99.9 (×bet) | 0.1 / 1.5 / 3 / 16.6 / 71.5 |

**RTP attribution:**

| Category | Measured | Target |
|---|---|---|
| BASE | 45.95% | 50.00% |
| BONUS | 33.30% | 30.00% |
| SEQUENCE | 10.45% | 10.00% |
| SPIRITUALITY | 5.49% | 6.00% |

**Bonus trigger frequencies (per base spin):**

| Mode | Frequency | Avg payout (credits @ bet 20) |
|---|---|---|
| Tarot Club | 0.5086% | 968 |
| Crimson Moon | 0.4936% | 410 |
| Fool's Miracles | 0.0040% | 306 |

**Spirituality activations:** 24,955 / 500,000 base spins (~5.0%). Effect mix skewed toward Glove / Locked Wild / Hunger after weight retune.

### Cross-check — 200,000 spins, seed 7

RTP **95.5295%** (Δ −0.47 pp) under an intermediate `payScale` 1.14 run during tuning; final documented figure is the **500k / payScale 1.155** row above.

## Limitations

- 500k spins is useful but not proof of convergence; 1e6+ recommended before commercial certification.
- Tarot choice in sim alternates Tarot/Crimson; players may bias one mode.
- Hunger can still **land new Scatters** on respun cells (existing Scatters/Sequence/Spirit preserved).
- No hard max-win cap is enforced in engine.
- CI smoke (`simulate:smoke`, 20k) can swing several points; use ≥200k for tuning decisions.
