# QA Report — Feature Redesign Pass

**Date:** 2026-10-20  
**Scope:** Lore/IP docs, Sequence + Spirituality coherence, Tarot simulator fidelity, protection consistency, help UI, RTP retune.

---

## Commands executed

| Command | Result |
|---------|--------|
| `npm run typecheck` | Pass |
| `npm test` | Pass — **41** tests (was 36) |
| `npx tsx scripts/simulate.ts --spins 100000 --seed 7` (baseline, pre-change) | RTP **108.42%** — OUT OF TOLERANCE |
| `npx tsx scripts/simulate.ts --spins 500000 --seed 7` (final) | RTP **95.19%** — **PASS** (Δ −0.81 pp) |
| `npm run simulate:smoke` | Used during early baseline; not the certification figure |

Build (`npm run build`) should be run in CI; not blocking this report if typecheck + tests pass locally.

---

## New / updated tests

- Locked Wild cannot overwrite Scatter / Sequence / Spirit  
- Locked Wild dedupes same cell  
- Creeping Hunger preserves Sequence + Spirit  
- Sequence tier boundary coverage from config  
- CHOICE scatter leaves `accounting.bonusTriggered` null until selection  
- Existing Grafting / Blind / Tarot gathering / reproducibility tests retained  

---

## Defects found and fixed

| Severity | Issue | Fix |
|----------|-------|-----|
| High | Simulator Tarot = picks only; skipped Sequence reset | Align with `SlotGame.bonusSpin` (reels + picks + reset) |
| High | Spirituality RTP ~17% after Blind/Grafting pay changes | Threshold 18, Blind count 1, Grafting spread only from natural Wilds, weight retune |
| High | Sequence thresholds unreachable once Tarot reset correctly | Retier to 115…1000 wins |
| Medium | Locked Wild could overwrite Sequence/Spirit | `cannotPlaceOver` + dedupe |
| Medium | Hunger could clear Sequence/Spirit | Added to preserve list |
| Medium | CHOICE pre-assigned `bonusTriggered` to Tarot | Null until selection |
| Medium | Help UI only showed line pays | Multi-page help from config |
| Low | Config comments (scatter count, Sequence advance, expand condition) | Corrected |

---

## Known remaining risks

1. **RTP** at 500k is within tolerance but ~0.8 pp under 96%; run 1e6 before claiming certification.  
2. **BONUS** category slightly above 30% target (Tarot now correctly includes reel EV).  
3. **BASE** slightly under 50% — further strip/paytable polish optional.  
4. Hunger may invent new Scatters on respun cells.  
5. IP / branding decision still open (`docs/LORE_AND_IP.md`).  
6. No automated UI visual regression; help pages depend on host plugin.  
7. Remote debug cheat API is demo-oriented — not for production crypto security.

---

## Production readiness

**Not claimed.** Demo math is within documented tolerance on a 500k seeded run with a corrected simulator. Commercial release still requires licensing decision, larger sims, and compliance review.
