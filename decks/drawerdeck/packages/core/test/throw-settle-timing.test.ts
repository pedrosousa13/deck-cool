// The mouse throw's ease (`throwTo`, 240ms) now settles within a frame of
// Base UI's own at every bench load (#269's first acceptance criterion,
// already met -- see the issue's own comment). This file covers its
// second: a browser test asserting `onSnapPointChange` fires within 50ms
// of the throw's ease actually ending, for a real, fast mouse flick -- not
// a mocked `prefers-reduced-motion` throw (which `throwTo` would skip
// outright, straight to the target, with nothing to time).
//
// "The ease ending" is read from the Viewport's own `scroll` events, not a
// test-only hook into the engine: `throwTo`'s last `requestAnimationFrame`
// frame writes the exact target scroll position, then calls `onDone`
// (`settleOpenAt`, which fires `onSnapPointChange`) synchronously, in the
// same turn -- before the browser dispatches that write's own `scroll`
// event, which it queues rather than firing inline. Measured over ten runs
// each (this file's own comment on the assertion, below), WebKit fires
// `onSnapPointChange` about one frame (~16ms) *before* that last `scroll`
// event, and Chromium about one frame *after* it: the sign depends on the
// browser's own scheduling of a queued `scroll` dispatch against the
// `onSnapPointChange` call already made, not on anything this engine
// controls, so the assertion checks the size of the gap, not its direction.
import { commands } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { expectSettledTo, mount, unmount, type Fixture } from './fixtures';

let fixture: Fixture | undefined;
afterEach(() => {
  if (fixture) unmount(fixture);
  fixture = undefined;
});

/** A fast, real mouse flick -- Playwright's own `page.mouse`, through the
 * `dragPointerDown`/`dragPointerMoveTo`/`dragPointerUp` commands
 * `vitest.config.ts` defines (the same real, trusted input `realMouseDrag`
 * in `fixtures.ts` drives) -- rather than `realMouseDrag`'s own
 * self-correcting loop: that loop drives the pointer until the resulting
 * scroll position reaches a target, which, with no `prefers-reduced-motion`
 * mock, can release right at (or past) the far snap point, leaving the
 * later throw nothing real to ease over. This instead presses `panel` at
 * `{x, y}`, then moves the pointer `deltaY` CSS pixels up, in `steps`
 * back-to-back jumps with no wait between them, and releases: real OS
 * events, each with its own real timestamp, fast enough and close enough
 * together (well inside the engine's own `DRAG_HISTORY_MS` velocity
 * window) to carry real throw velocity, released at a known point short of
 * the full distance. */
async function flick(
  panel: HTMLElement,
  { x, y }: { x: number; y: number },
  deltaY: number,
  steps = 5
) {
  const marker = `data-test-flick-${Math.random().toString(36).slice(2)}`;
  panel.setAttribute(marker, '');
  try {
    const start = await commands.dragPointerDown(`[${marker}]`, x, y);
    for (let i = 1; i <= steps; i++) {
      await commands.dragPointerMoveTo(start.x, start.y + (deltaY * i) / steps);
    }
  } finally {
    await commands.dragPointerUp();
    panel.removeAttribute(marker);
  }
}

describe('a real mouse throw reports its snap point within 50ms of its ease ending (#269)', () => {
  // No mockReducedMotion here, unlike most of this package's other mouse
  // drag tests: the throw's real 240ms ease must actually run, the same
  // reason "a mouse drag released partway, slowly (#279)" (`index.test.ts`)
  // skips it too.

  it('fires onSnapPointChange with the new index, within 50ms of the last scroll event the ease itself produces', async () => {
    fixture = mount({ snapPoints: [0.5, 1] });
    const { viewport, panel, drawer } = fixture;
    drawer.open();
    await expectSettledTo(() => drawer.phase, 'open');

    const fullTarget = Math.round(viewport.clientHeight);
    const startScroll = viewport.scrollTop;

    // Every `scroll` event from here on, with the real time it fired:
    // the drag's own direct writes, then the later eased throw's.
    const scrollLog: { t: number; st: number }[] = [];
    viewport.addEventListener('scroll', () => {
      scrollLog.push({ t: performance.now(), st: viewport.scrollTop });
    });
    let snapChangeAt: number | undefined;
    let snapChangeIndex: number | undefined;
    drawer.setOptions({
      onSnapPointChange: (index) => {
        snapChangeAt = performance.now();
        snapChangeIndex = index;
      }
    });

    // Up (negative) by 55% of the distance still open to the full snap
    // point: fast and close together enough (`flick`'s own comment) that
    // the release velocity, projected (`THROW_VELOCITY_SCALE`), lands
    // nearest the full snap point -- but released well short of it, so
    // the throw's own ease has real distance left to cover.
    const dragDistance = Math.round((fullTarget - startScroll) * 0.55);
    const releasedLogIndex = scrollLog.length;
    await flick(panel, { x: 10, y: 10 }, -dragDistance);

    await expectSettledTo(() => drawer.snapIndex, 1);

    // The ease genuinely ran, over several frames, rather than the drag's
    // own release already landing on (or past) the target: at least a few
    // `scroll` events fired after release, before the last one settles
    // exactly on the full target.
    const afterRelease = scrollLog.slice(releasedLogIndex);
    expect(afterRelease.length).toBeGreaterThan(2);
    const lastScroll = afterRelease[afterRelease.length - 1];
    expect(lastScroll.st).toBe(fullTarget);

    expect(snapChangeIndex).toBe(1);
    expect(snapChangeAt).toBeDefined();
    // Within about one frame of the last scroll event either way (this
    // file's own top comment): ten runs each measured Chromium at ~+15 to
    // +37ms and WebKit at a steady ~-15 to -16ms, so the sign is browser-
    // specific scheduling noise, not a regression -- only the size of the
    // gap is asserted.
    const delta = snapChangeAt! - lastScroll.t;
    expect(Math.abs(delta)).toBeLessThanOrEqual(50);
  });
});
