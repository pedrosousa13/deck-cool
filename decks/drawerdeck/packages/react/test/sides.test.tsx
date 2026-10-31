// `side` (#270): `@drawerdeck/core`'s own `packages/core/test/sides.test.ts`
// covers the mirrored scroll math for `top`/`left`/`right` in depth,
// including a real drag onto a snap point. This file only checks what's
// specific to the React layer: `data-side` on the Popup and the Panel, the
// Viewport's own DOM order (reversed for `top`/`left`), and that a real
// click on the Trigger and the Close button, a real Escape keypress, and a
// real mouse drag all still reach the drawer through `Drawer.Root`'s wiring
// for a non-bottom side.
import { commands, userEvent } from 'vitest/browser';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Side } from '@drawerdeck/react';
import {
  expectSettledTo,
  mockReducedMotion,
  nextFrame,
  panelOf,
  popupOf,
  TestDrawer,
  viewportOf
} from './fixtures';

afterEach(() => vi.restoreAllMocks());

const SIDES: readonly Side[] = ['bottom', 'top', 'left', 'right'];

describe('data-side and the Viewport’s own DOM order', () => {
  for (const side of SIDES) {
    it(`side="${side}": data-side on the Popup and the Panel`, () => {
      render(<TestDrawer side={side} />);

      expect(popupOf(document.body).getAttribute('data-side')).toBe(side);
      expect(panelOf(document.body).getAttribute('data-side')).toBe(side);
    });

    const reversed = side === 'top' || side === 'left';
    it(`side="${side}": the gap sits ${reversed ? 'after' : 'before'} the Panel`, () => {
      render(<TestDrawer side={side} />);

      const viewport = viewportOf(document.body);
      const gap = viewport.querySelector('[data-drawer-gap]')!;
      const panel = panelOf(document.body);
      const position = gap.compareDocumentPosition(panel);
      if (reversed) {
        expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      } else {
        expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });
  }

  it('defaults to "bottom" when side is omitted', () => {
    render(<TestDrawer />);

    expect(popupOf(document.body).getAttribute('data-side')).toBe('bottom');
  });
});

/** The scroll-axis properties a non-bottom side's drag test reads, keyed the
 * way `viewport`'s own DOM properties are named for each axis. `bottom`
 * needs none of this (not covered here; see this file's own top comment). */
const AXIS_PROPS: Record<
  'top' | 'left' | 'right',
  {
    scrollProp: 'scrollTop' | 'scrollLeft';
    clientProp: 'clientHeight' | 'clientWidth';
    extentProp: 'scrollHeight' | 'scrollWidth';
    axis: 'x' | 'y';
  }
> = {
  top: {
    scrollProp: 'scrollTop',
    clientProp: 'clientHeight',
    extentProp: 'scrollHeight',
    axis: 'y'
  },
  left: {
    scrollProp: 'scrollLeft',
    clientProp: 'clientWidth',
    extentProp: 'scrollWidth',
    axis: 'x'
  },
  right: {
    scrollProp: 'scrollLeft',
    clientProp: 'clientWidth',
    extentProp: 'scrollWidth',
    axis: 'x'
  }
};

/** A tiny marker, appended as a child of `panel` and positioned at a point
 * on the Panel's own local box that is currently scrolled into the
 * Viewport's own visible window. Pressing a fixed small offset from the
 * Panel's own top-left corner only happens to land inside that window for
 * `right` (a forward axis: the Panel's own start coincides with the
 * Viewport's); `top`/`left` start the Panel at content position 0, which
 * the window only reaches once mostly open, so the Panel's own corner
 * itself sits scrolled far out of view at the half-open snap this test
 * drags from (`@drawerdeck/core`'s own `packages/core/test/sides.test.ts`,
 * `addPressMarker`, covers the same ground in more depth). */
function addPressMarker(
  side: 'top' | 'left' | 'right',
  panel: HTMLElement,
  viewport: HTMLElement
): { marker: HTMLElement; remove: () => void } {
  const horizontal = side === 'left' || side === 'right';
  const reversed = side === 'top' || side === 'left';
  const { scrollProp, clientProp } = AXIS_PROPS[side];
  const panelExtent = horizontal ? panel.offsetWidth : panel.offsetHeight;
  const client = viewport[clientProp];
  const scroll = viewport[scrollProp];
  const panelAbsStart = reversed ? 0 : client;
  const visibleStart = Math.max(0, scroll - panelAbsStart);
  const visibleEnd = Math.min(panelExtent, scroll + client - panelAbsStart);
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

/** A mouse drag on `marker` with real, trusted OS-level input (Playwright's
 * own `page.mouse`, via the `dragPointerDown`/`dragPointerMoveTo`/
 * `dragPointerUp` commands in `decks/drawerdeck/vitest.config.ts`), nudging
 * the pointer `step` CSS pixels at a time along `axis` until `until()` is
 * true or `maxSteps` is reached, then releases -- the same loop
 * `@drawerdeck/core`'s own `realMouseDrag` (`packages/core/test/fixtures.ts`)
 * drives, reading the real, resulting scroll position back after each nudge
 * instead of trusting the math. `until` has to read a scroll threshold, not
 * the Popup's own `data-phase`: the Panel leaving the Viewport's visible
 * area closes the drawer on its own, mid-drag, through an
 * `IntersectionObserver` (`@drawerdeck/core`'s own `index.ts`, "closing as
 * soon as the Panel leaves view", #296), *before* this releases the
 * pointer; releasing afterward still runs the engine's own
 * drag-release settle, which read a stale, already-reset scroll position
 * and reopened the drawer in an earlier revision of this test. Stopping at
 * the same scroll target `@drawerdeck/core`'s own test releases at avoids
 * the race instead of relying on it. */
async function realMouseDrag(
  marker: HTMLElement,
  until: () => boolean,
  {
    step,
    axis,
    maxSteps = 400
  }: { step: number; axis: 'x' | 'y'; maxSteps?: number }
) {
  const markerAttr = `data-test-drag-${Math.random().toString(36).slice(2)}`;
  marker.setAttribute(markerAttr, '');
  try {
    const start = await commands.dragPointerDown(`[${markerAttr}]`, 1, 1);
    let cursorX = start.x;
    let cursorY = start.y;
    let steps = 0;
    while (!until() && steps < maxSteps) {
      if (axis === 'x') cursorX += step;
      else cursorY += step;
      await commands.dragPointerMoveTo(cursorX, cursorY);
      await nextFrame();
      steps += 1;
    }
  } finally {
    await commands.dragPointerUp();
    marker.removeAttribute(markerAttr);
  }
}

describe('a non-bottom side still opens and closes through Drawer.Root', () => {
  it('side="right": opens on the trigger, closes on a real Escape keypress', async () => {
    mockReducedMotion();
    const onOpenChange = vi.fn();
    render(
      <TestDrawer
        side="right"
        snapPoints={[0.5, 1]}
        onOpenChange={onOpenChange}
      />
    );
    const popup = popupOf(document.body);

    await userEvent.click(document.body.querySelector('button')!);

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');
    expect(onOpenChange).toHaveBeenCalledWith(true, { reason: 'trigger' });

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'escape' });
  });

  it('side="top": closes on a real Escape keypress, returning focus to the trigger', async () => {
    mockReducedMotion();
    render(<TestDrawer side="top" snapPoints={[0.5]} />);
    const trigger = document.body.querySelector('button')!;
    await userEvent.click(trigger);
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    await userEvent.keyboard('{Escape}');

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
    expect(document.activeElement).toBe(trigger);
  });

  it('side="left": closes on a real click on the close button', async () => {
    mockReducedMotion();
    // The fixture's own default `panelWidth` (2000, `fixtures.tsx`) is
    // deliberately wider than any real test viewport, for the DOM-order
    // and `data-side` checks above: at that width, `snapPoints={[0.5]}`
    // never scrolls the Close button itself into view on a reversed
    // (`left`/`top`) side, since it sits across the Panel's own far edge
    // from where those fractions land ("Open from a side": give the Panel
    // a width that covers the largest snap point). `panelWidth="100%"`
    // with `snapPoints={[1]}` does cover it, landing the whole Panel --
    // Close included -- in view; a short `content` keeps the Panel inside
    // the dialog's own clipped height too, since the default 80-row
    // content runs well past it.
    render(
      <TestDrawer
        side="left"
        snapPoints={[1]}
        panelWidth="100%"
        content={<p>Just enough content to reach Close.</p>}
      />
    );
    await userEvent.click(document.body.querySelector('button')!);
    const popup = popupOf(document.body);
    await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

    const buttons = document.body.querySelectorAll('button');
    await userEvent.click(buttons[buttons.length - 1] as HTMLButtonElement);

    await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
  });

  // `retry: 2`: a real WebKit press-move-release session occasionally never
  // gets past its own first move, the same WebKit limitation
  // `@drawerdeck/core`'s `index.test.ts` and `sides.test.ts` already
  // document on their own `mouseDrag`/`realMouseDrag`; a retry re-opens a
  // fresh fixture and tries the gesture again.
  for (const side of ['top', 'left', 'right'] as const) {
    it(
      `side="${side}": a real mouse drag closes it`,
      { retry: 2 },
      async () => {
        mockReducedMotion();
        const onOpenChange = vi.fn();
        render(
          <TestDrawer
            side={side}
            snapPoints={[0.5]}
            onOpenChange={onOpenChange}
          />
        );
        await userEvent.click(document.body.querySelector('button')!);
        const popup = popupOf(document.body);
        await expectSettledTo(() => popup.getAttribute('data-phase'), 'open');

        const viewport = viewportOf(document.body);
        const panel = panelOf(document.body);
        const reversed = side === 'top' || side === 'left';
        const { axis, scrollProp, clientProp, extentProp } = AXIS_PROPS[side];
        const maxScroll = viewport[extentProp] - viewport[clientProp];
        // Short of the exact closed offset, not at it: the Panel fully
        // leaving the Viewport's visible area closes the drawer on its own
        // (`realMouseDrag`'s own comment, above, #296) slightly before
        // `maxScroll` in practice, and letting this loop's own pointer
        // moves cross that point first -- still "dragging" by the
        // engine's own bookkeeping -- is what let a stale release reopen
        // it. Stopping (and releasing) comfortably short of it instead
        // leaves `@drawerdeck/core`'s own release-triggered settle (not
        // the Panel-visibility shortcut) to finish the close, the same
        // nearest-candidate path a real drag that let go a little early
        // would take.
        const margin = 100;
        const closedTarget = reversed ? maxScroll - margin : margin;
        const reachedClosedTarget = reversed
          ? () => viewport[scrollProp] >= closedTarget
          : () => viewport[scrollProp] <= closedTarget;

        const { marker, remove } = addPressMarker(side, panel, viewport);
        await realMouseDrag(marker, reachedClosedTarget, {
          step: reversed ? -12 : 12,
          axis
        });
        remove();

        await expectSettledTo(() => popup.getAttribute('data-phase'), 'closed');
        expect(onOpenChange).toHaveBeenCalledWith(false, { reason: 'drag' });
      }
    );
  }
});
