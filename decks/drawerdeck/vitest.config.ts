import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// The `BrowserCommands` augmentation that types these three below (and the
// `commands.dragPointerDown(…)` calls in `packages/core/test/fixtures.ts`)
// lives in `packages/core/test/browser-commands.d.ts`, not here: this file
// is not part of either package's own `tsconfig`, so an augmentation here
// would not reach the test files that call them.
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
    // React 18 and 19's tests run in `pnpm test:react-18`/`test:react-19`.
    exclude: ['packages/react-18/**'],
    setupFiles: ['packages/react/test/setup.ts'],
    // A real browser, not a DOM emulation: the drawer is a <dialog>,
    // native scroll-snap and `scrollend`, none of which happy-dom or jsdom
    // implements.
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
      provider: playwright({ contextOptions: { hasTouch: true } }),
      commands: {
        // Real input for the non-modal hit area's drag tests (#312):
        // `userEvent` has no multi-step pointer API of its own (only
        // whole-gesture helpers like `click` and `dragAndDrop`'s single
        // source-to-target hop), so this drives Playwright's own
        // `page.mouse` directly, the same OS-level input a real drag is.
        // Split into three commands, not one that takes a whole gesture:
        // the test itself drives each step and reads the real, resulting
        // `scrollTop` back between them (`realMouseDrag` in `fixtures.ts`),
        // since how far a given `page.mouse` delta actually moves the
        // pointer is not 1:1 with the CSS pixels asked for here.
        async dragPointerDown(context, selector, offsetX, offsetY) {
          const frame = await context.frame();
          const box = await frame.locator(selector).boundingBox();
          if (!box) {
            throw new Error(`dragPointerDown: no element matches ${selector}`);
          }
          const x = box.x + offsetX;
          const y = box.y + offsetY;
          await context.page.mouse.move(x, y);
          await context.page.mouse.down();
          return { x, y };
        },
        async dragPointerMoveTo(context, x, y) {
          await context.page.mouse.move(x, y);
        },
        async dragPointerUp(context) {
          await context.page.mouse.up();
        }
      }
    }
  }
});
