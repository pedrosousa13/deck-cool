// The bench's own Playwright config (#266, #283). Build first: `pnpm
// build`, then this serves `./dist/`. A phone-ish viewport: a drawer is a
// mobile pattern, and `HALF_FRACTION`/`FULL_FRACTION` (src/content.ts) are
// fractions of this viewport's height.

import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 390, height: 760 };

export default defineConfig({
  testDir: '.',
  outputDir: './results/artifacts',
  // Timing matters (drag velocity, frame sampling, trace capture): one
  // browser, one worker, in the foreground.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4192/' },
  webServer: {
    command: 'pnpm exec vite preview --port 4192 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4192/bench-drawerdeck.html',
    reuseExistingServer: true
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } }
  ]
});
