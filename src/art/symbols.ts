/**
 * Original vector symbol art pipeline for Pathways of the Sealed.
 * All artwork is original programmatic SVG — no third-party LotM assets.
 * Palette: charcoal, fog grey, muted burgundy, antique bronze, restrained gold.
 */
import type { SymbolId } from '../config/gameConfig';

const C = {
  charcoal: '#1a1614',
  fog: '#8a8580',
  burgundy: '#6b2e3a',
  burgundyDeep: '#3d1a22',
  bronze: '#8a734a',
  gold: '#c4a35a',
  goldSoft: '#e0c878',
  ink: '#0e0c0b',
  parchment: '#2a2420',
  cream: '#d4cfc4',
  crimson: '#8b1e2d',
  veil: '#12101a',
};

function svg(body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.parchment}"/>
      <stop offset="100%" stop-color="${C.ink}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${C.gold}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${C.ink}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100" height="120" rx="4" fill="url(#bg)"/>
  <rect x="3" y="3" width="94" height="114" rx="3" fill="none" stroke="${C.bronze}" stroke-width="1.2" opacity="0.7"/>
  <rect x="6" y="6" width="88" height="108" rx="2" fill="none" stroke="${C.gold}" stroke-width="0.4" opacity="0.35"/>
  <ellipse cx="50" cy="48" rx="36" ry="40" fill="url(#glow)"/>
  ${body}
</svg>`;
}

function label(text: string): string {
  return `<text x="50" y="110" text-anchor="middle" font-family="Cinzel, serif" font-size="7" fill="${C.cream}" opacity="0.85">${text}</text>`;
}

const GENERATORS: Record<SymbolId, () => string> = {
  FOOL: () =>
    svg(
      `<circle cx="50" cy="42" r="18" fill="none" stroke="${C.gold}" stroke-width="1.5"/>
       <path d="M50 24 L54 38 L50 36 L46 38 Z" fill="${C.goldSoft}"/>
       <circle cx="50" cy="48" r="6" fill="${C.burgundy}"/>
       <path d="M38 70 Q50 58 62 70" fill="none" stroke="${C.bronze}" stroke-width="1.5"/>
       <path d="M42 78 L50 72 L58 78" fill="none" stroke="${C.fog}" stroke-width="1"/>
       ${label('THE FOOL')}`,
      'The Fool',
    ),
  MAGICIAN: () =>
    svg(
      `<rect x="30" y="30" width="40" height="28" rx="2" fill="none" stroke="${C.gold}" stroke-width="1.4"/>
       <line x1="50" y1="22" x2="50" y2="88" stroke="${C.bronze}" stroke-width="1.5"/>
       <circle cx="40" cy="40" r="3" fill="${C.burgundy}"/>
       <circle cx="60" cy="40" r="3" fill="${C.gold}"/>
       <path d="M35 52 H65" stroke="${C.fog}" stroke-width="0.8"/>
       <path d="M44 70 L50 62 L56 70 Z" fill="${C.goldSoft}" opacity="0.8"/>
       ${label('MAGICIAN')}`,
      'The Magician',
    ),
  PRIESTESS: () =>
    svg(
      `<path d="M50 20 L68 78 H32 Z" fill="none" stroke="${C.gold}" stroke-width="1.4"/>
       <circle cx="50" cy="38" r="8" fill="${C.burgundyDeep}" stroke="${C.bronze}" stroke-width="1"/>
       <path d="M42 38 Q50 48 58 38" fill="none" stroke="${C.cream}" stroke-width="0.8"/>
       <line x1="36" y1="70" x2="64" y2="70" stroke="${C.fog}" stroke-width="0.6"/>
       ${label('PRIESTESS')}`,
      'The High Priestess',
    ),
  WHEEL: () =>
    svg(
      `<circle cx="50" cy="48" r="26" fill="none" stroke="${C.gold}" stroke-width="1.6"/>
       <circle cx="50" cy="48" r="10" fill="none" stroke="${C.bronze}" stroke-width="1.2"/>
       <line x1="50" y1="22" x2="50" y2="74" stroke="${C.fog}" stroke-width="1"/>
       <line x1="24" y1="48" x2="76" y2="48" stroke="${C.fog}" stroke-width="1"/>
       <line x1="32" y1="30" x2="68" y2="66" stroke="${C.burgundy}" stroke-width="0.8"/>
       <line x1="68" y1="30" x2="32" y2="66" stroke="${C.burgundy}" stroke-width="0.8"/>
       ${label('WHEEL')}`,
      'Wheel of Fortune',
    ),
  HANGED: () =>
    svg(
      `<line x1="28" y1="24" x2="72" y2="24" stroke="${C.bronze}" stroke-width="2"/>
       <line x1="50" y1="24" x2="50" y2="40" stroke="${C.fog}" stroke-width="1.2"/>
       <circle cx="50" cy="48" r="8" fill="${C.burgundyDeep}" stroke="${C.gold}" stroke-width="1"/>
       <path d="M50 56 L50 78 M42 64 L58 64 M44 78 L50 72 L56 78" stroke="${C.cream}" stroke-width="1.2" fill="none"/>
       ${label('HANGED')}`,
      'The Hanged Man',
    ),
  WORLD: () =>
    svg(
      `<ellipse cx="50" cy="48" rx="22" ry="28" fill="none" stroke="${C.gold}" stroke-width="1.5"/>
       <ellipse cx="50" cy="48" rx="10" ry="28" fill="none" stroke="${C.bronze}" stroke-width="0.8"/>
       <line x1="28" y1="48" x2="72" y2="48" stroke="${C.fog}" stroke-width="0.8"/>
       <circle cx="50" cy="48" r="3" fill="${C.burgundy}"/>
       <path d="M30 28 Q50 22 70 28" fill="none" stroke="${C.goldSoft}" stroke-width="0.7" opacity="0.6"/>
       ${label('THE WORLD')}`,
      'The World',
    ),
  ACE: () =>
    svg(
      `<path d="M50 22 L62 78 H38 Z" fill="${C.burgundyDeep}" stroke="${C.gold}" stroke-width="1.2"/>
       <text x="50" y="58" text-anchor="middle" font-family="Cinzel, serif" font-size="22" fill="${C.goldSoft}">A</text>
       ${label('SEALED ACE')}`,
      'Sealed Ace',
    ),
  KING: () =>
    svg(
      `<rect x="28" y="28" width="44" height="54" rx="3" fill="${C.parchment}" stroke="${C.bronze}" stroke-width="1.3"/>
       <text x="50" y="62" text-anchor="middle" font-family="Cinzel, serif" font-size="28" fill="${C.gold}">K</text>
       <path d="M36 34 H64" stroke="${C.burgundy}" stroke-width="1"/>
       ${label('KING')}`,
      'Occult King',
    ),
  QUEEN: () =>
    svg(
      `<rect x="28" y="28" width="44" height="54" rx="3" fill="${C.parchment}" stroke="${C.bronze}" stroke-width="1.3"/>
       <text x="50" y="62" text-anchor="middle" font-family="Cinzel, serif" font-size="28" fill="${C.goldSoft}">Q</text>
       <circle cx="50" cy="36" r="3" fill="${C.burgundy}"/>
       ${label('QUEEN')}`,
      'Occult Queen',
    ),
  JACK: () =>
    svg(
      `<rect x="28" y="28" width="44" height="54" rx="3" fill="${C.parchment}" stroke="${C.bronze}" stroke-width="1.3"/>
       <text x="50" y="62" text-anchor="middle" font-family="Cinzel, serif" font-size="28" fill="${C.cream}">J</text>
       ${label('JACK')}`,
      'Occult Jack',
    ),
  WILD: () =>
    svg(
      `<circle cx="50" cy="48" r="24" fill="${C.burgundyDeep}" stroke="${C.goldSoft}" stroke-width="2"/>
       <circle cx="50" cy="48" r="14" fill="none" stroke="${C.gold}" stroke-width="1.2" stroke-dasharray="3 2"/>
       <path d="M40 48 L50 36 L60 48 L50 60 Z" fill="${C.gold}" opacity="0.85"/>
       <text x="50" y="90" text-anchor="middle" font-family="Cinzel, serif" font-size="8" fill="${C.goldSoft}">WILD</text>
       ${label("FOOL'S MIRROR")}`,
      "Fool's Mirror Wild",
    ),
  SCATTER: () =>
    svg(
      `<path d="M50 18 L58 40 L82 42 L64 58 L70 82 L50 68 L30 82 L36 58 L18 42 L42 40 Z"
             fill="${C.crimson}" stroke="${C.gold}" stroke-width="1.4"/>
       <circle cx="50" cy="50" r="6" fill="${C.ink}" stroke="${C.goldSoft}" stroke-width="1"/>
       ${label('TAROT')}`,
      'Crimson Tarot Card',
    ),
  SEQUENCE: () =>
    svg(
      `<path d="M38 28 L38 70 Q38 82 50 82 Q62 82 62 70 L62 28 Z" fill="none" stroke="${C.gold}" stroke-width="1.5"/>
       <ellipse cx="50" cy="28" rx="12" ry="5" fill="${C.burgundyDeep}" stroke="${C.bronze}" stroke-width="1"/>
       <path d="M44 40 H56 M44 52 H56" stroke="${C.goldSoft}" stroke-width="1"/>
       ${label('POTION')}`,
      'Potion Bottle',
    ),
  SPIRIT: () =>
    svg(
      `<ellipse cx="50" cy="52" rx="14" ry="22" fill="${C.veil}" stroke="${C.fog}" stroke-width="1.2"/>
       <ellipse cx="50" cy="40" rx="8" ry="10" fill="${C.burgundy}" opacity="0.7"/>
       <circle cx="50" cy="36" r="3" fill="${C.goldSoft}" opacity="0.9"/>
       <path d="M44 66 Q50 74 56 66" fill="none" stroke="${C.bronze}" stroke-width="1"/>
       ${label('SPIRIT')}`,
      'Spirit Ember',
    ),
  GLOVE: () =>
    svg(
      `<path d="M40 70 L40 48 Q40 36 50 34 Q60 36 60 48 L60 70" fill="none" stroke="${C.bronze}" stroke-width="2"/>
       <path d="M44 48 L44 30 M50 46 L50 26 M56 48 L56 30" stroke="${C.gold}" stroke-width="1.4"/>
       ${label('GLOVE')}`,
      'Glove',
    ),
  MONSTER: () =>
    svg(
      `<ellipse cx="50" cy="50" rx="22" ry="18" fill="${C.burgundyDeep}" stroke="${C.crimson}" stroke-width="1.5"/>
       <circle cx="42" cy="46" r="3" fill="${C.goldSoft}"/>
       <circle cx="58" cy="46" r="3" fill="${C.goldSoft}"/>
       <path d="M40 58 Q50 66 60 58" fill="none" stroke="${C.cream}" stroke-width="1.2"/>
       ${label('MONSTER')}`,
      'Monster',
    ),
};

const cache = new Map<SymbolId, string>();

export function symbolSvg(id: SymbolId): string {
  let s = cache.get(id);
  if (!s) {
    s = GENERATORS[id]();
    cache.set(id, s);
  }
  return s;
}

export function symbolDataUrl(id: SymbolId): string {
  const svg = symbolSvg(id);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Build all symbols once (pipeline entry). */
export function buildSymbolArt(): Record<SymbolId, string> {
  const out = {} as Record<SymbolId, string>;
  for (const id of Object.keys(GENERATORS) as SymbolId[]) {
    out[id] = symbolDataUrl(id);
  }
  return out;
}

export const ART_PALETTE = C;

export const ART_LICENSE_NOTES = `
Original artwork: All symbol SVGs are original programmatic vector art created for this project.
No copyrighted Lord of the Mysteries assets, logos, or character portraits are used.
Fonts: Cinzel and Cormorant Garamond via Google Fonts (SIL Open Font License 1.1).
No Kenney / OpenGameArt assets are bundled in this build.
No AI-generated image files are required; symbols are deterministic SVG.
`.trim();
