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
// React Aria's Sheet is a known, documented exception (`RESULTS.md`'s
// "React Aria's Sheet never closed on a flick"): its own swipe-to-dismiss
// `IntersectionObserver` never re-fires after a native scroll carries the
// sheet off-screen in this bench's environment, so it never reports
// closed for this gesture, and rule 12 scores it "did not close" rather
// than this guard patching the library's close detection. The assertion
// below for `reactaria` is the mirror of every other deck's: it expects
// `isOpen()` to still be `true` after the same wait, so a future React
// Aria release that starts closing on its own flips this test red too --
// the point where someone revisits this exception, not a silent pass.
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

// Decks documented as never reporting closed for `touch-flick-dismiss`
// (rule 12's "did not close" treatment) -- see the header comment above.
const KNOWN_NEVER_CLOSES = new Set(['reactaria']);

const flickDismiss = scenarios.find((s) => s.name === 'touch-flick-dismiss');
if (!flickDismiss) {
  throw new Error('touch-flick-dismiss scenario not found in scenarios.ts');
}

for (const deck of DECKS) {
  const expectClose = !KNOWN_NEVER_CLOSES.has(deck.key);

  test(`[${deck.key}] touch-flick-dismiss leads to isOpen() === ${expectClose ? 'false' : 'true (known exception)'} within ${CLOSE_WAIT_MS}ms`, async ({
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

    if (expectClose) {
      await page.waitForFunction(() => window.__bench.isOpen() === false, null, {
        timeout: CLOSE_WAIT_MS
      });
    } else {
      await page.waitForTimeout(CLOSE_WAIT_MS);
      expect(await page.evaluate(() => window.__bench.isOpen())).toBe(true);
    }
  });
}
