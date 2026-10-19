import { createRef, Profiler, useState } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  gestureScroll,
  parkMouse,
  setReducedMotion,
  sleep,
  TestDeck,
  touchSwipe,
  viewportOf,
  WIDTH
} from './fixtures';

/** The autoplay interval most tests use, in milliseconds: short enough to
 * step several times within a poll's timeout. */
const INTERVAL = 300;

/** Reads `useDeck()` and renders nothing: wrapped in a `Profiler`, counts
 * how many times Root re-renders it. */
function RenderProbe() {
  Deck.useDeck();
  return null;
}

beforeEach(parkMouse);

const renderDeck = (props: Parameters<typeof TestDeck>[0] = {}) => {
  render(
    <TestDeck
      autoplay={INTERVAL}
      controls={<Deck.AutoplayToggle />}
      {...props}
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { root, viewport: viewportOf(root) };
};

const indexOf = (root: HTMLElement) => () => root.dataset.index;
const toggleOf = () =>
  document.querySelector<HTMLButtonElement>(
    '[data-carouseldeck-autoplay-toggle]'
  )!;
const liveRegionOf = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[aria-live]')!;

/** Activates the toggle from the keyboard, so no pointer hovers the deck. */
const pressToggle = async () => {
  toggleOf().focus();
  await userEvent.keyboard('{Enter}');
};

/** Waits several intervals and checks the deck did not move. */
const expectStill = async (root: HTMLElement, index: string) => {
  await sleep(INTERVAL * 3);
  expect(root.dataset.index).toBe(index);
};

/**
 * Records each new value of the deck's `data-index` from now on, in order,
 * and calls `onIndex` with it as it changes: a settle at the index the deck
 * already has records nothing. Autoplay holds each index for only an
 * interval and a step: on a busy machine a poll of the index can miss one,
 * and a test that acts after a poll can act after the next step has begun.
 */
const watchIndexes = (root: HTMLElement, onIndex?: (index: string) => void) => {
  const indexes: string[] = [];
  const observer = new MutationObserver(() => {
    indexes.push(root.dataset.index!);
    onIndex?.(root.dataset.index!);
  });
  observer.observe(root, { attributeFilter: ['data-index'] });
  onTestFinished(() => observer.disconnect());
  return indexes;
};

/**
 * Renders the deck with the pointer over it, playing: stopped at once, so no
 * step can come before the pointer does, however long the hover takes, then
 * started from the keyboard.
 */
const renderHovered = async (props: Parameters<typeof TestDeck>[0] = {}) => {
  const deck = renderDeck(props);
  toggleOf().click();
  await userEvent.hover(deck.viewport);
  await pressToggle();
  return deck;
};

describe('autoplay', () => {
  test('advances one snap point each interval', async () => {
    const { root } = renderDeck();
    const indexes = watchIndexes(root);

    await sleep(INTERVAL / 2);
    expect(root.dataset.index).toBe('0');
    await expect
      .poll(() => indexes.slice(0, 2), { timeout: 4000 })
      .toEqual(['1', '2']);
  });

  test('counts the interval from where the deck comes to rest', async () => {
    // A controlled index moves the deck without stopping autoplay, unlike a
    // handle call (#182): the first move here must not stop the second.
    function Controlled() {
      const [index, setIndex] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setIndex(1)}>
            Move on
          </button>
          <TestDeck
            autoplay={800}
            controls={<Deck.AutoplayToggle />}
            index={index}
            onIndexChange={setIndex}
          />
        </>
      );
    }
    render(<Controlled />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const move = screen.getByRole('button', { name: 'Move on' });
    const changedAt: number[] = [];
    const indexes = watchIndexes(root, () => changedAt.push(performance.now()));

    await sleep(400);
    move.click();
    await expect
      .poll(() => indexes.slice(0, 2), { timeout: 4000 })
      .toEqual(['1', '2']);
    // The tick due 800ms after mount waits for 800ms of rest, then a step.
    expect(changedAt[1] - changedAt[0]).toBeGreaterThanOrEqual(800);
  });

  test('stops at the last snap point, and Start rewinds and resumes', async () => {
    const { root } = renderDeck({ slides: 3 });

    await expect.poll(indexOf(root), { timeout: 3000 }).toBe('2');
    await expect
      .poll(() => toggleOf().textContent)
      .toBe('Start slide rotation');
    expect(toggleOf().hasAttribute('data-playing')).toBe(false);
    expect(liveRegionOf(root).getAttribute('aria-live')).toBe('polite');
    await expectStill(root, '2');

    const indexes = watchIndexes(root);
    await pressToggle();
    expect(toggleOf().textContent).toBe('Stop slide rotation');
    await expect
      .poll(() => indexes.slice(0, 2), { timeout: 4000 })
      .toEqual(['0', '1']);
  });

  test('with loop, goes on from the last snap point to the first, quietly', async () => {
    const { root } = renderDeck({ slides: 3, defaultIndex: 1, loop: true });
    const indexes = watchIndexes(root);

    await expect
      .poll(() => indexes.slice(0, 3), { timeout: 6000 })
      .toEqual(['2', '0', '1']);
    expect(toggleOf().textContent).toBe('Stop slide rotation');
    expect(liveRegionOf(root).textContent).toBe('');
  });

  test('without autoplay, the deck stays put and there is no toggle', async () => {
    const { root } = renderDeck({ autoplay: undefined });

    expect(toggleOf()).toBeNull();
    await expectStill(root, '0');
  });

  test('a controlled parent that refuses the move keeps the deck', async () => {
    const onIndexChange = vi.fn();
    const { viewport } = renderDeck({
      autoplay: 1000,
      index: 0,
      onIndexChange
    });

    await expect
      .poll(() => onIndexChange.mock.calls[0], { timeout: 3000 })
      .toEqual([1]);
    await expect.poll(() => viewport.scrollLeft, { timeout: 2000 }).toBe(0);
  });

  test('a step a controlled parent refuses ends autoplay', async () => {
    const onIndexChange = vi.fn();
    const { root, viewport } = renderDeck({ index: 0, onIndexChange });

    await expect
      .poll(() => toggleOf().textContent, { timeout: 3000 })
      .toBe('Start slide rotation');
    expect(toggleOf().hasAttribute('data-playing')).toBe(false);
    await expectStill(root, '0');
    expect(viewport.scrollLeft).toBe(0);
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });

  test('a controlled parent that takes the move advances', async () => {
    function Controlled() {
      const [index, setIndex] = useState(0);
      return (
        <TestDeck autoplay={INTERVAL} index={index} onIndexChange={setIndex} />
      );
    }
    render(<Controlled />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const scrolledTo: number[] = [];
    const indexes = watchIndexes(root, () =>
      scrolledTo.push(viewportOf(root).scrollLeft)
    );

    await expect
      .poll(() => indexes.slice(0, 2), { timeout: 4000 })
      .toEqual(['1', '2']);
    expect(scrolledTo.slice(0, 2)).toEqual([WIDTH, 2 * WIDTH]);
  });
});

describe('pausing', () => {
  test('a pointer over the deck pauses it, and leaving resumes it', async () => {
    const { root, viewport } = await renderHovered();
    const indexes = watchIndexes(root);

    await expectStill(root, '0');
    expect(toggleOf().textContent).toBe('Stop slide rotation');

    await userEvent.unhover(viewport);
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
  });

  test('focus within the deck stops it until the toggle starts it', async () => {
    const { root } = renderDeck();

    screen.getByRole('button', { name: 'Button 1' }).focus();
    await expectStill(root, '0');
    expect(toggleOf().textContent).toBe('Start slide rotation');

    // Focus leaving does not resume it.
    (document.activeElement as HTMLElement).blur();
    await expectStill(root, '0');

    const indexes = watchIndexes(root);
    await pressToggle();
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
  });

  test('focus on the toggle itself does not stop it', async () => {
    const { root } = renderDeck();
    const indexes = watchIndexes(root);

    toggleOf().focus();

    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
    expect(toggleOf().textContent).toBe('Stop slide rotation');
  });

  test('a hidden document pauses it, and showing it resumes it', async () => {
    let state: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => state
    );
    onTestFinished(() => void vi.restoreAllMocks());
    const { root } = renderDeck();

    state = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await expectStill(root, '0');

    const indexes = watchIndexes(root);
    state = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
  });

  let visibility: DocumentVisibilityState = 'visible';

  // A pause comes before the render that clears the step's timer: a step
  // falling due between the two must not run. The cause comes in the task
  // that runs the step, just before it, so nothing renders in between.
  test.each([
    [
      'a pointer entering',
      (viewport: Element) =>
        viewport.dispatchEvent(
          new PointerEvent('pointerover', { bubbles: true })
        ),
      (viewport: Element) =>
        viewport.dispatchEvent(
          new PointerEvent('pointerout', { bubbles: true })
        )
    ],
    [
      'the document hiding',
      () => {
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      },
      () => {
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      }
    ]
  ])('%s as a step falls due pauses it', async (_, pause, resume) => {
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility
    );
    const { setTimeout } = window;
    let armed = true;
    vi.spyOn(window, 'setTimeout').mockImplementation(((
      callback: () => void,
      ms?: number
    ) => {
      if (!armed || ms !== INTERVAL) return setTimeout(callback, ms);
      armed = false;
      return setTimeout(() => {
        pause(viewportOf(screen.getByRole('region')));
        callback();
      }, ms);
    }) as typeof window.setTimeout);
    onTestFinished(() => void vi.restoreAllMocks());
    const { root, viewport } = renderDeck();

    await expectStill(root, '0');
    expect(armed).toBe(false);

    const indexes = watchIndexes(root);
    resume(viewport);
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
  });

  test('reduced motion starts it stopped, and the toggle still starts it', async () => {
    await setReducedMotion(true);
    onTestFinished(() => setReducedMotion(false));
    const { root } = renderDeck();

    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, '0');

    const indexes = watchIndexes(root);
    await pressToggle();
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
  });
});

describe('a move the user makes', () => {
  test('a touch swipe stops it, and its settle is announced', async () => {
    const { root, viewport } = renderDeck({ autoplay: 1500 });
    const live = liveRegionOf(root);

    await touchSwipe(viewport, 150);

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');
    await expect.poll(() => live.textContent).toBe('Slide 2 of 5');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, '1');
  });

  test('a wheel scroll stops it, and its settle is announced', async () => {
    const { root, viewport } = renderDeck({ autoplay: 1500 });
    const live = liveRegionOf(root);

    await gestureScroll(viewport, WIDTH);

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');
    await parkMouse();
    await expect.poll(() => live.textContent).toBe('Slide 2 of 5');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, '1');
  });

  // A busy main thread as the gesture begins, as on a loaded CI runner,
  // holds back the deck's first frame. A wheel the compositor gets before
  // that frame finds no deck to scroll: it scrolls nothing, though the deck
  // hears it and stops (#90). `gestureScroll` waits for the deck's frame.
  // After the wheel scroll above: Chromium starts a page's first gesture
  // late, after the busy spell.
  test('a wheel scroll as the deck first renders still moves it', async () => {
    const { root, viewport } = renderDeck({ autoplay: 1500 });

    const gesture = gestureScroll(viewport, WIDTH);
    const busyUntil = performance.now() + 300;
    while (performance.now() < busyUntil);
    await gesture;

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');
    expect(toggleOf().textContent).toBe('Start slide rotation');
  });

  test('focus entering a slide mid-step stops it, and its settle is announced', async () => {
    const { root, viewport } = renderDeck();
    const live = liveRegionOf(root);
    await new Promise((resolve) =>
      viewport.addEventListener('scroll', resolve, { once: true })
    );

    // Focus wins (#43): the deck goes to the focused slide instead.
    screen.getByRole('button', { name: 'Button 4' }).focus();

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('3');
    await expect.poll(() => live.textContent).toBe('Slide 4 of 5');
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, '3');
  });

  test('focus on the viewport mid-step stops it, and the step is not announced', async () => {
    const { root, viewport } = renderDeck();
    const live = liveRegionOf(root);
    await new Promise((resolve) =>
      viewport.addEventListener('scroll', resolve, { once: true })
    );

    // Late in the step, so it ends on the next snap point. Focus outside
    // every slide is not the user's move.
    await sleep(150);
    viewport.focus();

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await sleep(INTERVAL);
    expect(live.textContent).toBe('');
  });

  test.each([
    ['next', (handle: Deck.RootHandle) => handle.next(), '2'],
    ['prev', (handle: Deck.RootHandle) => handle.prev(), '0'],
    ['scrollTo', (handle: Deck.RootHandle) => handle.scrollTo(3), '3']
  ])(
    "a handle's %s stops it, as useDeck()'s moves do",
    async (_, call, index) => {
      const handle = createRef<Deck.RootHandle>();
      const { root } = renderDeck({ defaultIndex: 1, handleRef: handle });
      expect(toggleOf().textContent).toBe('Stop slide rotation');

      call(handle.current!);

      await expect.poll(indexOf(root), { timeout: 2000 }).toBe(index);
      await expect
        .poll(() => toggleOf().textContent)
        .toBe('Start slide rotation');
      await expectStill(root, index);
    }
  );

  test('a handle call back to where autoplay stepped from still stops it', async () => {
    const handle = createRef<Deck.RootHandle>();
    const { root } = renderDeck({ handleRef: handle });

    // Back as autoplay rests at 2, before its next step can begin.
    const indexes = watchIndexes(root, (index) => {
      if (index === '2' && indexes.length === 2) handle.current!.scrollTo(1);
    });

    await expect
      .poll(() => indexes.slice(0, 3), { timeout: 6000 })
      .toEqual(['1', '2', '1']);
    await expect
      .poll(() => toggleOf().textContent)
      .toBe('Start slide rotation');
    await expectStill(root, '1');
  });
});

describe('a move autoplay did not start', () => {
  test('a new controlled index back to where autoplay stepped from keeps it rotating', async () => {
    function Controlled() {
      const [index, setIndex] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setIndex(1)}>
            Back to 2
          </button>
          <TestDeck
            autoplay={INTERVAL}
            index={index}
            onIndexChange={setIndex}
            controls={<Deck.AutoplayToggle />}
          />
        </>
      );
    }
    render(<Controlled />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const back = screen.getByRole('button', { name: 'Back to 2' });

    // Back as autoplay rests at 2, before its next step can begin.
    const indexes = watchIndexes(root, (index) => {
      if (index === '2' && indexes.length === 2) back.click();
    });

    await expect
      .poll(() => indexes.slice(0, 4), { timeout: 6000 })
      .toEqual(['1', '2', '1', '2']);
    expect(toggleOf().textContent).toBe('Stop slide rotation');
  });
});

describe('a control the user activates', () => {
  // Safari does not focus a button on click, so focus entering the deck
  // cannot be what stops it: each control is activated without focus.
  test.each([
    ['Previous', '0'],
    ['Next', '2'],
    ['Go to page 3', '2']
  ])('%s stops it, though the pointer then leaves', async (name, index) => {
    const { root } = await renderHovered({
      defaultIndex: 1,
      controls: (
        <>
          <Deck.AutoplayToggle />
          <Deck.Dots />
        </>
      )
    });
    const control = screen.getByRole('button', { name });

    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    control.click();

    expect(document.activeElement).not.toBe(control);
    await expect.poll(indexOf(root), { timeout: 2000 }).toBe(index);
    await parkMouse();
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, index);
  });
});

describe('autoplayResume', () => {
  const RESUME = 300;

  test('a move stops it, and it plays again once it settles and the pointer leaves', async () => {
    const { root } = await renderHovered({
      autoplayResume: RESUME,
      defaultIndex: 1
    });
    const next = screen.getByRole('button', { name: 'Next' });

    next.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    next.click();

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('2');
    expect(toggleOf().textContent).toBe('Start slide rotation');
    // The pointer is still over the deck: it stays stopped past the delay.
    await sleep(RESUME * 2);
    expect(toggleOf().textContent).toBe('Start slide rotation');

    await parkMouse();
    await expect
      .poll(() => toggleOf().textContent, { timeout: RESUME * 4 })
      .toBe('Stop slide rotation');
  });

  test('focus entering then leaving restarts it after the delay', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });
    const button = screen.getByRole('button', { name: 'Button 1' });

    button.focus();
    await expectStill(root, '0');
    expect(toggleOf().textContent).toBe('Start slide rotation');

    (document.activeElement as HTMLElement).blur();
    await expect
      .poll(() => toggleOf().textContent, { timeout: RESUME * 4 })
      .toBe('Stop slide rotation');
  });

  test('focus returning within the delay cancels the restart', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });
    const button = screen.getByRole('button', { name: 'Button 1' });

    button.focus();
    (document.activeElement as HTMLElement).blur();
    await sleep(RESUME / 2);
    button.focus();

    await sleep(RESUME);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    await expectStill(root, '0');

    (document.activeElement as HTMLElement).blur();
    await expect
      .poll(() => toggleOf().textContent, { timeout: RESUME * 4 })
      .toBe('Stop slide rotation');
  });

  test('after the toggle stops it, it stays stopped past the delay', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });

    await pressToggle();
    expect(toggleOf().textContent).toBe('Start slide rotation');

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('never plays under reduced motion, however long the delay', async () => {
    await setReducedMotion(true);
    onTestFinished(() => setReducedMotion(false));
    const { root } = renderDeck({ autoplayResume: RESUME });

    expect(toggleOf().textContent).toBe('Start slide rotation');
    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('autoplay running out is not resumable: a later focus in and out leaves it stopped', async () => {
    const { root } = renderDeck({ slides: 3, autoplayResume: RESUME });

    await expect.poll(indexOf(root), { timeout: 3000 }).toBe('2');
    await expect
      .poll(() => toggleOf().textContent)
      .toBe('Start slide rotation');

    // Button 3 is already in view, at the last snap point: focusing it moves
    // nothing, so this isolates the delay from a move's own settle. The
    // wait lets React commit the focus before the blur, as two React
    // updates with no render between them would otherwise net to none.
    screen.getByRole('button', { name: 'Button 3' }).focus();
    await sleep(50);
    (document.activeElement as HTMLElement).blur();

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('2');
  });

  test('does nothing without autoplay', async () => {
    const { root } = renderDeck({
      autoplay: undefined,
      autoplayResume: RESUME
    });

    expect(toggleOf()).toBeNull();
    await expectStill(root, '0');
  });

  test.each([
    ['Next', () => screen.getByRole('button', { name: 'Next' }).click()],
    [
      'a handle move',
      (handle: Deck.RootHandle) => {
        handle.next();
      }
    ]
  ])(
    'an explicit stop by the toggle is sticky: %s and the pointer leaving does not resume it',
    async (_, move) => {
      const handle = createRef<Deck.RootHandle>();
      const { root, viewport } = renderDeck({
        autoplayResume: RESUME,
        defaultIndex: 1,
        handleRef: handle
      });
      await userEvent.hover(viewport);
      await pressToggle();

      move(handle.current!);
      await expect.poll(indexOf(root), { timeout: 2000 }).toBe('2');

      await userEvent.unhover(viewport);
      await sleep(RESUME * 4);
      expect(toggleOf().textContent).toBe('Start slide rotation');
      expect(root.dataset.index).toBe('2');
    }
  );

  test('an explicit stop by the toggle is sticky: focus into the deck and out does not resume it', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });

    await pressToggle();
    screen.getByRole('button', { name: 'Button 1' }).focus();
    // Lets React commit the focus before the blur, as two updates with no
    // render between them would otherwise net to none.
    await sleep(50);
    (document.activeElement as HTMLElement).blur();

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('never resumes under reduced motion, even once focus enters and leaves the deck', async () => {
    await setReducedMotion(true);
    onTestFinished(() => setReducedMotion(false));
    const { root } = renderDeck({ autoplayResume: RESUME });

    screen.getByRole('button', { name: 'Button 1' }).focus();
    // Lets React commit the focus before the blur, as two updates with no
    // render between them would otherwise net to none.
    await sleep(50);
    (document.activeElement as HTMLElement).blur();

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('a move midway through the wait restarts it, counted from when the move settles', async () => {
    const handle = createRef<Deck.RootHandle>();
    const { root } = renderDeck({ autoplayResume: RESUME, handleRef: handle });

    screen.getByRole('button', { name: 'Button 1' }).focus();
    await sleep(50);
    (document.activeElement as HTMLElement).blur();
    await sleep(RESUME / 2);

    handle.current!.next();
    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');

    // The blur's own wait would have ended by now: the move midway through
    // it pushed the wait out instead, counted from this move's own settle.
    await sleep(RESUME / 2 + 100);
    expect(toggleOf().textContent).toBe('Start slide rotation');

    await expect
      .poll(() => toggleOf().textContent, { timeout: RESUME * 4 })
      .toBe('Stop slide rotation');
  });

  test('turning reduced motion on then off mid-wait leaves it stopped', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });
    const button = screen.getByRole('button', { name: 'Button 1' });

    button.focus();
    await sleep(50);
    (document.activeElement as HTMLElement).blur();
    await sleep(RESUME / 2);

    await setReducedMotion(true);
    onTestFinished(() => setReducedMotion(false));
    await setReducedMotion(false);

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('a window blur, with nothing newly focused, does not start the wait', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });

    screen.getByRole('button', { name: 'Button 1' }).focus();
    await expectStill(root, '0');

    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    onTestFinished(() => hasFocus.mockRestore());
    (document.activeElement as HTMLElement).blur();

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });

  test('moving focus within the deck is not leaving it: the wait never starts', async () => {
    const { root } = renderDeck({ autoplayResume: RESUME });

    screen.getByRole('button', { name: 'Button 1' }).focus();
    await expectStill(root, '0');
    expect(toggleOf().textContent).toBe('Start slide rotation');

    // The Tab destination: a control outside the viewport, but still inside
    // the region, so this moves no slide into view.
    screen.getByRole('button', { name: 'Next' }).focus();

    await sleep(RESUME * 4);
    expect(toggleOf().textContent).toBe('Start slide rotation');
    expect(root.dataset.index).toBe('0');
  });
});

describe('autoplay without autoplayResume', () => {
  test('tracks no focus state, so focus entering and leaving it does not re-render it', async () => {
    let renders = 0;
    render(
      <TestDeck
        autoplay={INTERVAL}
        controls={
          <>
            <Deck.AutoplayToggle />
            <Profiler id="probe" onRender={() => renders++}>
              <RenderProbe />
            </Profiler>
          </>
        }
      />
    );
    await pressToggle();
    renders = 0;

    screen.getByRole('button', { name: 'Button 1' }).focus();
    await sleep(50);
    expect(renders).toBe(0);

    (document.activeElement as HTMLElement).blur();
    await sleep(50);
    expect(renders).toBe(0);
  });
});

describe('Deck.AutoplayToggle', () => {
  test('is a button named for the action it takes, marked while playing', async () => {
    const { root } = renderDeck();
    const toggle = screen.getByRole('button', { name: 'Stop slide rotation' });
    expect(toggle.hasAttribute('data-playing')).toBe(true);
    expect(toggle.hasAttribute('aria-pressed')).toBe(false);

    await pressToggle();

    expect(screen.getByRole('button', { name: 'Start slide rotation' })).toBe(
      toggle
    );
    expect(toggle.hasAttribute('data-playing')).toBe(false);
    await expectStill(root, '0');
  });

  test("a consumer's onClick runs first and can cancel the toggle", async () => {
    render(
      <TestDeck
        autoplay={INTERVAL}
        controls={
          <Deck.AutoplayToggle onClick={(event) => event.preventDefault()} />
        }
      />
    );

    await pressToggle();

    expect(toggleOf().textContent).toBe('Stop slide rotation');
  });
});

describe('the live region', () => {
  test('announces a change the user makes, politely', async () => {
    const { root } = renderDeck({ autoplay: undefined });
    const live = liveRegionOf(root);
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expect.poll(() => live.textContent).toBe('Slide 2 of 5');
  });

  test('is off while autoplay rotates, and polite once it stops', async () => {
    const { root } = renderDeck();
    const live = liveRegionOf(root);
    expect(live.getAttribute('aria-live')).toBe('off');
    const indexes = watchIndexes(root);

    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
    expect(live.getAttribute('aria-live')).toBe('off');

    await pressToggle();
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  test('does not announce a step autoplay started, though stopped mid-step', async () => {
    const { root, viewport } = renderDeck();
    const live = liveRegionOf(root);
    const indexes = watchIndexes(root);

    // Stopped as the step's scroll begins, however busy the machine.
    await new Promise((resolve) =>
      viewport.addEventListener('scroll', () => resolve(toggleOf().click()), {
        once: true
      })
    );

    expect(live.getAttribute('aria-live')).toBe('polite');
    await expect.poll(() => indexes[0], { timeout: 2000 }).toBe('1');
    await sleep(INTERVAL);
    expect(live.textContent).toBe('');
  });

  test('announces a user move to the slide last announced, after autoplay moved on', async () => {
    const { root } = renderDeck();
    const live = liveRegionOf(root);
    const texts: string[] = [];
    const observer = new MutationObserver(() => texts.push(live.textContent!));
    observer.observe(live, {
      childList: true,
      characterData: true,
      subtree: true
    });
    onTestFinished(() => observer.disconnect());
    const press = async (name: string) => {
      screen.getByRole('button', { name }).focus();
      await userEvent.keyboard('{Enter}');
    };

    await press('Next');
    await expect.poll(() => live.textContent).toBe('Slide 2 of 5');
    // Focus stops it as it rests at 2, before its next step can begin.
    const previous = screen.getByRole('button', { name: 'Previous' });
    watchIndexes(root, (index) => {
      if (index === '2') previous.focus();
    });
    await pressToggle();
    await expect.poll(() => document.activeElement).toBe(previous);
    await userEvent.keyboard('{Enter}');

    await expect.poll(indexOf(root), { timeout: 2000 }).toBe('1');
    await expect
      .poll(() => texts.filter((t) => t === 'Slide 2 of 5').length)
      .toBe(2);
    expect(texts).not.toContain('Slide 3 of 5');
  });

  test('is polite while a pointer pauses autoplay', async () => {
    const { root, viewport } = renderDeck();

    await userEvent.hover(viewport);

    expect(liveRegionOf(root).getAttribute('aria-live')).toBe('polite');
  });
});
