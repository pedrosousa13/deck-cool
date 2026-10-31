// Opening from a side other than the bottom (#270). `side="bottom"` is
// covered everywhere else in this file and in `index.test.ts`, unchanged:
// this file is only the other three, parameterized together since the
// mechanics (`scrollForSnap`'s mirrored math in `@drawerdeck/core`) are the
// same shape for all of them, just along a different axis and, for
// `top`/`left`, in the opposite direction.
import { userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Side } from '../src/index';
import {
  expectSettledTo,
  mockReducedMotion,
  mount,
  nextFrame,
  realMouseDrag,
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

interface SideCase {
  side: Side;
  axis: 'x' | 'y';
  scrollProp: 'scrollTop' | 'scrollLeft';
  clientProp: 'clientHeight' | 'clientWidth';
  scrollExtentProp: 'scrollHeight' | 'scrollWidth';
  /** `top`/`left`: closed sits at the scroll end, open at 0 (mirrored DOM
   * order); `right`: a plain forward axis, same as `bottom`. */
  reversed: boolean;
}

type SideAxisProps = Pick<SideCase, 'scrollProp' | 'clientProp'>;

const CASES: SideCase[] = [
  {
    side: 'top',
    axis: 'y',
    scrollProp: 'scrollTop',
    clientProp: 'clientHeight',
    scrollExtentProp: 'scrollHeight',
    reversed: true
  },
  {
    side: 'left',
    axis: 'x',
    scrollProp: 'scrollLeft',
    clientProp: 'clientWidth',
    scrollExtentProp: 'scrollWidth',
    reversed: true
  },
  {
    side: 'right',
    axis: 'x',
    scrollProp: 'scrollLeft',
    clientProp: 'clientWidth',
    scrollExtentProp: 'scrollWidth',
    reversed: false
  }
];

/** A point on screen very close to `side`'s own anchor edge, centred on
 * the cross axis: always inside the Panel's visible region once the
 * drawer is open at all, whatever fraction. */
function anchorPoint(side: Side, rect: DOMRect): [number, number] {
  const midX = (rect.left + rect.right) / 2;
  const midY = (rect.top + rect.bottom) / 2;
  switch (side) {
    case 'bottom':
      return [midX, rect.bottom - 10];
    case 'top':
      return [midX, rect.top + 10];
    case 'right':
      return [rect.right - 10, midY];
    case 'left':
      return [rect.left + 10, midY];
  }
}

/** The opposite corner from `side`'s own anchor edge: still the page, not
 * the Panel, at any open fraction less than 1. */
function farCorner(side: Side, rect: DOMRect): [number, number] {
  switch (side) {
    case 'bottom':
    case 'right':
      return [rect.left + 25, rect.top + 25];
    case 'top':
      return [rect.left + 25, rect.bottom - 25];
    case 'left':
      return [rect.right - 25, rect.top + 25];
  }
}

/** `mount()`'s own default `panelHeight` (`fixtures.ts`): every test in
 * this file mounts with no override, so this is the Panel's real extent
 * along its own axis. */
const PANEL_EXTENT = 2000;

/** A tiny marker, appended as a child of `panel` and positioned (`position:
 * absolute`, against a `position: relative` panel) at a point on the
 * Panel's own local box that is currently scrolled into the Viewport's own
 * window -- the middle of whatever slice of the Panel (`PANEL_EXTENT` long,
 * far bigger than the Viewport) that window currently shows. Pressing a
 * fixed small offset like `{x: 10, y: 10}` from the Panel's own top-left
 * corner only happens to land inside that window for `bottom`/`right` (a
 * forward axis: the Panel's own start coincides with the Viewport's);
 * `top`/`left` start the Panel at content position 0, which the window
 * only reaches once mostly open, so the Panel's own top-left corner itself
 * sits scrolled far out of view. A dedicated marker, not an offset on
 * `panel` itself, sidesteps computing that point in whatever coordinate
 * space `vitest/browser`'s `dragPointerDown` command presses in (a
 * page-relative one, through Playwright's own `boundingBox()`): Playwright
 * finds the marker's own box itself, fresh, so only the marker's *local*
 * position (relative to `panel`) need be right, not a translation between
 * two coordinate spaces. A descendant of `panel`, not a sibling: the real
 * press still bubbles to the engine's own `pointerdown` listener, on
 * `panel`. Returns the marker and a `remove` cleanup, restoring `panel`'s
 * own `position`. */
function addPressMarker(
  side: Side,
  panel: HTMLElement,
  viewport: HTMLElement,
  { scrollProp, clientProp }: SideAxisProps
): { marker: HTMLElement; remove: () => void } {
  const horizontal = side === 'left' || side === 'right';
  const reversed = side === 'top' || side === 'left';
  const client = viewport[clientProp];
  const scroll = viewport[scrollProp];
  // The Panel's own content-coordinate start: right after the gap
  // (`client`) for a forward side, 0 for a reversed one (this file's own
  // top comment, and `@drawerdeck/core`'s module doc).
  const panelAbsStart = reversed ? 0 : client;
  const visibleStart = Math.max(0, scroll - panelAbsStart);
  const visibleEnd = Math.min(PANEL_EXTENT, scroll + client - panelAbsStart);
  const main = Math.round((visibleStart + visibleEnd) / 2);

  const previousPosition = panel.style.position;
  panel.style.position = 'relative';
  const marker = document.createElement('div');
  Object.assign(marker.style, {
    position: 'absolute',
    width: '4px',
    height: '4px',
    left: horizontal ? `${main}px` : '10px',
    top: horizontal ? '10px' : `${main}px`
  });
  panel.append(marker);
  return {
    marker,
    remove: () => {
      marker.remove();
      panel.style.position = previousPosition;
    }
  };
}

function appendBehindInputAt(x: number, y: number) {
  const input = document.createElement('input');
  Object.assign(input.style, {
    position: 'fixed',
    left: `${x - 25}px`,
    top: `${y - 25}px`,
    width: '50px',
    height: '50px'
  });
  document.body.append(input);
  return input;
}

for (const {
  side,
  axis,
  scrollProp,
  clientProp,
  scrollExtentProp,
  reversed
} of CASES) {
  describe(`side="${side}" (#270)`, () => {
    beforeEach(() => mockReducedMotion());

    it('opens to the first configured snap point, at the mirrored scroll offset', async () => {
      fixture = mount({ side, snapPoints: [0.5, 1] });
      const { viewport, drawer } = fixture;

      drawer.open();

      await expectSettledTo(() => drawer.phase, 'open');
      const extent = viewport[clientProp];
      const maxScroll = viewport[scrollExtentProp] - extent;
      const forward = Math.round(extent * 0.5);
      const expected = reversed ? maxScroll - forward : forward;
      expect(Math.abs(viewport[scrollProp] - expected)).toBeLessThan(2);
      expect(drawer.snapIndex).toBe(0);
    });

    // `retry: 2`: a real WebKit press-move-release session that follows
    // enough earlier ones in the same run (`index.test.ts`'s own two, plus
    // this file's six across three sides) occasionally never gets past its
    // own first move, confirmed by instrumenting every step the same way
    // `index.test.ts`'s own comment on this documents; a retry re-opens a
    // fresh fixture and tries the gesture again, same as a human would.
    it(
      'a real mouse drag throws onto the full snap point',
      { retry: 2 },
      async () => {
        fixture = mount({ side, snapPoints: [0.5, 1] });
        const { viewport, panel, drawer } = fixture;
        const onSnapPointChange = vi.fn();
        drawer.setOptions({ onSnapPointChange });
        drawer.open();
        await expectSettledTo(() => drawer.phase, 'open');

        const extent = viewport[clientProp];
        const maxScroll = viewport[scrollExtentProp] - extent;
        const target = reversed ? maxScroll - extent : extent;
        // Moving the pointer toward `side`'s own anchor edge always opens it
        // further (this file's own top comment, and `@drawerdeck/core`'s own
        // `onPointerMove`): a forward side (`right`) opens as the pointer
        // moves away from its anchor, a reversed one (`top`/`left`) as it
        // moves toward it -- `step`'s sign below is just that, expressed
        // along `axis`.
        const step = reversed ? 12 : -12;
        const until = reversed
          ? (pos: number) => pos <= target
          : (pos: number) => pos >= target;

        const { marker, remove } = addPressMarker(side, panel, viewport, {
          scrollProp,
          clientProp
        });
        await realMouseDrag(marker, viewport, { x: 1, y: 1 }, until, {
          step,
          axis
        });
        remove();

        await expectSettledTo(() => drawer.snapIndex, 1);
        expect(onSnapPointChange).toHaveBeenCalledWith(1);
      }
    );

    // `retry: 2`: see the previous test's own comment.
    it(
      'a real mouse drag closes it, settling at the mirrored closed offset',
      { retry: 2 },
      async () => {
        fixture = mount({ side, snapPoints: [0.5, 1] });
        const { viewport, panel, drawer } = fixture;
        const onOpenChange = vi.fn();
        drawer.setOptions({ onOpenChange });
        drawer.open(1);
        await expectSettledTo(() => drawer.phase, 'open');

        const extent = viewport[clientProp];
        const maxScroll = viewport[scrollExtentProp] - extent;
        const closedTarget = reversed ? maxScroll : 0;
        const step = reversed ? -12 : 12;
        const until = reversed
          ? (pos: number) => pos >= closedTarget
          : (pos: number) => pos <= closedTarget;

        const { marker, remove } = addPressMarker(side, panel, viewport, {
          scrollProp,
          clientProp
        });
        await realMouseDrag(marker, viewport, { x: 1, y: 1 }, until, {
          step,
          axis
        });
        remove();

        await expectSettledTo(() => drawer.phase, 'closed');
        expect(onOpenChange).toHaveBeenCalledWith(false, 'drag');
      }
    );

    it('closes on a real Escape keypress when dismissible, not when it is not', async () => {
      fixture = mount({ side, snapPoints: [0.5], dismissible: false });
      const { drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');

      await userEvent.keyboard('{Escape}');
      await sleep(300);
      expect(drawer.phase).toBe('open');

      drawer.setOptions({ dismissible: true });
      await userEvent.keyboard('{Escape}');
      await expectSettledTo(() => drawer.phase, 'closed');
    });

    it('close() still works when not dismissible', async () => {
      fixture = mount({ side, snapPoints: [0.5], dismissible: false });
      const { drawer } = fixture;
      drawer.open();
      await expectSettledTo(() => drawer.phase, 'open');

      drawer.close('close-button');

      await expectSettledTo(() => drawer.phase, 'closed');
    });

    describe('the non-modal clip-path hit area', () => {
      it('leaves the far corner (the page), a real click still reaching it', async () => {
        fixture = mount({ side, snapPoints: [0.5], modal: false });
        const { viewport, drawer } = fixture;
        drawer.open();
        await expectSettledTo(() => drawer.phase, 'open');
        await nextFrame();

        const rect = viewport.getBoundingClientRect();
        const [x, y] = farCorner(side, rect);
        const behind = appendBehindInputAt(x, y);
        await nextFrame();

        expect(document.elementFromPoint(x, y)).toBe(behind);
        await userEvent.click(behind);
        expect(document.activeElement).toBe(behind);
        behind.remove();
      });

      it('still hit-tests the Viewport right at the Panel’s own anchor edge', async () => {
        fixture = mount({ side, snapPoints: [0.5], modal: false });
        const { viewport, drawer } = fixture;
        drawer.open();
        await expectSettledTo(() => drawer.phase, 'open');
        await nextFrame();

        const rect = viewport.getBoundingClientRect();
        const [x, y] = anchorPoint(side, rect);
        expect(viewport.contains(document.elementFromPoint(x, y))).toBe(true);
      });
    });
  });
}
