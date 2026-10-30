// Guard, for #304 (fairness rule 3): every deck here documents an entrance
// transition -- drawerdeck's own guide
// (packages/docs/guides/animate-the-drawer.md), vaul's and Base UI's CSS
// recipes (src/vaul.css, src/baseui.css), and React Aria's own native
// smooth-scroll `onEnter` (src/reactaria-app.tsx's header comment) -- so
// opening any of them should move the panel across several real frames,
// not snap it to its resting position in one. This is what would have
// caught the bug #304 fixed: Base UI's popup had no `transition` at all,
// so `window.__bench.openness()` jumped straight to its resting value on
// the very first frame after open.
//
// Click and sample in one `page.evaluate` call (not Playwright's own
// `page.click`, then a separate `evaluate`): that keeps the trigger click
// and the first sampled frame in the same task, so a library that snaps on
// the very frame it opens can't finish moving in the round-trip gap
// between two separate calls and be missed.

import { expect, test } from '@playwright/test';
import { DECKS } from './decks';
import type {} from './src/harness';

// Long enough to span the slowest documented entrance here (vaul's and
// Base UI's 450ms) plus margin, short enough to keep the suite quick.
const SAMPLE_WINDOW_MS = 900;
// Above `harness.ts`'s own sub-pixel jitter floor (see bench.spec.ts's
// `RESPONSE_THRESHOLD_PX` comment) and well below one snap-fraction step.
const CHANGED_STEP_PX = 0.5;
const MIN_CHANGED_FRAMES = 3;

for (const deck of DECKS) {
  test(`[${deck.key}] entrance animates across multiple frames`, async ({
    page
  }) => {
    await page.goto(deck.url);
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });

    const samples = await page.evaluate(
      (windowMs) =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          document.getElementById('trigger')!.click();
          const start = performance.now();
          function tick() {
            out.push(window.__bench.openness());
            if (performance.now() - start < windowMs) {
              requestAnimationFrame(tick);
            } else {
              resolve(out);
            }
          }
          requestAnimationFrame(tick);
        }),
      SAMPLE_WINDOW_MS
    );

    let changedFrames = 0;
    for (let i = 1; i < samples.length; i++) {
      if (Math.abs(samples[i] - samples[i - 1]) > CHANGED_STEP_PX) {
        changedFrames++;
      }
    }

    expect(changedFrames).toBeGreaterThanOrEqual(MIN_CHANGED_FRAMES);
  });
}
