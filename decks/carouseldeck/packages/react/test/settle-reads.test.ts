import { describe, expect, test, vi } from 'vitest';
import { COPY, createDeck } from '@carouseldeck/core';

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
  return {
    maxRect: (boxes: Element[]) => Math.max(0, ...boxes.map(rectCount)),
    maxStyle: (boxes: Element[]) => Math.max(0, ...boxes.map(styleCount)),
    restore: () => vi.restoreAllMocks()
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
      reads.restore();
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
      reads.restore();
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
      reads.restore();
    } finally {
      engine.destroy();
      viewport.remove();
    }
  });
});
