import { act, type ComponentProps } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import * as Deck from '@carouseldeck/react';
import { ServerSlidesProvider } from '../src/server-slides';
import { nextFrame, TestDeck, viewportOf, WIDTH } from './fixtures';

type DeckProps = ComponentProps<typeof TestDeck>;

const rectsOf = (elements: Element[]) =>
  elements.map((el) => el.getBoundingClientRect().toJSON());

/**
 * Paints the server HTML for `props`, then hydrates it, checking that
 * nothing moved unless `mayCorrect`. `atServer` reads the viewport before
 * any script has run.
 */
async function hydrate(
  props: DeckProps,
  atServer: (v: HTMLElement) => void = () => {},
  { mayCorrect = false }: { mayCorrect?: boolean } = {}
) {
  const container = document.createElement('div');
  container.innerHTML = renderToString(<TestDeck {...props} />);
  document.body.append(container);
  const viewport = viewportOf(container);
  atServer(viewport);
  await nextFrame();
  const slides = [...viewport.children];
  const before = rectsOf([container, ...slides]);

  const shifts: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) =>
    shifts.push(...list.getEntries())
  );
  observer.observe({ type: 'layout-shift' });
  const onRecoverableError = vi.fn();
  const onIndexChange = vi.fn();

  await act(async () => {
    hydrateRoot(
      container,
      <TestDeck {...props} onIndexChange={onIndexChange} />,
      { onRecoverableError }
    );
  });
  await nextFrame();
  await nextFrame();
  shifts.push(...observer.takeRecords());
  observer.disconnect();

  expect(onRecoverableError).not.toHaveBeenCalled();
  if (!mayCorrect) {
    expect(shifts).toEqual([]);
    expect(rectsOf([container, ...slides])).toEqual(before);
  }
  expect(onIndexChange).not.toHaveBeenCalled();
  return {
    viewport,
    index: viewport.closest('[data-index]')?.getAttribute('data-index')
  };
}

test('server-rendered output starting at defaultIndex shows no layout shift', async () => {
  const { viewport, index } = await hydrate({ defaultIndex: 2 }, (viewport) =>
    // Before any script runs, the server HTML alone is at defaultIndex.
    expect(viewport.scrollLeft).toBe(2 * WIDTH)
  );

  expect(viewport.scrollLeft).toBe(2 * WIDTH);
  expect(index).toBe('2');
});

let removeStyle = () => {};
afterEach(() => removeStyle());

// 3.5 centred slides in view: slides 0 and 1 both rest at scroll 0, and
// slides 3 and 4 at the end of the range, so 5 slides give 3 snap points.
// Server HTML can only start at slide `defaultIndex`, so the first paint may
// correct; the deck must still end on snap point `defaultIndex`, silently.
test.each([
  { defaultIndex: 1, index: 1 },
  { defaultIndex: 10, index: 2 }
])(
  'with snap points shared by several slides, defaultIndex $defaultIndex ends on snap point $index',
  async ({ defaultIndex, index: expected }) => {
    const style = document.createElement('style');
    style.textContent = `.centred > * { width: calc(100% / 3.5); scroll-snap-align: center; }`;
    document.head.append(style);
    removeStyle = () => style.remove();

    const { viewport, index } = await hydrate(
      { defaultIndex, viewportClassName: 'centred' },
      undefined,
      { mayCorrect: true }
    );

    // Snap points 0, 1 and 2 are scroll 0, slide 2 centred, and the end.
    const max = viewport.scrollWidth - viewport.clientWidth;
    const box = viewport.children[2].getBoundingClientRect();
    const centred =
      viewport.scrollLeft +
      box.left +
      box.width / 2 -
      viewport.getBoundingClientRect().left -
      WIDTH / 2;
    const points = [0, centred, max];
    expect(Math.abs(viewport.scrollLeft - points[expected])).toBeLessThan(1);
    expect(index).toBe(String(expected));
  }
);

const controls = (
  <>
    <Deck.Dots />
    <Deck.Counter />
  </>
);

const readControls = (viewport: HTMLElement) => {
  const root = viewport.closest('[data-index]')!;
  return {
    dots: root.querySelectorAll('[data-carouseldeck-dots] > button').length,
    current: root.querySelector('[aria-current="true"]')?.ariaLabel,
    counter: root.querySelector('[data-carouseldeck-counter]')?.textContent
  };
};

// The server counts slides, not snap points, so its Dots and Counter are
// exact where a page is a slide, the common case.
test('with one slide per snap point, Dots and Counter render in server HTML without shift', async () => {
  let server: ReturnType<typeof readControls> | undefined;
  const { viewport } = await hydrate(
    { defaultIndex: 2, controls },
    (viewport) => (server = readControls(viewport))
  );

  const expected = { dots: 5, current: 'Go to page 3', counter: '3 / 5' };
  expect(server).toEqual(expected);
  expect(readControls(viewport)).toEqual(expected);
});

test('server HTML clamps defaultIndex in Dots and Counter, as in slides', async () => {
  let server: ReturnType<typeof readControls> | undefined;
  await hydrate(
    { defaultIndex: 10, controls },
    (viewport) => (server = readControls(viewport))
  );

  expect(server).toEqual({
    dots: 5,
    current: 'Go to page 5',
    counter: '5 / 5'
  });
});

// Where several slides share a snap point, hydration corrects the server's
// one-per-slide Dots and Counter to the snap points (ADR-0003).
test('with snap points shared by several slides, Dots and Counter correct on hydration', async () => {
  const style = document.createElement('style');
  style.textContent = `.centred > * { width: calc(100% / 3.5); scroll-snap-align: center; }`;
  document.head.append(style);
  removeStyle = () => style.remove();

  let server: ReturnType<typeof readControls> | undefined;
  const { viewport } = await hydrate(
    { viewportClassName: 'centred', controls },
    (viewport) => (server = readControls(viewport)),
    { mayCorrect: true }
  );

  expect(server).toEqual({
    dots: 5,
    current: 'Go to page 1',
    counter: '1 / 5'
  });
  expect(readControls(viewport)).toEqual({
    dots: 3,
    current: 'Go to page 1',
    counter: '1 / 3'
  });
});

// Core ignores a non-finite index and starts at 0; Root, Dots and Counter
// must agree with it from the server HTML on.
test('index={NaN} renders and hydrates as index 0', async () => {
  const consoleError = vi.spyOn(console, 'error');
  let server: ReturnType<typeof readControls> | undefined;
  let serverIndex: string | null | undefined;
  const { viewport, index } = await hydrate(
    { index: NaN, onIndexChange: () => {}, controls },
    (viewport) => {
      server = readControls(viewport);
      serverIndex = viewport
        .closest('[data-index]')
        ?.getAttribute('data-index');
    }
  );

  const expected = { dots: 5, current: 'Go to page 1', counter: '1 / 5' };
  expect(serverIndex).toBe('0');
  expect(server).toEqual(expected);
  expect(index).toBe('0');
  expect(readControls(viewport)).toEqual(expected);
  // `hydrate` itself logs React's act-environment notice; only NaN matters.
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('NaN'));
  consoleError.mockRestore();
});

// Server HTML holds a loop's shells and spacers too (ADR-0013), not copies,
// so it already starts on the slide at defaultIndex, not a shell, and
// hydration moves nothing. The before-spacer's own SSR estimate pushes the
// slides two sets in, same as a 5-set copies layout would: shells carry no
// content, so only their estimated inset is compared here, never their
// size, which the estimate does not cover (they are `opacity:0` and
// `inert`, so a size change at mount, if it ever showed as a shift, would
// still paint nothing a person sees).
test('a looping deck with shells starts on the slide at defaultIndex without layout shift', async () => {
  const slideOffset = (viewport: HTMLElement) =>
    viewport.querySelector('[aria-label="3 of 5"]')!.getBoundingClientRect()
      .left - viewport.getBoundingClientRect().left;
  const rectsOfSlidesAndSpacers = (viewport: HTMLElement) =>
    [
      ...viewport.querySelectorAll(':scope > :not([data-carouseldeck-shell])')
    ].map((el) => el.getBoundingClientRect().toJSON());

  let serverShells = -1;
  let serverCopies = -1;
  let before: unknown;
  const { viewport, index } = await hydrate(
    { loop: true, defaultIndex: 2 },
    (viewport) => {
      serverShells = viewport.querySelectorAll(
        '[data-carouseldeck-shell]'
      ).length;
      serverCopies = viewport.querySelectorAll(
        '[data-carouseldeck-copy]'
      ).length;
      expect(slideOffset(viewport)).toBe(0);
      before = rectsOfSlidesAndSpacers(viewport);
    },
    { mayCorrect: true }
  );

  expect(serverShells).toBe(25);
  expect(serverCopies).toBe(0);
  expect(rectsOfSlidesAndSpacers(viewport)).toEqual(before);
  expect(slideOffset(viewport)).toBe(0);
  expect(viewport.scrollLeft).toBe(12 * WIDTH);
  expect(index).toBe('2');
});

// Rendered from a server component, Root sees its Viewport as a client
// reference it cannot recognise; the server component's Root counts the
// slides and provides them (the `react-server` entry, ADR-0011). A Viewport
// inside a component stands in here for the client reference. A deck nested
// in a slide counts its own slides, not the outer deck's.
//
// This reaches the internal provider, as no public path covers it: outside a
// Flight render the server Root sees the same Viewport the client Root does,
// so the client Root never needs the count. `pnpm test:next` covers the whole
// path through a real server component.
test('Dots and Counter count the slides a server component counted', () => {
  const Hidden = (props: ComponentProps<typeof Deck.Viewport>) => (
    <Deck.Viewport {...props} />
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <ServerSlidesProvider count={3}>
      <Deck.Root aria-label="Outer">
        <Hidden>
          <Deck.Slide>
            <Deck.Root aria-label="Inner">
              <Hidden>
                <Deck.Slide>Inner one</Deck.Slide>
              </Hidden>
              <Deck.Counter />
            </Deck.Root>
          </Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
        </Hidden>
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    </ServerSlidesProvider>
  );
  const counters = container.querySelectorAll('[data-carouseldeck-counter]');
  expect(
    container.querySelectorAll('[data-carouseldeck-dots] button')
  ).toHaveLength(3);
  expect([...counters].map((counter) => counter.textContent)).toEqual([
    '',
    '1 / 3'
  ]);
});
