# RTP Methodology — Lord of the Mysteries (Sefirah Castle Sanctum)

## Target

- **Total RTP:** 96.00%
- **Tolerance:** ±1.00 percentage points (`GAME_CONFIG.rtpTolerance`)
- **Math-model band (Super Bonus / overall):** ~96.00%–96.45%
- **Category contribution targets (tuning goals, not separate pools):**
  - Base-game wins: 50.00%
  - All bonus modes: 30.00%
  - Sequence progression: 10.00% (long-horizon / cheat-unlocked; see notes)
  - Spirituality effects: 6.00%

## Attribution convention (mutually exclusive)

Every credited unit belongs to **exactly one** category:

| Category | What it receives |
|---|---|
| **BASE** | Line + scatter credits from base-game spins after Fool's Mirror wild multipliers, **before** Sequence uplift and Spirituality incremental uplift. |
| **BONUS** | All credits awarded inside Tarot Club / Crimson Moon / Fool's Miracles (1× portion of bonus-spin line wins, cascade increments, multiplier-card increments). |
| **SEQUENCE** | Only the **incremental** credits from Sequence multiplier above 1× on **base-game** spins (`credits × mult − credits`). Permanent Potion Bottle meter; does **not** reset after bonuses; does **not** inflate bonus-mode payouts. |
| **SPIRITUALITY** | Only the **incremental** credits caused by Spirituality grid modifications (Grafting neighbor→highest-pay cluster, Blind Stupidity 2–4 low→high upgrades, Creeping Hunger Glove+Monster respin delta). |

## Simulation

```bash
npm run simulate                 # default 200k spins
npm run simulate:quick           # 100k spins
npm run simulate:smoke           # 100k spins, seed 7 (CI)
npx tsx scripts/simulate.ts --spins 200000 --seed 7
npx tsx scripts/simulate.ts --spins 500000 --seed 7
npx tsx scripts/simulate.ts --spins 1000000 --seed 7 --theory
```

The simulator:

- Uses the **same** `resolveSpin` pipeline and `gameConfig`
- Plays full bonus lifecycles matching `SlotGame.bonusSpin` (Mode A sticky tarot + multiplier cards; Mode B avalanche cascades; Fool’s Miracles 3×3 throne + Historical Void)
- Enforces mode max-win caps (5,000× / 12,500× / 25,000×)
- Does **not** reset Sequence after bonuses (permanent Potion ladder)
- Exits **non-zero** when measured RTP is outside `rtpTolerance` (CI gate)
- Reports RTP, 95% CI, hit frequency, bonus frequencies, volatility, max win, percentiles, category RTP

## Theoretical / analytic notes

Full exact enumeration of 5 reel strips with stateful Sequence/Spirituality/bonuses is not practical. We provide:

1. **Base-only Monte Carlo** (`--theory`): Sequence locked at 1×, Spirituality disabled, no bonuses — estimates pure line+scatter+wild RTP.
2. **Full Monte Carlo**: complete game including stateful features.

Claimed 96% is only valid when full Monte Carlo (sufficient N) falls within tolerance of 0.96.

## Honesty policy

Never omit losing spins, never exclude bonus wagers/payouts, never manipulate results. If measured RTP ≠ 96.00%, report the measured value and discrepancy.

## Calibrated config highlights

| Lever | Value |
|---|---|
| `payScale` | **3.0** (line pays use `Math.round`) |
| Spirituality threshold | **16** |
| Blind Stupidity | **2–4** low→high upgrades |
| Grafting | Orthogonal cluster → highest-paying neighbor (Wild never downgrades) |
| Sequence | Permanent; base-game mult only; sparse Potion Bottle; steep `potionsRequired` ladder (2× at 4500+) so CI horizons stay near 1× unless cheats jump tiers |
| Mode B cascades | **1→2→4→8→16** |
| Mode caps | 5,000× / 12,500× / 25,000× |

## CI smoke — 100,000 spins, seed 7, bet 20

| Metric | Value |
|---|---|
| RTP | **95.5341%** |
| 95% CI | [91.6199%, 99.4482%] |
| Δ vs 96.00% | **−0.4659 pp** (within ±1.0 pp) |
| Hit frequency | 63.021% |
| Losing-spin frequency | 36.979% |
| Volatility (σ of win/bet) | 6.32 |
| Max win (observed) | 673.15× bet |
| p50 / p90 / p95 / p99 / p99.9 (×bet) | 0.35 / 1.7 / 2.85 / 7.9 / 76.2 |

**RTP attribution:**

| Category | Measured | Target |
|---|---|---|
| BASE | 64.69% | 50.00% |
| BONUS | 27.29% | 30.00% |
| SEQUENCE | 0.00% | 10.00% |
| SPIRITUALITY | 3.55% | 6.00% |

**Bonus trigger frequencies (per base spin):**

| Mode | Frequency | Avg payout (credits @ bet 20) |
|---|---|---|
| Tarot Club | 0.2890% | 1317 |
| Crimson Moon | 0.3270% | 523 |
| Fool's Miracles | 0.0000%* | — |

\*5-scatter Super Bonus is intentionally rare on these strips; cheats force entry for QA.

**Spirituality activations:** 3,802 / 100,000 (~3.8%). Mix ≈ Grafting 49% / Blind Stupidity 49% / Creeping Hunger 2%.

## Cross-check — 200,000 spins, seed 7, bet 20

| Metric | Value |
|---|---|
| RTP | **96.2082%** |
| 95% CI | [93.3132%, 99.1031%] |
| Δ vs 96.00% | **+0.2082 pp** (within ±1.0 pp) |
| Hit frequency | 62.994% |
| Volatility (σ of win/bet) | 6.61 |
| Max win (observed) | 673.15× bet |
| p50 / p90 / p95 / p99 / p99.9 (×bet) | 0.35 / 1.7 / 2.85 / 7.95 / 74.7 |

**RTP attribution:** BASE 64.73% / BONUS 27.99% / SEQUENCE 0.00% / SPIRITUALITY 3.49%.

**Bonus frequencies:** Tarot 0.3025% (avg 1316) · Crimson 0.3265% (avg 513) · Fool’s Miracles 0.0000% at N=200k.

## Sequence category note

Natural Potion Bottle density + steep `potionsRequired` keep Sequence at **1×** across CI horizons (20k–200k), so measured SEQUENCE RTP ≈ 0%. The **10% SEQUENCE allocation** is a long-horizon / cheat-unlocked design target (Magician→LotM multipliers remain fully wired and testable via Cheats). Raising natural Sequence EV without a reset would push long-run RTP well above 96% because the meter is permanent.

## Limitations

- 200k spins is useful but not proof of convergence; 1e6+ recommended before commercial certification.
- Tarot choice in sim alternates Tarot/Crimson on 3-scatter; 4-scatter auto-enters Crimson Moon; players may bias Mode A.
- Creeping Hunger can still land new Scatters on respun cells (protected specials preserved).
- Hard max-win caps are enforced per bonus mode in engine.
- CI smoke is **100k / seed 7**; shorter N can swing several points.
