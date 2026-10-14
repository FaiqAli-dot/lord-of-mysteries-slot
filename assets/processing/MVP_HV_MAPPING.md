# MVP high-value symbol mapping

Owner authorized assigning 6 of 18 HV icons to game `SymbolId`s for MVP. **Not integrated into the client yet** (waiting on space-fortune-client reference analysis).

| SymbolId | Asset id | Visual |
|----------|----------|--------|
| FOOL | `hv_icon_r3c6_star` | Multi-point glowing star |
| MAGICIAN | `hv_icon_r1c2_staff` | Crystal-topped staff |
| PRIESTESS | `hv_icon_r1c3_mirror` | Purple crescent hand-mirror |
| WHEEL | `hv_icon_r1c4_zodiac_disk` | Blue zodiac / astrology disk |
| HANGED | `hv_icon_r2c1_hanged_figure` | Inverted figure on chains |
| WORLD | `hv_icon_r2c2_armillary` | Brass armillary sphere |

Recorded in `assets/processing/crops.full.json` → `symbol_mapping_mvp` and `assets/library/manifest.json`. Those six have `review_status: ok`. Remaining 12 HV icons stay `needs_review` / unmapped.

Cleanup applied before selection: dark sheet-halo strip + edge clears for lantern, hanged, armillary, rose, ruby pendant, crescent moon, bell.
