/** Matches space-fortune SizeConfig / ui-plugin design sizes. */
export type LayoutKind = 'desktop' | 'landscape' | 'portrait';

export const DESIGN = {
  desktop: { width: 2048, height: 1080 },
  landscape: { width: 2048, height: 1080 },
  portrait: { width: 1080, height: 1080 },
} as const;

export function detectLayout(): LayoutKind {
  const w = window.visualViewport?.width ?? window.innerWidth;
  const h = window.visualViewport?.height ?? window.innerHeight;
  if (w < 900) return h >= w ? 'portrait' : 'landscape';
  return 'desktop';
}

export function designSize(kind: LayoutKind = detectLayout()): { width: number; height: number } {
  return DESIGN[kind];
}
