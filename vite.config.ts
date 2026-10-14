import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  // GitHub Pages project site: https://faiqali-dot.github.io/lord-of-mysteries-slot/
  base: process.env.VITE_BASE ?? '/lord-of-mysteries-slot/',
  publicDir: 'public',
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
