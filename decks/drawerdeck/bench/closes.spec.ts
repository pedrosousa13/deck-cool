// Guard, for #311 (fairness rule 12): every deck here must report itself
// closed -- `window.__bench.isOpen() === false`, driven by the library's
// own `onOpenChange`/`open`, never this bench's own reading of the
// drawer's on-screen position -- within a bounded wait after the
// `touch-flick-dismiss` gesture `scenarios.ts` already drives the real
// bench run with. This is what would have caught #311: React Aria's Sheet
// visibly scrolled out of view on a flick, but its own `onOpenChange`
// never ran, so it stayed mounted and open underneath while the bench
// scored a fast "settle" on scroll motion alone.
//
// Chromium only, the same as `bench.spec.ts`: the flick needs CDP's
// trusted touch (`scenarios.ts`'s own header comment).

import { expect, test } from '@playwright/test';
import { DECKS } from './decks';
import { geometry, openToHalf, scenarios } from './scenarios';
import type {} from './src/harness';

// Matches `bench.spec.ts`'s own `CLOSE_WAIT_MS`: long enough for a
// library's own close animation/teardown to finish, short enough that a
// deck that never closes doesn't meaningfully lengthen the run.
const CLOSE_WAIT_MS = 2_000;

const flickDismiss = scenarios.find((s) => s.name === 'touch-flick-dismiss');
if (!flickDismiss) {
  throw new Error('touch-flick-dismiss scenario not found in scenarios.ts');
}

for (const deck of DECKS) {
  test(`[${deck.key}] touch-flick-dismiss leads to isOpen() === false within ${CLOSE_WAIT_MS}ms`, async ({
    page
  }) => {
    await page.goto(deck.url);
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });

    await openToHalf(page);
    expect(await page.evaluate(() => window.__bench.isOpen())).toBe(true);

    const g = await geometry(page);
    await flickDismiss.run(page, g);

    await page.waitForFunction(() => window.__bench.isOpen() === false, null, {
      timeout: CLOSE_WAIT_MS
    });
  });
}
