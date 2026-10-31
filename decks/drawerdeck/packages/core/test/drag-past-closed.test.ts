// A mouse drag that carries the Panel past its closed position, released
// outside the Viewport, can reopen the drawer (#322). Two races in
// `@drawerdeck/core`'s `index.ts`, both against the drag's own release:
//
// - The leave-view `IntersectionObserver` (#296) only checked `phase`, not
//   `dragging`/`throwing`, so it could close the drawer the moment the
//   Panel left the Viewport mid-drag, well before the user let go. Closing
//   never reset `dragging`, so the drag's own later `onPointerUp` still ran
//   its own settle on top of that, landing `phase` on a snap point while
//   the dialog it already closed stayed closed underneath it. Fixed by
//   deferring to the drag (or throw) the same way `onScrollEnd` already
//   did.
// - Nothing stopped the browser from starting its own native text
//   selection on the Panel's content once the press landed off a button,
//   link or input; once the drag point moved outside the Viewport, the
//   browser's own selection auto-scroll fought the engine's own
//   scroll-position writes right up to release, so `onPointerUp`'s read of
//   the Viewport's scroll position no longer matched what the drag itself
//   produced. Fixed by `onPointerDown`'s own `event.preventDefault()`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Side } from '../src/index';
import {
  expectSettledTo,
  mockReducedMotion,
  mount,
  realMouseDragPastClosed,
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

const SIDES: readonly Side[] = ['bottom', 'top', 'left', 'right'];
const START_SNAPS = [
  { index: 0, label: '0.5' },
  { index: 1, label: '1' }
] as const;

describe('a mouse drag past the closed position, released outside the Viewport, stays closed (#322)', () => {
  beforeEach(() => mockReducedMotion());

  for (const side of SIDES) {
    for (const { index: startSnapIndex, label } of START_SNAPS) {
      it(`side="${side}", opened at the ${label} snap`, async () => {
        fixture = mount({ side, snapPoints: [0.5, 1] });
        const { viewport, panel, content, drawer } = fixture;
        // Plain, selectable text, the way the real drawer.deck.cool demos
        // that found #322 have (a title and a settings list): the native
        // text selection this guards against needs something to select,
        // which an empty fixture panel otherwise has none of.
        content.textContent =
          'Settings. Appearance, Notifications, Privacy, Security, Accounts, Language and region.';
        const onOpenChange = vi.fn();
        drawer.setOptions({ onOpenChange });
        drawer.open(startSnapIndex);
        await expectSettledTo(() => drawer.phase, 'open');

        await realMouseDragPastClosed(side, panel, viewport);

        // The issue's own repro waits 1.5s after release before reading
        // the result: long enough for a stray `scrollend`, a stale
        // `onPointerUp` settle or the browser's own selection auto-scroll
        // to have already done whatever it was going to do.
        await sleep(1500);
        expect(drawer.phase).toBe('closed');
        expect(onOpenChange).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
      });
    }
  }
});
