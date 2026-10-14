# Artwork & third-party licenses

## Original artwork (this project)

| Asset | Source | License |
|---|---|---|
| All reel symbols (Fool, Magician, Priestess, Wheel, Hanged Man, World, Ace/King/Queen/Jack, Wild, Scatter, Sequence, Spirit) | Programmatic SVG in `src/art/symbols.ts` | Original work for this repository |
| Favicon | `public/favicon.svg` | Original |
| UI textures / fog particles | CSS gradients + inline SVG noise | Original |

**No** copyrighted *Lord of the Mysteries* assets, logos, character portraits, or official art are used. The game is an original occult/gothic pastiche.

## Third-party

| Asset | Source | License |
|---|---|---|
| **Cinzel** (display type) | [Google Fonts](https://fonts.google.com/specimen/Cinzel) | SIL Open Font License 1.1 |
| **Cormorant Garamond** (body type) | [Google Fonts](https://fonts.google.com/specimen/Cormorant+Garamond) | SIL Open Font License 1.1 |

## Not used

- Kenney / OpenGameArt packs (none bundled)
- AI-generated raster image files (none required; symbols are deterministic SVG)
- External audio files (optional Web Audio tones generated in-browser in `src/ui/audio.ts`)

## Symbol art pipeline

`buildSymbolArt()` / `symbolDataUrl(id)` in `src/art/symbols.ts` generates reusable data-URL SVGs from a single palette and frame template. UI and paytable consume the same pipeline — no emoji placeholders.
