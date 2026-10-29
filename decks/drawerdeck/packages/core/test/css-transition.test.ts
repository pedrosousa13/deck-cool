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

  it('a wheel during the entrance ends it at once', () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();

    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(drawer.phase).toBe('open');
  });

  it('a tap (pointer down) with no scroll during the entrance ends it at once', () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();

    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })
    );

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    expect(drawer.phase).toBe('open');
  });

  it('a touch during the exit ends it at once, settled back open -- not closed', async () => {
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

    expect(drawer.phase).toBe('open');
    expect(dialog.open).toBe(true);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    expect(backdrop.hasAttribute('data-ending-style')).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
    removeTransition();
  });

  it('a wheel during the exit ends it at once', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, dialog, drawer } = fixture;
    const removeTransition = withTransition(panel, { durationMs: 1000 });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));

    expect(drawer.phase).toBe('open');
    expect(dialog.open).toBe(true);
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
    removeTransition();
  });

  it('a tap (pointer down) with no scroll during the exit ends it at once', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, dialog, drawer } = fixture;
    const removeTransition = withTransition(panel, { durationMs: 1000 });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');
    viewport.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })
    );

    expect(drawer.phase).toBe('open');
    expect(dialog.open).toBe(true);
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

  it('a touch about 120ms into a real 300ms exit ends it at once: the Panel is at translateY(0) right away', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, panel, drawer } = fixture;
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

    expect(translateY(getComputedStyle(panel).transform)).toBe(0);
    expect(drawer.phase).toBe('open');
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

  it('ten fast cycles with a real transition never let an earlier, cancelled exit fire late', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, panel, drawer } = fixture;
    // Long enough that none of the nine cancelled exits could complete on
    // their own before this test's own assertions run.
    const removeTransition = withTransition(panel, { durationMs: 1000 });

    for (let i = 0; i < 9; i++) {
      drawer.open();
      drawer.close('close-button');
    }
    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open', 6000);
    expect(dialog.open).toBe(true);
    // None of the nine cancelled exits' long transitionend/timeout waits
    // leaked past their own cancellation and closed the dialog out from
    // under this final, settled open.
    await sleep(1200);
    expect(drawer.phase).toBe('open');
    expect(dialog.open).toBe(true);
    removeTransition();
  });

  it('ten fast cycles with a real transition ending on close settle closed, once', async () => {
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
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    removeTransition();
  });
});
