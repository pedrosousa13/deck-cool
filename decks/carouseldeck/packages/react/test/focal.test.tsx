import { createRef, type ComponentProps, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  CENTRED,
  expectSettledTo,
  mouseAt,
  mouseDrag,
  pagesOf,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';

// The focal slide is the one at the snap alignment point (GLOSSARY.md), which
// is consumer CSS (ADR-0003): here 3.5 slides in view, centred. Seven slides
// give five snap points: slides 0 and 1 both rest at scroll 0, slides 5 and 6
// both at the end of the range.
const SLIDE = WIDTH / 3.5;

type FocalDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportClassName?: string;
  slideContent?: (index: number) => ReactNode;
};

/** Slides of plain text by default, so a click on one focuses nothing in it. */
function FocalDeck({
  slides = 7,
  viewportClassName = 'centred',
  slideContent = (i) => `Slide ${i + 1}`,
  ...props
}: FocalDeckProps) {
  return (
    <Deck.Root aria-label="Test deck" {...props}>
      <Deck.Viewport className={viewportClassName} style={{ width: WIDTH }}>
        {Array.from({ length: slides }, (_, i) => (
          <Deck.Slide key={i} style={{ height: 100 }}>
            {slideContent(i)}
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Next />
    </Deck.Root>
  );
}

const renderDeck = (props: FocalDeckProps = {}) => {
  const onFocalChange = vi.fn();
  const handle = createRef<Deck.RootHandle>();
  const result = render(
    <FocalDeck onFocalChange={onFocalChange} handleRef={handle} {...props} />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  const marked = (name: string) =>
    [...viewport.children].flatMap((slide, i) =>
      slide.hasAttribute(name) ? [i] : []
    );
  return {
    ...result,
    root,
    viewport,
    handle,
    onFocalChange,
    next: screen.getByRole('button', { name: 'Next' }),
    focal: () => marked('data-focal'),
    current: () => marked('data-current')
  };
};

/** A real mouse click (CDP) on the part of a slide in view. */
async function clickSlide(viewport: HTMLElement, index: number) {
  const view = viewport.getBoundingClientRect();
  const box = viewport.children[index].getBoundingClientRect();
  const x =
    (Math.max(box.left, view.left) + Math.min(box.right, view.right)) / 2;
  const y = box.top + box.height / 2;
  await mouseAt('mousePressed', x, y, 1);
  await mouseAt('mouseReleased', x, y, 0);
}

describe('data-focal', () => {
  test('with one slide in view, marks the current slide', async () => {
    const { next, focal } = renderDeck({ slides: 3, viewportClassName: '' });

    expect(focal()).toEqual([0]);
    await userEvent.click(next);
    await expectSettledTo(focal, [1]);
  });

  test('with centre alignment, marks the slide at the centre, not the current slide', async () => {
    addStyle(CENTRED);
    const { next, focal, current } = renderDeck();

    // At scroll 0, slide 0 rests at the snap point but slide 1 is centred.
    await expect.poll(focal).toEqual([1]);
    expect(current()).toEqual([0]);
    await userEvent.click(next);
    await expectSettledTo(focal, [2]);
    expect(current()).toEqual([2]);
  });

  test('with centre alignment at the end of the range, marks the slide nearest the centre', async () => {
    addStyle(CENTRED);
    const { handle, viewport, focal } = renderDeck();

    act(() => handle.current!.scrollTo(4));

    await expectSettledTo(
      () => viewport.scrollLeft,
      viewport.scrollWidth - viewport.clientWidth
    );
    expect(focal()).toEqual([5]);
  });

  test('with start alignment and pages of three, marks a slide, not a page', async () => {
    // Three slides in view, three to a page: the last page holds slide 9
    // alone and rests at the end of the range, where slide 7 is at the start.
    addStyle(`
      .pages > * { width: calc(100% / 3); }
      .pages > :nth-child(3n + 1) { scroll-snap-align: start; }
      .pages > :not(:nth-child(3n + 1)) { scroll-snap-align: none; }
    `);
    const { root, handle, focal } = renderDeck({
      slides: 10,
      viewportClassName: 'pages'
    });

    expect(focal()).toEqual([0]);
    act(() => handle.current!.next());
    await expectSettledTo(focal, [3]);
    act(() => handle.current!.scrollTo(3));
    await expectSettledTo(focal, [7]);
    expect(root.dataset.index).toBe('3');
  });

  describe('across a breakpoint', () => {
    afterEach(() => page.viewport(414, 896));

    test('follows a breakpoint that changes the slides in view', async () => {
      // One slide in view on narrow screens, 3.5 centred from 600px.
      addStyle(`@media (min-width: 600px) { ${CENTRED} }`);
      await page.viewport(400, 600);
      const { focal, onFocalChange } = renderDeck();
      expect(focal()).toEqual([0]);

      await page.viewport(800, 600);

      await expectSettledTo(focal, [1]);
      expect(onFocalChange.mock.calls).toEqual([[1]]);
    });
  });

  test('server HTML marks the slide the deck starts at', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <FocalDeck defaultIndex={2} viewportClassName="" />
    );
    const slides = [...viewportOf(container).children];

    expect(slides.map((slide) => slide.hasAttribute('data-focal'))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false
    ]);
  });
});

describe('onFocalChange', () => {
  test('does not fire on mount', async () => {
    addStyle(CENTRED);
    const { focal, onFocalChange } = renderDeck();

    await expectSettledTo(focal, [1]);
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('fires once per change, with the slide index', async () => {
    addStyle(CENTRED);
    const { next, onFocalChange } = renderDeck();

    await userEvent.click(next);
    await expectSettledTo(() => onFocalChange.mock.calls, [[2]]);
    await userEvent.click(next);
    await expectSettledTo(() => onFocalChange.mock.calls, [[2], [3]]);
  });

  test('does not fire during a scroll across several slides', async () => {
    addStyle(CENTRED);
    const { viewport, focal, onFocalChange } = renderDeck();

    // A held drag carries the deck past two slides without letting go.
    const letGo = await mouseDrag(viewport, -2 * SLIDE, {
      stepMs: 20,
      holdMs: 120,
      release: false
    });
    await sleep(300);
    expect(onFocalChange).not.toHaveBeenCalled();
    expect(focal()).toEqual([1]);

    await letGo();
    await expectSettledTo(() => onFocalChange.mock.calls, [[3]]);
    expect(focal()).toEqual([3]);
  });
});

describe('click-to-focus', () => {
  test('is off by default: clicking a non-focal slide leaves the deck where it is', async () => {
    addStyle(CENTRED);
    const { viewport, focal } = renderDeck();
    await expect.poll(focal).toEqual([1]);

    await clickSlide(viewport, 3);
    await sleep(400);

    expect(viewport.scrollLeft).toBe(0);
    expect(focal()).toEqual([1]);
  });

  test('brings a clicked non-focal slide to focus, reporting it once', async () => {
    addStyle(CENTRED);
    const { viewport, focal, onFocalChange } = renderDeck({
      clickToFocus: true
    });

    await clickSlide(viewport, 3);

    await expectSettledTo(focal, [3]);
    expect(onFocalChange.mock.calls).toEqual([[3]]);
    // Slide 3 is centred in the viewport.
    const view = viewport.getBoundingClientRect();
    const box = viewport.children[3].getBoundingClientRect();
    expect(
      Math.abs(box.left + box.width / 2 - (view.left + view.width / 2))
    ).toBeLessThan(1);
  });

  test('a slide that cannot reach the alignment point goes as near as the scroll range allows', async () => {
    addStyle(CENTRED);
    const { viewport, handle, focal } = renderDeck({ clickToFocus: true });
    act(() => handle.current!.scrollTo(3));
    await expectSettledTo(focal, [4]);

    // Slide 6 would be centred past the end of the range: the deck goes to
    // the end, where slide 5 is nearest the centre.
    await clickSlide(viewport, 6);

    await expectSettledTo(
      () => viewport.scrollLeft,
      viewport.scrollWidth - viewport.clientWidth
    );
    expect(focal()).toEqual([5]);
  });

  test('clicking the focal slide does nothing', async () => {
    addStyle(CENTRED);
    const { viewport, focal, onFocalChange } = renderDeck({
      clickToFocus: true
    });
    await expect.poll(focal).toEqual([1]);

    await clickSlide(viewport, 1);
    await sleep(400);

    expect(viewport.scrollLeft).toBe(0);
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('a drag that ends on a non-focal slide does not bring it to focus', async () => {
    addStyle(CENTRED);
    const { viewport, focal, onFocalChange } = renderDeck({
      clickToFocus: true
    });
    await expect.poll(focal).toEqual([1]);

    // Pressed on slide 3, at the viewport's right edge, and dragged short of
    // half a slide: the deck settles back where it was. Chromium sends the
    // click after a drag to the viewport, which holds the pointer capture,
    // not to the slide; the drag swallows it either way.
    await mouseDrag(viewport, -30, { stepMs: 20, holdMs: 120 });

    await expectSettledTo(() => viewport.scrollLeft, 0);
    expect(focal()).toEqual([1]);
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('a keyboard click on a button in a non-focal slide runs the button, not click-to-focus', async () => {
    addStyle(CENTRED);
    const onPress = vi.fn();
    const { viewport, focal, onFocalChange } = renderDeck({
      clickToFocus: true,
      slideContent: (i) => (
        <button type="button" onClick={() => onPress(i)}>
          Button {i + 1}
        </button>
      )
    });
    await expect.poll(focal).toEqual([1]);

    // Slide 2 is wholly in view, so focus moving into it scrolls nothing.
    screen.getByRole('button', { name: 'Button 3' }).focus();
    await userEvent.keyboard('{Enter}');
    await sleep(400);

    expect(onPress.mock.calls).toEqual([[2]]);
    expect(viewport.scrollLeft).toBe(0);
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('can be turned on after mount', async () => {
    addStyle(CENTRED);
    const { viewport, focal, rerender } = renderDeck();

    rerender(<FocalDeck clickToFocus />);
    await clickSlide(viewport, 3);

    await expectSettledTo(focal, [3]);
  });
});

// Three slides in view, three to a page: page starts at slides 0, 3 and 6, and
// the last page, slide 9 alone, rests at the end of the range.
describe('click-to-focus with pages of three', () => {
  const PAGES = `${pagesOf(3)} .pages > * { width: calc(100% / 3); }`;
  const renderPages = () =>
    renderDeck({ slides: 10, viewportClassName: 'pages', clickToFocus: true });

  test('clicking a slide in the current page leaves the deck where it is', async () => {
    addStyle(PAGES);
    const { root, viewport, handle, onFocalChange } = renderPages();

    await clickSlide(viewport, 2);
    await sleep(400);
    expect(viewport.scrollLeft).toBe(0);

    act(() => handle.current!.scrollTo(1));
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    onFocalChange.mockClear();
    await clickSlide(viewport, 5);
    await sleep(400);

    expect(viewport.scrollLeft).toBe(WIDTH);
    expect(root.dataset.index).toBe('1');
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('clicking a slide in another page goes to that page', async () => {
    addStyle(PAGES);
    const { root, viewport, handle } = renderPages();
    act(() => handle.current!.scrollTo(3));
    await expectSettledTo(() => root.dataset.index, '3');

    // At the end, slides 7, 8 and 9 are in view; slide 7 is in page 2.
    await clickSlide(viewport, 7);

    await expectSettledTo(() => root.dataset.index, '2');
    expect(viewport.scrollLeft).toBe(2 * WIDTH);
  });
});

// Three to a page, each page snapping on its last slide at the end, with 3.5
// slides in view: pages rest at scroll 0, 6 slides less the viewport (slides
// 2.5 to 6 in view) and the end of the range.
describe('click-to-focus with end-aligned pages', () => {
  const END_PAGES = `
    .end-pages > * { width: calc(100% / 3.5); }
    .end-pages > :nth-child(3n) { scroll-snap-align: end; }
    .end-pages > :not(:nth-child(3n)) { scroll-snap-align: none; }
  `;
  const PAGE_1 = Math.round(6 * SLIDE - WIDTH);
  const renderPages = () =>
    renderDeck({
      slides: 9,
      viewportClassName: 'end-pages',
      clickToFocus: true
    });

  test('clicking a slide in the current page leaves the deck where it is', async () => {
    addStyle(END_PAGES);
    const { root, viewport, handle, onFocalChange } = renderPages();
    act(() => handle.current!.scrollTo(1));
    await expectSettledTo(() => root.dataset.index, '1');
    onFocalChange.mockClear();

    // Slide 3 is the first slide of page 1, which snaps on slide 5.
    await clickSlide(viewport, 3);
    await sleep(400);

    expect(Math.round(viewport.scrollLeft)).toBe(PAGE_1);
    expect(root.dataset.index).toBe('1');
    expect(onFocalChange).not.toHaveBeenCalled();
  });

  test('clicking a slide in another page goes to that page', async () => {
    addStyle(END_PAGES);
    const { root, viewport } = renderPages();

    // At scroll 0, half of slide 3, in page 1, is in view.
    await clickSlide(viewport, 3);

    await expectSettledTo(() => root.dataset.index, '1');
    expect(Math.round(viewport.scrollLeft)).toBe(PAGE_1);
  });
});

// Three to a page, each page snapping on its middle slide at the centre, with
// four slides in view: pages rest at scroll 0 (slides 0 to 3 in view), then
// with slide 4 centred (slides 2.5 to 6.5) and slide 7 centred.
describe('click-to-focus with pages centred on their middle slide', () => {
  const MIDDLE_PAGES = `
    .middle-pages > * { width: calc(100% / 4); }
    .middle-pages > :nth-child(3n + 2) { scroll-snap-align: center; }
    .middle-pages > :not(:nth-child(3n + 2)) { scroll-snap-align: none; }
  `;
  const renderPages = () =>
    renderDeck({
      slides: 12,
      viewportClassName: 'middle-pages',
      clickToFocus: true
    });

  test('clicking the first slide of the next page goes to that page', async () => {
    addStyle(MIDDLE_PAGES);
    const { root, viewport, focal } = renderPages();

    await clickSlide(viewport, 3);

    await expectSettledTo(() => root.dataset.index, '1');
    expect(focal()).toEqual([4]);

    await clickSlide(viewport, 6);

    await expectSettledTo(() => root.dataset.index, '2');
    expect(focal()).toEqual([7]);
  });
});
