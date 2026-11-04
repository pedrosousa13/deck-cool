// The bench's own Playwright config (#340, ported from
// decks/drawerdeck/bench/playwright.config.ts, #266/#283). Build first:
// `pnpm build`, then this serves `./dist/`. 800x600: a carousel is not a
// mobile-only pattern the way a drawer is (carouseldeck's own prototype
// scroll-snap measure bench used 800x700 for the same reason), and three of
// five scenarios need Chromium's CDP trusted touch either way.

import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 800, height: 600 };

export default defineConfig({
  testDir: '.',
  outputDir: './results/artifacts',
  // Timing matters (drag velocity, frame sampling, trace capture): one
  // browser, one worker, in the foreground.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4193/' },
  webServer: {
    command: 'pnpm exec vite preview --port 4193 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4193/bench-carouseldeck.html',
    reuseExistingServer: true
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } }
  ]
});
