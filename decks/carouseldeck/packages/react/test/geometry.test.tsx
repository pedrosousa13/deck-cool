import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import type { Effect } from '@carouseldeck/react';
import { fade } from '@carouseldeck/react/fade';
import {
  addStyle,
  expectSettledTo,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';

// --deck-step and --deck-view (ADR-0014): the viewport's own measured
// geometry, written as plain, unitless numbers so CSS can divide pixels by
// them without dividing one length by another. Written on `Deck.Viewport`
// alone, at measure time -- mount, resize, a slide added or removed -- never
// per scroll frame (GLOSSARY.md, "carouseldeck writes only `--deck-slide-*`"
// is amended by ADR-0014 for these two, the viewport's own).

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
    step: () => viewport.style.getPropertyValue('--deck-step'),
    view: () => viewport.style.getPropertyValue('--deck-view')
  };
};

/**
 * Counts how many times `--deck-step` or `--deck-view` actually changes
 * value on the viewport: a `MutationObserver` on its own style attribute,
 * counting only where a value differs from the last read, the same test
 * `countTranslateWrites` (loop-one-instance.test.tsx) makes for a real
 * slide's `translate` -- proving the properties are never rewritten while
 * the deck scrolls, not merely that the string happens to come out the
 * same each time.
 */
function countGeometryWrites(viewport: HTMLElement) {
  const read = (): [string, string] => [
    viewport.style.getPropertyValue('--deck-step'),
    viewport.style.getPropertyValue('--deck-view')
  ];
  let last = read();
  let changes = 0;
  const check = () => {
    const next = read();
    if (next[0] !== last[0] || next[1] !== last[1]) changes++;
    last = next;
  };
  const observer = new MutationObserver(() => check());
  observer.observe(viewport, { attributes: true, attributeFilter: ['style'] });
  return () => {
    observer.takeRecords();
    check();
    observer.disconnect();
    return changes;
  };
}

describe('--deck-step and --deck-view', () => {
  test('are the slide-to-slide step and the viewport in steps, as plain numbers', () => {
    addStyle(STEPPED);
    const { step, view } = renderDeck({ viewportClassName: 'stepped' });

    expect(step()).toBe('176');
    expect(Number(view())).toBeCloseTo(600 / 176, 2);
  });

  test('inherits onto every slide, for consumer CSS to read', () => {
    addStyle(STEPPED);
    const { viewport } = renderDeck({ viewportClassName: 'stepped' });
    const slide = viewport.querySelector<HTMLElement>(
      '[data-carouseldeck-slide]'
    )!;

    expect(getComputedStyle(slide).getPropertyValue('--deck-step').trim()).toBe(
      '176'
    );
  });

  test('is unset before measurement, in server HTML', () => {
    const html = renderToString(<GeometryDeck />);
    const container = document.createElement('div');
    container.innerHTML = html;
    const viewport = viewportOf(container);

    expect(viewport.getAttribute('style') ?? '').not.toMatch(
      /--deck-(step|view)/
    );
  });

  test('is unset with fewer than two real slides', () => {
    addStyle(STEPPED);
    const { step, view } = renderDeck({
      viewportClassName: 'stepped',
      slides: 1
    });

    expect(step()).toBe('');
    expect(view()).toBe('');
  });

  test('updates --deck-view on a resize, without moving --deck-step', async () => {
    addStyle(STEPPED);
    const { viewport, step, view } = renderDeck({
      viewportClassName: 'stepped'
    });
    expect(step()).toBe('176');

    viewport.style.width = '976px';

    await expect.poll(() => Number(view())).toBeCloseTo(976 / 176, 2);
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
    expect(viewport.style.getPropertyValue('--deck-step')).toBe('176');

    rerender(<Toggle slides={1} />);

    await expect
      .poll(() => viewport.style.getPropertyValue('--deck-step'))
      .toBe('');
    expect(viewport.style.getPropertyValue('--deck-view')).toBe('');
  });

  test('picks up a slide added back, rather than staying unset', async () => {
    addStyle(STEPPED);
    function Toggle({ slides }: { slides: number }) {
      return <GeometryDeck viewportClassName="stepped" slides={slides} />;
    }
    const { rerender } = render(<Toggle slides={1} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    expect(viewport.style.getPropertyValue('--deck-step')).toBe('');

    rerender(<Toggle slides={2} />);

    await expect
      .poll(() => viewport.style.getPropertyValue('--deck-step'))
      .toBe('176');
  });

  test('runs the same way in a vertical deck, the block axis', () => {
    addStyle(STEPPED_VERTICAL);
    const { step, view } = renderDeck({
      orientation: 'vertical',
      viewportClassName: 'stepped-vertical',
      viewportHeight: 600
    });

    expect(step()).toBe('176');
    expect(Number(view())).toBeCloseTo(600 / 176, 2);
  });

  test('writes neither property while the deck scrolls', async () => {
    addStyle(STEPPED);
    const { root, viewport, next, step, view } = renderDeck({
      viewportClassName: 'stepped'
    });
    const before = { step: step(), view: view() };
    const stop = countGeometryWrites(viewport);

    await userEvent.click(next);
    await expectSettledTo(() => root.getAttribute('data-index'), '1');

    expect(stop()).toBe(0);
    expect(step()).toBe(before.step);
    expect(view()).toBe(before.view);
  });
});

describe('--deck-step under an effect that stacks the slides', () => {
  // Fade and stack lay out one snap target per slide, each exactly the
  // viewport's own size along the axis (`stackedLayout`), so the step
  // between them is the viewport's size, and the viewport reads as about
  // one step wide: true to what fade and stack actually measure, not a
  // slide-sized value they do not lay out (ADR-0014).
  test('is the viewport’s own size, so --deck-view reads about 1', () => {
    const { step, view } = renderDeck({ effect: fade, viewportWidth: WIDTH });

    expect(Number(step())).toBeCloseTo(WIDTH, 0);
    expect(Number(view())).toBeCloseTo(1, 2);
  });
});

describe('--deck-step with loop', () => {
  // A set of slides this much wider than the viewport, no gap, is loop's
  // shells territory (ADR-0013): the step still reads as one slide's own
  // width, the same as without loop.
  test('shells do not change the step', async () => {
    const { step, next } = renderDeck({
      loop: true,
      viewportWidth: WIDTH,
      slides: 6
    });

    expect(Number(step())).toBeCloseTo(WIDTH, 0);

    // Steps across the seam, onto shells and back onto the slides' own set:
    // the step reads the same throughout.
    for (let i = 0; i < 8; i++) {
      await userEvent.click(next);
      await sleep(60);
      expect(Number(step())).toBeCloseTo(WIDTH, 0);
    }
  });
});
