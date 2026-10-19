import type { CSSProperties } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { addStyle } from './fixtures';
import {
  AROUND_2,
  CurveDeck,
  FADE,
  readDeck,
  renderDeck,
  SIZE,
  SLIDE_CSS
} from './curve-helpers';
import type { CurveDeckProps } from './curve-helpers';

// #179: split out of curve.test.tsx so these tests also run in WebKit
// (vitest.config.ts): the paint order (z-index) and the fade-by-visibility
// switch, both named in the brief's acceptance criteria as needing to work
// in Chromium, Firefox and WebKit. Neither drives input through CDP, unlike
// curve.test.tsx's older tests, so there is nothing WebKit-specific keeping
// them out.

describe('curve paint order', () => {
  // The curve paints by distance from the focal slide, highest on top, in
  // the same zero-specificity rules as the rest of its CSS (ADR-0008,
  // amended), following the stack effect's shape (ADR-0012).
  test('stacks the slides by distance from the focal slide, focal on top, equal distance equal', () => {
    const { zIndex } = renderDeck({ defaultIndex: 2 });

    const z = zIndex();
    expect(z[2]).toBeGreaterThan(z[1]!);
    expect(z[2]).toBeGreaterThan(z[3]!);
    expect(z[1]).toBe(z[3]);
    expect(z[0]).toBe(z[4]);
  });
});

// Loop's shells and a small deck's copies both carry a real slide (ADR-0013):
// the paint order reads the same `--deck-slide-progress` either way, so the
// focal slide stays on top under both.
describe('curve paint order with loop', () => {
  test.each<{
    name: 'shells' | 'copies';
    props: CurveDeckProps;
    css?: string;
  }>([
    { name: 'shells', props: { slides: 8, loop: true, defaultIndex: 3 } },
    {
      name: 'copies',
      props: { slides: 3, loop: true },
      css: '.curved > [data-carouseldeck-slide] { width: 110px; }'
    }
  ])(
    'keeps the focal slide on top under $name',
    async ({ name, props, css }) => {
      const { viewport, zIndex, slides } = renderDeck(props, css);
      await expect.poll(() => viewport.dataset.carouseldeckLoop).toBe(name);

      const z = zIndex();
      z.forEach((value) => expect(Number.isFinite(value)).toBe(true));
      const focal = slides().findIndex((slide) =>
        slide.hasAttribute('data-focal')
      );
      expect(z[focal]).toBe(Math.max(...z));
    }
  );
});

// #179: a consumer can switch the curve's fade from the radius to following
// the viewport (ADR-0014's --deck-viewport-span), restoring the fade
// keen-slider gave, fully opaque while at least half a slide is in the
// viewport.
//
// A slide is approximated as one step wide (--deck-viewport-step), the gap
// left out, so its own half-width is always 0.5 of a slide, the same unit
// --deck-viewport-span counts in: the error is the gap's own share of the
// step, at most half of it, and only at the fade's edge. The switch assumes
// `scroll-snap-align: center`, the curve recipes' own alignment, where the
// viewport's edges sit at ±(--deck-viewport-span / 2) from the focal slide;
// `start` or `end` put them somewhere else and are not handled.
//
// Two slides fit the 200px viewport (SIZE 100px each, no gap): span is 2, so
// the viewport's half-width is 1 slide and a slide one slide away has its
// centre exactly on the viewport's edge, half of it in view.
describe('curve fade by visibility (--deck-curve-fade-view)', () => {
  const NO_PADDING_TWO_UP = { width: SIZE * 2, paddingInline: 0 };

  // Blocker: Chromium before 138 has no sign(). The switch used it to tell
  // a measured --deck-viewport-span from an unmeasured one, which made the
  // whole opacity declaration invalid at computed-value time there, and
  // every curve slide painted at opacity 1 regardless of the switch. The
  // check that this never regresses now covers every effect's CSS, not
  // only curve's: css-math-floor.test.tsx (#201).

  test('fades by visibility instead of radius once the switch is on', () => {
    const { opacity } = renderDeck({
      defaultIndex: 2,
      viewportStyle: {
        ...NO_PADDING_TWO_UP,
        '--deck-curve-fade-view': 1
      } as CSSProperties
    });

    // AROUND_2 = [-2, -1, 0, 1, 2, 3]: a slide a slide away (half in view) is
    // fully opaque, and one two slides away (fully outside) is gone.
    expect(opacity()).toEqual([0, 1, 1, 1, 0, 0]);
  });

  test('keeps the radius-based fade when the switch is off', () => {
    const { opacity } = renderDeck({
      defaultIndex: 2,
      viewportStyle: NO_PADDING_TWO_UP as CSSProperties
    });

    expect(opacity()).toEqual(AROUND_2.map((p) => FADE[Math.abs(p)]));
  });

  // Pins the ramp's width and offset directly, rather than only at a
  // distance (2) well past where the formula already reads 0. At span 2,
  // the formula (clamp(0, span + 1 - 2·|progress|, 1)) is 1 up to |p| = 1,
  // 0 from |p| = 1.5 on, and linear between: a ramp shifted or scaled by as
  // little as 0.5 of a slide would miss at least one of these three points
  // by 0.5 of opacity, so toBeCloseTo at 2 decimal places (which only
  // tolerates floating-point noise) still catches it.
  test.each([
    { progress: 1, opacity: 1 },
    { progress: 1.25, opacity: 0.5 },
    { progress: 1.5, opacity: 0 }
  ])(
    'at span 2, progress $progress is opacity $opacity',
    ({ progress, opacity }) => {
      const { slides } = renderDeck({
        defaultIndex: 2,
        viewportStyle: {
          ...NO_PADDING_TWO_UP,
          '--deck-curve-fade-view': 1
        } as CSSProperties
      });
      // Slide 3: one slide after the focal slide (index 2). Overriding its
      // measured progress directly, synchronously after render and before
      // any read, lets the test reach the exact fractional distances the
      // ramp turns on, which a settled deck's own integer progress cannot.
      const slide = slides()[3]!;
      slide.style.setProperty('--deck-slide-progress', String(progress));

      expect(Number(getComputedStyle(slide).opacity)).toBeCloseTo(opacity, 2);
    }
  );

  test('falls back to the radius fade before --deck-viewport-span is measured, even with the switch on', () => {
    addStyle(SLIDE_CSS);
    const container = document.createElement('div');
    try {
      container.innerHTML = renderToString(
        <CurveDeck
          defaultIndex={2}
          viewportStyle={{ '--deck-curve-fade-view': 1 } as CSSProperties}
        />
      );
      document.body.append(container);
      const { opacity } = readDeck(container);

      expect(opacity()).toEqual(AROUND_2.map((p) => FADE[Math.abs(p)]));
    } finally {
      container.remove();
    }
  });
});
