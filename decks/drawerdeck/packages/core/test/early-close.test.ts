import type { SnapPoint } from '../src/index';
import { commands } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockScrollend,
  expectSettledTo,
  fingerDown,
  glide,
  liftFinger,
  mockReducedMotion,
  mount,
  nextFrame,
  pagePoint,
  sleep,
  touchEvent,
  touchPoint,
  unmount,
  type Fixture
} from './fixtures';

// Closing early, once a swipe's momentum leaves a few pixels in view (#334).
// A swipe's lift arms a check on the scroll events that follow; the lift is
// real (a held touch in Chromium, a tap in WebKit, which cannot hold one),
// and the glide after it is scripted, since neither engine can fling.

let fixture: Fixture | undefined;
let unblock: (() => void) | undefined;
afterEach(() => {
  unblock?.();
  unblock = undefined;
  if (fixture) unmount(fixture);
  fixture = undefined;
  vi.restoreAllMocks();
});

async function openAt(snapPoints: SnapPoint[], snapIndex: number) {
  fixture = mount({ snapPoints });
  const { drawer } = fixture;
  drawer.open();
  await expectSettledTo(() => drawer.phase, 'open');
  drawer.snapTo(snapIndex);
  await expectSettledTo(() => drawer.snapIndex, snapIndex);
  const onOpenChange = vi.fn();
  drawer.setOptions({ onOpenChange });
  // A real stalled glide fires no `scrollend`, and native snapping must not
  // move the scripted scrolls.
  unblock = blockScrollend();
  fixture.viewport.style.scrollSnapType = 'none';
  return { ...fixture, onOpenChange };
}

/** What the browser does once a glide ends: fires `scrollend`. */
async function endGlide(viewport: HTMLElement) {
  unblock?.();
  unblock = undefined;
  viewport.dispatchEvent(new Event('scrollend'));
  await sleep(50);
}

describe('closing early after a swipe (#334)', () => {
  beforeEach(() => mockReducedMotion());

  it('closes once the glide after a lift leaves 32px or less in view, before it reaches closed', async () => {
    const { viewport, dialog, drawer, onOpenChange } = await openAt(
      [0.5, 1],
      0
    );
    await fingerDown(fixture!);
    await liftFinger(fixture!);

    await glide(viewport, [300, 160, 80, 31]);

    expect(drawer.phase).toBe('closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });

  it('does not close a glide that stops above the margin', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await liftFinger(fixture!);

    await glide(viewport, [300, 160, 40]);
    await sleep(100);

    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each([
    { snapPx: 50, releasedAt: 29 },
    { snapPx: 60, releasedAt: 31 }
  ])(
    'case 1: a slow release at $releasedAt px of a $snapPx px snap point snaps back open',
    async ({ snapPx, releasedAt }) => {
      const { viewport, drawer, onOpenChange } = await openAt(
        [`${snapPx}px`, 1],
        0
      );
      await fingerDown(fixture!);
      viewport.scrollTo({ top: releasedAt, behavior: 'instant' });
      await nextFrame();
      await liftFinger(fixture!);

      // The browser's own snap back to the snap point.
      await glide(viewport, [releasedAt + 8, snapPx]);
      await endGlide(viewport);

      await expectSettledTo(() => drawer.phase, 'open');
      expect(drawer.snapIndex).toBe(0);
      expect(onOpenChange).not.toHaveBeenCalled();
    }
  );

  it('case 2: a flick back open, released 25px from closed, flings open', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await glide(viewport, [6, 25]);
    await liftFinger(fixture!);

    await glide(viewport, [60, 150, 300]);
    await endGlide(viewport);

    await expectSettledTo(() => drawer.phase, 'open');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe('case 3: wheel and trackpad', () => {
    async function wheel(f: Fixture, ticks: number, deltaY: number) {
      const { x, y } = touchPoint(f);
      for (let i = 0; i < ticks; i++) {
        await commands.wheelAtPoint(x, y, deltaY);
        await sleep(40);
      }
    }

    it('7 ticks toward closed then 6 back reverse to open, with no touch at all', async () => {
      const { viewport, drawer, onOpenChange } = await openAt(['100px', 1], 0);
      const start = viewport.scrollTop;

      await wheel(fixture!, 7, -12);
      expect(viewport.scrollTop).toBeLessThan(start - 80);
      expect(drawer.phase).toBe('open');
      await wheel(fixture!, 6, 12);
      await endGlide(viewport);

      await expectSettledTo(() => drawer.phase, 'open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does the same after an earlier tap that never scrolled', async () => {
      const { viewport, drawer, onOpenChange } = await openAt(['100px', 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);

      await wheel(fixture!, 7, -12);
      expect(viewport.scrollTop).toBeLessThan(20);
      expect(drawer.phase).toBe('open');
      await wheel(fixture!, 6, 12);
      await endGlide(viewport);

      await expectSettledTo(() => drawer.phase, 'open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('case 4: tracking the touches', () => {
    it('keeps working after the touched element left the page mid-touch', async () => {
      const { viewport, content, panel, drawer } = await openAt([0.5, 1], 0);
      // A real tap on a button that removes itself on touchstart: its
      // touchend then never reaches the Viewport.
      const button = document.createElement('button');
      button.style.cssText =
        'position:absolute;top:10px;left:0;width:60px;height:40px';
      button.addEventListener('touchstart', () => button.remove());
      content.style.position = 'relative';
      content.append(button);
      const rect = panel.getBoundingClientRect();
      const at = pagePoint(rect.left + 20, rect.top + 30);
      await commands.tapAtPoint(at.x, at.y);
      expect(button.isConnected).toBe(false);

      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160, 80, 31]);

      expect(drawer.phase).toBe('closed');
    });

    it('does not close under a second finger after the first one lifts (two fingers land in one touchstart)', async () => {
      const { viewport, content, drawer } = await openAt([0.5, 1], 0);
      // Neither engine's test input can land two fingers in one
      // `touchstart` (CDP sends one event per finger), so these events are
      // hand-dispatched, and WebKit has no `Touch` constructor: the handler
      // reads only `touches.length`.
      const send = (type: string, fingers: number) =>
        content.dispatchEvent(touchEvent(type, fingers));
      send('touchstart', 2);
      send('touchend', 1);

      await glide(viewport, [300, 160, 80, 31]);
      await sleep(100);
      expect(drawer.phase).toBe('open');

      send('touchend', 0);
      await glide(viewport, [300, 160, 80, 31]);
      expect(drawer.phase).toBe('closed');
    });
  });

  it('case 5: never closes under a held finger, even 3px from closed', async () => {
    const { viewport, dialog, drawer, onOpenChange } = await openAt(
      [0.5, 1],
      0
    );
    await fingerDown(fixture!);

    viewport.scrollTo({ top: 3, behavior: 'instant' });
    await nextFrame();
    await nextFrame();
    await nextFrame();
    await sleep(100);
    // WebKit cannot hold the finger: its tap below is the whole touch.
    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();

    await liftFinger(fixture!);
    await endGlide(viewport);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });
});
