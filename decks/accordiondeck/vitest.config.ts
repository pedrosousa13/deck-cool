import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // One copy of react and react-dom: Vite's own resolution can otherwise
    // load a second one for a test that imports them differently.
    dedupe: ['react', 'react-dom'],
    // Tests import the package by name, as a consumer does, and run its
    // source rather than a stale `dist`.
    alias: [
      {
        find: /^@accordiondeck\/react$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/index.tsx', import.meta.url)
        )
      }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    // React 18 and 19's tests run in `pnpm test:react-18`/`test:react-19`.
    exclude: ['packages/react-18/**'],
    // A real browser, in all three engines: ADR 0001 records `<details>`
    // behaving differently in each (`name` groups, find-in-page, the
    // animated `::details-content`), which no DOM emulation reproduces.
    browser: {
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' }
      ],
      provider: playwright()
    }
  }
});
