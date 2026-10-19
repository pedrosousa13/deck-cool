// Question 4, and the review question it raised: is `bleed--loop`'s crash
// (React's "Maximum update depth exceeded") caused by the bleed CSS, or
// would any copies-mode loop whose run is about as wide as its viewport
// crash the same way? Opens both `bleed--loop` (six 145px-equivalent
// slides, bled past a 400px column) and `bleed--loop-plain-boundary` (the
// same run length, six 145px slides with no bleed CSS at all) at the same
// range of viewport widths, in Chromium, Firefox and WebKit, and reports
// whether each settles.
//
// Requires the storybook dev server on :4173 (`pnpm --filter
// @carouseldeck/storybook exec storybook dev --ci --no-open -p 4173
// --host 127.0.0.1`, from decks/carouseldeck).
//
// Run from decks/carouseldeck:
//   node prototypes/viewport-bleed/crash-boundary.mjs <chromium|firefox|webkit> <width>...

import { chromium, firefox, webkit } from 'playwright';

const engines = { chromium, firefox, webkit };
const [engineName, ...widthArgs] = process.argv.slice(2);
const launcher = engines[engineName];
const widths = widthArgs.map(Number);

if (!launcher || widths.length === 0) {
  console.error(
    'usage: node crash-boundary.mjs <chromium|firefox|webkit> <width>...'
  );
  process.exit(1);
}

async function test(id, width) {
  const browser = await launcher.launch();
  const page = await browser.newPage({ viewport: { width, height: 720 } });
  let crashed = false;
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Maximum update depth')
    ) {
      crashed = true;
    }
  });
  await page.goto(`http://127.0.0.1:4173/iframe.html?id=${id}&viewMode=story`);
  let settled = false;
  try {
    await page.waitForFunction(
      () => {
        const viewports = [
          ...document.querySelectorAll('[data-carouseldeck-viewport]')
        ];
        return (
          viewports.length > 0 &&
          viewports.every((viewport) =>
            viewport.querySelector('[data-carouseldeck-slide][data-in-view]')
          )
        );
      },
      { timeout: 5000 }
    );
    settled = true;
  } catch {
    // Timed out: never settled.
  }
  console.log(`  ${id} width=${width}: settled=${settled} crashed=${crashed}`);
  await browser.close();
}

for (const width of widths) {
  console.log(`[${engineName}] width=${width}`);
  await test('bleed--loop', width);
  await test('bleed--loop-plain-boundary', width);
}
