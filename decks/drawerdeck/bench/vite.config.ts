// Bench app build (#266, #283): four static pages, one per drawer, each
// its own Vite entry. A sibling to the deck's own packages, not wired into
// decks/drawerdeck's own build or typecheck: a throwaway bench's build is
// not coupled to the deck's own `pnpm verify` (same choice the original
// prototype made, `prototype/drawer-bench`'s RESULTS.md, "What was built").

import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        'bench-drawerdeck': page('bench-drawerdeck'),
        'bench-vaul': page('bench-vaul'),
        'bench-baseui': page('bench-baseui'),
        'bench-reactaria': page('bench-reactaria')
      }
    }
  }
});
