import type { SnapPoint } from '../src/index';
import { commands } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  blockScrollend,
  dropFinger,
  expectSettledTo,
  fingerDown,
  glide,
  isChromium,
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
afterEach(async () => {
  await dropFinger();
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

/** A finger held on the Panel: a real held touch in Chromium. WebKit cannot
 * hold one, so its `touchstart` is hand-dispatched (the engine reads only
 * `touches.length`), and `liftFinger`'s tap then ends it. */
async function holdFinger(f: Fixture) {
  await fingerDown(f);
  if (!isChromium) f.content.dispatchEvent(touchEvent('touchstart', 1));
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

  it('case 3: a tap that never scrolls leaves nothing armed for a later keyboard, scrollbar or snapTo scroll toward closed', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await liftFinger(fixture!);
    // No glide follows a tap: wait out whatever the lift armed.
    await sleep(300);

    await glide(viewport, [300, 160, 80, 31]);
    await sleep(100);

    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();
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

  describe('a glide that stalls within a few px of closed fires no scrollend (#332)', () => {
    it('closes when the lift lands 20px from closed and the glide stalls at 2px', async () => {
      const { viewport, dialog, drawer, onOpenChange } = await openAt(
        [0.5, 1],
        0
      );
      await fingerDown(fixture!);
      await glide(viewport, [20]);
      await liftFinger(fixture!);

      await glide(viewport, [8, 2]);

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(dialog.open).toBe(false);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });

    it('closes when the lift itself lands 3px from closed and nothing scrolls after', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await glide(viewport, [3]);
      await liftFinger(fixture!);

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });

    it('closes when the glide starts after the lift`s first 100ms and stalls at 2px', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await sleep(250);

      await glide(viewport, [8, 2]);

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });

    it('does not close a flick back open from 3px', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await glide(viewport, [3]);
      await liftFinger(fixture!);

      await glide(viewport, [40, 150, 300]);
      await endGlide(viewport);

      await expectSettledTo(() => drawer.phase, 'open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('a glide that stalls outside the margin leaves nothing armed', () => {
    it('after a keydown on the Viewport', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160]);

      viewport.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown' })
      );
      await glide(viewport, [80, 31]);
      await sleep(100);

      expect(drawer.phase).toBe('open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('after a pointerdown on the Viewport (a scrollbar drag)', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160]);

      viewport.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true })
      );
      await glide(viewport, [80, 31]);
      await sleep(100);

      expect(drawer.phase).toBe('open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('after a second, with no scrollend', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160]);
      await sleep(1100);

      await glide(viewport, [80, 31]);
      await sleep(100);

      expect(drawer.phase).toBe('open');
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  it('disarms the band when the snap points change its margin mid-glide, so a stale margin never closes', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await liftFinger(fixture!);
    await glide(viewport, [300, 160]);

    // A 20px snap point puts the band under 32px: 31px is no longer inside.
    drawer.setOptions({ snapPoints: ['20px', 1] });
    await glide(viewport, [80, 31]);
    await sleep(150);

    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  describe('a re-render that passes the same snap points mid-glide', () => {
    it('still closes the glide at 31px', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160]);

      drawer.setOptions({ snapPoints: [0.5, 1] });
      await glide(viewport, [80, 31]);

      expect(drawer.phase).toBe('closed');
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });

    it('still closes a glide that then stalls at 2px', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await fingerDown(fixture!);
      await liftFinger(fixture!);
      await glide(viewport, [300, 160, 40]);

      drawer.setOptions({ snapPoints: [0.5, 1] });
      await glide(viewport, [8, 2]);

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });
  });

  it('closes a glide that reaches 2px more than a second after the lift, with no scrollend', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await liftFinger(fixture!);
    await glide(viewport, [300, 160, 40]);
    await sleep(1100);

    await glide(viewport, [8, 2]);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });

  it('closes a glide that starts stalling just before the second is up', async () => {
    const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
    await fingerDown(fixture!);
    await liftFinger(fixture!);
    await glide(viewport, [300, 160, 40]);
    await sleep(930);

    await glide(viewport, [8, 2]);
    await sleep(300);

    expect(drawer.phase).toBe('closed');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  describe('a finger held 2px from closed', () => {
    it('does not close it however long it stays, then closes it on lift', async () => {
      const { viewport, drawer, onOpenChange } = await openAt([0.5, 1], 0);
      await holdFinger(fixture!);

      viewport.scrollTo({ top: 2, behavior: 'instant' });
      await sleep(400);
      expect(drawer.phase).toBe('open');
      expect(onOpenChange).not.toHaveBeenCalled();

      await liftFinger(fixture!);

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
    });

    it('a touchstart during the wait cancels it, and the lift closes', async () => {
      const { viewport, content, drawer, onOpenChange } = await openAt(
        [0.5, 1],
        0
      );
      viewport.scrollTo({ top: 2, behavior: 'instant' });
      await sleep(40);
      content.dispatchEvent(touchEvent('touchstart', 1));
      await sleep(300);
      expect(drawer.phase).toBe('open');

      content.dispatchEvent(touchEvent('touchend', 0));

      await expectSettledTo(() => drawer.phase, 'closed');
      expect(onOpenChange).toHaveBeenCalledTimes(1);
    });
  });

  it('case 5: never closes under a held finger, even 3px from closed', async () => {
    const { viewport, dialog, drawer, onOpenChange } = await openAt(
      [0.5, 1],
      0
    );
    await holdFinger(fixture!);

    viewport.scrollTo({ top: 3, behavior: 'instant' });
    await nextFrame();
    await nextFrame();
    await nextFrame();
    await sleep(300);
    expect(drawer.phase).toBe('open');
    expect(onOpenChange).not.toHaveBeenCalled();

    await liftFinger(fixture!);
    await endGlide(viewport);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(dialog.open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });

  it('case 4: a touched element removed mid-touch does not hold the stall close off', async () => {
    const { viewport, content, drawer, onOpenChange } = await openAt(
      [0.5, 1],
      0
    );
    // Hand-dispatched in both engines: a removed element's `touchend` goes
    // to the detached node and never reaches the Viewport.
    const touched = document.createElement('div');
    content.append(touched);
    touched.dispatchEvent(touchEvent('touchstart', 1));
    touched.remove();

    viewport.scrollTo({ top: 2, behavior: 'instant' });
    await sleep(400);

    await expectSettledTo(() => drawer.phase, 'closed');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
  });
});
