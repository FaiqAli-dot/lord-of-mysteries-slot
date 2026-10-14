import type { SymbolId } from '../config/gameConfig';

const base = () => {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : `${b}/`;
};

export function assetUrl(rel: string): string {
  return `${base()}game-assets/${rel.replace(/^\//, '')}`;
}

/** MVP mapping + labeled sheet symbols → public PNG paths. */
export const SYMBOL_TEXTURE: Record<SymbolId, string> = {
  FOOL: 'symbols/high/hv_icon_r3c6_star.png',
  MAGICIAN: 'symbols/high/hv_icon_r1c2_staff.png',
  PRIESTESS: 'symbols/high/hv_icon_r1c3_mirror.png',
  WHEEL: 'symbols/high/hv_icon_r1c4_zodiac_disk.png',
  HANGED: 'symbols/high/hv_icon_r2c1_hanged_figure.png',
  WORLD: 'symbols/high/hv_icon_r2c2_armillary.png',
  ACE: 'symbols/low/low_ace.png',
  KING: 'symbols/low/low_king.png',
  QUEEN: 'symbols/low/low_queen.png',
  JACK: 'symbols/low/low_jack_swirl.png',
  WILD: 'symbols/wild/wild_basic.png',
  SCATTER: 'symbols/scatter/scatter_wax_seal.png',
  SEQUENCE: 'symbols/feature/feature_sequence.png',
  SPIRIT: 'symbols/feature/feature_spirituality.png',
};

export const UI_TEXTURE = {
  background: 'backgrounds/bg_gothic_library.png',
  spin: 'ui/buttons/ui_spin_button.png',
  bigWin: 'ui/banners/ui_big_win_banner.png',
  meter: 'ui/meters/ui_spirituality_meter.png',
  parchment: 'ui/panels/ui_parchment_panel.png',
  cornerTr: 'ui/corners/ui_corner_tr.png',
  cornerBl: 'ui/corners/ui_corner_bl.png',
  cornerBr: 'ui/corners/ui_corner_br.png',
  divHGold: 'ui/dividers/ui_divider_h_gold.png',
  divVGold: 'ui/dividers/ui_divider_v_gold.png',
} as const;

export function allAssetUrls(): string[] {
  const urls = new Set<string>();
  for (const p of Object.values(SYMBOL_TEXTURE)) urls.add(assetUrl(p));
  for (const p of Object.values(UI_TEXTURE)) urls.add(assetUrl(p));
  return [...urls];
}
