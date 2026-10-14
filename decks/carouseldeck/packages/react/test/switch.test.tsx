import { createRef, type ComponentProps, type Ref } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import {
  addStyle,
  expectSettledTo,
  mouseAt,
  nextFrame,
  sleep,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

// An app that picks `effect` or `loop` by breakpoint, as from a media query,
// switches them on a mounted deck. Loop's shells, a small deck's copies, or
// fade's stacked slides over snap targets, move the snap points under the
// viewport: the deck stays at its current index, as if it had mounted that
// way.

const SLIDES = 6;

type Layout = {
  effect?: Deck.Effect;
  loop?: boolean;
  autoplay?: number;
  handleRef?: Ref<Deck.RootHandle>;
  slides?: number;
};

type SwitchDeckProps = ComponentProps<typeof Deck.Root> & Layout;

/** Two slides in view, 50% wide, unless an effect stacks them. */
function SwitchDeck({ effect, slides = SLIDES, ...props }: SwitchDeckProps) {
  return (
    <Deck.Root aria-label="Test deck" {...props}>
      <Deck.Viewport
        effect={effect}
        className="half"
        style={{ width: WIDTH, height: 100 }}
      >
        {Array.from({ length: slides }, (_, i) => (
          <Deck.Slide key={i}>
            <button type="button">Button {i + 1}</button>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Next />
    </Deck.Root>
  );
}

const renderSwitch = (defaultIndex: number, layout: Layout = {}) => {
  addStyle('.half > [data-carouseldeck-slide] { width: 50%; }');
  const onIndexChange = vi.fn();
  const { rerender } = render(
    <SwitchDeck
      defaultIndex={defaultIndex}
      onIndexChange={onIndexChange}
      {...layout}
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  return {
    root,
    viewport,
    onIndexChange,
    next: screen.getByRole('button', { name: 'Next' }),
    switchTo: (next: Layout) =>
      rerender(
        <SwitchDeck
          defaultIndex={defaultIndex}
          onIndexChange={onIndexChange}
          {...next}
        />
      ),
    live: () => root.querySelector('[data-carouseldeck-live]')?.textContent
  };
};

/**
 * Where the deck rests, as `[index, current slide, offset]`: the offset is
 * from the viewport's start to the box slide `index` snaps by -- its own
 * mid shell (ADR-0013), a small deck's copy, or, where an effect stacks the
 * slides, its snap target. 0 when the deck rests on the snap point of that
 * slide, a slide, never a copy.
 */
const restOf = (root: HTMLElement, viewport: HTMLElement, index: number) => {
  const targets = viewport.querySelectorAll(
    ':scope > [data-carouseldeck-snap-target]'
  );
  const slides = viewport.querySelectorAll(
    ':scope > [data-carouseldeck-slide]:not([data-carouseldeck-copy])'
  );
  // With loop and a stacked effect, the targets are the shells themselves,
  // all five sets of them (ADR-0013): the own set starts two sets in, not
  // after a small deck's own copies before (always 0, with shells).
  const stackedShells =
    targets.length > 0 && targets[0].hasAttribute('data-carouseldeck-shell');
  const before = stackedShells
    ? 2 * slides.length
    : viewport.querySelectorAll(':scope > [data-carouseldeck-copy=before]')
        .length;
  const midShells = viewport.querySelectorAll(
    ':scope > [data-carouseldeck-shell="0"]'
  );
  const box =
    targets.length > 0
      ? targets[before + index]
      : midShells.length > 0
        ? midShells[index]
        : slides[index];
  const current = root.querySelector('[data-current]');
  return [
    root.dataset.index,
    current?.hasAttribute('data-carouseldeck-copy')
      ? 'a copy'
      : current?.getAttribute('aria-label'),
    Math.round(
      box.getBoundingClientRect().left - viewport.getBoundingClientRect().left
    )
  ];
};

describe('switching effect or loop on a mounted deck', () => {
  test.each([1, 3])(
    'keeps the deck at rest at index %i, from none to fade, curve and none',
    async (index) => {
      const { root, viewport, onIndexChange, switchTo, live } =
        renderSwitch(index);
      const rest = () => restOf(root, viewport, index);
      const at = [String(index), `${index + 1} of ${SLIDES}`, 0];
      expect(rest()).toEqual(at);

      for (const effect of [fade, curve, undefined]) {
        switchTo({ effect });
        // Before the browser paints the new layout.
        expect(rest()).toEqual(at);
        await expectSettledTo(rest, at);
      }

      expect(onIndexChange).not.toHaveBeenCalled();
      expect(live()).toBe('');
    }
  );

  test.each([1, 3])(
    'keeps the deck at rest at index %i as loop turns on and off, with each effect',
    async (index) => {
      const { root, viewport, onIndexChange, switchTo, live } =
        renderSwitch(index);
      const rest = () => restOf(root, viewport, index);
      const at = [String(index), `${index + 1} of ${SLIDES}`, 0];

      for (const layout of [
        { loop: true },
        { loop: false },
        { effect: fade },
        { effect: fade, loop: true },
        { effect: fade },
        { effect: curve, loop: true },
        { effect: curve }
      ]) {
        switchTo(layout);
        expect(rest()).toEqual(at);
        await expectSettledTo(rest, at);
      }

      expect(onIndexChange).not.toHaveBeenCalled();
      expect(live()).toBe('');
    }
  );

  test.each([1, 3])(
    'keeps the deck at rest at index %i when effect and loop switch together',
    async (index) => {
      const { root, viewport, onIndexChange, switchTo, live } = renderSwitch(
        index,
        { loop: true }
      );
      const rest = () => restOf(root, viewport, index);
      const at = [String(index), `${index + 1} of ${SLIDES}`, 0];

      for (const layout of [
        { effect: fade },
        { loop: true },
        { effect: curve },
        { effect: fade, loop: true },
        { loop: true }
      ]) {
        switchTo(layout);
        expect(rest()).toEqual(at);
        await expectSettledTo(rest, at);
      }

      expect(onIndexChange).not.toHaveBeenCalled();
      expect(live()).toBe('');
    }
  );

  test('with a move in flight, the deck ends at the move’s target', async () => {
    const { root, viewport, onIndexChange, next, switchTo } = renderSwitch(1);

    // Next starts a move; the switch comes in the same task, before it ends.
    next.click();
    switchTo({ effect: fade, loop: true });

    await expectSettledTo(
      () => restOf(root, viewport, 2),
      ['2', `3 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });

  test('turned off with a move across the seam in flight, the deck ends on the slide the move went to', async () => {
    const { root, viewport, onIndexChange, next, switchTo } = renderSwitch(5, {
      loop: true
    });

    // Next from the last slide heads for the first slide's shell after them.
    next.click();
    switchTo({ effect: fade });

    await expectSettledTo(
      () => restOf(root, viewport, 0),
      ['0', `1 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[0]]);
  });

  test('with fewer snap points, rests on the last one and reports it', async () => {
    // Fade has a snap point per slide; two slides in view, without loop,
    // have one fewer: the last two slides share the last.
    const { root, viewport, onIndexChange, switchTo, live } = renderSwitch(5, {
      effect: fade
    });

    switchTo({});

    expect(restOf(root, viewport, 4)).toEqual(['4', `5 of ${SLIDES}`, 0]);
    await expectSettledTo(
      () => restOf(root, viewport, 4),
      ['4', `5 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[4]]);
    expect(live()).toBe(`Slide 5 of ${SLIDES}`);
  });

  test('with a pointer held still on the deck, keeps its place once the pointer lets go', async () => {
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(2);
    const at = ['2', `3 of ${SLIDES}`, 0];
    const box = viewport.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.bottom - 10;

    await mouseAt('mousePressed', x, y, 1);
    switchTo({ effect: fade });
    await sleep(300);
    await mouseAt('mouseReleased', x, y, 0);

    await expectSettledTo(() => restOf(root, viewport, 2), at);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('with a pointer pressed during a move, rests on the move’s target once the pointer lets go', async () => {
    const { root, viewport, onIndexChange, next, switchTo } = renderSwitch(1);
    const box = viewport.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.bottom - 10;

    // A press that scrolls nothing leaves the move going; the switch comes
    // while it is in flight, and the move ends before the pointer lets go.
    next.click();
    await mouseAt('mousePressed', x, y, 1);
    switchTo({ effect: fade });
    await sleep(600);
    await mouseAt('mouseReleased', x, y, 0);

    await expectSettledTo(
      () => restOf(root, viewport, 2),
      ['2', `3 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });

  test('with a move in flight as the snap points grow in number, the deck ends at the move’s target', async () => {
    // Two slides in view, without loop, have five snap points; fade has six.
    const { root, viewport, onIndexChange, next, switchTo } = renderSwitch(3);

    next.click();
    switchTo({ effect: fade });

    await expectSettledTo(
      () => restOf(root, viewport, 4),
      ['4', `5 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[4]]);
  });

  test('with a move across the seam in flight as loop turns off and the snap points shrink in number, the deck ends on the slide the move went to', async () => {
    // Looping, two slides in view have a snap point each, six; without
    // loop, five.
    const { root, viewport, onIndexChange, next, switchTo } = renderSwitch(5, {
      loop: true
    });

    next.click();
    switchTo({});

    await expectSettledTo(
      () => restOf(root, viewport, 0),
      ['0', `1 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[0]]);
  });

  test('a step after the switch, with the move still in flight, goes on from the move’s target', async () => {
    // Through the handle: Next is disabled once a deck at its last slide
    // stops looping, until the move settles.
    const handle = createRef<Deck.RootHandle>();
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(5, {
      loop: true,
      handleRef: handle
    });

    // Next heads across the seam for the first slide; the second goes on
    // from there, to the second, in the new layout.
    handle.current!.next();
    switchTo({ handleRef: handle });
    handle.current!.next();

    await expectSettledTo(
      () => restOf(root, viewport, 1),
      ['1', `2 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  test('a move after the switch, with the move before it still in flight, ends where it goes in the new layout', async () => {
    const handle = createRef<Deck.RootHandle>();
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(3, {
      handleRef: handle
    });

    // The first move heads for the last of five snap points; the second
    // goes on to a sixth, which only fade has.
    handle.current!.next();
    switchTo({ effect: fade, handleRef: handle });
    handle.current!.next();

    await expectSettledTo(
      () => restOf(root, viewport, 5),
      ['5', `6 of ${SLIDES}`, 0]
    );
    expect(onIndexChange.mock.calls).toEqual([[5]]);
  });

  test.each([1, 3])(
    'keeps the deck at rest at index %i as autoplay turns on and off',
    async (index) => {
      const { root, viewport, onIndexChange, switchTo, live } =
        renderSwitch(index);
      const rest = () => restOf(root, viewport, index);
      const at = [String(index), `${index + 1} of ${SLIDES}`, 0];

      for (const layout of [
        { autoplay: 60_000 },
        {},
        { autoplay: 60_000, effect: fade, loop: true },
        { effect: fade, loop: true },
        { autoplay: 60_000 }
      ]) {
        switchTo(layout);
        expect(rest()).toEqual(at);
        await expectSettledTo(rest, at);
      }

      expect(onIndexChange).not.toHaveBeenCalled();
      expect(live()).toBe('');
    }
  );
});

// Chromium sends no `scrollend` for the scroll a shorter scroll range makes,
// only a `scrollsnapchange`, and after a touch fling on another scroller was
// cut short, as when a page leaves mid-fling, not even that (#87). These
// withhold a scroll's end events from the deck, so the end never comes.
describe('a new layout and a scroll whose end event never comes', () => {
  const withholdEnds = (viewport: HTMLElement) => {
    const withhold = (event: Event) => event.stopImmediatePropagation();
    const ends = ['scrollend', 'scrollsnapchange'];
    for (const type of ends) {
      viewport.addEventListener(type, withhold, { capture: true });
    }
    return () => {
      for (const type of ends) {
        viewport.removeEventListener(type, withhold, { capture: true });
      }
    };
  };

  const renderDeck = (slides: number, defaultIndex = 0) => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <TestDeck
        slides={slides}
        defaultIndex={defaultIndex}
        onIndexChange={onIndexChange}
      />
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    return {
      root,
      viewport: viewportOf(root),
      onIndexChange,
      relayout: (next: number, layout: { loop?: boolean } = {}) =>
        rerender(
          <TestDeck
            slides={next}
            defaultIndex={defaultIndex}
            onIndexChange={onIndexChange}
            {...layout}
          />
        )
    };
  };

  test('right after slides shrink past the deck, an effect switch keeps it at rest', async () => {
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(5, {
      effect: fade
    });
    withholdEnds(viewport);

    switchTo({ effect: fade, slides: 4 });
    expect(onIndexChange.mock.calls).toEqual([[3]]);
    // The shrink's scroll has come, with no end event.
    await nextFrame();
    await nextFrame();
    // Two slides in view: 4 slides have 3 snap points without fade.
    switchTo({ slides: 4 });

    const at = ['2', '3 of 4', 0];
    // Before the browser paints the new layout.
    expect(restOf(root, viewport, 2)).toEqual(at);
    await expectSettledTo(() => restOf(root, viewport, 2), at);
    expect(onIndexChange.mock.calls).toEqual([[3], [2]]);
  });

  test('an effect switch under a pointer held still keeps the deck’s place once it lets go', async () => {
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(2);
    withholdEnds(viewport);
    const box = viewport.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.bottom - 10;

    await mouseAt('mousePressed', x, y, 1);
    switchTo({ effect: fade });
    // Where the browser puts the viewport for the new layout, as Chromium
    // puts it after a touch fling on another scroller was cut short: at
    // the start, a scroll with no end event.
    viewport.scrollLeft = 0;
    await sleep(300);
    await mouseAt('mouseReleased', x, y, 0);

    const at = ['2', `3 of ${SLIDES}`, 0];
    await expectSettledTo(() => restOf(root, viewport, 2), at);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('a new layout during the user’s scroll waits for its end, though quiet comes first', async () => {
    const { viewport, onIndexChange, relayout } = renderDeck(5);
    const release = withholdEnds(viewport);

    // As a trackpad scroll whose fingers rest on the pad: no scroll event
    // for a while, and no end event yet.
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaX: 100 }));
    viewport.scrollLeft = 2 * WIDTH;
    await nextFrame();
    await nextFrame();
    relayout(6);
    await sleep(400);

    expect(onIndexChange).not.toHaveBeenCalled();
    release();
    viewport.dispatchEvent(new Event('scrollend'));
    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });

  test('a new layout during a scroll of the page’s settles at quiet, though input that scrolls nothing comes', async () => {
    const { viewport, onIndexChange, relayout } = renderDeck(5);
    withholdEnds(viewport);

    viewport.scrollLeft = 2 * WIDTH;
    await nextFrame();
    await nextFrame();
    relayout(6);
    // A vertical wheel over a horizontal deck scrolls nothing in it.
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    await sleep(400);

    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });

  test('once the shrink’s scroll has ended, a scroll event reads no position', async () => {
    const { viewport, relayout } = renderDeck(6, 4);

    relayout(2);
    await nextFrame();
    await nextFrame();
    // The shrink's scroll ends, as Chromium ends it with `scrollsnapchange`.
    viewport.dispatchEvent(new Event('scrollend'));
    await sleep(500);
    let reads = 0;
    const { get, set } = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollLeft'
    )!;
    Object.defineProperty(viewport, 'scrollLeft', {
      configurable: true,
      get() {
        reads++;
        return get!.call(this);
      },
      set(value: number) {
        set!.call(this, value);
      }
    });
    viewport.dispatchEvent(new Event('scroll'));
    delete (viewport as { scrollLeft?: number }).scrollLeft;

    expect(reads).toBe(0);
  });

  // A vertical wheel over a horizontal deck at rest scrolls nothing in it:
  // a scroll long after is not the user's.
  const wheelThatScrollsNothing = async (viewport: HTMLElement) => {
    // At rest: the mount's own refreshes are done.
    await sleep(300);
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
    await sleep(300);
  };

  test('after input that scrolled nothing, an effect switch under a pointer held still keeps the deck’s place', async () => {
    const { root, viewport, onIndexChange, switchTo } = renderSwitch(2);
    withholdEnds(viewport);
    await wheelThatScrollsNothing(viewport);
    const box = viewport.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.bottom - 10;

    await mouseAt('mousePressed', x, y, 1);
    switchTo({ effect: fade });
    viewport.scrollLeft = 0;
    await sleep(300);
    await mouseAt('mouseReleased', x, y, 0);

    const at = ['2', `3 of ${SLIDES}`, 0];
    await expectSettledTo(() => restOf(root, viewport, 2), at);
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('after input that scrolled nothing, a new layout during a scroll of the page’s settles at quiet', async () => {
    const { viewport, onIndexChange, relayout } = renderDeck(5);
    withholdEnds(viewport);
    await wheelThatScrollsNothing(viewport);

    viewport.scrollLeft = 2 * WIDTH;
    await nextFrame();
    await nextFrame();
    relayout(6);
    await sleep(400);

    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });
});
