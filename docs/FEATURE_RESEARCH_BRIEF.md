# Pathways of the Sealed — Feature Research Brief

**Audience:** Research / investment / product evaluation  
**Product status:** Playable demo (client-side + optional authoritative API)  
**Genre:** Video slot — gothic occult / Lord of the Mysteries–inspired  
**Disclaimer:** Demo credits only. Not real-money gambling. Theme is fan-inspired fantasy, not a licensed title. See `docs/LORE_AND_IP.md` for lore vs mechanics and open IP decisions.

This document describes **what the game does today** (mechanics, features, math posture) so research can judge whether it is worth further design, art, compliance, and commercial investment.

---

## 1. Executive summary

| Item | Detail |
|------|--------|
| Format | 5 reels × 4 rows, **20 fixed paylines**, left-to-right |
| Fantasy pitch | Occult library / sealed pathways — meters, wild expansion, three distinct bonuses |
| Differentiation | Dual persistent meters (**Sequence** + **Spirituality**) plus a **player choice** bonus fork |
| Target RTP | **96.00%** (measured **95.19%** @ 500k spins seed 7 after redesign — see `docs/RTP.md`) |
| Hit frequency (measured) | ~**62.7%** of base spins pay something |
| Volatility (measured) | σ ≈ **5.0** win/bet; max observed ~**687×** bet in that run (observation, not a cap) |
| Build maturity | Shared TypeScript math engine (UI / server / simulator), Vite client, optional Node API, Vitest + Monte Carlo |

**One-line product promise:** A mid-volatility occult slot where long-session progression (Sequence) and periodic chaos events (Spirituality) feed into three different bonus fantasies — gathering, sticky-wild rampage, and forced wild expansion.

---

## 2. Core game structure

### 2.1 Grid & evaluation

- **5×4** visible window.
- **20** fixed paylines (see `PAYLINES` in `src/config/gameConfig.ts`).
- Wins are **left-to-right**, typically **3 / 4 / 5** of a kind on a line.
- Line stake = **total bet ÷ 20**.
- Paytable multiples are scaled by `payScale` (currently **1.18**) for RTP tuning without rewriting every cell.

### 2.2 Symbol set

| Tier | Symbols | Role |
|------|---------|------|
| High | The Fool, Magician, High Priestess, Wheel of Fortune, Hanged Man, The World | Premium line pays |
| Low | Ace, King, Queen, Jack | Volume / fill |
| Special | Fool’s Mirror (**Wild**), Pathway Gate (**Scatter**), Sequence Sigil, Spirit Ember | Features |

**Approximate high pays** (before `payScale`; multiples of **line** bet for 3 / 4 / 5):

| Symbol | 3× | 4× | 5× |
|--------|----|----|-----|
| Fool | 12 | 42 | 120 |
| Magician | 10 | 34 | 100 |
| Priestess | 8 | 26 | 78 |
| Wheel | 6 | 22 | 60 |
| Hanged | 5 | 17 | 48 |
| World | 5 | 14 | 38 |

Lows sit in the **1–24** line-multiple band (3/4/5). Exact tables live in `SYMBOLS` in config.

**Scatter pays** (multiples of **total** bet): 3→2×, 4→8×, 5→40×.

---

## 3. Feature systems (detail)

### 3.1 Fool’s Mirror (Wild)

- Substitutes for paying symbols; **not** for Scatter / Sequence / Spirit.
- **Expansion:** if a reel shows ≥1 Wild and **no** Scatter on that reel, the reel expands to Wild for evaluation (Sequence/Spirit cells preserved).
- Expanded-wild lines get **2×** on that line win (`expandedMultiplier`).
- During **Fool’s Miracles**, expansion is forced.
- During **Crimson Moon**, expansion is **disabled** so sticky wild **cells** stay single-cell.

**Research note:** Classic “expanding wild + multiplier” readability; strong visual identity if art lands Fool’s Mirror clearly.

---

### 3.2 Pathway Gate (Scatter) → bonus routing

| Scatter count | Outcome |
|---------------|---------|
| 3–4 | **Choice:** Tarot Club Gathering **or** Crimson Moon Rampage |
| 5+ | **Fool’s Miracles** (no choice; priority) |

Bonuses are **exclusive** (no stacking). Triggering bet is reused; bonus spins do not charge extra wager.

**Research note:** Choice at 3–4 scatters is a retention / agency beat. 5+ as a rare “direct premium bonus” creates chase mythology.

---

### 3.3 Sequence (persistent multiplier)

A left-side **Sequence meter** tracks cumulative winning combinations since last bonus completion.

| Wins since reset | Multiplier |
|------------------|------------|
| 0 | 1× |
| 200 | 2× |
| 450 | 3× |
| 750 | 5× |
| 1100 | 8× |
| 1500 | 12× |
| 2000+ | **15×** (cap) |

Rules:

- Advances **once per paying winning combination** in a round (line or scatter pay).
- Multiplier applies to eligible credits **before** advancing for the next spin.
- **Persists through bonuses**, then **resets when any bonus completes**.
- UI: when meter is “armed” at higher tiers in Idle, meter pulses; tier-ups show a banner that **next wins are boosted**.

**Research note:** This is the long-session “investment” loop — players feel progress between bonuses. Slow thresholds keep average mult modest (~1.1–1.4 design intent) so RTP doesn’t explode.

---

### 3.4 Spirituality (meter + one of five chaos effects)

A right-side **Spirituality meter** charges toward threshold **12**:

- +1 per **winning spin** (not per line),
- +1 per **Spirit Ember** on the grid,
- Can charge in bonuses (`chargeInBonus: true`),
- Carries into bonus,
- **At most one activation per spin**,
- **Activation is deferred:** filling the meter does **not** fire on the same spin; the **next** spin awakens the effect (or a force-cheat fires immediately). Idle shows a “ready” pulse when the meter is full.

When activated, **exactly one** weighted effect fires (equal weights today = 20 each):

#### Grafting

- Picks a random eligible **seed** cell.
- Seed + **orthogonal neighbors** (up/down/left/right) become **Wild** for that spin.
- Never overwrites Scatter / Sequence / Spirit.
- Optional diagonals exist in config (`diagonals: false` currently).

#### Blind Stupidity

- Upgrades **3** random eligible cells into **high** symbols (Fool / Magician / Priestess / Wheel / Hanged / World).
- Never overwrites Scatter / Sequence / Spirit / Wild.
- **Does change math** (incremental spirituality attribution).
- Presentation: banner + hard pulse/flash on upgraded cells.

#### Creeping Hunger

- **One** respin of non-preserved cells.
- Preserves highs + Wilds (and Scatters for trigger integrity).
- No recursive hunger respins.

#### Glove

- Transforms **one** eligible non-special cell into Wild.
- Cannot transform Scatter / Sequence / Spirit / Wild.

#### Locked Wild

- Places a Wild that lasts **this spin + next** (`durationSpins: 2`), then expires.
- Applied onto subsequent grids before evaluation.

**Research note:** Spirituality is the “slot as event generator” layer — five distinct micro-features from one meter. Good for marketing variety; needs clear VFX so players can tell which event they got.

---

## 4. Bonus modes

### 4.1 Tarot Club Gathering

| Spec | Value |
|------|--------|
| Trigger | Chosen at 3–4 scatters |
| Length | **5** gathering free spins (config `selections`) |
| Reel math | Real `resolveSpin` each spin (same engine as base/server) |
| Extra layer | After each reel result, a **gathering table** draw: credits (3/7/14/28× bet), session ×2, wild enhance, or extra spin (cap +2) |
| Session mult | `tarotRunningMultiplier` applies as bonus multiplier on reel eval |
| End | Summary screen; Sequence resets |

**Fantasy:** Club meeting / card gathering — spins that feel like draws.

### 4.2 Crimson Moon Rampage

| Spec | Value |
|------|--------|
| Trigger | Chosen at 3–4 scatters |
| Spins | **8** free spins |
| Sticky | Each spin may add a sticky wild **cell** (cap 5); expansion **off** |
| Moon mult | Starts 1×; steps every 2 paying spins; cap **2×** |
| Retrigger | 3+ scatters → +2 spins (global retrigger cap 2) |

**Fantasy:** Escalating sticky pressure under a blood moon — readable grid growth.

### 4.3 Fool’s Miracles

| Spec | Value |
|------|--------|
| Trigger | **5+** scatters (direct) |
| Spins | **10** free spins |
| Wilds | **Force expand** all wilds |
| Miracle mult | Starts **2×**; steps every 2 paying spins; cap **5×** |
| Retrigger | 3+ scatters → +2 spins (capped) |

**Fantasy:** Premium “everything expands” celebration — highest spectacle bonus.

---

## 5. Player loop (session feel)

```
Idle → Spin → Drop land → Win pulse / specials
     → Feature reveal (Spirituality / Sequence banners)
     → Big-win celebration (if threshold)
     → Bonus choice or auto Fool’s Miracles
     → Bonus free spins (Tarot / Crimson / Miracles)
     → Bonus summary → Sequence reset → Idle
```

Supporting UX (demo build):

- Host **ui-plugin** chrome (spin / bet / turbo / autoplay / balance) — Space Fortune–style contract.
- Dual meters with ready pulse when next spin is “special.”
- Feature cheats panel (local demo) for research QA: force Spirituality effects, scatters, wild expand, Sequence tiers.

---

## 6. Math & commercial posture

### 6.1 Attribution model

Credits are tagged into **exactly one** bucket for reporting:

| Bucket | Meaning |
|--------|---------|
| BASE | Base spin line/scatter after wild mult, before Sequence/Spirituality deltas |
| BONUS | All in-bonus credits (incl. Tarot gathering credits & bonus line 1× portion) |
| SEQUENCE | Incremental uplift from Sequence mult &gt; 1× |
| SPIRITUALITY | Incremental uplift from Spirituality grid mods |

Category **tuning targets** (not hard pools): Base 50% / Bonus 30% / Sequence 10% / Spirituality 6% of RTP.

### 6.2 Latest published sim snapshot

From `docs/RTP.md` (1e6 base spins, seed 7, bet 20, engine before latest Blind redesign):

| Metric | Value |
|--------|--------|
| RTP | 95.979% |
| Hit rate | 61.56% |
| Volatility σ | 4.68 |
| Max win | 285.6× bet |
| Bonus share of RTP | ~31.7% |

**Action for research:** Re-run `npm run simulate` / `simulate:quick` after Blind Stupidity became a high-upgrade (math-changing) effect — SPIRITUALITY share and total RTP may shift.

### 6.3 Technical risk reducers

- **Single config + pipeline** shared by UI, optional server, and Monte Carlo (`src/engine/pipeline.ts`).
- Optional **authoritative** Node API for regulated paths later.
- Automated tests on paylines, features, reel drop, API smoke.

---

## 7. Investment angle — what to evaluate

### Strengths

1. **Feature density without cluttered base:** meters + wild expand + three bonuses with distinct fantasies.
2. **Choice mechanic** (Tarot vs Crimson) is uncommon vs “one free-spin mode only.”
3. **Progression (Sequence)** supports longer session narratives and “almost at next tier” psychology.
4. **Spirituality event set** is a content flywheel (five named events to theme, animate, market).
5. **Engineering readiness** for math audit (shared engine, attribution, simulator) is ahead of typical prototypes.

### Risks / open questions

1. **Clarity:** Can a new player distinguish Grafting vs Glove vs Locked Wild vs Blind upgrades without a tutorial?
2. **Art / IP:** Theme is LotM-*inspired*; commercial release needs original branding + clearance strategy.
3. **RTP rebalance:** Recent Blind change needs fresh Monte Carlo; Blind high-upgrades can spike short-term variance.
4. **Bonus length / pacing:** Tarot (5) / Crimson (8) / Miracles (10) — validate fatigue vs dopamine with playtests.
5. **Max win / jurisdiction:** Measure theoretical / extreme tails for markets with max-win disclosure rules.
6. **Hit frequency ~62%:** Feels “busy”; some markets prefer lower hit / higher spike — confirm brand fit.

### Suggested research workstreams (if greenlit)

| Priority | Workstream |
|----------|------------|
| P0 | Full Monte Carlo post–Blind redesign; volatility & max-win report |
| P0 | Feature comprehension playtest (5–10 players, unaided) |
| P1 | Art direction pass: wild / scatter / five Spirituality events |
| P1 | Bonus fantasy animatics (choice screen, Gathering, Moon, Miracles) |
| P2 | Compliance / jurisdiction checklist for target launch markets |
| P2 | Monetization packaging (demo → operator SKU) if B2B |

---

## 8. How to verify features locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test
npm run simulate:quick
```

In the demo UI: open **CHEATS** (or `` ` ``) to force Spirituality effects, scatter counts, wild expand, and Sequence tiers without waiting on natural frequency.

Config source of truth: `src/config/gameConfig.ts`  
RTP methodology: `docs/RTP.md`

---

## 9. Document control

| Field | Value |
|-------|--------|
| Title | Pathways of the Sealed — Feature Research Brief |
| Based on | Engine + client as of Oct 2026 feature pass |
| Owner | Product / engineering (update when mechanics change) |
| Related | `README.md`, `docs/RTP.md`, `docs/ASSETS.md` |

When mechanics change (especially Spirituality / bonuses / Sequence tiers), update **this brief** and re-run Monte Carlo before research sign-off.
