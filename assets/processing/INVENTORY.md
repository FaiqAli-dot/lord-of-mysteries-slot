# Source artwork inventory (Step 1)

Inspected from owner-uploaded JPGs. Originals are committed unchanged under `assets/source/` (readable aliases + hash-named copies). **No art was generated or redrawn.**

Crop boxes below are approximate pixel rectangles `[x, y, w, h]` for planning. Exact sample crops live in `crops.sample.json`.

---

## Summary table

| # | Filename (alias / hash) | Dimensions | Layout | Background | Transparency |
|---|-------------------------|------------|--------|------------|--------------|
| 1 | `01_ui_kit_sheet.jpg` / `ee37…_61d5.jpg` | 1408×768 | Multi-asset, irregular | Dark textured charcoal/navy, no alpha | Yes for ornaments/button/banner/meter; parchment panel opaque interior |
| 2 | `02_library_background.jpg` / `ccb8…_a7fb.jpg` | 1376×768 | Single full-bleed scene | N/A (is the background) | **No** — keep opaque |
| 3 | `03_labeled_symbols_sheet.jpg` / `9491…_a286.jpg` | 1408×768 | Multi, regular **6×3** grid + yellow captions under rows 2–3 | Dark textured navy/charcoal, no alpha | Yes — soft mattes for smoke/flame/glow |
| 4 | `04_high_value_icons_sheet.jpg` / `99db…_d88f.jpg` | 1408×768 | Multi, regular **6×3** grid, unlabeled | Dark textured navy/charcoal, no alpha | Yes — soft mattes for auras |

Equal grid cell size on sheets 3 & 4: ≈ **234.67 × 256** px.

---

## Sheet 1 — UI kit (`ee37…` / `01_ui_kit_sheet.jpg`)

**Type:** multi-asset, irregular placement (not a symbol grid).

| Asset | Approx crop `[x,y,w,h]` | Notes |
|-------|-------------------------|-------|
| BIG WIN banner | `[20, 20, 680, 300]` | Purple fabric + gold filigree + crystal accents + rune ribbons; strong purple bloom — soft matte required |
| Spin button | `[720, 40, 320, 320]` | Round gunmetal/gold compass ring, teal vortex core, gold spin arrows |
| Teal meter / spirituality bar | `[1180, 40, 200, 680]` | Capsule frame + cyan fill + wispy helix glow (hardest matte on this sheet) |
| Parchment panel | `[380, 430, 640, 290]` | Ornate silver/gold frame, opaque parchment fill with corner runes — keep panel opaque or matte only outer frame later |
| Vertical dividers (silver / gold / rune bar) | ~`[40, 360, 40, 280]` cluster | Thin filigree; easy to clip |
| Horizontal dividers (silver / gold) | ~`[100, 650, 280, 50]` | Runic center ornaments |
| Corner ornaments (×4-ish) | top-right ~`[1080, 20, 100, 100]`; bottom corners near parchment | Gold L-shaped filigree |

**Background type:** dark textured gradient/noise, baked into JPG.  
**Transparency needs:** yes for all chrome pieces; preserve purple/teal blooms.

---

## Sheet 2 — Library background (`ccb8…` / `02_library_background.jpg`)

**Type:** single standalone background.

| Asset | Crop | Notes |
|-------|------|-------|
| Full scene | `[0, 0, 1376, 768]` | Moonlit gothic library, teal rune-books, fog, desk/chair, arched moon window |

**Transparency:** none. Keep intact.  
**Note:** a decorative “WILD” book is painted into the shelves — not a separate reel asset.

---

## Sheet 3 — Labeled symbols (`9491…` / `03_labeled_symbols_sheet.jpg`)

**Type:** multi-asset, **6×3** grid. Yellow English labels under most row-2/row-3 icons (exclude labels from symbol crops).

| Grid (r,c) | Identity | Confidence | Approx cell / crop notes |
|------------|----------|------------|--------------------------|
| 0,0 | **A** | certain | Gold filigree A + blue-white smoke |
| 0,1 | **K** | certain | Silver K + red flames |
| 0,2 | **Q** | certain | Ruby Q + gold sparkles |
| 0,3 | **J** (circular green swirl) | certain | Emerald J variant A |
| 0,4 | **J** (crescent green swirl) | certain | Emerald J variant B — pick one primary later |
| 0,5 | **WILD** basic medallion | certain | Gold coin, no caption |
| 1,0 | **WILD** flaming (purple type) | certain | Labeled |
| 1,1 | **WILD** celestial / compass | certain | Labeled |
| 1,2 | **SCATTER** wax seal | certain | Labeled; sample target |
| 1,3 | **Sequence** | certain | Tarot-card spiral |
| 1,4 | **Creeping Hunger** | certain | Eye in spiked gear + black smoke |
| 1,5 | **Locked Wild** | certain | Chained wild medallion + padlock |
| 2,0 | **Spirituality** | certain | Teal sacred-geometry mandala |
| 2,1 | **Grafting** | certain | Ring with mini 7-7-7 reels + branches |
| 2,2 | **Multiplier x2** | certain | Flaming gold type |
| 2,3 | **Multiplier x5** | certain | Blue/yellow flames |
| 2,4 | **Multiplier x15** | certain | Large orange flames |
| 2,5 | **Glove** | certain | White glove + gold star |

**Background:** dark textured, no alpha.  
**Transparency:** yes for all icons (smoke/flame/glow).

---

## Sheet 4 — High-value icons (`99db…` / `04_high_value_icons_sheet.jpg`)

**Type:** multi-asset, **6×3** unlabeled grid. Visual descriptions are certain; **tarot / pathway name mappings are guesses** unless noted.

| Grid (r,c) | Visual identity | Suggested game mapping | Confidence |
|------------|-----------------|------------------------|------------|
| 0,0 | Ornate silver mask, cyan eyes | Magician? / Fool? | **uncertain — review** |
| 0,1 | Crystal-topped staff | Magician? | **uncertain — review** |
| 0,2 | Purple crescent hand-mirror | High Priestess? | **uncertain — review** |
| 0,3 | Blue zodiac / astrology disk | Wheel of Fortune? / World? | **uncertain — review** |
| 0,4 | Red gem pendant on dual chains | (no clear tarot) | uncertain |
| 0,5 | Golden sun/compass disk | Wheel of Fortune? / Sun? | **uncertain — review** |
| 1,0 | Inverted metallic figure on chains, red aura | **Hanged Man** | likely |
| 1,1 | Brass armillary sphere, blue core | World? / Magician tool? | **uncertain — review** |
| 1,2 | Antique lantern, warm flame | (no clear tarot) | uncertain |
| 1,3 | Death’s-head moth | (no clear tarot) | uncertain |
| 1,4 | Silver crescent moon + stars | Moon / Priestess? | **uncertain — review** |
| 1,5 | Radiant golden sun | Sun | likely (not in owner’s 6-name list) |
| 2,0 | Ruby-set dark-gold crown | Fool? (LotM crown motif guess) | **uncertain — review** |
| 2,1 | Red rose + gold vines | (no clear tarot) | uncertain |
| 2,2 | Gothic tower + purple lightning | Tower | likely |
| 2,3 | Silver rune bell | (no clear tarot) | uncertain |
| 2,4 | Spiked ship/wheel wreathed in blue fire | Wheel of Fortune? / World? | **uncertain — review** |
| 2,5 | Multi-point glowing star | Star / Fool? | **uncertain — review** |

**THE FOOL:** not clearly identifiable. Do **not** auto-map any cell to `FOOL` without owner confirmation.  
**Sample high-value pick:** `(1,0)` hanged-man pendant (`hv_hanged_man`) — documented substitute.

**Background / transparency:** same as sheet 3.

---

## Provenance hashes (SHA-256 prefix = upload id stem)

| Alias | SHA-256 |
|-------|---------|
| `01_ui_kit_sheet.jpg` | `ee37dadcc1b54b25b5c78917b93a108c31de50e11c1e7d298af4dfca31c35fa4` |
| `02_library_background.jpg` | `ccb80e38562d35b7a4abc6d7ee8e5eb845a7e6676ef9c1b2c779044b14e8fbf8` |
| `03_labeled_symbols_sheet.jpg` | `949100b2816b037f1fbd8ab521b22f4543cbfa7488aca6c19b089e5d98e9eb1a` |
| `04_high_value_icons_sheet.jpg` | `99dbb236b7a6149b8d87437b767331f3cbe77ebd610061d21ef01040e2857df7` |
