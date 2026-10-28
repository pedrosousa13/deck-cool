import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // One copy of react and react-dom: Vite's own resolution can otherwise
    // load a second one for a test that imports them differently than
    // @testing-library/react's own internals do, breaking hooks (useState
    // then reads a hook dispatcher react-dom never set).
    dedupe: ['react', 'react-dom'],
    // Tests import the packages by name, as a consumer does, and run their
    // source rather than a stale `dist`. Anchored so a future subpath
    // export is not swallowed by the bare specifier's alias.
    alias: [
      {
        find: /^@drawerdeck\/core$/,
        replacement: fileURLToPath(
          new URL('./packages/core/src/index.ts', import.meta.url)
        )
      },
      {
        find: /^@drawerdeck\/react$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/index.tsx', import.meta.url)
        )
      }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    setupFiles: ['packages/react/test/setup.ts'],
    // A real browser, not a DOM emulation: the drawer is a <dialog>,
    // native scroll-snap and `scrollend`, none of which happy-dom or jsdom
    // implements.
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
      provider: playwright({ contextOptions: { hasTouch: true } })
    }
  }
});
