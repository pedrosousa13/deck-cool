import { act, createRef, Profiler, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectSettledTo,
  pagesOf,
  parkMouse,
  sleep,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

// Deck.useDeck: the deck's state and moves, read from Root, so a consumer can
// build Prev, Next, a counter or pagination from their own components.

/** Writes what useDeck reports where a test can read it. */
function Probe() {
  const {
    index,
    count,
    slide,
    focal,
    slideCount,
    loop,
    fits,
    canPrev,
    canNext
  } = Deck.useDeck();
  return (
    <span
      data-probe=""
      data-index={index}
      data-count={count ?? 'null'}
      data-slide={slide ?? 'null'}
      data-focal={focal ?? 'null'}
      data-slide-count={slideCount}
      data-loop={loop}
      data-fits={fits}
      data-can-prev={canPrev}
      data-can-next={canNext}
    />
  );
}

const probed = () => {
  const probe = document.querySelector<HTMLElement>('[data-probe]')!.dataset;
  return {
    index: Number(probe.index),
    count: probe.count === 'null' ? null : Number(probe.count),
    slide: probe.slide === 'null' ? null : Number(probe.slide),
    focal: probe.focal === 'null' ? null : Number(probe.focal),
    slideCount: Number(probe.slideCount),
    loop: probe.loop === 'true',
    fits: probe.fits === 'true',
    canPrev: probe.canPrev === 'true',
    canNext: probe.canNext === 'true'
  };
};

/** What the built-in controls show of the same state. */
const builtIns = () => {
  const prev = document.querySelector<HTMLButtonElement>(
    '[data-carouseldeck-prev]'
  );
  const next = document.querySelector<HTMLButtonElement>(
    '[data-carouseldeck-next]'
  );
  const counter = document.querySelector<HTMLElement>(
    '[data-carouseldeck-counter]'
  );
  return {
    fits: prev === null && next === null && counter === null,
    canPrev: prev !== null && !prev.disabled,
    canNext: next !== null && !next.disabled,
    index: counter && Number(counter.dataset.index),
    count: counter && Number(counter.dataset.count)
  };
};

const renderDeck = (props: Parameters<typeof TestDeck>[0] = {}) =>
  render(
    <TestDeck
      controls={
        <>
          <Deck.Counter />
          <Probe />
        </>
      }
      {...props}
    />
  );

describe('useDeck reports the state the built-in controls show', () => {
  test.each([
    [
      'at the start',
      { defaultIndex: 0 },
      {
        index: 0,
        count: 5,
        slide: 0,
        focal: 0,
        slideCount: 5,
        loop: false,
        canPrev: false,
        canNext: true
      }
    ],
    [
      'in the middle',
      { defaultIndex: 2 },
      {
        index: 2,
        count: 5,
        slide: 2,
        focal: 2,
        slideCount: 5,
        loop: false,
        canPrev: true,
        canNext: true
      }
    ],
    [
      'at the end',
      { defaultIndex: 4 },
      {
        index: 4,
        count: 5,
        slide: 4,
        focal: 4,
        slideCount: 5,
        loop: false,
        canPrev: true,
        canNext: false
      }
    ],
    [
      'at the start of a loop',
      { defaultIndex: 0, loop: true },
      {
        index: 0,
        count: 5,
        slide: 0,
        focal: 0,
        slideCount: 5,
        loop: true,
        canPrev: true,
        canNext: true
      }
    ],
    [
      'at the end of a loop',
      { defaultIndex: 4, loop: true },
      {
        index: 4,
        count: 5,
        slide: 4,
        focal: 4,
        slideCount: 5,
        loop: true,
        canPrev: true,
        canNext: true
      }
    ]
  ] as const)('%s', (_, props, expected) => {
    renderDeck(props);

    expect(probed()).toEqual({ ...expected, fits: false });
    const shown = builtIns();
    expect(shown).toEqual({
      fits: false,
      canPrev: expected.canPrev,
      canNext: expected.canNext,
      index: expected.index,
      count: expected.count
    });
  });

  test('with pages, it counts pages, as Dots and Counter do', async () => {
    addStyle(pagesOf(3));
    renderDeck({ slides: 10, viewportClassName: 'pages' });
    expect(probed()).toEqual({
      index: 0,
      count: 4,
      slide: 0,
      focal: 0,
      slideCount: 10,
      loop: false,
      fits: false,
      canPrev: false,
      canNext: true
    });

    for (let page = 1; page < 4; page++) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await expect.poll(() => probed().index).toBe(page);
      const { index, count, slide, focal, slideCount, canPrev, canNext } =
        probed();
      expect({ index, count, canPrev, canNext }).toEqual({
        index: builtIns().index,
        count: builtIns().count,
        canPrev: builtIns().canPrev,
        canNext: builtIns().canNext
      });
      // Pages of three: the page Counter counts is not the slide useDeck
      // reports as current and focal.
      expect({ slide, focal, slideCount }).toEqual({
        slide: page * 3,
        focal: page * 3,
        slideCount: 10
      });
    }
    expect(probed().canNext).toBe(false);
  });

  test('when every slide fits, there is nowhere to go', () => {
    addStyle(`.fits > * { width: 25%; }`);
    renderDeck({ slides: 4, viewportClassName: 'fits' });

    expect(probed()).toEqual({
      index: 0,
      count: 1,
      slide: 0,
      focal: 0,
      slideCount: 4,
      loop: false,
      fits: true,
      canPrev: false,
      canNext: false
    });
    expect(builtIns().fits).toBe(true);
  });

  test('a looping deck whose slides all fit does not loop on', () => {
    addStyle(`.fits > * { width: 25%; }`);
    renderDeck({ slides: 4, viewportClassName: 'fits', loop: true });

    expect(probed()).toMatchObject({
      fits: true,
      canPrev: false,
      canNext: false
    });
    expect(builtIns().fits).toBe(true);
  });

  test('follows the deck as it settles somewhere new', async () => {
    renderDeck({ slides: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expect.poll(() => probed().index).toBe(1);
    expect(probed()).toMatchObject({ canPrev: true, canNext: true });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expect.poll(() => probed().index).toBe(2);
    expect(probed()).toMatchObject({ canPrev: true, canNext: false });
    expect(builtIns()).toMatchObject({ canPrev: true, canNext: false });
  });
});

/** A design system's button: its own props, not a `<button>`'s. */
function FancyButton({
  isDisabled,
  onPress,
  children
}: {
  isDisabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="fancy"
      aria-disabled={isDisabled}
      onClick={() => {
        if (!isDisabled) onPress();
      }}
    >
      {children}
    </button>
  );
}

function CustomControls() {
  const { index, count, canPrev, canNext, prev, next, scrollTo } =
    Deck.useDeck();
  return (
    <>
      <FancyButton isDisabled={!canPrev} onPress={prev}>
        Back
      </FancyButton>
      <FancyButton isDisabled={!canNext} onPress={next}>
        Forward
      </FancyButton>
      <FancyButton isDisabled={false} onPress={() => scrollTo(0)}>
        First
      </FancyButton>
      <output>{count === null ? '' : `Photo ${index + 1} of ${count}`}</output>
    </>
  );
}

describe('a custom control built on useDeck', () => {
  test('moves the deck, and disables at the ends as Deck.Next does', async () => {
    render(<TestDeck slides={3} controls={<CustomControls />} />);
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    const forward = screen.getByRole('button', { name: 'Forward' });
    const back = screen.getByRole('button', { name: 'Back' });
    const builtInNext = screen.getByRole('button', { name: 'Next' });
    const status = screen.getByRole('status');
    expect(back.getAttribute('aria-disabled')).toBe('true');
    expect(status.textContent).toBe('Photo 1 of 3');

    await userEvent.click(forward);
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    expect(status.textContent).toBe('Photo 2 of 3');
    expect(back.getAttribute('aria-disabled')).toBe('false');

    await userEvent.click(forward);
    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    expect(forward.getAttribute('aria-disabled')).toBe('true');
    expect(builtInNext.hasAttribute('disabled')).toBe(true);

    await userEvent.click(back);
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    expect(forward.getAttribute('aria-disabled')).toBe('false');
    expect(builtInNext.hasAttribute('disabled')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'First' }));
    await expectSettledTo(() => viewport.scrollLeft, 0);
    expect(status.textContent).toBe('Photo 1 of 3');
  });

  test('stops autoplay, as a built-in control does', async () => {
    await parkMouse();
    render(
      <TestDeck
        autoplay={300}
        controls={
          <>
            <Deck.AutoplayToggle />
            <CustomControls />
          </>
        }
      />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    await expect.poll(() => root.dataset.index, { timeout: 2000 }).toBe('1');

    // Activated without focus, as Safari clicks a button.
    const forward = screen.getByRole('button', { name: 'Forward' });
    forward.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    forward.click();

    expect(document.activeElement).not.toBe(forward);
    await expect.poll(() => root.dataset.index, { timeout: 2000 }).toBe('2');
    expect(
      screen.getByRole('button', { name: 'Start slide rotation' })
    ).toBeTruthy();
    await sleep(900);
    expect(root.dataset.index).toBe('2');
  });
});

test("useDeck's consumer re-renders when the deck settles, never while it scrolls", async () => {
  let renders = 0;
  render(
    <TestDeck
      controls={
        <Profiler id="probe" onRender={() => renders++}>
          <Probe />
        </Profiler>
      }
    />
  );
  const viewport = viewportOf(
    screen.getByRole('region', { name: 'Test deck' })
  );
  await sleep(100);
  let scrolls = 0;
  viewport.addEventListener('scroll', () => scrolls++);
  renders = 0;

  // A scroll that comes back to where it started: nothing to report.
  await userEvent.wheel(viewport, { delta: { x: 20 } });
  await expectSettledTo(() => viewport.scrollLeft, 0);
  expect(scrolls).toBeGreaterThan(1);
  expect(renders).toBe(0);

  // A smooth scroll to the next snap point: one settle.
  scrolls = 0;
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await expectSettledTo(() => viewport.scrollLeft, WIDTH);
  expect(scrolls).toBeGreaterThan(5);
  expect(renders).toBe(1);
  expect(probed().index).toBe(1);
});

test("useDeck's consumer renders once for a move across several snap points, at its settle", async () => {
  let renders = 0;
  const handle = createRef<Deck.RootHandle>();
  render(
    <TestDeck
      handleRef={handle}
      controls={
        <Profiler id="probe" onRender={() => renders++}>
          <Probe />
        </Profiler>
      }
    />
  );
  const viewport = viewportOf(
    screen.getByRole('region', { name: 'Test deck' })
  );
  await sleep(100);
  // Each scroll event's position, with the renders so far.
  const frames: { at: number; renders: number }[] = [];
  viewport.addEventListener('scroll', () =>
    frames.push({ at: viewport.scrollLeft, renders })
  );
  renders = 0;

  handle.current!.scrollTo(4);

  await expectSettledTo(() => viewport.scrollLeft, 4 * WIDTH);
  const passing = frames.filter(({ at }) => at > WIDTH && at < 3 * WIDTH);
  expect(passing.length).toBeGreaterThan(1);
  const midFlight = frames.filter(({ at }) => at < 4 * WIDTH);
  expect(new Set(midFlight.map(({ renders }) => renders))).toEqual(
    new Set([0])
  );
  expect(renders).toBe(1);
  expect(probed().index).toBe(4);
});

test('before the viewport is measured, useDeck clamps index as Counter does', () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <TestDeck
      defaultIndex={10}
      controls={
        <>
          <Deck.Counter />
          <Probe />
        </>
      }
    />
  );

  const probe = container.querySelector<HTMLElement>('[data-probe]')!.dataset;
  expect(probe.index).toBe('4');
  expect(probe.count).toBe('null');
  expect(probe.slide).toBe('null');
  expect(probe.focal).toBe('null');
  expect(probe.slideCount).toBe('5');
  expect(
    container.querySelector('[data-carouseldeck-counter]')!.textContent
  ).toBe('5 / 5');
});

/** The slide `data-current` and `data-focal` mark, a loop's copy never one:
 * the ground truth `slide` and `focal` must agree with. */
const markers = (viewport: HTMLElement) => {
  const slides = [
    ...viewport.querySelectorAll(
      ':scope > [data-carouseldeck-slide]:not([data-carouseldeck-copy])'
    )
  ];
  return {
    current: slides.findIndex((slide) => slide.hasAttribute('data-current')),
    focal: slides.findIndex((slide) => slide.hasAttribute('data-focal'))
  };
};

test('with pages of three, slide and focal can differ, and never count a page, after Next, Dots, the keyboard and scrollTo', async () => {
  addStyle(`.pages > * { width: calc(100% / 3); } ${pagesOf(3)}`);
  const handle = createRef<Deck.RootHandle>();
  render(
    <TestDeck
      slides={10}
      viewportClassName="pages"
      handleRef={handle}
      controls={
        <>
          <Deck.Dots />
          <Probe />
        </>
      }
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  const dots = () =>
    within(root)
      .getByRole('group', { name: 'Choose page' })
      .querySelectorAll('button');

  const expectAgrees = () => {
    const truth = markers(viewport);
    expect(probed().slide).toBe(truth.current);
    expect(probed().focal).toBe(truth.focal);
    expect(probed().slideCount).toBe(10);
  };

  expectAgrees();
  expect(probed()).toMatchObject({ index: 0, slide: 0, focal: 0 });

  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await expectSettledTo(() => probed().index, 1);
  expectAgrees();
  expect(probed()).toMatchObject({ slide: 3, focal: 3 });

  await userEvent.click(dots()[2]);
  await expectSettledTo(() => probed().index, 2);
  expectAgrees();
  expect(probed()).toMatchObject({ slide: 6, focal: 6 });

  viewport.focus();
  await userEvent.keyboard('{ArrowRight}');
  await expectSettledTo(() => probed().index, 3);
  expectAgrees();
  // The last page holds slide 9 alone, past the end of the scroll range: it
  // rests where slide 7 is at the start, so the current slide and the focal
  // slide differ, and neither is the page Counter would show (3).
  expect(probed()).toMatchObject({ slide: 9, focal: 7 });

  act(() => handle.current!.scrollTo(0));
  await expectSettledTo(() => probed().index, 0);
  expectAgrees();
  expect(probed()).toMatchObject({ slide: 0, focal: 0 });
});

test('with loop, slide, focal and slideCount never count a loop copy', async () => {
  const onFocalChange = vi.fn();
  render(
    <TestDeck
      loop
      onFocalChange={onFocalChange}
      controls={
        <>
          <Deck.Counter />
          <Probe />
        </>
      }
    />
  );

  expect(probed()).toMatchObject({ slide: 0, focal: 0, slideCount: 5 });

  await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await expectSettledTo(() => probed().index, 4);
  expect(probed()).toMatchObject({ slide: 4, focal: 4, slideCount: 5 });

  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await expectSettledTo(() => probed().index, 0);
  expect(probed()).toMatchObject({ slide: 0, focal: 0, slideCount: 5 });
});

describe('focal when no slide snaps', () => {
  // Restores Vitest's default browser viewport, as the breakpoint tests
  // elsewhere do.
  afterEach(() => page.viewport(414, 896));

  test('is -1, matching onFocalChange', async () => {
    addStyle(
      '@media (min-width: 600px) { .no-snap > * { scroll-snap-align: none; } }'
    );
    await page.viewport(400, 600);
    const onFocalChange = vi.fn();
    render(
      <TestDeck
        viewportClassName="no-snap"
        onFocalChange={onFocalChange}
        controls={<Probe />}
      />
    );
    await expect.poll(() => probed().focal).toBe(0);

    await page.viewport(800, 600);

    await expect.poll(() => probed().focal).toBe(-1);
    expect(onFocalChange.mock.calls).toEqual([[-1]]);
  });
});

test('useDeck outside a deck names the missing primitive', () => {
  // React logs the error it rethrows; keep the run's output readable.
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => render(<Probe />)).toThrow(
      'Deck.useDeck must be inside Deck.Root'
    );
  } finally {
    spy.mockRestore();
  }
});
