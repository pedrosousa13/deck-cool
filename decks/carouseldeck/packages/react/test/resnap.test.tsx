import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectRestOnASlide,
  expectSettledTo,
  gestureScroll,
  mouseAt,
  mouseDrag,
  parkMouse,
  sleep,
  TestDeck,
  touchSwipe,
  viewportOf,
  wheelOver,
  WIDTH,
  withoutScrollEnd
} from './fixtures';

// A deck with mandatory snapping that comes to rest off every snap point
// moves to the nearest, as the browser would have snapped it, or, where the
// user's scroll took a move over, the nearest the way it went (ADR-0006).
// Measured in Chromium, a deck can come to rest there: a long task just
// after the user's wheel, or page script that scrolls the viewport during a
// move, leaves it where the move's scroll stopped, and the browser never
// snaps it back.

beforeEach(parkMouse);

const renderDeck = (props: Parameters<typeof TestDeck>[0] = {}) => {
  const onIndexChange = vi.fn();
  render(<TestDeck onIndexChange={onIndexChange} {...props} />);
  const root = screen.getByRole('region', { name: 'Test deck' });
  return {
    root,
    viewport: viewportOf(root),
    next: screen.getByRole('button', { name: 'Next' }),
    onIndexChange
  };
};

/**
 * Stops the deck's scroll once it passes `at`, as page script that scrolls
 * the viewport does: an instant scroll by nothing ends the smooth scroll in
 * flight, and Chromium leaves the viewport where it was, off any snap point.
 * Resolves to where the viewport stopped.
 */
const stopPast = (viewport: HTMLElement, at: number) =>
  new Promise<number>((resolve) => {
    const stop = () => {
      if (viewport.scrollLeft < at) return;
      viewport.removeEventListener('scroll', stop);
      viewport.scrollBy({ left: 0, top: 0, behavior: 'instant' });
      resolve(viewport.scrollLeft);
    };
    viewport.addEventListener('scroll', stop);
  });

describe('a deck at rest off every snap point', () => {
  test('moves on to the nearest, and reports it', async () => {
    const { root, viewport, next, onIndexChange } = renderDeck();

    next.click();
    const stopped = await stopPast(viewport, 200);

    expect(stopped % WIDTH).not.toBe(0);
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(viewport.scrollLeft).toBe(WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test('stopped just after it starts, goes on the way the move went', async () => {
    // Measured in WebKit under load: quiet can end a move whose scroll goes
    // on, with no scroll event for two quiets. A re-snap back would stop
    // that scroll, so one from a move cut short goes the move's way.
    const { root, viewport, next, onIndexChange } = renderDeck();

    next.click();
    const stopped = await stopPast(viewport, 1);

    expect(stopped).toBeLessThan(WIDTH / 2);
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(viewport.scrollLeft).toBe(WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test("after the user's wheel took the move over, moves to the nearest the way the wheel went", async () => {
    // Measured in Chromium, a long task just after the wheel can let the
    // move's scroll go on, and stop part way back toward the move's target,
    // with an end event there. Here the page keeps the wheel from
    // scrolling, so the move's scroll goes on; page script stops it past
    // halfway to the next slide, and the end event the browser sent there
    // is sent here, as an instant scroll by nothing sends none.
    const { root, viewport, next, onIndexChange } = renderDeck();
    root.addEventListener('wheel', (event) => event.preventDefault(), {
      passive: false
    });

    next.click();
    await new Promise<void>((resolve) => {
      const turn = () => {
        if (viewport.scrollLeft < 50) return;
        viewport.removeEventListener('scroll', turn);
        void wheelOver(viewport, -200).then(() => resolve());
      };
      viewport.addEventListener('scroll', turn);
    });
    const stopped = await stopPast(viewport, 200);
    viewport.dispatchEvent(new Event('scrollend'));

    expect(stopped).toBeGreaterThan(WIDTH / 2);
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(viewport.scrollLeft).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test("leaves the browser's snap after a wheel to the browser, though an end event comes before it is done", async () => {
    // Measured in Chromium: a wheel back as a move arrives ends, with
    // `scrollend`, off any snap point, and the browser's snap from there
    // comes after it.
    const { root, viewport, next, onIndexChange } = renderDeck();
    const scrolls: ScrollToOptions[] = [];
    const scrollTo = viewport.scrollTo.bind(viewport);

    next.click();
    await new Promise<void>((resolve) => {
      const turn = () => {
        if (viewport.scrollLeft < 250) return;
        viewport.removeEventListener('scroll', turn);
        viewport.scrollTo = ((options: ScrollToOptions) => {
          scrolls.push(options);
          scrollTo(options);
        }) as typeof viewport.scrollTo;
        void wheelOver(viewport, -200).then(() => resolve());
      };
      viewport.addEventListener('scroll', turn);
    });

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(scrolls).toEqual([]);
  });

  test('a wheel the other way while a re-snap waits sets the way it goes', async () => {
    // The move ends short, and quiet ends it: its re-snap would go the
    // move's way, on to the next slide. A wheel back during the wait for
    // quiet turns it. The engine's settle is due 200ms after the scroll
    // stops, and its wait 100ms after that, so a wheel 250ms after the
    // stop comes during the wait. Synthetic, as a wheel the page prevents,
    // so it scrolls nothing; the end event sent after it is its end.
    const { root, viewport, next, onIndexChange } = renderDeck();

    next.click();
    const stopped = await stopPast(viewport, 200);
    await sleep(250);
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: -200 }));
    viewport.dispatchEvent(new Event('scrollend'));

    expect(stopped).toBeGreaterThan(WIDTH / 2);
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(viewport.scrollLeft).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('looping, on a shell, moves on to the nearest and jumps to its slide', async () => {
    const { root, viewport, next, onIndexChange } = renderDeck({
      loop: true,
      defaultIndex: 4
    });

    next.click();
    // Past the last slide's snap point, 4200, on the way to the first
    // slide's shell, 4500.
    await stopPast(viewport, 4350);

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(onIndexChange.mock.calls).toEqual([[0]]);
  });

  test('with proximity snapping, stays where it is', async () => {
    const onIndexChange = vi.fn();
    render(
      <Deck.Root aria-label="Test deck" onIndexChange={onIndexChange}>
        <Deck.Viewport style={{ width: WIDTH, scrollSnapType: 'x proximity' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );

    screen.getByRole('button', { name: 'Next' }).click();
    const stopped = await stopPast(viewport, 100);

    expect(stopped % WIDTH).not.toBe(0);
    await expectSettledTo(() => onIndexChange.mock.calls, [[1]]);
    expect(viewport.scrollLeft).toBe(stopped);
  });

  test('with scroll padding, rests on its snap point with no re-snap', async () => {
    // Scroll padding moves where the browser rests each slide: 20px short
    // here. The slides are narrower than the viewport: a slide wider than
    // the padded snapport may snap anywhere it covers it.
    addStyle(`
      .padded { scroll-padding-inline-start: 20px; }
      .padded > * { width: 200px; }
    `);
    const { viewport, next, onIndexChange } = renderDeck({
      viewportClassName: 'padded'
    });
    const scrolls: ScrollToOptions[] = [];
    const scrollTo = viewport.scrollTo.bind(viewport);
    viewport.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
      scrollTo(options);
    }) as typeof viewport.scrollTo;

    next.click();

    await expectSettledTo(() => onIndexChange.mock.calls, [[1]]);
    expect(viewport.scrollLeft).toBe(180);
    expect(scrolls).toEqual([{ left: 180, behavior: 'smooth' }]);
  });
});

describe('a deck at rest off every snap point, while the user has it', () => {
  test('waits for a pointer pressed on the viewport to let go', async () => {
    const { root, viewport, next, onIndexChange } = renderDeck();
    const box = viewport.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    await mouseAt('mousePressed', x, y, 1);
    let released = false;
    onTestFinished(async () => {
      if (!released) await mouseAt('mouseReleased', x, y, 0);
    });

    next.click();
    const stopped = await stopPast(viewport, 100);
    await sleep(600);

    expect(viewport.scrollLeft).toBe(stopped);
    released = true;
    await mouseAt('mouseReleased', x, y, 0);
    await expectRestOnASlide(viewport, root, onIndexChange);
  });

  test('leaves a wheel gesture to the browser while it goes on', async () => {
    const { root, viewport, next, onIndexChange } = renderDeck();
    const scrolls: ScrollToOptions[] = [];
    const scrollTo = viewport.scrollTo.bind(viewport);
    next.click();
    await new Promise<void>((resolve) => {
      const turn = () => {
        if (viewport.scrollLeft < 100) return;
        viewport.removeEventListener('scroll', turn);
        resolve();
      };
      viewport.addEventListener('scroll', turn);
    });
    viewport.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
      scrollTo(options);
    }) as typeof viewport.scrollTo;

    // The move's end must not come before the gesture's first wheel event,
    // or this is a wheel at rest.
    const first = new Promise<string>((resolve) => {
      const once = (event: Event) => {
        viewport.removeEventListener('wheel', once, true);
        viewport.removeEventListener('scrollend', once, true);
        resolve(event.type);
      };
      viewport.addEventListener('wheel', once, true);
      viewport.addEventListener('scrollend', once, true);
    });

    // Many wheel events, over most of a second, two slides on.
    await gestureScroll(viewport, 2 * WIDTH, { drawn: true });

    expect(await first).toBe('wheel');

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(scrolls).toEqual([]);
  });

  test('leaves a keyboard scroll to the browser while it goes on', async () => {
    const { root, viewport, onIndexChange } = renderDeck();
    const scrolls: ScrollToOptions[] = [];
    const scrollTo = viewport.scrollTo.bind(viewport);
    viewport.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
      scrollTo(options);
    }) as typeof viewport.scrollTo;
    viewport.focus();

    // Each press while the scroll before it is still going.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(viewport.scrollLeft).toBeGreaterThan(0);
    expect(scrolls).toEqual([]);
  });

  test('stays where a mouse drag holds it', async () => {
    const { root, viewport, onIndexChange } = renderDeck();

    const letGo = await mouseDrag(viewport, -120, {
      stepMs: 20,
      release: false
    });
    let released = false;
    onTestFinished(async () => {
      if (!released) await letGo();
    });
    await sleep(600);

    expect(viewport.scrollLeft).toBe(120);
    released = true;
    await letGo();
    await expectRestOnASlide(viewport, root, onIndexChange);
  });

  test('stays where a finger holds it', async () => {
    const { root, viewport, onIndexChange } = renderDeck();

    const lift = await touchSwipe(viewport, 120, { release: false });
    let lifted = false;
    onTestFinished(async () => {
      if (!lifted) await lift();
    });
    // Where the finger's last move has taken the deck.
    await sleep(200);
    const held = viewport.scrollLeft;
    await sleep(600);

    expect(held % WIDTH).not.toBe(0);
    expect(viewport.scrollLeft).toBe(held);
    lifted = true;
    await lift();
    await expectRestOnASlide(viewport, root, onIndexChange);
  });

  test('rests on a snap point after a wheel the page keeps from scrolling it', async () => {
    const { root, viewport, next, onIndexChange } = renderDeck();
    const prevent = (event: Event) => event.preventDefault();
    root.addEventListener('wheel', prevent, { passive: false });

    next.click();
    await new Promise<void>((resolve) => {
      const turn = () => {
        if (viewport.scrollLeft < 100) return;
        viewport.removeEventListener('scroll', turn);
        void wheelOver(viewport, -200).then(() => resolve());
      };
      viewport.addEventListener('scroll', turn);
    });

    await expectRestOnASlide(viewport, root, onIndexChange);
  });
});

describe('a deck held off every snap point, in an engine without scrollend', () => {
  withoutScrollEnd();

  test('stays where a finger holds it', async () => {
    const { root, viewport, onIndexChange } = renderDeck();

    const lift = await touchSwipe(viewport, 120, { release: false });
    let lifted = false;
    onTestFinished(async () => {
      if (!lifted) await lift();
    });
    // Where the finger's last move has taken the deck.
    await sleep(200);
    const held = viewport.scrollLeft;
    await sleep(600);

    expect(held % WIDTH).not.toBe(0);
    expect(viewport.scrollLeft).toBe(held);
    lifted = true;
    await lift();
    await expectRestOnASlide(viewport, root, onIndexChange);
  });
});
