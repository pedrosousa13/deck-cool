import type { CSSProperties } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import {
  addStyle,
  expectSettledTo,
  expectSnaps,
  mouseDrag,
  nextFrame,
  pagesOf,
  placementPath,
  progressOf,
  serverThenHydrated,
  setReducedMotion,
  sleep,
  viewportOf
} from './fixtures';
import {
  AROUND_2,
  CurveDeck,
  FADE,
  readDeck,
  renderDeck,
  round,
  SIZE,
  SLIDE_CSS,
  SPAN
} from './curve-helpers';
import type { CurveDeckProps } from './curve-helpers';

// The curve effect (#16): the slides' content fans along an arc around the
// focal slide, rotating and fading with its progress, while the viewport
// scrolls, snaps and drags natively over slides it leaves in place
// (ADR-0008). #179's paint-order and fade-by-visibility tests are split out
// into curve-paint-and-fade.test.tsx, so they can also run in WebKit.

/** The gap in the size-a-curve recipe's own CSS. */
const GAP = 16;

/** A slide's turn from its progress and the radius, in degrees:
 * asin(clamp(progress / radiusInSlides)). */
const turn = (progress: number, radiusInSlides: number) =>
  (Math.asin(Math.min(Math.max(progress / radiusInSlides, -1), 1)) * 180) /
  Math.PI;

const TALL = '.curved > [data-carouseldeck-slide] { height: 240px; }';

// With the default radius, four slides: a slide one slide from the focal
// position turns asin(1/4), two slides asin(2/4), three asin(3/4), and drops
// by where that puts it on the circle, 4 - sqrt(16 - p²) slides. It fades
// by a quarter a slide, gone at four.
const TURN = [0, 14.5, 30, 48.6, 90];
const DROP = [0, 12.7, 53.6, 135.4, 400];
const at = (table: number[], distances: number[], sign = 1) =>
  distances.map((p) => round(Math.sign(p) * sign * table[Math.abs(p)]));

describe('curve', () => {
  test('fans the slides along an arc around the focal slide, fading with distance', () => {
    const { angles, moved, opacity } = renderDeck({ defaultIndex: 2 });

    expect(angles()).toEqual(at(TURN, AROUND_2));
    expect(moved()).toEqual(
      AROUND_2.map((p) => [0, DROP[Math.abs(p)]] as [number, number])
    );
    expect(opacity()).toEqual(AROUND_2.map((p) => FADE[Math.abs(p)]));
  });

  test('rests at whole progress and snaps exactly with the curve on', async () => {
    const { viewport, next, progress, angles, root } = renderDeck();

    await userEvent.click(next);

    await expectSettledTo(progress, [-1, 0, 1, 2, 3, 4]);
    expect(viewport.scrollLeft).toBe(SIZE);
    expect(root.getAttribute('data-index')).toBe('1');
    expect(angles()).toEqual(at(TURN, [-1, 0, 1, 2, 3, 4]));
    await expectSnaps(viewport);
    expect(progress()).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  test('curves with the scroll while dragging, and progress follows the scroll exactly', async () => {
    const { viewport, progress, angles } = renderDeck();

    const letGo = await mouseDrag(viewport, -SIZE * 0.4, {
      holdMs: 100,
      release: false
    });
    await expect.poll(() => viewport.scrollLeft).toBeGreaterThan(SIZE * 0.2);
    await nextFrame();
    await nextFrame();

    // Progress is the scroll alone: the curve does not move the boxes the
    // deck is measured by.
    const way = viewport.scrollLeft / SIZE;
    expect(progress()).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => expect.closeTo(i - way, 2))
    );
    expect(angles().slice(0, 3)).toEqual(
      [0, 1, 2].map((i) => expect.closeTo(turn(i - way, 4), 0))
    );
    await letGo();
  });

  test('drags to the next slide and settles there', async () => {
    const { viewport, progress, root } = renderDeck();

    // Held still before letting go: a drag, not a flick.
    await mouseDrag(viewport, -SIZE * 0.7, { holdMs: 120 });

    await expectSettledTo(progress, [-1, 0, 1, 2, 3, 4]);
    expect(root.getAttribute('data-index')).toBe('1');
  });

  test('takes its radius, in slides, from --deck-curve-radius', () => {
    const { angles, moved, opacity } = renderDeck({
      viewportStyle: { '--deck-curve-radius': 2 } as CSSProperties
    });

    expect(angles().slice(0, 3)).toEqual([0, 30, 90]);
    expect(moved()[1]).toEqual([0, round((2 - Math.sqrt(3)) * SIZE)]);
    expect(opacity().slice(0, 3)).toEqual([1, 0.5, 0]);
  });

  test('never shows a scrollbar on the page or across the viewport while dragging', async () => {
    const { viewport, angles } = renderDeck();
    expect(angles()[1]).not.toBe(0);
    const html = document.documentElement;
    const measure = () => [
      html.scrollWidth - html.clientWidth,
      html.scrollHeight - html.clientHeight,
      html.clientWidth,
      html.clientHeight,
      viewport.clientWidth,
      viewport.clientHeight,
      viewport.scrollTop
    ];
    const start = measure();
    expect(start[0]).toBeLessThanOrEqual(0);
    expect(start[1]).toBeLessThanOrEqual(0);
    expect(start[6]).toBe(0);
    const seen = new Set<string>();
    let sampling = true;
    const sample = () => {
      seen.add(measure().join());
      if (sampling) requestAnimationFrame(sample);
    };
    sample();

    const letGo = await mouseDrag(viewport, -SIZE * 2.5, {
      steps: 20,
      holdMs: 100,
      release: false
    });
    await letGo();
    await mouseDrag(viewport, SIZE * 1.5, { steps: 20 });
    await nextFrame();
    sampling = false;

    expect([...seen]).toEqual([start.join()]);

    // The arc hangs below the viewport, but the viewport cannot be scrolled
    // down to it: there is nothing there to show a scrollbar for.
    await userEvent.wheel(viewport, { delta: { y: 200 } });
    await nextFrame();
    expect(viewport.scrollTop).toBe(0);
  });

  test('keeps every slide reachable, with no snap targets', () => {
    const { viewport, slides } = renderDeck();

    expect(slides().map((slide) => slide.inert)).toEqual(Array(6).fill(false));
    expect(
      viewport.querySelector('[data-carouseldeck-snap-target]')
    ).toBeNull();
  });

  test('fans across the other axis in a vertical deck', async () => {
    const { viewport, next, progress, angles, moved } = renderDeck({
      orientation: 'vertical'
    });

    await userEvent.click(next);
    await expectSettledTo(progress, [-1, 0, 1, 2, 3, 4]);
    expect(viewport.scrollTop).toBe(SIZE);

    // The arc bends toward the inline end: a slide below the focal one
    // turns anticlockwise, and every slide but it moves toward the inline
    // end.
    expect(angles().slice(0, 3)).toEqual(at(TURN, [-1, 0, 1], -1));
    expect(moved().slice(0, 3)).toEqual([
      [DROP[1], 0],
      [0, 0],
      [DROP[1], 0]
    ]);
    await expectSnaps(viewport, 'scrollTop');
  });

  test('fans the mirror way in a right-to-left deck', async () => {
    const { viewport, next, progress, angles, moved, slides } = renderDeck({
      dir: 'rtl',
      defaultIndex: 2
    });

    // The slide after the focal one is on its left, and turns anticlockwise.
    const [focal, after] = [slides()[2], slides()[3]];
    expect(after.getBoundingClientRect().left).toBeLessThan(
      focal.getBoundingClientRect().left
    );
    expect(angles()).toEqual(at(TURN, AROUND_2, -1));
    expect(moved()[3]).toEqual([0, DROP[1]]);

    await userEvent.click(next);
    await expectSettledTo(progress, [-3, -2, -1, 0, 1, 2]);
    expect(viewport.scrollLeft).toBe(-3 * SIZE);
  });

  test('tabbing into a dropped slide scrolls along the axis only, to make it focal', async () => {
    const { viewport, root, slides, opacity } = renderDeck({
      slides: 8,
      viewportStyle: { '--deck-curve-radius': 2 } as CSSProperties
    });
    screen.getByRole('button', { name: 'Button 2' }).focus();
    await sleep(400);

    // Two slides away, at a radius of two, Button 3 has dropped out of view.
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Button 3' })
    );

    await expectSettledTo(() => root.getAttribute('data-index'), '2');
    expect(viewport.scrollTop).toBe(0);
    expect(slides()[2].hasAttribute('data-focal')).toBe(true);
    expect(opacity()[2]).toBe(1);
  });

  test('turned slides that fit the viewport leave it nothing to scroll', async () => {
    const { viewport } = renderDeck(
      { slides: 3, viewportStyle: { paddingInline: 0 } },
      TALL
    );
    await nextFrame();

    // Every slide fits, so the deck has nowhere to go.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(viewport.scrollWidth).toBe(viewport.clientWidth);
    expect(viewport.scrollHeight).toBe(viewport.clientHeight);
  });

  test('turned slides never change the scroll range while dragging', async () => {
    const { viewport } = renderDeck(
      { slides: 8, viewportStyle: { paddingInline: 0 } },
      TALL
    );
    const seen = new Set<number>();
    let sampling = true;
    const sample = () => {
      seen.add(viewport.scrollWidth);
      if (sampling) requestAnimationFrame(sample);
    };
    sample();

    await mouseDrag(viewport, -SIZE * 2.5, { steps: 20, holdMs: 100 });
    await sleep(400);
    sampling = false;

    expect([...seen]).toEqual([8 * SIZE]);
  });

  test('rests exactly on the last snap point with whole progress, with no end padding', async () => {
    const { viewport, progress } = renderDeck(
      { slides: 8, viewportStyle: { paddingInline: 0 } },
      TALL
    );

    viewport.scrollLeft = 8 * SIZE;

    await expectSettledTo(progress, [-6, -5, -4, -3, -2, -1, 0, 1]);
    expect(viewport.scrollLeft).toBe(5 * SIZE);
  });

  test('snaps where the consumer aligns the slides, at their start', async () => {
    const { viewport, next, progress, angles, root } = renderDeck(
      { viewportStyle: { paddingInline: 0 } },
      '.curved > [data-carouseldeck-slide] { scroll-snap-align: start; }'
    );

    await userEvent.click(next);

    await expectSettledTo(progress, [-1, 0, 1, 2, 3, 4]);
    expect(viewport.scrollLeft).toBe(SIZE);
    expect(root.getAttribute('data-index')).toBe('1');
    expect(angles()[1]).toBe(0);
    await expectSnaps(viewport);
  });

  test('snaps in pages where the consumer groups the slides', async () => {
    const { viewport, next, progress, root } = renderDeck(
      { viewportStyle: { paddingInline: 0 } },
      pagesOf(2, '.curved')
    );

    await userEvent.click(next);

    await expectSettledTo(progress, [-2, -1, 0, 1, 2, 3]);
    expect(viewport.scrollLeft).toBe(2 * SIZE);
    expect(root.getAttribute('data-index')).toBe('1');
  });

  test('a radius of 0 keeps the focal slide shown and every other one turned away', () => {
    const { angles, opacity } = renderDeck({
      defaultIndex: 2,
      viewportStyle: { '--deck-curve-radius': 0 } as CSSProperties
    });

    expect(opacity()).toEqual([0, 0, 1, 0, 0, 0]);
    expect(angles()).toEqual([-90, -90, 0, 90, 90, 90]);
  });

  test('a negative radius bends the arc the same way as a tiny one', () => {
    const { angles, opacity } = renderDeck({
      defaultIndex: 2,
      viewportStyle: { '--deck-curve-radius': -2 } as CSSProperties
    });

    expect(opacity()).toEqual([0, 0, 1, 0, 0, 0]);
    expect(angles()).toEqual([-90, -90, 0, 90, 90, 90]);
  });
});

// #179's paint-order and fade-by-visibility tests live in
// curve-paint-and-fade.test.tsx, so they can also run in WebKit.

// Server HTML gives each slide its progress as the deck starts, its distance
// in slides from the starting slide, so a server-rendered curve deck paints
// its arc before any script runs, and hydration changes nothing (#125).
describe('curve in server HTML', () => {
  /** Each slide's inline `--deck-slide-progress` in `html`, in document
   * order: the slides, then a loop's copies after them, then those before. */
  const serverProgress = (html: string) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return [
      ...template.content.querySelectorAll<HTMLElement>(
        '[data-carouseldeck-slide]'
      )
    ].map((slide) => slide.style.getPropertyValue('--deck-slide-progress'));
  };
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

  test.each<{ name: string; props: CurveDeckProps; expected: string[] }>([
    { name: 'at the first slide', props: {}, expected: range(0, 5) },
    {
      name: 'at defaultIndex 2',
      props: { defaultIndex: 2 },
      expected: range(-2, 3)
    },
    {
      name: 'at a controlled index 3',
      props: { index: 3, onIndexChange: () => {} },
      expected: range(-3, 2)
    },
    {
      name: 'at a defaultIndex past the last slide, clamped',
      props: { defaultIndex: 10 },
      expected: range(-5, 0)
    },
    {
      name: 'vertical, at defaultIndex 2',
      props: { orientation: 'vertical', defaultIndex: 2 },
      expected: range(-2, 3)
    },
    {
      name: 'right-to-left, at defaultIndex 2',
      props: { dir: 'rtl', defaultIndex: 2 },
      expected: range(-2, 3)
    },
    {
      // Each real slide's progress wrapped into its own nearest slot
      // (ADR-0013): `p = i + k·n − s`, `k` clamped to the two buffer sets
      // either side, rather than running on forever as a copy's would.
      name: 'looping, at defaultIndex 1',
      props: { loop: true, defaultIndex: 1 },
      expected: ['-1', '0', '1', '2', '3', '-2']
    }
  ])('gives each slide its progress $name', ({ props, expected }) => {
    expect(serverProgress(renderToString(<CurveDeck {...props} />))).toEqual(
      expected
    );
  });

  /** Each slide's opacity and its content's transform, as painted. */
  const painted = (viewport: HTMLElement) =>
    [
      ...viewport.querySelectorAll<HTMLElement>(
        ':scope > [data-carouseldeck-slide]'
      )
    ].map((slide) => [
      getComputedStyle(slide).opacity,
      getComputedStyle(slide.firstElementChild!).transform
    ]);

  test.each<{ name: string; props: CurveDeckProps; css?: string }>([
    { name: 'at defaultIndex 2', props: { defaultIndex: 2 } },
    {
      name: 'at a controlled index 3',
      props: { index: 3, onIndexChange: () => {} }
    },
    {
      name: 'vertical, at defaultIndex 2',
      props: { orientation: 'vertical', defaultIndex: 2 }
    },
    {
      name: 'right-to-left, at defaultIndex 2',
      props: { dir: 'rtl', defaultIndex: 2 }
    },
    {
      name: 'looping, at defaultIndex 1',
      props: { loop: true, defaultIndex: 1 }
    },
    {
      name: 'in pages of 2',
      props: { viewportStyle: { paddingInline: 0 } },
      css: pagesOf(2, '.curved')
    }
  ])(
    'paints its arc from server HTML and hydrates without changing it, $name',
    async ({ props, css = '' }) => {
      addStyle(SLIDE_CSS + css);
      const { viewport, server, serverProgress, hydrated } =
        await serverThenHydrated(<CurveDeck {...props} />, painted);

      // The arc is drawn before hydration, not flat, and the engine's first
      // measured progress is the server's.
      expect(
        new Set(server.map(([, transform]) => transform)).size
      ).toBeGreaterThan(1);
      expect(progressOf(viewport)).toEqual(serverProgress);
      expect(hydrated).toEqual(server);
    }
  );

  // The progress each slide starts at is React's, the progress after it the
  // engine's: a render that moves a slide to a new place must not leave the
  // start's progress on it once the deck has moved.
  test('keeps the measured progress when the slides reorder after a move', async () => {
    addStyle(SLIDE_CSS);
    const deck = (order: number[]) => (
      <Deck.Root aria-label="Test deck">
        <Deck.Viewport
          effect={curve}
          className="curved"
          style={{ boxSizing: 'border-box', width: SPAN, paddingInline: SIZE }}
        >
          {order.map((n) => (
            <Deck.Slide key={n}>
              <div className="card">{n}</div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
    const { rerender } = render(deck([0, 1, 2, 3, 4, 5]));
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expectSettledTo(() => progressOf(viewport), [-1, 0, 1, 2, 3, 4]);

    rerender(deck([5, 4, 3, 2, 1, 0]));
    await nextFrame();

    // Wherever the browser keeps the viewport, the progress is measured
    // from there.
    const focal = viewport.scrollLeft / SIZE;
    expect(progressOf(viewport)).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => i - focal)
    );
  });
});

// Curve has no stacking target, so a real slide placed over a shell is
// translated onto it exactly as any non-stacked shells deck's is
// (ADR-0013): this is a regression check that the translate still composes
// with curve's own content transform once an effect is in play.
// #145: the curve effect transforms a slide's content, not the slide
// itself (`curve.ts`), so it composes the same way over either placement
// path -- progress follows `slotOf`, the same function a CSS-path placer's
// own keyframes encode.
describe.each(['css', 'js'] as const)(
  'one instance: curve with shells (%s)',
  (path) => {
    test("placed before slide 1, slide '6 of 6' turns the mirror of slide 2's turn", async () => {
      placementPath(path);
      addStyle(SLIDE_CSS);
      render(<CurveDeck loop defaultIndex={0} />);
      const root = screen.getByRole('region', { name: 'Test deck' });
      const { viewport, angles } = readDeck(root);
      await nextFrame();
      await nextFrame();

      const [slide] = [
        ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
      ];
      const animated = slide
        .getAnimations()
        .some((animation) => animation.timeline instanceof ScrollTimeline);
      expect(animated).toBe(path === 'css');

      const a = angles();
      expect(a[5]).toBe(-a[1]!);
      expect(a[5]).not.toBe(0);
      expect(root.dataset.index).toBe('0');
    });
  }
);

describe('curve under reduced motion', () => {
  test('keeps the slides flat, fading with distance only', async () => {
    await setReducedMotion(true);
    try {
      const { angles, moved, opacity } = renderDeck({ defaultIndex: 2 });

      expect(angles()).toEqual(Array(6).fill(0));
      expect(moved()).toEqual(Array(6).fill([0, 0]));
      expect(opacity()).toEqual(AROUND_2.map((p) => FADE[Math.abs(p)]));
    } finally {
      await setReducedMotion(false);
    }
  });
});

// The size-a-curve recipe's radius in pixels: --deck-curve-radius written as
// calc(528 / var(--deck-viewport-step, 176)). --deck-viewport-step moves with
// the slide's own width, the step it measures, as a consumer with fluid
// slides sees; the radius in slides should move with it too, so the circle
// the slides turn on stays the same 528px, at either width.
describe('the size-a-curve recipe: a radius in pixels from --deck-viewport-step', () => {
  test.each([100, 300])(
    'calc(528 / var(--deck-viewport-step, 176)) resolves to a 528px radius under %dpx slides',
    (slideWidth) => {
      const { angles, viewport } = renderDeck(
        {
          viewportStyle: {
            // Room for the first and last slides to reach the middle, as
            // the recipe's own padding-inline does.
            width: slideWidth * 3,
            paddingInline: slideWidth,
            gap: `${GAP}px`,
            '--deck-curve-radius': 'calc(528 / var(--deck-viewport-step, 176))'
          } as CSSProperties
        },
        `.curved > [data-carouseldeck-slide] { width: ${slideWidth}px; }`
      );

      const step = Number(
        viewport.style.getPropertyValue('--deck-viewport-step')
      );
      expect(step).toBeCloseTo(slideWidth + GAP, 0);
      const radiusInSlides = 528 / step;

      expect(angles()[1]).toBeCloseTo(turn(1, radiusInSlides), 0);
      expect(angles()[2]).toBeCloseTo(turn(2, radiusInSlides), 0);
    }
  );
});
