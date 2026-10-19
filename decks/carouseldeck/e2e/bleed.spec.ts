import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// #188: can a deck's viewport bleed past a centred column, in CSS alone?
// `apps/storybook/stories/bleed.stories.tsx` renders the recipe
// (`docs/research/viewport-bleed.md`, question 1) around a plain deck and
// each stacked effect; this checks, in every engine the suite runs
// (Chromium, Firefox and WebKit), that the deck still behaves as it does
// without the bleed: snapping lands on the column, the index stays right,
// and a stacked effect's sticky slide sticks at the column's edge.

/** As `deck.spec.ts`'s own `openStory`: waits until every deck in the story
 * is rendered and measured. */
async function openStory(page: Page, id: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story`);
  await page.waitForFunction(() => {
    const viewports = [
      ...document.querySelectorAll('[data-carouseldeck-viewport]')
    ];
    return (
      viewports.length > 0 &&
      viewports.every((viewport) =>
        viewport.querySelector('[data-carouseldeck-slide][data-in-view]')
      )
    );
  });
}

/** The centred column's left edge, in viewport pixels: where a slide rests
 * without the bleed, and where it should keep resting with it. */
function columnLeft(page: Page) {
  return page
    .locator('.column')
    .evaluate((el) => el.getBoundingClientRect().left);
}

// `bleed--loop` is not here: question 4 found it crashes (React's "Maximum
// update depth exceeded") once the bled viewport, which is wider than the
// column, is about as wide as the slides' whole run -- true at this suite's
// own viewport size. `docs/research/viewport-bleed.md` has the finding; the
// story stays, as a reproduction, but no test opens it.
for (const id of [
  'bleed--plain',
  'bleed--fade',
  'bleed--stack',
  'bleed--curve',
  'bleed--loop-shells'
]) {
  test(`the ${id} story passes axe`, async ({ page }) => {
    await openStory(page, id);
    // A story's entry animation, mid-fade, would read as low contrast, as
    // `deck.spec.ts`'s own per-story axe test awaits (a looping slide's
    // placement runs on a scroll timeline and never finishes, so only
    // document-timeline animations are awaited).
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline instanceof DocumentTimeline)
          .map((a) => a.finished)
      )
    );
    // Curve fades each slide with its distance from the focal one, by
    // design, so the slides out of focus are low in contrast, as
    // `deck.spec.ts`'s own curve stories are: contrast is checked on the
    // focal slide and the controls, every other rule everywhere.
    const axe = () =>
      new AxeBuilder({ page }).include('[aria-roledescription="carousel"]');
    if (id !== 'bleed--curve') {
      expect((await axe().analyze()).violations).toEqual([]);
      return;
    }
    expect(
      (await axe().disableRules(['color-contrast']).analyze()).violations
    ).toEqual([]);
    expect(
      (
        await axe()
          .withRules(['color-contrast'])
          .exclude('[data-carouseldeck-slide]:not([data-focal])')
          .analyze()
      ).violations
    ).toEqual([]);
  });
}

test('a plain deck snaps to the column, not the page, after Next', async ({
  page
}) => {
  await openStory(page, 'bleed--plain');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const col = await columnLeft(page);

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(deck).toHaveAttribute('data-index', String(i + 1));
    await expect
      .poll(() =>
        page
          .locator('[data-carouseldeck-slide][data-current]')
          .evaluate((el) => Math.round(el.getBoundingClientRect().left))
      )
      .toBe(Math.round(col));
  }
});

test('a plain deck snaps to the column after a dot, an arrow key and a drag', async ({
  page
}) => {
  await openStory(page, 'bleed--plain');
  const col = await columnLeft(page);
  const slideLeft = () =>
    page
      .locator('[data-carouseldeck-slide][data-current]')
      .evaluate((el) => Math.round(el.getBoundingClientRect().left));

  await page
    .getByRole('group', { name: 'Choose page' })
    .getByRole('button', { name: 'Go to page 2' })
    .click();
  await expect.poll(slideLeft).toBe(Math.round(col));

  await openStory(page, 'bleed--plain');
  await page.locator('[data-carouseldeck-viewport]').first().focus();
  const deck = page.getByRole('region', { name: 'Featured slides' });
  // A native key scroll moves by the browser's own small, unsnapped
  // increment (ADR-0013), then settles on the nearest snap point; a second
  // press before the first settles chains onto it (as a flick does, in
  // WebKit especially), so one press only, held still before the next.
  await page.keyboard.press('ArrowRight');
  await expect(deck).not.toHaveAttribute('data-index', '0');
  await expect.poll(slideLeft, { timeout: 10000 }).toBe(Math.round(col));

  await openStory(page, 'bleed--plain');
  // As `deck.spec.ts`'s own drag test: a drag over one slide's own box,
  // held still before release so the deck settles on the nearest slide
  // rather than flinging on.
  const slide = page.locator('[data-carouseldeck-slide]').first();
  const box = (await slide.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await expect.poll(slideLeft).toBe(Math.round(col));
});

for (const id of ['bleed--fade', 'bleed--stack']) {
  test(`${id}'s sticky slide sticks at the column, not the page`, async ({
    page
  }) => {
    await openStory(page, id);
    const col = await columnLeft(page);
    const focalLeft = () =>
      page
        .locator('[data-carouseldeck-slide][data-focal]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().left));

    await expect.poll(focalLeft).toBe(Math.round(col));
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect.poll(focalLeft).toBe(Math.round(col));
    }
  });
}

test('curve keeps its scroll range under the bleed padding', async ({
  page
}) => {
  await openStory(page, 'bleed--curve');
  const viewport = page.locator('[data-carouseldeck-viewport]').first();
  const scrollWidth = () => viewport.evaluate((el) => el.scrollWidth);
  const before = await scrollWidth();

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(500);
  // The curve turns and drops each slide's content, contained (ADR-0008):
  // under the bleed padding it must still add no scrollable overflow.
  expect(await scrollWidth()).toBe(before);
});

// Shells mode only: see the note above `bleed--plain`'s axe loop.
for (const id of ['bleed--loop-shells']) {
  test(`${id} wraps around onto the column, not the page`, async ({ page }) => {
    await openStory(page, id);
    const col = await columnLeft(page);
    const slideLeft = () =>
      page
        .locator('[data-carouseldeck-slide][data-current]')
        .evaluate((el) => Math.round(el.getBoundingClientRect().left));

    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect.poll(slideLeft).toBe(Math.round(col));
  });
}
