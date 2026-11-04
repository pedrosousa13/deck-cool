// The bench's own scenarios (#340, ported from
// decks/drawerdeck/bench/scenarios.ts, #266/#283), driven the same way on
// every deck: real input over `#viewport`, or a real click on `#next`. Every
// scenario moves forward from slide 0 (never past the last slide, so a
// non-looping deck never clamps mid-gesture); `settle`'s `idleFor`-based
// wait, CDP `Input.dispatchTouchEvent` for trusted touch, and `page.mouse`
// for the mouse drag and the wheel scroll mirror drawerdeck's own bench
// conventions (themselves carried from carouseldeck's prototype scroll-snap
// bench).

import type { Page } from '@playwright/test';

export interface Geometry {
  cx: number;
  cy: number;
  slideWidth: number;
}

export async function geometry(page: Page): Promise<Geometry> {
  const box = await page.locator('#viewport').boundingBox();
  if (!box) throw new Error('#viewport has no box');
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    slideWidth: box.width
  };
}

/** Waits for `window.__bench.idleFor()` to clear a threshold: the carousel
 * has stopped moving. Marks the end of the active window opened by the
 * gesture this follows (the same convention drawerdeck's bench uses, #266
 * rule 10): `trace.ts`'s scorer reads this mark, paired with the
 * `markWindowStart()` call that preceded the gesture, to bound stall
 * scoring to the gesture itself. */
export async function settle(page: Page, thresholdMs = 400): Promise<void> {
  await page.waitForTimeout(100);
  await page.waitForFunction((t) => window.__bench.idleFor() > t, thresholdMs, {
    timeout: 15_000
  });
  await page.evaluate(() => window.__bench.markWindowEnd());
}

export interface Scenario {
  name: string;
  /** Whether this scenario needs trusted touch (Chromium CDP only). */
  chromiumOnly?: boolean;
  /** Opens the carousel to the state the scenario starts from (always slide
   * 0 here); measured separately from `run`, so it never counts toward the
   * scenario's own trace/timing. */
  setup(page: Page): Promise<void>;
  run(page: Page, g: Geometry): Promise<void>;
}

const TOUCH_CADENCE_MS = 16; // a fixed cadence between touch points

async function touchDrag(
  page: Page,
  g: Geometry,
  distancePx: number,
  steps: number,
  cadenceMs = TOUCH_CADENCE_MS
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (frac: number) => [
    { x: g.cx - distancePx * frac, y: g.cy, id: 1 }
  ];
  // Marks this gesture's active window open (#266 rule 10), at its first
  // input event, right before dispatching it.
  await page.evaluate(() => window.__bench.markWindowStart());
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: at(0)
  });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(cadenceMs);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(i / steps)
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await cdp.detach();
}

export async function setupAtStart(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__bench.published(), null, {
    timeout: 15_000
  });
}

export const scenarios: Scenario[] = [
  {
    name: 'touch-swipe-next',
    chromiumOnly: true,
    async setup(page) {
      await setupAtStart(page);
    },
    async run(page, g) {
      // A held drag across one slide width, at a fixed 16ms cadence: the
      // bench's own "swipe to the next slide" gesture.
      await touchDrag(page, g, g.slideWidth * 0.6, 12);
    }
  },
  {
    name: 'touch-flick-three',
    chromiumOnly: true,
    async setup(page) {
      await setupAtStart(page);
    },
    async run(page, g) {
      // A fast, short flick across several slides: half the cadence of the
      // held swipe above (a flick, not a held drag), covering three slide
      // widths so a deck's own momentum, not the touch points alone, has to
      // carry it the rest of the way.
      await touchDrag(page, g, g.slideWidth * 1.4, 6, 8);
    }
  },
  {
    name: 'mouse-drag-release',
    async setup(page) {
      await setupAtStart(page);
    },
    async run(page, g) {
      // A mouse drag and release, scaled to one slide width, six 8ms steps.
      const distance = g.slideWidth * 0.6;
      await page.mouse.move(g.cx, g.cy);
      // Marks this gesture's active window open (#266 rule 10), at its
      // first input event, right before the press.
      await page.evaluate(() => window.__bench.markWindowStart());
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(g.cx - (distance * i) / 6, g.cy);
        await page.waitForTimeout(8);
      }
      await page.mouse.up();
    }
  },
  {
    name: 'wheel-scroll-next',
    async setup(page) {
      await setupAtStart(page);
    },
    async run(page, g) {
      // A burst of small wheel ticks, mostly horizontal with a small
      // vertical component, 16ms apart -- not one big tick. Found the hard
      // way (RESULTS.md's "Method: wheel support"): Splide's own `wheel`
      // option reads only `deltaY`, regardless of the carousel's own axis,
      // so it needs a non-zero vertical component to respond at all; Keen's
      // copied wheel-controls example tracks velocity between successive
      // ticks, so one big synthetic tick (zero elapsed time between
      // "start" and "move") reads as zero velocity and never settles on
      // the next slide. The small vertical component is deliberately
      // dominated by the horizontal one (1/10th), so every deck here that
      // reads the horizontal axis (carouseldeck's native scroll, Swiper's
      // Mousewheel, Embla's WheelGesturesPlugin) still reads this as a
      // horizontal gesture. A deck with no wheel/mousewheel support of its
      // own still cannot win this scenario (fairness rule 11, carried from
      // drawerdeck's bench); none of the five decks here currently
      // triggers that.
      await page.mouse.move(g.cx, g.cy);
      await page.evaluate(() => window.__bench.markWindowStart());
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(g.slideWidth * 0.1, g.slideWidth * 0.01);
        await page.waitForTimeout(16);
      }
    }
  },
  {
    name: 'next-button',
    async setup(page) {
      await setupAtStart(page);
    },
    async run(page) {
      await page.evaluate(() => window.__bench.markWindowStart());
      await page.click('#next');
    }
  }
];

export const LOADS = [0, 100, 200] as const;
export const LOOPS = [false, true] as const;
export const REPS = Number(process.env.BENCH_REPS ?? 5);
