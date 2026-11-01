// The on-screen keyboard (#273), redesigned in #327 after a real iPhone kept
// finding new ways for a Viewport fitted to `visualViewport` to fall out of
// step with it (Safari panning the layout viewport instead of shrinking it,
// a WKWebView wrapper -- Brave -- shrinking the layout viewport itself over
// many `window` 'resize' events, and a fit frozen mid-exit dropping the
// Panel out of view before its own CSS transition had finished). The engine
// itself now never writes the Viewport's `top`, `height` or `position`: the
// Safari replays below prove the Viewport's own painted rect, and its own
// scroll position, never change for a fake `visualViewport` pan; the Brave
// replay proves the opposite case on purpose, with a *real* window resize --
// the Viewport's own `height: 100dvh` genuinely does shrink with the real
// layout viewport, the browser's own doing, while the engine's own inline
// style stays exactly what it was at open.
//
// Safari's own pan is left alone (the maintainer's own ruling, after an
// earlier round tried to undo it with a standalone `translate` on the Panel
// and a vaul-style momentary transform on the focused field, neither ever
// checked against a real Safari pan): the Panel's own top edge may move
// with the pan, the way React Aria's current `Sheet` already lets it on
// iOS. What these tests prove instead is narrower and checkable without a
// real device: a field at Content's own natural end -- the one a pan or a
// keyboard already tends to reveal, never one buried above the fold --
// still ends up inside the real visible window (`offsetTop` to
// `offsetTop + height`) at every step, `--drawer-keyboard-inset` tracks the
// same numbers throughout, and the Viewport itself never moves or scrolls
// for any of it.
//
// A desktop browser has no on-screen keyboard at all, so every test here
// emulates one with a stand-in for `window.visualViewport`: a plain
// `EventTarget` with settable `height`, `offsetTop` and `scale` fields,
// installed before `mount()` (so `createDrawer`'s own, already-existing
// `visualViewport.addEventListener('resize', …)` call -- wired for a plain
// resize, not this feature -- attaches to it too), then driven by
// dispatching 'resize' and 'scroll' on it by hand, the same two events the
// real interface fires. A layout-viewport shrink (Brave) is a real resize
// of the test's own iframe (`page.viewport`), which fires a real `window`
// 'resize' on its own; a mocked `window.innerHeight` getter
// (`mockInnerHeight`, below) stands in only where a test needs a shrink
// without caring whether it is real, such as the "expanding to the largest
// snap point" describe block further down. Real focus throughout comes
// from a real click (`userEvent.click`), never a handler called directly,
// and a real tap on Done is a real click too.
//
// The "Safari's pan" and "Brave's shrinking layout viewport" describe
// blocks below replay sequences logged from a real iPhone (iOS 18.7)
// against this guide's own demo: run 2 (`innerHeight` 667 throughout, a
// pan to `vvH` 331/`offsetTop` 336 held for eleven seconds before settling
// to `offsetTop` 192, the keyboard staying up throughout), run 4
// (`innerHeight` 613 throughout, a pan to `vvH` 293/`offsetTop` 320 on
// focus, settling back to `offsetTop` 0 while the keyboard stays up, then
// the keyboard closing), and Brave's own keyboard log (a pan first, `vvH`
// 363/`offsetTop` 263, then `innerHeight` stepping down from 595 to 363
// over the run's own ~15 `window` 'resize' events, with no further
// `visualViewport` event at all).
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Side } from '../src/index';
import {
  expectSettledTo,
  mockReducedMotion,
  mount,
  nextFrame,
  sleep,
  unmount,
  type Fixture
} from './fixtures';

class FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;
  scale: number;
  constructor(height: number) {
    super();
    this.height = height;
    this.offsetTop = 0;
    this.scale = 1;
  }
  resize() {
    this.dispatchEvent(new Event('resize'));
  }
  scroll() {
    this.dispatchEvent(new Event('scroll'));
  }
}

let fixture: Fixture | undefined;
let fakeViewport: FakeVisualViewport | undefined;
let realVisualViewport: VisualViewport | null;
let innerHeightSpy: ReturnType<typeof vi.spyOn> | undefined;

/** Stands in for the layout viewport itself shrinking (Brave's own replay,
 * below): the real `window.innerHeight` is read-only, so this shadows it
 * for a test that needs `updateKeyboardInset`'s own `window.innerHeight`
 * term to track a resize, not just `visualViewport`. */
function mockInnerHeight(px: number) {
  innerHeightSpy?.mockRestore();
  innerHeightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(px);
}

/** Installs `fakeViewport` as `window.visualViewport` -- must run before
 * `mount()`, so the engine's own permanent resize listener (unrelated to
 * this feature) and this feature's own open-scoped ones both attach to the
 * fake, never the real one. `height` starts at the real
 * `window.innerHeight`, so a test that never touches it computes a neutral
 * inset, the same as a page with no keyboard open. */
function installFakeViewport() {
  realVisualViewport = window.visualViewport;
  fakeViewport = new FakeVisualViewport(window.innerHeight);
  Object.defineProperty(window, 'visualViewport', {
    value: fakeViewport,
    configurable: true
  });
  return fakeViewport;
}

function appendFieldTo(parent: HTMLElement) {
  const input = document.createElement('input');
  input.type = 'text';
  parent.prepend(input);
  return input;
}

/** Enough rows before the field that Content's own natural height is well
 * short of them, so unlocking `overflow-y` does not itself reveal the
 * field, and the field itself sits at Content's own bottom -- squarely
 * inside the keyboard-covered strip `scroll-padding-bottom` carves out, or
 * the strip a Safari pan reveals for free, so a native `scrollIntoView`
 * that ignored either would still land the field short of it. Content's
 * own `clientHeight` is the full Viewport's (this file's own design:
 * nothing shrinks it for a keyboard any more, and nothing undoes a pan any
 * more either), so this needs comfortably more than any real viewport this
 * runs in, not just more than a keyboard-shrunk one. A field at Content's
 * own natural end, never one buried above the fold, is also the only shape
 * the engine's own "let Safari pan" design can promise anything about
 * (this file's own module doc). */
function appendFieldPastTheFold(content: HTMLElement) {
  for (let i = 0; i < 60; i += 1) {
    const row = document.createElement('p');
    row.textContent = `Row ${i}`;
    row.style.margin = '0';
    row.style.height = '40px';
    content.append(row);
  }
  const field = document.createElement('input');
  field.type = 'text';
  content.append(field);
  return field;
}

/** `{ scrollTop, scrollLeft }`, rounded: what every "the Viewport's own
 * scroll position never changes" assertion below compares against, since
 * the engine letting Safari's own pan happen must never itself move or
 * resize the Viewport's own scrollable range or position, on any side. */
function snapshotScroll(el: HTMLElement) {
  return { top: Math.round(el.scrollTop), left: Math.round(el.scrollLeft) };
}

afterEach(() => {
  if (fixture) unmount(fixture);
  fixture = undefined;
  if (fakeViewport) {
    Object.defineProperty(window, 'visualViewport', {
      value: realVisualViewport,
      configurable: true
    });
    fakeViewport = undefined;
  }
  vi.restoreAllMocks();
});

/** The part of the layout viewport actually visible, in the same pixels
 * `visualViewport.offsetTop`/`height` report it in: what every replay below
 * checks a focused field's own `getBoundingClientRect()` against, and the
 * same rect the engine's own `visibleWindow()` computes. */
function visibleWindow(vv: FakeVisualViewport) {
  return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
}

/** A tight snapshot of `el`'s own painted box: what every "the Viewport
 * never moves" assertion below compares against, before and after a
 * replay's own steps. Rounds to the nearest pixel: a real browser's own
 * subpixel layout jitter between two reads of an element nobody touched is
 * not what any of these tests mean to catch. */
function snapshotRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top),
    left: Math.round(r.left),
    width: Math.round(r.width),
    height: Math.round(r.height)
  };
}

/** The inline geometry properties the old, removed keyboard fit used to
 * write (`top`, `height` and `position`, plus the sibling properties
 * `createDrawer`'s own one-time setup also sets): what the Brave replay's
 * own "the engine never writes to it" assertions check instead of the whole
 * `style` attribute, since `--drawer-keyboard-inset` and
 * `--drawer-first-snap` legitimately change on it for reasons that replay
 * is not about. */
function geometryStyle(el: HTMLElement) {
  return {
    position: el.style.position,
    top: el.style.top,
    left: el.style.left,
    right: el.style.right,
    bottom: el.style.bottom,
    inset: el.style.inset,
    width: el.style.width,
    height: el.style.height
  };
}

function expectUnmoved(
  el: HTMLElement,
  baseline: ReturnType<typeof snapshotRect>
) {
  expect(snapshotRect(el)).toEqual(baseline);
}

describe("Safari's own pan, left alone (real iPhone replays, iOS 18.7)", () => {
  beforeEach(() => mockReducedMotion());

  it('run 2: keeps --drawer-keyboard-inset right and the field above the keyboard through an eleven-second held pan, with the Viewport never moving or scrolling', async () => {
    // A real resize (`page.viewport`), not a mock: Content's own natural
    // bottom -- where `appendFieldPastTheFold`'s own field sits -- is the
    // real, painted dialog's own bottom edge, so the real window has to be
    // exactly `iH` tall for that edge to land where the real device's own
    // numbers below assume it does. Restored in `finally`, same reason as
    // the Brave replay below.
    const width = window.innerWidth;
    const iH0 = window.innerHeight;
    const iH = 667; // run 2's own `innerHeight`, constant throughout.
    try {
      await page.viewport(width, iH);
      const vv = installFakeViewport();
      vv.height = iH;
      fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
      const { dialog, viewport, content, drawer } = fixture;
      content.style.boxSizing = 'border-box'; // see `appendFieldPastTheFold`'s own fixture.
      const field = appendFieldPastTheFold(content);

      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');
      const rectBaseline = snapshotRect(viewport);
      const scrollBaseline = snapshotScroll(viewport);

      // A real click, which also scrolls the field into Content's own view,
      // the way a tap on a field past the fold really does, before any
      // keyboard event ever fires.
      await userEvent.click(field);

      // Log #32 ("vv.resize"): the field focuses and Safari starts its own
      // pan -- `vvH` drops to 331, `offsetTop` to 336 -- instead of
      // shrinking `innerHeight`. `336 + 331 === 667`: the pan alone already
      // reveals the full layout viewport, so nothing is left covered yet.
      vv.height = 331;
      vv.offsetTop = 336;
      vv.resize();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
      let visible = visibleWindow(vv);
      let rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

      // The real device held this exact pan for eleven seconds before it
      // settled: a second, identical read must find everything still
      // correct, not just the first one, since nothing here assumes a pan
      // is temporary any more.
      vv.scroll();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
      rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

      // Log #46 ("vv.scroll"): the pan settles, not to `offsetTop: 0` this
      // time but to 192, `vvH` staying at 331. `667 - 192 - 331 === 144`,
      // the real device's own recorded `--drawer-keyboard-inset` value here.
      vv.offsetTop = 192;
      vv.scroll();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '144px'
      );
      visible = visibleWindow(vv);
      rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
      expect(drawer.phase).toBe('open');
    } finally {
      await page.viewport(width, iH0);
    }
  });

  it('run 4: keeps --drawer-keyboard-inset right and the field above the keyboard through a pan, its settle and the keyboard closing, with the Viewport never moving or scrolling', async () => {
    const width = window.innerWidth;
    const iH0 = window.innerHeight;
    const iH = 613; // run 4's own `innerHeight`, constant throughout.
    try {
      await page.viewport(width, iH);
      const vv = installFakeViewport();
      vv.height = iH;
      fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
      const { dialog, viewport, content, drawer } = fixture;
      content.style.boxSizing = 'border-box';
      const field = appendFieldPastTheFold(content);

      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');
      const rectBaseline = snapshotRect(viewport);
      const scrollBaseline = snapshotScroll(viewport);

      // Log #37 ("vv.resize"): the field focuses and Safari starts its own
      // pan instead of shrinking `innerHeight` -- `vvH` drops to 293, with
      // `offsetTop` moving to 320. #273's first cut, and #327's first two
      // rounds, all either fitted the Viewport to this or tried to undo it;
      // this round leaves it alone.
      await userEvent.click(field);
      vv.height = 293;
      vv.offsetTop = 320;
      vv.resize();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      // `320 + 293 === 613`: the pan alone already reveals the full layout
      // viewport through the visible window, so nothing is left covered yet
      // -- the inset never left neutral, so it stays unset, the same as
      // before the keyboard ever opened (the guide's own "stays unset"
      // wording).
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
      let visible = visibleWindow(vv);
      let rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

      // Log #40 ("vv.scroll"): the pan settles back toward `offsetTop: 0`,
      // while `vvH` stays at 293 -- the keyboard itself is still up. `613 -
      // 0 - 293 === 320`, the real device's own recorded
      // `--drawer-keyboard-inset` value at this exact step (its own debug
      // overlay logged `var 320px`).
      vv.offsetTop = 0;
      vv.scroll();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '320px'
      );
      visible = visibleWindow(vv);
      rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

      // Log #43 ("vv.resize"): the keyboard closes, `vvH` back to the full
      // 613 and `offsetTop` back to 0. The Viewport never had anything to
      // revert.
      vv.height = iH;
      vv.resize();
      await nextFrame();
      expect(snapshotRect(viewport)).toEqual(rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '0px'
      );
      expect(drawer.phase).toBe('open');
    } finally {
      await page.viewport(width, iH0);
    }
  });
});

describe('Brave’s shrinking layout viewport (real iPhone replay, WKWebView)', () => {
  beforeEach(() => mockReducedMotion());

  it('lets the browser resize the Viewport with the real layout viewport while the engine never writes to it, converging on every window resize step instead of freezing mid-animation', async () => {
    // A *real* resize (`page.viewport`), not a mock: on a real WKWebView
    // the layout viewport itself shrinks, and so does this engine's own
    // `height: 100dvh` Viewport, the browser's own doing. A mocked
    // `window.innerHeight` getter proves nothing about that -- it never
    // touches layout, so a Viewport that did nothing and one whose own CSS
    // correctly tracked a real resize would read identically. Restored in
    // `finally`, since this changes the real iframe every other test in
    // this file (and run after it, in this same browser) renders in.
    const width = window.innerWidth;
    const iH0 = window.innerHeight;
    try {
      const vv = installFakeViewport();
      fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
      const { dialog, viewport, content, drawer } = fixture;
      content.style.boxSizing = 'border-box'; // see `appendFieldPastTheFold`'s own fixture.
      const field = appendFieldPastTheFold(content);

      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');
      // The geometry properties the old, removed fit used to write,
      // snapshotted right after open: every assertion below re-checks
      // these stay exactly what `createDrawer`'s own one-time setup left
      // them at, proving a real shrink that follows is the browser's own
      // `100dvh` alone, never a line of this file's own code reacting to
      // the keyboard. Not the whole `style` attribute: `--drawer-keyboard-inset`
      // and `--drawer-first-snap` legitimately change on it, for reasons
      // this describe block is not about.
      const dialogGeometry = geometryStyle(dialog);
      const viewportGeometry = geometryStyle(viewport);
      const scrollBaseline = snapshotScroll(viewport);
      await userEvent.click(field);

      // Log #13 ("vv.resize"): like Safari, Brave pans first -- `vvH` 363,
      // `offsetTop` 263 -- a fake `visualViewport` pan only, before the
      // real layout viewport itself starts shrinking.
      vv.height = 363;
      vv.offsetTop = 263;
      vv.resize();
      await nextFrame();
      expect(geometryStyle(dialog)).toEqual(dialogGeometry);
      expect(geometryStyle(viewport)).toEqual(viewportGeometry);
      // Still only a fake pan, no real resize yet: the Viewport's own
      // scroll position genuinely must not have moved.
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);

      // Log #16 ("win.resize"): the layout viewport's own shrink animation
      // starts, un-panning in the same step -- `offsetTop` back to 0, the
      // real `window.innerHeight` already down to 558. `visualViewport`
      // itself stays put at 363 for the rest of the animation: only
      // `window` 'resize' fires from here on. A real resize is the one
      // genuinely different case this file's own module doc calls out: it
      // does re-scroll the Viewport, to the same resting snap point in the
      // freshly measured, now-smaller layout (`onResize`'s own doc) -- the
      // scroll position itself is expected to change from here on, unlike
      // every fake-pan-only step above and the keyboard-only replays above
      // this describe block.
      vv.offsetTop = 0;
      await page.viewport(width, 558);
      await nextFrame();
      expect(geometryStyle(dialog)).toEqual(dialogGeometry);
      expect(geometryStyle(viewport)).toEqual(viewportGeometry);
      // The Viewport's own real, painted height tracks the resize exactly
      // -- the browser's `100dvh`, with nothing here overriding it.
      expect(Math.round(dialog.getBoundingClientRect().height)).toBe(558);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        `${558 - 363}px`
      );
      let visible = visibleWindow(vv);
      let rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

      // Log #18-#33 (a representative subset of the real run's own ~15
      // steps): `innerHeight` keeps falling toward 363 (`vvH`'s own value)
      // with no further `visualViewport` event at all -- only `window`
      // 'resize'. Each step must re-read: the Viewport's own `100dvh`
      // tracks every real step on its own, but the inset this still
      // exposes must keep tracking it too, proving the read itself
      // converges rather than sticking at whatever it computed first, and
      // the field, past the fold, must stay above the keyboard throughout.
      for (const iH of [
        520, 486, 457, 434, 416, 402, 391, 384, 378, 374, 371, 368, 367, 366,
        365, 364
      ]) {
        await page.viewport(width, iH);
        await nextFrame();
        expect(geometryStyle(dialog)).toEqual(dialogGeometry);
        expect(geometryStyle(viewport)).toEqual(viewportGeometry);
        expect(Math.round(dialog.getBoundingClientRect().height)).toBe(iH);
        expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
          `${iH - 363}px`
        );
        visible = visibleWindow(vv);
        rect = field.getBoundingClientRect();
        expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
        expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
      }

      // Log #34 ("win.resize"): the layout viewport finishes shrinking to
      // exactly `visualViewport`'s own height -- the
      // `interactive-widget=resizes-content` end state. The inset reverts
      // to neutral; the Viewport's own real height already matches it.
      await page.viewport(width, 363);
      await nextFrame();
      expect(geometryStyle(dialog)).toEqual(dialogGeometry);
      expect(geometryStyle(viewport)).toEqual(viewportGeometry);
      expect(Math.round(dialog.getBoundingClientRect().height)).toBe(363);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '0px'
      );
      visible = visibleWindow(vv);
      rect = field.getBoundingClientRect();
      expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
      expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
      expect(drawer.phase).toBe('open');
    } finally {
      await page.viewport(width, iH0);
    }
  });
});

describe('expanding to the largest snap point only when the field was hidden (#327)', () => {
  beforeEach(() => mockReducedMotion());

  it('moves to the largest snap point when the keyboard would hide the focused field, and stays there once it closes', async () => {
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.3, 1], onSnapPointChange });
    const { content, drawer } = fixture;

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    expect(drawer.snapIndex).toBe(0);

    // Positioned, from the Panel's own top, at half the Viewport's own
    // (pre-keyboard) extent -- past the 0.3 snap's own reveal (so hidden
    // at rest), comfortably inside the 1.0 snap's (so visible there).
    const extent = fixture.viewport.clientHeight;
    const field = document.createElement('input');
    field.type = 'text';
    field.style.marginTop = `${extent * 0.5}px`;
    content.append(field);
    // Focus it directly (no real click target on screen at this scroll
    // position): `document.activeElement` is all `maybeExpandForKeyboard`
    // reads. `preventScroll` keeps this deterministic across browsers.
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);

    vv.height = window.innerHeight - 80;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(onSnapPointChange).toHaveBeenCalledWith(1);
    const visible = visibleWindow(vv);
    const rect = field.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

    // The keyboard closes: the design ruling keeps the expanded snap point
    // rather than reverting it.
    vv.height = window.innerHeight;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(onSnapPointChange).toHaveBeenCalledTimes(1);
  });

  it('does not move when the focused field is already visible at the current snap point', async () => {
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.5, 1], onSnapPointChange });
    const { content, drawer } = fixture;
    const field = appendFieldTo(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus();

    vv.height = window.innerHeight - 100;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(0);
    expect(onSnapPointChange).not.toHaveBeenCalled();
  });

  it('does not move when nothing inside the Panel has focus', async () => {
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.3, 1], onSnapPointChange });
    const { drawer } = fixture;

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(0);
    expect(onSnapPointChange).not.toHaveBeenCalled();
  });
});

describe('scrolling the focused field into view, clear of the keyboard (#327)', () => {
  beforeEach(() => mockReducedMotion());

  it('applies --drawer-keyboard-inset to Content as scroll-padding-bottom, and keeps the field above the keyboard once expanding reaches the largest snap point', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] }, { panelHeight: '100%' });
    const { content, drawer } = fixture;
    // The real site's own stylesheet resets every element to
    // `box-sizing: border-box` (`sites/drawerdeck/styles/drawerdeck.css`);
    // this fixture does not, so this test sets it on Content by hand -- the
    // engine's own `padding-bottom` write (`updateKeyboardInset`'s own
    // comment) means to add scrollable room without growing Content's own
    // `clientHeight`, which only holds with `border-box`.
    content.style.boxSizing = 'border-box';
    const field = appendFieldPastTheFold(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);

    vv.height = window.innerHeight - 320;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(content.style.paddingBottom).toBe('320px');
    expect(content.style.scrollPaddingBottom).toBe('320px');
    expect(content.style.overflowY).toBe('auto');
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    const visible = visibleWindow(vv);
    const rect = field.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
  });

  it('scrolls the field in on a keyboard change even when the drawer is already at its largest snap point, with nothing left to expand to', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
    const { content, drawer } = fixture;
    content.style.boxSizing = 'border-box'; // see the test above.
    const field = appendFieldPastTheFold(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);

    vv.height = window.innerHeight - 320;
    vv.resize();
    await nextFrame();

    // Already at the (only) largest snap point: `maybeExpandForKeyboard`
    // never moves it, so `ensureFieldVisible`, honoring Content's own
    // `scroll-padding-bottom`, is the only thing that can still bring the
    // field above the keyboard here.
    expect(drawer.snapIndex).toBe(0);
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    const visible = visibleWindow(vv);
    const rect = field.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
  });

  it('clears both padding-bottom and scroll-padding-bottom once the keyboard closes', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { content, drawer } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    vv.height = window.innerHeight - 200;
    vv.resize();
    await nextFrame();
    expect(content.style.paddingBottom).toBe('200px');
    expect(content.style.scrollPaddingBottom).toBe('200px');

    vv.height = window.innerHeight;
    vv.resize();
    await nextFrame();
    expect(content.style.paddingBottom).toBe('');
    expect(content.style.scrollPaddingBottom).toBe('');
  });
});

describe('a real tap on Close with the keyboard open (#327)', () => {
  beforeEach(() => mockReducedMotion());

  it('lands the click on the Close button, since nothing about the Viewport moves while the keyboard is open', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { content, drawer } = fixture;
    const input = appendFieldTo(content);
    const closeButton = document.createElement('button');
    content.append(closeButton);
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    // Real `Drawer.Close` calls this; the core engine renders no button of
    // its own, so the test wires the one call it makes.
    closeButton.addEventListener('click', () => drawer.close('close-button'));

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);

    vv.height = window.innerHeight - 331;
    vv.offsetTop = 192;
    vv.resize();
    await nextFrame();

    await userEvent.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    expect(onOpenChange).not.toHaveBeenCalledWith(false, 'outside-press');
  });
});

describe('the exit runs its full declared duration with no jump in the Panel (#327)', () => {
  beforeEach(() => mockReducedMotion());

  function withTransformExitTransition(
    el: HTMLElement,
    { durationMs }: { durationMs: number }
  ): () => void {
    const marker = `data-test-${Math.random().toString(36).slice(2)}`;
    el.setAttribute(marker, '');
    const style = document.createElement('style');
    style.textContent = `
      [${marker}] { transform: translateY(0); transition: transform ${durationMs}ms linear; }
      [${marker}][data-ending-style] { transform: translateY(100%); }
    `;
    document.head.append(style);
    return () => {
      style.remove();
      el.removeAttribute(marker);
    };
  }

  /** Samples `panel`'s own painted `top`, one real animation frame at a
   * time, until `isDone()` is true (or 60 frames pass, a generous cap well
   * past a 300ms exit at 60fps): what "no jump in the Panel's position"
   * means on screen -- a teleport the phase and `data-ending-style` alone
   * cannot see, since neither one reads where the Panel is actually
   * painted. */
  async function sampleRectsEachFrame(
    panel: HTMLElement,
    isDone: () => boolean
  ) {
    const samples: { t: number; top: number }[] = [];
    let frames = 0;
    await new Promise<void>((resolve) => {
      function tick(t: number) {
        // Checked before sampling, not after: once `isDone()` is true the
        // dialog has already closed and the Panel's own box collapses to
        // `0,0,0,0` (a closed `<dialog>` renders nothing) -- a real, but
        // expected, drop at the very end of a close, not the mid-exit jump
        // this helper exists to catch. The last sample this takes is
        // always from the final frame still mid-exit.
        if (isDone() || frames > 60) {
          resolve();
          return;
        }
        samples.push({ t, top: panel.getBoundingClientRect().top });
        frames += 1;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    return samples;
  }

  it("tapping Done with the keyboard up closes with the close-button reason, holds data-ending-style for the full 300ms, and never moves the Panel more than one frame's own share of its travel", async () => {
    const vv = installFakeViewport();
    const durationMs = 300;
    fixture = mount({ snapPoints: [0.5, 1] }, { panelHeight: '100%' });
    const { panel, content, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    const removeTransition = withTransformExitTransition(panel, {
      durationMs
    });
    const closeButton = document.createElement('button');
    content.append(closeButton);
    closeButton.addEventListener('click', () => drawer.close('close-button'));

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    const extent = fixture.viewport.clientHeight;
    const message = document.createElement('input');
    message.type = 'text';
    message.style.marginTop = `${extent * 0.3}px`;
    content.append(message);

    await userEvent.click(message);
    vv.height = 331;
    vv.offsetTop = 45;
    vv.resize();
    await nextFrame();
    expect(drawer.snapIndex).toBe(1);

    const totalTravel = panel.getBoundingClientRect().height;
    expect(totalTravel).toBeGreaterThan(0);

    // A real tap on Done.
    await userEvent.click(closeButton);
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);

    // The keyboard finishes closing in the same stretch as the exit, the
    // way a real device's own log showed (#327's own earlier finding): the
    // engine no longer resizes anything for this, so there is nothing left
    // for it to desync from the exit's own transition.
    vv.height = window.innerHeight;
    vv.offsetTop = 0;
    vv.resize();

    const samples = await sampleRectsEachFrame(
      panel,
      () => drawer.phase === 'closed'
    );
    expect(drawer.phase).toBe('closed');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');

    // "No jump": no two consecutive samples move further apart than that
    // frame's own share of the transition's total travel, with a generous
    // margin for real frame-timing jitter (a dropped frame covers more than
    // one frame's own share by design, not by a bug) -- a teleport to
    // closed, the regression this guards, covers nearly the *entire*
    // remaining distance in a single frame, far past any such margin.
    for (let i = 1; i < samples.length; i += 1) {
      const dt = samples[i].t - samples[i - 1].t;
      const expectedStep = (totalTravel * dt) / durationMs;
      const actualStep = Math.abs(samples[i].top - samples[i - 1].top);
      expect(actualStep).toBeLessThanOrEqual(expectedStep * 4 + 4);
    }
    removeTransition();
  });

  it('still lets a real touch mid-exit finish it at once, same as #268 always has, even right after a keyboard change', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { panel, content, viewport, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    const removeTransition = withTransformExitTransition(panel, {
      durationMs: 300
    });

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    const extent = viewport.clientHeight;
    const message = document.createElement('input');
    message.type = 'text';
    message.style.marginTop = `${extent * 0.3}px`;
    content.append(message);

    await userEvent.click(message);
    vv.height = 331;
    vv.offsetTop = 45;
    vv.resize();
    await nextFrame();
    expect(drawer.snapIndex).toBe(1);

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');

    vv.height = window.innerHeight;
    vv.offsetTop = 0;
    vv.resize();
    expect(drawer.phase).toBe('closing');

    // A real touch grabbing the viewport: an interruption never cancels a
    // close (#268's design ruling), it just stops waiting for the
    // transition.
    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(drawer.phase).toBe('closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });
});

describe('general behavior carried over from #273', () => {
  beforeEach(() => mockReducedMotion());

  it('is ignored while pinch-zoomed (visualViewport.scale > 1)', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const baseline = snapshotRect(viewport);

    vv.height = window.innerHeight - 260;
    vv.resize();
    await nextFrame();
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '260px'
    );

    // Pinch-zoomed, then a further shrink: the zoom itself changes
    // `visualViewport.height` for a reason that has nothing to do with the
    // keyboard, so this must not move the inset at all.
    vv.scale = 1.75;
    vv.height = window.innerHeight - 400;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '260px'
    );
    expectUnmoved(viewport, baseline);
  });

  it('writes --drawer-keyboard-inset only when the value actually changes', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const spy = vi.spyOn(dialog.style, 'setProperty');
    vv.height = window.innerHeight - 180;
    vv.resize();
    await nextFrame();
    // A second, identical event: nothing about the viewport changed.
    vv.resize();
    vv.scroll();
    await nextFrame();

    const insetWrites = spy.mock.calls.filter(
      ([name]) => name === '--drawer-keyboard-inset'
    );
    expect(insetWrites.length).toBe(1);
    expect(insetWrites[0][1]).toBe('180px');
  });
});

describe('Android’s interactive-widget=resizes-content model', () => {
  beforeEach(() => mockReducedMotion());

  it('keeps the inset at 0 when visualViewport tracks innerHeight exactly', async () => {
    mockInnerHeight(800);
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, drawer } = fixture;

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    // `interactive-widget=resizes-content`: the layout viewport itself
    // shrinks (`window.innerHeight`), and `visualViewport` tracks it
    // exactly, with no gap between them -- the inset never leaves neutral,
    // so it stays unset. The real CSS shrink this causes through `100dvh`
    // is a plain window resize, already proven in `index.test.ts`'s own "a
    // resize" cases.
    mockInnerHeight(500);
    vv.height = 500;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(drawer.snapIndex).toBe(0);
    expect(drawer.phase).toBe('open');
  });
});

describe('every side (#270)', () => {
  beforeEach(() => mockReducedMotion());

  const sides: Side[] = ['bottom', 'top', 'left', 'right'];
  for (const side of sides) {
    const horizontal = side === 'left' || side === 'right';

    it(`side="${side}": never moves or scrolls the Viewport from a keyboard resize alone, and keeps the snap index`, async () => {
      const vv = installFakeViewport();
      fixture = mount({ side, snapPoints: [0.5, 1] });
      const { dialog, viewport, drawer } = fixture;

      drawer.open(0);
      await expectSettledTo(() => drawer.phase, 'open');
      const rectBaseline = snapshotRect(viewport);
      const scrollBaseline = snapshotScroll(viewport);

      vv.height = window.innerHeight - 240;
      vv.resize();
      await nextFrame();

      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '240px'
      );
      expectUnmoved(viewport, rectBaseline);
      expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
      expect(drawer.snapIndex).toBe(0);
      expect(drawer.phase).toBe('open');
    });

    // A vertically hidden focused field: a legitimate reason to expand for
    // `bottom`/`top` (their own snap axis is the same vertical one the
    // keyboard covers), never for `left`/`right` -- expanding those would
    // only scroll the Viewport's own `scrollLeft` sideways, revealing
    // nothing (this guide's own "Every side" section). Positioned the same
    // way "expanding to the largest snap point" above does -- a direct
    // `marginTop` and `focus()`, not a real click -- since the field's own
    // vertical position inside Content does not depend on `side` at all.
    it(
      horizontal
        ? `side="${side}": never expands or scrolls the Viewport for a vertically hidden focused field`
        : `side="${side}": expands to the largest snap point for a vertically hidden focused field`,
      async () => {
        const vv = installFakeViewport();
        const onSnapPointChange = vi.fn();
        fixture = mount({ side, snapPoints: [0.3, 1], onSnapPointChange });
        const { viewport, content, drawer } = fixture;

        drawer.open(0);
        await expectSettledTo(() => drawer.phase, 'open');
        const scrollBaseline = snapshotScroll(viewport);

        // Past the 0.3 snap's own reveal (hidden at rest), comfortably
        // inside the 1.0 snap's (visible there) -- same fractions as
        // "expanding to the largest snap point" above.
        const extent = viewport.clientHeight;
        const field = document.createElement('input');
        field.type = 'text';
        field.style.marginTop = `${extent * 0.5}px`;
        content.append(field);
        field.focus({ preventScroll: true });
        expect(document.activeElement).toBe(field);

        vv.height = window.innerHeight - 80;
        vv.resize();
        await nextFrame();

        if (horizontal) {
          expect(drawer.snapIndex).toBe(0);
          expect(onSnapPointChange).not.toHaveBeenCalled();
          expect(snapshotScroll(viewport)).toEqual(scrollBaseline);
        } else {
          expect(drawer.snapIndex).toBe(1);
          expect(onSnapPointChange).toHaveBeenCalledWith(1);
        }
      }
    );
  }
});

describe('the visible window is measured from Drawer.Popup’s own rect, not visualViewport alone (#327)', () => {
  beforeEach(() => mockReducedMotion());

  /** On a real iPhone (iOS 18.7), a fixed, inset-0 element's own
   * `getBoundingClientRect()` during a held pan already reads in
   * visual-viewport coordinates: `top: -offsetTop`,
   * `bottom: innerHeight - offsetTop` -- the real device logs
   * `index.ts`'s own module doc cites (run2 #32: `-336..331` at `offsetTop`
   * 336; #46: `-192..475` at `offsetTop` 192). A field's own rect reads the
   * same shifted way. Stubbing both `getBoundingClientRect()`s this way
   * reproduces that coordinate shift without a real device; Chromium and
   * WebKit never shift either one on their own, so nothing here fakes
   * anything these two browsers would ever disagree with. */
  function stubPannedRects(
    dialog: HTMLDialogElement,
    field: HTMLElement,
    opts: {
      iH: number;
      offsetTop: number;
      fieldTop: number;
      fieldBottom: number;
    }
  ) {
    const { iH, offsetTop, fieldTop, fieldBottom } = opts;
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      top: -offsetTop,
      bottom: iH - offsetTop,
      left: 0,
      right: 0,
      width: 0,
      height: iH,
      x: 0,
      y: -offsetTop,
      toJSON() {
        return {};
      }
    } as DOMRect);
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
      top: fieldTop,
      bottom: fieldBottom,
      left: 0,
      right: 0,
      width: 0,
      height: fieldBottom - fieldTop,
      x: 0,
      y: fieldTop,
      toJSON() {
        return {};
      }
    } as DOMRect);
  }

  it('reads a field the keyboard actually covers as hidden, where the raw visualViewport numbers alone would read it as visible (run2 #46)', async () => {
    // Repro: `340 >= 192 && 370 <= 523` reads as visible against the raw
    // `[offsetTop, offsetTop + vvH]` window -- it is not: the real device's
    // own coordinates put the visible window at `[0, 331]` instead, well
    // short of the field's own `370`.
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.3, 1], onSnapPointChange });
    const { dialog, content, drawer } = fixture;
    const field = document.createElement('input');
    field.type = 'text';
    content.append(field);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });

    vv.height = 331;
    vv.offsetTop = 192;
    stubPannedRects(dialog, field, {
      iH: 667,
      offsetTop: 192,
      fieldTop: 340,
      fieldBottom: 370
    });
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(onSnapPointChange).toHaveBeenCalledWith(1);
  });

  it('does not expand for a field the pan already reveals, where the raw visualViewport numbers alone would read it as hidden (run2 #32, held pan)', async () => {
    // Repro: `165 < 336` reads as hidden against the raw window -- it is
    // not: the real device's own coordinates put the visible window at
    // `[0, 331]` instead, which already contains the field's own `150..180`.
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.3, 1], onSnapPointChange });
    const { dialog, content, drawer } = fixture;
    const field = document.createElement('input');
    field.type = 'text';
    content.append(field);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });

    vv.height = 331;
    vv.offsetTop = 336;
    stubPannedRects(dialog, field, {
      iH: 667,
      offsetTop: 336,
      fieldTop: 150,
      fieldBottom: 180
    });
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(0);
    expect(onSnapPointChange).not.toHaveBeenCalled();
  });
});

describe('non-modal (#271): the hit area is unaffected by the keyboard', () => {
  beforeEach(() => mockReducedMotion());

  it('reaches exactly as far behind the drawer with the keyboard open as it did before', async () => {
    const vv = installFakeViewport();
    const behind = document.createElement('input');
    Object.assign(behind.style, {
      position: 'fixed',
      left: '10px',
      top: `${window.innerHeight - 20}px`,
      width: '40px',
      height: '40px'
    });
    document.body.append(behind);

    fixture = mount({ snapPoints: [0.5, 1], modal: false });
    const { viewport, drawer } = fixture;
    drawer.open(1);
    await expectSettledTo(() => drawer.phase, 'open');
    await nextFrame();

    const before = viewport.contains(
      document.elementFromPoint(25, window.innerHeight - 10)
    );

    // Fully open, nothing about the Viewport moves for a keyboard any
    // more, so the hit area -- driven by the scroll position, not the
    // Viewport's own size -- reads exactly the same with it open.
    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();

    expect(
      viewport.contains(document.elementFromPoint(25, window.innerHeight - 10))
    ).toBe(before);
    behind.remove();
  });
});

describe('cleanup', () => {
  beforeEach(() => mockReducedMotion());

  it('removes the visualViewport and window listeners on close, leaves no inline style behind, and attaches fresh ones on reopen', async () => {
    const vv = installFakeViewport();
    const addSpy = vi.spyOn(vv, 'addEventListener');
    const removeSpy = vi.spyOn(vv, 'removeEventListener');
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, content, drawer } = fixture;
    addSpy.mockClear(); // drop the engine's own, unrelated permanent listener.

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    expect(addSpy.mock.calls.map(([type]) => type).sort()).toEqual([
      'resize',
      'scroll'
    ]);

    drawer.close();
    await expectSettledTo(() => drawer.phase, 'closed');
    expect(removeSpy.mock.calls.map(([type]) => type).sort()).toEqual([
      'resize',
      'scroll'
    ]);
    // Nothing this section ever writes (the inset, the Panel's own inline
    // geometry) is left behind once the keyboard listeners it came from are
    // gone: `panel.style.transform`/`translate` stay whatever a consumer's
    // own CSS left them at (empty, here), since this round removed the
    // only two things that ever wrote to either.
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(content.style.paddingBottom).toBe('');
    expect(content.style.scrollPaddingBottom).toBe('');
    expect(panel.style.transform).toBe('');
    expect(panel.style.translate).toBe('');

    // Closed: the keyboard changing now must do nothing at all.
    vv.height = window.innerHeight - 300;
    vv.resize();
    await sleep(50);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    window.dispatchEvent(new Event('resize'));
    await sleep(50);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');

    addSpy.mockClear();
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    expect(addSpy.mock.calls.map(([type]) => type).sort()).toEqual([
      'resize',
      'scroll'
    ]);
  });

  it('removes the visualViewport listeners on destroy, and leaves no inline style behind', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, content, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const removeSpy = vi.spyOn(vv, 'removeEventListener');
    drawer.destroy(); // idempotent: afterEach's own unmount() calling it again, and removing the dialog, is a no-op on top of this.

    // Two 'resize' removals, not one: this feature's own, plus the
    // engine's separate, permanent `visualViewport` 'resize' listener
    // (unrelated to the keyboard, wired for a plain window resize) that
    // `destroy()` also tears down.
    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    expect(removedTypes.filter((t) => t === 'resize').length).toBe(2);
    expect(removedTypes.filter((t) => t === 'scroll').length).toBe(1);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(content.style.paddingBottom).toBe('');
    expect(content.style.scrollPaddingBottom).toBe('');
    expect(panel.style.transform).toBe('');
    expect(panel.style.translate).toBe('');

    vv.height = window.innerHeight - 300;
    vv.resize();
    await sleep(50);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
  });
});
