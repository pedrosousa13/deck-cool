import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectRestOnASlide,
  mouseAt,
  pagesOf,
  parkMouse,
  sleep,
  TestDeck,
  touchSwipe,
  viewportOf,
  WIDTH,
  withoutScrollEnd
} from './fixtures';
import { SWEEP_MS } from './arrival-helpers';

// Moves as the deck arrives, before its scroll ends (#41): see
// arrival-helpers.tsx for the sweep of delays these tests share.

beforeEach(parkMouse);

describe('input that does not scroll, during a move', () => {
  // Only the user's scroll ends a move: a click, typing or Tab out of a
  // slide leaves it going, so a second press still steps on from where it
  // heads. Focus entering a slide is the user's scroll (#43): see below.
  function WithInput() {
    return (
      <Deck.Root aria-label="Test deck" defaultIndex={1}>
        <Deck.Prev />
        <Deck.Viewport style={{ width: WIDTH }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>
              {/* Clear of the slide's start edge, so it stays in view as the
                  deck moves on and typing scrolls nothing. */}
              {i === 1 ? (
                <input
                  aria-label="Note"
                  style={{ marginInlineStart: 180, width: 80 }}
                />
              ) : (
                `Slide ${i + 1}`
              )}
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
  }

  /** From the second slide, Next, then `input` 60ms on, then Next: where
   * the deck rests, and the snap point nearest the viewport as Next is
   * pressed the second time. */
  async function nextInputNext(input: (viewport: HTMLElement) => unknown) {
    render(<WithInput />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const next = screen.getByRole('button', { name: 'Next' });
    screen.getByRole('textbox', { name: 'Note' }).focus();

    next.click();
    await sleep(60);
    await input(viewport);
    const from = String(Math.round(viewport.scrollLeft / WIDTH));
    next.click();

    await expectRestOnASlide(viewport, root, vi.fn());
    return { index: root.dataset.index, from };
  }

  test('a click in a slide', async () => {
    const { index } = await nextInputNext(async (viewport) => {
      const box = viewport.getBoundingClientRect();
      const y = (box.top + box.bottom) / 2;
      await mouseAt('mousePressed', box.left + 60, y, 1);
      await mouseAt('mouseReleased', box.left + 60, y, 0);
    });
    expect(index).toBe('3');
  });

  test('typing in a text box in a slide', async () => {
    const { index } = await nextInputNext(() => userEvent.keyboard('a'));
    expect(index).toBe('3');
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveProperty(
      'value',
      'a'
    );
  });

  test('Shift+Tab out of a slide', async () => {
    const { index } = await nextInputNext(() =>
      userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    );
    expect(index).toBe('3');
    // Focus goes back to the viewport, outside every slide.
    expect(document.activeElement).toHaveProperty(
      'dataset.carouseldeckViewport',
      ''
    );
  });

  // The user's scroll, by contrast, ends the move: the second press steps
  // on from the snap point nearest where the user has taken the deck, not
  // from where the move was heading.
  test('an arrow key back on the viewport', async () => {
    const { index, from } = await nextInputNext((viewport) => {
      viewport.focus();
      return userEvent.keyboard('{ArrowLeft}');
    });
    expect(index).toBe(String(Number(from) + 1));
  });

  test('a wheel back', async () => {
    const { index, from } = await nextInputNext((viewport) =>
      userEvent.wheel(viewport, { delta: { x: -100 } })
    );
    expect(index).toBe(String(Number(from) + 1));
  });
});

describe('focus entering a slide during a move', () => {
  // Focus wins (#43): the browser scrolls a slide focus enters into view,
  // which is the user's scroll, so it ends the move. The deck then rests on
  // the snap point of the focused slide's page, with the focused element in
  // view, and reports and announces that page.
  //
  // Focus can enter at any time during a move, not only as it arrives, so
  // each test moves focus at each of these delays after the press, from
  // just after the scroll starts to about when it arrives.
  const FOCUS_DELAYS = [20, 60, 120, 200, 260];

  /** At every delay into a press of Next, moves focus with `focus`: the deck
   * must rest on the page `expected`, of `pageSize` slides, with the element
   * labelled `focused` in view and focused. */
  async function focusAtEveryDelay(
    props: Parameters<typeof TestDeck>[0],
    focus: () => unknown,
    focused: string,
    expected: number,
    { pageSize = 1, delays = FOCUS_DELAYS } = {}
  ) {
    for (const delay of delays) {
      const onIndexChange = vi.fn();
      const { unmount } = render(
        <TestDeck
          onIndexChange={onIndexChange}
          controls={
            <>
              <Deck.Dots />
              <Deck.Counter />
            </>
          }
          {...props}
        />
      );
      const root = screen.getByRole('region', { name: 'Test deck' });
      const viewport = viewportOf(root);

      // Focused, as Next is once the user presses it.
      const next = screen.getByRole('button', { name: 'Next' });
      next.focus();
      next.click();
      await sleep(delay);
      await focus();

      await expectRestOnASlide(viewport, root, onIndexChange, pageSize);
      const element = screen.getByRole('button', { name: focused });
      const box = element.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      const counter = root.querySelector('[data-carouseldeck-counter]')!;
      const count = counter.getAttribute('data-count');
      expect({
        delay,
        index: root.dataset.index,
        focused: document.activeElement === element,
        inView: box.left >= view.left - 0.5 && box.right <= view.right + 0.5,
        dot: root
          .querySelector('[data-carouseldeck-dots] [aria-current]')
          ?.getAttribute('data-index'),
        counter: counter.textContent,
        announced: root.querySelector('[aria-live]')?.textContent
      }).toEqual({
        delay,
        index: String(expected),
        focused: true,
        inView: true,
        dot: String(expected),
        counter: `${expected + 1} / ${count}`,
        // A deck back where it started has not moved: nothing to announce.
        announced:
          expected === (props.defaultIndex ?? 0)
            ? ''
            : `Slide ${expected * pageSize + 1} of ${props.slides ?? 5}`
      });
      expect(
        viewport.querySelector('[data-focal]')?.getAttribute('aria-label')
      ).toBe(`${expected * pageSize + 1} of ${props.slides ?? 5}`);
      unmount();
    }
  }

  const focusOn = (name: string) => () =>
    screen.getByRole('button', { name }).focus();

  test(
    'Shift+Tab from Next into the last slide',
    async () => {
      await focusAtEveryDelay(
        {},
        () => userEvent.keyboard('{Shift>}{Tab}{/Shift}'),
        'Button 5',
        4
      );
    },
    SWEEP_MS
  );

  test(
    'focus into the slide the move heads to',
    async () => {
      await focusAtEveryDelay({}, focusOn('Button 2'), 'Button 2', 1);
    },
    SWEEP_MS
  );

  test(
    'focus into a slide past the one the move heads to',
    async () => {
      await focusAtEveryDelay({}, focusOn('Button 4'), 'Button 4', 3);
    },
    SWEEP_MS
  );

  test(
    'focus back into the slide the move left',
    async () => {
      await focusAtEveryDelay(
        { defaultIndex: 2 },
        focusOn('Button 3'),
        'Button 3',
        2
      );
    },
    SWEEP_MS
  );

  test(
    'looping, focus into the first slide as Next crosses the seam onto its shell',
    async () => {
      await focusAtEveryDelay(
        { loop: true, defaultIndex: 4 },
        focusOn('Button 1'),
        'Button 1',
        0
      );
    },
    SWEEP_MS
  );

  test(
    'looping, focus into the last slide as Next crosses the seam',
    async () => {
      await focusAtEveryDelay(
        { loop: true, defaultIndex: 4 },
        focusOn('Button 4'),
        'Button 4',
        3
      );
    },
    SWEEP_MS
  );

  test(
    "pages of 3 over 10, focus into a slide rests on its page's snap point",
    async () => {
      addStyle(`${pagesOf(3)} .pages > * { width: calc(100% / 3); }`);
      await focusAtEveryDelay(
        { slides: 10, viewportClassName: 'pages' },
        focusOn('Button 8'),
        'Button 8',
        2,
        { pageSize: 3 }
      );
    },
    SWEEP_MS
  );

  test('focus into a slide in no page rests on the snap point nearest it', async () => {
    // Only every third slide from the second snaps, to its start: the first
    // slide is in no page.
    addStyle(`
      .offset > * { width: calc(100% / 3); }
      .offset > [data-carouseldeck-slide]:nth-child(3n + 2) {
        scroll-snap-align: start;
      }
      .offset > [data-carouseldeck-slide]:not(:nth-child(3n + 2)) {
        scroll-snap-align: none;
      }
    `);
    const onIndexChange = vi.fn();
    render(
      <TestDeck
        slides={10}
        viewportClassName="offset"
        onIndexChange={onIndexChange}
      />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(60);
    screen.getByRole('button', { name: 'Button 1' }).focus();

    await expectRestOnASlide(viewport, root, onIndexChange, 3);
    expect(root.dataset.index).toBe('0');
    expect(viewport.scrollLeft).toBe(WIDTH / 3);
  });

  test('a mouse press on a button in another slide is a click: the move goes on', async () => {
    const onIndexChange = vi.fn();
    render(<TestDeck defaultIndex={1} onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const button = screen.getByRole('button', { name: 'Button 2' });

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(30);
    // On the part of the button the move has not yet taken out of view.
    const box = button.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const x = (Math.max(box.left, view.left) + box.right) / 2;
    const y = (box.top + box.bottom) / 2;
    await mouseAt('mousePressed', x, y, 1);
    await mouseAt('mouseReleased', x, y, 0);

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(document.activeElement).toBe(button);
    expect(root.dataset.index).toBe('2');
  });

  describe('in an engine without scrollend', () => {
    withoutScrollEnd();

    test(
      'looping, focus into the first slide as Next crosses the seam onto its shell',
      async () => {
        expect('onscrollend' in window).toBe(false);
        await focusAtEveryDelay(
          { loop: true, defaultIndex: 4 },
          focusOn('Button 1'),
          'Button 1',
          0
        );
      },
      SWEEP_MS
    );
  });
});

describe('focus within a slide or onto the viewport during a move', () => {
  // Neither is the user taking over (#51): the move goes on to its own
  // target. In Chromium the browser's focus scroll stops the move's scroll,
  // so the deck must start it again, and still report only what the move
  // does.
  //
  // Focus can move at any time during a move, not only as it arrives, so
  // each test moves focus at each of these delays after the press, from
  // just after the scroll starts to about when it arrives.
  const MID_MOVE_DELAYS = [20, 60, 120, 200, 260];

  /** Five slides of two buttons each, "A n" and "B n". */
  function TwoButtons(props: Deck.RootProps) {
    return (
      <Deck.Root aria-label="Test deck" {...props}>
        <Deck.Prev />
        <Deck.Viewport style={{ width: WIDTH }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>
              <button type="button">A {i + 1}</button>
              <button type="button">B {i + 1}</button>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    );
  }

  /** At every delay into a press of Next, from focus on `from`, moves focus
   * with `focus`: the deck must rest on slide `expected`, the move's target,
   * and report it once. */
  async function moveGoesOnAtEveryDelay(
    props: Deck.RootProps,
    from: (viewport: HTMLElement) => void,
    focus: (viewport: HTMLElement) => unknown,
    expected: number
  ) {
    for (const delay of MID_MOVE_DELAYS) {
      const onIndexChange = vi.fn();
      const { unmount } = render(
        <TwoButtons onIndexChange={onIndexChange} {...props} />
      );
      const root = screen.getByRole('region', { name: 'Test deck' });
      const viewport = viewportOf(root);
      from(viewport);
      const focused = document.activeElement;

      screen.getByRole('button', { name: 'Next' }).click();
      await sleep(delay);
      await focus(viewport);
      expect(document.activeElement).not.toBe(focused);

      await expectRestOnASlide(viewport, root, onIndexChange);
      expect({
        delay,
        index: root.dataset.index,
        calls: onIndexChange.mock.calls,
        dot: root
          .querySelector('[data-carouseldeck-dots] [aria-current]')
          ?.getAttribute('data-index'),
        counter: root.querySelector('[data-carouseldeck-counter]')?.textContent,
        announced: root.querySelector('[aria-live]')?.textContent
      }).toEqual({
        delay,
        index: String(expected),
        calls: [[expected]],
        dot: String(expected),
        counter: `${expected + 1} / 5`,
        announced: `Slide ${expected + 1} of 5`
      });
      unmount();
    }
  }

  const focusButton =
    (name: string, preventScroll = false) =>
    () =>
      screen.getByRole('button', { name }).focus({ preventScroll });
  const focusViewport = (viewport: HTMLElement) => viewport.focus();
  const shiftTab = () => userEvent.keyboard('{Shift>}{Tab}{/Shift}');

  test(
    'focus within the slide the move leaves',
    async () => {
      await moveGoesOnAtEveryDelay(
        {},
        focusButton('A 1'),
        focusButton('B 1'),
        1
      );
    },
    SWEEP_MS
  );

  test(
    'focus within the slide the move heads to',
    async () => {
      // Focus starts in the next slide without scrolling it into view.
      await moveGoesOnAtEveryDelay(
        {},
        focusButton('A 2', true),
        focusButton('B 2'),
        1
      );
    },
    SWEEP_MS
  );

  test(
    'focus from Next onto the viewport',
    async () => {
      await moveGoesOnAtEveryDelay({}, focusButton('Next'), focusViewport, 1);
    },
    SWEEP_MS
  );

  test(
    'Shift+Tab out of a slide onto the viewport',
    async () => {
      await moveGoesOnAtEveryDelay({}, focusButton('A 1'), shiftTab, 1);
    },
    SWEEP_MS
  );

  test(
    'looping, focus within the last slide as Next crosses the seam',
    async () => {
      await moveGoesOnAtEveryDelay(
        { loop: true, defaultIndex: 4 },
        focusButton('A 5'),
        focusButton('B 5'),
        0
      );
    },
    SWEEP_MS
  );

  test(
    'looping, focus onto the viewport as Next crosses the seam',
    async () => {
      await moveGoesOnAtEveryDelay(
        { loop: true, defaultIndex: 4 },
        focusButton('Next'),
        focusViewport,
        0
      );
    },
    SWEEP_MS
  );

  test(
    'looping, focus within a slide as Next moves away from the seam',
    async () => {
      await moveGoesOnAtEveryDelay(
        { loop: true, defaultIndex: 1 },
        focusButton('A 2'),
        focusButton('B 2'),
        2
      );
    },
    SWEEP_MS
  );

  test('a press right after focus within a slide still steps on', async () => {
    const onIndexChange = vi.fn();
    render(<TwoButtons onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const next = screen.getByRole('button', { name: 'Next' });
    screen.getByRole('button', { name: 'A 1' }).focus();

    next.click();
    await sleep(60);
    screen.getByRole('button', { name: 'B 1' }).focus();
    next.click();

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('2');
  });

  test("the user's scroll right after focus within a slide ends the move", async () => {
    const onIndexChange = vi.fn();
    render(<TwoButtons onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    screen.getByRole('button', { name: 'A 1' }).focus();

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(60);
    screen.getByRole('button', { name: 'B 1' }).focus();
    // A wheel back to the start, before the move's scroll starts again.
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: -WIDTH }));
    viewport.scrollTo({ left: 0, behavior: 'instant' });

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('0');
  });

  test('focus entering another slide right after focus within a slide goes to that slide', async () => {
    const onIndexChange = vi.fn();
    render(<TwoButtons onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    screen.getByRole('button', { name: 'A 1' }).focus();

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(60);
    screen.getByRole('button', { name: 'B 1' }).focus();
    const a4 = screen.getByRole('button', { name: 'A 4' });
    a4.focus();

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('3');
    expect(document.activeElement).toBe(a4);
  });
});

describe('a pointer held on the deck', () => {
  test('as the deck arrives on a shell, it jumps off the shell only once the pointer lets go', async () => {
    const onIndexChange = vi.fn();
    render(<TestDeck loop defaultIndex={4} onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const box = viewport.getBoundingClientRect();
    const [x, y] = [box.left + 60, (box.top + box.bottom) / 2];
    // Two sets of shells before the slides: slide 1's shell a set after
    // them is at 15.
    const shell = 15 * WIDTH;

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(100);
    await mouseAt('mousePressed', x, y, 1);
    await expect.poll(() => viewport.scrollLeft).toBe(shell);
    await sleep(300);
    expect(viewport.scrollLeft).toBe(shell);

    await mouseAt('mouseReleased', x, y, 0);
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('0');
  });
});

describe('a pointer whose release the deck does not hear', () => {
  // A pointer still down holds the settle; one whose release never reaches
  // the deck must not hold it for good.
  test('a touch whose pointerup and lostpointercapture a slide stops', async () => {
    const onIndexChange = vi.fn();
    render(<TestDeck loop defaultIndex={3} onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const next = screen.getByRole('button', { name: 'Next' });
    const slide = screen.getByRole('group', { name: '4 of 5' });
    const stop = (event: Event) => event.stopPropagation();
    slide.addEventListener('pointerup', stop);
    slide.addEventListener('lostpointercapture', stop);

    await touchSwipe(slide, 0);
    next.click();
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('4');
    // Across the seam: it jumps off the copy.
    next.click();
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('0');
  });

  test("a click whose pointerup a slide's React handler stops, during a move", async () => {
    const onIndexChange = vi.fn();
    render(
      <Deck.Root
        aria-label="Test deck"
        loop
        defaultIndex={4}
        onIndexChange={onIndexChange}
      >
        <Deck.Prev />
        <Deck.Viewport style={{ width: WIDTH }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>
              <div
                style={{ height: 100 }}
                onPointerUp={(event) => event.stopPropagation()}
              >
                Slide {i + 1}
              </div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const box = viewport.getBoundingClientRect();
    const y = box.top + 50;

    screen.getByRole('button', { name: 'Next' }).click();
    await sleep(100);
    await mouseAt('mousePressed', box.left + 60, y, 1);
    await mouseAt('mouseReleased', box.left + 60, y, 0);

    // The mouse does not move again: the deck must settle on its own.
    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(root.dataset.index).toBe('0');
  });

  test('a mouse pressed on the deck that never lets go, then the window losing focus', async () => {
    const onIndexChange = vi.fn();
    render(
      <TestDeck
        loop
        autoplay={300}
        onIndexChange={onIndexChange}
        controls={<Deck.AutoplayToggle />}
      />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const box = viewport.getBoundingClientRect();
    const off = [5, window.innerHeight - 5] as const;
    onTestFinished(async () => {
      await mouseAt('mouseReleased', ...off, 0);
    });

    await mouseAt('mousePressed', box.left + 60, (box.top + box.bottom) / 2, 1);
    // Off the deck with the button still down, where no pointerup comes.
    await mouseAt('mouseMoved', ...off, 1);
    // The press focused the deck, which stopped autoplay: start it again.
    (document.activeElement as HTMLElement).blur();
    document
      .querySelector<HTMLButtonElement>('[data-carouseldeck-autoplay-toggle]')!
      .click();
    await sleep(1000);
    window.dispatchEvent(new FocusEvent('blur'));

    const steps = onIndexChange.mock.calls.length;
    await expect
      .poll(() => onIndexChange.mock.calls.length, { timeout: 4000 })
      .toBeGreaterThanOrEqual(steps + 3);
    expect(viewport.style.scrollSnapType).not.toBe('none');
  });
});
