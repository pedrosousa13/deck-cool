// The bench's own scenarios (#266, originally #233), driven the same way on
// every deck: real input at the panel's handle, or a real click on
// `#trigger`. `settle`'s `idleFor`-based wait, CDP `Input.dispatchTouchEvent`
// for trusted touch, and `page.mouse` for the mouse-drag throw mirror
// carouseldeck's own scroll-snap bench conventions.

import type { Page } from '@playwright/test';

export interface Geometry {
  cx: number;
  cy: number;
  vh: number;
}

export async function geometry(page: Page): Promise<Geometry> {
  const box = await page.locator('#panel .handle').boundingBox();
  if (!box) throw new Error('#panel .handle has no box');
  const vh = page.viewportSize()!.height;
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, vh };
}

/** Waits for `window.__bench.idleFor()` to clear a threshold: the drawer
 * (open or closed) has stopped moving. Marks the end of the active window
 * opened by the gesture this follows (#266 rule 10: `trace.ts`'s scorer
 * reads this mark, paired with the `markWindowStart()` call that preceded
 * the gesture, to bound stall scoring to the gesture itself). */
export async function settle(page: Page, thresholdMs = 400): Promise<void> {
  await page.waitForTimeout(100);
  await page.waitForFunction((t) => window.__bench.idleFor() > t, thresholdMs, {
    timeout: 15_000
  });
  await page.evaluate(() => window.__bench.markWindowEnd());
}

/** Opens the drawer and waits for it to settle at the half snap point. */
export async function openToHalf(page: Page): Promise<void> {
  await page.click('#trigger');
  await settle(page);
}

export interface Scenario {
  name: string;
  /** Whether this scenario needs trusted touch (Chromium CDP only). */
  chromiumOnly?: boolean;
  /** False for a scenario that starts closed (no `#panel` yet): calling
   * `geometry()` there would wait out Playwright's default actionability
   * timeout for an element that never appears before the scenario's own
   * `run()` creates it (found empirically in the original prototype: none
   * of the three headless-by-default libraries render `#panel` while
   * closed, so `geometry()`'s `locator('#panel .handle').boundingBox()`
   * polled for ~30s per rep before giving up). */
  needsGeometry?: boolean;
  /** Opens the drawer to the state the scenario starts from. Measured
   * separately from `run`, so it never counts toward the scenario's own
   * trace/timing. */
  setup(page: Page): Promise<void>;
  run(page: Page, g: Geometry | null): Promise<void>;
}

const TOUCH_CADENCE_MS = 16; // a fixed cadence between touch points

/** Every scenario but `open-to-half` runs with `needsGeometry` at its
 * default (true), so `bench.spec.ts` always passes a real `Geometry` there;
 * this just gives those scenario bodies a non-null type without scattering
 * `!` through each one. */
function need(g: Geometry | null): Geometry {
  if (!g) throw new Error('geometry() was not computed for this scenario');
  return g;
}

async function touchDrag(
  page: Page,
  g: Geometry,
  distancePx: number,
  steps: number
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const at = (frac: number) => [
    { x: g.cx, y: g.cy - distancePx * frac, id: 1 }
  ];
  // Marks this gesture's active window open (#266 rule 10), at its first
  // input event, right before dispatching it.
  await page.evaluate(() => window.__bench.markWindowStart());
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: at(0)
  });
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(TOUCH_CADENCE_MS);
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

export const scenarios: Scenario[] = [
  {
    name: 'touch-drag-half-full-back',
    chromiumOnly: true,
    async setup(page) {
      await openToHalf(page);
    },
    async run(page, g0) {
      const g = need(g0);
      // half -> full: the half-to-full distance, at a fixed 16ms cadence.
      const up = g.vh * 0.42; // (0.92 - 0.5) * vh
      await touchDrag(page, g, up, 12);
      await settle(page);
      // full -> half, back down, same cadence.
      const g2 = await geometry(page);
      await touchDrag(page, g2, -up, 12);
    }
  },
  {
    name: 'touch-flick-dismiss',
    chromiumOnly: true,
    async setup(page) {
      await openToHalf(page);
    },
    async run(page, g0) {
      const g = need(g0);
      // A fast, short downward flick from half: 6 steps over a fixed 8ms
      // cadence (half the cadence of the half<->full drag: a flick, not a
      // held drag).
      const distance = g.vh * 0.3;
      const cdp = await page.context().newCDPSession(page);
      const at = (frac: number) => [
        { x: g.cx, y: g.cy + distance * frac, id: 1 }
      ];
      // Marks this gesture's active window open (#266 rule 10), at its
      // first input event, right before dispatching it.
      await page.evaluate(() => window.__bench.markWindowStart());
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: at(0)
      });
      for (let i = 1; i <= 6; i++) {
        await page.waitForTimeout(8);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: at(i / 6)
        });
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await cdp.detach();
    }
  },
  {
    name: 'mouse-drag-throw',
    async setup(page) {
      await openToHalf(page);
    },
    async run(page, g0) {
      const g = need(g0);
      // An upward mouse throw: six 8ms steps, scaled to this viewport's
      // half-to-full distance.
      const distance = g.vh * 0.3;
      await page.mouse.move(g.cx, g.cy);
      // Marks this gesture's active window open (#266 rule 10), at its
      // first input event, right before the press.
      await page.evaluate(() => window.__bench.markWindowStart());
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(g.cx, g.cy - (distance * i) / 6);
        await page.waitForTimeout(8);
      }
      await page.mouse.up();
    }
  },
  {
    name: 'open-to-half',
    needsGeometry: false,
    async setup() {
      // Starts closed: nothing to do.
    },
    async run(page) {
      // Marks this gesture's active window open (#266 rule 10), at its
      // first input event, right before the click.
      await page.evaluate(() => window.__bench.markWindowStart());
      await page.click('#trigger');
    }
  }
];

export const LOADS = [0, 100, 200] as const;
export const REPS = Number(process.env.BENCH_REPS ?? 5);
