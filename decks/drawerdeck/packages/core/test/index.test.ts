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

describe('--drawer-progress', () => {
  beforeEach(() => mockReducedMotion());

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

    const progress = Number(dialog.style.getPropertyValue('--drawer-progress'));
    expect(progress).toBeGreaterThan(0.4);
    expect(progress).toBeLessThan(0.6);
    letGo();
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
