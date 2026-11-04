// Sanity check, not part of the recorded results (#340, ported from
// decks/drawerdeck/bench/smoke.spec.ts, #266): every deck loads and
// publishes its dots bar, starting at slide 0. Run before trusting the
// real bench's numbers. The no-loop variant only -- smoke doesn't need to
// check loop.

import { expect, test } from '@playwright/test';
import { DECKS } from './decks';
import type {} from './src/harness';

for (const deck of DECKS) {
  test(`[${deck.key}] publishes its dots bar at slide 0`, async ({ page }) => {
    await page.goto(deck.url);
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });
    await page.waitForFunction(() => window.__bench.published(), null, {
      timeout: 15_000
    });
    const index = await page.evaluate(() => window.__bench.index());
    expect(index).toBe(0);
  });
}
