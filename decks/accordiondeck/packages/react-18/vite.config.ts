// @accordiondeck/react's source, built for React 18. The source is written
// for React 19 and is not changed for this build. It has no React 19-only
// API yet, so there is nothing to shim: when the primitives land and need
// one, this config grows the shims @drawerdeck/react-18's vite.config.ts has
// (a `react` shim and forwardRef wrapping).
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here('../react/src/');

export default defineConfig({
  plugins: [
    {
      // The source's declarations: the API is the same.
      name: 'accordiondeck-react-18-files',
      apply: 'build',
      closeBundle() {
        mkdirSync(here('dist'), { recursive: true });
        copyFileSync(here('../react/dist/index.d.ts'), here('dist/index.d.ts'));
      }
    }
  ],
  build: {
    lib: {
      entry: { index: `${source}index.ts` },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      external: (id) =>
        id === 'react' || id.startsWith('react/') || id === 'react-dom',
      output: {
        // The built module is client code, as @accordiondeck/react's is.
        banner: "'use client';",
        chunkFileNames: '[name].js'
      }
    },
    sourcemap: false
  }
});
