import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openStory } from './open-story';

/**
 * Watches the deck's viewport for the next scroll to end. Await it before a
 * gesture, so the watch is in place; the function it returns resolves, once
 * that scroll ends, with how far the viewport got from where it was along
 * its axis at most, or 0 if no scroll ends within two seconds, so a gesture
 * that scrolls nothing fails rather than hangs.
 */
async function watchScroll(page: Page): Promise<() => Promise<number>> {
  const viewport = page.locator('[data-carouseldeck-viewport]').first();
  await viewport.evaluate((el) => {
    const at = () => Math.abs(el.scrollLeft) + el.scrollTop;
    const start = at();
    let furthest = 0;
    const onScroll = () => {
      furthest = Math.max(furthest, Math.abs(at() - start));
    };
    (el as unknown as { ended: Promise<number> }).ended = new Promise(
      (resolve) => {
        const done = () => {
          el.removeEventListener('scroll', onScroll);
          clearTimeout(timer);
          resolve(furthest);
        };
        const timer = setTimeout(done, 2000);
        el.addEventListener('scroll', onScroll);
        el.addEventListener('scrollend', done, { once: true });
      }
    );
  });
  return () =>
    viewport.evaluate(
      (el) => (el as unknown as { ended: Promise<number> }).ended
    );
}

const stories = [
  'deck--default',
  'deck--peek',
  'deck--starting-index',
  'deck--controlled',
  'deck--pages',
  'deck--drag',
  'deck--click-to-focus',
  'deck--vertical',
  'deck--right-to-left',
  'deck--progress',
  'deck--fade',
  'deck--stack',
  'deck--curve',
  'deck--autoplay',
  'deck--thumbnails',
  'deck--themed',
  'deck--loop',
  'deck--loop-pages',
  'deck--loop-vertical',
  'deck--loop-right-to-left',
  'deck--playdeck-video',
  'deck--playdeck-video-loop',
  'recipes--centred-ends',
  'recipes--middle-centred',
  'recipes--middle-by-progress',
  'recipes--curve-size',
  'recipes--card-stack',
  'recipes--card-stack-fanned',
  'recipes--custom-controls',
  'recipes--per-breakpoint'
];

/** Stories with the curve effect, which fades the slides out of focus. */
const curveStories = ['deck--curve', 'recipes--curve-size'];

for (const id of stories) {
  test(`the ${id} story passes axe`, async ({ page }) => {
    await openStory(page, id);
    const deck = page.getByRole('region', { name: 'Featured slides' });
    await expect(deck).toBeVisible();
    await expect(
      deck.getByRole('group', { name: /^1 of \d+$/ })
    ).toBeAttached();
    // A story's entry animation, mid-fade, would read as low contrast. A
    // looping slide's placement runs on a scroll timeline and never
    // finishes (#145), so only document-timeline animations are awaited.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline instanceof DocumentTimeline)
          .map((a) => a.finished)
      )
    );

    // Axe's default rule set, scoped to the deck rather than Storybook's own
    // iframe chrome, which is not ours to fix.
    const axe = () =>
      new AxeBuilder({ page }).include('[aria-roledescription="carousel"]');
    if (!curveStories.includes(id)) {
      expect((await axe().analyze()).violations).toEqual([]);
      return;
    }
    // Curve fades each slide with its distance from the focal one, by
    // design, so the slides out of focus are low in contrast. Chromium's axe
    // cannot resolve the turned content's background there and leaves it
    // incomplete; Firefox's and WebKit's report it. So contrast is checked
    // on the focal slide and the controls, every other rule everywhere.
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

/**
 * Per slide of the playdeck recipe, whether its video is playing; a slide
 * whose player has not loaded yet has no video, and is not playing.
 */
const videosPlaying = (page: Page) =>
  page
    .getByRole('region', { name: 'Featured slides' })
    .locator('[data-carouseldeck-slide]')
    .evaluateAll((slides) =>
      slides.map((slide) => {
        const video = slide.querySelector('video');
        return video !== null && !video.paused && video.currentTime > 0;
      })
    );

/**
 * Per slide, whether the looping playdeck story's recipe holds a player
 * handle for it; the story puts the recipe's players on `window`.
 */
const handlesHeld = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      { length: 4 },
      (_, i) =>
        (window as unknown as { playdeckPlayers?: readonly unknown[] })
          .playdeckPlayers?.[i] != null
    )
  );

/** Whether the slide `selector` picks has a frame of its video to show,
 * wherever it is currently placed (ADR-0013). */
const videoHasFrame = (page: Page, selector: string) =>
  page
    .getByRole('region', { name: 'Featured slides' })
    .locator(selector)
    .evaluate((slide) => {
      const video = slide.querySelector('video');
      return (
        video !== null &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0
      );
    });

/** Resolves once the focal slide's video can play. */
const focalVideoLoaded = (page: Page) =>
  expect
    .poll(() =>
      page
        .locator('[data-carouseldeck-slide][data-focal] video')
        .evaluateAll((videos: HTMLVideoElement[]) =>
          videos.some(
            (video) => video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
          )
        )
    )
    .toBe(true);

test("the playdeck recipe plays the focal slide's video and pauses the rest", async ({
  page
}) => {
  await openStory(page, 'deck--playdeck-video');
  const deck = page.getByRole('region', { name: 'Featured slides' });

  await expect
    .poll(() => videosPlaying(page))
    .toEqual([true, false, false, false]);

  await deck.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(deck.getByRole('group', { name: '2 of 4' })).toHaveAttribute(
    'data-focal'
  );
  await expect
    .poll(() => videosPlaying(page))
    .toEqual([false, true, false, false]);
});

test("the looping playdeck recipe plays the focal slide's video across the seam both ways", async ({
  page
}) => {
  await openStory(page, 'deck--playdeck-video-loop');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  /** Steps the deck, and checks the slide it rests on is focal, its video
   * the one playing, and every slide's handle held. */
  const step = async (
    name: 'Previous' | 'Next',
    focal: string,
    playing: boolean[]
  ) => {
    await deck.getByRole('button', { name, exact: true }).click();
    await expect(deck.getByRole('group', { name: focal })).toHaveAttribute(
      'data-focal'
    );
    await expect.poll(() => videosPlaying(page)).toEqual(playing);
    // Each slide mounts once (ADR-0013): a settle never remounts it, so no
    // handle is ever replaced or cleared, ruling out a reload crossing the
    // seam as surely as a copy's own player would have.
    expect(await handlesHeld(page)).toEqual([true, true, true, true]);
  };

  await expect
    .poll(() => videosPlaying(page))
    .toEqual([true, false, false, false]);
  expect(await handlesHeld(page)).toEqual([true, true, true, true]);

  // Back across the seam: onto slide 4 itself, placed there, then the jump.
  await step('Previous', '4 of 4', [false, false, false, true]);
  // The slides either side of the seam show a still frame of their own
  // video, not a blank, wherever they are currently placed.
  await expect
    .poll(() => videoHasFrame(page, '[aria-label="4 of 4"]'))
    .toBe(true);
  await expect
    .poll(() => videoHasFrame(page, '[aria-label="1 of 4"]'))
    .toBe(true);
  // On across the seam, and one more.
  await step('Next', '1 of 4', [true, false, false, false]);
  await step('Next', '2 of 4', [false, true, false, false]);
});

test('under reduced motion the playdeck recipe plays no video by itself', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openStory(page, 'deck--playdeck-video');
  const deck = page.getByRole('region', { name: 'Featured slides' });

  await focalVideoLoaded(page);
  // Long enough for a play the recipe asked for to have started.
  await page.waitForTimeout(500);
  expect(await videosPlaying(page)).toEqual([false, false, false, false]);

  await deck.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(deck.getByRole('group', { name: '2 of 4' })).toHaveAttribute(
    'data-focal'
  );
  await focalVideoLoaded(page);
  await page.waitForTimeout(500);
  expect(await videosPlaying(page)).toEqual([false, false, false, false]);
});

test('turning on reduced motion pauses the playdeck recipe, and turning it off plays the focal video again', async ({
  page
}) => {
  await openStory(page, 'deck--playdeck-video');
  await expect
    .poll(() => videosPlaying(page))
    .toEqual([true, false, false, false]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => videosPlaying(page))
    .toEqual([false, false, false, false]);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => videosPlaying(page))
    .toEqual([true, false, false, false]);
});

test('tabbing into an off-screen slide scrolls it into view', async ({
  page
}) => {
  await openStory(page, 'deck--default');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  await deck.getByRole('button', { name: 'Action 1' }).focus();

  await page.keyboard.press('Tab');

  await expect(deck.getByRole('button', { name: 'Action 2' })).toBeFocused();
  await expect(deck.getByRole('group', { name: '2 of 6' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck).toHaveAttribute('data-index', '1');
});

test('tabbing into the next slide as Next moves the deck rests it on that slide', async ({
  page
}) => {
  await openStory(page, 'deck--default');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  // How far slide 2 is from the viewport's start edge.
  const offset = async () =>
    Math.round(
      (await deck.getByRole('group', { name: '2 of 6' }).boundingBox())!.x -
        (await viewport.boundingBox())!.x
    );
  await deck.getByRole('button', { name: 'Action 1' }).focus();

  // Next pressed without moving focus, then Tab while the deck moves.
  await deck
    .getByRole('button', { name: 'Next' })
    .evaluate((next: HTMLElement) => next.click());
  await page.waitForTimeout(60);
  await page.keyboard.press('Tab');

  await expect(deck.getByRole('button', { name: 'Action 2' })).toBeFocused();
  await expect.poll(offset).toBe(0);
  await page.waitForTimeout(400);
  expect(await offset()).toBe(0);
  await expect(deck).toHaveAttribute('data-index', '1');
  await expect(deck.getByRole('group', { name: '2 of 6' })).toBeInViewport({
    ratio: 1
  });
});

test('Shift+Tab out of a slide onto the viewport as Next moves the deck rests it on the next slide', async ({
  page
}) => {
  await openStory(page, 'deck--default');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  // How far slide 2 is from the viewport's start edge.
  const offset = async () =>
    Math.round(
      (await deck.getByRole('group', { name: '2 of 6' }).boundingBox())!.x -
        (await viewport.boundingBox())!.x
    );
  await deck.getByRole('button', { name: 'Action 1' }).focus();

  // Next pressed without moving focus, then Shift+Tab while the deck moves.
  await deck
    .getByRole('button', { name: 'Next' })
    .evaluate((next: HTMLElement) => next.click());
  await page.waitForTimeout(60);
  await page.keyboard.press('Shift+Tab');

  await expect(viewport).toBeFocused();
  await expect.poll(offset).toBe(0);
  await page.waitForTimeout(400);
  expect(await offset()).toBe(0);
  await expect(deck).toHaveAttribute('data-index', '1');
});

test('a controlled deck follows the index its parent sets', async ({
  page
}) => {
  await openStory(page, 'deck--controlled');
  const deck = page.getByRole('region', { name: 'Featured slides' });

  await page
    .getByRole('group', { name: 'Go to slide' })
    .getByRole('button', { name: '4' })
    .click();

  await expect(deck.getByRole('group', { name: '4 of 6' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck).toHaveAttribute('data-index', '3');
});

test('clicking a thumbnail moves the main deck and marks the thumbnail', async ({
  page
}) => {
  await openStory(page, 'deck--thumbnails');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const strip = page.getByRole('region', { name: 'Thumbnails' });

  await strip.getByRole('button', { name: 'Slide 3' }).click();

  await expect(deck.getByRole('group', { name: '3 of 8' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck).toHaveAttribute('data-index', '2');
  await expect(strip.getByRole('button', { name: 'Slide 3' })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(
    strip.getByRole('button', { name: 'Slide 1' })
  ).not.toHaveAttribute('aria-current');
});

test('moving the main deck marks its thumbnail and brings it into view in the strip', async ({
  page
}) => {
  await openStory(page, 'deck--thumbnails');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const strip = page.getByRole('region', { name: 'Thumbnails' });
  const thumb = (n: number) =>
    strip.getByRole('button', { name: `Slide ${n}` });
  // The strip shows the first few thumbnails, not the last.
  await expect(thumb(8)).not.toBeInViewport({ ratio: 1 });

  await deck.getByRole('group', { name: '8 of 8' }).scrollIntoViewIfNeeded();

  await expect(deck).toHaveAttribute('data-index', '7');
  await expect(thumb(8)).toHaveAttribute('aria-current', 'true');
  await expect(thumb(8)).toBeInViewport({ ratio: 1 });

  await deck.getByRole('button', { name: 'Previous' }).click();

  await expect(deck).toHaveAttribute('data-index', '6');
  await expect(thumb(7)).toHaveAttribute('aria-current', 'true');
  await expect(thumb(7)).toBeInViewport({ ratio: 1 });
});

test('following the main deck scrolls the strip, never the page', async ({
  page
}) => {
  await openStory(page, 'deck--thumbnails');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const strip = page.getByRole('region', { name: 'Thumbnails' });
  // A window just tall enough for the main deck puts the strip below the fold.
  const stripTop = await strip.evaluate((el) => el.getBoundingClientRect().top);
  await page.setViewportSize({ width: 1280, height: Math.floor(stripTop) });
  await expect(strip).not.toBeInViewport();
  const thumbInStrip = (n: number) =>
    strip.getByRole('button', { name: `Slide ${n}` }).evaluate((thumb) => {
      const t = thumb.getBoundingClientRect();
      const s = thumb
        .closest('[data-carouseldeck-viewport]')!
        .getBoundingClientRect();
      return t.left >= s.left - 1 && t.right <= s.right + 1;
    });
  expect(await thumbInStrip(6)).toBe(false);

  for (let i = 0; i < 5; i++) {
    await deck.getByRole('button', { name: 'Next' }).click();
  }

  await expect(deck).toHaveAttribute('data-index', '5');
  await expect.poll(() => thumbInStrip(6)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(strip).not.toBeInViewport();
});

test('a dot moves the deck to its page and the counter follows', async ({
  page
}) => {
  await openStory(page, 'deck--default');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const dots = deck.getByRole('group', { name: 'Choose page' });
  await expect(deck.getByText('1 / 6')).toBeVisible();

  await dots.getByRole('button', { name: 'Go to page 3' }).click();

  await expect(deck.getByRole('group', { name: '3 of 6' })).toBeInViewport({
    ratio: 1
  });
  await expect(
    dots.getByRole('button', { name: 'Go to page 3' })
  ).toHaveAttribute('aria-current', 'true');
  await expect(deck.getByText('3 / 6')).toBeVisible();
});

test('a paged deck steps a page at a time, its page size set per breakpoint', async ({
  page
}) => {
  await openStory(page, 'deck--pages');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  await expect(deck.getByText('1 / 4')).toBeVisible();

  await deck.getByRole('button', { name: 'Next' }).click();

  await expect(deck.getByRole('group', { name: '4 of 10' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck.getByText('2 / 4')).toBeVisible();

  // Below the breakpoint, one slide per page.
  await page.setViewportSize({ width: 400, height: 720 });
  await expect(deck.getByText(/ \/ 10$/)).toBeVisible();
});

test('a mouse drag moves the deck and settles on a slide, without following a link', async ({
  page
}) => {
  await openStory(page, 'deck--drag');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const link = deck.getByRole('link', { name: 'Article 1' });
  const box = (await link.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  // Held still before letting go, so the deck settles on the nearest slide:
  // Playwright's WebKit sends the moves within a few milliseconds, a speed
  // that would fling the deck on to the end.
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect(deck.getByRole('group', { name: '2 of 6' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck).toHaveAttribute('data-index', '1');
  expect(new URL(page.url()).hash).toBe('');
});

test('a plain click on a link in a slide still follows it', async ({
  page
}) => {
  await openStory(page, 'deck--drag');
  const deck = page.getByRole('region', { name: 'Featured slides' });

  await deck.getByRole('link', { name: 'Article 1' }).click();

  await expect(page).toHaveURL(/#article-1$/);
  await expect(deck).toHaveAttribute('data-index', '0');
});

test('with drag off, a mouse drag leaves the deck where it is', async ({
  page
}) => {
  await openStory(page, 'deck--drag', 'drag:!false');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const link = deck.getByRole('link', { name: 'Article 1' });
  const box = (await link.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  await page.mouse.up();

  await page.waitForTimeout(500);
  await expect(deck.getByRole('group', { name: '1 of 6' })).toBeInViewport({
    ratio: 1
  });
  await expect(deck).toHaveAttribute('data-index', '0');
});

test('the focal slide is at the snap alignment point, and clicking a slide in view brings it there', async ({
  page
}) => {
  await openStory(page, 'deck--click-to-focus');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const slide = (n: number) => deck.getByRole('group', { name: `${n} of 6` });
  // At the first snap point, slide 2 is nearer the centre than slide 1.
  await expect(slide(2)).toHaveAttribute('data-focal');
  await expect(deck).toHaveAttribute('data-index', '0');

  // Slide 3 is only partly in view: click its leading edge.
  await slide(3).click({ position: { x: 10, y: 10 } });

  await expect(slide(3)).toHaveAttribute('data-focal');
  await expect(slide(2)).not.toHaveAttribute('data-focal');
  await expect(deck).toHaveAttribute('data-index', '2');
});

test('a vertical deck steps down with Next and comes to rest on a snap point after a short scroll', async ({
  page,
  browserName
}) => {
  await openStory(page, 'deck--vertical');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  const top = async (n: number) =>
    (await deck.getByRole('group', { name: `${n} of 6` }).boundingBox())!.y -
    (await viewport.boundingBox())!.y;

  await deck.getByRole('button', { name: 'Next' }).click();

  await expect(deck).toHaveAttribute('data-index', '1');
  await expect.poll(() => top(2)).toBe(0);

  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const moved = await watchScroll(page);
  await page.mouse.wheel(0, 40);
  // The scroll really moved the deck, so the rest below is not the start.
  expect(await moved()).toBeGreaterThan(0);

  if (browserName === 'chromium') {
    // Chromium scrolls 40px and snaps back to the same slide.
    await expect.poll(() => top(2)).toBe(0);
    await expect(deck).toHaveAttribute('data-index', '1');
    return;
  }
  // Firefox and WebKit take a wheel step under mandatory snapping as a move
  // to the next snap point, which the spec allows: the deck rests on slide
  // 3 and reports it.
  await expect.poll(() => top(3)).toBe(0);
  await expect(deck).toHaveAttribute('data-index', '2');
});

test('in a right-to-left document, Next moves toward the inline end', async ({
  page
}) => {
  await openStory(page, 'deck--right-to-left');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = (await deck
    .locator('[data-carouseldeck-viewport]')
    .boundingBox())!;
  const slide = (n: number) => deck.getByRole('group', { name: `${n} of 6` });
  // The first slide sits at the right, the inline start.
  const first = (await slide(1).boundingBox())!;
  expect(first.x + first.width).toBeCloseTo(viewport.x + viewport.width, 0);

  await deck.getByRole('button', { name: 'Next' }).click();

  await expect(deck).toHaveAttribute('data-index', '1');
  await expect(slide(2)).toBeInViewport({ ratio: 1 });
  // The first slide has moved off to the right.
  await expect
    .poll(async () => (await slide(1).boundingBox())!.x)
    .toBeGreaterThanOrEqual(viewport.x + viewport.width - 1);
});

// An app that switches locale changes `dir` on the document without a
// remount. Firefox and WebKit put the viewport back at its new start: the
// deck must stay on its slide, and go on the new way.
const directionStories = ['deck--default', 'deck--loop', 'deck--vertical'];

async function openForDir(page: Page, id: string) {
  await openStory(page, id);
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const slide = (n: number) => deck.getByRole('group', { name: `${n} of 6` });
  const box = async (n: number) => (await slide(n).boundingBox())!;
  const vertical = id === 'deck--vertical';
  return {
    deck,
    slide,
    next: deck.getByRole('button', { name: 'Next' }),
    setDir: (dir: string) =>
      page.evaluate((dir) => {
        document.documentElement.dir = dir;
      }, dir),
    /** Whether slide `b` lies after slide `a` the way the deck now runs. */
    after: async (a: number, b: number) => {
      const [from, to] = [await box(a), await box(b)];
      if (vertical) return to.y > from.y;
      const rtl = await page.evaluate(
        () => document.documentElement.dir === 'rtl'
      );
      return rtl ? to.x < from.x : to.x > from.x;
    }
  };
}

for (const id of directionStories) {
  test(`${id}: a live change of dir on the document keeps the current slide, and Next follows the new direction`, async ({
    page
  }) => {
    const { deck, slide, next, setDir, after } = await openForDir(page, id);

    await next.click();
    await expect(deck).toHaveAttribute('data-index', '1');
    await expect(slide(2)).toBeInViewport({ ratio: 1 });

    await setDir('rtl');

    await expect(slide(2)).toBeInViewport({ ratio: 1 });
    await expect(deck).toHaveAttribute('data-index', '1');
    await next.click();
    await expect(deck).toHaveAttribute('data-index', '2');
    await expect(slide(3)).toBeInViewport({ ratio: 1 });
    expect(await after(3, 4)).toBe(true);

    await setDir('ltr');

    await expect(slide(3)).toBeInViewport({ ratio: 1 });
    await expect(deck).toHaveAttribute('data-index', '2');
    await next.click();
    await expect(deck).toHaveAttribute('data-index', '3');
    await expect(slide(4)).toBeInViewport({ ratio: 1 });
    expect(await after(4, 5)).toBe(true);
  });

  test(`${id}: a change of dir mid-move rests the deck on the move's target, and announces only that`, async ({
    page
  }) => {
    const { deck, slide, next, setDir } = await openForDir(page, id);
    await next.click();
    await expect(deck).toHaveAttribute('data-index', '1');
    await expect(slide(2)).toBeInViewport({ ratio: 1 });
    // Every index the deck reports from here on.
    await deck.evaluate((root) => {
      const seen: string[] = [];
      (root as unknown as { seen: string[] }).seen = seen;
      new MutationObserver(() => seen.push(root.dataset.index!)).observe(root, {
        attributeFilter: ['data-index']
      });
    });

    // Next starts a move; the switch comes in the same task, before it ends.
    await next.evaluate((button) => {
      (button as HTMLButtonElement).click();
      document.documentElement.dir = 'rtl';
    });

    await expect(deck).toHaveAttribute('data-index', '2');
    await expect(slide(3)).toBeInViewport({ ratio: 1 });
    // Long enough for a stray settle, as on the start, to show.
    await page.waitForTimeout(500);
    await expect(slide(3)).toBeInViewport({ ratio: 1 });
    expect(
      await deck.evaluate(
        (root) => (root as unknown as { seen: string[] }).seen
      )
    ).toEqual(['2']);
    await setDir('ltr');
    await expect(slide(3)).toBeInViewport({ ratio: 1 });
  });
}

test('data-in-view marks the slides in view, and progress scales them', async ({
  page
}) => {
  await openStory(page, 'deck--progress');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const slide = (n: number) => deck.getByRole('group', { name: `${n} of 6` });
  const expectInViewMatchesViewport = async () => {
    for (let n = 1; n <= 6; n++) {
      if (await slide(n).evaluate((el) => el.hasAttribute('data-in-view'))) {
        await expect(slide(n)).toBeInViewport();
      } else {
        await expect(slide(n)).not.toBeInViewport();
      }
    }
  };
  const scale = (n: number) =>
    slide(n).evaluate((el) => getComputedStyle(el).scale);
  // Centred, two and a half in view: slide 1 at the start of the range,
  // slide 2 nearest the centre, slide 3 in part.
  await expect(slide(3)).toHaveAttribute('data-in-view');
  await expect(slide(4)).not.toHaveAttribute('data-in-view');
  await expectInViewMatchesViewport();

  await deck.getByRole('button', { name: 'Next' }).click();
  await deck.getByRole('button', { name: 'Next' }).click();

  await expect(deck).toHaveAttribute('data-index', '2');
  await expect(slide(1)).not.toHaveAttribute('data-in-view');
  await expect(slide(4)).toHaveAttribute('data-in-view');
  await expectInViewMatchesViewport();
  await expect.poll(() => scale(3)).toBe('1');
  await expect.poll(() => scale(4)).toBe('0.8');
});

test('a fade deck crossfades in place on Next, settles with one slide shown, and drags on', async ({
  page
}) => {
  await openStory(page, 'deck--fade');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  const slides = deck.locator('[data-carouseldeck-slide]');
  const opacities = () =>
    slides.evaluateAll((all) =>
      all.map((slide) => Number(getComputedStyle(slide).opacity))
    );
  await expect.poll(opacities).toEqual([1, 0, 0, 0]);

  // Record, in the page, what each frame the viewport scrolls in shows, and
  // read the record once the deck has settled: no frame is missed, however
  // late the click comes or slow the frames are. This scroll listener comes
  // after the deck's, so its frame callback reads the opacities after the
  // deck writes the slides' progress, as the frame shows them. A callback
  // requested earlier, as a loop of them is, reads the frame before's; and
  // under load, WebKit can scroll from one slide to the next with one frame
  // between them.
  await viewport.evaluate((el) => {
    const all = [...el.querySelectorAll('[data-carouseldeck-slide]')];
    const frames: number[][] = [];
    let moved = false;
    let frame = 0;
    const record = () => {
      frame = 0;
      frames.push(all.map((slide) => Number(getComputedStyle(slide).opacity)));
      const box = el.getBoundingClientRect();
      for (const slide of all) {
        const rect = slide.getBoundingClientRect();
        if (Math.abs(rect.left - box.left) > 1) moved = true;
      }
    };
    el.addEventListener('scroll', () => {
      frame ||= requestAnimationFrame(record);
    });
    Object.assign(el, { record: () => ({ frames, moved }) });
  });
  await deck.getByRole('button', { name: 'Next' }).click();

  await expect(deck).toHaveAttribute('data-index', '1');
  await expect.poll(opacities).toEqual([0, 1, 0, 0]);
  // A frame showed the two slides part each, and every slide stayed where
  // the viewport is. Any opacity between 0 and 1 counts: under load, that
  // one frame can fall near either end of the move.
  const { frames, moved } = await viewport.evaluate((el) =>
    (
      el as unknown as {
        record: () => { frames: number[][]; moved: boolean };
      }
    ).record()
  );
  const partShown = (frame: number[]) =>
    frame.filter((opacity) => opacity > 0 && opacity < 1).length;
  expect(frames.map(partShown)).toContain(2);
  expect(moved).toBe(false);
  await expect(slides.nth(1)).toHaveAttribute('data-focal');
  // The viewport scrolled natively; the slide shown is still at its start.
  expect(await viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(slides.nth(1)).toBeInViewport({ ratio: 1 });

  // A mouse drag moves the deck on and settles on the next slide.
  const box = (await viewport.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
  // Held still before letting go, so the deck settles on the nearest slide:
  // Playwright's WebKit sends the moves within a few milliseconds, a speed
  // that would fling the deck on to the end.
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect(deck).toHaveAttribute('data-index', '2');
  await expect.poll(opacities).toEqual([0, 0, 1, 0]);
  await expect(deck.getByRole('button', { name: 'Action 3' })).toBeInViewport();
});

for (const story of ['recipes--card-stack', 'recipes--card-stack-fanned']) {
  test(`${story} throws the top card on Next, and every frame of a full loop shows each card once: no hole at the back of the stack, and no card doubled`, async ({
    page
  }) => {
    await openStory(page, story);
    const deck = page.getByRole('region', { name: 'Featured slides' });
    const viewport = deck.locator('[data-carouseldeck-viewport]');
    const count = await deck
      .locator('[data-carouseldeck-slide]:not([data-carouseldeck-copy])')
      .count();

    // Record, in the page, how many cards each frame the viewport scrolls in
    // shows, and whether the first card, mid-throw, is left of where it rests,
    // as the fade test does: its
    // frame callback reads the cards after the deck writes their progress.
    // Firefox's smooth scroll rests a thousandth of a slide short of the snap
    // point for a few frames, so a hole, or the thrown card shown with its
    // copy, shows there in this record.
    await viewport.evaluate((el) => {
      const cards = [...el.querySelectorAll<HTMLElement>('.card')];
      const first = cards[0]!;
      const home = first.getBoundingClientRect().left;
      const shown: number[] = [];
      let thrown = false;
      let frame = 0;
      const record = () => {
        frame = 0;
        shown.push(
          cards.filter((card) => Number(getComputedStyle(card).opacity) > 0)
            .length
        );
        const progress = Number(
          first.parentElement!.style.getPropertyValue('--deck-slide-progress')
        );
        if (progress < 0 && progress > -1) {
          thrown ||= first.getBoundingClientRect().left < home - 1;
        }
      };
      el.addEventListener('scroll', () => {
        frame ||= requestAnimationFrame(record);
      });
      Object.assign(el, {
        record: () => ({ shown, thrown })
      });
    });

    for (let step = 1; step <= count; step++) {
      await deck.locator('[data-focal] button', { hasText: 'Next' }).click();
      await expect(deck).toHaveAttribute('data-index', String(step % count));
    }
    await expect(
      deck.getByRole('group', { name: `1 of ${count}` })
    ).toHaveAttribute('data-focal');

    const { shown, thrown } = await viewport.evaluate((el) =>
      (
        el as unknown as {
          record: () => { shown: number[]; thrown: boolean };
        }
      ).record()
    );
    // Under load, WebKit can scroll from one card to the next with one frame
    // between them, so any frame mid-throw with the card out to the left
    // counts.
    expect(thrown).toBe(true);
    expect(shown.filter((n) => n !== count)).toEqual([]);
  });
}

test('a curve deck fans its cards on an arc, settles upright on Next, and drags on with no page scrollbar', async ({
  page
}) => {
  await openStory(page, 'deck--curve');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  const slides = deck.locator('[data-carouseldeck-slide]');
  /** Each slide's card's rotation in whole degrees, clockwise. */
  const angles = () =>
    slides.evaluateAll((all) =>
      all.map((slide) => {
        const card = slide.firstElementChild!;
        const m = new DOMMatrix(getComputedStyle(card).transform);
        return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
      })
    );
  await expect.poll(angles).toEqual([0, 19, 42, 90, 90, 90]);

  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '1');
  await expect.poll(angles).toEqual([-19, 0, 19, 42, 90, 90]);
  await expect(slides.nth(1)).toHaveAttribute('data-focal');

  // Record, in the page, the page's overflow and size as the deck rests and
  // in each frame the viewport scrolls in while a mouse drag moves the deck
  // on, and read the record once the deck has settled: no frame is missed,
  // however late the drag comes or slow the frames are. This scroll listener
  // comes after the deck's, so its frame callback reads the page after the
  // deck writes the slides' progress, as the frame shows it.
  await viewport.evaluate((el) => {
    const html = document.documentElement;
    const frames: string[] = [];
    let frame = 0;
    const record = () => {
      frame = 0;
      frames.push(
        [
          html.scrollWidth - html.clientWidth,
          html.scrollHeight - html.clientHeight,
          html.clientWidth,
          html.clientHeight
        ].join()
      );
    };
    record();
    el.addEventListener('scroll', () => {
      frame ||= requestAnimationFrame(record);
    });
    Object.assign(el, { record: () => frames });
  });
  const box = (await viewport.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2 + 60, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 70, y, { steps: 12 });
  // Held still before letting go, so the deck settles on the nearest slide
  // rather than flinging on.
  await page.waitForTimeout(200);
  await page.mouse.up();

  await expect(deck).toHaveAttribute('data-index', '2');
  await expect.poll(angles).toEqual([-42, -19, 0, 19, 42, 90]);
  // The drag scrolled the deck through frames, and in every one the page's
  // size was as at rest and it did not overflow: no scrollbar appeared.
  const frames = await viewport.evaluate((el) =>
    (el as unknown as { record: () => string[] }).record()
  );
  expect(frames.length).toBeGreaterThan(1);
  expect([...new Set(frames)]).toHaveLength(1);
  const [overX, overY] = frames[0].split(',').map(Number);
  expect(overX).toBeLessThanOrEqual(0);
  expect(overY).toBeLessThanOrEqual(0);
});

test('an autoplay deck rotates quietly until its toggle stops it', async ({
  page
}) => {
  await openStory(page, 'deck--autoplay');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const live = deck.locator('[aria-live]');
  await expect(live).toHaveAttribute('aria-live', 'off');

  await expect(deck).toHaveAttribute('data-index', '1', { timeout: 5000 });
  await expect(live).toHaveAttribute('aria-live', 'off');

  await deck.getByRole('button', { name: 'Stop slide rotation' }).click();
  // Off the deck, so the pointer pauses nothing.
  await page.mouse.move(0, 0);

  const toggle = deck.getByRole('button', { name: 'Start slide rotation' });
  await expect(toggle).toBeVisible();
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await page.waitForTimeout(4000);
  await expect(deck).toHaveAttribute('data-index', '1');

  // A change the user makes is announced.
  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(live).toHaveText('Slide 3 of 6');
});

/**
 * The test's flick speed, in px/ms. The deck's thresholds are the engine's,
 * in packages/core/src/index.ts: a release faster than its `FLICK_PX_PER_MS`
 * is a flick, its speed measured over the moves in `VELOCITY_WINDOW_MS`, and
 * it carries `MOMENTUM_MS` at that speed. This speed is well over the flick
 * threshold, and slow enough to be a flick of one snap point, not a fling
 * across several, in every loop story.
 */
const FLICK_SPEED = 0.8;
/** The test's drag speed, in px/ms: under the engine's `FLICK_PX_PER_MS`. */
const DRAG_SPEED = 0.3;
/** How often a flick moves the pointer. */
const FLICK_MOVE_MS = 16;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A mouse flick on the deck's viewport: `distance` px along the axis at
 * `speed` px/ms, with a move every 16ms, let go at once. Positive moves the
 * pointer right, or down. The deck reads the release speed from the times
 * of the moves in its last 80ms, so each event is stamped on the gesture's
 * own clock, not when a busy machine gets round to it, and the deck reads
 * the same flick on every run:
 *
 * - In Chromium each event goes through CDP with its time, as the unit
 *   tests' gestures do (#49).
 * - Firefox and WebKit take no time for an input event. The moves are real,
 *   and the page restamps each pointer event before the deck hears it: see
 *   `stampFlick`. So there the deck reads the flick's times, not the
 *   browser's: these tests do not check how it paces input, nor the engine's
 *   check that a pointer held still before letting go (`STILL_MS`) releases
 *   at rest.
 *
 * Not covered in any browser: one that stalls 80ms or more at the end of
 * the flick may coalesce the last moves into one event, which leaves the deck
 * a single move in its velocity window, and it reads a drag.
 */
async function flick(
  page: Page,
  distance: number,
  axis: 'x' | 'y' = 'x',
  speed = FLICK_SPEED
) {
  const viewport = page.locator('[data-carouseldeck-viewport]').first();
  const box = (await viewport.boundingBox())!;
  const duration = Math.abs(distance) / speed;
  /** Where the pointer is `ms` into the flick. */
  const at = (ms: number) => {
    const d = distance * (ms / duration - 1 / 2);
    return axis === 'x'
      ? { x: box.x + box.width / 2 + d, y: box.y + box.height / 2 }
      : { x: box.x + box.width / 2, y: box.y + box.height / 2 + d };
  };
  if (page.context().browser()!.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now();
    const send = (
      type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
      ms: number,
      buttons: number
    ) =>
      cdp.send('Input.dispatchMouseEvent', {
        type,
        ...at(ms),
        button: type === 'mouseMoved' && !buttons ? 'none' : 'left',
        buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1,
        timestamp: (start + ms) / 1000
      });
    try {
      await send('mouseMoved', 0, 0);
      await send('mousePressed', 0, 1);
      // The gesture waits out each move, so no event is stamped later than
      // it is sent.
      for (let ms = 0; ms < duration;) {
        ms = Math.min(ms + FLICK_MOVE_MS, duration);
        await sleep(FLICK_MOVE_MS);
        await send('mouseMoved', ms, 1);
      }
      await send('mouseReleased', duration, 0);
    } finally {
      await cdp.detach();
    }
    return;
  }
  await page.mouse.move(at(0).x, at(0).y);
  await page.evaluate(stampFlick, { axis, speed });
  await page.mouse.down();
  for (let ms = 0; ms < duration;) {
    ms = Math.min(ms + FLICK_MOVE_MS, duration);
    await sleep(FLICK_MOVE_MS);
    await page.mouse.move(at(ms).x, at(ms).y);
  }
  await page.mouse.up();
  // Every pointer event the deck heard had the flick's time, or the flick
  // was the browser's pacing after all: fail rather than pass on that.
  const stamped = await page.evaluate(
    () => (window as unknown as { flickStamped: boolean[] }).flickStamped
  );
  expect(stamped.length).toBeGreaterThan(2);
  expect(stamped).not.toContain(false);
}

/**
 * Runs in the page, before a flick's press in Firefox and WebKit. Those
 * browsers stamp an input event when they handle it, which under load can be
 * far from when the flick made it. So until the release, each pointer event
 * is stamped, before the deck hears it, on the flick's own clock: the press
 * at its own time, and every move and the release when the flick, at its
 * steady speed, is where the event is. However late or bunched the browser
 * handles them, the deck reads the flick's speed. These are not the times
 * the browser gave: see `flick` for what that leaves unchecked.
 *
 * `window.flickStamped` records, per event, whether its new time took, for
 * `flick` to check.
 */
function stampFlick({ axis, speed }: { axis: 'x' | 'y'; speed: number }) {
  const types = ['pointerdown', 'pointermove', 'pointerup'] as const;
  const stamped: boolean[] = [];
  (window as unknown as { flickStamped: boolean[] }).flickStamped = stamped;
  let from = 0;
  let start = 0;
  const stamp = (event: PointerEvent) => {
    const along = axis === 'x' ? event.clientX : event.clientY;
    if (event.type === 'pointerdown') {
      from = along;
      start = event.timeStamp;
    }
    const time = start + Math.abs(along - from) / speed;
    try {
      Object.defineProperty(event, 'timeStamp', { value: time });
    } finally {
      stamped.push(event.timeStamp === time);
    }
    if (event.type === 'pointerup') {
      for (const type of types) removeEventListener(type, stamp, true);
    }
  };
  for (const type of types) addEventListener(type, stamp, true);
}

// Loop (#11): a flick across the seam, each way, in every loop story. Back
// from the first snap point is the pointer moving toward the deck's end:
// right, down, or in right-to-left, left. Each flick is short enough that a
// drag as far, even at just under flick speed, settles back where it started:
// only a flick gets across.
for (const { id, slides, last, back, axis } of [
  { id: 'deck--loop', slides: 6, last: 5, back: 150, axis: 'x' },
  { id: 'deck--loop-pages', slides: 10, last: 3, back: 100, axis: 'x' },
  { id: 'deck--loop-vertical', slides: 6, last: 5, back: 40, axis: 'y' },
  { id: 'deck--loop-right-to-left', slides: 6, last: 5, back: -200, axis: 'x' }
] as const) {
  test(`${id}: a flick back across the seam from the first snap point settles on the last`, async ({
    page
  }) => {
    await openStory(page, id);
    const deck = page.getByRole('region', { name: 'Featured slides' });
    await expect(deck).toHaveAttribute('data-index', '0');

    await flick(page, back, axis);

    await expect(deck).toHaveAttribute('data-index', String(last));
    await expect(
      deck.getByRole('group', { name: `${slides} of ${slides}` })
    ).toBeInViewport({ ratio: 1 });
    await expect(deck.getByText(`${last + 1} / ${last + 1}`)).toBeVisible();
  });

  test(`${id}: a flick on across the seam from the last snap point settles on the first`, async ({
    page
  }) => {
    await openStory(page, id, `defaultIndex:${last}`);
    const deck = page.getByRole('region', { name: 'Featured slides' });
    await expect(deck).toHaveAttribute('data-index', String(last));

    await flick(page, -back, axis);

    await expect(deck).toHaveAttribute('data-index', '0');
    await expect(
      deck.getByRole('group', { name: `1 of ${slides}` })
    ).toBeInViewport({ ratio: 1 });
    await expect(deck.getByText(`1 / ${last + 1}`)).toBeVisible();
  });

  test(`${id}: a drag as far back, slower than a flick, settles back on the first snap point`, async ({
    page
  }) => {
    await openStory(page, id);
    const deck = page.getByRole('region', { name: 'Featured slides' });
    await expect(deck).toHaveAttribute('data-index', '0');
    const viewport = deck.locator('[data-carouseldeck-viewport]');
    const rest = await viewport.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    /** How far the deck is scrolled from where it rested at the start. */
    const moved = () =>
      viewport.evaluate(
        (el, [left, top]) =>
          Math.abs(el.scrollLeft - left) + Math.abs(el.scrollTop - top),
        rest
      );

    await flick(page, back, axis, DRAG_SPEED);

    // Back where it rested: the index alone reads 0 before the deck settles.
    await expect.poll(moved).toBeLessThan(1);
    await expect(deck).toHaveAttribute('data-index', '0');
    await expect(deck.getByText(`1 / ${last + 1}`)).toBeVisible();
  });
}

// Native snapping across the seam: a wheel step, which the browser scrolls
// and snaps, not the engine. Chromium scrolls the wheel's distance and snaps
// to the nearest snap point, Firefox and WebKit to the next one, so the step
// is one snap point's width either way.
for (const { id, slides, last, axis } of [
  { id: 'deck--loop', slides: 6, last: 5, axis: 'x' },
  { id: 'deck--loop-vertical', slides: 6, last: 5, axis: 'y' }
] as const) {
  for (const [way, from, to, label] of [
    ['back', 0, last, `${slides} of ${slides}`],
    ['on', last, 0, `1 of ${slides}`]
  ] as const) {
    test(`${id}: a wheel step ${way} across the seam settles on the snap point there`, async ({
      page
    }) => {
      await openStory(page, id, `defaultIndex:${from}`);
      const deck = page.getByRole('region', { name: 'Featured slides' });
      await expect(deck).toHaveAttribute('data-index', String(from));
      const viewport = deck.locator('[data-carouseldeck-viewport]');
      const box = (await viewport.boundingBox())!;
      // One snap point: a slide's width, or the viewport's height.
      const step = await deck
        .getByRole('group', { name: `1 of ${slides}` })
        .evaluate((el, vertical) => {
          const r = el.getBoundingClientRect();
          return vertical ? r.height : r.width;
        }, axis === 'y');
      const delta = way === 'on' ? step : -step;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const moved = await watchScroll(page);

      await page.mouse.wheel(
        axis === 'x' ? delta : 0,
        axis === 'y' ? delta : 0
      );

      expect(await moved()).toBeGreaterThan(0);
      await expect(deck).toHaveAttribute('data-index', String(to));
      await expect(deck.getByRole('group', { name: label })).toBeInViewport({
        ratio: 1
      });
    });
  }
}

test('a loop deck steps across the seam with Prev and Next, and no shell is reachable', async ({
  page,
  browserName
}) => {
  await openStory(page, 'deck--loop');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const prev = deck.getByRole('button', { name: 'Previous' });
  const next = deck.getByRole('button', { name: 'Next' });
  // Each slide mounts once (ADR-0013): five sets of shells carry its snap
  // points, only the slides themselves in the accessibility tree.
  await expect(deck.locator('[data-carouseldeck-slide]')).toHaveCount(6);
  await expect(deck.locator('[data-carouseldeck-shell]')).toHaveCount(30);
  await expect(deck.getByRole('group', { name: / of 6$/ })).toHaveCount(6);

  // #145: placement runs as one ScrollTimeline animation per real slide
  // where the browser supports it (Chromium, WebKit), and as a scroll
  // listener with no animation elsewhere (Firefox). Filtered to
  // ScrollTimeline animations, since a slide could carry other ones.
  const placementCounts = await deck
    .locator('[data-carouseldeck-slide]')
    .evaluateAll((slides) =>
      slides.map(
        (slide) =>
          slide
            .getAnimations()
            .filter(
              (animation) =>
                typeof ScrollTimeline !== 'undefined' &&
                animation.timeline instanceof ScrollTimeline
            ).length
      )
    );
  expect(placementCounts).toEqual(
    new Array(6).fill(browserName === 'firefox' ? 0 : 1)
  );

  await expect(prev).toBeEnabled();
  await prev.click();
  await expect(deck).toHaveAttribute('data-index', '5');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(deck).toHaveAttribute('data-index', '0');
  await expect(deck.getByRole('group', { name: '1 of 6' })).toBeInViewport({
    ratio: 1
  });

  // Tab walks the slides' buttons and leaves the deck: never into a shell.
  await deck.getByRole('button', { name: 'Action 1' }).focus();
  for (let i = 2; i <= 6; i++) {
    await page.keyboard.press('Tab');
    await expect(
      deck.getByRole('button', { name: `Action ${i}` })
    ).toBeFocused();
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-carouseldeck-shell]'))
      )
    ).toBe(false);
  }
});

// The event log (#82): an opt-in panel on the loop stories, off unless the
// URL asks for it with `log=1`, for watching on a phone what happens at the
// end of each swipe (#48).
for (const { id, last } of [
  { id: 'deck--loop', last: 5 },
  { id: 'deck--loop-pages', last: 3 },
  { id: 'deck--loop-vertical', last: 5 },
  { id: 'deck--loop-right-to-left', last: 5 }
] as const) {
  test(`${id}: with log=1, the event log records a press, the scroll's end, the index and the jump off a shell across the seam`, async ({
    page
  }) => {
    await openStory(page, id, undefined, '&log=1');
    const deck = page.getByRole('region', { name: 'Featured slides' });
    const log = page.getByRole('log', { name: 'Event log' });
    await expect(log).toContainText(/onscrollend in window: (true|false)/);
    await expect(log).toContainText(/devicePixelRatio: \d/);

    await deck.getByRole('button', { name: 'Previous' }).click();

    await expect(deck).toHaveAttribute('data-index', String(last));
    await expect(log).toContainText(/pointerdown mouse at -?[\d.]+/);
    await expect(log).toContainText(/pointerup mouse at -?[\d.]+/);
    await expect(log).toContainText(/\d scrollend -?\d/);
    await expect(log).toContainText(`onIndexChange ${last}`);
    await expect(log).toContainText(/jump -?[\d.]+ → -?[\d.]+/);
    // The rest after the jump reads as a slide's, within the engine's 1px.
    await expect(log).toContainText(/still 300ms -?[\d.]+ .*on a slide/);
  });
}

// A scroll the engine did not start, as a touch swipe's on a phone, settles
// at its end event: the log reads the rest there before the engine does, so
// it shows the shell the deck came to rest on, then the jump off it. A key,
// not a wheel: a wheel event on the shells shifts the deck off them at once
// (#96), and Chromium sends it once its scroll is already there.
test('deck--loop: with log=1, a key scroll back across the seam logs the rest on a shell, then the jump', async ({
  page
}) => {
  await openStory(page, 'deck--loop', undefined, '&log=1');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const log = page.getByRole('log', { name: 'Event log' });
  await deck.locator('[data-carouseldeck-viewport]').focus();

  await page.keyboard.press('ArrowLeft');

  await expect(deck).toHaveAttribute('data-index', '5');
  await expect(log).toContainText(
    /\d (scrollsnapchange|scrollend) -?[\d.]+ nearest shell before1 of slide 6 .*: on a shell, its slide placed there: the engine jumps/
  );
  await expect(log).toContainText(/jump -?[\d.]+ → -?[\d.]+/);
});

test('deck--loop: with log=1, Copy all reports whether it copied, and Expand shows the whole log to select by hand', async ({
  page
}) => {
  await openStory(page, 'deck--loop', undefined, '&log=1');
  const log = page.getByRole('log', { name: 'Event log' });
  const full = log.getByRole('textbox', { name: 'Full event log' });
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(log).toContainText('onIndexChange 5');

  await log.getByRole('button', { name: 'Copy all' }).click();
  await expect(log.getByRole('status')).toHaveText(/^(copied|copy failed)/);
  // A failed copy opens the whole log, so it can still be copied by hand.
  if (
    (await log.getByRole('status').textContent())!.startsWith('copy failed')
  ) {
    await expect(full).toBeVisible();
    await log.getByRole('button', { name: 'Close' }).click();
  }
  await expect(full).toHaveCount(0);

  await log.getByRole('button', { name: 'Expand' }).click();
  await expect(full).toHaveValue(/onscrollend in window[^]*onIndexChange 5/);
  await expect(full).toHaveCSS('font-size', '16px');
  await log.getByRole('button', { name: 'Close' }).click();
  await expect(full).toHaveCount(0);
});

test('without log=1, a loop story has no event log', async ({ page }) => {
  await openStory(page, 'deck--loop');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(
    page.getByRole('region', { name: 'Featured slides' })
  ).toHaveAttribute('data-index', '5');
  await expect(page.getByRole('log')).toHaveCount(0);
});

// The README's recipes (#58), each run by a story under Recipes.

/** How far the slide named `name` is from the viewport's centre along the
 * axis, in px. */
const offCentre = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Featured slides' })
    .getByRole('group', { name })
    .evaluate((slide) => {
      const s = slide.getBoundingClientRect();
      const v = slide
        .closest('[data-carouseldeck-viewport]')!
        .getBoundingClientRect();
      return Math.abs(s.left + s.width / 2 - (v.left + v.width / 2));
    });

test('the centred-ends recipe rests with the first slide, and the last, centred', async ({
  page
}) => {
  await openStory(page, 'recipes--centred-ends');
  const deck = page.getByRole('region', { name: 'Featured slides' });

  await expect(deck.getByRole('group', { name: '1 of 6' })).toHaveAttribute(
    'data-focal'
  );
  expect(await offCentre(page, '1 of 6')).toBeLessThanOrEqual(1);

  await deck.getByRole('button', { name: 'Go to page 6' }).click();

  await expect(deck).toHaveAttribute('data-index', '5');
  await expect(deck.getByRole('group', { name: '6 of 6' })).toHaveAttribute(
    'data-focal'
  );
  await expect.poll(() => offCentre(page, '6 of 6')).toBeLessThanOrEqual(1);
});

/**
 * Of the slides in view, the one nearest the viewport's centre, and the ones
 * with an opaque outline, or within a scroll position's rounding of it: the
 * recipe highlights the first alone.
 */
const middleAndHighlighted = (page: Page) =>
  page
    .getByRole('region', { name: 'Featured slides' })
    .locator('[data-carouseldeck-slide][data-in-view]')
    .evaluateAll((slides) => {
      const v = slides[0]
        .closest('[data-carouseldeck-viewport]')!
        .getBoundingClientRect();
      const off = (slide: Element) => {
        const s = slide.getBoundingClientRect();
        return Math.abs(s.left + s.width / 2 - (v.left + v.width / 2));
      };
      const middle = slides.reduce((a, b) => (off(b) < off(a) ? b : a));
      return {
        middle: middle.getAttribute('aria-label'),
        highlighted: slides
          .filter((slide) => {
            const { outlineStyle, outlineColor } = getComputedStyle(slide);
            // rgb(r, g, b) or rgba(r, g, b, alpha).
            const alpha = Number(outlineColor.match(/[\d.]+/g)?.[3] ?? 1);
            return outlineStyle !== 'none' && alpha > 0.99;
          })
          .map((slide) => slide.getAttribute('aria-label'))
      };
    });

for (const { id, focal } of [
  // Centred, the focal slide is the middle one.
  { id: 'recipes--middle-centred', focal: ['2 of 6', '3 of 6'] },
  // At the start, it is the first in view.
  { id: 'recipes--middle-by-progress', focal: ['1 of 6', '2 of 6'] }
]) {
  test(`${id}: the middle slide in view is highlighted, at rest and after Next`, async ({
    page
  }) => {
    await openStory(page, id);
    const deck = page.getByRole('region', { name: 'Featured slides' });

    await expect(
      deck.getByRole('group', { name: focal[0], exact: true })
    ).toHaveAttribute('data-focal');
    await expect
      .poll(() => middleAndHighlighted(page))
      .toEqual({ middle: '2 of 6', highlighted: ['2 of 6'] });

    await deck.getByRole('button', { name: 'Next' }).click();

    await expect(deck).toHaveAttribute('data-index', '1');
    await expect(
      deck.getByRole('group', { name: focal[1], exact: true })
    ).toHaveAttribute('data-focal');
    await expect
      .poll(() => middleAndHighlighted(page))
      .toEqual({ middle: '3 of 6', highlighted: ['3 of 6'] });
  });
}

test('the curve-size recipe leaves the arc room: no slide that is not faded out is clipped, at rest or mid-move', async ({
  page
}) => {
  await openStory(page, 'recipes--curve-size');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  await expect(deck.getByRole('group', { name: '1 of 6' })).toHaveAttribute(
    'data-focal'
  );
  /** Per slide not faded out, how far its card reaches past the viewport's
   * top or bottom edge, to the nearest px. */
  const clipped = () =>
    deck.locator('[data-carouseldeck-slide]').evaluateAll((slides) => {
      const v = slides[0]
        .closest('[data-carouseldeck-viewport]')!
        .getBoundingClientRect();
      return slides
        .filter((slide) => Number(getComputedStyle(slide).opacity) > 0)
        .map((slide) => {
          const c = slide.firstElementChild!.getBoundingClientRect();
          return Math.max(
            0,
            Math.round(v.top - c.top),
            Math.round(c.bottom - v.bottom)
          );
        });
    });

  // At the first slide, it and the two after it are not faded out.
  await expect.poll(clipped).toEqual([0, 0, 0]);

  // Mid-move: a mouse drag holds the deck 0.4 of a slide on from the first,
  // where it does not settle while the button is down, so every run measures
  // the same pose. Of the cards not faded out, the most any reaches past an
  // edge, and how far the lowest drops below the first slide's card.
  const card = (await deck
    .getByRole('group', { name: '1 of 6' })
    .locator('.card')
    .boundingBox())!;
  const x = card.x + card.width / 2;
  const y = card.y + 30;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // 0.4 of a 176px snap step (160px slides, 16px apart).
  await page.mouse.move(x - 70, y, { steps: 12 });
  const midMove = () =>
    deck.locator('[data-carouseldeck-viewport]').evaluate((viewport) => {
      const slides = [
        ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
      ];
      const v = viewport.getBoundingClientRect();
      const rest = slides[0].getBoundingClientRect().bottom;
      let clipped = 0;
      let deepest = 0;
      for (const slide of slides) {
        if (Number(getComputedStyle(slide).opacity) <= 0) continue;
        const c = slide.firstElementChild!.getBoundingClientRect();
        clipped = Math.max(clipped, v.top - c.top, c.bottom - v.bottom);
        deepest = Math.max(deepest, c.bottom - rest);
      }
      return {
        progress: Number(
          slides[0].style.getPropertyValue('--deck-slide-progress')
        ),
        clipped: Math.round(clipped),
        deepest: Math.round(deepest)
      };
    });
  // Held, the first slide's progress is -0.4, give or take the pixel a
  // drag's scroll rounds to.
  await expect.poll(async () => (await midMove()).progress).toBeLessThan(-0.35);
  const move = await midMove();
  expect(move.progress).toBeGreaterThan(-0.45);
  expect(move.clipped).toBeLessThanOrEqual(0);
  // Past the 150px a card drops at rest: the pose shows the arc's faint
  // end, which only the room for a moving deck covers.
  expect(move.deepest).toBeGreaterThan(160);
  // Held still, then let go short of half a slide: the deck goes back to
  // the first rather than flinging on.
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(deck).toHaveAttribute('data-index', '0');
  await expect.poll(clipped).toEqual([0, 0, 0]);

  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '1');
  await expect.poll(clipped).toEqual([0, 0, 0, 0]);

  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '2');
  await expect.poll(clipped).toEqual([0, 0, 0, 0, 0]);
});

test('the per-breakpoint recipe crossfades below 768px and loops from it, keeping its slide as the window resizes across', async ({
  page
}) => {
  await openStory(page, 'recipes--per-breakpoint');
  const deck = page.getByRole('region', { name: 'Featured slides' });
  const viewport = deck.locator('[data-carouseldeck-viewport]');
  const shells = deck.locator('[data-carouseldeck-shell]');
  const copies = deck.locator('[data-carouseldeck-copy]');
  const slide = (n: number) => deck.getByRole('group', { name: `${n} of 6` });
  const live = deck.locator('[data-carouseldeck-live]');
  /** How far slide `n`'s left edge sits from the viewport's, to the pixel. */
  const fromStart = (n: number) =>
    slide(n).evaluate((el) =>
      Math.round(
        Math.abs(
          el.getBoundingClientRect().left -
            el.parentElement!.getBoundingClientRect().left
        )
      )
    );
  /** Resizes the window, waits for the deck to be at rest, and returns
   * every index the deck reported meanwhile. At rest is the same scroll
   * position and index at three reads in a row, 150ms apart, so a stray
   * settle after the resize has time to show. */
  const resize = async (width: number) => {
    await deck.evaluate((root) => {
      const seen: string[] = [];
      const watch = new MutationObserver(() => seen.push(root.dataset.index!));
      watch.observe(root, { attributeFilter: ['data-index'] });
      (root as unknown as { stop: () => string[] }).stop = () => {
        watch.disconnect();
        return seen;
      };
    });
    await page.setViewportSize({ width, height: 720 });
    const at = () =>
      viewport.evaluate(
        (el) =>
          `${el.scrollLeft} ${el.closest<HTMLElement>('[data-index]')!.dataset.index}`
      );
    let last = '';
    let quiet = 0;
    await expect
      .poll(
        async () => {
          const now = await at();
          quiet = now === last ? quiet + 1 : 0;
          last = now;
          return quiet;
        },
        { intervals: [150] }
      )
      .toBeGreaterThanOrEqual(2);
    return deck.evaluate((root) =>
      (root as unknown as { stop: () => string[] }).stop()
    );
  };

  // Wide: no effect, and a loop: Previous crosses the seam.
  await expect(viewport).not.toHaveAttribute('data-carouseldeck-effect');
  await expect(shells).toHaveCount(30);
  await expect(copies).toHaveCount(0);
  await deck.getByRole('button', { name: 'Previous' }).click();
  await expect(deck).toHaveAttribute('data-index', '5');
  await deck.getByRole('button', { name: 'Next' }).click();
  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '1');
  await expect.poll(() => fromStart(2)).toBe(0);
  await expect(live).toHaveText('Slide 2 of 6');

  // Narrow: a crossfade, one slide at a time, that does not loop, on the
  // same slide, with nothing announced.
  expect(await resize(600)).toEqual([]);
  await expect(viewport).toHaveAttribute('data-carouseldeck-effect', 'fade');
  await expect(copies).toHaveCount(0);
  await expect(deck).toHaveAttribute('data-index', '1');
  await expect(slide(2)).toHaveAttribute('data-focal');
  await expect(slide(2)).toBeInViewport({ ratio: 1 });
  await expect(live).toHaveText('Slide 2 of 6');
  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '2');
  await expect(slide(3)).toHaveAttribute('data-focal');
  await expect(slide(3)).toBeInViewport({ ratio: 1 });

  // Wide again: the loop is back, on the same slide.
  expect(await resize(1280)).toEqual([]);
  await expect(viewport).not.toHaveAttribute('data-carouseldeck-effect');
  await expect(shells).toHaveCount(30);
  await expect(copies).toHaveCount(0);
  await expect(deck).toHaveAttribute('data-index', '2');
  expect(await fromStart(3)).toBe(0);
  await expect(live).toHaveText('Slide 3 of 6');
  await deck.getByRole('button', { name: 'Next' }).click();
  await expect(deck).toHaveAttribute('data-index', '3');
  await expect.poll(() => fromStart(4)).toBe(0);
});
