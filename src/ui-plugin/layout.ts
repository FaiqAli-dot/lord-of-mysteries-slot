import layoutConfig from './configs/layout.json';

export type LayoutMode = 'Desktop' | 'Portrait';

export interface Size {
  width: number;
  height: number;
}

export function designSize(mode: LayoutMode): Size {
  return mode === 'Portrait' ? layoutConfig.portraitSize : layoutConfig.desktopSize;
}

export function detectLayout(viewW: number, viewH: number): LayoutMode {
  return viewH >= viewW * 1.05 ? 'Portrait' : 'Desktop';
}

export function layoutOf<T extends Record<string, unknown>>(
  block: { Desktop: T; Portrait: T },
  mode: LayoutMode,
): T {
  return block[mode] ?? block.Desktop;
}

export { layoutConfig };
