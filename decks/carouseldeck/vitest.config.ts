import { fileURLToPath, URL } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';

/** A step of `mouse`, as `packages/react/test/mouse.ts` sends it. */
type MouseStep =
  | ['move', x: number, y: number, steps?: number]
  | ['down' | 'up']
  | ['wheel', dx: number, dy: number]
  | ['wait', ms: number];

/**
 * Real mouse input through Playwright, in any browser: the CDP the other
 * tests use is Chromium's alone. Sends each step in turn.
 */
const mouse: BrowserCommand<[MouseStep[]]> = async ({ page }, steps) => {
  for (const step of steps) {
    if (step[0] === 'move') {
      await page.mouse.move(step[1], step[2], { steps: step[3] ?? 1 });
    } else if (step[0] === 'wheel') {
      await page.mouse.wheel(step[1], step[2]);
    } else if (step[0] === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, step[1]));
    } else {
      await page.mouse[step[0]]();
    }
  }
};

export default defineConfig({
  resolve: {
    // Tests import the packages by name, as a consumer does, and run their
    // source rather than a stale `dist`. Anchored so a future subpath export
    // is not swallowed by the bare specifier's alias.
    alias: [
      {
        find: /^@carouseldeck\/core$/,
        replacement: fileURLToPath(
          new URL('./packages/core/src/index.ts', import.meta.url)
        )
      },
      {
        find: /^@carouseldeck\/react\/fade$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/fade.ts', import.meta.url)
        )
      },
      {
        find: /^@carouseldeck\/react\/stack$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/stack.ts', import.meta.url)
        )
      },
      {
        find: /^@carouseldeck\/react\/curve$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/curve.ts', import.meta.url)
        )
      },
      {
        // Unanchored at the end: a test imports it with `?inline`.
        find: /^@carouseldeck\/react\/theme\.css/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/theme.css', import.meta.url)
        )
      },
      {
        find: /^@carouseldeck\/react$/,
        replacement: fileURLToPath(
          new URL('./packages/react/src/index.tsx', import.meta.url)
        )
      }
    ]
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    // React 18's tests run in `pnpm test:react-18`, on React 18.
    exclude: ['packages/react-18/**'],
    setupFiles: ['packages/react/test/setup.ts'],
    // A real browser, not a DOM emulation: a scroll-snap carousel is layout
    // and scrolling, which happy-dom and jsdom do not implement.
    browser: {
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
        {
          browser: 'webkit',
          include: [
            // Tests of what WebKit alone did (#123): the others drive
            // input through CDP, which is Chromium's alone.
            'packages/react/test/settle-without-frames.test.tsx',
            'packages/react/test/loop-one-instance.test.tsx',
            // #179: paint order and the fade-by-visibility switch, named in
            // the brief as needing to work in Chromium, Firefox and WebKit.
            // Neither drives input through CDP, so nothing keeps it out.
            'packages/react/test/curve-paint-and-fade.test.tsx'
          ]
        }
      ],
      commands: { mouse },
      // Touch-enabled so a test can swipe with real CDP touch events, and
      // with classic scrollbars, which Playwright hides by default, so a test
      // can see one take layout space.
      provider: playwright({
        contextOptions: { hasTouch: true },
        launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] }
      })
    }
  }
});
