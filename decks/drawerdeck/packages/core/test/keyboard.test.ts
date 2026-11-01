// Lifting the drawer above the on-screen keyboard (#273), fixed for a real
// device in #327: a desktop browser has no on-screen keyboard at all, so
// every test here emulates one with a stand-in for `window.visualViewport`:
// a plain `EventTarget` with settable `height`, `offsetTop` and `scale`
// fields, installed before `mount()` (so `createDrawer`'s own, already-
// existing `visualViewport.addEventListener('resize', …)` call -- wired for
// a plain resize, not this feature -- attaches to it too), then driven by
// dispatching 'resize' and 'scroll' on it by hand, the same two events the
// real interface fires, plus plain `window` 'resize' events for a layout-
// viewport shrink. Real focus throughout comes from a real click
// (`userEvent.click`), never a handler called directly.
//
// The "Safari's pan" and "Brave's shrinking layout viewport" describe
// blocks below replay the two sequences a real iPhone (iOS 18.7) logged
// against PR #327, decoded from a debug overlay on the preview: each step
// sets the fake viewport's fields to the logged numbers (or, for the
// window-resize run, `mockInnerHeight` to the logged `innerHeight`) and
// fires the same event the device did, named in each step's own comment.
// Every one of these fails against #273's first cut (only ever shrinking
// the Viewport's own height, never moving its top) before this fix.
import { userEvent } from 'vitest/browser';
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

/** Stands in for the layout viewport itself shrinking
 * (`interactive-widget=resizes-content`, and Brave's own shrinking-layout-
 * viewport replay below): the real `window.innerHeight` is read-only, so
 * this shadows it for a test that needs the fit's own `window.innerHeight`
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
 * fit, the same as a page with no keyboard open. */
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

/** The Viewport's own visible rect, in the same layout-viewport pixels
 * `visualViewport.offsetTop`/`height` are reported in: what every replay
 * below checks against `[offsetTop, offsetTop + height]` after each step.
 * A real `getBoundingClientRect()`, not the engine's own internal fields --
 * this is what a real device actually paints. */
function visibleRect(viewport: HTMLElement) {
  const rect = viewport.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: rect.height };
}

/** How much of the Panel's own painted box -- real `getBoundingClientRect()`s,
 * reflecting a running CSS `transform` the same way a real device paints
 * it -- actually falls inside the Viewport's own visible rect, in pixels.
 * What "the exit runs its own duration" means on screen: the phase and
 * `data-ending-style` can both still read `closing` while a stale
 * `scrollTop` has already moved the Viewport's own visible window out from
 * under the Panel, dropping it off screen well before either one changes
 * (#327's own finding 4b, this round). */
function panelVisiblePx(panel: HTMLElement, viewport: HTMLElement): number {
  const p = panel.getBoundingClientRect();
  const v = viewport.getBoundingClientRect();
  return Math.max(0, Math.min(p.bottom, v.bottom) - Math.max(p.top, v.top));
}

describe("Safari's pan model (real iPhone replay, iOS 18.7)", () => {
  beforeEach(() => mockReducedMotion());

  it('fits the Viewport to the panned visible window, never double counting, and keeps the focused field inside it through both fields', async () => {
    const vv = installFakeViewport();
    const iH = window.innerHeight;
    fixture = mount({ snapPoints: [1] });
    const { dialog, viewport, content, drawer } = fixture;
    const message = appendFieldTo(content);
    const subject = appendFieldTo(content);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    // Step 1 ("vv.resize", log #32): the first field focuses, Safari pans
    // instead of shrinking `innerHeight` -- `vvH` drops by 336px, with
    // `offsetTop` moving down by that same 336, so `offsetTop + vvH ===
    // innerHeight` exactly (the real device's own 336 + 331 === 667):
    // #273's own formula (`innerHeight - (vvH + offsetTop)`) reads this as
    // "no keyboard" (0px) and never moves the Viewport, leaving its bottom
    // edge 336px short of the real, panned visible window -- the missing
    // bottom a real iPhone showed.
    await userEvent.click(message);
    vv.height = iH - 336;
    vv.offsetTop = 336;
    vv.resize();
    await nextFrame();

    let rect = visibleRect(viewport);
    expect(Math.abs(rect.top - 336)).toBeLessThan(2);
    expect(Math.abs(rect.bottom - iH)).toBeLessThan(2);
    expect(viewport.style.position).toBe('fixed');
    // #273's own formula gives 0 here too (`iH - vvH - offsetTop === 0`):
    // nothing below the fitted Viewport is left covered at this step, the
    // fix is the fit itself.
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(drawer.phase).toBe('open');
    expect(drawer.snapIndex).toBe(0);

    // Step 2 ("vv.scroll", log #46/#47): focus moves to the second field,
    // lower in the panel -- Safari pans further, `offsetTop` drops to 192
    // with `vvH` unchanged. This is where #273's own formula read a
    // nonzero but wrong 144px (the real device's own `667 - 331 - 192`),
    // still missing the 192px the pan itself covers.
    await userEvent.click(subject);
    vv.offsetTop = 192;
    vv.scroll();
    await nextFrame();

    rect = visibleRect(viewport);
    expect(Math.abs(rect.top - 192)).toBeLessThan(2);
    expect(Math.abs(rect.bottom - (192 + (iH - 336)))).toBeLessThan(2);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '144px'
    );
    // The focused field never leaves the fitted Viewport's own visible
    // rect through either pan.
    const subjectRect = subject.getBoundingClientRect();
    expect(subjectRect.top).toBeGreaterThanOrEqual(rect.top - 1);
    expect(subjectRect.bottom).toBeLessThanOrEqual(rect.bottom + 1);

    // Step 3 ("vv.scroll", log #60): tapping Done starts the close (the
    // dedicated exit test below covers that phase) and, in the same
    // moment, un-pans the page: `offsetTop` back to 0, but `vvH` stays at
    // 331, the keyboard itself still up. The fit keeps tracking the
    // un-pan directly, the same as any other fit change.
    vv.offsetTop = 0;
    vv.height = iH - 336;
    vv.scroll();
    await nextFrame();

    rect = visibleRect(viewport);
    expect(Math.abs(rect.top - 0)).toBeLessThan(2);
    expect(Math.abs(rect.bottom - (iH - 336))).toBeLessThan(2);
    // The keyboard itself is still up (`vvH` stays at 331, not back to
    // 667), so the full 336px below the fitted Viewport's own bottom edge
    // is still covered.
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '336px'
    );
    expect(drawer.phase).toBe('open');
  });
});

describe('Brave’s shrinking layout viewport (real iPhone replay, WKWebView)', () => {
  beforeEach(() => mockReducedMotion());

  it('converges on every window resize step instead of freezing mid-animation, never double counting', async () => {
    mockInnerHeight(626);
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [1] });
    const { dialog, viewport, content, drawer } = fixture;
    const input = appendFieldTo(content);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);

    // Step 1 ("vv.resize", log #13): the keyboard opens; like Safari, it
    // pans first (`vvH` 363, `offsetTop` 263) before the layout viewport
    // itself starts shrinking.
    vv.height = 363;
    vv.offsetTop = 263;
    vv.resize();
    await nextFrame();
    expect(Math.abs(visibleRect(viewport).top - 263)).toBeLessThan(2);
    expect(Math.abs(visibleRect(viewport).height - 363)).toBeLessThan(2);

    // Step 2 ("win.resize", log #16): the layout viewport's own shrink
    // animation starts, un-panning in the same step -- `offsetTop` back to
    // 0, `innerHeight` already down to 558. `visualViewport` itself stays
    // put at 363 for the rest of the animation: #273's own code only read
    // the fit on a `visualViewport` event, so it never saw any of the
    // steps below, freezing at whatever it read here.
    vv.offsetTop = 0;
    mockInnerHeight(558);
    vv.scroll();
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(Math.abs(visibleRect(viewport).top - 0)).toBeLessThan(2);
    expect(Math.abs(visibleRect(viewport).height - 363)).toBeLessThan(2);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      `${558 - 363}px`
    );

    // Steps 3-6 ("win.resize", a representative subset of log #18-#33):
    // `innerHeight` keeps falling toward 363 (`vvH`'s own value) with no
    // further `visualViewport` event at all -- only `window` 'resize'.
    // Each step must re-read: the Viewport's own fitted rect never moves
    // (it was already exactly right, at `[0, 363]`), but the inset the fix
    // also exposes must keep tracking `innerHeight`, proving the read
    // itself did not freeze (#327's "double counting": a stale inset
    // subtracted a second time from an already-shrunk layout viewport).
    for (const iH of [520, 460, 410, 380]) {
      mockInnerHeight(iH);
      window.dispatchEvent(new Event('resize'));
      await nextFrame();
      const rect = visibleRect(viewport);
      expect(Math.abs(rect.top - 0)).toBeLessThan(2);
      expect(Math.abs(rect.height - 363)).toBeLessThan(2);
      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        `${iH - 363}px`
      );
    }

    // Final step ("vv.resize"/win.resize, log #34/#65): the layout viewport
    // finishes shrinking to exactly `visualViewport`'s own height -- the
    // `interactive-widget=resizes-content` end state, already handled by
    // the plain resize path, so the fit itself reverts to neutral.
    mockInnerHeight(363);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    expect(viewport.style.position).toBe('relative');
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '0px'
    );
    expect(drawer.phase).toBe('open');
  });
});

describe('expanding to the largest snap point (#327)', () => {
  beforeEach(() => mockReducedMotion());

  it('moves to the largest snap point when the keyboard would hide the focused field, and stays there once it closes', async () => {
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount({ snapPoints: [0.3, 1], onSnapPointChange });
    const { viewport, content, drawer } = fixture;

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    expect(drawer.snapIndex).toBe(0);

    // Positioned, from the Panel's own top, at half the Viewport's own
    // (pre-keyboard) extent -- past the 0.3 snap's own reveal (so hidden
    // at rest), comfortably inside the 1.0 snap's (so visible there), and
    // inside both before and after an 80px keyboard shrink shifts the
    // exact pixel math a little either way.
    const extent = viewport.clientHeight;
    const field = document.createElement('input');
    field.type = 'text';
    field.style.marginTop = `${extent * 0.5}px`;
    content.append(field);
    // Focus it directly (no real click target on screen at this scroll
    // position): `document.activeElement` is all `maybeExpandForKeyboard`
    // reads. `preventScroll` keeps this deterministic across browsers --
    // Chromium's own native scroll-into-view on focus reaches past the
    // Content's own locked `overflow: hidden` to the Viewport underneath
    // it, WebKit's does not, and neither is what this test means to check.
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);
    expect(field.getBoundingClientRect().top).toBeGreaterThan(
      viewport.getBoundingClientRect().bottom
    );

    vv.height = window.innerHeight - 80;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(onSnapPointChange).toHaveBeenCalledWith(1);
    const rect = field.getBoundingClientRect();
    const visible = viewport.getBoundingClientRect();
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

describe('a real tap on Close with the keyboard open (#327 finding 3)', () => {
  beforeEach(() => mockReducedMotion());

  it('lands the click on the Close button, not the outside gap it used to jump under', async () => {
    const vv = installFakeViewport();
    // A fractional snap point: the Panel's own top depends on the
    // Viewport's own extent (`panel.top === viewport.top + extent * (1 -
    // fraction)`), the same as the real demo's drawer, so reverting the fit
    // -- the Viewport's own `top`/height going back to neutral -- actually
    // moves the Panel, the way #273's own synchronous `focusout` drop did
    // on a real iPhone (PR #327 finding 3).
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, content, drawer } = fixture;
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

    // Pans, the way Safari's second field did (log #46/#47): the Viewport's
    // own top moves to 192, and its own height shrinks by 331 -- comfortably
    // more than the Close button's own size, so the Panel's own position
    // visibly depends on whether the fit is still applied when the click
    // lands.
    vv.height = window.innerHeight - 331;
    vv.offsetTop = 192;
    vv.resize();
    await nextFrame();
    expect(Math.abs(viewport.getBoundingClientRect().top - 192)).toBeLessThan(
      2
    );

    await userEvent.click(closeButton);

    // #273's own code dropped the inset synchronously on the input's own
    // `focusout` (fired by the click's own `pointerdown`, before its
    // `click`), snapping the Viewport's top back to 0 and carrying the
    // button down and out from under the real click's own, already-
    // dispatched coordinates -- landing on the Viewport's gap instead and
    // reading as an outside press. Fixed, nothing moves until
    // `visualViewport` itself confirms the keyboard closed, so the click
    // lands on the button the whole way through.
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    expect(onOpenChange).not.toHaveBeenCalledWith(false, 'outside-press');
  });
});

describe('the gap behind the keyboard (#327 finding 4c, a real iPhone screenshot)', () => {
  beforeEach(() => mockReducedMotion());

  it("keeps the drawer's own painted surface reaching the layout bottom behind the keyboard, while Close stays inside the visible window", async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, viewport, content, drawer } = fixture;
    const input = appendFieldTo(content);
    const closeButton = document.createElement('button');
    content.append(closeButton);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);

    vv.height = 331;
    vv.offsetTop = 45;
    vv.resize();
    await nextFrame();

    const visible = viewport.getBoundingClientRect();
    // Close stays inside the fitted, visible window -- the content and the
    // button never move down behind the keyboard.
    const closeRect = closeButton.getBoundingClientRect();
    expect(closeRect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(closeRect.bottom).toBeLessThanOrEqual(visible.bottom + 1);

    // Just below the fitted Viewport's own bottom edge -- the real gap a
    // screenshot caught (#327 finding 4c). `Drawer.Popup` already reaches
    // `window.innerHeight` on its own (`100dvh`, which does not shrink for
    // the keyboard), so this checks that it still does once a keyboard fit
    // is active, not a dedicated height write: a regression guard if the
    // Popup's own sizing ever does stop reaching that far.
    const x = Math.round((visible.left + visible.right) / 2);
    const y = Math.min(window.innerHeight - 1, Math.round(visible.bottom + 5));
    const atGap = document.elementFromPoint(x, y);
    expect(atGap).not.toBeNull();
    expect(dialog.contains(atGap)).toBe(true);
  });
});

describe('the exit runs its full declared duration even when the browser un-pans mid-exit (#327 finding 4)', () => {
  beforeEach(() => mockReducedMotion());

  /** The same recipe `css-transition.test.ts` uses: a real CSS transition on
   * `transform`, tied to `data-ending-style`. A Panel whose own CSS tracks
   * the Viewport's height (`panelHeight: '100%'` below, the site's own
   * `.drawer-demo__panel`) moves with it as the keyboard fit keeps tracking
   * the visible area mid-exit. This checks behavior, not an implementation
   * detail: an earlier version of this test instead asserted the Viewport's
   * own inline style never changed during the exit, which only proved a
   * `cssExiting` guard was in place, not that the exit itself ran
   * undisturbed (a CSS transition runs on elapsed time, not on the size of
   * the box it animates, so that guard was never what kept this exit from
   * being cut short). */
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

  it('keeps the exit running for its full 300ms, with data-ending-style on throughout, even though the browser un-pans mid-exit', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
    const { panel, content, viewport, drawer } = fixture;
    const input = appendFieldTo(content);
    const removeTransition = withTransformExitTransition(panel, {
      durationMs: 300
    });

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);
    // The second field's own pan (log #46/#47): chosen, not the first
    // field's, because it is the one case where #273's own formula still
    // read a nonzero inset (144px) -- the shrink actually has to happen for
    // the fit to have anything to revert when the browser un-pans below.
    vv.height = window.innerHeight - 331;
    vv.offsetTop = 192;
    vv.resize();
    await nextFrame();

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);

    // The browser un-pans mid-exit, the way Safari's own log showed (#327
    // finding 4, log #60): `offsetTop` back to 0, but `height` stays at
    // 331, the keyboard itself still up, only the pan reverted, and this
    // lands before the exit's own 300ms transition is anywhere near done.
    // The fit keeps tracking this (unlike #273's first cut, which
    // guarded the fit with `cssExiting` instead, freezing the Viewport at
    // the panned reading for the rest of the exit): the Viewport's own
    // rect follows the un-pan directly, proving the fit is still live, not
    // frozen, through the exit.
    vv.offsetTop = 0;
    vv.height = window.innerHeight - 336;
    vv.scroll();
    await nextFrame();
    const rect = visibleRect(viewport);
    expect(Math.abs(rect.top - 0)).toBeLessThan(2);
    expect(Math.abs(rect.bottom - (window.innerHeight - 336))).toBeLessThan(2);

    await sleep(150);
    // Well past half the declared duration: still mid-exit, not cut short
    // by the fit change above.
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);

    await sleep(110);
    // 260ms since the close: still short of the declared 300ms, so the
    // exit has not settled anywhere in between either.
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    removeTransition();
  });
});

describe('closing Done while the keyboard closes in the same tick (#327 finding 4b, a real iPhone replay)', () => {
  beforeEach(() => mockReducedMotion());

  /** Same recipe as `withTransformExitTransition` above: a real CSS
   * transition on `transform`, tied to `data-ending-style`. Duplicated
   * rather than hoisted, so this describe block stays self-contained. */
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

  it('runs the exit for its full 300ms, with the close-button reason, when the keyboard finishes closing (vv.resize to the full layout height) in the same tick as Done (log 12:04:50-51, run 3)', async () => {
    const vv = installFakeViewport();
    const iH = window.innerHeight;
    // `panelHeight: '100%'` matches the site's own recipe
    // (`.drawer-demo__panel { height: 100% }`): the Panel's `translateY`
    // percentage then resolves against the Viewport's own current height,
    // the same box the keyboard's fit resizes, not an arbitrary fixed
    // height unrelated to it.
    fixture = mount({ snapPoints: [0.5, 1] }, { panelHeight: '100%' });
    const { dialog, panel, content, viewport, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    const removeTransition = withTransformExitTransition(panel, {
      durationMs: 300
    });
    // A real tap, with a real `pointerdown`/`touchstart`/`pointerup`/`click`
    // sequence (log #56-62's own shape): pinned outside the fitted,
    // scrolled Viewport (`dialog`'s own direct child, never clipped or
    // scrolled away), so it stays a reliable, always-on-screen target
    // regardless of the snap index or the keyboard's own fit -- the real
    // click target itself is "a real tap on Close with the keyboard open",
    // above; this checks what a real tap's full event sequence does to the
    // exit, not whether the tap lands.
    const closeButton = document.createElement('button');
    dialog.append(closeButton);
    closeButton.addEventListener('click', () => drawer.close('close-button'));

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    // Positioned past the 0.5 snap's own reveal but inside the 1.0 snap's
    // (the same technique the "expanding to the largest snap point"
    // describe block above uses), so focusing it, with the keyboard's own
    // 331px visible window layered on top, expands the drawer to 1 --
    // log #53/#54's own "snap 1".
    const extent = viewport.clientHeight;
    const message = document.createElement('input');
    message.type = 'text';
    message.style.marginTop = `${extent * 0.3}px`;
    content.append(message);

    // Log #53/#54: the Message field focuses and the keyboard pans the
    // page, shrinking the visible window to 331px, offset 45px down --
    // past what the drawer's own 0.5 snap leaves visible, so this expands
    // it to 1 (the largest point).
    await userEvent.click(message);
    vv.height = 331;
    vv.offsetTop = 45;
    vv.resize();
    await nextFrame();
    expect(drawer.snapIndex).toBe(1);

    // Log #56-67: a real tap lands on Done.
    await userEvent.click(closeButton);
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();

    // Log #68: the keyboard finishes closing in the very same tick as the
    // click above -- no frame in between, the way the real device logged
    // both at 12:04:51 -- `vvH` back to the full 701, `offsetTop` back to
    // 0: the fit reverts the Viewport (and, through its own `height: 100%`,
    // the Panel) all the way back to neutral while the exit's own 300ms
    // transition has barely started. The phase and `data-ending-style`
    // both hold through this and the sleeps below either way -- what a
    // prior cut of this fix got wrong was the Panel's own painted
    // position, not either of those: it left `scrollTop` at the smaller,
    // fitted Viewport's own value, so the Viewport's visible window moved
    // out from under the Panel the moment its scrollable range grew back
    // to the full layout height, dropping the Panel off screen well
    // before 300ms while `closing`/`data-ending-style` kept reading as if
    // nothing had happened.
    vv.height = iH;
    vv.offsetTop = 0;
    vv.resize();

    // Right when the keyboard finishes closing, the Panel is still
    // painted flush with the Viewport's own top -- not already partway
    // down it from a stale scroll position.
    const viewportRect = viewport.getBoundingClientRect();
    expect(panelVisiblePx(panel, viewport)).toBeGreaterThan(
      viewportRect.height - 5
    );

    await sleep(150);
    // Well past half the declared duration: still mid-exit, not cut short
    // by the keyboard finishing its own close above, and the Panel is
    // still substantially on screen -- a stale scroll position moving the
    // Viewport's own visible window would already have dropped it off
    // screen by now.
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);
    expect(panelVisiblePx(panel, viewport)).toBeGreaterThan(
      viewport.getBoundingClientRect().height * 0.3
    );

    await sleep(110);
    // 260ms since the close: still short of the declared 300ms.
    expect(drawer.phase).toBe('closing');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });

  it('still lets a real user scroll mid-exit finish it at once, same as #268 always has, even right after the keyboard’s own fit change', async () => {
    const vv = installFakeViewport();
    const iH = window.innerHeight;
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

    // The keyboard's own fit change, same as the test above -- never an
    // interruption on its own.
    vv.height = iH;
    vv.offsetTop = 0;
    vv.resize();
    expect(drawer.phase).toBe('closing');

    // A real touch grabbing the viewport, the same gesture
    // `css-transition.test.ts` already proves ends an exit at once
    // (#268's design ruling: an interruption never cancels a close, it
    // just stops waiting for the transition). This must still work
    // exactly as before, immediately behind the engine's own fit change
    // above.
    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(drawer.phase).toBe('closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });
});

describe('scrolling the focused field into view on a fit change (#327)', () => {
  beforeEach(() => mockReducedMotion());

  /** Enough rows before the field that Content's own natural height (the
   * site's real layout: a Panel sized to the Viewport, `panelHeight: '100%'`
   * below, with Content filling whatever is left of it) is well short of
   * them: unlocking `overflow-y` (`updateContentLock`) does not itself
   * scroll Content to reveal anything past its own `clientHeight`, and a
   * fixed, overlong Panel (the other describe blocks' default fixture)
   * never asks Content to scroll at all, so neither proves this on its
   * own. This mirrors PR #327's own repro: Content unlocks with
   * `scrollHeight` well past `clientHeight`, but the field stays outside
   * the visible area until something actually scrolls it in. */
  function appendFieldPastTheFold(content: HTMLElement) {
    for (let i = 0; i < 20; i += 1) {
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

  it('scrolls the field in once expanding to the largest snap point alone leaves it outside the fitted Viewport', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] }, { panelHeight: '100%' });
    const { viewport, content, drawer } = fixture;
    const field = appendFieldPastTheFold(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);

    // Safari's first-field pan (log #32): `vvH` drops by 336px.
    vv.height = window.innerHeight - 336;
    vv.offsetTop = 336;
    vv.resize();
    await nextFrame();

    expect(drawer.snapIndex).toBe(1);
    expect(content.style.overflowY).toBe('auto');
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    const rect = field.getBoundingClientRect();
    const visible = visibleRect(viewport);
    expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
  });

  it('scrolls the field in on a fit change even when the drawer is already at its largest snap point, with nothing left to expand to', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [1] }, { panelHeight: '100%' });
    const { viewport, content, drawer } = fixture;
    const field = appendFieldPastTheFold(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    field.focus({ preventScroll: true });
    expect(document.activeElement).toBe(field);

    vv.height = window.innerHeight - 336;
    vv.offsetTop = 336;
    vv.resize();
    await nextFrame();

    // Already at the (only) largest snap point: `maybeExpandForKeyboard`
    // never moves it, so `ensureFieldVisible` is the only thing that can
    // still bring the field into view here.
    expect(drawer.snapIndex).toBe(0);
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    const rect = field.getBoundingClientRect();
    const visible = visibleRect(viewport);
    expect(rect.top).toBeGreaterThanOrEqual(visible.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(visible.bottom + 1);
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

    vv.height = window.innerHeight - 260;
    vv.resize();
    await nextFrame();
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '260px'
    );

    // Pinch-zoomed, then a further shrink: the zoom itself changes
    // `visualViewport.height` for a reason that has nothing to do with the
    // keyboard, so this must not move the fit at all.
    vv.scale = 1.75;
    vv.height = window.innerHeight - 400;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '260px'
    );
    expect(
      Math.abs(visibleRect(viewport).height - (window.innerHeight - 260))
    ).toBeLessThan(2);
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
    const { dialog, viewport, drawer } = fixture;

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    // `interactive-widget=resizes-content`: the layout viewport itself
    // shrinks (`window.innerHeight`), and `visualViewport` tracks it
    // exactly, with no gap between them -- the fit nets to neutral, so it
    // writes nothing and leaves the Viewport's own position and height
    // alone. The real CSS shrink this causes through `100dvh` is a plain
    // window resize, already proven in `index.test.ts`'s own "a resize"
    // cases, not retested here.
    mockInnerHeight(500);
    vv.height = 500;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(viewport.style.height).toBe('100%');
    expect(drawer.snapIndex).toBe(0);
    expect(drawer.phase).toBe('open');
  });

  it('still reflects a real layout shrink through the existing resize path, inset untouched', async () => {
    mockInnerHeight(800);
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, drawer } = fixture;
    dialog.style.height = '800px';

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');

    // The layout viewport itself shrinks (`index.test.ts`'s own "a resize"
    // tests already cover this path in full); this only checks that the
    // keyboard feature stays out of its way when there is no visual/layout
    // gap to react to.
    mockInnerHeight(500);
    dialog.style.height = '500px';
    window.dispatchEvent(new Event('resize'));
    vv.height = 500;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(viewport.style.height).toBe('100%');
    await expect.poll(() => viewport.clientHeight).toBeCloseTo(500, 0);
    expect(drawer.phase).toBe('open');
  });
});

describe('every side (#270)', () => {
  beforeEach(() => mockReducedMotion());

  const sides: Side[] = ['bottom', 'top', 'left', 'right'];
  for (const side of sides) {
    it(`side="${side}": fits the Viewport's own height and keeps the snap index`, async () => {
      const vv = installFakeViewport();
      fixture = mount({ side, snapPoints: [0.5, 1] });
      const { dialog, viewport, drawer } = fixture;

      drawer.open(0);
      await expectSettledTo(() => drawer.phase, 'open');

      vv.height = window.innerHeight - 240;
      vv.resize();
      await nextFrame();

      expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
        '240px'
      );
      expect(
        Math.abs(visibleRect(viewport).height - (window.innerHeight - 240))
      ).toBeLessThan(2);
      expect(drawer.snapIndex).toBe(0);
      expect(drawer.phase).toBe('open');
    });
  }
});

// A Panel whose own CSS gives it `height: 100%` (the site's own
// `.drawer-demo__panel`), not the fixed, overlong one every other test here
// mounts with: it tracks the Viewport's own height, so the instant fit
// (or a plain window resize, `resizes-content`) shrinks that, the Panel
// shrinks with it and the browser clamps `scrollTop` to the new, smaller
// `scrollHeight`, synchronously, ahead of any JS here. A drawer resting at
// its *last* snap point (full open, the Viewport's own old maximum scroll
// position) is exactly where that clamp bites hardest.
describe('a Panel that tracks the Viewport (height: 100%)', () => {
  beforeEach(() => mockReducedMotion());

  it('keeps the snap index through the overlay keyboard opening and closing, with no spurious onSnapPointChange', async () => {
    const vv = installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount(
      { snapPoints: [0.5, 1], onSnapPointChange },
      { panelHeight: '100%' }
    );
    const { dialog, viewport, drawer } = fixture;

    drawer.open(1);
    await expectSettledTo(() => drawer.phase, 'open');

    const keyboardPx = 300;
    vv.height = window.innerHeight - keyboardPx;
    vv.resize();
    // `scrollend` (or its debounce fallback) lands after the fit's own
    // synchronous work: only once the scroll position actually settles
    // does the bug this guards show up, re-indexing onto whatever point
    // the clamp happened to land nearest.
    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      `${keyboardPx}px`
    );
    expect(drawer.phase).toBe('open');

    vv.height = window.innerHeight;
    vv.resize();
    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '0px'
    );
    expect(viewport.style.height).toBe('100%');
    expect(drawer.phase).toBe('open');

    expect(onSnapPointChange).not.toHaveBeenCalled();
  });

  it('keeps the snap index through a plain window resize (resizes-content), with no spurious onSnapPointChange', async () => {
    mockInnerHeight(800);
    installFakeViewport();
    const onSnapPointChange = vi.fn();
    fixture = mount(
      { snapPoints: [0.5, 1], onSnapPointChange },
      { panelHeight: '100%' }
    );
    const { dialog, drawer } = fixture;
    dialog.style.height = '800px';

    drawer.open(1);
    await expectSettledTo(() => drawer.phase, 'open');

    // The layout viewport itself shrinks: no visual/layout gap, so the
    // inset stays 0 and the existing resize path alone has to keep the
    // snap index.
    mockInnerHeight(500);
    dialog.style.height = '500px';
    window.dispatchEvent(new Event('resize'));

    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    expect(drawer.phase).toBe('open');
    expect(onSnapPointChange).not.toHaveBeenCalled();
    dialog.style.height = '';
  });
});

describe('non-modal (#271)', () => {
  beforeEach(() => mockReducedMotion());

  it('the hit area stays correct: nothing below the smaller Viewport is reachable', async () => {
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

    // Fully open: the Panel fills the Viewport, so a point near the
    // window's own bottom edge still hits the Viewport, not the page.
    expect(
      viewport.contains(document.elementFromPoint(25, window.innerHeight - 10))
    ).toBe(true);

    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();

    // The Viewport's own bottom edge is now 300px higher: that same point
    // falls through to the page input behind it.
    expect(
      viewport.contains(document.elementFromPoint(25, window.innerHeight - 10))
    ).toBe(false);
    expect(document.elementFromPoint(25, window.innerHeight - 10)).toBe(behind);
    behind.remove();
  });
});

describe('cleanup', () => {
  beforeEach(() => mockReducedMotion());

  it('removes both visualViewport listeners on close, and attaches fresh ones on reopen', async () => {
    const vv = installFakeViewport();
    const addSpy = vi.spyOn(vv, 'addEventListener');
    const removeSpy = vi.spyOn(vv, 'removeEventListener');
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
    addSpy.mockClear(); // drop the engine's own, unrelated permanent listener.

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const addedTypes = addSpy.mock.calls.map(([type]) => type).sort();
    expect(addedTypes).toEqual(['resize', 'scroll']);

    drawer.close();
    await expectSettledTo(() => drawer.phase, 'closed');
    const removedTypes = removeSpy.mock.calls.map(([type]) => type).sort();
    expect(removedTypes).toEqual(['resize', 'scroll']);

    // Closed: the keyboard changing now must do nothing at all.
    vv.height = window.innerHeight - 300;
    vv.resize();
    await sleep(50);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
    // Nor must a plain window resize: the Brave-only listener this feature
    // also adds while open is torn down too.
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

  it('removes both visualViewport listeners on destroy', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
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

    vv.height = window.innerHeight - 300;
    vv.resize();
    await sleep(50);
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe('');
  });
});
