# Lore Reference and IP Boundary — Pathways of the Sealed

This document separates **novel-inspired naming** from **slot mechanics invented for this game**. It is not a license grant and does not claim affiliation with the original author or rights holders.

---

## Project posture (open decision)

The owner has **not** finalized whether this build is:

1. a noncommercial fan project,
2. a licensed adaptation, or
3. an original commercial product that must eventually drop or replace protected identifiers.

Until that decision is made:

- Keep internal ids and package names stable (`FOOL`, `TAROT_CLUB`, `pathways-of-the-sealed`, etc.).
- Prefer configurable **player-facing** labels (`GAME_CONFIG.sequence.displayName`, symbol `name` fields, bonus `name` fields).
- Do **not** describe the game as licensed or officially affiliated.
- A disclaimer alone does **not** authorize commercial use of another author’s characters, terminology, story, or distinctive presentation.

---

## Layer A — Lore reference (spoiler-safe)

References below stay at a **high level** appropriate for early novel material and common public knowledge of the setting’s aesthetic (tarot imagery, “pathways,” occult investigation). They are **not** a claim of accuracy.

| Game term | Reference intent | Certainty |
|-----------|------------------|-----------|
| Pathways / sealed | Evokes Beyonder pathways and forbidden power | Creative interpretation |
| The Fool, Magician, High Priestess, Wheel, Hanged Man, World | Named after Major Arcana; also echo famous novel pathway/title imagery | Confirmed as tarot names; novel association is interpretive |
| Tarot Club | Evokes a secret gathering / club motif from the novel | Interpretive naming |
| Sequence (meter) | Novel “Sequence” is a specific advancement concept (potions / pathways). This meter is **only** a progress multiplier | **Not** a faithful simulation |
| Spirituality / Grafting / Blind Stupidity / Creeping Hunger / Glove | Names echo abilities or motifs associated with certain pathways | Mechanics are **slot inventions**; do not present exact novel rules |
| Crimson Moon | Evokes dangerous lunar / catastrophe imagery | Interpretive |
| Fool’s Miracles / Fool’s Mirror | Evokes miracle / deception themes tied to Fool imagery | Interpretive |

**Spoiler boundary:** Player-facing text must not introduce later-story revelations, identities, or plot twists beyond what the project owner has approved. Prefer atmospheric language (“sealed pathways,” “gathering,” “resonance”) over spoiler plot summaries.

**Fan-wiki caution:** Do not treat speculative wiki claims as canon. Prefer primary text or owner-approved notes when adding lore flavor.

---

## Layer B — Game implementation (independent of canon)

These rules exist so the slot is coherent even if all LOTM-flavored names were renamed tomorrow:

- Sequence Resonance = paying-spin progress meter with tiers and bonus reset.
- Spirituality = charge meter with five mutually exclusive one-shot grid effects.
- Three bonuses = gathering spins + table rewards; sticky-wild ramp; forced expand spectacle.
- Wild expand + 2×; scatter routing 3–4 choice / 5+ Miracles.

See `docs/FEATURE_RULES.md` for exact behavior.

---

## Licensing checklist (before commercial release)

- [ ] Confirm license status with rights holders **or** commit to original branding.
- [ ] Inventory player-facing names, symbol titles, bonus titles, UI copy, art motifs.
- [ ] Decide which identifiers need replacement vs which are generic tarot (still may be risky in combination).
- [ ] Update storefront / README claims; remove any implied affiliation.
- [ ] Legal review of art style and distinctive presentation.

---

## Configurable labels (today)

| Surface | Config path |
|---------|-------------|
| Sequence meter title / hint | `GAME_CONFIG.sequence.displayName` / `displayHint` |
| Spirituality title / hint | `GAME_CONFIG.spirituality.displayName` / `displayHint` |
| Symbol display names | `SYMBOLS.*.name` |
| Bonus display names | `GAME_CONFIG.bonuses.*.name` |
| Effect names / blurbs | `GAME_CONFIG.spirituality.effects[].name/description` |

Internal enums (`SpiritualityEffectId`, `BonusModeId`, `SymbolId`) should stay stable unless a breaking migration is planned.
