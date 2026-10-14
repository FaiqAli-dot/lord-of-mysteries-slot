# Artwork pipeline (owner source JPGs)

Processing only — no generated/redrawn art.

| Path | Purpose |
|------|---------|
| `source/` | Original JPGs unchanged (readable aliases + hash-named copies) |
| `processing/INVENTORY.md` | Step 1 inventory + uncertain tarot mappings |
| `processing/crops.sample.json` | Editable crop/matte config for the 5-asset sample |
| `processing/STEP2_SAMPLE_REPORT.md` | Sample results, issues, full-run settings, later UI plan |
| `sample/` | Step 2 outputs (5 PNGs + contact sheet + manifest) |

Extract / re-extract sample:

```bash
python3 scripts/extract_assets.py \
  --config assets/processing/crops.sample.json \
  --out assets/sample \
  --contact-sheet
```

Requires: Python 3 + Pillow + numpy (`pip install Pillow numpy`).
