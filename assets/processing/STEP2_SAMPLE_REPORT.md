# Step 2 — 5-asset sample extract (STOP here)

## Sample set

| id | Role | Source | Transparency | Matte |
|----|------|--------|--------------|-------|
| `hv_hanged_man` | High-value substitute | sheet 04 `(r1,c0)` | yes | `color_distance_soft` |
| `low_ace` | Low (A) | sheet 03 `(r0,c0)` | yes | `color_distance_soft` |
| `wild_basic` | Wild | sheet 03 `(r0,c5)` | yes | `color_distance_soft` |
| `scatter_wax_seal` | Scatter | sheet 03 `(r1,c2)` | yes | `color_distance_soft` |
| `bg_gothic_library` | Background | sheet 02 full | **no** (opaque) | passthrough |

**Fool:** not identifiable on sheet 04. High-value sample is the inverted chain figure (**likely Hanged Man**), flagged `needs_review` — do not map to `FOOL` without owner approval.

Outputs:

- `assets/sample/png/*.png`
- `assets/sample/contact_sheet_sample.png` (each asset on light + dark checkers)
- `assets/sample/sample_manifest.json`
- Config: `assets/processing/crops.sample.json`
- Script: `scripts/extract_assets.py`

Re-run after crop edits:

```bash
python3 scripts/extract_assets.py \
  --config assets/processing/crops.sample.json \
  --out assets/sample \
  --contact-sheet
```

---

## Extraction issues observed

1. **JPG baked backgrounds** — all sheets lack alpha; dark textured navy/charcoal must be soft-matted. Hard thresholding would kill smoke/flame/glow.
2. **Glow bleed between cells** — Scatter crop can pick up faint left-edge glow from the celestial WILD; tighten `crop` in config if needed.
3. **Caption text** — sheet 03 rows 2–3 have yellow labels under icons; sample Scatter used a shortened height (`h=212`) to exclude the caption. Full extract should use per-row `bottom_trim`.
4. **Thin UI filigree** (sheet 01, not in sample) — corners/dividers will need careful boxes; meter helix glow will need wider crop + gentler `near`/`far`.
5. **rembg optional path** — `rembg` package installs, but this environment lacked an onnxruntime backend (`pip install "rembg[cpu]"`). Primary path is color-distance soft matte; rembg remains a per-asset fallback in config (`matte.method: rembg`) once the CPU extra is available.
6. **Identity ambiguity (sheet 04)** — Fool / Magician / High Priestess / Wheel / World mappings are guesses; see `INVENTORY.md`.

Alpha sanity (soft fringe present where expected):

| file | % transparent | % soft (0&lt;α&lt;255) | % opaque |
|------|---------------|----------------------|----------|
| hv_hanged_man | 57% | 32% | 11% |
| low_ace | 35% | 22% | 43% |
| wild_basic | 43% | 20% | 37% |
| scatter_wax_seal | 32% | 11% | 57% |
| bg_gothic_library | 0% | 0% | 100% |

---

## Proposed settings for full extract (Step 3 — not run yet)

| Setting | Proposal |
|---------|----------|
| Method default | `color_distance_soft` |
| BG sample | median of 4 corner patches (`corner_inset=4`, `corner_size=10`) per crop |
| `near` / `far` | symbols ~14–18 / 48–55; flaming icons raise `far` (~60–70); teal meter / BIG WIN bloom lower `near` (~10–14) and raise `far` (~70–90) |
| Despill | `0.45–0.60` on soft fringe |
| Feather | Gaussian ~0.5–1.0 px on alpha only |
| Grid sheets 03/04 | 6×3 equal cells; pad 4–12 px; `bottom_trim≈32–40` on labeled rows |
| Sheet 01 | hand boxes in `crops.full.json` (irregular) |
| Sheet 02 + parchment fill | `transparency: false` |
| rembg | optional only for stubborn pieces after `rembg[cpu]`; compare contact sheets before accepting |
| Manifest fields | `path, category, source, crop, dims, transparency, matte_method, identity, identity_confidence, review_status` |
| Contact sheets | one per source sheet + master; light/dark checkers |
| Mechanics | **unchanged** — no payline / RTP / bonus edits |

---

## Later integration plan notes (Step 4 — do not implement now)

### Mechanics / grid (locked)

Keep this game’s **5×4** reel grid, **20 paylines**, and all existing engine rules. Do **not** adopt the reference client’s **6×5** reel layout.

### UI mirror requirement (owner)

After asset approval, game UI/UX should mirror [space-fortune-client](https://github.com/FaiqAli-dot/space-fortune-client):

- Same structural placement of background, reel frame, HUD, bet panel, spin button, win banner, meters, popups.
- Wire UI through **ui-plugin** the same way that repo does.
- Map extracted LotM art into those slots only where matching art exists.

### Reference repo access (this run)

**Could not access** `https://github.com/FaiqAli-dot/space-fortune-client` from this environment:

- GitHub API: HTTP 404
- `git ls-remote`: unavailable / not found
- No local checkout or `*fortune*` files in this workspace
- No `ui-plugin` references in the current `lord-of-mysteries-slot` tree
- npm registry probes for a generic `ui-plugin` package were inconclusive without the reference lockfile

**Needed from owner for Step 4:** repo access (make public, grant the agent/token, or attach a zip/submodule), plus confirmation whether `ui-plugin` is npm, git dependency, or vendored. Until then, layout/wiring details cannot be verified here.

### Current UI baseline (this repo)

`src/ui/app.ts` is a custom DOM/CSS UI consuming programmatic SVG from `src/art/symbols.ts`. Step 4 will replace/supplement that presentation layer with ui-plugin + raster assets; engine/API stay put. Update `docs/ASSETS.md` at integration time (it still documents SVG-only originals).
