import { Profiler, useEffect, useRef, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { createDeck, type DeckState } from '@carouseldeck/core';
import {
  addStyle,
  CENTRED,
  expectRestOnASlide,
  expectSettledTo,
  nextFrame,
  pagesOf,
  placementPath,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';
import { mouse } from './mouse';

// One instance (ADR-0013): each slide's children mount exactly once, over
// empty, inert shells that carry the snap points on each side of them,
// instead of copies; a deck whose set of slides is too narrow for a shell
// to have room beside its own slide falls back to copies instead.

type ShellDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportClassName?: string;
  /** The viewport's width (horizontal) or width and height (vertical);
   * `WIDTH` unless given. */
  width?: number;
};

/** A deck with no stylesheet beyond the consumer's own. Unlike `TestDeck`
 * (`fixtures.tsx`), its viewport can take a height, for a vertical deck. */
function ShellDeck({
  slides = 5,
  viewportClassName,
  orientation,
  width = WIDTH,
  ...props
}: ShellDeckProps) {
  const vertical = orientation === 'vertical';
  return (
    <Deck.Root aria-label="Test deck" orientation={orientation} {...props}>
      <Deck.Prev />
      <Deck.Viewport
        className={viewportClassName}
        style={vertical ? { width, height: 200 } : { width }}
      >
        {Array.from({ length: slides }, (_, i) => (
          <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Next />
    </Deck.Root>
  );
}

const renderShells = (
  props: ShellDeckProps = {},
  { dir }: { dir?: 'ltr' | 'rtl' } = {}
) => {
  const onIndexChange = vi.fn();
  const tree = <ShellDeck loop onIndexChange={onIndexChange} {...props} />;
  const { unmount } = render(
    dir === 'rtl' ? <div dir="rtl">{tree}</div> : tree
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { root, viewport: viewportOf(root), onIndexChange, unmount };
};

const slidesIn = (viewport: HTMLElement) => [
  ...viewport.querySelectorAll<HTMLElement>(
    ':scope > [data-carouseldeck-slide]'
  )
];

const shellsAt = (viewport: HTMLElement, set: number) => [
  ...viewport.querySelectorAll<HTMLElement>(
    `:scope > [data-carouseldeck-shell="${set}"]`
  )
];

const axisStart = (el: Element, vertical: boolean) => {
  const rect = el.getBoundingClientRect();
  return vertical ? rect.top : rect.left;
};

/** Asserts which placement path actually ran (ADR-0013, #145): one
 * placement animation, on a `ScrollTimeline`, on the CSS path; none on the
 * JS path. Every test parameterised over `['css', 'js']` asserts this
 * first, so a stub that silently failed to force the JS path is never
 * mistaken for the two paths agreeing. */
function expectPlacementPath(viewport: HTMLElement, path: 'css' | 'js') {
  const [slide] = slidesIn(viewport);
  const animated = slide
    .getAnimations()
    .some((animation) => animation.timeline instanceof ScrollTimeline);
  expect(animated).toBe(path === 'css');
}

describe('one instance: structure', () => {
  test('children mount once, and a ref callback points at the one element', async () => {
    const mounts: number[] = [];
    const refs: (HTMLElement | null)[] = [];
    function Probe({ index }: { index: number }) {
      const mounted = useRef(false);
      useEffect(() => {
        if (mounted.current) return;
        mounted.current = true;
        mounts[index] = (mounts[index] ?? 0) + 1;
      }, [index]);
      return (
        <div
          data-testid={`probe-${index}`}
          ref={(el) => {
            refs[index] = el;
          }}
        />
      );
    }
    render(
      <Deck.Root aria-label="Test deck" loop>
        <Deck.Viewport style={{ width: WIDTH }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>
              <Probe index={i} />
            </Deck.Slide>
          ))}
        </Deck.Viewport>
      </Deck.Root>
    );
    await sleep(100);

    expect(mounts).toEqual([1, 1, 1, 1, 1]);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const probes = [...root.querySelectorAll('[data-testid^="probe-"]')];
    expect(probes).toHaveLength(5);
    refs.forEach((el, i) => expect(el).toBe(probes[i]));
  });

  test("getAllByRole reads the slides' labels, 1 to n, in order", async () => {
    renderShells();
    await sleep(100);

    const groups = screen.getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      '1 of 5',
      '2 of 5',
      '3 of 5',
      '4 of 5',
      '5 of 5'
    ]);
  });

  test('there are 25 shells, each aria-hidden, inert, with no children', async () => {
    const { viewport } = renderShells();
    await sleep(100);

    const shells = [
      ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-shell]')
    ];
    expect(shells).toHaveLength(25);
    for (const shell of shells) {
      expect(shell.getAttribute('aria-hidden')).toBe('true');
      expect(shell.inert).toBe(true);
      expect(shell.childElementCount).toBe(0);
    }
  });

  const geometryCases: [
    string,
    ShellDeckProps,
    { css?: string; dir?: 'rtl' }
  ][] = [
    ['default', {}, {}],
    ['centred', { viewportClassName: 'centred' }, { css: CENTRED }],
    [
      'paged, 10 over 3',
      { slides: 10, viewportClassName: 'pages' },
      { css: pagesOf(3) }
    ],
    ['vertical', { orientation: 'vertical' }, {}],
    ['rtl', {}, { dir: 'rtl' }]
  ];

  for (const [name, props, opts] of geometryCases) {
    test(`shell (k, i) sits at slide i's home (its mid shell) plus k times the run length (${name})`, async () => {
      if (opts.css) addStyle(opts.css);
      const { viewport } = renderShells(props, { dir: opts.dir });
      await sleep(100);

      const vertical = props.orientation === 'vertical';
      const slides = slidesIn(viewport);
      const mid = shellsAt(viewport, 0);
      const after = shellsAt(viewport, 1);
      expect(mid).toHaveLength(slides.length);
      expect(after).toHaveLength(slides.length);
      // L, measured directly from two consecutive sets' shells: the
      // relationship below is then checked against it, not against the
      // formula that produced it.
      const length =
        axisStart(after[0], vertical) - axisStart(mid[0], vertical);
      expect(Math.abs(length)).toBeGreaterThan(1);
      // Against the mid shell, slide i's own home: with placement live, a
      // slide away from the viewport sits nearest
      // whichever slot that is, not always its own, so its current rect
      // is no longer a stand-in for its home.
      for (let set = -2; set <= 2; set++) {
        const shells = shellsAt(viewport, set);
        mid.forEach((home, i) => {
          expect(
            Math.abs(
              axisStart(shells[i], vertical) -
                (axisStart(home, vertical) + set * length)
            )
          ).toBeLessThan(1);
        });
      }
    });
  }

  test("real slides read scroll-snap-align none; each shell carries its slide's alignment", async () => {
    addStyle(pagesOf(3));
    const { viewport } = renderShells({
      slides: 10,
      viewportClassName: 'pages'
    });
    await sleep(100);

    const slides = slidesIn(viewport);
    for (const slide of slides) {
      expect(getComputedStyle(slide).scrollSnapAlign).toBe('none');
    }
    const expected = slides.map((_, i) => (i % 3 === 0 ? 'start' : 'none'));
    for (let set = -2; set <= 2; set++) {
      const shells = shellsAt(viewport, set);
      shells.forEach((shell, i) => {
        expect(getComputedStyle(shell).scrollSnapAlign).toBe(expected[i]);
      });
    }
  });

  test('Next, then Prev, within the slides, settle and report', async () => {
    const { root, onIndexChange } = renderShells({ defaultIndex: 1 });
    const next = screen.getByRole('button', { name: 'Next' });
    const prev = screen.getByRole('button', { name: 'Previous' });

    await userEvent.click(next);
    await expectSettledTo(() => onIndexChange.mock.calls, [[2]]);
    expect(root.dataset.index).toBe('2');

    await userEvent.click(prev);
    await expectSettledTo(() => onIndexChange.mock.calls, [[2], [1]]);
    expect(root.dataset.index).toBe('1');
  });
});

// #145: the rest a mount settles to is the same whichever path placed it.
describe.each(['css', 'js'] as const)(
  'one instance: structure, rests at defaultIndex (%s)',
  (path) => {
    test('rests at defaultIndex, with the slide there at offset 0', async () => {
      placementPath(path);
      const { root, viewport } = renderShells({ defaultIndex: 3 });
      await sleep(100);
      expectPlacementPath(viewport, path);

      const slide = screen.getByRole('group', { name: '4 of 5' });
      const offset = Math.round(
        slide.getBoundingClientRect().left -
          viewport.getBoundingClientRect().left
      );
      expect(offset).toBe(0);
      expect(root.dataset.index).toBe('3');
    });

    // #144 (ADR-0013): the mount's own scroll write may be dropped (WebKit,
    // the prototype's history) or never settle-debounced at all in a fast
    // test, so this checks the rest lands within two frames, not the ~100ms
    // a settle's debounce would otherwise hide behind.
    test('rests at defaultIndex within two frames, with no debounce to hide behind', async () => {
      placementPath(path);
      const { root, viewport } = renderShells({ defaultIndex: 3 });
      await nextFrame();
      await nextFrame();
      expectPlacementPath(viewport, path);

      const slide = screen.getByRole('group', { name: '4 of 5' });
      const offset = Math.round(
        slide.getBoundingClientRect().left -
          viewport.getBoundingClientRect().left
      );
      expect(offset).toBe(0);
      expect(root.dataset.index).toBe('3');
    });
  }
);

// #144: a slide whose width is not a whole pixel (3 slides each
// `calc(100% / 3)` of a viewport whose own width is not divisible by 3)
// was given a shell rounded to the nearest whole pixel, through
// `offsetWidth`/`offsetHeight`: an `end`- or `center`-aligned rest could
// then land up to a pixel off. The shell's size now comes from the
// slide's own computed, subpixel, border-box size instead, still
// independent of any `translate` or `scale` a consumer writes.
describe.each(['css', 'js'] as const)(
  'one instance: subpixel sizes (%s)',
  (path) => {
    const thirds = (align: string) =>
      // Gap enough that the run clears the fallback-to-copies threshold too
      // (L >= viewport + widest slide), not only that it loops at all: three
      // slides each a third of the 1000px viewport are, on their own,
      // exactly a small deck, however large the viewport -- the gap is what
      // gives this one enough room to stay in shells, and the subpixel width
      // under test comes from the 1000px viewport not dividing evenly by 3,
      // independent of it.
      `.thirds { column-gap: 180px; }
     .thirds > [data-carouseldeck-slide] { width: calc(100% / 3); scroll-snap-align: ${align}; }`;

    for (const align of ['end', 'center'] as const) {
      test(`a shell's width matches its slide's unscaled, subpixel width, and the rest lands within half a pixel after the seam and back (${align})`, async () => {
        placementPath(path);
        addStyle(thirds(align));
        const { root, viewport } = renderShells({
          slides: 3,
          viewportClassName: 'thirds',
          width: 1000
        });
        await sleep(100);
        expectPlacementPath(viewport, path);

        const slides = slidesIn(viewport);
        const mid = shellsAt(viewport, 0);
        const expected = 1000 / 3;
        slides.forEach((slide, i) => {
          expect(
            Math.abs(slide.getBoundingClientRect().width - expected)
          ).toBeLessThan(0.05);
          expect(
            Math.abs(mid[i].getBoundingClientRect().width - expected)
          ).toBeLessThan(0.05);
        });

        // The rest lands at the alignment point itself, within half a pixel:
        // for `end`, the slide's end flush with the viewport's; for
        // `center`, their centres level.
        const restOffset = () => {
          const v = viewport.getBoundingClientRect();
          const s = screen
            .getByRole('group', { name: '1 of 3' })
            .getBoundingClientRect();
          return align === 'end'
            ? s.right - v.right
            : (s.left + s.right) / 2 - (v.left + v.right) / 2;
        };
        expect(Math.abs(restOffset())).toBeLessThan(0.5);

        const next = screen.getByRole('button', { name: 'Next' });
        const prev = screen.getByRole('button', { name: 'Previous' });
        for (let i = 0; i < 3; i++) {
          await userEvent.click(next);
          await expectSettledTo(() => root.dataset.index, String((i + 1) % 3));
        }
        for (let i = 0; i < 3; i++) {
          await userEvent.click(prev);
          await expectSettledTo(() => root.dataset.index, String((2 - i) % 3));
        }

        expect(Math.abs(restOffset())).toBeLessThan(0.5);
      });
    }
  }
);

// #144 (ADR-0013): the rAF re-check after mount
// (`startFrame`, comparing `beforeStart`) ran for every deck, looping or
// not, shells or copies. It now runs only where the viewport is in shells
// mode at mount, so every other deck behaves exactly as it does on main.
describe('one instance: the start re-check is scoped to shells', () => {
  test('a deck without loop, with defaultIndex set, gets no second restOn write after a dropped initial write', async () => {
    // Built directly on `@carouseldeck/core`, not through React, and
    // without mandatory snapping: a mandatory deck's own browser keeps the
    // position at a valid rest on its own (measured directly), so by the
    // time any script runs it is already resting somewhere valid, leaving
    // nothing for a drop to disturb; `resnap`'s own wait-for-quiet needs
    // mandatory snapping to engage at all, so a dropped write only has
    // something to correct, and this re-check something to do, without it.
    // Slide 0 carries no snap point of its own, so wherever the drop
    // leaves the position, it is not a rest either -- the position a
    // dropped write leaves a shells deck at, a buffer set's.
    const viewport = document.createElement('div');
    Object.assign(viewport.style, {
      display: 'flex',
      width: '300px',
      overflowX: 'auto',
      scrollSnapType: 'x proximity'
    });
    for (let i = 0; i < 5; i++) {
      const slide = document.createElement('div');
      slide.setAttribute('data-carouseldeck-slide', '');
      Object.assign(slide.style, {
        flexShrink: '0',
        width: '300px',
        height: '10px',
        scrollSnapAlign: i === 0 ? 'none' : 'start'
      });
      viewport.append(slide);
    }
    document.body.append(viewport);

    let calls = 0;
    const original = viewport.scrollTo.bind(viewport);
    viewport.scrollTo = ((...args: Parameters<typeof original>) => {
      calls++;
      // The first write is dropped, as WebKit can before the first paint:
      // a real call, that does not move the position.
      if (calls === 1) return;
      return original(...args);
    }) as typeof viewport.scrollTo;

    const engine = createDeck(viewport, {
      index: 2,
      onChange: () => {}
    });
    try {
      await nextFrame();
      await nextFrame();
    } finally {
      engine.destroy();
      viewport.remove();
    }

    expect(calls).toBe(1);
  });
});

// #144 (ADR-0013): placement over the seam. A real slide is translated onto
// whichever shell is nearest the viewport, the engine jumps a whole set at
// rest as it always has, and a press or wheel event on the shells shifts
// the deck a set the same way it does on copies. Progress and in-view
// follow the slot a slide is placed at, not its own untranslated place.

/** Runs `sample` every animation frame until the returned function is
 * called, which stops sampling. */
function sampleEveryFrame(sample: () => void) {
  let done = false;
  const tick = () => {
    sample();
    if (!done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    done = true;
  };
}

/**
 * Counts a "blank" frame (ported from the prototype's `tick`, ADR-0013):
 * every frame, `elementFromPoint` at the viewport's start, centre and end
 * (top, middle, bottom for a vertical deck), mid-way across the cross
 * axis. A shell is `inert`, which takes it out of hit-testing entirely, so
 * a gap over one never resolves to the shell itself: whatever is not a
 * real slide (the viewport, behind it, included) is the blank this
 * counts. The returned function stops sampling and reads the count.
 */
function countBlankFrames(viewport: HTMLElement, vertical: boolean) {
  let blanks = 0;
  const stop = sampleEveryFrame(() => {
    const rect = viewport.getBoundingClientRect();
    const across = vertical
      ? rect.left + rect.width / 2
      : rect.top + rect.height / 2;
    const points = vertical
      ? [
          { x: across, y: rect.top + 1 },
          { x: across, y: (rect.top + rect.bottom) / 2 },
          { x: across, y: rect.bottom - 1 }
        ]
      : [
          { x: rect.left + 1, y: across },
          { x: (rect.left + rect.right) / 2, y: across },
          { x: rect.right - 1, y: across }
        ];
    for (const { x, y } of points) {
      const el = document.elementFromPoint(x, y);
      if (!el?.closest('[data-carouseldeck-slide]')) blanks++;
    }
  });
  return () => {
    stop();
    return blanks;
  };
}

// #145: each real slide, in shells mode, carries one placement animation,
// on a `ScrollTimeline` sourced from the viewport, where the browser
// supports placing this way; none where it does not (`placementPath`
// stubs `CSS.supports` to force that). A shell or a spacer, never
// translated, carries no animation either way.
describe('one instance: placement path', () => {
  const pathCases: [string, ShellDeckProps, { dir?: 'rtl' }][] = [
    ['default', {}, {}],
    ['vertical', { orientation: 'vertical' }, {}],
    ['rtl', {}, { dir: 'rtl' }]
  ];

  for (const [name, props, opts] of pathCases) {
    test(`one animation per real slide, on a ScrollTimeline sourced from the viewport, none on a shell or spacer (${name})`, async () => {
      const { viewport } = renderShells(props, { dir: opts.dir });
      await sleep(100);

      for (const slide of slidesIn(viewport)) {
        const animations = slide.getAnimations();
        expect(animations).toHaveLength(1);
        expect(animations[0].timeline).toBeInstanceOf(ScrollTimeline);
        expect((animations[0].timeline as ScrollTimeline).source).toBe(
          viewport
        );
      }
      const notSlides = [
        ...viewport.querySelectorAll(
          '[data-carouseldeck-shell], [data-carouseldeck-spacer]'
        )
      ];
      expect(notSlides.length).toBeGreaterThan(0);
      for (const el of notSlides) expect(el.getAnimations()).toHaveLength(0);
    });

    test(`no placement animation on any real slide, forcing the JS path (${name})`, async () => {
      placementPath('js');
      const { viewport } = renderShells(props, { dir: opts.dir });
      await sleep(100);

      for (const slide of slidesIn(viewport)) {
        expect(slide.getAnimations()).toHaveLength(0);
      }
    });
  }
});

// #145: `ScrollTimeline.axis` is read-only once a timeline is made, so a
// live orientation change on the CSS path has to discard and remake every
// placer (`syncPlacers`'s own forgetting on a `placersVertical` mismatch),
// not just update its keyframes.
describe('one instance: setOrientation on a mounted looping deck', () => {
  test('the placers switch to the new axis, and a seam crossing in the new orientation shows no blank frame (css)', async () => {
    function OrientedDeck({
      orientation
    }: {
      orientation: 'horizontal' | 'vertical';
    }) {
      return <ShellDeck loop orientation={orientation} defaultIndex={4} />;
    }
    const { rerender } = render(<OrientedDeck orientation="horizontal" />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    await sleep(100);
    expectPlacementPath(viewport, 'css');
    for (const slide of slidesIn(viewport)) {
      const [animation] = slide.getAnimations();
      expect((animation.timeline as ScrollTimeline).axis).toBe('x');
    }

    rerender(<OrientedDeck orientation="vertical" />);
    await sleep(100);
    expectPlacementPath(viewport, 'css');
    for (const slide of slidesIn(viewport)) {
      const [animation] = slide.getAnimations();
      expect((animation.timeline as ScrollTimeline).axis).toBe('y');
    }

    const stopBlanks = countBlankFrames(viewport, true);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await sleep(600);

    expect(stopBlanks()).toBe(0);
  });
});

// #154: `placedAt` records a real slide's slot, offset and the axis'
// `sign` it ran under, but not which axis. `layoutShells` reads a slide's
// recorded offset back out as if it still ran along the current axis, so a
// translate `setOrientation` leaves along the old axis gets subtracted
// along the new one, corrupting L (a square viewport, `defaultIndex: 0`:
// L measured 3000, twice the true 1500) until a slide's slot next changes
// and overwrites it. The CSS-path test above does not catch it:
// `syncPlacers` already discards every placer on an axis mismatch, so the
// CSS path never reads `placedAt` for the truth; the JS path does.
describe.each(['css', 'js'] as const)(
  'one instance: setOrientation clears a stale translate (%s)',
  (path) => {
    function OrientedDeck({
      orientation,
      label = 'Test deck'
    }: {
      orientation: 'horizontal' | 'vertical';
      label?: string;
    }) {
      return (
        <Deck.Root
          aria-label={label}
          loop
          orientation={orientation}
          defaultIndex={0}
        >
          <Deck.Prev />
          <Deck.Viewport style={{ width: WIDTH, height: WIDTH }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
            ))}
          </Deck.Viewport>
          <Deck.Next />
        </Deck.Root>
      );
    }

    // Shell set 1 sits exactly L past shell set 0, for the same slide: the
    // run's own length, read back from the shells' own geometry rather
    // than any internal state.
    const lengthOf = (viewport: HTMLElement, vertical: boolean) =>
      axisStart(shellsAt(viewport, 1)[0], vertical) -
      axisStart(shellsAt(viewport, 0)[0], vertical);

    const offShells = (viewport: HTMLElement, vertical: boolean) =>
      slidesIn(viewport).flatMap((slide, i) => {
        const off = Math.min(
          ...[-2, -1, 0, 1, 2].map((set) =>
            Math.abs(
              axisStart(slide, vertical) -
                axisStart(shellsAt(viewport, set)[i], vertical)
            )
          )
        );
        return off < 0.5 ? [] : [{ slide: i, off }];
      });

    test('L is measured as a fresh mount would, every real slide sits over its own shell, and a seam crossing shows no blank frame', async () => {
      placementPath(path);
      const { rerender } = render(<OrientedDeck orientation="horizontal" />);
      const root = screen.getByRole('region', { name: 'Test deck' });
      const viewport = viewportOf(root);
      await sleep(100);
      expectPlacementPath(viewport, path);

      rerender(<OrientedDeck orientation="vertical" />);
      await sleep(100);
      expectPlacementPath(viewport, path);
      expect(offShells(viewport, true)).toEqual([]);

      const fresh = render(
        <OrientedDeck orientation="vertical" label="Fresh deck" />
      );
      const freshViewport = viewportOf(
        screen.getByRole('region', { name: 'Fresh deck' })
      );
      await sleep(100);
      expectPlacementPath(freshViewport, path);

      const switchedLength = lengthOf(viewport, true);
      const freshLength = lengthOf(freshViewport, true);
      fresh.unmount();
      expect(Math.abs(switchedLength - freshLength)).toBeLessThan(1);

      const stopBlanks = countBlankFrames(viewport, true);
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await sleep(600);
      expect(stopBlanks()).toBe(0);
    });
  }
);

// #154, the JS path only: `layoutShells` always recovers the true L in the
// end, however corrupted its first read -- `compensateShift`'s own re-measure
// on a length change reads it again, and whatever it writes next is always
// self-consistent, so a settle never leaves the wrong L on screen. What it
// does leave, while `placedAt` still disagrees with the new axis: every real
// slide's inline `translate` written once to a wrong value (computed from
// the corrupted L) and once more to its true one, both inside the same
// task, before anything paints -- not the single, direct write a correct
// axis switch needs. A `MutationObserver`'s `takeRecords`, read synchronously
// right after the switch, counts both.
describe('one instance: setOrientation never writes a wrong intermediate translate (js)', () => {
  test("each real slide's own translate is written at most once across the switch", async () => {
    placementPath('js');
    function OrientedDeck({
      orientation
    }: {
      orientation: 'horizontal' | 'vertical';
    }) {
      return (
        <Deck.Root
          aria-label="Test deck"
          loop
          orientation={orientation}
          defaultIndex={0}
        >
          <Deck.Prev />
          <Deck.Viewport style={{ width: WIDTH, height: WIDTH }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
            ))}
          </Deck.Viewport>
          <Deck.Next />
        </Deck.Root>
      );
    }
    const { rerender } = render(<OrientedDeck orientation="horizontal" />);
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    await sleep(100);
    expectPlacementPath(viewport, 'js');

    // A `MutationObserver` cannot see this: every write this test is after
    // happens inside one synchronous task, with no yield between a wrong
    // one and its own correction, so by the time any observer callback or
    // `takeRecords` runs, the attribute already reads its final value --
    // the churn in between already overwritten. Counting the real
    // `translate` setter's own calls, shadowed onto each slide's `style`
    // instance, sees every call as it happens instead; `setProperty` and
    // `getPropertyValue` reach the same underlying `translate` CSS
    // property as the shorthand this shadows.
    const slides = slidesIn(viewport) as HTMLElement[];
    const writes = new Map<HTMLElement, number>(
      slides.map((slide) => [slide, 0])
    );
    for (const slide of slides) {
      const { style } = slide;
      Object.defineProperty(style, 'translate', {
        configurable: true,
        get: () => style.getPropertyValue('translate'),
        set: (value: string) => {
          writes.set(slide, (writes.get(slide) ?? 0) + 1);
          style.setProperty('translate', value);
        }
      });
    }
    onTestFinished(() => {
      for (const slide of slides)
        delete (slide.style as { translate?: string }).translate;
    });

    rerender(<OrientedDeck orientation="vertical" />);

    for (const [slide, count] of writes) {
      expect(
        count,
        `translate writes on "${slide.textContent}"`
      ).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Counts how many times a real slide's own inline `translate` changes
 * (ADR-0013, #145's "no script per frame"): a `MutationObserver` on every
 * real slide's `style` attribute, stopped from a capture-phase `scrollend`
 * listener on `document` -- before the engine's own `scrollend` handler on
 * the viewport, and so before the settle's own pins -- draining anything
 * still pending with `takeRecords()` there, so a pin at the very settle is
 * never miscounted as the seam crossing's own script.
 */
function countTranslateWrites(viewport: HTMLElement) {
  const slides = slidesIn(viewport);
  const last = new Map<Element, string>(
    slides.map((slide) => [slide, slide.style.translate])
  );
  let changes = 0;
  const record = (target: Element) => {
    const value = (target as HTMLElement).style.translate;
    if (last.get(target) !== value) {
      last.set(target, value);
      changes++;
    }
  };
  const observer = new MutationObserver((records) => {
    for (const { target } of records) record(target as Element);
  });
  for (const slide of slides) {
    observer.observe(slide, { attributes: true, attributeFilter: ['style'] });
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const { target } of observer.takeRecords()) record(target as Element);
    observer.disconnect();
  };
  // `scrollsnapchange` reports a settled snap target no later than
  // `scrollend` (ADR-0013): the engine's own `onEnd` answers either one
  // first, so this stops at whichever fires first too.
  for (const type of ['scrollsnapchange', 'scrollend']) {
    document.addEventListener(type, stop, { capture: true, once: true });
  }
  return () => {
    stop();
    return changes;
  };
}

/** Samples a slide's own computed `translate` every frame, to confirm a
 * gesture actually moved it (ADR-0013, #145): the positive control for
 * `countTranslateWrites`, since the seam-crossing slide's computed value
 * must change even where no script wrote its inline style. */
function sampleComputedTranslate(slide: HTMLElement) {
  let first: string | null = null;
  let last = '';
  const stop = sampleEveryFrame(() => {
    const value = getComputedStyle(slide).translate;
    if (first === null) first = value;
    last = value;
  });
  return () => {
    stop();
    return { first: first ?? '', last };
  };
}

describe('one instance: no script per frame', () => {
  test('no inline translate write crossing the seam, on the CSS path', async () => {
    const { viewport } = renderShells({ defaultIndex: 4 });
    await sleep(100);
    expectPlacementPath(viewport, 'css');

    const slide = screen.getByRole('group', { name: '1 of 5' }) as HTMLElement;
    const stopWrites = countTranslateWrites(viewport);
    const stopSamples = sampleComputedTranslate(slide);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await sleep(600);

    expect(stopWrites()).toBe(0);
    const { first, last } = stopSamples();
    expect(first).not.toBe(last);
  });

  // The positive control: the same gesture, forced onto the JS path, does
  // write inline translate while crossing the seam (`place`, on every
  // scroll event) -- proving `countTranslateWrites` would have caught it.
  test('a positive control, forcing the JS path, writes inline translate crossing the seam', async () => {
    placementPath('js');
    const { viewport } = renderShells({ defaultIndex: 4 });
    await sleep(100);
    expectPlacementPath(viewport, 'js');

    const stopWrites = countTranslateWrites(viewport);

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await sleep(600);

    expect(stopWrites()).toBeGreaterThan(0);
  });
});

/**
 * Runs `sample` from a `ResizeObserver` callback on a sentinel element this
 * resizes every rAF, plus `watch` -- the same element or elements the
 * engine's own `resizes` observer watches for whatever write is under test
 * (a slide, or the viewport) -- so this callback is in the same batch as
 * the engine's own, and so runs after it: a `ResizeObserver`'s callbacks
 * run in the order their observers were created, and the engine's is made
 * first, in `createDeck` (decision 4 and 6, #145). That beat runs after
 * layout, before paint -- the same one a late `ResizeObserver` write (a
 * `refresh` or `compensateShift`) or a newly created placer's own first,
 * still-`pending` frame lands in, in WebKit, where a rAF sampler
 * (`sampleEveryFrame`) only ever reads the timeline's next, already
 * re-sampled frame and so never catches it. `watch` also gives a mount's
 * own first sample a beat to run at, since a `ResizeObserver` reports a
 * target's size once as soon as it is observed, whether or not it has
 * changed. Returns a function that stops sampling.
 */
function sampleBeforePaint(sample: () => void, watch: Element[] = []) {
  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
  document.body.append(sentinel);
  const observer = new ResizeObserver(sample);
  for (const el of watch) observer.observe(el);
  observer.observe(sentinel);
  let done = false;
  let wide = false;
  const tick = () => {
    if (done) return;
    wide = !wide;
    sentinel.style.width = wide ? '2px' : '1px';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    done = true;
    observer.disconnect();
    sentinel.remove();
  };
}

/** `countBlankFrames`, before paint rather than on the next rAF (decision
 * 4 and 6, #145): see `sampleBeforePaint`. */
function countBlankFramesBeforePaint(
  viewport: HTMLElement,
  vertical: boolean,
  watch: Element[] = []
) {
  let blanks = 0;
  const stop = sampleBeforePaint(() => {
    const rect = viewport.getBoundingClientRect();
    const across = vertical
      ? rect.left + rect.width / 2
      : rect.top + rect.height / 2;
    const points = vertical
      ? [
          { x: across, y: rect.top + 1 },
          { x: across, y: (rect.top + rect.bottom) / 2 },
          { x: across, y: rect.bottom - 1 }
        ]
      : [
          { x: rect.left + 1, y: across },
          { x: (rect.left + rect.right) / 2, y: across },
          { x: rect.right - 1, y: across }
        ];
    for (const { x, y } of points) {
      const el = document.elementFromPoint(x, y);
      if (!el?.closest('[data-carouseldeck-slide]')) blanks++;
    }
  }, watch);
  return () => {
    stop();
    return blanks;
  };
}

/** The df7bbf2 "each real slide sits over one of its own shells" assertion,
 * before paint rather than at rest (decision 4 and 6, #145): see
 * `sampleBeforePaint`. A sample taken once the deck has left shells mode --
 * no shell left to check against -- counts nothing. */
function countOffShellFramesBeforePaint(
  viewport: HTMLElement,
  vertical: boolean,
  watch: Element[] = []
) {
  let offs = 0;
  const stop = sampleBeforePaint(() => {
    if (viewport.querySelector('[data-carouseldeck-shell]') === null) return;
    slidesIn(viewport).forEach((slide, i) => {
      const off = Math.min(
        ...[-2, -1, 0, 1, 2].map((set) =>
          Math.abs(
            axisStart(slide, vertical) -
              axisStart(shellsAt(viewport, set)[i], vertical)
          )
        )
      );
      if (off >= 0.5) offs++;
    });
  }, watch);
  return () => {
    stop();
    return offs;
  };
}

// #145, decision 4: a scroll-progress timeline samples the scroll position
// once a frame, during the HTML Processing Model's step 7.10 -- not when a
// `ResizeObserver` callback or a rAF writes it, which in WebKit lands after
// that beat, one frame late. The engine's pins (`pinPlaced`) cover exactly
// that frame; these tests sample from the one place that can see whether
// they did -- a `ResizeObserver` callback of their own, run the same beat
// (`sampleBeforePaint`). Parameterised over both paths: the CSS path is the
// one this staleness applies to, and the JS path places synchronously in
// the same task as the write, so it is never stale either, by a different
// route.
describe.each(['css', 'js'] as const)(
  'one instance: no stale frame before paint (%s)',
  (path) => {
    test("a resize that moves L: every real slide sits over its own shell, and shows no blank frame, before paint (centred, '5 of 5' at slot -1)", async () => {
      placementPath(path);
      addStyle(CENTRED);
      const { viewport } = renderShells({
        viewportClassName: 'centred',
        defaultIndex: 0
      });
      await sleep(100);
      expectPlacementPath(viewport, path);
      expect(
        screen.getByRole('group', { name: '5 of 5' }).getBoundingClientRect()
          .width
      ).toBeGreaterThan(0);

      // Slide 3 (index 2) is what the engine's own write is triggered by,
      // so watching it keeps this sampler in the same batch
      // (`sampleBeforePaint`).
      const slide3 = slidesIn(viewport)[2];
      const stopBlanks = countBlankFramesBeforePaint(viewport, false, [slide3]);
      const stopOffShell = countOffShellFramesBeforePaint(viewport, false, [
        slide3
      ]);

      // Slide 3 widening moves L (`refresh` -> `compensateShift` ->
      // `moveBy`, in slide 3's own `ResizeObserver` callback): slides 1
      // and 2, still on the slot after, have to move with it.
      addStyle(
        '.centred > [data-carouseldeck-slide]:nth-child(3) { width: 120px; }'
      );
      await nextFrame();
      await nextFrame();
      await sleep(100);

      expect(stopBlanks()).toBe(0);
      expect(stopOffShell()).toBe(0);
    });

    test('the mount itself shows no blank frame before paint', async () => {
      placementPath(path);
      const { viewport } = renderShells({ defaultIndex: 4 });
      expectPlacementPath(viewport, path);
      // The engine's own `resizes` observer watches the viewport from the
      // mount itself (`createDeck`): watching it too keeps this sampler's
      // first callback in that very batch (`sampleBeforePaint`).
      const stopBlanks = countBlankFramesBeforePaint(viewport, false, [
        viewport
      ]);

      await nextFrame();
      await nextFrame();
      await sleep(100);

      expect(stopBlanks()).toBe(0);
    });

    // A resize of the viewport itself, not a slide, so that the run no
    // longer has room beside its own slide (ADR-0013's fallback):
    // `shapeOf` -- never moved by L alone -- changes along with the kind,
    // so `refresh` takes `keepPlace`'s own branch, `restOn`, rather than
    // `compensateShift`'s.
    test('a viewport resize that leaves shells (keepPlace -> restOn from refresh) shows no blank frame before paint', async () => {
      placementPath(path);
      addStyle(
        '.vresize > [data-carouseldeck-slide] { width: 80px; flex-shrink: 0; }'
      );
      const { viewport } = renderShells({
        slides: 5,
        viewportClassName: 'vresize',
        width: 200,
        defaultIndex: 0
      });
      await sleep(100);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-shell]').length
      ).toBeGreaterThan(0);
      expectPlacementPath(viewport, path);

      // The engine's own `resizes` observer watches the viewport
      // directly: watching it too keeps this sampler in the same batch
      // (`sampleBeforePaint`).
      const stopBlanks = countBlankFramesBeforePaint(viewport, false, [
        viewport
      ]);

      // `!important`: the viewport's own width is already inline (React's
      // `style` prop), which an unmarked external rule cannot override.
      addStyle('.vresize { width: 360px !important; }');
      await nextFrame();
      await nextFrame();
      await sleep(100);

      expect(
        viewport.querySelectorAll('[data-carouseldeck-copy]').length
      ).toBeGreaterThan(0);
      expect(stopBlanks()).toBe(0);
    });
  }
);

/** Measures, once, in content-coordinate space (ADR-0013, #145): each real
 * slide's own centre (`centres`), the run's length (`length`), the
 * viewport's own size (`view`) and the scroll range (`max`) -- the same
 * quantities `layoutShells` gives the engine, read the same way
 * (`axisOf`), so a test can predict `nearestSlot` without reading the
 * engine's own private state. */
function measureGeometry(
  viewport: HTMLElement,
  vertical: boolean,
  rtl: boolean
) {
  const sign = !vertical && rtl ? -1 : 1;
  const edge = (rect: DOMRect) =>
    vertical ? rect.top : sign === 1 ? rect.left : -rect.right;
  const size = (rect: DOMRect) => (vertical ? rect.height : rect.width);
  const mid = shellsAt(viewport, 0);
  const after = shellsAt(viewport, 1);
  const viewRect = viewport.getBoundingClientRect();
  const viewStart = edge(viewRect);
  const view = size(viewRect);
  const position = vertical ? viewport.scrollTop : sign * viewport.scrollLeft;
  const length =
    edge(after[0].getBoundingClientRect()) -
    edge(mid[0].getBoundingClientRect());
  const centres = mid.map((shell) => {
    const rect = shell.getBoundingClientRect();
    return edge(rect) - viewStart + position + size(rect) / 2;
  });
  const max = vertical
    ? viewport.scrollHeight - viewport.clientHeight
    : viewport.scrollWidth - viewport.clientWidth;
  return { centres, length, view, max, sign };
}

/** The boundary positions a slide's own slot changes at (ADR-0013,
 * #145): `b_k`, `k` from -1 to 2. */
function boundariesOf(centre: number, length: number, view: number) {
  return [-1, 0, 1, 2].map((k) => centre - view / 2 + (k - 0.5) * length - 0.5);
}

describe('one instance: the same placement on both paths', () => {
  const sweepCases: [string, ShellDeckProps, { css?: string; dir?: 'rtl' }][] =
    [
      ['default', {}, {}],
      ['centred', { viewportClassName: 'centred' }, { css: CENTRED }],
      ['vertical', { orientation: 'vertical' }, {}],
      ['rtl', {}, { dir: 'rtl' }]
    ];

  for (const [name, props, opts] of sweepCases) {
    test(
      `matches within half a pixel, across the whole scroll range (${name})`,
      { timeout: 60_000 },
      async () => {
        if (opts.css) addStyle(opts.css);
        const vertical = props.orientation === 'vertical';
        const rtl = opts.dir === 'rtl';

        const sweep = async (path: 'css' | 'js') => {
          placementPath(path);
          const { viewport, unmount } = renderShells(props, { dir: opts.dir });
          await sleep(100);
          expectPlacementPath(viewport, path);
          viewport.style.scrollSnapType = 'none';
          const geometry = measureGeometry(viewport, vertical, rtl);
          const slides = slidesIn(viewport);

          const candidates = new Set<number>();
          for (let i = 0; i < slides.length; i++) {
            for (const b of boundariesOf(
              geometry.centres[i],
              geometry.length,
              geometry.view
            )) {
              candidates.add(Math.round(b - 1));
              candidates.add(Math.round(b + 1));
            }
          }
          for (let p = 0; p <= geometry.max; p += 13) candidates.add(p);
          const sorted = [...candidates]
            .filter((p) => p >= 0 && p <= geometry.max)
            .sort((a, b) => a - b);

          const positionsOf = (): number[] =>
            slides.map((slide) => {
              const slideRect = slide.getBoundingClientRect();
              const viewRect = viewport.getBoundingClientRect();
              return vertical
                ? slideRect.top - viewRect.top
                : slideRect.left - viewRect.left;
            });

          const readings: number[][] = [];
          for (const p of sorted) {
            if (vertical) viewport.scrollTop = p;
            else viewport.scrollLeft = geometry.sign * p;
            await nextFrame();
            const after = vertical
              ? viewport.scrollTop
              : geometry.sign * viewport.scrollLeft;
            // A settle's own jump moved this one off the position asked:
            // no longer a probe of the position meant, so it is dropped.
            if (Math.abs(after - p) > 0.5) continue;
            readings.push(positionsOf());
          }
          unmount();
          return readings;
        };

        const css = await sweep('css');
        const js = await sweep('js');
        expect(css.length).toBeGreaterThan(0);
        expect(css.length).toBe(js.length);
        for (let i = 0; i < css.length; i++) {
          for (let s = 0; s < css[i].length; s++) {
            expect(Math.abs(css[i][s] - js[i][s])).toBeLessThan(0.5);
          }
        }
      }
    );
  }
});

// #145: the same placement, and the same correctness properties, on
// whichever path placed it.
describe.each(['css', 'js'] as const)(
  'one instance: across the seam (%s)',
  (path) => {
    test('Next from 5 to 1, then Prev from 1 to 5, each report once and land at offset 0', async () => {
      placementPath(path);
      const { root, onIndexChange } = renderShells({ defaultIndex: 4 });
      const next = screen.getByRole('button', { name: 'Next' });
      const prev = screen.getByRole('button', { name: 'Previous' });
      const offsetOf = (label: string) => {
        const slide = screen.getByRole('group', { name: label });
        const viewport = viewportOf(root);
        return Math.round(
          slide.getBoundingClientRect().left -
            viewport.getBoundingClientRect().left
        );
      };
      expectPlacementPath(viewportOf(root), path);

      await userEvent.click(next);
      await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
      expect(offsetOf('1 of 5')).toBe(0);

      await userEvent.click(prev);
      await expectSettledTo(() => onIndexChange.mock.calls, [[0], [4]]);
      expect(offsetOf('5 of 5')).toBe(0);
    });

    const seamCases: [
      string,
      { viewportClassName?: string; orientation?: Deck.Orientation },
      { css?: string; dir?: 'rtl' }
    ][] = [
      ['default', {}, {}],
      ['centred', { viewportClassName: 'centred' }, { css: CENTRED }],
      ['vertical', { orientation: 'vertical' }, {}],
      ['rtl', {}, { dir: 'rtl' }]
    ];

    for (const [name, props, opts] of seamCases) {
      test(`no blank frame crossing the seam, by press, wheel and drag (${name})`, async () => {
        placementPath(path);
        if (opts.css) addStyle(opts.css);
        const vertical = props.orientation === 'vertical';
        const { viewport } = renderShells(
          { ...props, defaultIndex: 4 },
          { dir: opts.dir }
        );
        await sleep(100);
        expectPlacementPath(viewport, path);
        const blanks = countBlankFrames(viewport, vertical);
        const next = screen.getByRole('button', { name: 'Next' });
        const prev = screen.getByRole('button', { name: 'Previous' });

        // A seam crossing each way by press.
        await userEvent.click(next);
        await sleep(600);
        await userEvent.click(prev);
        await sleep(600);

        // One by wheel, big enough to cross a seam from wherever that left
        // the deck.
        const box = viewport.getBoundingClientRect();
        const midX = box.left + box.width / 2;
        const midY = box.top + box.height / 2;
        await mouse(
          ['move', midX, midY],
          vertical ? ['wheel', 0, 8 * WIDTH] : ['wheel', 8 * WIDTH, 0]
        );
        await sleep(600);

        // One by a mouse drag, same reach.
        const start = vertical
          ? { x: midX, y: box.bottom - 10 }
          : { x: box.right - 10, y: midY };
        await mouse(
          ['move', start.x, start.y],
          ['down'],
          vertical
            ? ['move', start.x, start.y - 3 * WIDTH, 10]
            : ['move', start.x - 3 * WIDTH, start.y, 10],
          ['up']
        );
        await sleep(600);

        expect(blanks()).toBe(0);
      });
    }

    // Each real slide must sit exactly over one of its own shells, not just
    // on the right slot. A slide whose slot is unchanged when L changes, as
    // a resize changes it, must still move to its shell at the new L, or the
    // gap it leaves beside the next slide shows as a blank frame as it
    // crosses the viewport. The mount-time estimate must not set L wrong
    // either: in WebKit, a centred deck's subpixel slides render it 1.5px
    // off what the engine records for it.
    test('each real slide sits over one of its own shells, at rest, across the seam each way, and after a resize (centred)', async () => {
      placementPath(path);
      addStyle(CENTRED);
      const { viewport, onIndexChange } = renderShells({
        viewportClassName: 'centred',
        defaultIndex: 4
      });
      const offShells = () =>
        slidesIn(viewport).flatMap((slide, i) => {
          const off = Math.min(
            ...[-2, -1, 0, 1, 2].map((set) =>
              Math.abs(
                axisStart(slide, false) -
                  axisStart(shellsAt(viewport, set)[i], false)
              )
            )
          );
          return off < 0.5 ? [] : [{ slide: i, off }];
        });
      await sleep(100);
      expectPlacementPath(viewport, path);
      expect(offShells()).toEqual([]);

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await expectSettledTo(() => onIndexChange.mock.calls, [[0]]);
      expect(offShells()).toEqual([]);

      await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
      await expectSettledTo(() => onIndexChange.mock.calls, [[0], [4]]);
      expect(offShells()).toEqual([]);

      // Slide 3 widening moves L, with slides 1 and 2 still on the slot
      // after: they have to move with it.
      addStyle(
        '.centred > [data-carouseldeck-slide]:nth-child(3) { width: 120px; }'
      );
      await nextFrame();
      await nextFrame();
      await sleep(100);
      expect(offShells()).toEqual([]);
    });

    test(
      "an iframe's running counter never reloads across the seam, by press, wheel and drag",
      { timeout: 30_000 },
      async () => {
        placementPath(path);
        let loads = 0;
        function IframeDeck() {
          return (
            <Deck.Root aria-label="Test deck" loop defaultIndex={4}>
              <Deck.Prev />
              <Deck.Viewport style={{ width: WIDTH }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Deck.Slide key={i}>
                    {i === 1 ? (
                      <iframe
                        title="counter"
                        onLoad={() => {
                          loads++;
                        }}
                        srcDoc={
                          '<!doctype html><script>window.n=0;' +
                          'setInterval(()=>{window.n++;},20);</script>'
                        }
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
        render(<IframeDeck />);
        const root = screen.getByRole('region', { name: 'Test deck' });
        const viewport = viewportOf(root);
        await sleep(100);
        expectPlacementPath(viewport, path);

        const frame = viewport.querySelector('iframe')!;
        const counterAt = () =>
          (frame.contentWindow as (Window & { n?: number }) | null)?.n ?? -1;
        await expect.poll(counterAt, { timeout: 5000 }).toBeGreaterThan(0);

        const next = screen.getByRole('button', { name: 'Next' });
        const prev = screen.getByRole('button', { name: 'Previous' });
        const readings: number[] = [];
        for (let loop = 0; loop < 3; loop++) {
          for (let i = 0; i < 5; i++) {
            await userEvent.click(next);
            await sleep(600);
          }
          readings.push(counterAt());
        }
        // Three full loops of five presses, with 5 slides: back at the same
        // index proves it actually went all the way round three times, not
        // just across one seam.
        await expectSettledTo(() => root.dataset.index, '4');
        await sleep(400);
        for (let loop = 0; loop < 3; loop++) {
          for (let i = 0; i < 5; i++) {
            await userEvent.click(prev);
            await sleep(600);
          }
          readings.push(counterAt());
        }
        await expectSettledTo(() => root.dataset.index, '4');
        await sleep(400);

        // Started outside the iframe: a pointer over its own document never
        // reaches the viewport's listeners.
        const box = viewport.getBoundingClientRect();
        const outside = { x: box.right - 10, y: box.bottom - 10 };
        await mouse(['move', outside.x, outside.y], ['wheel', 8 * WIDTH, 0]);
        await sleep(400);
        readings.push(counterAt());
        await mouse(
          ['move', outside.x, outside.y],
          ['down'],
          ['move', outside.x - 3 * WIDTH, outside.y, 10],
          ['up']
        );
        await sleep(600);
        readings.push(counterAt());

        expect(loads).toBe(1);
        expect(viewport.querySelector('iframe')).toBe(frame);
        for (let i = 1; i < readings.length; i++) {
          expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1]);
        }
      }
    );

    test('children stay mounted once, and the ref unchanged, after a seam crossing', async () => {
      placementPath(path);
      const mounts: number[] = [];
      const refs: (HTMLElement | null)[] = [];
      function Probe({ index }: { index: number }) {
        const mounted = useRef(false);
        useEffect(() => {
          if (mounted.current) return;
          mounted.current = true;
          mounts[index] = (mounts[index] ?? 0) + 1;
        }, [index]);
        return (
          <div
            data-testid={`probe-${index}`}
            ref={(el) => {
              refs[index] = el;
            }}
          />
        );
      }
      render(
        <Deck.Root aria-label="Test deck" loop defaultIndex={4}>
          <Deck.Prev />
          <Deck.Viewport style={{ width: WIDTH, height: 50 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i}>
                <Probe index={i} />
              </Deck.Slide>
            ))}
          </Deck.Viewport>
          <Deck.Next />
        </Deck.Root>
      );
      await sleep(100);
      const root = screen.getByRole('region', { name: 'Test deck' });
      expectPlacementPath(viewportOf(root), path);
      const probesBefore = [
        ...root.querySelectorAll('[data-testid^="probe-"]')
      ];
      const refsBefore = [...refs];

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await expectSettledTo(() => root.dataset.index, '0');

      expect(mounts).toEqual([1, 1, 1, 1, 1]);
      const probesAfter = [...root.querySelectorAll('[data-testid^="probe-"]')];
      expect(probesAfter).toEqual(probesBefore);
      expect(refs).toEqual(refsBefore);
    });

    test("progress through a seam crossing stays within a quarter slide of each slide's own offset", async () => {
      placementPath(path);
      const { root, viewport } = renderShells({ defaultIndex: 4 });
      expectPlacementPath(viewport, path);
      const slides = slidesIn(viewport);
      const frames: { progress: number; at: number }[][] = [];
      const stop = sampleEveryFrame(() => {
        const box = viewport.getBoundingClientRect();
        frames.push(
          slides.map((slide) => {
            const rect = slide.getBoundingClientRect();
            return {
              at: (rect.left - box.left) / WIDTH,
              progress: Number(
                slide.style.getPropertyValue('--deck-slide-progress')
              )
            };
          })
        );
      });

      await userEvent.click(screen.getByRole('button', { name: 'Next' }));
      await expectSettledTo(() => root.dataset.index, '0');
      await sleep(300);
      stop();
      await nextFrame();

      for (const frame of frames) {
        for (const { progress, at } of frame) {
          // Only in or near view: a slide placed well off-screen checks its
          // own progress elsewhere (the structure describe's geometry
          // tests), and a seam crossing or a jump can move it between
          // slots in ways this loose check is not about.
          if (at <= -1 || at >= 1) continue;
          // A frame's paint can trail the scroll by one frame's worth.
          expect(Math.abs(progress - at)).toBeLessThan(0.25);
        }
      }
    });

    test('data-in-view, at rest, matches the real slides with at least 1px visible', async () => {
      placementPath(path);
      const { viewport } = renderShells({ defaultIndex: 0, slides: 10 });
      await sleep(100);
      expectPlacementPath(viewport, path);
      const slides = slidesIn(viewport);
      const box = viewport.getBoundingClientRect();
      const expected = slides.map((slide) => {
        const rect = slide.getBoundingClientRect();
        return (
          Math.min(rect.right, box.right) - Math.max(rect.left, box.left) >= 1
        );
      });

      expect(slides.map((slide) => slide.hasAttribute('data-in-view'))).toEqual(
        expected
      );
      // The visible slide only; the rest, placed nearest the viewport but
      // off to either side, are not.
      expect(expected.filter(Boolean)).toHaveLength(1);
    });
  }
);

// ADR-0013 (#144): a deck whose run is too short for a shell to have room
// beside its own slide -- L less than the viewport plus its widest slide
// -- keeps today's copies instead. The threshold is measured from the
// real slides alone, so it reads the same whichever is rendered, and the
// engine corrects a wrong first guess (shells) once it settles.

/** A slide's content, reporting `Deck.useSlide()` where a test can read
 * it. */
function CopyProbe() {
  const { index, copy } = Deck.useSlide();
  return (
    <span
      data-testid="copy-probe"
      data-index={index}
      data-copy={copy ?? 'none'}
    />
  );
}

describe('one instance: fallback to copies', () => {
  test('3 slides at 40% of the viewport (L = 1.2V) render copies, not shells, and loop across the seam both ways', async () => {
    // L = 3 * 0.4V = 1.2V; the threshold is V + 0.4V - 0.5 = 1.4V - 0.5:
    // comfortably a fallback at any realistic viewport width.
    addStyle('.forty > [data-carouseldeck-slide] { width: 40%; }');
    render(
      <Deck.Root aria-label="Test deck" loop>
        <Deck.Prev />
        <Deck.Viewport className="forty" style={{ width: WIDTH }}>
          {Array.from({ length: 3 }, (_, i) => (
            <Deck.Slide key={i}>
              Slide {i + 1}
              <CopyProbe />
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    );
    const root = screen.getByRole('region', { name: 'Test deck' });
    const viewport = viewportOf(root);
    await sleep(100);

    expect(viewport.querySelectorAll('[data-carouseldeck-shell]')).toHaveLength(
      0
    );
    const copies = [...viewport.querySelectorAll('[data-carouseldeck-copy]')];
    expect(copies).toHaveLength(6);

    const probeOf = (slide: Element) =>
      slide.querySelector<HTMLElement>('[data-testid="copy-probe"]')!;
    // `slidesIn` also matches copies (each is a `Deck.Slide` rendered
    // again, carrying `data-carouseldeck-slide` the same as the real
    // ones): the real slides alone are the ones without a `copy` marker.
    const realSlides = [
      ...viewport.querySelectorAll<HTMLElement>(
        ':scope > [data-carouseldeck-slide]:not([data-carouseldeck-copy])'
      )
    ];
    expect(realSlides).toHaveLength(3);
    for (const slide of realSlides) {
      expect(probeOf(slide).dataset.copy).toBe('none');
      // #145: the copies fallback never places by a `ScrollTimeline`
      // either -- `layoutShells` returns null outside shells mode, so
      // `syncPlacers` has nothing to sync.
      expect(slide.getAnimations()).toHaveLength(0);
    }
    for (const copy of copies) {
      expect(probeOf(copy).dataset.copy).toBe(
        copy.getAttribute('data-carouseldeck-copy')
      );
    }

    const next = screen.getByRole('button', { name: 'Next' });
    const prev = screen.getByRole('button', { name: 'Previous' });
    for (let i = 0; i < 3; i++) {
      await userEvent.click(next);
      await expectSettledTo(() => root.dataset.index, String((i + 1) % 3));
    }
    for (let i = 0; i < 3; i++) {
      await userEvent.click(prev);
      await expectSettledTo(() => root.dataset.index, String((2 - i) % 3));
    }
  });

  test('2 full-width slides, exactly at the boundary (L = 2V), keep shells', async () => {
    // L = 2V; the threshold is V + V - 0.5 = 2V - 0.5: L clears it, so the
    // boundary itself keeps shells.
    const { viewport } = renderShells({ slides: 2 });
    await sleep(100);

    expect(viewport.querySelectorAll('[data-carouseldeck-shell]')).toHaveLength(
      10
    );
    expect(viewport.querySelectorAll('[data-carouseldeck-copy]')).toHaveLength(
      0
    );
  });

  // `fallbackToCopies`'s formula, copies = L < viewport + widest - 0.5, is
  // monotonic in one direction whenever there is more than one slide:
  // widening every slide by the same amount grows L by n times that
  // amount against widest's one time, so it only ever entrenches shells,
  // never leaves it (checked directly: 3 slides at 40% above is a
  // fallback; the same 3 slides at 60% each, L = 1.8V against a threshold
  // of V + 0.6V - 0.5, comfortably clears it and keeps shells). A live
  // switch from shells to copies needs the slides to narrow instead; this
  // proves the engine's own live threshold crossing, with the index kept,
  // in the only direction the formula allows.
  //
  // Run at a non-zero index too: the resize compensation anchors on the
  // current index's own snap point, which keeps the picture, and so the
  // index, for a slide at any position, not only the first.
  for (const index of [1, 2]) {
    test(`narrowing the slides on a mounted deck switches it to copies, keeping its index (index ${index})`, async () => {
      addStyle('.narrowing > [data-carouseldeck-slide] { width: 60%; }');
      const { root, viewport } = renderShells({
        slides: 3,
        viewportClassName: 'narrowing',
        defaultIndex: index
      });
      await sleep(100);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-shell]')
      ).toHaveLength(15);
      expect(root.dataset.index).toBe(String(index));

      addStyle('.narrowing > [data-carouseldeck-slide] { width: 40%; }');
      await nextFrame();
      await nextFrame();
      await sleep(100);

      expect(
        viewport.querySelectorAll('[data-carouseldeck-shell]')
      ).toHaveLength(0);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-copy]')
      ).toHaveLength(6);
      expect(root.dataset.index).toBe(String(index));
    });
  }

  test('a shells deck reports copy === undefined everywhere, with exactly n probes', async () => {
    render(
      <Deck.Root aria-label="Test deck" loop>
        <Deck.Viewport style={{ width: WIDTH }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Deck.Slide key={i}>
              Slide {i + 1}
              <CopyProbe />
            </Deck.Slide>
          ))}
        </Deck.Viewport>
      </Deck.Root>
    );
    await sleep(100);

    const probes = screen.getAllByTestId('copy-probe');
    expect(probes).toHaveLength(5);
    for (const probe of probes) {
      expect(probe.dataset.copy).toBe('none');
    }
  });
});

// #196: at the boundary where a looping deck's run is about as wide as its
// viewport, `snapPoints` finds nothing to loop (ADR-0009) from whichever of
// shells, copies or neither is currently mounted. Before this, the "nothing
// to loop" check only read the DOM it was called against: the slide-to-its-
// copy distance where shells or copies are mounted, 0 otherwise. So a
// settle against a plain DOM (reached because a settle a moment before
// already dropped loop's own markup) read the run's length differently, and
// `fallbackToCopies` published `copies: true` from a still-mounted shells
// placement even where `snapPoints`, in the very same settle, already found
// nothing to loop. A bled viewport (the padding recipe, #177) can leave a
// plain deck with real, if small, scrollable room the shells-mounted
// measurement never sees, so the two never agreed there, and `copies`
// alternated every settle, forever: React's own nested-update limit then
// throws "Maximum update depth exceeded".
describe('one instance: nothing to loop never oscillates (#196)', () => {
  // The bleed recipe (#177, prototypes/viewport-bleed/FINDINGS.md question
  // 4): a full-width page holding a narrower centred column, the viewport's
  // own `--inset` bleeding it to the page while keeping the slides where
  // they would be without it. The page is a literal width, not `100%`, so
  // the test is independent of the real browser window's own size; 1011px
  // and a 400px column, 6 slides, reproduces the exact boundary
  // `prototypes/viewport-bleed/width-sweep.mjs` found against `bleed--loop`.
  const bleedCss = `
    .bleed196-page { width: 1011px; container-type: inline-size; }
    .bleed196-column { width: 400px; margin-inline: auto; }
    .bleed196-column .bleed196-viewport {
      --inset: calc((100cqi - 400px) / 2);
      margin-inline: calc(-1 * var(--inset));
      padding-inline: var(--inset);
      scroll-padding-inline: var(--inset);
      gap: 16px;
    }
    .bleed196-slide {
      width: calc((100% - 2 * 16px) / 2.5);
      scroll-snap-align: start;
    }
  `;

  /** Re-renders whenever the deck does, so `onRender` sees every settle a
   * runaway would cascade through, even one React never paints (ADR-0013's
   * "no script per frame" tests use the same `Deck.useDeck` subscription to
   * read a settle's own effect, never a scroll). */
  function RenderProbe() {
    Deck.useDeck();
    return null;
  }

  test('a looping deck bled past its column, past the boundary, settles with no "Maximum update depth exceeded"', async () => {
    addStyle(bleedCss);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    onTestFinished(() => consoleError.mockRestore());
    let renders = 0;

    render(
      <div className="bleed196-page">
        <div className="bleed196-column">
          <Deck.Root aria-label="Test deck" loop>
            <Deck.Viewport className="bleed196-viewport">
              {Array.from({ length: 6 }, (_, i) => (
                <Deck.Slide key={i} className="bleed196-slide">
                  Slide {i + 1}
                </Deck.Slide>
              ))}
            </Deck.Viewport>
            <Deck.Prev />
            <Deck.Next />
            <Profiler id="probe-196" onRender={() => renders++}>
              <RenderProbe />
            </Profiler>
          </Deck.Root>
        </div>
      </div>
    );
    await sleep(1000);

    // A runaway settle loop reports this message, from `keepPlace` ->
    // `restOn` -> `settle` -> `publish`, every time React's own
    // nested-update limit catches it; a genuine settle needs only a
    // handful of renders, nowhere near that limit.
    expect(
      consoleError.mock.calls.some(([message]) =>
        /maximum update depth exceeded/i.test(String(message))
      )
    ).toBe(false);
    expect(renders).toBeLessThan(20);
    const root = screen.getByRole('region', { name: 'Test deck' });
    expect(root.dataset.index).toBe('0');
  });

  test('the unbled control deck at the same boundary publishes one count and one copies value from the first settle on', async () => {
    // Built directly on `@carouseldeck/core` (as "the start re-check is
    // scoped to shells", above), so the engine's own `onChange` is read
    // directly rather than through `loop`'s React-side gate, which drops
    // both `shells` and `copies` once `count` is 1 regardless of `copies`
    // itself (`everySlideFits`): the one place `copies`'s own disagreement
    // would otherwise go unobserved. Mounted already carrying shells, the
    // same guess a real `Deck.Viewport` renders first (`copies: false`
    // unmeasured); 6 slides at 145px with a 16px gap, a run of 950px, under
    // a 1011px viewport with no bleed CSS at all, comfortably past the
    // "nothing to loop" boundary (ADR-0009), and nowhere near ADR-0013's own
    // shells-or-copies one, so this is `snapPoints`'s own stability, not
    // `fallbackToCopies`'s.
    // A real stylesheet rule, not an inline style: shells mode's own
    // `alignCopies` clears a real slide's inline `scroll-snap-align` and
    // rereads its computed value to copy onto its shells, so an inline
    // value here would only ever be cleared, never read.
    addStyle('[data-carouseldeck-slide] { scroll-snap-align: start; }');
    const viewport = document.createElement('div');
    Object.assign(viewport.style, {
      display: 'flex',
      overflowX: 'auto',
      scrollSnapType: 'x mandatory',
      width: '1011px',
      gap: '16px'
    });
    const slides: HTMLElement[] = [];
    for (let i = 0; i < 6; i++) {
      const slide = document.createElement('div');
      slide.setAttribute('data-carouseldeck-slide', '');
      Object.assign(slide.style, {
        flexShrink: '0',
        width: '145px',
        height: '10px'
      });
      slides.push(slide);
      viewport.append(slide);
    }
    for (const set of [-2, -1, 0, 1, 2]) {
      for (let i = 0; i < slides.length; i++) {
        const shell = document.createElement('div');
        shell.setAttribute('data-carouseldeck-shell', String(set));
        Object.assign(shell.style, {
          position: 'absolute',
          insetInlineStart: '0',
          width: '145px',
          height: '10px',
          scrollSnapAlign: 'start'
        });
        viewport.append(shell);
      }
    }
    document.body.append(viewport);
    onTestFinished(() => viewport.remove());

    const states: DeckState[] = [];
    const engine = createDeck(viewport, {
      index: 0,
      onChange: (state) => states.push({ ...state })
    });
    onTestFinished(() => engine.destroy());
    await nextFrame();
    await nextFrame();
    await sleep(300);

    expect(states.length).toBeGreaterThan(0);
    expect(states[0].count).toBe(1);
    expect(states[0].copies).toBe(false);

    // Drop the shells, as `Deck.Viewport` would once `count` turns `loop`
    // off, and let the engine re-measure the plain slides alone.
    for (const shell of [
      ...viewport.querySelectorAll('[data-carouseldeck-shell]')
    ]) {
      shell.remove();
    }
    engine.refresh();
    await nextFrame();
    await sleep(300);

    expect(new Set(states.map((state) => state.count))).toEqual(new Set([1]));
    expect(new Set(states.map((state) => state.copies))).toEqual(
      new Set([false])
    );
  });
});

// ADR-0013, "The resize compensation" (#144): a resize that moves L, and
// so the spacers' size, scrolls by the delta in the same task, so the
// picture stays put. Anchored on the current index's own snap point -- the
// offset from `along.position` to it, read before this refresh's layout
// and again after, moved by the difference -- so a slide before the
// current one in its set, which shifts the current slide's own home too,
// is covered by the same rule as the spacer's own delta, not a special
// case of it.

describe('one instance: keeping the picture when L changes', () => {
  test('a slide resized mid-deck does not move the visible slide, in shells mode', async () => {
    const { root, viewport } = renderShells({
      slides: 5,
      viewportClassName: 'resize-mid',
      defaultIndex: 0
    });
    await sleep(100);
    const visible = screen.getByRole('group', { name: '1 of 5' });
    const offset = () =>
      Math.round(
        visible.getBoundingClientRect().left -
          viewport.getBoundingClientRect().left
      );
    const before = offset();

    // Slide 4 (nth-child 4, index 3): after the visible slide, so widening
    // it moves only the spacer under the visible one, nothing of its own.
    addStyle(
      '.resize-mid > [data-carouseldeck-slide]:nth-child(4) { width: 600px; }'
    );
    await nextFrame();
    await nextFrame();
    await sleep(100);

    expect(Math.abs(offset() - before)).toBeLessThanOrEqual(1);
    expect(root.dataset.index).toBe('0');
  });

  // A spacer-only compensation covers only index 0's own shift (nothing
  // of its own precedes the first slide), but leaves a slide before the
  // current index uncompensated: widening or narrowing slide 2 (nth-child
  // 2, index 1) shifts slide 4's own home (index 3) by the same amount,
  // which a spacer-only rule never reads.
  const beforeCurrentCases: [
    string,
    { viewportClassName?: string; orientation?: Deck.Orientation },
    { dir?: 'rtl' },
    string
  ][] = [
    ['widened', {}, {}, '600px'],
    ['narrowed', {}, {}, '40px'],
    ['widened, rtl', {}, { dir: 'rtl' }, '600px'],
    ['widened, vertical', { orientation: 'vertical' }, {}, '600px']
  ];

  for (const [name, props, opts, size] of beforeCurrentCases) {
    test(`a slide before the current one (slide 2) resizing does not move the visible slide or its index (${name})`, async () => {
      const vertical = props.orientation === 'vertical';
      const rtl = opts.dir === 'rtl';
      const { root, viewport } = renderShells(
        {
          ...props,
          slides: 5,
          viewportClassName: 'resize-before',
          defaultIndex: 3
        },
        { dir: opts.dir }
      );
      await sleep(100);
      const offsetOf = () => {
        const v = viewport.getBoundingClientRect();
        const s = screen
          .getByRole('group', { name: '4 of 5' })
          .getBoundingClientRect();
        return Math.round(
          vertical ? s.top - v.top : rtl ? s.right - v.right : s.left - v.left
        );
      };
      const before = offsetOf();
      expect(before).toBe(0);
      expect(root.dataset.index).toBe('3');

      addStyle(
        `.resize-before > [data-carouseldeck-slide]:nth-child(2) { ${
          vertical ? 'height' : 'width'
        }: ${size}; }`
      );
      await nextFrame();
      await nextFrame();
      await sleep(100);

      expect(Math.abs(offsetOf() - before)).toBeLessThanOrEqual(1);
      expect(root.dataset.index).toBe('3');
    });
  }
});

// ADR-0013: leaving shells mode, whether `loop` turns off or a resize
// switches the deck to copies, strips every inline style the engine
// itself wrote on the real slides, so nothing shells wrote leaks into
// copies' or a plain deck's own layout.

const realSlidesIn = (viewport: HTMLElement) => [
  ...viewport.querySelectorAll<HTMLElement>(
    ':scope > [data-carouseldeck-slide]:not([data-carouseldeck-copy])'
  )
];

const engineStylesOf = (slide: HTMLElement) => ({
  translate: slide.style.translate,
  scrollSnapAlign: slide.style.scrollSnapAlign,
  scrollMargin: slide.style.scrollMargin
});

// #145: a placer and its pin are shells mode's own, on the CSS path, so
// they must never outlive it either -- torn down wherever `clearShells`
// already strips the engine's inline styles (`refresh`, leaving shells
// mode altogether, and `destroy`), not left to a slide's own animation to
// keep running against a viewport the engine has stopped placing.
describe.each(['css', 'js'] as const)(
  'one instance: cleanup leaving shells mode (%s)',
  (path) => {
    test('loop turned off on a mounted shells deck leaves no engine-written inline style, or placement animation, on any real slide', async () => {
      placementPath(path);
      function ToggleDeck({ loop }: { loop: boolean }) {
        return (
          <Deck.Root aria-label="Test deck" loop={loop} defaultIndex={2}>
            <Deck.Viewport style={{ width: WIDTH }}>
              {Array.from({ length: 5 }, (_, i) => (
                <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
              ))}
            </Deck.Viewport>
          </Deck.Root>
        );
      }
      const { rerender } = render(<ToggleDeck loop />);
      const root = screen.getByRole('region', { name: 'Test deck' });
      const viewport = viewportOf(root);
      await sleep(100);
      expectPlacementPath(viewport, path);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-shell]')
      ).toHaveLength(25);

      rerender(<ToggleDeck loop={false} />);
      await sleep(100);

      const slides = realSlidesIn(viewport);
      expect(slides).toHaveLength(5);
      for (const slide of slides) {
        expect(engineStylesOf(slide)).toEqual({
          translate: '',
          scrollSnapAlign: '',
          scrollMargin: ''
        });
        expect(slide.getAnimations()).toHaveLength(0);
      }
    });

    test('narrowing into copies on a mounted shells deck leaves no engine-written inline style, or placement animation, on any real slide', async () => {
      placementPath(path);
      addStyle('.cleanup > [data-carouseldeck-slide] { width: 60%; }');
      const { viewport } = renderShells({
        slides: 3,
        viewportClassName: 'cleanup'
      });
      await sleep(100);
      expectPlacementPath(viewport, path);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-shell]')
      ).toHaveLength(15);

      addStyle('.cleanup > [data-carouseldeck-slide] { width: 40%; }');
      await nextFrame();
      await nextFrame();
      await sleep(100);
      expect(
        viewport.querySelectorAll('[data-carouseldeck-copy]')
      ).toHaveLength(6);

      const slides = realSlidesIn(viewport);
      expect(slides).toHaveLength(3);
      for (const slide of slides) {
        expect(engineStylesOf(slide)).toEqual({
          translate: '',
          scrollSnapAlign: '',
          scrollMargin: ''
        });
        expect(slide.getAnimations()).toHaveLength(0);
      }
    });

    test('unmounting a looping shells deck leaves no inline translate, or placement animation, on any real slide', async () => {
      placementPath(path);
      const { viewport, unmount } = renderShells();
      await sleep(100);
      expectPlacementPath(viewport, path);
      const slides = realSlidesIn(viewport);
      expect(slides).toHaveLength(5);

      unmount();

      for (const slide of slides) {
        expect(slide.style.translate).toBe('');
        expect(slide.getAnimations()).toHaveLength(0);
      }
    });

    // `settle` observes every real slide with the deck's own
    // `ResizeObserver` in shells mode, but nothing unobserved them on
    // leaving it, so a slide kept firing `refresh` long after the engine
    // had stopped caring where it sat.
    test('loop turned off on a mounted shells deck unobserves every real slide', async () => {
      placementPath(path);
      const RealResizeObserver = window.ResizeObserver;
      const observed = new Set<Element>();
      const unobserved = new Set<Element>();
      class SpyResizeObserver extends RealResizeObserver {
        observe(target: Element, options?: ResizeObserverOptions) {
          observed.add(target);
          super.observe(target, options);
        }
        unobserve(target: Element) {
          unobserved.add(target);
          super.unobserve(target);
        }
      }
      window.ResizeObserver =
        SpyResizeObserver as unknown as typeof ResizeObserver;
      onTestFinished(() => {
        window.ResizeObserver = RealResizeObserver;
      });

      function ToggleDeck({ loop }: { loop: boolean }) {
        return (
          <Deck.Root aria-label="Test deck" loop={loop} defaultIndex={2}>
            <Deck.Viewport style={{ width: WIDTH }}>
              {Array.from({ length: 5 }, (_, i) => (
                <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
              ))}
            </Deck.Viewport>
          </Deck.Root>
        );
      }
      const { rerender } = render(<ToggleDeck loop />);
      const root = screen.getByRole('region', { name: 'Test deck' });
      const viewport = viewportOf(root);
      await sleep(100);

      const slides = realSlidesIn(viewport);
      expect(slides).toHaveLength(5);
      for (const slide of slides) expect(observed.has(slide)).toBe(true);
      for (const slide of slides) expect(unobserved.has(slide)).toBe(false);

      rerender(<ToggleDeck loop={false} />);
      await sleep(100);

      for (const slide of slides) expect(unobserved.has(slide)).toBe(true);
    });
  }
);

// #146: a `scrollTo` clamped to the track's physical end is a no-op the
// browser fires no `scroll` event for, so the jump that would move the
// deck back into the middle set never runs again, and presses in one
// direction pin it there for good (measured in #140's prototype,
// ADR-0013). Every Next and Prev press corrects the position into the
// middle set first, synchronously, before it steps, so a press always has
// a full set of room ahead of it whether or not a settle got the chance to
// jump. Not covered here: a dot's `scrollTo` goes the direct way, within
// the slides, and never reaches the shells (ADR-0009); an arrow key scrolls
// the viewport by the browser's own native, unsnapped increment per
// keydown, far short of a slide, so "N presses land on slide N on" is not
// a meaningful claim for it the way it is for a press of Next or Prev.
describe.each(['css', 'js'] as const)(
  'one instance: 40 presses 50 ms apart, never stalled at rest (%s)',
  (path) => {
    // 7 slides: 40 is not a multiple of 7, so landing on the wrong slide
    // would show.
    const SLIDES = 7;

    /**
     * Fires `press` every 50 ms, `times` times, with no wait for any of
     * them to settle; tracks the scroll position throughout and returns how
     * close it ever came to either end of the scroll range. A deck pinned
     * at the seam sits exactly at one end from the press that pinned it
     * onward; a deck that corrects first never comes within a pixel of
     * either end.
     */
    async function press50ms(
      viewport: HTMLElement,
      max: number,
      press: () => void,
      times: number
    ) {
      let nearestEnd = Math.min(viewport.scrollLeft, max - viewport.scrollLeft);
      const onScroll = () => {
        const at = viewport.scrollLeft;
        nearestEnd = Math.min(nearestEnd, at, max - at);
      };
      viewport.addEventListener('scroll', onScroll);
      for (let i = 0; i < times; i++) {
        press();
        await sleep(50);
      }
      viewport.removeEventListener('scroll', onScroll);
      return nearestEnd;
    }

    test('Next then Prev, by button: never stalls at the edge, and lands on the right slide', async () => {
      placementPath(path);
      const { root, viewport } = renderShells({ slides: SLIDES });
      const next = screen.getByRole('button', { name: 'Next' });
      const prev = screen.getByRole('button', { name: 'Previous' });
      const max = viewport.scrollWidth - viewport.clientWidth;

      const nearestOnNext = await press50ms(
        viewport,
        max,
        () => next.click(),
        40
      );
      expect(nearestOnNext).toBeGreaterThan(1);
      await expectSettledTo(() => root.dataset.index, String(40 % SLIDES));

      const nearestOnPrev = await press50ms(
        viewport,
        max,
        () => prev.click(),
        40
      );
      expect(nearestOnPrev).toBeGreaterThan(1);
      await expectSettledTo(() => root.dataset.index, '0');
    });
  }
);

// #146: an arrow key, unlike Next and Prev, scrolls the viewport natively
// rather than through `step`, so it is not settled by the fix above: this
// checks whether rapid arrow-key presses can pin a looping deck at the
// scroll range's edge the same way rapid Next presses did in WebKit. A key
// scrolls by the browser's own, unsnapped increment per keydown, far short
// of a slide, so "N presses land on slide N on" is not a meaningful claim
// for it the way it is for a press of Next or Prev: this only checks that
// the position never pins at an edge, that it rests on a real slide once
// the run stops, and that the deck still answers a press after.
describe.each(['css', 'js'] as const)(
  'one instance: 40 arrow-key presses 50 ms apart, never stalled at rest (%s)',
  (path) => {
    const SLIDES = 7;

    /** Polls `viewport.scrollLeft` every 20 ms while `run` is in flight, and
     * returns the longest span, in ms, that the position stayed within 1px
     * of either end of the scroll range. A deck pinned at the seam reads an
     * unbounded span, from the press that pinned it onward; a deck that
     * corrects first never holds an edge for more than a frame or two. */
    async function longestEdgeSpan(
      viewport: HTMLElement,
      max: number,
      run: () => Promise<void>
    ) {
      let polling = true;
      const start = Date.now();
      let longest = 0;
      let edgeSince: number | null = null;
      const poll = (async () => {
        while (polling) {
          const at = viewport.scrollLeft;
          const now = Date.now() - start;
          if (Math.min(at, max - at) <= 1) {
            if (edgeSince === null) edgeSince = now;
            longest = Math.max(longest, now - edgeSince);
          } else {
            edgeSince = null;
          }
          await sleep(20);
        }
      })();
      await run();
      polling = false;
      await poll;
      return longest;
    }

    async function pressKeys(key: string, times: number) {
      for (let i = 0; i < times; i++) {
        await userEvent.keyboard(key);
        await sleep(50);
      }
    }

    test('ArrowRight then ArrowLeft: never pins at the edge, and keeps answering a press', async () => {
      placementPath(path);
      const { root, viewport, onIndexChange } = renderShells({
        slides: SLIDES
      });
      expectPlacementPath(viewport, path);
      const next = screen.getByRole('button', { name: 'Next' });
      viewport.focus();
      const max = viewport.scrollWidth - viewport.clientWidth;

      const rightSpan = await longestEdgeSpan(viewport, max, () =>
        pressKeys('{ArrowRight}', 40)
      );
      expect(rightSpan).toBeLessThan(500);
      await expectRestOnASlide(viewport, root, onIndexChange);

      const leftSpan = await longestEdgeSpan(viewport, max, () =>
        pressKeys('{ArrowLeft}', 40)
      );
      expect(leftSpan).toBeLessThan(500);
      await expectRestOnASlide(viewport, root, onIndexChange);

      // The deck still answers a press after the run: one more key, settled,
      // then Next, settled, and the position moved on.
      await pressKeys('{ArrowRight}', 1);
      await expectRestOnASlide(viewport, root, onIndexChange);
      const before = viewport.scrollLeft;
      next.click();
      await expectRestOnASlide(viewport, root, onIndexChange);
      expect(viewport.scrollLeft).not.toBe(before);
    });
  }
);
