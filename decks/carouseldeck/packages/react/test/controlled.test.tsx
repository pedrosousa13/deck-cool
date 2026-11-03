import { createRef, useState, type Ref } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type * as Deck from '@carouseldeck/react';
import {
  expectSettledTo,
  nextFrame,
  setReducedMotion,
  sleep,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

/** A deck with a handle ref, uncontrolled or, given `index`, controlled by a parent
 * that never takes a new index. */
const renderWithRef = ({ index }: { index?: number } = {}) => {
  const ref = createRef<Deck.RootHandle>();
  const onIndexChange = vi.fn();
  render(
    index === undefined ? (
      <TestDeck handleRef={ref} onIndexChange={onIndexChange} />
    ) : (
      <TestDeck handleRef={ref} index={index} onIndexChange={onIndexChange} />
    )
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { ref, viewport: viewportOf(root), onIndexChange };
};

describe('the refs', () => {
  afterEach(() => setReducedMotion(false));

  test('ref is the region element, as on every other primitive', () => {
    const ref = createRef<HTMLDivElement>();
    render(<TestDeck ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toBe(screen.getByRole('region', { name: 'Test deck' }));
  });

  test('handleRef gives scrollTo, next and prev', () => {
    const { ref } = renderWithRef();

    expect(Object.keys(ref.current!).sort()).toEqual([
      'next',
      'prev',
      'scrollTo'
    ]);
  });

  test('scrollTo moves the deck to a snap point and fires onIndexChange', async () => {
    const { ref, viewport, onIndexChange } = renderWithRef();

    ref.current!.scrollTo(3);

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  test('next and prev move one snap point and fire onIndexChange', async () => {
    const { ref, viewport, onIndexChange } = renderWithRef();

    ref.current!.next();
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    ref.current!.prev();
    await expectSettledTo(() => viewport.scrollLeft, 0);

    expect(onIndexChange.mock.calls).toEqual([[1], [0]]);
  });

  test('quick calls compose: next steps on from a scrollTo still in flight', async () => {
    const { ref, viewport, onIndexChange } = renderWithRef();

    ref.current!.scrollTo(2);
    ref.current!.next();

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  test('scrollTo clamps to the snap points there are', async () => {
    const { ref, viewport, onIndexChange } = renderWithRef();

    ref.current!.scrollTo(10);

    await expectSettledTo(() => viewport.scrollLeft, 4 * WIDTH);
    expect(onIndexChange.mock.calls).toEqual([[4]]);
  });

  test('with reduced motion, scrollTo jumps', async () => {
    await setReducedMotion(true);
    const { ref, viewport } = renderWithRef();

    ref.current!.scrollTo(2);

    expect(viewport.scrollLeft).toBe(2 * WIDTH);
  });
});

/** A parent that keeps the deck's index in state, as a controlled input's
 * parent keeps its value. */
function ControlledDeck({
  onIndexChange,
  deckRef
}: {
  onIndexChange: (index: number) => void;
  deckRef?: Ref<Deck.RootHandle>;
}) {
  const [index, setIndex] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setIndex(3)}>
        Go to 4
      </button>
      <TestDeck
        handleRef={deckRef}
        index={index}
        onIndexChange={(next) => {
          onIndexChange(next);
          setIndex(next);
        }}
      />
    </>
  );
}

const renderControlled = () => {
  const ref = createRef<Deck.RootHandle>();
  const onIndexChange = vi.fn();
  render(<ControlledDeck onIndexChange={onIndexChange} deckRef={ref} />);
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { ref, root, viewport: viewportOf(root), onIndexChange };
};

describe('a controlled deck', () => {
  afterEach(() => setReducedMotion(false));

  test('starts at index', () => {
    const { viewport } = renderWithRef({ index: 2 });

    expect(viewport.scrollLeft).toBe(2 * WIDTH);
  });

  // At natural rest (#333), the engine's first measurement is a frame after
  // mount, not during it: a parent that sets a new index before then, in a
  // rerender right after mount, is not a press to leave alone and must
  // still reach it once the engine measures.
  test('a parent that sets index before the deck’s first measurement ends there', async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck index={0} onIndexChange={onIndexChange} />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);

    rerender(<TestDeck index={2} onIndexChange={onIndexChange} />);

    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    expect(root.dataset.index).toBe('2');
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('follows index changes from outside, without calling onIndexChange back', async () => {
    const { root, viewport, onIndexChange } = renderControlled();

    await userEvent.click(screen.getByRole('button', { name: 'Go to 4' }));

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(root.dataset.index).toBe('3');
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('reports a user scroll through onIndexChange and stays where the parent puts it', async () => {
    const { viewport, onIndexChange } = renderControlled();

    await userEvent.wheel(viewport, { delta: { x: 200 } });

    await expectSettledTo(() => onIndexChange.mock.calls, [[1]]);
    expect(viewport.scrollLeft).toBe(WIDTH);
  });

  test('returns to index when the parent does not take the new one', async () => {
    const { viewport, onIndexChange } = renderWithRef({ index: 0 });

    await userEvent.wheel(viewport, { delta: { x: 200 } });

    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    await expectSettledTo(() => viewport.scrollLeft, 0);
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test('Prev and Next fire onIndexChange and return to index when the parent ignores it', async () => {
    const { viewport, onIndexChange } = renderWithRef({ index: 2 });

    act(() => screen.getByRole('button', { name: 'Next' }).click());
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[3]]);
    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    act(() => screen.getByRole('button', { name: 'Previous' }).click());
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[3], [1]]);
    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);

    expect(onIndexChange.mock.calls).toEqual([[3], [1]]);
  });

  test('the handle moves it and fires onIndexChange for the parent to take', async () => {
    const { ref, viewport, onIndexChange } = renderControlled();

    ref.current!.scrollTo(2);
    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    ref.current!.prev();
    await expectSettledTo(() => viewport.scrollLeft, WIDTH);

    expect(onIndexChange.mock.calls).toEqual([[2], [1]]);
  });

  test('ends at the latest index when the parent changes it mid-flight', async () => {
    const onIndexChange = vi.fn();
    function Parent() {
      const [index, setIndex] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setIndex(3)}>
            Go to 4
          </button>
          <button type="button" onClick={() => setIndex(0)}>
            Go to 1
          </button>
          <TestDeck
            index={index}
            onIndexChange={(next) => {
              onIndexChange(next);
              setIndex(next);
            }}
          />
        </>
      );
    }
    render(<Parent />);
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );

    act(() => screen.getByRole('button', { name: 'Go to 4' }).click());
    await sleep(30);
    act(() => screen.getByRole('button', { name: 'Go to 1' }).click());

    await expectSettledTo(() => viewport.scrollLeft, 0);
    await sleep(600);
    expect(viewport.scrollLeft).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  // Measured in WebKit under load (#75): a press can come after the deck
  // settles and reports its index, but before React renders the parent
  // taking it. The parent took the index the deck reported: that is no new
  // `index` to go back to, and the press steps on.
  test('a press before the parent renders the index it took steps on', async () => {
    const onIndexChange = vi.fn();
    const next = () => screen.getByRole('button', { name: 'Next' });
    function Parent() {
      const [index, setIndex] = useState(0);
      return (
        <TestDeck
          index={index}
          onIndexChange={(reported) => {
            onIndexChange(reported);
            setIndex(reported);
            // React renders the parent in a later task: a press in a
            // microtask comes first, as one under load can.
            if (reported === 1) queueMicrotask(() => next().click());
          }}
        />
      );
    }
    render(<Parent />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);

    act(() => next().click());

    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    expect(root.dataset.index).toBe('2');
    expect(onIndexChange.mock.calls).toEqual([[1], [2]]);
  });

  // The parent takes the reported index, but before React renders it the
  // user's scroll brings the deck back to the old `index` and it settles
  // there, which reports nothing. The deck rests at `index`: it goes to it.
  test('the user’s scroll back before the parent renders the index it took still goes to it', async () => {
    const onIndexChange = vi.fn();
    function Parent() {
      const [index, setIndex] = useState(0);
      return (
        <TestDeck
          index={index}
          onIndexChange={(reported) => {
            onIndexChange(reported);
            setIndex(reported);
            if (reported !== 1) return;
            // The user's scroll back, ended before React renders the parent.
            queueMicrotask(() => {
              viewport.scrollTo({ left: 0, behavior: 'instant' });
              viewport.dispatchEvent(new Event('scrollend'));
            });
          }}
        />
      );
    }
    render(<Parent />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);

    act(() => screen.getByRole('button', { name: 'Next' }).click());

    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    expect(root.dataset.index).toBe('1');
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test('a scrollTo inside onIndexChange goes on past the index the parent took', async () => {
    const ref = createRef<Deck.RootHandle>();
    function Parent() {
      const [index, setIndex] = useState(0);
      return (
        <TestDeck
          handleRef={ref}
          index={index}
          onIndexChange={(reported) => {
            setIndex(reported);
            if (reported === 1) ref.current!.scrollTo(3);
          }}
        />
      );
    }
    render(<Parent />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);

    act(() => screen.getByRole('button', { name: 'Next' }).click());

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(root.dataset.index).toBe('3');
  });

  test('goes to index once slides arrive in a deck that had none', async () => {
    const { rerender } = render(
      <TestDeck slides={0} index={2} onIndexChange={() => {}} />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );

    rerender(<TestDeck slides={5} index={2} onIndexChange={() => {}} />);

    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
  });

  // These wait without reading layout: a layout read can itself unstick a
  // deck that would otherwise stay put.
  test('goes to index once slides arrive late in a deck that had none', async () => {
    const { rerender } = render(<TestDeck slides={0} index={2} />);
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    await sleep(300);

    rerender(<TestDeck slides={5} index={2} />);
    await sleep(1500);

    expect(viewport.scrollLeft).toBe(2 * WIDTH);
  });

  test('returns to index when slides shrink past it and grow back', async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck slides={6} index={4} onIndexChange={onIndexChange} />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );

    rerender(<TestDeck slides={2} index={4} onIndexChange={onIndexChange} />);
    await sleep(500);
    rerender(<TestDeck slides={6} index={4} onIndexChange={onIndexChange} />);
    await sleep(1500);

    expect(viewport.scrollLeft).toBe(4 * WIDTH);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  // Chromium sends no `scrollend` for the scroll a shorter scroll range
  // makes, only a `scrollsnapchange`, and after a touch fling on another
  // scroller was cut short, as when a page leaves mid-fling, not even that
  // (#87). Withheld here, so the shrink's scroll has no end event.
  test('returns to index when slides shrink past it and grow back, though the shrink has no end event', async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck slides={6} index={4} onIndexChange={onIndexChange} />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    const withhold = (event: Event) => event.stopImmediatePropagation();
    const ends = ['scrollend', 'scrollsnapchange'];
    for (const type of ends) {
      viewport.addEventListener(type, withhold, { capture: true });
    }

    rerender(<TestDeck slides={2} index={4} onIndexChange={onIndexChange} />);
    await sleep(500);
    for (const type of ends) {
      viewport.removeEventListener(type, withhold, { capture: true });
    }
    rerender(<TestDeck slides={6} index={4} onIndexChange={onIndexChange} />);
    await sleep(1500);

    expect(viewport.scrollLeft).toBe(4 * WIDTH);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('ignores an index that is not a number, so Next still steps', async () => {
    const onIndexChange = vi.fn();
    // One slide: nothing to scroll, so no scroll event clears a bad target.
    const { rerender } = render(
      <TestDeck slides={1} index={NaN} onIndexChange={onIndexChange} />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    await sleep(300);
    rerender(<TestDeck slides={5} index={NaN} onIndexChange={onIndexChange} />);
    await sleep(500);

    act(() => screen.getByRole('button', { name: 'Next' }).click());
    await sleep(1500);

    expect(viewport.scrollLeft).toBe(WIDTH);
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  test('with reduced motion, an index change jumps', async () => {
    await setReducedMotion(true);
    const { viewport } = renderControlled();
    // The controlled-index effect waits for the engine's own first
    // measurement before it ever acts; at natural rest (#333) that is a
    // frame after mount, not during it.
    await nextFrame();
    await nextFrame();

    act(() => screen.getByRole('button', { name: 'Go to 4' }).click());

    expect(viewport.scrollLeft).toBe(3 * WIDTH);
  });
});

describe('mixing controlled and uncontrolled warns in development', () => {
  const spyOnErrors = () =>
    vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => vi.restoreAllMocks());

  test('once, when an uncontrolled deck becomes controlled', () => {
    const errors = spyOnErrors();
    const { rerender } = render(<TestDeck />);

    rerender(<TestDeck index={1} onIndexChange={() => {}} />);
    rerender(<TestDeck index={2} onIndexChange={() => {}} />);

    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0]).toMatch(
      /uncontrolled deck to be controlled/
    );
  });

  test('once, when a controlled deck becomes uncontrolled', () => {
    const errors = spyOnErrors();
    const { rerender } = render(
      <TestDeck index={1} onIndexChange={() => {}} />
    );

    rerender(<TestDeck />);
    rerender(<TestDeck />);

    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0]).toMatch(
      /controlled deck to be uncontrolled/
    );
  });

  test('when given both index and defaultIndex', () => {
    const errors = spyOnErrors();
    const both = { index: 1, defaultIndex: 2, onIndexChange: () => {} };

    // @ts-expect-error -- the types forbid both; a JS caller can pass them
    render(<TestDeck {...both} />);

    expect(errors).toHaveBeenCalledOnce();
    expect(errors.mock.calls[0][0]).toMatch(
      /either index or defaultIndex, not both/
    );
  });

  test('once per deck, when given index without onIndexChange', () => {
    const errors = spyOnErrors();
    const first = render(<TestDeck index={1} />);
    const second = render(<TestDeck index={1} />);

    first.rerender(<TestDeck index={2} />);
    second.rerender(<TestDeck index={2} />);

    expect(errors).toHaveBeenCalledTimes(2);
    for (const [message] of errors.mock.calls) {
      expect(message).toMatch(/index without onIndexChange/);
    }
  });

  test('once for each kind of mistake, not once in all', () => {
    const errors = spyOnErrors();
    const { rerender } = render(<TestDeck />);

    rerender(<TestDeck index={1} />);
    rerender(<TestDeck index={2} />);

    expect(errors.mock.calls.map(([message]) => message)).toEqual([
      expect.stringMatching(/uncontrolled deck to be controlled/),
      expect.stringMatching(/index without onIndexChange/)
    ]);
  });

  test('not at all for a deck that stays one or the other', () => {
    const errors = spyOnErrors();
    const { rerender } = render(<TestDeck defaultIndex={1} />);
    rerender(<TestDeck defaultIndex={2} />);
    render(<TestDeck index={1} onIndexChange={() => {}} />);

    expect(errors).not.toHaveBeenCalled();
  });
});
