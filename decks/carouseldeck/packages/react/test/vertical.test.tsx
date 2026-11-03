import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectSettledTo,
  expectSnaps,
  mouseAt,
  mouseDrag,
  nextFrame,
  pagesOf,
  viewportOf
} from './fixtures';

// A vertical deck scrolls on the block axis; its height is consumer CSS
// (ADR-0003), here set inline.
const HEIGHT = 200;

type VerticalDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportClassName?: string;
};

function VerticalDeck({
  slides = 5,
  viewportClassName,
  ...props
}: VerticalDeckProps) {
  return (
    <Deck.Root aria-label="Test deck" orientation="vertical" {...props}>
      <Deck.Prev />
      <Deck.Viewport
        className={viewportClassName}
        style={{ width: 300, height: HEIGHT }}
      >
        {Array.from({ length: slides }, (_, i) => (
          <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  );
}

const renderDeck = (props: VerticalDeckProps = {}) => {
  const onIndexChange = vi.fn();
  const onFocalChange = vi.fn();
  render(
    <VerticalDeck
      onIndexChange={onIndexChange}
      onFocalChange={onFocalChange}
      {...props}
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  return {
    root,
    viewport,
    onIndexChange,
    onFocalChange,
    prev: screen.getByRole('button', { name: 'Previous' }),
    next: screen.getByRole('button', { name: 'Next' }),
    dots: () =>
      within(root)
        .getByRole('group', { name: 'Choose page' })
        .querySelectorAll('button'),
    counter: () =>
      root.querySelector('[data-carouseldeck-counter]')?.textContent,
    focal: () =>
      [...viewport.children].flatMap((slide, i) =>
        slide.hasAttribute('data-focal') ? [i] : []
      )
  };
};

const scrollTop = (viewport: HTMLElement) => () => viewport.scrollTop;

/** A slow drag: held still before release, so it carries no flick. */
const slowly = { steps: 10, stepMs: 20, holdMs: 120, axis: 'y' } as const;

describe('a vertical deck', () => {
  test('slides fill the viewport with no stylesheet, one per snap point', () => {
    const { viewport } = renderDeck();

    const slide = viewport.children[1].getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    expect(Math.round(slide.top - view.top)).toBe(HEIGHT);
    expect(Math.round(slide.height)).toBe(HEIGHT);
    expect(viewport.scrollLeft).toBe(0);
  });

  test('starts at defaultIndex', () => {
    const { viewport, root } = renderDeck({ defaultIndex: 3 });

    expect(viewport.scrollTop).toBe(3 * HEIGHT);
    expect(root.dataset.index).toBe('3');
  });

  test('Next and Prev step one snap point down and up, reporting each', async () => {
    const { viewport, root, prev, next, onIndexChange } = renderDeck();

    await userEvent.click(next);
    await expectSettledTo(scrollTop(viewport), HEIGHT);
    await userEvent.click(next);
    await expectSettledTo(scrollTop(viewport), 2 * HEIGHT);
    await userEvent.click(prev);
    await expectSettledTo(scrollTop(viewport), HEIGHT);

    expect(onIndexChange.mock.calls).toEqual([[1], [2], [1]]);
    expect(root.dataset.index).toBe('1');
  });

  test('Next is disabled at the last snap point', async () => {
    const { viewport, next } = renderDeck({ defaultIndex: 3 });

    await userEvent.click(next);

    await expectSettledTo(scrollTop(viewport), 4 * HEIGHT);
    expect(next.hasAttribute('disabled')).toBe(true);
  });

  test('a wheel scroll comes to rest on a snap point and reports it', async () => {
    const { viewport, onIndexChange } = renderDeck();

    await userEvent.wheel(viewport, { delta: { y: 150 } });

    await expectSettledTo(scrollTop(viewport), HEIGHT);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
    await expectSnaps(viewport, 'scrollTop');
  });

  test('ArrowDown on the focused viewport moves it down a snap point', async () => {
    const { viewport, onIndexChange } = renderDeck();

    viewport.focus();
    await userEvent.keyboard('{ArrowDown}');

    await expectSettledTo(() => onIndexChange.mock.calls, [[1]]);
    expect(viewport.scrollTop).toBe(HEIGHT);
  });

  test('in pages of three, Next moves a page, and Dots and Counter count pages', async () => {
    addStyle(pagesOf(3));
    const { viewport, next, dots, counter } = renderDeck({
      slides: 10,
      viewportClassName: 'pages'
    });
    // Paged, one snap point is several slides: a natural-rest mount (#333)
    // measures the real count a frame after mount, not during it.
    await nextFrame();
    await nextFrame();

    expect(dots()).toHaveLength(4);
    await userEvent.click(next);
    await expectSettledTo(scrollTop(viewport), 3 * HEIGHT);
    expect(counter()).toBe('2 / 4');

    await userEvent.click(dots()[3]);
    await expectSettledTo(scrollTop(viewport), 9 * HEIGHT);
    expect(counter()).toBe('4 / 4');
  });

  test('the focal slide is the one at the snap alignment point', async () => {
    addStyle(
      `.centred > * { height: calc(100% / 3.5); scroll-snap-align: center; }`
    );
    const { next, focal, onFocalChange } = renderDeck({
      slides: 7,
      viewportClassName: 'centred'
    });

    // At scroll 0, slide 0 rests at the snap point but slide 1 is centred.
    await expect.poll(focal).toEqual([1]);
    await userEvent.click(next);
    await expectSettledTo(focal, [2]);
    expect(onFocalChange.mock.calls).toEqual([[2]]);
  });

  test('clicking a slide brings it to the focal position', async () => {
    addStyle(
      `.centred > * { height: calc(100% / 3.5); scroll-snap-align: center; }`
    );
    const { viewport, focal } = renderDeck({
      slides: 7,
      viewportClassName: 'centred',
      clickToFocus: true
    });
    await expect.poll(focal).toEqual([1]);

    // Slide 3 is in view, below the centre.
    const view = viewport.getBoundingClientRect();
    const box = viewport.children[2].getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = (box.top + Math.min(box.bottom, view.bottom)) / 2;
    await mouseAt('mousePressed', x, y, 1);
    await mouseAt('mouseReleased', x, y, 0);

    await expectSettledTo(focal, [2]);
  });
});

test('a deck that turns vertical after mount steps down', async () => {
  const { rerender } = render(<VerticalDeck orientation="horizontal" />);
  const viewport = viewportOf(
    screen.getByRole('region', { name: 'Test deck' })
  );

  rerender(<VerticalDeck orientation="vertical" />);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));

  await expectSettledTo(scrollTop(viewport), HEIGHT);
  expect(viewport.scrollLeft).toBe(0);
});

describe('a mouse drag on a vertical deck', () => {
  test('moves the deck with the pointer, up and down', async () => {
    const { viewport } = renderDeck();

    const letGo = await mouseDrag(viewport, -100, {
      ...slowly,
      release: false
    });

    await expect.poll(scrollTop(viewport)).toBe(100);
    await letGo();
  });

  test('past half a slide upward settles on the next snap point and reports it once', async () => {
    const { viewport, onIndexChange } = renderDeck();

    await mouseDrag(viewport, -150, slowly);

    await expectSettledTo(scrollTop(viewport), HEIGHT);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
    await expectSnaps(viewport, 'scrollTop');
  });

  test('a flick moves on a snap point though it is short', async () => {
    const { viewport, onIndexChange } = renderDeck();

    await mouseDrag(viewport, -50, { steps: 4, stepMs: 20, axis: 'y' });

    await expectSettledTo(scrollTop(viewport), HEIGHT);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test('downward from a later slide goes back', async () => {
    const { viewport, onIndexChange } = renderDeck({ defaultIndex: 2 });

    await mouseDrag(viewport, 150, slowly);

    await expectSettledTo(scrollTop(viewport), HEIGHT);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });
});
