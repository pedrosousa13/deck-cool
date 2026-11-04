// Builds the mount scenario's server-render bundles (#340): one per deck,
// `src/mount/ssr-entry-<deck>.tsx`'s `renderMarkup(n, dirty)`, to
// `dist-ssr/<deck>.mjs`. `scripts/generate-mount-pages.mjs` imports these
// after this build (and after `vite.config.ts`'s own client build) to
// produce every static `mount-<deck>-*-ssr.html` page's pre-rendered body.
// Node-targeted (`ssr: true`): dependencies resolve through this package's
// own installed `node_modules` at import time rather than being bundled
// in, the normal SSR-build default.

import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const DECK_KEYS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide'];

const ssrEntry = (key: string) =>
  fileURLToPath(new URL(`./src/mount/ssr-entry-${key}.tsx`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    ssr: true,
    outDir: 'dist-ssr',
    emptyOutDir: true,
    rolldownOptions: {
      input: Object.fromEntries(DECK_KEYS.map((key) => [key, ssrEntry(key)])),
      output: {
        format: 'es',
        entryFileNames: '[name].mjs'
      }
    }
  }
});
