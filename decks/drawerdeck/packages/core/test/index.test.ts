import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectSettledTo,
  mockReducedMotion,
  mount,
  mouseDrag,
  sleep,
  unmount,
  type Fixture
} from './fixtures';

let fixture: Fixture | undefined;
afterEach(() => {
  if (fixture) unmount(fixture);
  fixture = undefined;
  vi.restoreAllMocks();
  document.body.style.minHeight = '';
  window.scrollTo(0, 0);
});

describe('open, snap and close', () => {
  beforeEach(() => mockReducedMotion());

  it('opens to the first configured snap point', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, drawer } = fixture;

    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    const expected = Math.round(viewport.clientHeight * 0.5);
    expect(Math.abs(viewport.scrollTop - expected)).toBeLessThan(2);
    expect(drawer.snapIndex).toBe(0);
  });

  it('without snapPoints, opens to the panel’s own content height', async () => {
    fixture = mount({}, { panelHeight: '200px' });
    const { viewport, drawer } = fixture;

    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    expect(Math.abs(viewport.scrollTop - 200)).toBeLessThan(2);
  });

  it('snaps between configured points', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.snapTo(1);

    const expected = Math.round(viewport.clientHeight * 1);
    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(Math.abs(viewport.scrollTop - expected)).toBeLessThan(2);
  });

  it('closes on a drag to closed, reopens, and reports why it closed', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    viewport.scrollTo({ top: 0, behavior: 'instant' });

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(fixture.dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    expect(fixture.dialog.open).toBe(true);
  });

  it('closes on Escape when dismissible, not when it is not', async () => {
    fixture = mount({ snapPoints: [0.5, 1], dismissible: false });
    const { dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await sleep(300);
    expect(drawer.phase).toBe('open');

    drawer.setOptions({ dismissible: true });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('closes on an outside press (the gap) when dismissible', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const gap = viewport.querySelector('[data-drawer-gap]')!;
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('close() still works when not dismissible', async () => {
    fixture = mount({ snapPoints: [0.5], dismissible: false });
    const { drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    drawer.close('close-button');

    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('a drag toward closed settles on the nearest open point when not dismissible', async () => {
    fixture = mount({ snapPoints: [0.5, 1], dismissible: false });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    viewport.scrollTo({ top: 0, behavior: 'instant' });

    await sleep(300);
    expect(drawer.phase).toBe('open');
    expect(viewport.scrollTop).toBeGreaterThan(0);
  });
});

describe('the inner content', () => {
  beforeEach(() => mockReducedMotion());

  it('is locked below the top snap point, and unlocks there (#232: variant B)', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { content, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    expect(content.style.overflowY).toBe('hidden');

    drawer.snapTo(1);
    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(content.style.overflowY).toBe('auto');
  });
});

describe('the dim (#249)', () => {
  beforeEach(() => mockReducedMotion());

  describe('the native scroll timeline, where supported', () => {
    it('exposes the drag as a named scroll timeline the Backdrop can use', async () => {
      fixture = mount({ snapPoints: [0.5, 1] });
      const { dialog, viewport, backdrop, drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');

      // Consumer CSS: the engine sets only the plumbing (`scroll-timeline`,
      // `timeline-scope`), never a `@keyframes` or an `animation-*`
      // property of its own.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        '@keyframes drawerdeck-test-dim { from { opacity: 0; } to { opacity: 1; } }' +
          '[data-test-dim] { animation: drawerdeck-test-dim 1s linear; animation-timeline: --drawer; }'
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      backdrop.setAttribute('data-test-dim', '');

      expect(viewport.style.getPropertyValue('scroll-timeline')).toBe(
        '--drawer y'
      );
      expect(dialog.style.getPropertyValue('timeline-scope')).toBe('--drawer');
      const animation = backdrop.getAnimations()[0];
      expect(animation).toBeDefined();
      expect(animation.timeline).toBeInstanceOf(ScrollTimeline);
      expect(animation.timeline).not.toBe(document.timeline);

      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (s) => s !== sheet
      );
    });

    it('sets the dim range once per layout, as a CSS variable', async () => {
      fixture = mount({ snapPoints: [0.5, 1] });
      const { dialog, viewport, drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');

      const expected = `${Math.round(viewport.clientHeight * 0.5)}px`;
      expect(dialog.style.getPropertyValue('--drawer-first-snap')).toBe(
        expected
      );
    });

    it('runs no JS at all while the Viewport scrolls between snap points', async () => {
      fixture = mount({ snapPoints: [0.5, 1] });
      const { panel, drawer } = fixture;
      drawer.open(1);
      await expectSettledTo(() => drawer.phase, 'open');

      const setPropertySpy = vi.spyOn(
        CSSStyleDeclaration.prototype,
        'setProperty'
      );
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      const box = panel.getBoundingClientRect();
      const letGo = await mouseDrag(
        panel,
        { x: box.left + 10, y: box.top + 10 },
        [
          { dy: -20, waitMs: 30 },
          { dy: 15, waitMs: 30 },
          { dy: -10, waitMs: 30 },
          { dy: 12, waitMs: 30 }
        ],
        { release: false }
      );
      await sleep(80);
      letGo();

      expect(setPropertySpy).not.toHaveBeenCalled();
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe('--drawer-progress, the fallback (Firefox, or forced here via a stubbed CSS.supports)', () => {
    beforeEach(() => {
      vi.spyOn(CSS, 'supports').mockReturnValue(false);
    });

    it('tracks the scroll position up to the first snap point', async () => {
      fixture = mount({ snapPoints: [0.5, 1] });
      const { dialog, viewport, panel, drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');

      // Mid-drag: the engine itself turns scroll-snap off for this (so a
      // mandatory snap cannot pull a script-set, off-snap-point scrollTop
      // like this one straight back to the nearest point before the test
      // can read it).
      const box = panel.getBoundingClientRect();
      const dy = -Math.round(viewport.clientHeight * 0.25 - viewport.scrollTop);
      const letGo = await mouseDrag(
        panel,
        { x: box.left + 10, y: box.top + 10 },
        [{ dy }],
        { release: false }
      );
      await sleep(80);

      const progress = Number(
        dialog.style.getPropertyValue('--drawer-progress')
      );
      expect(progress).toBeGreaterThan(0.4);
      expect(progress).toBeLessThan(0.6);
      letGo();
    });

    it('is not rewritten on a scroll frame where it has not changed (#267)', async () => {
      // Every scroll frame beyond the first snap point clamps to the same
      // value (1): a drag there should not keep calling setProperty, which
      // (unlike a standard CSS property) does not skip the main-thread
      // write and the commit it schedules just because the value is
      // unchanged.
      fixture = mount({ snapPoints: [0.5, 1] });
      const { dialog, panel, drawer } = fixture;
      drawer.open(1);
      await expectSettledTo(() => drawer.phase, 'open');

      const spy = vi.spyOn(dialog.style, 'setProperty');
      const box = panel.getBoundingClientRect();
      const letGo = await mouseDrag(
        panel,
        { x: box.left + 10, y: box.top + 10 },
        [
          { dy: -20, waitMs: 30 },
          { dy: 15, waitMs: 30 },
          { dy: -10, waitMs: 30 },
          { dy: 12, waitMs: 30 }
        ],
        { release: false }
      );
      await sleep(80);
      letGo();

      const progressCalls = spy.mock.calls.filter(
        ([name]) => name === '--drawer-progress'
      );
      expect(progressCalls.length).toBe(0);
    });
  });
});

describe('a mouse drag (#235)', () => {
  beforeEach(() => mockReducedMotion());

  it('moves the panel with the pointer and reports dragging', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    const onDragChange = vi.fn();
    drawer.setOptions({ onDragChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const startTop = viewport.scrollTop;

    const box = panel.getBoundingClientRect();
    const letGo = await mouseDrag(
      panel,
      { x: box.left + 10, y: box.top + 10 },
      [{ dy: -30 }],
      { release: false }
    );

    expect(viewport.scrollTop).toBe(startTop + 30);
    expect(onDragChange).toHaveBeenNthCalledWith(1, true);
    letGo();
  });

  it('a throw settles on the nearest snap point and reports it', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    const onDragChange = vi.fn();
    const onSnapPointChange = vi.fn();
    drawer.setOptions({ onDragChange, onSnapPointChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const box = panel.getBoundingClientRect();
    const target = Math.round(viewport.clientHeight * 1 - viewport.scrollTop);
    await mouseDrag(panel, { x: box.left + 10, y: box.top + 10 }, [
      { dy: -target }
    ]);

    await expectSettledTo(() => drawer.snapIndex, 1);
    expect(onSnapPointChange).toHaveBeenCalledWith(1);
    expect(onDragChange).toHaveBeenLastCalledWith(false);
  });

  it('a throw toward closed closes the drawer', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const box = panel.getBoundingClientRect();
    await mouseDrag(panel, { x: box.left + 10, y: box.top + 10 }, [
      { dy: viewport.scrollTop + 50 }
    ]);

    await expectSettledTo(() => drawer.phase, 'closed');
  });
});

describe('closing as soon as the Panel leaves view (#296)', () => {
  beforeEach(() => mockReducedMotion());

  it('closes through the Panel leaving view, exactly once, even once scrollend also fires for the same native settle', async () => {
    // A real flick's own momentum and snap settle can take the better
    // part of a second before `scrollend` confirms it (the issue's own
    // bench measured ~1000ms): comfortably longer than a scripted scroll
    // settles in Chromium or WebKit here, so racing the two down to the
    // millisecond is not something this harness can reproduce reliably.
    // What it does prove: the close lands with the right reason, and
    // `scrollend` firing for the very same gesture right behind it is
    // not a second one (`finishClose`'s own idempotency).
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    let scrollEndFired = false;
    viewport.addEventListener(
      'scrollend',
      () => {
        scrollEndFired = true;
      },
      { once: true }
    );

    viewport.scrollTo({ top: 0, behavior: 'smooth' });

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(scrollEndFired).toBe(true);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });

  it('closes once the Panel is carried out of view with no scroll, and so no scrollend, involved at all', async () => {
    // Isolates the leave-view observer itself from the scroll machinery
    // around it: nothing here writes `scrollTop`, so `scrollend` (and its
    // debounce fallback) never has anything to fire for. Before this
    // observer existed, nothing closed the drawer here at all.
    fixture = mount({ snapPoints: [0.5, 1] });
    const { panel, dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    panel.style.transform = 'translateY(100%)';

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    panel.style.transform = '';
  });

  it('never closes while opening, even though the Panel starts out of view', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('a drag that stops short of fully hidden does not close', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const startTop = viewport.scrollTop;

    const box = panel.getBoundingClientRect();
    const letGo = await mouseDrag(
      panel,
      { x: box.left + 10, y: box.top + 10 },
      [{ dy: startTop - 10 }],
      { release: false }
    );

    expect(viewport.scrollTop).toBe(10);
    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();

    letGo();
    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('a flick that closes the drawer through the leave-view observer can be reopened', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const box = panel.getBoundingClientRect();
    await mouseDrag(panel, { x: box.left + 10, y: box.top + 10 }, [
      { dy: viewport.scrollTop + 50 }
    ]);
    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    expect(dialog.open).toBe(true);
  });

  it('ten fast open-flick-close cycles leave no stuck state or duplicate onOpenChange calls', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { viewport, dialog, drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });

    for (let i = 0; i < 10; i++) {
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');
      viewport.scrollTo({ top: 0, behavior: 'instant' });
      await expectSettledTo(() => drawer.phase, 'closed');
    }

    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledTimes(10);
    expect(
      onOpenChange.mock.calls.every(
        ([open, reason]) => open === false && reason === 'drag'
      )
    ).toBe(true);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
  });
});

describe('a mouse drag released partway, slowly (#279)', () => {
  // No mockReducedMotion here: the bug is in the eased throw itself
  // (`motionBehavior`'s real, non-reduced path), so forcing an instant
  // scroll would skip right over it.

  /** Breaks a drag of `totalDy` into many small steps, 20ms apart, plus a
   * final 150ms pause with no movement: `DRAG_HISTORY_MS` (100ms) then
   * holds nothing but that pause, so the release velocity is ~0 however
   * fast the drag itself was. */
  function slowDragSteps(totalDy: number) {
    const stepCount = 12;
    const perStep = Math.round(totalDy / stepCount);
    const steps = Array.from({ length: stepCount }, (_, i) => ({
      dy: i === stepCount - 1 ? totalDy - perStep * (stepCount - 1) : perStep,
      waitMs: 20
    }));
    steps.push({ dy: 0, waitMs: 150 });
    return steps;
  }

  /** Samples `viewport.scrollTop` on every animation frame for `ms`. */
  async function sampleScrollTopFor(viewport: HTMLElement, ms: number) {
    const samples: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      function frame() {
        samples.push(viewport.scrollTop);
        if (performance.now() - start < ms) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
    return samples;
  }

  // A real release, not a mocked one: the pointer's own last couple of
  // events can still be settling (coalesced input, sub-pixel rounding)
  // for a few px either side of the exact release position. The flash
  // this bug produces dwarfs that noise by well over an order of
  // magnitude (a 100+px single-frame jump, or straight to closed).
  const RELEASE_JITTER_PX = 16;

  /** The flash this bug produces is a native re-snap landing the scroll
   * position far from where the eased throw was on its way to, in a
   * single frame: a real 240ms ease, sampled a frame at a time, never
   * covers more than a slice of the remaining distance in one step, and
   * never moves back out past where the drag released it. */
  function assertNoFlash(samples: number[], released: number, target: number) {
    const distance = Math.abs(target - released);
    const towardTarget = Math.sign(target - released);
    let sawMidway = false;
    for (let i = 0; i < samples.length; i++) {
      const st = samples[i];
      if (towardTarget >= 0) {
        expect(st).toBeGreaterThanOrEqual(released - RELEASE_JITTER_PX);
      } else {
        expect(st).toBeLessThanOrEqual(released + RELEASE_JITTER_PX);
      }
      if (
        Math.abs(st - released) > distance * 0.2 &&
        Math.abs(st - target) > distance * 0.2
      ) {
        sawMidway = true;
      }
      if (i > 0) {
        const delta = Math.abs(st - samples[i - 1]);
        expect(delta).toBeLessThanOrEqual(distance * 0.5 + RELEASE_JITTER_PX);
      }
    }
    // A genuine multi-frame ease spends several frames measurably between
    // the release point and the target; an instant re-snap jumps straight
    // from one to the other and never does.
    expect(sawMidway).toBe(true);
  }

  for (const depthFraction of [0.25, 0.4, 0.45]) {
    it(`springs back to half from a slow drag ${depthFraction * 100}% of the way to closed, without flashing`, async () => {
      fixture = mount({ snapPoints: [0.5, 1] });
      const { viewport, panel, drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');
      const halfPx = viewport.scrollTop;

      const box = panel.getBoundingClientRect();
      const dy = Math.round(halfPx * depthFraction);

      // `mouseDrag` (release defaults true) returns right after dispatching
      // the pointerup, before the throw's first eased frame (scheduled by
      // `requestAnimationFrame`, not run synchronously): `scrollTop` here
      // is still exactly wherever the drag itself left it.
      await mouseDrag(
        panel,
        { x: box.left + 10, y: box.top + 10 },
        slowDragSteps(dy)
      );
      const releasedAt = viewport.scrollTop;
      const samples = await sampleScrollTopFor(viewport, 600);

      assertNoFlash(samples, releasedAt, halfPx);
      await expectSettledTo(() => drawer.phase, 'open');
      await expectSettledTo(() => viewport.scrollTop, halfPx);
    });
  }

  it('a fast throw down still closes', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const box = panel.getBoundingClientRect();
    await mouseDrag(panel, { x: box.left + 10, y: box.top + 10 }, [
      { dy: viewport.scrollTop + 100 }
    ]);

    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('a slow drag past the closed threshold still closes', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    const halfPx = viewport.scrollTop;

    const box = panel.getBoundingClientRect();
    const dy = Math.round(halfPx * 0.7);
    await mouseDrag(
      panel,
      { x: box.left + 10, y: box.top + 10 },
      slowDragSteps(dy)
    );

    await expectSettledTo(() => drawer.phase, 'closed');
  });
});

describe('a resize', () => {
  it('mid-open never closes the drawer (ADR 0001)', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, drawer } = fixture;

    drawer.open();
    // Still animating (no reduced-motion mock here): a resize mid-open is
    // ignored until the opening scroll settles.
    expect(drawer.phase).toBe('opening');
    dialog.style.height = '500px';
    window.dispatchEvent(new Event('resize'));
    expect(drawer.phase).toBe('opening');

    await expectSettledTo(() => drawer.phase, 'open', 6000);
    expect(viewport.scrollTop).toBeGreaterThan(0);
  });

  it('while open, repositions onto the nearest open point, never onto closed', async () => {
    mockReducedMotion();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, drawer } = fixture;
    drawer.open(1);
    await expectSettledTo(() => drawer.phase, 'open');
    const before = viewport.scrollTop;
    expect(before).toBeGreaterThan(0);

    const newHeight = Math.round(before * 1.6);
    dialog.style.height = `${newHeight}px`;
    window.dispatchEvent(new Event('resize'));

    await expect.poll(() => viewport.scrollTop).toBeGreaterThan(before * 1.3);
    expect(viewport.scrollTop).toBeLessThanOrEqual(newHeight + 2);
    expect(drawer.phase).toBe('open');
  });
});

describe('the page behind it', () => {
  it('does not move when the drawer opens (ADR 0001)', async () => {
    mockReducedMotion();
    document.body.style.minHeight = '3000px';
    fixture = mount({ snapPoints: [0.5] });
    window.scrollTo(0, 500);
    const before = window.scrollY;

    fixture.drawer.open();

    await expectSettledTo(() => fixture!.drawer.phase, 'open');
    expect(window.scrollY).toBe(before);
  });
});

describe('destroy()', () => {
  it('stops the engine from reacting any further', async () => {
    mockReducedMotion();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;

    drawer.destroy();
    drawer.open();

    await sleep(100);
    expect(dialog.open).toBe(false);
  });
});

describe('non-modal (#271)', () => {
  beforeEach(() => mockReducedMotion());

  /** A page element outside the dialog entirely, positioned over the
   * drawer's own gap area, so a point-based hit test (`elementFromPoint`)
   * proves whether the drawer or the page itself is actually reachable
   * there, not just whether a listener fires once an event is dispatched
   * straight at a target, which skips hit-testing altogether. */
  function appendBehindButton() {
    const button = document.createElement('button');
    button.textContent = 'Behind';
    Object.assign(button.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '50px',
      height: '50px'
    });
    document.body.append(button);
    return button;
  }

  it('opens with show(), not showModal(): dialog.matches(":modal") is false', async () => {
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { dialog, drawer } = fixture;

    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    expect(dialog.open).toBe(true);
    expect(dialog.matches(':modal')).toBe(false);
  });

  it('modal (the default) still opens with showModal(): dialog.matches(":modal") is true', async () => {
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;

    drawer.open();

    await expectSettledTo(() => drawer.phase, 'open');
    expect(dialog.matches(':modal')).toBe(true);
  });

  it('lets a point over the drawer resolve to the page behind it, not the viewport', async () => {
    const behind = appendBehindButton();
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { drawer } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    expect(document.elementFromPoint(25, 25)).toBe(behind);
    const onClick = vi.fn();
    behind.addEventListener('click', onClick);
    document
      .elementFromPoint(25, 25)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
    behind.remove();
  });

  it('a modal drawer (the default) covers the same point instead', async () => {
    const behind = appendBehindButton();
    fixture = mount({ snapPoints: [0.5] });
    const { drawer, viewport } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    expect(document.elementFromPoint(25, 25)).not.toBe(behind);
    expect(viewport.contains(document.elementFromPoint(25, 25))).toBe(true);
    behind.remove();
  });

  it('lets the page behind it take focus', async () => {
    const behind = appendBehindButton();
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { drawer } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    behind.focus();
    expect(document.activeElement).toBe(behind);
    behind.remove();
  });

  it('a modal drawer (the default) refuses to let the page behind it take focus', async () => {
    const behind = appendBehindButton();
    fixture = mount({ snapPoints: [0.5] });
    const { drawer } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    behind.focus();
    expect(document.activeElement).not.toBe(behind);
    behind.remove();
  });

  it('lets the page itself scroll while it is open', async () => {
    document.body.style.minHeight = '3000px';
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { drawer } = fixture;

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    window.scrollTo(0, 500);
    await expect.poll(() => window.scrollY).toBe(500);
  });

  it('closes on Escape (document-level, since focus need not be inside it), reason "escape"', async () => {
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { drawer } = fixture;
    const onOpenChange = vi.fn();
    drawer.setOptions({ onOpenChange });
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, 'escape');
  });

  it('does not close on Escape when not dismissible', async () => {
    fixture = mount({ snapPoints: [0.5], modal: false, dismissible: false });
    const { drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    await sleep(300);
    expect(drawer.phase).toBe('open');
  });

  it('does not close on an outside press (the gap) by default, unlike a modal drawer', async () => {
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const gap = viewport.querySelector('[data-drawer-gap]')!;
    gap.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await sleep(300);
    expect(drawer.phase).toBe('open');
  });

  it('still drags, snaps and closes on a drag to closed, the way a modal drawer does', async () => {
    fixture = mount({ snapPoints: [0.5, 1], modal: false });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const box = panel.getBoundingClientRect();
    const target = Math.round(viewport.clientHeight * 1 - viewport.scrollTop);
    await mouseDrag(panel, { x: box.left + 10, y: box.top + 10 }, [
      { dy: -target }
    ]);

    await expectSettledTo(() => drawer.snapIndex, 1);

    viewport.scrollTo({ top: 0, behavior: 'instant' });
    await expectSettledTo(() => drawer.phase, 'closed');
  });

  it('still exposes the scroll-timeline dim (#249)', async () => {
    fixture = mount({ snapPoints: [0.5, 1], modal: false });
    const { dialog, viewport, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    expect(viewport.style.getPropertyValue('scroll-timeline')).toBe(
      '--drawer y'
    );
    expect(dialog.style.getPropertyValue('timeline-scope')).toBe('--drawer');
  });

  it('still runs the Panel’s CSS entrance and exit', async () => {
    fixture = mount({ snapPoints: [0.5], modal: false });
    const { panel, drawer } = fixture;
    // A real transition (#268's exit waits for one to actually finish, or
    // its own computed duration, not an instant settle like a fixture with
    // none at all): mirrors `withTransition` in the React package's tests.
    panel.style.transition = 'opacity 50ms linear';

    expect(panel.hasAttribute('data-starting-style')).toBe(false);
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    expect(panel.hasAttribute('data-starting-style')).toBe(false);

    drawer.close('programmatic');
    expect(panel.hasAttribute('data-ending-style')).toBe(true);
    await expectSettledTo(() => drawer.phase, 'closed');
    expect(panel.hasAttribute('data-ending-style')).toBe(false);
  });
});
