# Step 3 — Full library extraction report

**Status:** Complete. Step 4 (game / ui-plugin integration) **not** done.

## Sample fixes (applied before full run)

| Asset | Issue | Fix |
|-------|-------|-----|
| `hv_hanged_man` / `hv_icon_r2c1_hanged_figure` | Dark silhouette washed out on light bg | `protect_dark`: fill holes inside color-distance content mask; keep low-luminance metal/chains opaque; reduced despill on dark pixels |
| `low_ace` | Right smoke clipped | Crop widened to `[0,2,278,252]` (source K-flames start ~x=281); `right_edge_fade_px=28` softens residual hard edge |
| `scatter_wax_seal` | Teal glow from celestial WILD | Left crop tightened to `x=524`; `left_edge_mask` + `post_kill_left_cyan` |

## Full library summary

| Metric | Value |
|--------|-------|
| Config | `assets/processing/crops.full.json` (v2) |
| Script | `scripts/extract_assets.py` |
| Output root | `assets/library/` |
| Asset count | **50** (no upscaling) |
| Manifest | `assets/library/manifest.json` |
| Contact sheets | `assets/library/contact_sheets/*_{light,dark}.png` + `all_{light,dark}.png` |

### By category

| Category | Count | Notes |
|----------|------:|-------|
| `symbols/low` | 5 | A, K, Q, J×2 |
| `symbols/wild` | 4 | basic, flaming, celestial, locked |
| `symbols/scatter` | 1 | wax seal |
| `symbols/feature` | 5 | Sequence, Creeping Hunger, Spirituality, Grafting, Glove |
| `symbols/multiplier` | 3 | x2, x5, x15 |
| `symbols/high` | 18 | Neutral names `hv_icon_rRcC_<slug>`; all `needs_review` |
| `backgrounds` | 1 | opaque library |
| `ui/*` | 13 | banner, spin, meter, parchment, dividers, corners |

### Sheet 04 identity policy

All high-value icons use **neutral filenames** and `review_status: needs_review`.  
`identity` = visual description; `suggested_identity` = optional tarot/pathway guess (may be null).  
**Do not map to FOOL / Magician / Priestess / Wheel / World / etc. without owner confirmation.**

## Directory layout

```
assets/library/
  backgrounds/bg_gothic_library.png
  symbols/{low,wild,scatter,feature,multiplier,high}/…
  ui/{banners,buttons,meters,panels,dividers,corners}/…
  contact_sheets/
  manifest.json
```

Padding: grid sheets use consistent cell insets (~6–10px); labeled rows 1–2 height capped (~196px) to exclude yellow captions.

## Matte defaults (full run)

- Method: `color_distance_soft` + dark-core protection
- `near`/`far` ≈ 15/52 (flames/BIG WIN/meter looser)
- `protect_dark` with morphological hole-fill inside content seeds
- Despill reduced on dark pixels
- Opaque passthrough: background + parchment panel
- Optional per-asset: `left_edge_mask_*`, `right_edge_fade_px`, `post_kill_left_cyan`

## Ambiguous / residual issues

1. **Sheet 04 mappings** — all 18 `needs_review` (see manifest `suggested_identity`).
2. **`low_ace` right smoke** — source art meets K-flame boundary ~x=281; cannot widen further without pulling K fire; soft right fade applied.
3. **UI corners / thin filigree** — `needs_review` (possible leftover texture or slight clipping).
4. **`ui_spirituality_meter`** — soft teal helix fringe; `needs_review` on contact sheets.
5. **JPG stair-step / glow edges** — inherent to lossy sheet + soft matte; not redrawn.
6. **Gold flame icons** — automated yellow-caption detector can false-positive on gold type/flames; captions were height-trimmed.
7. **Sample alias** — `assets/sample/.../hv_hanged_man.png` aliases library `hv_icon_r2c1_hanged_figure.png` for the review set.

## Later Step 4 (not started)

- Mirror `space-fortune-client` layout + **ui-plugin** wiring (repo still inaccessible here).
- Keep **5×4 / 20 paylines** mechanics.
- Map only where matching extracted art exists; leave SVG fallbacks otherwise.
