// Lifting the drawer above the on-screen keyboard (#273, resolves #238).
// A desktop browser has no on-screen keyboard at all, so every test here
// emulates one with a stand-in for `window.visualViewport`: a plain
// `EventTarget` with settable `height`, `offsetTop` and `scale` fields,
// installed before `mount()` (so `createDrawer`'s own, already-existing
// `visualViewport.addEventListener('resize', …)` call -- wired for a plain
// resize, not this feature -- attaches to it too), then driven by
// dispatching 'resize' and 'scroll' on it by hand, the same two events the
// real interface fires. Real focus throughout comes from a real click
// (`userEvent.click`), never a handler called directly.
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
 * (`interactive-widget=resizes-content`): the real `window.innerHeight` is
 * read-only, so this shadows it for the one test that needs the inset
 * formula's own `window.innerHeight` term to track a resize, not just
 * `visualViewport`. */
function mockInnerHeight(px: number) {
  innerHeightSpy?.mockRestore();
  innerHeightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(px);
}

/** Installs `fakeViewport` as `window.visualViewport` -- must run before
 * `mount()`, so the engine's own permanent resize listener (unrelated to
 * this feature) and this feature's own open-scoped ones both attach to the
 * fake, never the real one. `height` starts at the real
 * `window.innerHeight`, so a test that never touches it computes an inset
 * of 0, the same as a page with no keyboard open. */
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

function mockUserAgent(userAgent: string) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';

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

describe('the overlay model (iOS Safari always; Android Chrome default)', () => {
  beforeEach(() => mockReducedMotion());

  it('lifts the drawer, keeps the snap index, and keeps the focused input above the keyboard', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, content, drawer } = fixture;
    const input = appendFieldTo(content);

    drawer.open(0);
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);
    expect(document.activeElement).toBe(input);

    // The keyboard opens: `visualViewport` shrinks by 300px, `innerHeight`
    // does not (the overlay model).
    const keyboardPx = 300;
    vv.height = window.innerHeight - keyboardPx;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      `${keyboardPx}px`
    );
    expect(viewport.style.height).toBe(`calc(100% - ${keyboardPx}px)`);
    // Re-measured, never re-indexed: `open(0)` is still snap index 0.
    expect(drawer.snapIndex).toBe(0);
    expect(drawer.phase).toBe('open');

    const keyboardTop = window.innerHeight - keyboardPx;
    expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      keyboardTop + 1
    );
  });

  it('returns to the full height on the same snap index once the keyboard closes', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5, 1] });
    const { dialog, viewport, drawer } = fixture;

    drawer.open(1);
    await expectSettledTo(() => drawer.phase, 'open');
    vv.height = window.innerHeight - 280;
    vv.resize();
    await nextFrame();
    expect(viewport.style.height).toBe('calc(100% - 280px)');

    vv.height = window.innerHeight;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '0px'
    );
    expect(viewport.style.height).toBe('100%');
    expect(drawer.snapIndex).toBe(1);
    expect(drawer.phase).toBe('open');
  });

  it("also reacts to visualViewport’s own 'scroll' event, not only 'resize'", async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    vv.height = window.innerHeight - 220;
    vv.scroll();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '220px'
    );
    expect(drawer.phase).toBe('open');
  });

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
    // keyboard, so this must not move the inset at all.
    vv.scale = 1.75;
    vv.height = window.innerHeight - 400;
    vv.resize();
    await nextFrame();

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '260px'
    );
    expect(viewport.style.height).toBe('calc(100% - 260px)');
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

  it('keeps the inset on iOS WebKit when focus moves to another field that also opens a keyboard', async () => {
    mockUserAgent(IPHONE_SAFARI_UA);
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, viewport, content, drawer } = fixture;
    const input = appendFieldTo(content);
    // A second field inside the Panel, not a page element outside it: the
    // drawer is modal here, so the inert page behind it is unreachable by
    // a real click either way, the same as a real device, where moving
    // between two fields in the sheet keeps the keyboard up the whole
    // time, with no `visualViewport` resize firing in between at all.
    const other = document.createElement('textarea');
    content.append(other);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);
    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '300px'
    );

    // `event.relatedTarget` is a field that opens a keyboard of its own:
    // the keyboard never actually closed, so the early iOS drop (React
    // Aria's own `useViewportSize` waits on the same thing) must not run
    // the Viewport back under it.
    await userEvent.click(other);

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '300px'
    );
    expect(viewport.style.height).toBe('calc(100% - 300px)');
  });

  it('drops the inset at once on iOS WebKit when focus leaves to something that does not open a keyboard', async () => {
    mockUserAgent(IPHONE_SAFARI_UA);
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, viewport, content, drawer } = fixture;
    const input = appendFieldTo(content);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    content.append(checkbox);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);
    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();
    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '300px'
    );

    // WebKit's own 'resize' for the keyboard's close animation has not
    // fired yet (`vv.height` still reflects it open): the blur alone must
    // still drop the inset, since a checkbox never opens a keyboard of its
    // own.
    await userEvent.click(checkbox);

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '0px'
    );
    expect(viewport.style.height).toBe('100%');
  });

  it('does not drop the inset early on a non-iOS UA: only the laggy resize does', async () => {
    const vv = installFakeViewport();
    fixture = mount({ snapPoints: [0.5] });
    const { dialog, content, drawer } = fixture;
    const input = appendFieldTo(content);
    const other = appendFieldTo(content);

    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');
    await userEvent.click(input);
    vv.height = window.innerHeight - 300;
    vv.resize();
    await nextFrame();

    await userEvent.click(other);
    await sleep(50);

    expect(dialog.style.getPropertyValue('--drawer-keyboard-inset')).toBe(
      '300px'
    );
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
    // exactly, with no gap between them -- the inset formula this feature
    // adds nets to 0, so it writes nothing and leaves the Viewport's own
    // height alone. The real CSS shrink this causes through `100dvh` is a
    // plain window resize, already proven in `index.test.ts`'s own "a
    // resize" cases, not retested here.
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
    vv.height = 500;
    window.dispatchEvent(new Event('resize'));
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
    it(`side="${side}": shrinks the Viewport's own height and keeps the snap index`, async () => {
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
      expect(viewport.style.height).toBe('calc(100% - 240px)');
      expect(drawer.snapIndex).toBe(0);
      expect(drawer.phase).toBe('open');
    });
  }
});

// A Panel whose own CSS gives it `height: 100%` (the site's own
// `.drawer-demo__panel`), not the fixed, overlong one every other test here
// mounts with: it tracks the Viewport's own height, so the instant
// `applyKeyboardInset` (or a plain window resize, `resizes-content`)
// shrinks that, the Panel shrinks with it and the browser clamps
// `scrollTop` to the new, smaller `scrollHeight`, synchronously, ahead of
// any JS here. A drawer resting at its *last* snap point (full open, the
// Viewport's own old maximum scroll position) is exactly where that clamp
// bites hardest.
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
    // `scrollend` (or its debounce fallback) lands after `onResize`'s own
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
