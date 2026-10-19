import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openStory } from './open-story';

// #188: can a deck's viewport bleed past a centred column, in CSS alone?
// `apps/storybook/stories/bleed.stories.tsx` renders the recipe
// (`prototypes/viewport-bleed/FINDINGS.md`, question 1) around a plain deck
// and each stacked effect; this checks, in every engine the suite runs
// (Chromium, Firefox and WebKit), that the deck still behaves as it does
// without the bleed: snapping lands on the column, the index stays right,
// and a stacked effect's sticky slide sticks at the column's edge.

/** The centred column's left edge, in viewport pixels: where a slide rests
 * without the bleed, and where it should keep resting with it. */
function columnLeft(page: Page) {
  return page
    .locator('.column')
    .evaluate((el) => el.getBoundingClientRect().left);
}

/** The current (or focal) slide's left edge, in viewport pixels, rounded
 * for a stable comparison against `columnLeft`. */
function slideLeft(page: Page, attribute: 'data-current' | 'data-focal') {
  return page
    .locator(`[data-carouseldeck-slide][${attribute}]`)
    .evaluate((el) => Math.round(el.getBoundingClientRect().left));
}

// `bleed--loop` is not in this axe loop: question 4 found it crashes
// (React's "Maximum update depth exceeded") once the bled viewport, which
// is wider than the column, is about as wide as the slides' whole run,
// true at this suite's own viewport size. `Loop`'s own doc comment in
// bleed.stories.tsx, and `prototypes/viewport-bleed/FINDINGS.md`, question
// 4, have the finding: no test opens that story.
for (const id of [
  'bleed--plain',
  'bleed--fade',
  'bleed--stack',
  'bleed--curve',
  'bleed--loop-shells'
]) {
  test(`${id}: passes axe`, async ({ page }) => {
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

test('bleed--plain: snaps to the column, not the page, after Next', async ({
  page
}) => {
  await openStory(page, 'bleed--plain');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const col = await columnLeft(page);

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(deck).toHaveAttribute('data-index', String(i + 1));
    await expect
      .poll(() => slideLeft(page, 'data-current'))
      .toBe(Math.round(col));
  }
});

test('bleed--plain: snaps to the column after a dot, an arrow key and a drag', async ({
  page
}) => {
  await openStory(page, 'bleed--plain');
  const col = await columnLeft(page);

  await page
    .getByRole('group', { name: 'Choose page' })
    .getByRole('button', { name: 'Go to page 2' })
    .click();
  await expect
    .poll(() => slideLeft(page, 'data-current'))
    .toBe(Math.round(col));

  await openStory(page, 'bleed--plain');
  await page.locator('[data-carouseldeck-viewport]').first().focus();
  const deck = page.getByRole('region', { name: 'Featured slides' });
  // A native key scroll moves by the browser's own small, unsnapped
  // increment (ADR-0013), then settles on the nearest snap point; a second
  // press before the first settles chains onto it (as a flick does, in
  // WebKit especially), so one press only, held still before the next.
  await page.keyboard.press('ArrowRight');
  await expect(deck).not.toHaveAttribute('data-index', '0');
  await expect
    .poll(() => slideLeft(page, 'data-current'), { timeout: 10000 })
    .toBe(Math.round(col));

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
  await expect
    .poll(() => slideLeft(page, 'data-current'))
    .toBe(Math.round(col));
});

for (const id of ['bleed--fade', 'bleed--stack']) {
  test(`${id}: sticky slide sticks at the column, not the page`, async ({
    page
  }) => {
    await openStory(page, id);
    const col = await columnLeft(page);

    await expect
      .poll(() => slideLeft(page, 'data-focal'))
      .toBe(Math.round(col));
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect
        .poll(() => slideLeft(page, 'data-focal'))
        .toBe(Math.round(col));
    }
  });
}

test('bleed--curve: keeps its scroll range under the bleed padding', async ({
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

// Shells mode only: see the comment above the axe loop, and `Loop`'s own
// doc comment in bleed.stories.tsx.
test('bleed--loop-shells: wraps around onto the column, not the page', async ({
  page
}) => {
  await openStory(page, 'bleed--loop-shells');
  const col = await columnLeft(page);

  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect
    .poll(() => slideLeft(page, 'data-current'))
    .toBe(Math.round(col));
});
