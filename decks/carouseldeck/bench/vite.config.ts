// Bench app build (#340, ported from decks/drawerdeck/bench/vite.config.ts,
// #266/#283): six static pages, one per deck's gesture bench entry plus the
// five mount-scenario client entries, each its own Vite entry. A sibling to
// the deck's own packages, not wired into decks/carouseldeck's own build or
// typecheck: a throwaway bench's build is not coupled to the deck's own
// `pnpm verify` (the same choice drawerdeck's own bench made).
//
// Every output file keeps a fixed, unhashed name (`entryFileNames`):
// `scripts/generate-mount-pages.mjs` writes static HTML shells that
// reference a mount client entry's built file by name before Vite's own
// manifest would otherwise be known, and there is no CDN caching concern
// for a throwaway bench either way.

import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));
const mountEntry = (deck: string) =>
  fileURLToPath(
    new URL(`./src/mount/client-entry-${deck}.tsx`, import.meta.url)
  );

const DECK_KEYS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide'];

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // `scripts/generate-mount-pages.mjs` reads this to find which CSS
    // asset(s) each `mount-<deck>.client` entry pulled in (Embla's and
    // Keen's own positioning CSS, Swiper's and Splide's base stylesheets):
    // unlike `bench-<deck>.html`, which Vite rewrites as a real HTML entry
    // and links automatically, the generated mount pages are written after
    // this build runs, so nothing links their CSS unless the generator
    // does it itself, from this manifest.
    manifest: true,
    rolldownOptions: {
      input: {
        ...Object.fromEntries(
          DECK_KEYS.map((key) => [`bench-${key}`, page(`bench-${key}`)])
        ),
        ...Object.fromEntries(
          DECK_KEYS.map((key) => [`mount-${key}.client`, mountEntry(key)])
        )
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
