import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import {
  addStyle,
  CENTRED,
  expectRestOnASlide,
  expectSettledTo,
  gestureScroll,
  mouseAt,
  mouseDrag,
  nextFrame,
  pagesOf,
  parkMouse,
  setReducedMotion,
  sleep,
  TestDeck,
  trackMotion,
  viewportOf,
  WIDTH,
  withoutScrollEnd
} from './fixtures';

// Loop (GLOSSARY.md; clone and jump, ADR-0006, as built in ADR-0009): a
// full set of inert, aria-hidden copies of the slides on each side of them,
// and a jump of one set length onto the identical slides once the viewport
// rests on a copy.

const renderLoop = (props: Parameters<typeof TestDeck>[0] = {}) => {
  const onIndexChange = vi.fn();
  render(
    <TestDeck
      loop
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
  return {
    root,
    viewport,
    prev: screen.getByRole('button', { name: 'Previous' }),
    next: screen.getByRole('button', { name: 'Next' }),
    onIndexChange,
    dots: () =>
      within(root)
        .getByRole('group', { name: 'Choose page' })
        .querySelectorAll('button'),
    counter: () =>
      root.querySelector('[data-carouseldeck-counter]')?.textContent,
    /** Where a slide (copies are out of the accessibility tree, so never a
     * copy) starts, from the viewport's start edge. */
    offsetOf: (label: string) =>
      Math.round(
        screen.getByRole('group', { name: label }).getBoundingClientRect()
          .left - viewport.getBoundingClientRect().left
      )
  };
};

const copiesIn = (viewport: HTMLElement) => [
  ...viewport.querySelectorAll('[data-carouseldeck-copy]')
];

describe('loop', () => {
  test('Next on the last snap point moves across the seam to the first', async () => {
    const { root, next, onIndexChange, offsetOf } = renderLoop({
      defaultIndex: 4
    });

    await userEvent.click(next);

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 5')).toBe(0);
    expect(root.dataset.index).toBe('0');
  });

  test('Prev on the first snap point moves across the seam to the last', async () => {
    const { prev, onIndexChange, offsetOf } = renderLoop();

    await userEvent.click(prev);

    await expectSettledTo(() => onIndexChange.mock.calls, [[4]]);
    expect(offsetOf('5 of 5')).toBe(0);
  });

  test('under reduced motion, Next on the last snap point goes to the first at once', async () => {
    await setReducedMotion(true);
    onTestFinished(() => setReducedMotion(false));
    const { next, onIndexChange, offsetOf } = renderLoop({ defaultIndex: 4 });

    await userEvent.click(next);

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 5')).toBe(0);
  });

  test('neither Prev nor Next is ever disabled', async () => {
    const { prev, next } = renderLoop({ slides: 2 });

    expect(prev.hasAttribute('disabled')).toBe(false);
    expect(next.hasAttribute('disabled')).toBe(false);
    await userEvent.click(next);
    await sleep(500);
    expect(prev.hasAttribute('disabled')).toBe(false);
    expect(next.hasAttribute('disabled')).toBe(false);
  });

  test('a scroll back across the seam rests on the last slide', async () => {
    const { viewport, onIndexChange, offsetOf } = renderLoop();

    await gestureScroll(viewport, -WIDTH);

    await expectSettledTo(() => onIndexChange.mock.calls, [[4]]);
    expect(offsetOf('5 of 5')).toBe(0);
  });

  test('a wheel scroll forward across the seam reports the first slide', async () => {
    const { viewport, onIndexChange, offsetOf } = renderLoop({
      defaultIndex: 4
    });

    await userEvent.wheel(viewport, { delta: { x: 200 } });

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 5')).toBe(0);
  });

  test('two quick presses of Next cross the seam and report once', async () => {
    const { next, onIndexChange, offsetOf } = renderLoop({ defaultIndex: 3 });

    next.click();
    next.click();

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 5')).toBe(0);
  });

  test('Next pressed seven times mid-motion counts on round the seam, with no end', async () => {
    const { next, root, offsetOf } = renderLoop({ defaultIndex: 3 });

    for (let i = 0; i < 7; i++) {
      next.click();
      await sleep(80);
    }

    // 3 + 7 is 10: twice round five slides, back to the first.
    await expectSettledTo(() => root.dataset.index, '0');
    expect(offsetOf('1 of 5')).toBe(0);
  });

  test('Prev pressed twelve times at once counts back round the seam, with no end', async () => {
    const { prev, root, onIndexChange, offsetOf } = renderLoop();

    for (let i = 0; i < 12; i++) prev.click();

    // 0 - 12 is 3, round five slides twice and more.
    await expectSettledTo(() => root.dataset.index, '3');
    expect(onIndexChange.mock.calls.at(-1)).toEqual([3]);
    expect(offsetOf('4 of 5')).toBe(0);
  });

  test('the jump off a copy moves the slides by under half a pixel, with a fractional set length', async () => {
    // 3.5 slides in view: a set of five is 428.57px long.
    addStyle(CENTRED);
    const { viewport, next, root } = renderLoop({
      viewportClassName: 'centred',
      defaultIndex: 4
    });
    await sleep(100);
    const box = viewport.getBoundingClientRect();
    const run = [
      ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
    ];
    // At each scroll: where the viewport is, and how far the slide or copy
    // nearest the centre is from it.
    const seen: [number, number][] = [];
    const onScroll = () => {
      const centre = (box.left + box.right) / 2;
      let nearest = Infinity;
      for (const el of run) {
        const r = el.getBoundingClientRect();
        const d = (r.left + r.right) / 2 - centre;
        if (Math.abs(d) < Math.abs(nearest)) nearest = d;
      }
      seen.push([viewport.scrollLeft, nearest]);
    };
    viewport.addEventListener('scroll', onScroll);

    await userEvent.click(next);
    await expectSettledTo(() => root.dataset.index, '0');
    viewport.removeEventListener('scroll', onScroll);

    // The jump: the one scroll of most of a set at once.
    const jump = seen.findIndex(
      ([at], i) => i > 0 && Math.abs(at - seen[i - 1][0]) > 200
    );
    expect(jump).toBeGreaterThan(0);
    const [, before] = seen[jump - 1];
    const [, after] = seen[jump];
    expect(Math.abs(before)).toBeLessThan(0.5);
    // Scroll positions are whole pixels here, and the set is not: the jump
    // lands on the slide's snap point, the whole pixel nearest a set back,
    // so it can move the slides by up to half a pixel, plus layout's own
    // rounding to sixty-fourths (ADR-0009).
    expect(Math.abs(after - before)).toBeLessThanOrEqual(0.5 + 2 / 64);
  });

  // Presses about as fast as the deck moves outrun the copies of where it is
  // heading: the deck then passes fewer slides than were pressed, but never
  // moves against the press, and comes to rest on a slide.
  for (const [button, start, presses, spacing, centred] of [
    ['Next', 3, 7, 120, false],
    ['Next', 3, 12, 120, false],
    ['Next', 3, 12, 40, false],
    ['Previous', 1, 9, 120, false],
    ['Previous', 1, 14, 120, false],
    ['Previous', 1, 14, 40, false],
    // Centred, the copies' last snap points are past the scroll range.
    ['Next', 3, 12, 120, true],
    ['Previous', 1, 14, 120, true]
  ] as const) {
    test(`${presses} presses of ${button} ${spacing}ms apart only ever move ${button === 'Next' ? 'on' : 'back'}, and rest on a slide${centred ? ', centred' : ''}`, async () => {
      if (centred) addStyle(CENTRED);
      const { viewport, root, onIndexChange } = renderLoop({
        defaultIndex: start,
        viewportClassName: centred ? 'centred' : undefined
      });
      const way = button === 'Next' ? 1 : -1;
      const motion = trackMotion(viewport);

      const press = screen.getByRole('button', { name: button });
      for (let i = 0; i < presses; i++) {
        press.click();
        await sleep(spacing);
      }

      await expectRestOnASlide(viewport, root, onIndexChange);
      expect(motion.against(way, centred ? 200 : 2.5 * WIDTH)).toEqual([]);
    });
  }

  test('a copy resting off its slide plus a set, as WebKit rests one, is arrived at and jumped off', async () => {
    // Measured in WebKit: a copy can rest a pixel or two off its slide's
    // rest plus a set's length. A scroll margin on the copies alone moves
    // their rests 2px here, in every browser.
    addStyle(
      '.margined > [data-carouseldeck-copy] { scroll-margin-left: 2px; }'
    );
    const { root, viewport, next, onIndexChange } = renderLoop({
      defaultIndex: 4,
      viewportClassName: 'margined'
    });
    const scrolls: ScrollToOptions[] = [];
    const scrollTo = viewport.scrollTo.bind(viewport);
    viewport.scrollTo = ((options: ScrollToOptions) => {
      scrolls.push(options);
      scrollTo(options);
    }) as typeof viewport.scrollTo;

    next.click();

    await expectRestOnASlide(viewport, root, onIndexChange);
    expect(onIndexChange.mock.calls).toEqual([[0]]);
    // To the copy's rest, then the jump off it to its slide's.
    expect(scrolls).toEqual([
      { left: 2998, behavior: 'smooth' },
      { left: 1500, behavior: 'instant' }
    ]);
  });

  test('Dots and Counter count the slides, not the copies', async () => {
    const { prev, dots, counter } = renderLoop();

    expect(dots()).toHaveLength(5);
    expect(counter()).toBe('1 / 5');

    await userEvent.click(prev);

    await expect.poll(counter).toBe('5 / 5');
    expect(dots()[4].getAttribute('aria-current')).toBe('true');
  });

  test('a dot moves to its slide', async () => {
    const { dots, counter, offsetOf } = renderLoop();

    await userEvent.click(dots()[3]);

    await expectSettledTo(() => offsetOf('4 of 5'), 0);
    expect(counter()).toBe('4 / 5');
  });

  test('a step after a seam crossing still settles and reports', async () => {
    const { next, onIndexChange, offsetOf } = renderLoop({ defaultIndex: 4 });
    await userEvent.click(next);
    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);

    await userEvent.click(next);

    await expectSettledTo(() => onIndexChange.mock.calls, [[0], [1]]);
    expect(offsetOf('2 of 5')).toBe(0);
  });

  test('slides added after a seam crossing update the counter', async () => {
    const { rerender } = render(
      <TestDeck loop slides={3} defaultIndex={2} controls={<Deck.Counter />} />
    );
    const counter = () =>
      document.querySelector('[data-carouseldeck-counter]')?.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expectSettledTo(counter, '1 / 3');

    rerender(
      <TestDeck loop slides={4} defaultIndex={2} controls={<Deck.Counter />} />
    );

    await expect.poll(counter).toBe('1 / 4');
  });

  // A slide added to a looping deck adds a copy before the slides too, which
  // moves every slide on by one under the viewport (#146).
  test('slides added during a move across the seam end at its target', async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck
        loop
        slides={3}
        defaultIndex={2}
        onIndexChange={onIndexChange}
        controls={<Deck.Counter />}
      />
    );
    const counter = () =>
      document.querySelector('[data-carouseldeck-counter]')?.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await sleep(100);

    rerender(
      <TestDeck
        loop
        slides={4}
        defaultIndex={2}
        onIndexChange={onIndexChange}
        controls={<Deck.Counter />}
      />
    );

    await expectSettledTo(counter, '1 / 4');
    expect(onIndexChange.mock.calls).toEqual([[0]]);
  });

  test('slides removed during a move across the seam end at its target', async () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck
        loop
        slides={4}
        defaultIndex={3}
        onIndexChange={onIndexChange}
        controls={<Deck.Counter />}
      />
    );
    const counter = () =>
      document.querySelector('[data-carouseldeck-counter]')?.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await sleep(100);

    rerender(
      <TestDeck
        loop
        slides={3}
        defaultIndex={3}
        onIndexChange={onIndexChange}
        controls={<Deck.Counter />}
      />
    );

    await expectSettledTo(counter, '1 / 3');
    expect(onIndexChange.mock.calls).toEqual([[0]]);
  });

  test('the live region announces the slide, counting only the slides', async () => {
    const { root, prev } = renderLoop();

    await userEvent.click(prev);

    await expect
      .poll(() => root.querySelector('[aria-live]')?.textContent)
      .toBe('Slide 5 of 5');
  });

  test('can be turned on and off after mount, leaving the deck where it is', async () => {
    const { rerender } = render(<TestDeck defaultIndex={2} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const offsetOf = (label: string) =>
      Math.round(
        screen.getByRole('group', { name: label }).getBoundingClientRect()
          .left - viewport.getBoundingClientRect().left
      );

    rerender(<TestDeck defaultIndex={2} loop />);

    expect(copiesIn(viewport)).toHaveLength(10);
    expect(offsetOf('3 of 5')).toBe(0);
    await sleep(300);
    expect(offsetOf('3 of 5')).toBe(0);
    expect(root.dataset.index).toBe('2');

    rerender(<TestDeck defaultIndex={2} />);

    expect(copiesIn(viewport)).toEqual([]);
    await expectSettledTo(() => offsetOf('3 of 5'), 0);
    expect(root.dataset.index).toBe('2');
  });

  test('a deck whose slides all fit renders no copies and no controls', async () => {
    addStyle('.fit > * { width: 25%; }');
    const { container } = render(
      <TestDeck loop slides={3} viewportClassName="fit" />
    );
    const viewport = viewportOf(container.firstElementChild as HTMLElement);

    await expect.poll(() => copiesIn(viewport)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  });
});

describe('loop copies', () => {
  test('a full set of copies sits on each side of the slides', () => {
    const { viewport } = renderLoop();

    const labels = (selector: string) =>
      [...viewport.querySelectorAll(selector)].map((slide) =>
        slide.getAttribute('aria-label')
      );
    expect(labels('[data-carouseldeck-copy=before]')).toEqual(
      labels('[data-carouseldeck-slide]:not([data-carouseldeck-copy])')
    );
    expect(labels('[data-carouseldeck-copy=after]')).toHaveLength(5);
    // Laid out before the slides, and after them.
    const left = (selector: string) =>
      viewport.querySelector(selector)!.getBoundingClientRect().left;
    expect(left('[data-carouseldeck-copy=before]')).toBeLessThan(
      left('[aria-label="1 of 5"]:not([data-carouseldeck-copy])')
    );
    expect(left('[data-carouseldeck-copy=after]')).toBeGreaterThan(
      left('[aria-label="5 of 5"]:not([data-carouseldeck-copy])')
    );
  });

  test('every copy is inert and aria-hidden', () => {
    const { viewport } = renderLoop();

    expect(copiesIn(viewport)).toHaveLength(10);
    for (const copy of copiesIn(viewport)) {
      expect(copy.getAttribute('aria-hidden')).toBe('true');
      expect(copy.hasAttribute('inert')).toBe(true);
    }
  });

  test('only the slides are in the accessibility tree', () => {
    renderLoop();

    const slides = screen
      .getAllByRole('group')
      .filter((el) => el.getAttribute('aria-roledescription') === 'slide');
    expect(slides.map((slide) => slide.getAttribute('aria-label'))).toEqual([
      '1 of 5',
      '2 of 5',
      '3 of 5',
      '4 of 5',
      '5 of 5'
    ]);
  });

  test('tabbing never lands on a copy', async () => {
    const { prev } = renderLoop();
    prev.focus();

    const visited: Element[] = [];
    for (let i = 0; i < 12; i++) {
      await userEvent.tab();
      if (document.activeElement) visited.push(document.activeElement);
    }

    expect(visited.some((el) => el.closest('[data-carouseldeck-copy]'))).toBe(
      false
    );
    expect(visited.map((el) => el.textContent)).toContain('Button 5');
  });

  test('a copy is never current or focal', async () => {
    const { viewport, next } = renderLoop({ defaultIndex: 4 });

    await userEvent.click(next);
    await sleep(500);

    for (const marker of ['data-current', 'data-focal']) {
      const marked = viewport.querySelectorAll(`[${marker}]`);
      expect(marked).toHaveLength(1);
      expect(marked[0].hasAttribute('data-carouseldeck-copy')).toBe(false);
      expect(marked[0].getAttribute('aria-label')).toBe('1 of 5');
    }
  });

  test('without loop there are no copies', () => {
    render(<TestDeck />);

    expect(
      copiesIn(viewportOf(screen.getByRole('region', { name: 'Test deck' })))
    ).toEqual([]);
  });
});

describe('loop with pages', () => {
  test('of 3 over 9 slides, Next on the last page moves to the first and Prev back', async () => {
    addStyle(pagesOf(3));
    const { next, prev, onIndexChange, counter, dots, offsetOf } = renderLoop({
      slides: 9,
      viewportClassName: 'pages',
      defaultIndex: 2
    });
    expect(dots()).toHaveLength(3);
    expect(counter()).toBe('3 / 3');

    await userEvent.click(next);
    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 9')).toBe(0);
    expect(counter()).toBe('1 / 3');

    await userEvent.click(prev);
    await expectSettledTo(() => onIndexChange.mock.calls, [[0], [2]]);
    expect(offsetOf('7 of 9')).toBe(0);
  });

  // The last page holds one slide, so the seam is mid-page: a copy's
  // alignment must be its slide's, not what `:nth-child()` gives the copy.
  test('of 3 over 10 slides, the last page of one crosses to the first', async () => {
    addStyle(`${pagesOf(3)} .pages > * { width: calc(100% / 3); }`);
    const { next, prev, onIndexChange, counter, offsetOf } = renderLoop({
      slides: 10,
      viewportClassName: 'pages',
      defaultIndex: 3
    });
    expect(counter()).toBe('4 / 4');
    expect(offsetOf('10 of 10')).toBe(0);

    await userEvent.click(next);
    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 10')).toBe(0);

    await userEvent.click(prev);
    await expectSettledTo(() => onIndexChange.mock.calls, [[0], [3]]);
    expect(offsetOf('10 of 10')).toBe(0);
  });
});

describe('loop, presses that outrun the copies', () => {
  test('pages of 3 over 10, Next eleven times 120ms apart, comes to rest on a page and moves on after', async () => {
    addStyle(`${pagesOf(3)} .pages > * { width: calc(100% / 3); }`);
    const { viewport, root, next, prev, onIndexChange } = renderLoop({
      slides: 10,
      viewportClassName: 'pages',
      defaultIndex: 1
    });
    const motion = trackMotion(viewport);

    for (let i = 0; i < 11; i++) {
      next.click();
      await sleep(120);
    }

    await expectRestOnASlide(viewport, root, onIndexChange, 3);
    expect(motion.against(1, 500)).toEqual([]);
    const rest = root.dataset.index;
    await userEvent.click(next);
    await expect.poll(() => root.dataset.index).not.toBe(rest);
    await userEvent.click(prev);
    await expectSettledTo(() => root.dataset.index, rest);
  });

  /** From slide 4, Next six times at once, then twice more once the deck is
   * on the copies after the slides: the last presses outrun the copies. */
  const outrun = async () => {
    const deck = renderLoop({ defaultIndex: 3 });
    for (let i = 0; i < 6; i++) deck.next.click();
    await expect.poll(() => deck.viewport.scrollLeft).toBeGreaterThan(3600);
    deck.next.click();
    deck.next.click();
    return deck;
  };

  test('a mouse drag after the deck rests at the end of the copies settles, with snapping back', async () => {
    const { viewport, root, onIndexChange } = await outrun();
    // At rest at the end of the copies, it jumps back a set.
    await expect.poll(() => viewport.scrollLeft).toBeLessThan(3000);

    await mouseDrag(viewport, 100, { holdMs: 150 });

    await expectRestOnASlide(viewport, root, onIndexChange);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expect.poll(() => viewport.scrollLeft % WIDTH).toBe(0);
  });

  test('a wheel back while the deck heads on is where the deck goes', async () => {
    const { viewport, root, onIndexChange } = await outrun();

    await gestureScroll(viewport, -600);
    // From the gesture's end, nothing moves the deck on again, but for the
    // browser's own snap to the snap point nearest where the gesture left
    // it, which is on from there where the gesture ends past halfway
    // between two snap points. Where it ends depends on where the deck is
    // as the gesture begins, so on the machine's load. The deck rests on
    // that snap point, and never passes it.
    const left = viewport.scrollLeft;
    const nearest = Math.round(left / WIDTH) * WIDTH;
    const positions: number[] = [];
    let sampling = true;
    const sample = () => {
      positions.push(viewport.scrollLeft);
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    await expectRestOnASlide(viewport, root, onIndexChange);
    sampling = false;
    expect(positions.filter((at) => at > Math.max(left, nearest) + 1)).toEqual(
      []
    );
    // The copies before the slides start at 0: a set is five slides.
    expect(root.dataset.index).toBe(String((nearest / WIDTH) % 5));
  });
});

describe('loop, controlled', () => {
  function Controlled({ onIndexChange }: { onIndexChange: () => void }) {
    const [index, setIndex] = useState(4);
    return (
      <TestDeck
        loop
        index={index}
        onIndexChange={(next) => {
          onIndexChange();
          setIndex(next);
        }}
      />
    );
  }

  test('Next on the last snap point crosses the seam and the parent takes it', async () => {
    const onIndexChange = vi.fn();
    render(<Controlled onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expectSettledTo(() => root.dataset.index, '0');
    expect(onIndexChange).toHaveBeenCalledOnce();
    const viewport = viewportOf(root);
    expect(
      Math.round(
        screen.getByRole('group', { name: '1 of 5' }).getBoundingClientRect()
          .left - viewport.getBoundingClientRect().left
      )
    ).toBe(0);
  });
});

describe('loop, controlled by a parent that refuses', () => {
  test('a step across the seam it refuses comes back the short way', async () => {
    const onIndexChange = vi.fn();
    render(<TestDeck loop index={4} onIndexChange={onIndexChange} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const rest = viewport.scrollLeft;
    const seen: number[] = [];
    const onScroll = () => seen.push(viewport.scrollLeft - rest);
    viewport.addEventListener('scroll', onScroll);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expect.poll(() => onIndexChange.mock.calls).toEqual([[0]]);
    await expectSettledTo(() => viewport.scrollLeft, rest);
    viewport.removeEventListener('scroll', onScroll);
    expect(root.dataset.index).toBe('4');
    // After the jump onto slide 1, four slides back, it goes back one slide
    // across the seam: never through slides 2 to 4, a rewind.
    expect(seen.some((d) => Math.abs(d + 4 * WIDTH) < 1)).toBe(true);
    expect(seen.filter((d) => d > -3.5 * WIDTH && d < -0.5 * WIDTH)).toEqual(
      []
    );
  });
});

describe('loop, controlled by a parent that sets a new index', () => {
  test('across the seam, the deck goes the direct way, within the slides', async () => {
    const { rerender } = render(<TestDeck loop index={4} />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    const rest = viewport.scrollLeft;
    const seen: number[] = [];
    const onScroll = () => seen.push(viewport.scrollLeft - rest);
    viewport.addEventListener('scroll', onScroll);

    rerender(<TestDeck loop index={0} />);

    await expectSettledTo(() => root.dataset.index, '0');
    viewport.removeEventListener('scroll', onScroll);
    // Back through slides 4 to 2, never on across the seam.
    expect(seen.every((d) => d <= 0 && d >= -4 * WIDTH)).toBe(true);
    expect(viewport.scrollLeft - rest).toBe(-4 * WIDTH);
  });
});

describe('loop in an engine without scrollend', () => {
  withoutScrollEnd();

  test('Next twelve times 40ms apart never hangs, and leaves snapping on', async () => {
    const { viewport, root, next, onIndexChange } = renderLoop({
      defaultIndex: 3
    });

    for (let i = 0; i < 12; i++) {
      next.click();
      await sleep(40);
    }

    await expectRestOnASlide(viewport, root, onIndexChange);
  });

  test('Prev on the first snap point still crosses the seam', async () => {
    expect('onscrollend' in window).toBe(false);
    const { prev, onIndexChange, offsetOf } = renderLoop();

    await userEvent.click(prev);

    await expectSettledTo(() => onIndexChange.mock.calls, [[4]]);
    expect(offsetOf('5 of 5')).toBe(0);
  });
});

describe('loop along each axis and writing direction', () => {
  const HEIGHT = 200;

  /** A looping deck of five slides, each the viewport's size. */
  function AxisDeck({
    vertical = false,
    rtl = false,
    ...props
  }: Parameters<typeof Deck.Root>[0] & { vertical?: boolean; rtl?: boolean }) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <Deck.Root
          aria-label="Test deck"
          loop
          orientation={vertical ? 'vertical' : 'horizontal'}
          {...props}
        >
          <Deck.Prev />
          <Deck.Viewport style={{ width: WIDTH, height: HEIGHT }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
            ))}
          </Deck.Viewport>
          <Deck.Next />
        </Deck.Root>
      </div>
    );
  }

  /** How far a slide's start edge is from the viewport's, the way the deck
   * runs. */
  const startOf = (label: string, vertical: boolean, rtl: boolean) => {
    const viewport = document.querySelector('[data-carouseldeck-viewport]')!;
    const box = screen.getByRole('group', { name: label });
    const [a, b] = [
      box.getBoundingClientRect(),
      viewport.getBoundingClientRect()
    ];
    return Math.round(
      vertical ? a.top - b.top : rtl ? b.right - a.right : a.left - b.left
    );
  };

  for (const [name, vertical, rtl] of [
    ['vertical', true, false],
    ['right-to-left', false, true]
  ] as const) {
    test(`${name}: Next on the last slide crosses to the first, and Prev back`, async () => {
      const onIndexChange = vi.fn();
      render(
        <AxisDeck
          vertical={vertical}
          rtl={rtl}
          defaultIndex={4}
          onIndexChange={onIndexChange}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
      expect(startOf('1 of 5', vertical, rtl)).toBe(0);

      await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await expectSettledTo(() => onIndexChange.mock.calls, [[0], [4]]);
      expect(startOf('5 of 5', vertical, rtl)).toBe(0);
    });

    test(`${name}: a mouse drag back from the first slide crosses to the last`, async () => {
      const onIndexChange = vi.fn();
      render(
        <AxisDeck vertical={vertical} rtl={rtl} onIndexChange={onIndexChange} />
      );
      const viewport = document.querySelector('[data-carouseldeck-viewport]')!;

      // Toward the deck's end: down, or in right-to-left, to the left.
      // Most of a slide, held still before letting go: no flick.
      await mouseDrag(viewport, rtl ? -(WIDTH * 0.6) : HEIGHT * 0.6, {
        axis: vertical ? 'y' : 'x',
        holdMs: 150
      });

      await expectSettledTo(() => onIndexChange.mock.calls, [[4]]);
      expect(startOf('5 of 5', vertical, rtl)).toBe(0);
    });
  }
});

describe("loop and the deck's other features", () => {
  beforeEach(parkMouse);

  test('a mouse flick forward from the last slide crosses to the first', async () => {
    const { viewport, onIndexChange, offsetOf } = renderLoop({
      defaultIndex: 4
    });

    // A short, quick flick: on one snap point, across the seam.
    await mouseDrag(viewport, -60, { steps: 4, stepMs: 10 });

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    expect(offsetOf('1 of 5')).toBe(0);
  });

  test('every slide and copy in view has its progress through a seam crossing', async () => {
    const { viewport, next } = renderLoop({ defaultIndex: 4 });
    const run = [
      ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
    ];
    const box = viewport.getBoundingClientRect();
    // Each frame: every slide or copy in view, as its distance from the
    // viewport's start in slides, and the progress it carries.
    const frames: [number, number][][] = [];
    let copyAtStart = false;
    let done = false;
    const sample = () => {
      const frame: [number, number][] = [];
      for (const slide of run) {
        const at = (slide.getBoundingClientRect().left - box.left) / WIDTH;
        if (at <= -1 || at >= 1) continue;
        frame.push([
          at,
          Number(slide.style.getPropertyValue('--deck-slide-progress'))
        ]);
        if (
          Math.abs(at) < 0.01 &&
          slide.hasAttribute('data-carouseldeck-copy')
        ) {
          copyAtStart = true;
        }
      }
      frames.push(frame);
      if (!done) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    await userEvent.click(next);
    await expect
      .poll(() => viewport.closest('[data-index]')?.getAttribute('data-index'))
      .toBe('0');
    await sleep(300);
    done = true;
    await nextFrame();

    // It came to rest on a copy before the jump.
    expect(copyAtStart).toBe(true);
    for (const frame of frames) {
      for (const [at, progress] of frame) {
        // A frame's paint can trail the scroll by one frame's worth.
        expect(Math.abs(progress - at)).toBeLessThan(0.25);
      }
    }
    // At rest, the slide at the start is the first, and its neighbours are
    // the copies either side.
    expect(frames.at(-1)!.map(([, progress]) => progress)).toEqual([0]);
  });

  test('centred, the copy of the last slide shows before the first, which is focal', async () => {
    addStyle(CENTRED);
    const onFocalChange = vi.fn();
    const { viewport, root } = renderLoop({
      viewportClassName: 'centred',
      onFocalChange
    });
    await sleep(100);

    const focal = viewport.querySelector('[data-focal]')!;
    expect(focal.getAttribute('aria-label')).toBe('1 of 5');
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return Math.round((r.left + r.right) / 2);
    };
    expect(centre(focal)).toBe(centre(viewport));
    const before = viewport.querySelector(
      '[data-carouseldeck-copy=before][aria-label="5 of 5"]'
    )!;
    expect(before.hasAttribute('data-in-view')).toBe(true);
    expect(
      Number(
        (before as HTMLElement).style.getPropertyValue('--deck-slide-progress')
      )
    ).toBeCloseTo(-1, 1);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await expectSettledTo(() => onFocalChange.mock.calls, [[4]]);
    expect(root.dataset.index).toBe('4');
  });

  test('with click-to-focus, clicking a copy in view brings its slide to focus across the seam', async () => {
    addStyle(CENTRED);
    const { viewport, onIndexChange } = renderLoop({
      viewportClassName: 'centred',
      clickToFocus: true
    });
    await sleep(100);
    const start = viewport.scrollLeft;
    let firstMove: number | null = null;
    viewport.addEventListener(
      'scroll',
      () => {
        firstMove ??= viewport.scrollLeft - start;
      },
      { once: true }
    );
    const copy = viewport
      .querySelector('[data-carouseldeck-copy=before][aria-label="5 of 5"]')!
      .getBoundingClientRect();
    const x = copy.right - 10;
    const y = (copy.top + copy.bottom) / 2;

    await mouseAt('mousePressed', x, y, 1);
    await mouseAt('mouseReleased', x, y, 0);

    await expectSettledTo(() => onIndexChange.mock.calls, [[4]]);
    // Back one slide, not on through the other four.
    expect(firstMove).toBeLessThan(0);
  });
});

describe('loop with an effect', () => {
  function EffectDeck({
    effect,
    slides = 4,
    ...props
  }: Parameters<typeof Deck.Root>[0] & {
    effect: Deck.Effect;
    slides?: number;
  }) {
    return (
      <Deck.Root aria-label="Test deck" loop {...props}>
        <Deck.Prev />
        <Deck.Viewport
          effect={effect}
          className="effect"
          style={{ width: WIDTH, height: 200 }}
        >
          {Array.from({ length: slides }, (_, i) => (
            <Deck.Slide key={i}>
              <div className="card">Slide {i + 1}</div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
  }

  const runOf = (viewport: HTMLElement) => [
    ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
  ];
  const opacityOf = (el: Element) => Number(getComputedStyle(el).opacity);

  test('fade crossfades from the last slide to the first, with a copy, and never flashes', async () => {
    const onIndexChange = vi.fn();
    render(
      <EffectDeck
        effect={fade}
        defaultIndex={3}
        onIndexChange={onIndexChange}
      />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    const run = runOf(viewport);
    const slides = run.filter(
      (el) => !el.hasAttribute('data-carouseldeck-copy')
    );
    expect(run).toHaveLength(12);
    // A copy is stacked with the slides, as every slide of a fade is.
    const box = viewport.getBoundingClientRect();
    for (const el of run) {
      expect(Math.round(el.getBoundingClientRect().left - box.left)).toBe(0);
    }
    // Each frame, how much of a slide shows in all: one slide, or two
    // crossfading, never more nor less.
    const shown: number[] = [];
    let done = false;
    const sample = () => {
      shown.push(run.reduce((sum, el) => sum + opacityOf(el), 0));
      if (!done) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
    done = true;
    await nextFrame();
    expect(slides.map(opacityOf)).toEqual([1, 0, 0, 0]);
    for (const total of shown) expect(total).toBeCloseTo(1, 1);
    expect(slides[0].hasAttribute('inert')).toBe(false);
    expect(run.filter((el) => !el.hasAttribute('inert'))).toEqual([slides[0]]);
  });

  test('curve draws a copy in view on the arc, as its place in the run puts it', async () => {
    addStyle(`.effect > [data-carouseldeck-slide] {
      width: 100px;
      scroll-snap-align: center;
    }
    .card { height: 100%; }`);
    const onIndexChange = vi.fn();
    render(
      <EffectDeck effect={curve} slides={6} onIndexChange={onIndexChange} />
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    const angle = (el: Element) => {
      const m = new DOMMatrix(
        getComputedStyle(el.firstElementChild!).transform
      );
      return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
    };
    const copyOfLast = () =>
      viewport.querySelector(
        '[data-carouseldeck-copy=before][aria-label="6 of 6"]'
      )!;
    const slide = (n: number) =>
      screen.getByRole('group', { name: `${n} of 6` });
    await sleep(100);

    // Before the first slide, the last slide's copy turns as the second
    // slide does, the other way.
    const turn = angle(slide(2));
    expect(turn).toBeGreaterThan(0);
    expect(angle(slide(1))).toBe(0);
    expect(angle(copyOfLast())).toBe(-turn);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));

    await expectSettledTo(() => onIndexChange.mock.calls, [[5]]);
    expect(angle(slide(6))).toBe(0);
    expect(angle(slide(5))).toBe(-turn);
  });
});

describe('loop in synced decks', () => {
  // A main deck that loops, and a strip of thumbnails sharing its index, as
  // in the Thumbnails story.
  function Synced() {
    const [index, setIndex] = useState(3);
    return (
      <>
        <TestDeck loop slides={4} index={index} onIndexChange={setIndex} />
        <Deck.Root aria-label="Thumbnails">
          <Deck.Viewport style={{ width: WIDTH }}>
            {Array.from({ length: 4 }, (_, i) => (
              <Deck.Slide key={i} style={{ width: '25%' }}>
                <button
                  type="button"
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => setIndex(i)}
                >
                  Thumb {i + 1}
                </button>
              </Deck.Slide>
            ))}
          </Deck.Viewport>
        </Deck.Root>
      </>
    );
  }

  test('a step across the seam marks the first thumbnail, and a thumbnail moves the deck', async () => {
    render(<Synced />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const current = () =>
      screen
        .getByRole('region', { name: 'Thumbnails' })
        .querySelector('[aria-current]')?.textContent;
    expect(current()).toBe('Thumb 4');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expectSettledTo(current, 'Thumb 1');
    expect(root.dataset.index).toBe('0');

    await userEvent.click(screen.getByRole('button', { name: 'Thumb 3' }));

    await expectSettledTo(() => root.dataset.index, '2');
  });
});
