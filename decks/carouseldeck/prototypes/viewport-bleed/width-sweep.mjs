// Question 4: `bleed--loop` (six slides, a run too short for shells) across
// a sweep of page widths, in Chromium, Firefox and WebKit, to find the
// boundary where the bled viewport stops settling. Requires the storybook
// dev server on :4173 (`pnpm --filter @carouseldeck/storybook exec
// storybook dev --ci --no-open -p 4173 --host 127.0.0.1`, from
// decks/carouseldeck).
//
// Run from decks/carouseldeck:
//   node prototypes/viewport-bleed/width-sweep.mjs <chromium|firefox|webkit> <width>...

import { chromium, firefox, webkit } from 'playwright';

const engines = { chromium, firefox, webkit };
const [engineName, ...widthArgs] = process.argv.slice(2);
const launcher = engines[engineName];
const widths = widthArgs.map(Number);

if (!launcher || widths.length === 0) {
  console.error(
    'usage: node width-sweep.mjs <chromium|firefox|webkit> <width>...'
  );
  process.exit(1);
}

async function test(width) {
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
  await page.goto(
    'http://127.0.0.1:4173/iframe.html?id=bleed--loop&viewMode=story'
  );
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
    // Timed out: never settled, the same symptom as the crash, whether or
    // not this engine also logged the "Maximum update depth" message.
  }
  console.log(`width=${width}: settled=${settled} crashed=${crashed}`);
  await browser.close();
}

for (const width of widths) {
  await test(width);
}
