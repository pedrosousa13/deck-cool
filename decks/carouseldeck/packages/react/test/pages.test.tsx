import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectSettledTo,
  nextFrame,
  pagesOf,
  sleep,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

const renderPagedDeck = (onIndexChange?: (index: number) => void) => {
  render(
    <TestDeck
      slides={10}
      onIndexChange={onIndexChange}
      viewportClassName="pages"
      controls={
        <>
          <Deck.Dots />
          <Deck.Counter />
        </>
      }
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  return {
    root,
    viewport: viewportOf(root),
    next: screen.getByRole('button', { name: 'Next' }),
    dots: () =>
      within(root)
        .getByRole('group', { name: 'Choose page' })
        .querySelectorAll('button'),
    counter: () =>
      root.querySelector('[data-carouseldeck-counter]')?.textContent
  };
};

describe('pages of 3 over 10 slides', () => {
  test('Next moves three slides, and the last page is reachable', async () => {
    addStyle(pagesOf(3));
    const { viewport, next } = renderPagedDeck();

    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 6 * WIDTH);
    // The last page holds one slide, the tenth.
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 9 * WIDTH);
    expect(next.hasAttribute('disabled')).toBe(true);
  });

  test('with three slides in view, the partial last page rests at the end', async () => {
    addStyle(`${pagesOf(3)} .pages > * { width: calc(100% / 3); }`);
    const { viewport, next, dots } = renderPagedDeck();
    const end = viewport.scrollWidth - viewport.clientWidth;

    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    // Slide 10 starts past the end of the scroll range, so its page rests
    // at the end: a page of its own, with a dot of its own.
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, end);
    expect(dots()).toHaveLength(4);
    expect(dots()[3].getAttribute('aria-current')).toBe('true');
    expect(next.hasAttribute('disabled')).toBe(true);
  });

  test('dots render one per page and the counter counts pages', async () => {
    addStyle(pagesOf(3));
    const { viewport, next, dots, counter } = renderPagedDeck();
    // Paged, one snap point is several slides: a natural-rest mount (#333)
    // measures the real count a frame after mount, not during it.
    await nextFrame();
    await nextFrame();

    expect(dots()).toHaveLength(4);
    expect(counter()).toBe('1 / 4');

    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(counter()).toBe('2 / 4');
    expect(dots()[1].getAttribute('aria-current')).toBe('true');
  });

  test('a dot moves to its page', async () => {
    addStyle(pagesOf(3));
    const { viewport, dots, counter } = renderPagedDeck();

    await userEvent.click(dots()[3]);

    await expectSettledTo(() => viewport.scrollLeft, 9 * WIDTH);
    expect(counter()).toBe('4 / 4');
  });

  test('slide labels still count slides, not pages', () => {
    addStyle(pagesOf(3));
    renderPagedDeck();

    expect(screen.getByRole('group', { name: '10 of 10' })).toBeTruthy();
  });
});

describe('page size per breakpoint', () => {
  // Restores Vitest's default browser viewport, 414x896: vitest.config.ts
  // sets none, so later tests run at the size they would otherwise get.
  afterEach(() => page.viewport(414, 896));

  test('a media query that changes the page size updates dots and counter', async () => {
    // Pages of 2 on narrow screens, 5 on wide ones. The deck's viewport has
    // a fixed width, so only the window resizes.
    addStyle(`
      ${pagesOf(2)}
      @media (min-width: 600px) { ${pagesOf(5)} }
    `);
    await page.viewport(400, 600);
    const { dots, counter } = renderPagedDeck();
    // Paged, one snap point is several slides: a natural-rest mount (#333)
    // measures the real count a frame after mount, not during it.
    await nextFrame();
    await nextFrame();
    expect(dots()).toHaveLength(5);
    expect(counter()).toBe('1 / 5');

    await page.viewport(800, 600);

    await expect.poll(() => dots().length).toBe(2);
    expect(counter()).toBe('1 / 2');

    await page.viewport(400, 600);

    await expect.poll(() => dots().length).toBe(5);
    expect(counter()).toBe('1 / 5');
  });

  test('a flip from a later page keeps the visible slide and reports it once', async () => {
    // One slide per page on narrow screens, three from 600px.
    addStyle(`
      ${pagesOf(1)}
      @media (min-width: 600px) { ${pagesOf(3)} }
    `);
    await page.viewport(800, 600);
    const onIndexChange = vi.fn();
    const { viewport, next, counter } = renderPagedDeck(onIndexChange);
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    onIndexChange.mockClear();

    await page.viewport(400, 600);

    // Page 2 of 4 started at slide 4, which is now page 4 of 10.
    await expect.poll(counter).toBe('4 / 10');
    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  test('a window resize that keeps the page size fires nothing', async () => {
    addStyle(`
      ${pagesOf(1)}
      @media (min-width: 600px) { ${pagesOf(3)} }
    `);
    await page.viewport(800, 600);
    const onIndexChange = vi.fn();
    const { viewport, next, counter } = renderPagedDeck(onIndexChange);
    await userEvent.click(next);
    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    onIndexChange.mockClear();

    await page.viewport(900, 600);
    await page.viewport(850, 600);
    await sleep(400);

    expect(onIndexChange).not.toHaveBeenCalled();
    expect(counter()).toBe('2 / 4');
    expect(viewport.scrollLeft).toBe(3 * WIDTH);
  });
});
