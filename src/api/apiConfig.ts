/**
 * Runtime API base URL resolution (no rebuild required):
 * 1. `?api=<url>` query param → saved to localStorage
 * 2. localStorage `pathways-api-base`
 * 3. build-time `import.meta.env.VITE_API_BASE`
 * 4. empty string (UI prompts for URL in Settings)
 */

export const API_STORAGE_KEY = 'pathways-api-base';
export const SESSION_STORAGE_KEY = 'pathways-session-id';

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function readQueryApiParam(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(window.location.search).get('api');
    return q && q.trim() ? normalizeBase(q) : null;
  } catch {
    return null;
  }
}

export function getStoredApiBase(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return normalizeBase(localStorage.getItem(API_STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

export function setStoredApiBase(url: string): void {
  const n = normalizeBase(url);
  try {
    if (n) localStorage.setItem(API_STORAGE_KEY, n);
    else localStorage.removeItem(API_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getBuildTimeApiBase(): string {
  try {
    const v = (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.VITE_API_BASE;
    return v ? normalizeBase(v) : '';
  } catch {
    return '';
  }
}

/** Resolve effective API base; applies and persists `?api=` when present. */
export function resolveApiBase(): string {
  const fromQuery = readQueryApiParam();
  if (fromQuery) {
    setStoredApiBase(fromQuery);
    return fromQuery;
  }
  const stored = getStoredApiBase();
  if (stored) return stored;
  return getBuildTimeApiBase();
}

/**
 * Extra request headers for public HTTPS tunnels that show an interstitial
 * (e.g. localtunnel / loca.lt requires Bypass-Tunnel-Reminder;
 * ngrok free tier requires ngrok-skip-browser-warning).
 */
export function tunnelRequestHeaders(apiBase: string): Record<string, string> {
  if (!apiBase) return {};
  try {
    const host = new URL(apiBase).hostname.toLowerCase();
    if (
      host === 'loca.lt' ||
      host.endsWith('.loca.lt') ||
      host === 'localtunnel.me' ||
      host.endsWith('.localtunnel.me')
    ) {
      return { 'Bypass-Tunnel-Reminder': 'true' };
    }
    if (
      host.endsWith('.ngrok-free.app') ||
      host.endsWith('.ngrok-free.dev') ||
      host.endsWith('.ngrok.app') ||
      host.endsWith('.ngrok.io')
    ) {
      return { 'ngrok-skip-browser-warning': 'true' };
    }
  } catch {
    /* ignore invalid URL */
  }
  return {};
}
