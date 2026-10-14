/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Override ui-plugin CDN/base URL (trailing slash optional). */
  readonly VITE_UI_PLUGIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
