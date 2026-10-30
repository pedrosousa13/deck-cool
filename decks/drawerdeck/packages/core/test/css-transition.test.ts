// The CSS entrance and exit (#268): open sets scrollTop straight to the
// snap point and gives the Panel and the Backdrop `data-starting-style`,
// surviving one painted frame before coming off, so a consumer's own CSS
// transition slides and fades them in; a programmatic close, Escape, an
// outside press or `Drawer.Close` gives the Panel and the Backdrop
// `data-ending-style` and waits for the Panel's own `transitionend` (or a
// timeout, or not at all) before closing the dialog. A drag or a flick
// dismissal is untouched by any of this -- see `index.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  expectSettledTo,
  mount,
  sleep,
  unmount,
  type Fixture
} from './fixtures';

let fixture: Fixture | undefined;
afterEach(() => {
  if (fixture) unmount(fixture);
  fixture = undefined;
  vi.restoreAllMocks();
});

/** Resolves on the browser's own next animation frame -- never a fake
 * timer -- so a test can check what the entrance did, or did not, do by
 * then. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Gives `el` a real CSS transition tied to `data-starting-style` and
 * `data-ending-style`, the way a consumer's own recipe does (the "Animate
 * the drawer" guide): a `<style>` scoped to a unique marker attribute, so
 * one test's transition never leaks into another's. Returns the cleanup. */
function withTransition(
  el: HTMLElement,
  {
    durationMs,
    property = 'opacity'
  }: { durationMs: number; property?: string }
): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    [${marker}] { ${property}: 1; transition: ${property} ${durationMs}ms linear; }
    [${marker}][data-starting-style], [${marker}][data-ending-style] { ${property}: 0; }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** The same recipe as `withTransition`, but on `transform`: the one the
 * documented recipe actually ships, and the one the broken entrance could
 * set and remove without ever painting in between. `translateY(100%)` is
 * big enough, against the fixture's tall panel, that a real transition's
 * mid-flight value is never mistakable for 0. */
function withTransformTransition(
  el: HTMLElement,
  { durationMs }: { durationMs: number }
): () => void {
  const marker = `data-test-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(marker, '');
  const style = document.createElement('style');
  style.textContent = `
    [${marker}] { transform: translateY(0); transition: transform ${durationMs}ms linear; }
    [${marker}][data-starting-style], [${marker}][data-ending-style] { transform: translateY(100%); }
  `;
  document.head.append(style);
  return () => {
    style.remove();
    el.removeAttribute(marker);
  };
}

/** The `f` component (vertical translation) of a computed `transform`'s
 * 2D matrix, or 0 for `'none'`: a real transition's mid-flight value is
 * never exactly 0, which is what the broken entrance -- the Panel's
 * transform frozen at `matrix(1,0,0,1,0,0)` for its whole run -- always
 * read as. */
function translateY(transform: string): number {
  if (transform === 'none') return 0;
  const match = /matrix\(([^)]+)\)/.exec(transform);
  if (!match) return NaN;
  const parts = match[1].split(',').map(Number);
  return parts[5];
}

/** The alpha channel of a computed `rgb(a)` color, or 1 for one with none. */
function alphaOf(color: string): number {
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (!match) return 1;
  const parts = match[1].split(',').map((part) => Number.parseFloat(part));
  return parts.length > 3 ? parts[3] : 1;
}

/** The Backdrop's actual dim: its own `opacity` (the entrance/exit fade)
 * times its `background-color`'s alpha (the scroll-driven dim, "Style the
 * backdrop"), the way the two compose (#268). */
function dimOf(el: Element): number {
  const style = getComputedStyle(el);
  return Number.parseFloat(style.opacity) * alphaOf(style.backgroundColor);
}

/** Declares a transition-duration on `el` for a property nothing ever
 * actually changes: `getComputedStyle` reports it (so the engine waits),
 * but no transition ever starts, so `transitionend` never fires -- the
 * only way to exercise the timeout fallback deterministically. */
function withUnfireableDuration(
  el: HTMLElement,
  durationMs: number
): () => void {
  const prevProperty = el.style.transitionProperty;
  const prevDuration = el.style.transitionDuration;
  el.style.transitionProperty = 'color';
  el.style.transitionDuration = `${durationMs}ms`;
  return () => {
    el.style.transitionProperty = prevProperty;
    el.style.transitionDuration = prevDuration;
  };
}

describe('the CSS entrance', () => {
  it('sets scrollTop to the snap point and data-starting-style on the Panel and the Backdrop before the first paint, surviving one full painted frame', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, backdrop, drawer } = fixture;

    drawer.open();

    // Synchronous: both already true, before any frame has painted.
    const expected = Math.round(viewport.clientHeight * 0.5);
    expect(Math.abs(viewport.scrollTop - expected)).toBeLessThan(2);
    expect(panel.hasAttribute('data-starting-style')).toBe(true);
    expect(backdrop.hasAttribute('data-starting-style')).toBe(true);
    expect(drawer.phase).toBe('opening');

    await nextFrame();

    // Still mid-entrance: the attribute survives one whole painted frame,
    // so the browser has actually committed the starting style -- this is
    // what a single `requestAnimationFrame` here skipped, and why its
    // removal a frame later had nothing real to transition from.
    expect(panel.hasAttribute('data-starting-style')).toBe(true);
    expect(backdrop.hasAttribute('data-starting-style')).toBe(true);

    await nextFrame();

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(backdrop.hasAttribute('data-starting-style')).toBe(false);
    expect(drawer.phase).toBe('open');
  });

  it('really moves: the Panel slides from translateY(100%) to 0 over a real 300ms entrance, and the Backdrop’s dim rises with it', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, backdrop, drawer } = fixture;
    const removePanelTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    const removeBackdropTransition = withTransition(backdrop, {
      durationMs: 300
    });
    // A fixed alpha, never 1, so the dim's product can only have risen
    // because `opacity` did -- proving the two actually compose, the way
    // "Style the backdrop" promises, rather than the alpha alone reading as
    // the whole dim.
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';

    drawer.open();
    await sleep(10);
    // Early into the entrance: still close to its starting style.
    const startY = translateY(getComputedStyle(panel).transform);
    const startDim = dimOf(backdrop);

    await expectSettledTo(() => drawer.phase, 'open');
    const endY = translateY(getComputedStyle(panel).transform);
    const endDim = dimOf(backdrop);

    expect(startY).toBeGreaterThan(1000);
    expect(endY).toBe(0);
    expect(endDim).toBeGreaterThan(startDim);
    removePanelTransition();
    removeBackdropTransition();
  });

  it('writes the Panel’s attribute once to start the entrance and once to end it, nothing more', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, drawer } = fixture;
    const setAttr = vi.spyOn(panel, 'setAttribute');
    const removeAttr = vi.spyOn(panel, 'removeAttribute');

    drawer.open();
    await nextFrame();
    await nextFrame();
    await nextFrame();

    const starts = setAttr.mock.calls.filter(
      ([name]) => name === 'data-starting-style'
    );
    const ends = removeAttr.mock.calls.filter(
      ([name]) => name === 'data-starting-style'
    );
    expect(starts).toHaveLength(1);
    expect(ends).toHaveLength(1);
    expect(drawer.phase).toBe('open');
  });

  it('without snapPoints, still opens straight to the panel’s content height', () => {
    fixture = mount({}, { panelHeight: '200px' });
    const { viewport, panel, drawer } = fixture;

    drawer.open();

    expect(Math.abs(viewport.scrollTop - 200)).toBeLessThan(2);
    expect(panel.hasAttribute('data-starting-style')).toBe(true);
  });
});

describe('the CSS exit', () => {
  it('sets data-ending-style on the Panel and the Backdrop, and does not close until the Panel’s transitionend', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, backdrop, dialog, drawer } = fixture;
    const removeTransition = withTransition(panel, { durationMs: 50 });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.close('close-button');

    expect(panel.hasAttribute('data-ending-style')).toBe(true);
    expect(backdrop.hasAttribute('data-ending-style')).toBe(true);
    expect(dialog.open).toBe(true);
    expect(drawer.phase).toBe('closing');

    await sleep(10);
    // Still mid-transition: well under the 50ms duration.
    expect(dialog.open).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    expect(backdrop.hasAttribute('data-ending-style')).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });

  it('really moves: the Panel slides from 0 toward translateY(100%) over a real 300ms exit, and the Backdrop’s dim falls with it', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, backdrop, drawer } = fixture;
    const removePanelTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    const removeBackdropTransition = withTransition(backdrop, {
      durationMs: 300
    });
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const openDim = dimOf(backdrop);

    drawer.close('close-button');
    await sleep(200);

    // Well into the exit: most of the way toward fully below the viewport.
    const midY = translateY(getComputedStyle(panel).transform);
    const midDim = dimOf(backdrop);
    expect(midY).toBeGreaterThan(1000);
    expect(midDim).toBeLessThan(openDim);

    await expectSettledTo(() => drawer.phase, 'closed');
    removePanelTransition();
    removeBackdropTransition();
  });

  it('a transform exit that carries the Panel out of view early still waits for its own close path, closing exactly once (#296)', async () => {
    // The leave-view observer (`index.ts`'s `panelVisibilityObserver`)
    // would otherwise read this exact moment -- the Panel's visible
    // sliver long gone, well before the transition's own 300ms are up --
    // as a close to act on itself. A CSS exit already owns this close,
    // so it must not: `dialog.open` stays true until the exit's own
    // transitionend, and `onOpenChange` fires once, not twice.
    fixture = mount({ snapPoints: [0.5] });
    const { panel, dialog, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.close('close-button');
    await sleep(100);

    // Well under a third of the way into the transition, but already far
    // more than enough to have carried the Panel's small visible sliver
    // (half the viewport, against a panel comfortably taller than it)
    // fully out of view.
    expect(translateY(getComputedStyle(panel).transform)).toBeGreaterThan(0);
    expect(drawer.phase).toBe('closing');
    expect(dialog.open).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });

  it('closes immediately, synchronously, when no transition is defined', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');

    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
  });

  it('closes after the computed transition duration plus a margin, when transitionend never fires', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, drawer } = fixture;
    const restore = withUnfireableDuration(panel, 30);
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    expect(dialog.open).toBe(true);

    await sleep(10);
    expect(dialog.open).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    restore();
  });

  it('every programmatic reason reaches onOpenChange once the exit settles', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('programmatic');

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, 'programmatic');
    expect(dialog.open).toBe(false);
  });
});

describe('interrupting the entrance or the exit', () => {
  it('a touch during the entrance ends it at once, settled at the snap point', () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    expect(panel.hasAttribute('data-starting-style')).toBe(true);

    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(drawer.phase).toBe('open');
  });

  it('a wheel during the entrance ends it at once', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });

    drawer.open();
    await sleep(120);
    // Still mid-flight.
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(translateY(getComputedStyle(panel).transform)).toBe(0);
    expect(drawer.phase).toBe('open');
    removeTransition();
  });

  it('a tap (pointer down) with no scroll during the entrance ends it at once', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });

    drawer.open();
    await sleep(120);
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })
    );

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(translateY(getComputedStyle(panel).transform)).toBe(0);
    expect(drawer.phase).toBe('open');
    removeTransition();
  });

  it('a touch during the exit ends it at once, closing now with the original reason', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, backdrop, dialog, drawer } = fixture;
    // Long enough that it cannot settle on its own before the interrupt.
    const removeTransition = withTransition(panel, { durationMs: 1000 });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');

    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    // An interruption never cancels a close (#268's design ruling): the
    // dialog is closed now, not reopened.
    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    expect(backdrop.hasAttribute('data-ending-style')).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    removeTransition();
  });

  it('a wheel during the exit ends it at once, closing -- the dialog itself, not just the attribute, so the Panel’s own transform is moot once it is hidden', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, dialog, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    await sleep(120);
    // Still mid-flight, easing back down toward translateY(100%).
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));

    // Closes now, with the close already under way -- not reopened: an
    // interruption never cancels a close (#268's design ruling).
    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    removeTransition();
  });

  it('a tap (pointer down) with no scroll during the exit ends it at once, closing', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, dialog, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    await sleep(120);
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })
    );

    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    removeTransition();
  });

  it('a touch about 120ms into a real 300ms entrance ends it at once: the Panel is at translateY(0) right away', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });

    drawer.open();
    await sleep(120);
    // Still mid-flight -- the bug #268 found: by here, the old code had
    // already detached the listeners and called this a no-op.
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(translateY(getComputedStyle(panel).transform)).toBe(0);
    expect(drawer.phase).toBe('open');
    removeTransition();
  });

  it('a touch about 120ms into a real 300ms exit ends it at once: the dialog is closed right away', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, dialog, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    await sleep(120);
    // Still mid-flight, easing back down toward translateY(100%).
    expect(translateY(getComputedStyle(panel).transform)).not.toBe(0);

    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));

    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
    removeTransition();
  });

  it('leaves no interrupt listener behind once settled: a later touch does nothing special', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    // Not mid-entrance or mid-exit: a touch is just a touch.
    expect(() =>
      viewport.dispatchEvent(new Event('touchstart', { bubbles: true }))
    ).not.toThrow();
    expect(drawer.phase).toBe('open');
  });

  it('a touch mid-entrance, then an immediate close, still animates the exit -- not a stale transitionend from the entrance’s own finish (#268)', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });

    drawer.open();
    await sleep(60);
    // Mid-entrance: the interrupt calls `Animation.finish()` on the
    // entrance's own CSSTransition, which queues a `transitionend` a
    // listener reading only `event.target` could mistake for the exit's
    // own, started right after it in the same tick.
    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(drawer.phase).toBe('open');

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');

    await sleep(100);
    // Genuinely animating, not already settled by that stale event: still
    // well short of its ending value.
    const midY = translateY(getComputedStyle(panel).transform);
    expect(midY).toBeGreaterThan(0);
    expect(midY).toBeLessThan(1900);
    expect(drawer.phase).toBe('closing');

    await expectSettledTo(() => drawer.phase, 'closed');
    removeTransition();
  });

  it('Escape about 100ms into a real 300ms entrance reverses the Panel smoothly -- never jumping toward 0 before easing back out (#268)', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.open();
    await sleep(100);
    const pressY = translateY(getComputedStyle(panel).transform);
    // Genuinely mid-flight: still easing down from translateY(100%).
    expect(pressY).toBeGreaterThan(0);

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    // Sample every frame right after the keypress: a reversed CSS
    // transition eases back up from here, never dipping back toward 0
    // first -- the bug landing `finishEnter()` (jumping the Panel to
    // translateY(0)) before `beginExit()` started the exit's own
    // transition back out. A CSS transition reversed mid-flight shortens
    // itself (the reversing-adjusted duration the spec gives it), so the
    // exit can settle well under the nominal 300ms: stop sampling once it
    // has -- a closed dialog's panel reads `transform: none` (0), which is
    // the settle, not a jump.
    for (let i = 0; i < 12; i++) {
      await nextFrame();
      if (drawer.phase !== 'closing') break;
      const sample = translateY(getComputedStyle(panel).transform);
      expect(sample).toBeGreaterThanOrEqual(pressY - 0.5);
    }

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'escape');
    expect(
      onOpenChange.mock.calls.filter(([open]) => open === false)
    ).toHaveLength(1);
    removeTransition();
  });
});

describe('a native close mid-exit keeps the close’s own reason (#268)', () => {
  it('a second Escape that closes the dialog natively, bypassing its own preventDefault(), still reports the original reason once', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, backdrop, dialog, drawer } = fixture;
    // Long enough that the exit is still running when the native close
    // lands.
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');

    await sleep(100);
    // Genuinely mid-flight: well under the 300ms exit.
    const midY = translateY(getComputedStyle(panel).transform);
    expect(midY).toBeGreaterThan(0);
    expect(midY).toBeLessThan(1900);

    // A second Escape here fires `cancel` (handled: 'closing' starts
    // nothing new) and, in both Chromium and WebKit, can still close the
    // dialog natively despite that `cancel`'s own `preventDefault()`
    // (#268's second bug) -- the dialog's own `close` firing with no
    // `cancel` of its own, which calling the real `close()` reproduces.
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.close();
    // `close()` removes the `open` attribute synchronously, but fires its
    // own `close` event -- `onNativeClose`'s own listener -- on a queued
    // task.
    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    expect(backdrop.hasAttribute('data-ending-style')).toBe(false);
    // The exit's own reason, not 'escape': a close finished mid-exit keeps
    // the reason it already carries.
    expect(onOpenChange).toHaveBeenCalledWith(false, 'close-button');
    expect(
      onOpenChange.mock.calls.filter(([open]) => open === false)
    ).toHaveLength(1);
    removeTransition();
  });

  it('a close() started programmatically, finished the same way, reports "programmatic" too', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, dialog, drawer } = fixture;
    const removeTransition = withTransformTransition(panel, {
      durationMs: 300
    });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.close('programmatic');
    expect(drawer.phase).toBe('closing');

    await sleep(100);
    expect(translateY(getComputedStyle(panel).transform)).toBeGreaterThan(0);

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.close();

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, 'programmatic');
    expect(
      onOpenChange.mock.calls.filter(([open]) => open === false)
    ).toHaveLength(1);
    removeTransition();
  });
});

describe('interrupting the entrance and the exit with the scroll-timeline dim applied', () => {
  it('leaves the Backdrop’s dim tracking scrollTop on a later drag, not stuck wherever the interrupt finished it', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, panel, backdrop, drawer } = fixture;
    const removePanelTransition = withTransition(panel, { durationMs: 300 });
    const removeBackdropTransition = withTransition(backdrop, {
      durationMs: 300
    });
    // The "Style the backdrop" recipe: a scroll-timeline `CSSAnimation` on
    // `background-color`, composing with the Backdrop's own entrance/exit
    // `opacity` transition above by multiplying rather than one replacing
    // the other -- the same two animations `onInterrupt`'s
    // `finishTransition` must tell apart.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      '@keyframes drawerdeck-test-dim {' +
        'from { background-color: rgb(0 0 0 / 0); }' +
        'to { background-color: rgb(0 0 0 / 0.5); }' +
        '}' +
        '[data-test-dim] {' +
        'background-color: rgb(0 0 0 / 0);' +
        'animation: drawerdeck-test-dim 1s linear;' +
        'animation-timeline: --drawer;' +
        'animation-range: 0 var(--drawer-first-snap);' +
        'animation-fill-mode: both;' +
        '}'
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    backdrop.setAttribute('data-test-dim', '');

    drawer.open();
    // The scroll-driven `CSSAnimation` only exists once the dialog is
    // actually showing (a <dialog> with no `open` attribute renders
    // nothing): `showModal()`, inside `open()` above, already ran. Its
    // identity stays stable for as long as `data-test-dim` does, unlike
    // the Backdrop's own entrance/exit `opacity` transition, which a
    // `data-ending-style`/`data-starting-style` change cancels and
    // replaces -- so spying on *this* one is the reliable way to tell
    // whether `finishTransition` reached into it.
    const dimAnimation = backdrop
      .getAnimations()
      .find((a) => a instanceof CSSAnimation);
    expect(dimAnimation).toBeDefined();
    const dimFinish = vi.spyOn(dimAnimation!, 'finish');
    await sleep(60);

    // Mid-entrance: the interrupt finishes the Backdrop's own `opacity`
    // transition. The bug finished the scroll-driven dim right along with
    // it, detaching it from the scroll position for good.
    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(drawer.phase).toBe('open');
    expect(dimFinish).not.toHaveBeenCalled();
    // Lets the finished entrance transition's own (late, asynchronous)
    // `transitionend` flush before the exit attaches its own listener for
    // the same element -- otherwise it can land there instead.
    await sleep(50);

    drawer.close('close-button');
    await sleep(60);

    // Mid-exit, the same way -- a second chance for the bug to stick. An
    // interrupted exit now closes the dialog instead of cancelling it
    // (#268's design ruling), tearing this CSSAnimation down along with
    // everything else the dialog owns, so the spy itself cannot keep
    // proving anything past this point.
    viewport.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(drawer.phase).toBe('closed');
    expect(dimFinish).not.toHaveBeenCalled();

    // Reopens: a fresh scroll-driven `CSSAnimation`, the same recipe,
    // tracks `scrollTop` from scratch.
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    // Behaviour, not just the spy: the dim follows a later drag, the way
    // it would have if nothing had ever interrupted it.
    const firstSnapPx = Number.parseFloat(
      dialog.style.getPropertyValue('--drawer-first-snap')
    );
    const box = panel.getBoundingClientRect();
    const startX = box.left + 10;
    const startY = box.top + 10;
    const firePointer = (type: string, y: number) =>
      panel.dispatchEvent(
        new PointerEvent(type, {
          clientX: startX,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse',
          button: 0,
          bubbles: true,
          cancelable: true
        })
      );

    firePointer('pointerdown', startY);
    const step = firstSnapPx * 0.25;
    let y = startY;
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      y += step;
      firePointer('pointermove', y);
      // A scroll-driven animation's computed value updates on the next
      // frame, not synchronously with the `scrollTop` write that drives
      // it.
      await sleep(80);
      samples.push(alphaOf(getComputedStyle(backdrop).backgroundColor));
    }
    firePointer('pointerup', y);

    // scrollTop at 0.75, 0.5 and 0.25 of the first snap point: the dim's
    // alpha, 0 to 0.5 over that same range, still follows it.
    expect(samples[0]).toBeCloseTo(0.75 * 0.5, 1);
    expect(samples[1]).toBeCloseTo(0.5 * 0.5, 1);
    expect(samples[2]).toBeCloseTo(0.25 * 0.5, 1);

    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (s) => s !== sheet
    );
    removePanelTransition();
    removeBackdropTransition();
  });
});

describe('a resize during the entrance', () => {
  it('reconciles onto the new snap offset, not the one it opened to', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, viewport, drawer } = fixture;
    dialog.style.height = '800px';

    drawer.open();
    expect(drawer.phase).toBe('opening');
    expect(Math.abs(viewport.scrollTop - 400)).toBeLessThan(2);

    dialog.style.height = '600px';
    window.dispatchEvent(new Event('resize'));
    await nextFrame();

    // Reconciled while still mid-entrance: the new viewport's own 0.5
    // snap offset (300px), not the 800px one it opened to (400px).
    expect(drawer.phase).toBe('opening');
    expect(Math.abs(viewport.scrollTop - 300)).toBeLessThan(2);

    await expectSettledTo(() => drawer.phase, 'open');
    expect(Math.abs(viewport.scrollTop - 300)).toBeLessThan(2);
    dialog.style.height = '';
  });
});

describe('a resize during the exit', () => {
  it('does not settle the exit early through a stale scrollend, and it still closes', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, panel, drawer } = fixture;
    const removeTransition = withTransition(panel, { durationMs: 60 });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    expect(drawer.phase).toBe('closing');

    dialog.style.height = '500px';
    window.dispatchEvent(new Event('resize'));

    // Still closing: the resize's own `scrollTo` (and whatever scrollend
    // follows it) did not read as a native settle mid-exit.
    expect(drawer.phase).toBe('closing');

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    removeTransition();
    dialog.style.height = '';
  });
});

describe('repeated open and close', () => {
  it('ten fast cycles with no transition end settled closed, synchronously', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;

    for (let i = 0; i < 10; i++) {
      drawer.open();
      drawer.close('close-button');
    }

    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);

    // The engine still works normally afterward.
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
  });

  it('ten fast cycles ending on open settle open, with no stray attribute left over', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { panel, drawer } = fixture;

    for (let i = 0; i < 9; i++) {
      drawer.open();
      drawer.close('close-button');
    }
    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
  });

  it('ten fast cycles with a real transition never let an earlier, finished exit’s timer fire late', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, drawer } = fixture;
    // Long enough that none of the nine exits this loop finishes early
    // (each one's own `open()`, immediately after, is what finishes it --
    // #268's design ruling: an interruption never cancels a close) could
    // complete on its own before this test's own assertions run.
    const removeTransition = withTransition(panel, { durationMs: 1000 });

    for (let i = 0; i < 9; i++) {
      drawer.open();
      drawer.close('close-button');
    }
    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open', 6000);
    expect(dialog.open).toBe(true);
    // None of the nine earlier exits' long timeout fallbacks leaked past
    // the `open()` call that finished each of them early, to close the
    // dialog out from under this final, settled open.
    await sleep(1200);
    expect(drawer.phase).toBe('open');
    expect(dialog.open).toBe(true);
    removeTransition();
  });

  it('ten fast cycles with a real transition each finish the one before, settling closed once at the end', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, drawer } = fixture;
    const onOpenChange = vi.fn();
    const removeTransition = withTransition(panel, { durationMs: 40 });
    drawer.setOptions({ onOpenChange });

    for (let i = 0; i < 10; i++) {
      drawer.open();
      drawer.close('close-button');
    }
    expect(drawer.phase).toBe('closing');
    expect(dialog.open).toBe(true);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    // Each of the ten closes actually closed the dialog, even the nine
    // that a later `open()` finished early rather than cancelled (#268's
    // design ruling): `onOpenChange` fires once per close, not once for
    // the whole loop.
    expect(onOpenChange).toHaveBeenCalledTimes(10);
    expect(
      onOpenChange.mock.calls.every(
        ([open, reason]) => open === false && reason === 'close-button'
      )
    ).toBe(true);
    removeTransition();
  });
});
