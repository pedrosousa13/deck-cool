import { describe, expect, onTestFinished, test, vi } from 'vitest';
import {
  COPY,
  createDeck,
  SNAP_TARGET,
  type DeckState
} from '@carouseldeck/core';

// #339: one `settle()` reads the same box's rect and computed style several
// times over -- once each in `measureSnapPoints`, `writeGeometry`,
// `writeProgress`, `focalSlide` and `resnap`/`restsOnSnapPoint`'s own
// `snapRest`. These build a plain, a paged and a looping (copies) deck, let
// its first settle run (synchronously: every deck below starts off its own
// natural rest, #333), then call `refresh()` once more -- idle, so it
// settles again, deterministically, with nothing async to await -- and
// count, per box, how many times `getBoundingClientRect` and
// `getComputedStyle` ran during that one call.

const WIDTH = 100;
const CROSS = 10;

function countPerElementReads() {
  const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
  const styleSpy = vi.spyOn(window, 'getComputedStyle');
  const rectCount = (el: Element) =>
    (rectSpy.mock.instances as unknown[]).filter((inst) => inst === el).length;
  const styleCount = (el: Element) =>
    styleSpy.mock.calls.filter((call) => call[0] === el).length;
  // Restored whether the test passes or fails.
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  return {
    maxRect: (boxes: Element[]) => Math.max(0, ...boxes.map(rectCount)),
    maxStyle: (boxes: Element[]) => Math.max(0, ...boxes.map(styleCount))
  };
}

function makeSlide() {
  const slide = document.createElement('div');
  Object.assign(slide.style, {
    flexShrink: '0',
    width: `${WIDTH}px`,
    height: `${CROSS}px`,
    scrollSnapAlign: 'start'
  });
  return slide;
}

function makeViewport() {
  const viewport = document.createElement('div');
  Object.assign(viewport.style, {
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollSnapType: 'x mandatory',
    width: `${WIDTH}px`,
    height: `${CROSS}px`
  });
  document.body.append(viewport);
  return viewport;
}

/** A plain, 10-slide deck: every slide its own snap point. */
function buildPlain() {
  const viewport = makeViewport();
  const boxes = Array.from({ length: 10 }, makeSlide);
  viewport.append(...boxes);
  return { viewport, boxes };
}

/** A paged, 10-slide deck: pages of 2, so only every other slide snaps. */
function buildPaged() {
  const viewport = makeViewport();
  const boxes = Array.from({ length: 10 }, makeSlide);
  boxes.forEach((slide, i) => {
    if (i % 2 === 1) slide.style.scrollSnapAlign = 'none';
  });
  viewport.append(...boxes);
  return { viewport, boxes };
}

/** A looping, 10-slide deck rendering copies (not shells): one set of real
 * slides, with one copy of the run on each side, the way `loop` without
 * shells renders (ADR-0009). */
function buildLoopingCopies() {
  const viewport = makeViewport();
  const before = Array.from({ length: 10 }, () => {
    const copy = makeSlide();
    copy.setAttribute(COPY, 'before');
    return copy;
  });
  const slides = Array.from({ length: 10 }, makeSlide);
  const after = Array.from({ length: 10 }, () => {
    const copy = makeSlide();
    copy.setAttribute(COPY, 'after');
    return copy;
  });
  viewport.append(...before, ...slides, ...after);
  return { viewport, boxes: [...before, ...slides, ...after] };
}

// One measurement per settle (#339): each box's rect and style, read at
// most once, outside the shells-mode paths that must re-read after a write
// (`measureShells`, `compensateShift`) -- none of these three decks takes
// one. Before this fix, the worst box's own count ran from 5 to 7 rect
// reads and 6 to 27 style reads, by kind.
describe('settle reads each box at most once (#339)', () => {
  test('plain deck', () => {
    const { viewport, boxes } = buildPlain();
    // Index 1 is not a natural rest (#333): the first settle, inside
    // `createDeck`, already ran synchronously by the time it returns.
    const engine = createDeck(viewport, { index: 1, onChange: () => {} });
    try {
      const reads = countPerElementReads();
      engine.refresh();
      expect(reads.maxRect(boxes)).toBeLessThanOrEqual(1);
      expect(reads.maxStyle(boxes)).toBeLessThanOrEqual(1);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('paged deck', () => {
    const { viewport, boxes } = buildPaged();
    const engine = createDeck(viewport, { index: 1, onChange: () => {} });
    try {
      const reads = countPerElementReads();
      engine.refresh();
      expect(reads.maxRect(boxes)).toBeLessThanOrEqual(1);
      expect(reads.maxStyle(boxes)).toBeLessThanOrEqual(1);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('looping deck (copies)', () => {
    const { viewport, boxes } = buildLoopingCopies();
    // `loop` alone forces a synchronous first settle, whatever the index.
    const engine = createDeck(viewport, {
      index: 0,
      loop: true,
      onChange: () => {}
    });
    try {
      const reads = countPerElementReads();
      engine.refresh();
      expect(reads.maxRect(boxes)).toBeLessThanOrEqual(1);
      expect(reads.maxStyle(boxes)).toBeLessThanOrEqual(1);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });
});

const progressOf = (boxes: Element[]) =>
  boxes.map((box) =>
    (box as HTMLElement).style.getPropertyValue('--deck-slide-progress')
  );

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// The paths that drop a cached rect, or read one a different way, each need
// a test of their own: a read count alone passes on a stale rect, so each
// asserts where the deck comes to rest and what it reports there.
describe('a settle reads on past a scroll or an effect (#339)', () => {
  test('a loop with snap targets measures its set from the targets, once', () => {
    // An effect (ADR-0007): an empty snap target lays out per slide and per
    // copy in the slides' stead, so `loopLength` reads the targets' rects.
    const viewport = makeViewport();
    const slides = Array.from({ length: 5 }, makeSlide);
    const copy = (set: 'before' | 'after') =>
      slides.map(() => {
        const box = makeSlide();
        box.setAttribute(COPY, set);
        return box;
      });
    const targets = Array.from({ length: 15 }, () => {
      const target = makeSlide();
      target.setAttribute(SNAP_TARGET, '');
      return target;
    });
    // The slides and copies sit out of flow, over the targets.
    const over = [...copy('before'), ...slides, ...copy('after')];
    for (const box of over) {
      Object.assign(box.style, {
        position: 'absolute',
        scrollSnapAlign: 'none'
      });
    }
    viewport.append(...over, ...targets);
    const states: DeckState[] = [];
    const engine = createDeck(viewport, {
      index: 0,
      loop: true,
      onChange: (state) => states.push(state)
    });
    try {
      // Rests on the slides' own first target, a set in from the copies'.
      expect(viewport.scrollLeft).toBe(5 * WIDTH);
      expect(states.at(-1)).toMatchObject({ index: 0, count: 5, slide: 0 });
      expect(progressOf(slides)).toEqual(['0', '1', '2', '3', '4']);
      const reads = countPerElementReads();
      engine.refresh();
      expect(reads.maxRect(targets)).toBeLessThanOrEqual(1);
      expect(reads.maxStyle(targets)).toBeLessThanOrEqual(1);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('a loop that jumps off a copy reports the boxes where the jump left them', () => {
    // Left resting on a copy, a settle jumps a set onto the slide, which
    // moves every box on screen: a rect read before the jump is stale after
    // it.
    const { viewport, boxes } = buildLoopingCopies();
    const slides = boxes.slice(10, 20);
    const states: DeckState[] = [];
    const engine = createDeck(viewport, {
      index: 0,
      loop: true,
      onChange: (state) => states.push(state)
    });
    try {
      expect(viewport.scrollLeft).toBe(10 * WIDTH);
      // Before its scroll event, so the deck still rests and settles.
      viewport.scrollLeft = 0;
      const reads = countPerElementReads();
      engine.refresh();
      expect(viewport.scrollLeft).toBe(10 * WIDTH);
      expect(states.at(-1)).toMatchObject({ index: 0, slide: 0, focal: 0 });
      expect(progressOf(slides.slice(0, 3))).toEqual(['0', '1', '2']);
      // Once before the jump, and once after.
      expect(reads.maxRect(boxes)).toBeLessThanOrEqual(2);
      expect(reads.maxStyle(boxes)).toBeLessThanOrEqual(1);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });

  test('a deck that rests back on its index after its snap points move reports the boxes where the scroll left them', async () => {
    // Index 2 rests at 2 * WIDTH. Snap targets then take the slides' place
    // (an effect turning on): the same index is now a different position, so
    // the layout change scrolls to it, which moves every box on screen.
    const { viewport, boxes } = buildPlain();
    // What the deck reports as it first settles after the change: the scroll
    // it makes ends in a settle of its own a frame later, which would
    // correct a stale report, so it is caught as it is made.
    let armed = false;
    let first: DeckState | null = null;
    const engine = createDeck(viewport, {
      index: 2,
      onChange: (state) => {
        if (armed) first ??= state;
      }
    });
    try {
      await wait(300);
      expect(viewport.scrollLeft).toBe(2 * WIDTH);
      const TARGET = 60;
      const targets = boxes.map(() => {
        const target = makeSlide();
        target.setAttribute(SNAP_TARGET, '');
        target.style.width = `${TARGET}px`;
        return target;
      });
      for (const slide of boxes) slide.style.position = 'absolute';
      viewport.append(...targets);
      armed = true;
      // The resize that delivers it.
      viewport.style.width = `${WIDTH + 1}px`;
      await frame();
      await frame();
      expect(viewport.scrollLeft).toBe(2 * TARGET);
      // It rests back on index 2, so reports nothing new; a stale rect finds
      // other snap points, and reports them.
      expect(first).toBeNull();
      expect(progressOf(boxes).slice(0, 4)).toEqual(['-2', '-1', '0', '1']);
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });
});
