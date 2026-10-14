# Artwork pipeline (owner source JPGs)

Processing only — no generated/redrawn art. **No Step 4 game integration yet.**

| Path | Purpose |
|------|---------|
| `source/` | Original JPGs unchanged |
| `processing/INVENTORY.md` | Step 1 inventory + uncertain tarot mappings |
| `processing/crops.sample.json` | Editable crop/matte config for the 5-asset sample |
| `processing/crops.full.json` | Full-library crop/matte config (50 assets) |
| `processing/STEP2_SAMPLE_REPORT.md` | Sample-stage notes |
| `processing/STEP3_EXTRACTION_REPORT.md` | Full extract report + residual issues |
| `sample/` | Step 2 sample outputs |
| `library/` | Step 3 full library (category dirs, manifest, contact sheets) |

Extract / re-extract:

```bash
# Sample
python3 scripts/extract_assets.py \
  --config assets/processing/crops.sample.json \
  --out assets/sample \
  --contact-sheet --contact-combined \
  --manifest-name sample_manifest.json \
  --group-contact-by none

# Full library
python3 scripts/extract_assets.py \
  --config assets/processing/crops.full.json \
  --out assets/library \
  --contact-sheet \
  --manifest-name manifest.json \
  --group-contact-by sheet
```

Requires: Python 3 + Pillow + numpy (`pip install Pillow numpy`).
