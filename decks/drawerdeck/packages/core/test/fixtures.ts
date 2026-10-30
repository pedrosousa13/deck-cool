import { commands } from 'vitest/browser';
import { expect, vi } from 'vitest';
import { createDrawer, type Drawer, type DrawerOptions } from '../src/index';

export interface Fixture {
  dialog: HTMLDialogElement;
  viewport: HTMLDivElement;
  panel: HTMLDivElement;
  content: HTMLDivElement;
  backdrop: HTMLDivElement;
  drawer: Drawer;
}

/** Builds the DOM `createDrawer` expects (`decks/drawerdeck/docs/adr/0001`):
 * a dialog holding a backdrop and a viewport, the viewport holding the gap
 * spacer, one `[data-drawer-snap]` marker per snap point plus one for
 * closed, and the panel (with its own inner content scroller) -- in
 * `[gap][markers][panel]` order for `'bottom'`/`'right'` (the default),
 * reversed to `[panel][markers][gap]` for `'top'`/`'left'` (#270) -- then
 * creates the drawer over it and appends the dialog to the document. */
export function mount(
  options: DrawerOptions = {},
  // Tall enough (or wide enough, for 'left'/'right') to show every
  // configured snap point in full (a fraction of 1 needs the panel at
  // least as large as the viewport along its own axis): comfortably more
  // than any real viewport this runs in.
  { panelHeight = '2000px' }: { panelHeight?: string } = {}
): Fixture {
  const dialog = document.createElement('dialog');
  const backdrop = document.createElement('div');
  const viewport = document.createElement('div');
  const gap = document.createElement('div');
  gap.setAttribute('data-drawer-gap', '');
  const markerCount = (options.snapPoints?.length ?? 1) + 1;
  const markers = Array.from({ length: markerCount }, () => {
    const marker = document.createElement('div');
    marker.setAttribute('data-drawer-snap', '');
    return marker;
  });
  const panel = document.createElement('div');
  const horizontal = options.side === 'left' || options.side === 'right';
  if (horizontal) panel.style.width = panelHeight;
  else panel.style.height = panelHeight;
  const content = document.createElement('div');
  content.style.height = '100%';
  panel.append(content);
  const reversed = options.side === 'top' || options.side === 'left';
  if (reversed) viewport.append(panel, ...markers, gap);
  else viewport.append(gap, ...markers, panel);
  dialog.append(backdrop, viewport);
  document.body.append(dialog);
  const drawer = createDrawer(
    { dialog, viewport, panel, content, backdrop },
    options
  );
  return { dialog, viewport, panel, content, backdrop, drawer };
}

export function unmount(fixture: Fixture) {
  fixture.drawer.destroy();
  fixture.dialog.remove();
}

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for one real rendered frame: a `setTimeout`-based wait, however
 * long, is not enough in WebKit for a scroll-driven `clip-path` animation's
 * sampled value to reach `getComputedStyle` (and so hit-testing); only an
 * actual `requestAnimationFrame` tick does (#312's non-modal hit area). A
 * real gesture always has one of these between a scroll and a later click or
 * wheel; a test that jumps `scrollTop` synchronously and checks a hit test
 * right after needs one explicitly. */
export const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/** Waits until `read()` equals `expected`, then a while longer, and checks
 * it still does: "exactly this", not "this so far". */
export async function expectSettledTo<T>(
  read: () => T,
  expected: T,
  timeout = 4000
) {
  await expect.poll(read, { timeout }).toEqual(expected);
  await sleep(200);
  expect(read()).toEqual(expected);
}

/** Forces `motionBehavior()` to `'instant'`, so a test's opens, closes and
 * throws settle at once instead of over a native or eased animation: same
 * JS in every browser, no CDP (Chromium-only) needed. */
export function mockReducedMotion() {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    query.includes('prefers-reduced-motion')
      ? ({ matches: true } as MediaQueryList)
      : real(query)
  );
}

/** One real (untrusted but fully-formed) mouse pointer event. `setRef`-free
 * drag: the engine reads `clientY`, `pointerId`, `pointerType`, `button`
 * and `timeStamp` from it, nothing else. */
function pointerEvent(
  type: string,
  { x, y, pointerId = 1 }: { x: number; y: number; pointerId?: number }
) {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    pointerId,
    pointerType: 'mouse',
    button: 0,
    bubbles: true,
    cancelable: true
  });
}

/** A mouse drag on `panel`: presses at `from`, moves by each step's `dy`
 * (waiting `waitMs` first, for a slow drag that carries no flick, or a
 * flick's own short, fast steps), then releases -- unless `release` is
 * false, in which case the button stays down and the returned function
 * releases it later. */
export async function mouseDrag(
  panel: Element,
  from: { x: number; y: number },
  steps: { dy: number; waitMs?: number }[],
  { release = true }: { release?: boolean } = {}
): Promise<() => void> {
  panel.dispatchEvent(pointerEvent('pointerdown', from));
  let y = from.y;
  for (const step of steps) {
    if (step.waitMs) await sleep(step.waitMs);
    y += step.dy;
    panel.dispatchEvent(pointerEvent('pointermove', { x: from.x, y }));
  }
  const letGo = () =>
    panel.dispatchEvent(pointerEvent('pointerup', { x: from.x, y }));
  if (release) letGo();
  return letGo;
}

/** A mouse drag on `panel` with real, trusted OS-level input (Playwright's
 * own `page.mouse`, via the `dragPointerDown`/`dragPointerMoveTo`/
 * `dragPointerUp` commands in `vitest.config.ts`), not `mouseDrag`'s
 * hand-dispatched `PointerEvent`s: presses `{x, y}` away from `panel`'s own
 * top-left corner, then nudges the pointer by `step` CSS pixels at a time
 * along `axis` (negative moves it up/left), re-reading the Viewport's own
 * scroll position on that axis after each nudge, until `until(…)` is true
 * or `maxSteps` is reached, then releases. `axis` defaults to `'y'`
 * (`scrollTop`, every `bottom`/`top` drawer); pass `'x'` for `scrollLeft`
 * (`left`/`right`, #270). A closed loop, not a single multi-step move to a
 * precomputed target: how far a given `page.mouse` delta actually moves the
 * pointer is not 1:1 with the CSS pixels asked for in this environment, so
 * this drives the real, resulting scroll position back into the loop
 * instead of trusting the math. `panel` needs a unique attribute to reach
 * it from the command's own, Node-side `Locator`, set here and cleared
 * after. */
export async function realMouseDrag(
  panel: HTMLElement,
  viewport: HTMLElement,
  { x, y }: { x: number; y: number },
  until: (scrollPos: number) => boolean,
  {
    step = 12,
    maxSteps = 400,
    axis = 'y'
  }: { step?: number; maxSteps?: number; axis?: 'x' | 'y' } = {}
) {
  const scrollProp = axis === 'x' ? 'scrollLeft' : 'scrollTop';
  const marker = `data-test-drag-${Math.random().toString(36).slice(2)}`;
  panel.setAttribute(marker, '');
  try {
    const start = await commands.dragPointerDown(`[${marker}]`, x, y);
    let cursorX = start.x;
    let cursorY = start.y;
    let steps = 0;
    while (!until(viewport[scrollProp]) && steps < maxSteps) {
      if (axis === 'x') cursorX += step;
      else cursorY += step;
      await commands.dragPointerMoveTo(cursorX, cursorY);
      await nextFrame();
      steps += 1;
    }
  } finally {
    await commands.dragPointerUp();
    panel.removeAttribute(marker);
  }
}
