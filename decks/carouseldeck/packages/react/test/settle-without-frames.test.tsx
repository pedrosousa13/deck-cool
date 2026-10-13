import { render, screen } from '@testing-library/react';
import { expect, onTestFinished, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  expectSettledTo,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';
import { mouse } from './mouse';

// A deck comes to rest where it was going, though the browser renders no
// frame for a while, or scrolls the viewport back during a mouse drag, as
// Playwright's WebKit did under load (#123). These run in WebKit as well as
// Chromium (vitest.config.ts).

const renderDeck = (props: Parameters<typeof TestDeck>[0] = {}) => {
  const onIndexChange = vi.fn();
  render(
    <TestDeck
      onIndexChange={onIndexChange}
      controls={<Deck.Dots />}
      {...props}
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  return { root, viewport: viewportOf(root), onIndexChange };
};

/** Resolves once the viewport's scroll passes `at`. */
const scrollPast = (viewport: HTMLElement, at: number) =>
  new Promise<void>((resolve) => {
    const past = () => {
      if (viewport.scrollLeft < at) return;
      viewport.removeEventListener('scroll', past);
      resolve();
    };
    viewport.addEventListener('scroll', past);
  });

/**
 * Renders no frame from now until the returned function is called, as
 * WebKit can, measured in Playwright's WebKit under load: for 300ms and
 * more no frame renders while the main thread is idle and timers run, and
 * a scroll in flight goes nowhere and sends no scroll event. Here the
 * scroll is stopped where it is, and no animation frame callback runs.
 * Called, it renders frames again, and, as WebKit does, the scroll goes on
 * to `to`, unless a scroll of the deck's own replaced it meanwhile.
 * Returns whether one did.
 */
function renderNoFrame(viewport: HTMLElement) {
  const { requestAnimationFrame: request, cancelAnimationFrame: cancel } =
    window;
  // Callbacks asked for while no frame renders, by the id handed out.
  const held = new Map<number, FrameRequestCallback>();
  // Each held callback's id once it is asked for again, frames back.
  const asked = new Map<number, number>();
  let next = -1;
  let paused = true;
  window.requestAnimationFrame = (callback) => {
    if (!paused) return request(callback);
    held.set(next, callback);
    return next--;
  };
  window.cancelAnimationFrame = (id) => {
    held.delete(id);
    cancel(asked.get(id) ?? id);
  };
  const scrollTo = vi.spyOn(viewport, 'scrollTo');
  onTestFinished(() => {
    window.requestAnimationFrame = request;
    window.cancelAnimationFrame = cancel;
    scrollTo.mockRestore();
  });
  viewport.scrollBy({ left: 0, top: 0, behavior: 'instant' });
  const stopped = scrollTo.mock.calls.length;
  return (to: { left?: number; top?: number }) => {
    paused = false;
    const replaced = scrollTo.mock.calls.length > stopped;
    if (!replaced) viewport.scrollTo({ ...to, behavior: 'smooth' });
    for (const [id, callback] of held) asked.set(id, request(callback));
    held.clear();
    return replaced;
  };
}

test("a dot's move the browser renders no frame of for a while ends on its target", async () => {
  const { root, viewport, onIndexChange } = renderDeck();

  screen.getByRole('button', { name: 'Go to page 5' }).click();
  await scrollPast(viewport, WIDTH);
  const resume = renderNoFrame(viewport);
  // Longer than two quiets and a re-snap's quiet.
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(resume({ left: 4 * WIDTH })).toBe(false);
  await expectSettledTo(() => viewport.scrollLeft, 4 * WIDTH);
  expect(root.dataset.index).toBe('4');
  expect(onIndexChange.mock.calls).toEqual([[4]]);
});

test('an arrow key whose scroll ends early, then renders no frame for a while, rests where it goes on to', async () => {
  const { root, viewport, onIndexChange } = renderDeck();

  viewport.focus();
  await userEvent.keyboard('{ArrowRight}');
  await scrollPast(viewport, WIDTH / 4);
  const resume = renderNoFrame(viewport);
  await new Promise((resolve) => setTimeout(resolve, 500));

  expect(resume({ left: WIDTH })).toBe(false);
  await expectSettledTo(() => viewport.scrollLeft, WIDTH);
  expect(root.dataset.index).toBe('1');
  expect(onIndexChange.mock.calls).toEqual([[1]]);
});

test('a mouse drag the browser scrolls back as it goes settles where the pointer took it', async () => {
  // A vertical deck, as a drag's own scroll along the block axis is what
  // the browser scrolled back (see below).
  addStyle(`.tall { height: 400px; }`);
  const { root, viewport } = renderDeck({
    orientation: 'vertical',
    viewportClassName: 'tall'
  });
  const box = viewport.getBoundingClientRect();
  const x = box.left + box.width / 2;

  // Most of a slide up, held still, so the drag places the deck on the
  // next slide rather than flicking it. Measured in Playwright's WebKit
  // under load, the browser scrolls the viewport back toward the start
  // between the drag's moves and before its release, so the deck rested
  // where it began: the scroll the browser makes here.
  await mouse(
    ['move', x, box.bottom - 40],
    ['down'],
    ['move', x, box.bottom - 40 - 0.7 * 400, 12]
  );
  viewport.scrollTo({ top: 0, behavior: 'instant' });
  await mouse(['wait', 100], ['up']);

  await expectSettledTo(() => viewport.scrollTop, 400);
  expect(root.dataset.index).toBe('1');
});

test("the user's wheel during a mouse drag is kept, and the release goes on from both", async () => {
  const { root, viewport } = renderDeck();
  const box = viewport.getBoundingClientRect();
  const y = box.top + box.height / 2;
  const start = box.right - 20;

  // Under half a slide on by the drag, then on by the wheel, with the
  // button still down. Measured, the wheel scrolls the deck a slide on in
  // Chromium, and some 50px in WebKit — but one big wheel event leaves that
  // to WebKit's own momentum, which under load (#123) can stop after its
  // first, small tick and never go on: sent as several smaller wheel events
  // instead, each is its own immediate, un-animated scroll, so the total
  // does not depend on a momentum frame that might not come. Still async,
  // so poll for it rather than read it the instant `mouse` resolves.
  await mouse(
    ['move', start, y],
    ['down'],
    ['move', start - 0.45 * WIDTH, y, 6],
    ['wheel', WIDTH / 3, 0],
    ['wheel', WIDTH / 3, 0],
    ['wheel', WIDTH / 3, 0]
  );
  await expect
    .poll(() => viewport.scrollLeft, { timeout: 3000 })
    .toBeGreaterThan(WIDTH / 2);
  // The drag goes on from where the wheel took the deck, and is released
  // from there, held still: past half a slide on, it rests on the second
  // slide, where the drag alone, under half a slide on, rests on the first.
  await mouse(['move', start - 0.45 * WIDTH - 10, y], ['wait', 100], ['up']);

  await expectSettledTo(() => viewport.scrollLeft, WIDTH);
  expect(root.dataset.index).toBe('1');
});

/** A vertical deck of five slides, from slide `from` on, keyed by number. */
const Tall = ({ from = 0 }: { from?: number }) => (
  <Deck.Root aria-label="Test deck" orientation="vertical" defaultIndex={2}>
    <Deck.Viewport className="tall">
      {[0, 1, 2, 3, 4].slice(from).map((i) => (
        <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
      ))}
    </Deck.Viewport>
  </Deck.Root>
);

test('a slide removed during a mouse drag, which moves the viewport, leaves the drag releasing from where the viewport is', async () => {
  addStyle(`.tall { width: 300px; height: 300px; }`);
  const { rerender } = render(<Tall />);
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  await expectSettledTo(() => viewport.scrollTop, 600);
  const box = viewport.getBoundingClientRect();
  const x = box.left + box.width / 2;

  // A third of a slide on from the third slide, at 700. The drag's moves
  // are the browser's own input queue, not the engine's: under load (#123)
  // they can still be queued, unapplied, well after `mouse` resolves. Poll
  // for the drag to have actually landed before moving the slide out from
  // under it, or the removal below would find the deck still at rest.
  await mouse(
    ['move', x, box.bottom - 20],
    ['down'],
    ['move', x, box.bottom - 120, 6]
  );
  await expect
    .poll(() => Math.abs(viewport.scrollTop - 700), { timeout: 3000 })
    .toBeLessThan(5);
  // The first slide goes. The browser keeps what shows where it is, so the
  // viewport goes up a slide, to 400, and the engine refreshes. That too is
  // the browser's own doing, on the same input queue, so poll for it.
  rerender(<Tall from={1} />);
  await expect
    .poll(() => Math.abs(viewport.scrollTop - 400), { timeout: 3000 })
    .toBeLessThan(5);
  // Held still: from 400 the drag rests on the slide it holds, now the
  // second, where from the drag's own 700 it would rest a slide on.
  await mouse(['wait', 100], ['up']);

  await expectSettledTo(() => viewport.scrollTop, 300);
  expect(root.dataset.index).toBe('1');
  expect(root.querySelector('[data-focal]')?.textContent).toBe('Slide 3');
});

test('in a hidden document, where no frame renders, a stopped move still settles at quiet', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const { root, viewport, onIndexChange } = renderDeck();

  screen.getByRole('button', { name: 'Go to page 5' }).click();
  await scrollPast(viewport, WIDTH);
  // No frame renders again in this test, as in a hidden tab.
  renderNoFrame(viewport);

  // At quiet, as before #123: the deck rests on a snap point and says so.
  await expect.poll(() => onIndexChange.mock.calls.length).toBe(1);
  const [[index]] = onIndexChange.mock.calls as [[number]];
  await expectSettledTo(() => viewport.scrollLeft, index * WIDTH);
  expect(root.dataset.index).toBe(String(index));
});
