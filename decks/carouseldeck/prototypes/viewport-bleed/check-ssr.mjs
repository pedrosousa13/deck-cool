// Question 5: loads ssr.html (written by render-ssr.mjs) with JavaScript
// disabled, so nothing hydrates or measures, and checks that the first
// slide already sits on the column's own left edge, in Chromium, Firefox
// and WebKit.
//
// Run from decks/carouseldeck:
//   node prototypes/viewport-bleed/render-ssr.mjs
//   node prototypes/viewport-bleed/check-ssr.mjs

import { chromium, firefox, webkit } from 'playwright';
import { pathToFileURL } from 'node:url';

const file = pathToFileURL(
  new URL('./ssr.html', import.meta.url).pathname
).toString();

async function run(name, launcher) {
  const browser = await launcher.launch();
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1000, height: 700 }
  });
  const page = await context.newPage();
  await page.goto(file);

  const slide = await page.$eval('[data-carouseldeck-slide]', (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width) };
  });
  const column = await page.$eval('.column', (el) =>
    Math.round(el.getBoundingClientRect().left)
  );
  console.log(
    `${name} (JS disabled): first slide left=${slide.left} width=${slide.width} column.left=${column} match=${slide.left === column}`
  );

  await browser.close();
}

for (const [name, launcher] of [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit]
]) {
  await run(name, launcher);
}
