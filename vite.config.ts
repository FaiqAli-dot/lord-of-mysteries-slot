import { defineConfig, type Plugin } from 'vitest/config';

const DEFAULT_UI_PLUGIN = 'https://demo.ninjagaming.com/ui-plugin/';
const pagesBase = process.env.VITE_BASE ?? '/lord-of-mysteries-slot/';
const uiPluginRemote = (process.env.VITE_UI_PLUGIN_URL || DEFAULT_UI_PLUGIN).replace(/\/?$/, '/');
const uiPluginLocal = `${pagesBase.endsWith('/') ? pagesBase : `${pagesBase}/`}ui-plugin/`;

function injectUiPluginBases(): Plugin {
  return {
    name: 'inject-ui-plugin-bases',
    transformIndexHtml(html) {
      return html
        .replaceAll('__VITE_UI_PLUGIN_REMOTE__', JSON.stringify(uiPluginRemote))
        .replaceAll('__VITE_UI_PLUGIN_LOCAL__', JSON.stringify(uiPluginLocal));
    },
  };
}

export default defineConfig({
  root: '.',
  // GitHub Pages project site: https://faiqali-dot.github.io/lord-of-mysteries-slot/
  base: pagesBase,
  publicDir: 'public',
  plugins: [injectUiPluginBases()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
