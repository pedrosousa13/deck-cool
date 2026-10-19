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

for (const id of [
  'bleed--plain',
  'bleed--fade',
  'bleed--stack',
  'bleed--curve',
  'bleed--loop',
  'bleed--loop-shells',
  'recipes--viewport-bleed'
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

// #196: at this suite's own viewport, `bleed--loop`'s run comfortably fits
// the bled viewport, so the deck settles with nothing to loop at all
// (ADR-0009). The axe loop above, opening the story and reading it back,
// proves it settles there, with no "Maximum update depth exceeded", in
// every engine the suite runs; there is no Prev or Next to wrap with at
// this width (see `width-sweep.mjs` for the narrower page widths this
// settles, or never used to, at).
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

// #196: `width-sweep.mjs` found `bleed--loop` crashing, with "Maximum
// update depth exceeded", from a 1011px page through 1400px, in Chromium,
// Firefox and WebKit alike; `crash-boundary.mjs` rechecks the same width
// directly. The axe loop above opens this story at the suite's own,
// wider default viewport, comfortably past where this settles with
// nothing to loop at all (the comment above it): this test is the one
// that actually sits at the narrow boundary where the crash was found.
// `openStory`'s own wait for `data-in-view` never resolves while the
// engine is stuck restarting forever, so a regression here fails by
// timing the test out, the same "never settled" `width-sweep.mjs` reports,
// whether or not this engine also logs the React message.
test('bleed--loop settles at the 1011px width the crash was found at, with no page error', async ({
  page
}) => {
  await page.setViewportSize({ width: 1011, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openStory(page, 'bleed--loop');

  expect(
    errors.some((text) => /maximum update depth exceeded/i.test(text))
  ).toBe(false);
  const deck = page.getByRole('region', { name: 'Featured slides' });
  await expect(deck).toHaveAttribute('data-index', '0');
});

// #177's recipe: `apps/storybook/stories/recipes/viewport-bleed.css`, quoted
// byte for byte in `packages/docs/recipes/viewport-bleed.md`. Its snapping
// is the same mechanic `bleed--plain`'s own "snaps to the column, not the
// page" tests already cover, on the same CSS: no second test repeats that
// here, only what is specific to this story, that the bleed actually makes
// a slide past the column visible.

test('recipes--viewport-bleed: a slide past the column is visible beyond it', async ({
  page
}) => {
  await openStory(page, 'recipes--viewport-bleed');
  const column = page.locator('.column');
  const columnRight = await column.evaluate(
    (el) => el.getBoundingClientRect().right
  );
  // At rest, 2.5 slides fit the column: the first two fill it and the third
  // straddles its edge, so it is still partly inside the column, where
  // toBeInViewport would pass on that unclipped half whether or not the
  // bleed CSS is there. The fourth slide sits wholly past the column, in
  // the bled padding: only the bleed keeps it from being clipped at the
  // column's edge.
  const fourth = page.locator('[data-carouseldeck-slide]').nth(3);
  const fourthBox = await fourth.boundingBox();
  if (!fourthBox) throw new Error('the fourth slide has no box');
  expect(fourthBox.x).toBeGreaterThan(columnRight);
  await expect(fourth).toBeInViewport();
});
