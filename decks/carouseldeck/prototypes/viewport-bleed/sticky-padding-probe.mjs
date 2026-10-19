// Question 2: where does a sticky slide stick under the bleed padding, the
// column (the padding box's content edge) or the raw scrollport edge #177
// expected? Reproduces `stackedLayout`'s own grid technique
// (`packages/react/src/stacked.ts`) in `sticky-padding.html`, against two
// scrollers: A, today's `inset-inline-start: 0`, and B, #177's own
// proposed fix (`inset-inline-start: var(--inset)`, question 2 in
// FINDINGS.md), swept across a scroll range in Chromium, Firefox and
// WebKit.
//
// Run from decks/carouseldeck:
//   node prototypes/viewport-bleed/sticky-padding-probe.mjs

import { chromium, firefox, webkit } from 'playwright';
import { pathToFileURL } from 'node:url';

const file = pathToFileURL(
  new URL('./sticky-padding.html', import.meta.url).pathname
).toString();

async function run(name, launcher) {
  const browser = await launcher.launch();
  const page = await browser.newPage({
    viewport: { width: 1000, height: 600 }
  });
  await page.goto(file);

  const rect = (selector) =>
    page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width) };
    });

  const column = await rect('.column');
  console.log(`\n=== ${name} ===  column.left=${column.left}`);

  for (const scrollLeft of [0, 100, 200, 300, 350, 400]) {
    await page.$eval(
      '#scrollerA',
      (el, sl) => {
        el.scrollLeft = sl;
      },
      scrollLeft
    );
    await page.$eval(
      '#scrollerB',
      (el, sl) => {
        el.scrollLeft = sl;
      },
      scrollLeft
    );
    await page.waitForTimeout(30);
    const a = await rect('[data-tag="sticky0-a"]');
    const control = await rect('[data-tag="static-a"]');
    const b = await rect('[data-tag="stickyFixed-b"]');
    console.log(
      `  scrollLeft=${scrollLeft}  A (inset: 0).left=${a.left}  control.left=${control.left}  B (inset: var).left=${b.left}`
    );
  }

  await browser.close();
}

for (const [name, launcher] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit]
]) {
  await run(name, launcher);
}
