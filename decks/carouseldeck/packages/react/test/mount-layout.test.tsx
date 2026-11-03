import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDeck, type DeckState } from '@carouseldeck/core';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  nextFrame,
  pagesOf,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

// #333: a deck that starts at its own rest -- index 0, no loop, no shells --
// used to measure layout synchronously in `createDeck`'s constructor, inside
// `Deck.Root`'s mount `useLayoutEffect`, which runs with styles already
// invalid and forces a style and layout pass before the first paint. Fixed,
// that measurement moves to the engine's first `ResizeObserver` callback,
// which runs after layout, so the constructor itself reads nothing. These
// count every layout-reading API `createDeck` and `Deck.Root`'s mount could
// reach, over the synchronous call, and check the first published state is
// unchanged, at most a frame later.

const ELEMENT_GETTERS = [
  'scrollLeft',
  'scrollTop',
  'scrollWidth',
  'scrollHeight',
  'clientWidth',
  'clientHeight',
  'clientLeft',
  'clientTop'
] as const;
const HTML_ELEMENT_GETTERS = [
  'offsetWidth',
  'offsetHeight',
  'offsetLeft',
  'offsetTop'
] as const;

function countLayoutReads() {
  const spies = [
    vi.spyOn(window, 'getComputedStyle'),
    vi.spyOn(Element.prototype, 'getBoundingClientRect'),
    vi.spyOn(Element.prototype, 'getClientRects'),
    ...ELEMENT_GETTERS.map((name) => vi.spyOn(Element.prototype, name, 'get')),
    ...HTML_ELEMENT_GETTERS.map((name) =>
      vi.spyOn(HTMLElement.prototype, name, 'get')
    )
  ];
  return {
    count: () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** A plain viewport of `count` slides, each `WIDTH` wide (or tall) and
 * snapping to `start`: a predictable, stylesheet-free deck, built directly
 * on `@carouseldeck/core` the way `loop-one-instance.test.tsx` already does. */
const CROSS = 10;

function buildViewport(count: number, { vertical = false } = {}) {
  const viewport = document.createElement('div');
  Object.assign(viewport.style, {
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    overflowX: vertical ? 'hidden' : 'auto',
    overflowY: vertical ? 'auto' : 'hidden',
    scrollSnapType: vertical ? 'y mandatory' : 'x mandatory',
    width: vertical ? `${CROSS}px` : `${WIDTH}px`,
    height: vertical ? `${WIDTH}px` : `${CROSS}px`
  });
  for (let i = 0; i < count; i++) {
    const slide = document.createElement('div');
    // An explicit pixel cross size, never `100%`: a flex child stretched to
    // a percentage of a scrolling cross axis measures its own main-axis
    // overflow as none in Chromium (confirmed against this very browser),
    // collapsing `scrollWidth`/`scrollHeight` to the viewport's own.
    Object.assign(slide.style, {
      flexShrink: '0',
      width: vertical ? `${CROSS}px` : `${WIDTH}px`,
      height: vertical ? `${WIDTH}px` : `${CROSS}px`,
      scrollSnapAlign: 'start'
    });
    viewport.append(slide);
  }
  document.body.append(viewport);
  return viewport;
}

const lastState = (onChange: ReturnType<typeof vi.fn>) =>
  onChange.mock.calls.at(-1)?.[0] as DeckState;

describe('core: a natural-rest mount reads nothing (#333)', () => {
  test('index 0, horizontal: no read during createDeck, then the same state a sync mount reported', async () => {
    const viewport = buildViewport(5);
    const reads = countLayoutReads();
    const onChange = vi.fn();

    const engine = createDeck(viewport, { index: 0, onChange });
    try {
      expect(reads.count()).toBe(0);
      vi.restoreAllMocks();

      await nextFrame();
      await nextFrame();

      expect(onChange).toHaveBeenCalled();
      const state = lastState(onChange);
      expect({ index: state.index, count: state.count }).toEqual({
        index: 0,
        count: 5
      });
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('index 0, vertical: no read during createDeck, then the same state a sync mount reported', async () => {
    const viewport = buildViewport(5, { vertical: true });
    const reads = countLayoutReads();
    const onChange = vi.fn();

    const engine = createDeck(viewport, {
      index: 0,
      orientation: 'vertical',
      onChange
    });
    try {
      expect(reads.count()).toBe(0);
      vi.restoreAllMocks();

      await nextFrame();
      await nextFrame();

      expect(onChange).toHaveBeenCalled();
      const state = lastState(onChange);
      expect({ index: state.index, count: state.count }).toEqual({
        index: 0,
        count: 5
      });
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('a non-zero index still measures synchronously, and publishes at once', () => {
    const viewport = buildViewport(5);
    const reads = countLayoutReads();
    const onChange = vi.fn();

    const engine = createDeck(viewport, { index: 2, onChange });
    try {
      expect(reads.count()).toBeGreaterThan(0);
      vi.restoreAllMocks();

      expect(onChange).toHaveBeenCalled();
      const state = lastState(onChange);
      expect({ index: state.index, count: state.count }).toEqual({
        index: 2,
        count: 5
      });
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('a loop still measures synchronously, even at index 0', () => {
    const viewport = buildViewport(5);
    const reads = countLayoutReads();
    const onChange = vi.fn();

    const engine = createDeck(viewport, { index: 0, loop: true, onChange });
    try {
      expect(reads.count()).toBeGreaterThan(0);
      vi.restoreAllMocks();

      expect(onChange).toHaveBeenCalled();
      expect(lastState(onChange).index).toBe(0);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  // A `display: none` viewport has no size for `ResizeObserver` to report,
  // the same collapsed box a sync mount already measured there before
  // #333: the natural-rest mount still publishes it, through the deferred
  // callback rather than the constructor, and corrects to the real count
  // once the viewport is actually shown.
  test('a zero-size viewport publishes the collapsed state, then the real one once shown', async () => {
    const viewport = buildViewport(5);
    viewport.style.display = 'none';
    const onChange = vi.fn();

    const engine = createDeck(viewport, { index: 0, onChange });
    try {
      await nextFrame();
      await nextFrame();
      expect(onChange).toHaveBeenCalled();
      const collapsed = lastState(onChange);
      expect({ index: collapsed.index, count: collapsed.count }).toEqual({
        index: 0,
        count: 1
      });

      viewport.style.display = 'flex';
      await nextFrame();
      await nextFrame();

      const state = lastState(onChange);
      expect({ index: state.index, count: state.count }).toEqual({
        index: 0,
        count: 5
      });
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });
});

describe('react: a natural-rest mount reads nothing (#333)', () => {
  test('Deck.Root at the default index makes no read during render, then settles a frame later', async () => {
    const reads = countLayoutReads();

    render(<TestDeck />);

    expect(reads.count()).toBe(0);
    vi.restoreAllMocks();

    // `data-in-view` is written only by the engine's own `writeProgress`,
    // never by server-rendered JSX (ADR-0011): its presence is the real
    // settle, not Counter's and Dots's SSR-safe guess from the slide count,
    // which already reads right before the engine ever runs.
    const root = screen.getByRole('region', { name: 'Test deck' });
    const first = viewportOf(root).querySelector('[data-carouseldeck-slide]')!;
    await expect.poll(() => first.hasAttribute('data-in-view')).toBe(true);
  });

  test('Deck.Root with defaultIndex set still measures and settles synchronously', () => {
    render(<TestDeck defaultIndex={2} />);

    const root = screen.getByRole('region', { name: 'Test deck' });
    const third = viewportOf(root).querySelectorAll(
      '[data-carouseldeck-slide]'
    )[2];
    expect(third.hasAttribute('data-in-view')).toBe(true);
  });

  // A deck whose snap points are not one per slide (pages) is the accepted
  // cost of the natural-rest mount above: Dots renders the SSR-safe guess,
  // one dot per slide, until the engine's own first measurement corrects
  // it, within the same two frames the core tests above wait out.
  test('a client deck that pages shows the real Dots count within two frames of mount', async () => {
    addStyle(pagesOf(2));
    render(
      <TestDeck slides={4} viewportClassName="pages" controls={<Deck.Dots />} />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const dots = () =>
      within(root)
        .getByRole('group', { name: 'Choose page' })
        .querySelectorAll('button');

    await nextFrame();
    await nextFrame();

    expect(dots()).toHaveLength(2);
  });
});
