import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import { stack } from '@carouseldeck/react/stack';
// Internal: see the test that uses it.
import { LoopShells } from '../src/loop-shells';
import {
  expectSettledTo,
  expectSnaps,
  nextFrame,
  viewportOf,
  WIDTH
} from './fixtures';

// The stack effect (ADR-0012): the slides stack in one place, as fade's do,
// and are ordered by progress. It ships no appearance.

const HEIGHT = 200;

type StackDeckProps = ComponentProps<typeof Deck.Root> & { slides?: number };

function StackDeck({ slides = 4, ...props }: StackDeckProps) {
  return (
    <Deck.Root aria-label="Test deck" {...props}>
      <Deck.Viewport effect={stack} style={{ width: WIDTH, height: HEIGHT }}>
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

const renderDeck = (props: StackDeckProps = {}) => {
  render(<StackDeck {...props} />);
  const viewport = viewportOf(
    screen.getByRole('region', { name: 'Test deck' })
  );
  const slides = () => [
    ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
  ];
  return {
    viewport,
    slides,
    next: screen.getByRole('button', { name: 'Next' }),
    /** Each slide's offset from the viewport's top left corner. */
    offsets: () => {
      const box = viewport.getBoundingClientRect();
      return slides().map((slide) => {
        const rect = slide.getBoundingClientRect();
        return [
          Math.round(rect.left - box.left),
          Math.round(rect.top - box.top)
        ];
      });
    },
    inert: () => slides().map((slide) => slide.inert),
    zIndex: () =>
      slides().map((slide) => Number(getComputedStyle(slide).zIndex)),
    /** Holds the deck this many slides on from where it rests, unsnapped. */
    hold: async (way: number) => {
      viewport.style.scrollSnapType = 'none';
      viewport.scrollLeft += WIDTH * way;
      await nextFrame();
      await nextFrame();
    }
  };
};

/** The slides' indexes, from the top of the stack down. */
const topDown = (zIndex: number[]) =>
  zIndex
    .map((z, i) => [z, i])
    .sort(([a], [b]) => b - a)
    .map(([, i]) => i);

const STACKED = Array(4).fill([0, 0]);

describe('stack', () => {
  test('stacks the slides in one place, over snap targets, and snaps', async () => {
    const { viewport, next, offsets } = renderDeck();
    expect(offsets()).toEqual(STACKED);
    expect(
      viewport.querySelectorAll('[data-carouseldeck-snap-target]')
    ).toHaveLength(4);

    await userEvent.click(next);

    await expect.poll(() => viewport.scrollLeft).toBe(WIDTH);
    expect(offsets()).toEqual(STACKED);
    await expectSnaps(viewport);
  });

  test('makes every slide but the focal one inert', async () => {
    const { next, inert } = renderDeck();
    expect(inert()).toEqual([false, true, true, true]);

    await userEvent.click(next);

    await expectSettledTo(inert, [true, false, true, true]);
  });

  test('puts the focal slide on top, and the slides after it behind it in order', async () => {
    const { next, zIndex } = renderDeck();
    expect(topDown(zIndex())).toEqual([0, 1, 2, 3]);

    await userEvent.click(next);

    await expectSettledTo(() => topDown(zIndex()), [1, 2, 3, 0]);
  });

  test('keeps a slide leaving on top until halfway', async () => {
    const { zIndex, hold } = renderDeck();

    await hold(0.4);

    expect(topDown(zIndex())).toEqual([0, 1, 2, 3]);
  });

  test('drops a slide leaving behind every slide past halfway', async () => {
    const { zIndex, hold } = renderDeck();

    await hold(0.6);

    expect(topDown(zIndex())).toEqual([1, 2, 3, 0]);
  });

  test('looping, brings a slide leaving back in at the back as its copy', async () => {
    const { zIndex, hold } = renderDeck({ slides: 3, loop: true });

    await hold(0.6);

    // The slides, then the copies after them: slide 1's copy is at the back
    // of the three cards on top, and slide 1 itself is below them.
    const z = zIndex();
    expect(topDown(z).slice(0, 3)).toEqual([1, 2, 3]);
    expect(z[0]).toBeLessThan(z[3]!);
  });
});

// One instance (staged, #144, Task 5): with shells, a stacked effect's
// shells are its own snap targets, and the run stays at the real slides,
// never 3n copies. A thrown card's progress wraps into the back of the
// stack directly (the maintainer's ruling on ADR-0013's fork): held past
// the last card, two cards that would be invisible past -1 without a copy
// to land on instead read as if just behind the top of the stack.
describe('one instance (staged): stack with shells', () => {
  test('held 0.6 into a throw crossing the seam, the thrown slide is below the other two', async () => {
    render(
      <LoopShells value>
        <StackDeck slides={3} loop defaultIndex={2} />
      </LoopShells>
    );
    const viewport = viewportOf(
      screen.getByRole('region', { name: 'Test deck' })
    );
    const zIndex = () =>
      [
        ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
      ].map((slide) => Number(getComputedStyle(slide).zIndex));
    const hold = async (way: number) => {
      viewport.style.scrollSnapType = 'none';
      viewport.scrollLeft += WIDTH * way;
      await nextFrame();
      await nextFrame();
    };

    await hold(0.6);

    const z = zIndex();
    expect(z[2]).toBeLessThan(z[0]!);
    expect(z[2]).toBeLessThan(z[1]!);
  });
});

describe('--deck-slide-count on a stack', () => {
  test('is the number of slides, on each slide and copy', () => {
    const { slides } = renderDeck({ slides: 3, loop: true });

    expect(
      slides().map((slide) =>
        slide.style.getPropertyValue('--deck-slide-count')
      )
    ).toEqual(Array(9).fill('3'));
  });
});
