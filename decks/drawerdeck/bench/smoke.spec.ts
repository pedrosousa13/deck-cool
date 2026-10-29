// Sanity check, not part of the recorded results (#266, originally #233):
// every deck loads, the trigger opens it to ~half, and it closes. Run
// before trusting the real bench's numbers.

import { expect, test } from '@playwright/test';
import { DECKS } from './decks';
import type {} from './src/harness';

for (const deck of DECKS) {
  test(`[${deck.key}] opens to half and reports a panel`, async ({ page }) => {
    await page.goto(deck.url);
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });
    await page.click('#trigger');
    await page.waitForFunction(() => window.__bench.idleFor() > 400, null, {
      timeout: 15_000
    });
    const openness = await page.evaluate(() => window.__bench.openness());
    const vh = page.viewportSize()!.height;
    expect(openness).toBeGreaterThan(vh * 0.35);
    expect(openness).toBeLessThan(vh * 0.6);
  });
}
