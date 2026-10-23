# Feature Rules — Pathways of the Sealed

Authoritative plain-language rules. Implementation lives in `src/config/gameConfig.ts` and `src/engine/*`. If this file and the code disagree, **fix the code, then update this file**.

Demo credits only — not real-money gambling.

---

## Grid and pays

- **5 reels × 4 rows**, **20 fixed** left-to-right paylines.
- Line stake = total bet ÷ 20.
- Pays for 3 / 4 / 5 of a kind on a line (high and low symbols). Multiples are scaled by `payScale`.
- Scatter pays 2× / 8× / 40× **total bet** for 3 / 4 / 5 Pathway Gates anywhere.

---

## Symbols

| Id | Name | Role |
|----|------|------|
| Highs | Fool, Magician, High Priestess, Wheel, Hanged Man, World | Premium line pays |
| Lows | Ace, King, Queen, Jack | Volume fills |
| WILD | Fool’s Mirror | Substitutes for paying symbols; may expand |
| SCATTER | Pathway Gate | Bonus routing + scatter pays |
| SEQUENCE | Sequence Sigil | Breaks paylines; **does not** advance the Sequence meter |
| SPIRIT | Spirit Ember | Breaks paylines; charges Spirituality (+1 each) |

Wild never substitutes for Scatter, Sequence Sigil, or Spirit Ember.

---

## Fool’s Mirror (Wild)

1. A reel with ≥1 Wild and **no** Scatter expands: non-Scatter/Sequence/Spirit cells become Wild for evaluation.
2. A line win that uses a cell on an expanded reel gets **2×** once (not stacked per expanded reel).
3. **Crimson Moon:** expansion disabled (sticky cells stay single-cell).
4. **Fool’s Miracles:** expansion forced.
5. **Tarot Club** may enable “wild enhance” (expanded lines use a stronger multiplier) via a gathering reward.

---

## Bonus routing (Pathway Gate)

| Scatters | Result |
|----------|--------|
| 3–4 | Choice: Tarot Club Gathering **or** Crimson Moon Rampage |
| 5+ | Fool’s Miracles (priority; no choice) |

No simultaneous bonuses. Triggering bet is reused; bonus spins do not deduct wager.

---

## Sequence Resonance (meter)

**Fantasy:** Ritual progress between gatherings — **not** a simulation of Beyonder Sequence potions.

- Advances **once per paying spin** (any ≥1 line or scatter win), not once per line.
- **This spin** uses the **current** tier multiplier; the meter advances **after** evaluation.
- Resets when **any** bonus completes.
- Persists through bonus spins until that completion.
- Tiers (wins since reset → multiplier): see `GAME_CONFIG.sequence.tiers` (cap 15×).

---

## Spirituality (meter)

**Fantasy:** Occult charge that occasionally “awakens” one effect.

- Charge +1 on a **non-winning** spin (if Spirituality did not activate that spin) and +1 per Spirit Ember on the pre-effect grid.
- Charges in base and bonus; meter is session-global.
- When charge ≥ threshold at the start of resolution, **one** weighted effect activates, then charge → 0 (no overflow).
- Activation modifies the grid **before** final evaluation. Incremental win vs the pre-effect grid is attributed to SPIRITUALITY.

### Effects

| Effect | Behavior | Protected cells |
|--------|----------|-----------------|
| **Grafting** | Pick an anchor + orthogonal neighbors; transform the cluster into the **highest-paying** symbol among them (Wild ranks highest and never downgrades). | Never overwrite Scatter / Potion Bottle / Spirit / Glove / Monster |
| **Blind Stupidity** | Randomly upgrade **2–4** low-paying cells into high-value artifacts | Never highs / Wild / Scatter / Potion / Spirit / Glove / Monster |
| **Creeping Hunger** | Grid-triggered (Glove + Monster): absorb Monster → locking wilds, then respin non-preserved cells | Preserve highs, Wild, Scatter, Potion, Spirit, Glove |

No recursive Spirituality activations on the same spin. Hunger does not chain.

---

## Bonuses

### Tarot Club Gathering

- Entry: 3–4 scatter choice.
- **5 gathering free spins** on the reels (real `resolveSpin`), then a **random** gathering-table reward (credits, running multiplier, wild enhance, or extra spin).
- Extra spins capped (`maxExtraPicks`). Rewards are **random events**, not meaningful player decisions.
- Running multiplier applies to reel wins and credit prizes.

### Crimson Moon Rampage

- Entry: 3–4 scatter choice.
- **8** free spins; each spin may add one sticky Wild **cell** (cap 5).
- Expansion off. Moon multiplier starts at 1×, steps every 2 paying spins, caps at 2×.
- Retrigger: ≥3 scatters → +2 spins, global retrigger cap 2.

### Fool’s Miracles

- Entry: 5+ scatters only.
- **10** free spins; forced Wild expansion.
- Miracle multiplier starts at 2×, steps every 2 paying spins, caps at 5×.
- Same retrigger rules as Crimson.

### Shared cleanup

- On bonus complete: Sequence Resonance resets; sticky/tarot runtime discarded on summary ack.
- Locked Wilds and Spirituality charge **persist** across bonus boundaries.

---

## Evaluation order (one spin)

1. Base grid (or force grid) + sticky wilds + locked wilds  
2. If Spirituality armed → apply one effect; clear charge  
3. Baseline eval (pre-effect grid) for charge accounting when no activation  
4. Final eval (post-effect grid): expand wilds → lines → scatters  
5. Sequence multiplier on eligible credits; Spirituality increment isolated  
6. Bonus-mode multiplier if in bonus  
7. Advance Sequence if this spin paid; tick Locked Wild durations  

---

## Attribution (RTP categories)

Mutually exclusive: **BASE**, **BONUS**, **SEQUENCE** (increment above 1× only), **SPIRITUALITY** (increment from grid mods only). See `docs/RTP.md`.
