import { useEffect, useRef, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { createDeck } from '@carouseldeck/core';
import {
  addStyle,
  CENTRED,
  expectSettledTo,
  nextFrame,
  pagesOf,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';
import { mouse } from './mouse';

// One instance (ADR-0013): each slide's children mount exactly once, over
// empty, inert shells that carry the snap points on each side of them,
// instead of copies; a deck whose set of slides is too narrow for a shell
// to have room beside its own slide falls back to copies instead (Task 6).

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
  render(dir === 'rtl' ? <div dir="rtl">{tree}</div> : tree);
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { root, viewport: viewportOf(root), onIndexChange };
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
      // Against the mid shell, slide i's own home: with Task 3's
      // placement live, a slide away from the viewport sits nearest
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

  test('rests at defaultIndex, with the slide there at offset 0', async () => {
    const { root, viewport } = renderShells({ defaultIndex: 3 });
    await sleep(100);

    const slide = screen.getByRole('group', { name: '4 of 5' });
    const offset = Math.round(
      slide.getBoundingClientRect().left - viewport.getBoundingClientRect().left
    );
    expect(offset).toBe(0);
    expect(root.dataset.index).toBe('3');
  });

  // Task 4 (#144): the mount's own scroll write may be dropped (WebKit, the
  // prototype's history) or never settle-debounced at all in a fast test, so
  // this checks the rest lands within two frames, not the ~100ms a settle's
  // debounce would otherwise hide behind.
  test('rests at defaultIndex within two frames, with no debounce to hide behind', async () => {
    const { root, viewport } = renderShells({ defaultIndex: 3 });
    await nextFrame();
    await nextFrame();

    const slide = screen.getByRole('group', { name: '4 of 5' });
    const offset = Math.round(
      slide.getBoundingClientRect().left - viewport.getBoundingClientRect().left
    );
    expect(offset).toBe(0);
    expect(root.dataset.index).toBe('3');
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

// Review of Task 4, fixup 1 (#144): a slide whose width is not a whole
// pixel (3 slides each `calc(100% / 3)` of a viewport whose own width is
// not divisible by 3) was given a shell rounded to the nearest whole
// pixel, through `offsetWidth`/`offsetHeight`: an `end`- or `center`-
// aligned rest could then land up to a pixel off. The shell's size now
// comes from the slide's own computed, subpixel, border-box size instead,
// still independent of any `translate` or `scale` a consumer writes.
describe('one instance: subpixel sizes', () => {
  const thirds = (align: string) =>
    // Gap enough that the run clears Task 6's own fallback threshold too
    // (decision 4: L >= viewport + widest slide), not only that it loops
    // at all: three slides each a third of the 1000px viewport are, on
    // their own, exactly the small deck that decision describes, however
    // large the viewport -- the gap is what gives this one enough room to
    // stay in shells, and the subpixel width under test comes from the
    // 1000px viewport not dividing evenly by 3, independent of it.
    `.thirds { column-gap: 180px; }
     .thirds > [data-carouseldeck-slide] { width: calc(100% / 3); scroll-snap-align: ${align}; }`;

  for (const align of ['end', 'center'] as const) {
    test(`a shell's width matches its slide's unscaled, subpixel width, and the rest lands within half a pixel after the seam and back (${align})`, async () => {
      addStyle(thirds(align));
      const { root, viewport } = renderShells({
        slides: 3,
        viewportClassName: 'thirds',
        width: 1000
      });
      await sleep(100);

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
});

// Review of Task 4, fixup 2 (#144): the rAF re-check after mount
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
      // The first write is dropped, as WebKit can before the first paint
      // (decision 5): a real call, that does not move the position.
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

// Task 3 (#144): placement over the seam. A real slide is translated onto
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

describe('one instance: across the seam', () => {
  test('Next from 5 to 1, then Prev from 1 to 5, each report once and land at offset 0', async () => {
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
      if (opts.css) addStyle(opts.css);
      const vertical = props.orientation === 'vertical';
      const { viewport } = renderShells(
        { ...props, defaultIndex: 4 },
        { dir: opts.dir }
      );
      await sleep(100);
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

  test(
    "an iframe's running counter never reloads across the seam, by press, wheel and drag",
    { timeout: 30_000 },
    async () => {
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
          await sleep(60);
        }
        readings.push(counterAt());
      }
      await sleep(400);
      for (let loop = 0; loop < 3; loop++) {
        for (let i = 0; i < 5; i++) {
          await userEvent.click(prev);
          await sleep(60);
        }
        readings.push(counterAt());
      }
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
    const probesBefore = [...root.querySelectorAll('[data-testid^="probe-"]')];
    const refsBefore = [...refs];

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await expectSettledTo(() => root.dataset.index, '0');

    expect(mounts).toEqual([1, 1, 1, 1, 1]);
    const probesAfter = [...root.querySelectorAll('[data-testid^="probe-"]')];
    expect(probesAfter).toEqual(probesBefore);
    expect(refs).toEqual(refsBefore);
  });

  test("progress through a seam crossing stays within a quarter slide of each slide's own offset", async () => {
    const { root, viewport } = renderShells({ defaultIndex: 4 });
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
    const { viewport } = renderShells({ defaultIndex: 0, slides: 10 });
    await sleep(100);
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
});

// Task 6 (#144, decision 4): a deck whose run is too short for a shell to
// have room beside its own slide -- L less than the viewport plus its
// widest slide -- keeps today's copies instead. The threshold is measured
// from the real slides alone, so it reads the same whichever is rendered,
// and the engine corrects a wrong first guess (shells) once it settles.

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
    // comfortably a fallback (decision 4) at any realistic viewport width.
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
    // boundary itself keeps shells (decision 4, and the plan's own risk
    // note on it).
    const { viewport } = renderShells({ slides: 2 });
    await sleep(100);

    expect(viewport.querySelectorAll('[data-carouseldeck-shell]')).toHaveLength(
      10
    );
    expect(viewport.querySelectorAll('[data-carouseldeck-copy]')).toHaveLength(
      0
    );
  });

  // The plan describes this test as "widening the slides", but decision
  // 4's own formula, copies = L < viewport + widest - 0.5, is monotonic
  // the other way whenever there is more than one slide: widening every
  // slide by the same amount grows L by n times that amount against
  // widest's one time, so it only ever entrenches shells, never leaves it
  // (checked directly: 3 slides at 40% above is a fallback; the same 3
  // slides at 60% each, L = 1.8V against a threshold of V + 0.6V - 0.5,
  // comfortably clears it and keeps shells). A live switch from shells to
  // copies needs the slides to narrow instead; this proves the engine's
  // own live threshold crossing, with the index kept, in the direction
  // the formula actually allows -- flagged here rather than guessed at
  // silently, since it reads the opposite of the plan's own wording.
  //
  // Run at a non-zero index too (review of Task 6, finding 2): the
  // resize compensation now anchors on the current index's own snap point
  // (the fix for finding 1), which keeps the picture, and so the index,
  // for a slide at any position, not only the first.
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

// Decision 8 (#144, Task 6, amended by the review): a resize that moves L,
// and so the spacers' size, scrolls by the delta in the same task, so the
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

  // Review of Task 6, finding 1: the compensation covered only the
  // before-spacer's own delta, which happens to be the whole of index 0's
  // own shift (nothing of its own precedes the first slide), but leaves a
  // slide before the current index uncompensated: widening or narrowing
  // slide 2 (nth-child 2, index 1) shifts slide 4's own home (index 3) by
  // the same amount, which the spacer-only rule never read.
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

// Task 6: leaving shells mode, whether `loop` turns off or a resize
// switches the deck to copies, strips every inline style the engine
// itself wrote on the real slides, so nothing shells wrote leaks into
// copies' or a plain deck's own layout.

describe('one instance: cleanup leaving shells mode', () => {
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

  test('loop turned off on a mounted shells deck leaves no engine-written inline style on any real slide', async () => {
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
    expect(viewport.querySelectorAll('[data-carouseldeck-shell]')).toHaveLength(
      25
    );

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
    }
  });

  test('narrowing into copies on a mounted shells deck leaves no engine-written inline style on any real slide', async () => {
    addStyle('.cleanup > [data-carouseldeck-slide] { width: 60%; }');
    const { viewport } = renderShells({
      slides: 3,
      viewportClassName: 'cleanup'
    });
    await sleep(100);
    expect(viewport.querySelectorAll('[data-carouseldeck-shell]')).toHaveLength(
      15
    );

    addStyle('.cleanup > [data-carouseldeck-slide] { width: 40%; }');
    await nextFrame();
    await nextFrame();
    await sleep(100);
    expect(viewport.querySelectorAll('[data-carouseldeck-copy]')).toHaveLength(
      6
    );

    const slides = realSlidesIn(viewport);
    expect(slides).toHaveLength(3);
    for (const slide of slides) {
      expect(engineStylesOf(slide)).toEqual({
        translate: '',
        scrollSnapAlign: '',
        scrollMargin: ''
      });
    }
  });

  // Review of Task 6, finding 3: `settle` observes every real slide with
  // the deck's own ResizeObserver in shells mode, but nothing unobserved
  // them on leaving it, so a slide kept firing `refresh` long after the
  // engine had stopped caring where it sat.
  test('loop turned off on a mounted shells deck unobserves every real slide', async () => {
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
});
