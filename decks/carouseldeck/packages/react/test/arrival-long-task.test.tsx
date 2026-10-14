import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as Deck from '@carouseldeck/react';
import {
  expectRestOnASlide,
  parkMouse,
  sleep,
  TestDeck,
  viewportOf,
  wheelOver,
  WIDTH
} from './fixtures';
import {
  DELAYS,
  SWEEP_MS,
  Uncontrolled,
  busy,
  pressTwiceAtEveryDelay
} from './arrival-helpers';

// Moves as the deck arrives, before its scroll ends (#41): see
// arrival-helpers.tsx for the sweep of delays these tests share.

beforeEach(parkMouse);

describe('a long task as the deck arrives', () => {
  // The browser goes on scrolling while the page's script holds the main
  // thread, and sends no scroll event until it lets go.
  const delays = Array.from({ length: 11 }, (_, i) => 260 + i * 8);

  test(
    'Next twice from the first slide rests on the third',
    async () => {
      await pressTwiceAtEveryDelay(
        () => <Uncontrolled />,
        '1 of 5',
        'Next',
        '2',
        { delays, busyMs: 150 }
      );
    },
    SWEEP_MS
  );

  test(
    'looping, Next twice from the last slide rests on the second',
    async () => {
      await pressTwiceAtEveryDelay(
        () => <Uncontrolled loop defaultIndex={4} />,
        '5 of 5',
        'Next',
        '1',
        { delays, busyMs: 150 }
      );
    },
    SWEEP_MS
  );
});

describe("a long task just after the user's wheel, as a looping Next arrives", () => {
  // The user's wheel ends the deck's move (ADR-0006). Measured in Chromium:
  // when a long task holds the main thread just after the wheel, the
  // browser can carry the move's smooth scroll on afterwards. It either runs
  // on to the move's target, against the wheel, or stops part way, off any
  // snap point, and never snaps the deck back. The first is the browser's,
  // and carouseldeck cannot undo it. From the second, the deck re-snaps to the
  // nearest snap point the way the wheel went. Either way it comes to rest
  // exactly on a snap point.
  test(
    'a wheel back rests exactly on a snap point, the way the wheel went unless the browser ran on',
    async () => {
      const failures: unknown[] = [];
      // Where the scroll is when the wheel turns, and when the long task
      // starts after it, in ms. 4500 is the shell after the first slide:
      // the wheel turns as the deck arrives there and jumps off it.
      for (const at of [4463, 4490, 4500]) {
        for (const after of [40, 60, 80]) {
          const onIndexChange = vi.fn();
          const { unmount } = render(
            <TestDeck loop defaultIndex={4} onIndexChange={onIndexChange} />
          );
          const root = screen.getByRole('region', { name: 'Test deck' });
          const viewport = viewportOf(root);
          // Every smooth scroll the deck asks for once the wheel has
          // turned, from where to where: a re-snap. The jump off a copy is
          // instant.
          let turned = false;
          const resnaps: { from: number; to: number }[] = [];
          const scrollTo = viewport.scrollTo.bind(viewport);
          viewport.scrollTo = ((options: ScrollToOptions) => {
            if (turned && options.behavior === 'smooth') {
              resnaps.push({ from: viewport.scrollLeft, to: options.left! });
            }
            scrollTo(options);
          }) as typeof viewport.scrollTo;
          const turn = () => {
            if (viewport.scrollLeft < at) return;
            viewport.removeEventListener('scroll', turn);
            turned = true;
            void wheelOver(viewport, -200);
            setTimeout(() => busy(200), after);
          };
          viewport.addEventListener('scroll', turn);

          screen.getByRole('button', { name: 'Next' }).click();

          await expectRestOnASlide(viewport, root, onIndexChange).catch(
            (error: Error) => failures.push({ at, after, error: error.message })
          );
          const index = root.dataset.index;
          // A re-snap goes back, the wheel's way, and rests on the last
          // slide. With none, the browser rested the deck itself: where the
          // wheel left it, the last slide, or the move's target, the first.
          const expected =
            resnaps.length > 0
              ? resnaps.every(({ from, to }) => to < from) && index === '4'
              : index === '4' || index === '0';
          if (!expected) failures.push({ at, after, index, resnaps });
          unmount();
        }
      }
      expect(failures).toEqual([]);
    },
    SWEEP_MS
  );
});

describe('a new index as the deck arrives', () => {
  // A deck synced with thumbnails, as in the Thumbnails story: both share
  // the parent's index.
  function Synced() {
    const [index, setIndex] = useState(1);
    return (
      <>
        <TestDeck index={index} onIndexChange={setIndex} />
        <Deck.Root aria-label="Thumbnails">
          <Deck.Viewport style={{ width: WIDTH }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Deck.Slide key={i} style={{ width: '20%' }}>
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

  test(
    'a thumbnail clicked as Next arrives moves the deck to its slide',
    async () => {
      let arrived = 0;
      for (const delay of DELAYS) {
        const { unmount } = render(<Synced />);
        const root = screen.getByRole('region', { name: 'Test deck' });
        const viewport = viewportOf(root);

        screen.getByRole('button', { name: 'Next' }).click();
        await sleep(delay);
        screen.getByRole('button', { name: 'Thumb 5' }).click();
        const clickedAt = viewport.scrollLeft;

        // What the parent was last told may be the slide Next went to, if it
        // settled before the click: the thumbnails show what the parent has.
        await expectRestOnASlide(viewport, root, vi.fn());
        expect({ delay, index: root.dataset.index }).toEqual({
          delay,
          index: '4'
        });
        expect(
          screen
            .getByRole('region', { name: 'Thumbnails' })
            .querySelector('[aria-current]')?.textContent
        ).toBe('Thumb 5');
        if (Math.abs(clickedAt - 2 * WIDTH) < 1) arrived++;
        unmount();
      }
      expect(arrived).toBeGreaterThan(0);
    },
    SWEEP_MS
  );
});

describe('the handle as the deck arrives', () => {
  test(
    'scrollTo then next goes on from the scrollTo',
    async () => {
      let arrived = 0;
      for (const delay of DELAYS) {
        const ref = createRef<Deck.RootHandle>();
        const onIndexChange = vi.fn();
        const { unmount } = render(
          <TestDeck handleRef={ref} onIndexChange={onIndexChange} />
        );
        const root = screen.getByRole('region', { name: 'Test deck' });
        const viewport = viewportOf(root);

        ref.current!.next();
        await sleep(delay);
        ref.current!.scrollTo(3);
        ref.current!.next();
        const calledAt = viewport.scrollLeft;

        await expectRestOnASlide(viewport, root, onIndexChange);
        expect({ delay, index: root.dataset.index }).toEqual({
          delay,
          index: '4'
        });
        if (Math.abs(calledAt - WIDTH) < 1) arrived++;
        unmount();
      }
      expect(arrived).toBeGreaterThan(0);
    },
    SWEEP_MS
  );
});
