import { useEffect, useRef, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { LoopShells } from '../src/loop-shells';
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

// One instance (ADR-0013, #144): each slide's children mount exactly once,
// over empty, inert shells that carry the snap points instead of copies.
// Staged behind the internal `LoopShells` switch (`../src/loop-shells.ts`)
// while every other suite keeps rendering copies; Task 7 deletes it and
// these tests lose "(staged)" from their names.
//
// Placement across the seam (Task 3), the start write after the first
// frame and SSR (Task 4), stacked effects (Task 5) and the small-deck
// fallback (Task 6) are out of scope here: these tests stay within the
// mid set, where a real slide already sits exactly over its own shell with
// no translate needed.

type ShellDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportClassName?: string;
};

/** A deck with no stylesheet beyond the consumer's own, wrapped in the
 * staging switch. Unlike `TestDeck` (`fixtures.tsx`), its viewport can take
 * a height, for a vertical deck. */
function ShellDeck({
  slides = 5,
  viewportClassName,
  orientation,
  ...props
}: ShellDeckProps) {
  const vertical = orientation === 'vertical';
  return (
    <Deck.Root aria-label="Test deck" orientation={orientation} {...props}>
      <Deck.Prev />
      <Deck.Viewport
        className={viewportClassName}
        style={vertical ? { width: WIDTH, height: 200 } : { width: WIDTH }}
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
  const tree = (
    <LoopShells value>
      <ShellDeck loop onIndexChange={onIndexChange} {...props} />
    </LoopShells>
  );
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

describe('one instance (staged): structure', () => {
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
      <LoopShells value>
        <Deck.Root aria-label="Test deck" loop>
          <Deck.Viewport style={{ width: WIDTH }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i}>
                <Probe index={i} />
              </Deck.Slide>
            ))}
          </Deck.Viewport>
        </Deck.Root>
      </LoopShells>
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

describe('one instance (staged): across the seam', () => {
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
      render(
        <LoopShells value>
          <IframeDeck />
        </LoopShells>
      );
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
      <LoopShells value>
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
      </LoopShells>
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
