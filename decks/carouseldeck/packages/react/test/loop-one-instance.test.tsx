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
  pagesOf,
  sleep,
  viewportOf,
  WIDTH
} from './fixtures';

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
    test(`shell (k, i) sits at slide i's rect plus k times the run length (${name})`, async () => {
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
      for (let set = -2; set <= 2; set++) {
        const shells = shellsAt(viewport, set);
        slides.forEach((slide, i) => {
          expect(
            Math.abs(
              axisStart(shells[i], vertical) -
                (axisStart(slide, vertical) + set * length)
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
