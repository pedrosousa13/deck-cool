import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import type { Effect } from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import {
  addStyle,
  expectSettledTo,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';

// --deck-viewport-step and --deck-viewport-span (ADR-0014, amended for
// #187): the viewport's own measured geometry, written as plain, unitless
// numbers so CSS can divide pixels by them without dividing one length by
// another. Written on `Deck.Viewport` alone, at measure time -- mount,
// resize, a slide added or removed -- never per scroll frame (GLOSSARY.md,
// "carouseldeck writes only `--deck-slide-*`" is amended by ADR-0010 and
// ADR-0014 for these two, the viewport's own).

type GeometryDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportClassName?: string;
  effect?: Effect;
};

// 160px slides, a 16px gap: a step of 176.
const STEPPED = `.stepped { gap: 16px; } .stepped > * { width: 160px; }`;
const STEPPED_VERTICAL = `.stepped-vertical { gap: 16px; } .stepped-vertical > * { height: 160px; }`;
// Same sizing, plus a common progress recipe (the progress guide's own
// example): off-focal slides scale down, about their own centre, so the
// scale differs from one slide to the next.
const SCALED = `
  .scaled { gap: 16px; }
  .scaled > [data-carouseldeck-slide] {
    width: 160px;
    scale: calc(
      1 -
        min(
          max(var(--deck-slide-progress, 0), -1 * var(--deck-slide-progress, 0)),
          1
        ) *
        0.2
    );
    transform-origin: center;
  }
`;

function GeometryDeck({
  slides = 5,
  viewportWidth = 600,
  viewportHeight = 600,
  viewportClassName,
  orientation,
  effect,
  ...props
}: GeometryDeckProps) {
  return (
    <Deck.Root aria-label="Test deck" orientation={orientation} {...props}>
      <Deck.Viewport
        effect={effect}
        className={viewportClassName}
        style={{
          width: viewportWidth,
          height:
            orientation === 'vertical' || effect ? viewportHeight : undefined
        }}
      >
        {Array.from({ length: slides }, (_, i) => (
          <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Next />
    </Deck.Root>
  );
}

const renderDeck = (props: GeometryDeckProps = {}) => {
  render(<GeometryDeck {...props} />);
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  return {
    root,
    viewport,
    get next() {
      return screen.getByRole('button', { name: 'Next' });
    },
    step: () => viewport.style.getPropertyValue('--deck-viewport-step'),
    span: () => viewport.style.getPropertyValue('--deck-viewport-span')
  };
};

/**
 * Counts every mutation record the viewport's own `style` attribute
 * produces while the caller scrolls it: every one, not only those where
 * `--deck-viewport-step` or `--deck-viewport-span` comes out a different
 * string, so a settle that rewrites either to the value it already had
 * still fails this -- `writeGeometry`'s own equality check is what should
 * keep that write from ever reaching the DOM. The same test
 * `countTranslateWrites` (loop-one-instance.test.tsx) makes for a real
 * slide's `translate`.
 */
function countGeometryWrites(viewport: HTMLElement) {
  let changes = 0;
  const observer = new MutationObserver((records) => {
    changes += records.length;
  });
  observer.observe(viewport, { attributes: true, attributeFilter: ['style'] });
  return () => {
    changes += observer.takeRecords().length;
    observer.disconnect();
    return changes;
  };
}

describe('--deck-viewport-step and --deck-viewport-span', () => {
  test('are the slide-to-slide step and the viewport in steps, as plain numbers', () => {
    addStyle(STEPPED);
    const { step, span } = renderDeck({ viewportClassName: 'stepped' });

    expect(step()).toBe('176');
    expect(Number(span())).toBeCloseTo(600 / 176, 2);
  });

  test('inherits onto every slide, for consumer CSS to read', () => {
    addStyle(STEPPED);
    const { viewport } = renderDeck({ viewportClassName: 'stepped' });
    const slide = viewport.querySelector<HTMLElement>(
      '[data-carouseldeck-slide]'
    )!;

    expect(
      getComputedStyle(slide).getPropertyValue('--deck-viewport-step').trim()
    ).toBe('176');
  });

  test('is unset before measurement, in server HTML', () => {
    const html = renderToString(<GeometryDeck />);
    const container = document.createElement('div');
    container.innerHTML = html;
    const viewport = viewportOf(container);

    expect(viewport.getAttribute('style') ?? '').not.toMatch(
      /--deck-viewport-(step|span)/
    );
  });

  test('is unset with fewer than two real slides', () => {
    addStyle(STEPPED);
    const { step, span } = renderDeck({
      viewportClassName: 'stepped',
      slides: 1
    });

    expect(step()).toBe('');
    expect(span()).toBe('');
  });

  test('updates --deck-viewport-span on a resize, without moving --deck-viewport-step', async () => {
    addStyle(STEPPED);
    const { viewport, step, span } = renderDeck({
      viewportClassName: 'stepped'
    });
    expect(step()).toBe('176');

    viewport.style.width = '976px';

    await expect.poll(() => Number(span())).toBeCloseTo(976 / 176, 2);
    expect(step()).toBe('176');
  });

  test('does not leave a stale value once a slide is removed', async () => {
    addStyle(STEPPED);
    function Toggle({ slides }: { slides: number }) {
      return <GeometryDeck viewportClassName="stepped" slides={slides} />;
    }
    const { rerender } = render(<Toggle slides={2} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    expect(viewport.style.getPropertyValue('--deck-viewport-step')).toBe('176');

    rerender(<Toggle slides={1} />);

    await expect
      .poll(() => viewport.style.getPropertyValue('--deck-viewport-step'))
      .toBe('');
    expect(viewport.style.getPropertyValue('--deck-viewport-span')).toBe('');
  });

  test('picks up a slide added back, rather than staying unset', async () => {
    addStyle(STEPPED);
    function Toggle({ slides }: { slides: number }) {
      return <GeometryDeck viewportClassName="stepped" slides={slides} />;
    }
    const { rerender } = render(<Toggle slides={1} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    expect(viewport.style.getPropertyValue('--deck-viewport-step')).toBe('');

    rerender(<Toggle slides={2} />);

    await expect
      .poll(() => viewport.style.getPropertyValue('--deck-viewport-step'))
      .toBe('176');
  });

  test('runs the same way in a vertical deck, the block axis', () => {
    addStyle(STEPPED_VERTICAL);
    const { step, span } = renderDeck({
      orientation: 'vertical',
      viewportClassName: 'stepped-vertical',
      viewportHeight: 600
    });

    expect(step()).toBe('176');
    expect(Number(span())).toBeCloseTo(600 / 176, 2);
  });

  test('writes neither property while the deck scrolls', async () => {
    addStyle(STEPPED);
    const { root, viewport, next, step, span } = renderDeck({
      viewportClassName: 'stepped'
    });
    const before = { step: step(), span: span() };
    const stop = countGeometryWrites(viewport);

    await userEvent.click(next);
    await expectSettledTo(() => root.getAttribute('data-index'), '1');

    expect(stop()).toBe(0);
    expect(step()).toBe(before.step);
    expect(span()).toBe(before.span);
  });

  // A common progress recipe (the progress guide's own example): scaling a
  // slide about its own centre, differently per slide since the scale
  // reads `--deck-slide-progress`, must not skew the step `writeGeometry`
  // reads back out from the scaled boxes (ADR-0014).
  test('measures the step independent of a consumer scale on the slides', () => {
    addStyle(SCALED);
    const { step } = renderDeck({ viewportClassName: 'scaled' });

    expect(step()).toBe('176');
  });
});

describe('--deck-viewport-step under an effect that stacks the slides', () => {
  // Fade and stack lay out one snap target per slide, each the viewport's
  // own size along the axis: see ADR-0014 for why that is the true, if
  // unexciting, step and span to report.
  test('is the viewport’s own size, so --deck-viewport-span reads about 1', () => {
    const { step, span } = renderDeck({ effect: fade, viewportWidth: WIDTH });

    expect(Number(step())).toBeCloseTo(WIDTH, 0);
    expect(Number(span())).toBeCloseTo(1, 2);
  });

  // Curve transforms only a slide's children, never the slide's own box
  // (ADR-0008), so it never feeds a transformed box to `measureGeometry` in
  // the first place; pinned here since #178 builds curve's own recipe on
  // top of the step.
  test('curve leaves the step at the slides’ own size', () => {
    addStyle(STEPPED);
    const { step } = renderDeck({
      effect: curve,
      viewportClassName: 'stepped'
    });

    expect(step()).toBe('176');
  });
});

describe('--deck-viewport-step with loop', () => {
  // Slides narrower than the viewport, with a gap, so the step and a bug
  // that measured the viewport instead could not read the same number
  // (ADR-0013's shells territory: the slides' own run is much wider than
  // the viewport).
  test('shells do not change the step', async () => {
    addStyle(STEPPED);
    const { step, next } = renderDeck({
      loop: true,
      viewportClassName: 'stepped',
      slides: 6
    });

    expect(step()).toBe('176');

    // Steps across the seam, onto shells and back onto the slides' own set:
    // the step reads the same throughout.
    for (let i = 0; i < 8; i++) {
      await userEvent.click(next);
      await sleep(60);
      expect(step()).toBe('176');
    }
  });

  // Few enough slides that the run falls back to copies rather than shells
  // (ADR-0013: `length < viewport + widest slide`, as the narrowing tests
  // in loop-one-instance.test.tsx also measure by): the step and span read
  // the same real slides' geometry either way.
  test('copies do not change the step either', async () => {
    addStyle(STEPPED);
    const { step, next } = renderDeck({
      loop: true,
      viewportClassName: 'stepped',
      slides: 4
    });

    expect(step()).toBe('176');

    for (let i = 0; i < 4; i++) {
      await userEvent.click(next);
      await sleep(60);
      expect(step()).toBe('176');
    }
  });
});
