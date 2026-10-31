/**
 * The framework-neutral drawer engine. A sheet built on native scrolling
 * (ADR 0001): the viewport is a scroll-snap container, closed and every
 * snap point are places it can rest, and the browser drags, flings and
 * settles it the way it already does for a page. `<dialog>` gives the top
 * layer, focus trapping, an inert page and Escape.
 *
 * Opens from any of the four sides (#270): `bottom` and `right` keep the
 * Viewport's own children in `[gap][panel]` order, a plain scroll-snap
 * container along the vertical or the horizontal axis. `top` and `left`
 * reverse that DOM order to `[panel][gap]` instead of using
 * `flex-direction: *-reverse` or `direction: rtl` (both give negative
 * scroll offsets, and carry their own WebKit bugs): every `scrollTop` or
 * `scrollLeft` this engine reads or writes stays a plain, positive number,
 * with `open` at 0 and `closed` at the scroll end, and the snap-point and
 * close math mirrored (`scrollForSnap`, below) against the Viewport's own
 * maximum scroll position for those two sides.
 *
 * The caller (`@drawerdeck/react`) owns every DOM node, including the
 * viewport's `[data-drawer-gap]` spacer and `[data-drawer-snap]` markers:
 * this engine only reads them, positions the markers and sets the
 * structural styles the mechanics need. Ported from the throwaway
 * prototype's variant B (`decks/sheetdeck-prototype/index.html`,
 * `prototype/sheetdeck`), ruled on in #232: the inner content stays locked
 * until the drawer reaches its top snap point.
 */

/** A snap point: a fraction of the Viewport's extent along the side's axis
 * (height for `bottom`/`top`, width for `left`/`right`), 0 to 1, or a fixed
 * length such as `'320px'`. */
export type SnapPoint = number | `${number}px`;

export type Phase = 'closed' | 'opening' | 'open' | 'closing';

export type OpenChangeReason =
  | 'trigger'
  | 'drag'
  | 'escape'
  | 'outside-press'
  | 'close-button'
  | 'programmatic';

/** Which edge the drawer opens from. `bottom` and `right` scroll a plain
 * forward axis (closed at 0, open points further along it); `top` and
 * `left` reverse the Viewport's own DOM order instead of its scroll
 * direction, so open and closed mirror onto the same, always-positive
 * scroll range (see this file's own top comment). Read once, at
 * `createDrawer`: like `parts`, a consumer changing it recreates the
 * drawer rather than calling `setOptions`, since it is what decides the
 * DOM order the caller renders, not something this engine can repaint on
 * its own. */
export type Side = 'bottom' | 'top' | 'left' | 'right';

export interface DrawerParts {
  dialog: HTMLDialogElement;
  /** The native scroll-snap container: contains a `[data-drawer-gap]`
   * spacer, one `[data-drawer-snap]` marker per snap point plus one for
   * closed, and the panel -- in `[gap][panel]` order for `bottom`/`right`,
   * `[panel][gap]` for `top`/`left` (`Side`'s own comment). */
  viewport: HTMLElement;
  panel: HTMLElement;
  /** The inner scroller, locked (no `overflow-y: auto` of its own) below
   * the top snap point. */
  content?: HTMLElement | null;
  backdrop?: HTMLElement | null;
}

export interface DrawerOptions {
  /** Which edge the drawer opens from. Defaults to `'bottom'`. */
  side?: Side;
  /** Fractions of the Viewport's extent along the side's axis (height for
   * `bottom`/`top`, width for `left`/`right`), or fixed lengths, the panel
   * can rest open at, nearest first. Without it, the drawer has one open
   * point: the panel's own content extent, capped by its own CSS
   * `max-height`/`max-width`. */
  snapPoints?: readonly SnapPoint[];
  /** Whether Escape, an outside press and a drag to closed can close the
   * drawer. `close()` and a close button still can. Defaults to true. */
  dismissible?: boolean;
  /** Whether the dialog opens with `showModal()` (the top layer, a focus
   * trap, an inert page, and Escape for free) or `show()` (none of that:
   * the page behind stays interactive). Defaults to true. An outside press
   * never closes a non-modal drawer, following Base UI's own non-modal
   * example (`modal={false}` with `disablePointerDismissal`). Escape is
   * read from `document`, not the dialog's
   * own `cancel` event, which a non-modal dialog does not fire (#271; see
   * the "Non-modal drawers" guide for why `show()`, not the Popover
   * API). */
  modal?: boolean;
  onOpenChange?(open: boolean, reason: OpenChangeReason): void;
  onSnapPointChange?(index: number): void;
  onPhaseChange?(phase: Phase): void;
  /** Whether a mouse drag on the panel is under way. Not in #234's typed
   * API: added so `data-dragging`, which the acceptance criteria lists
   * among the parts' data attributes, has a source. See the PR
   * description for why. */
  onDragChange?(dragging: boolean): void;
}

export interface Drawer {
  /** Opens the drawer to a snap point, clamped to the snap points there
   * are; the first (nearest closed) when omitted. Already open or
   * opening, goes to that snap point instead, as `snapTo` would. */
  open(snapIndex?: number): void;
  close(reason?: OpenChangeReason): void;
  /** Moves to a snap point while open; does nothing while closed. */
  snapTo(index: number): void;
  setOptions(options: Partial<DrawerOptions>): void;
  readonly phase: Phase;
  readonly snapIndex: number;
  destroy(): void;
}

const DRAG_HISTORY_MS = 100;
const THROW_DURATION_MS = 240;
const THROW_VELOCITY_SCALE = 200;
/** How close a scroll position must land to a snap point's to count as
 * resting there. */
const SETTLE_TOLERANCE = 4;
const SCROLLEND_DEBOUNCE_MS = 120;
/** The Panel's CSS entrance/exit (#268): `data-starting-style` and
 * `data-ending-style`, Base UI's own attribute names, carried over so
 * migrating from it is easy. */
const STARTING_STYLE_ATTR = 'data-starting-style';
const ENDING_STYLE_ATTR = 'data-ending-style';
/** Added to the Panel's own computed transition duration for the enter and
 * exit timeout fallbacks, so a `transitionend` that lands a frame or two
 * late (it does) still arrives before the timeout settles the phase
 * itself. */
const TRANSITION_TIMEOUT_MARGIN_MS = 50;

/** Marks the dialog this engine resets, so one shared stylesheet rule can
 * neutralise its native `::backdrop` (`Drawer.Backdrop` is the real dim
 * layer): inline styles cannot target a pseudo-element. */
const RESET_CLASS = 'drawerdeck-reset';

/** The named scroll timeline the Viewport exposes, scoped up to the dialog
 * so a sibling (`Drawer.Backdrop`, or any other descendant of the dialog)
 * can read it (#249). Reused across every drawer instance: `timeline-scope`
 * roots a fresh, independent named-timeline scope at each dialog, so two
 * drawers on the same page never see each other's `--drawer`. */
const SCROLL_TIMELINE_NAME = '--drawer';

/** Every side: the shared stylesheet (`ensureBackdropReset`, below) builds
 * one hit-area `@keyframes`/class pair per side, since two drawers on the
 * same page can open from different sides at once. */
const SIDES: readonly Side[] = ['bottom', 'top', 'left', 'right'];

/** Added to the Viewport, non-modal only, while the hit area should track
 * the scroll position (`updateHitArea`, below): drives `clip-path` natively
 * from the same `--drawer` scroll timeline, so the Viewport's hit-testable
 * region follows the Panel with no JS per scroll frame (#271, #312). One
 * class/`@keyframes` pair per side (`hitAreaClass`/`hitAreaKeyframes`,
 * below): `left` and `top` need their "from"/"to" clip swapped against
 * `bottom`/`right`'s, since open and closed sit at opposite ends of the
 * scroll range for those two sides (this file's own top comment). */
function hitAreaClass(side: Side): string {
  return `drawerdeck-hit-area-${side}`;
}
function hitAreaKeyframes(side: Side): string {
  return `drawerdeck-hit-area-${side}`;
}
/** The pixel offset of the Viewport's own maximum scroll position (its
 * `scrollHeight - clientHeight`, or the `scrollWidth`/`clientWidth`
 * equivalent for `left`/`right`), set once per layout (`measure`, below) so
 * the hit area's own scroll-driven animation has a fixed "fully open" value
 * to animate to: the scroll timeline's progress alone only ever gives a
 * 0-to-1 fraction, not a pixel value `clip-path` needs. Also what the
 * mirrored sides' snap-point and close math (`scrollForSnap`) measures
 * against. */
const MAX_SCROLL_VAR = '--drawer-max-scroll';

/** The `clip-path: inset()` argument that leaves exactly the Panel's own
 * visible region -- `v` long, flush against `side`'s own edge -- hit
 * testable (`updateHitArea`, below). `v` is a CSS length: `'0px'` (nothing
 * visible, fully clipped) or `var(--drawer-max-scroll,0px)` (the Viewport's
 * own full scroll range) in the shared stylesheet's `@keyframes`, or a
 * literal pixel value in the non-modal hit area's JS fallback. */
function hitAreaInset(side: Side, v: string): string {
  switch (side) {
    case 'bottom':
      return `calc(100% - ${v}) 0 0 0`;
    case 'top':
      return `0 0 calc(100% - ${v}) 0`;
    case 'right':
      return `0 0 0 calc(100% - ${v})`;
    case 'left':
      return `0 calc(100% - ${v}) 0 0`;
  }
}

/** The shared rules' sheet, once constructed, kept alive while any drawer is
 * mounted (ref-counted by `mountedDrawers`, below) and dropped from
 * `document.adoptedStyleSheets` when the last one is destroyed. A
 * constructed sheet, not a `<style>` element: `style-src` governs an
 * injected tag, but not `CSSStyleSheet.replaceSync` (#252). Carries the
 * `::backdrop` reset and every side's non-modal hit area `@keyframes`: all
 * the same kind of shared, instance-independent rule.
 *
 * The maximum scroll's own fraction cannot be read inside `@keyframes`:
 * a scroll timeline's progress is implicit there, not a value in scope,
 * so each "from"/"to" keyframe reads `--drawer-max-scroll` instead, an
 * ordinary custom property each Viewport sets on itself (`measure`). */
let resetSheet: CSSStyleSheet | undefined;
let mountedDrawers = 0;

function ensureBackdropReset() {
  mountedDrawers += 1;
  if (resetSheet) return;
  resetSheet = new CSSStyleSheet();
  let css = `.${RESET_CLASS}::backdrop{background:transparent}`;
  for (const side of SIDES) {
    const reversed = side === 'top' || side === 'left';
    const openInset = hitAreaInset(side, `var(${MAX_SCROLL_VAR},0px)`);
    const closedInset = hitAreaInset(side, '0px');
    // A scroll timeline's own progress always runs 0% (scrollTop/Left 0) to
    // 100% (the scroll end): `bottom`/`right` want 0% clipped away entirely
    // (closed) and 100% at the full hit area (open), `top`/`left` the exact
    // opposite, since open sits at 0 for them (this file's own top
    // comment).
    const from = reversed ? openInset : closedInset;
    const to = reversed ? closedInset : openInset;
    css +=
      `@keyframes ${hitAreaKeyframes(side)}{from{clip-path:inset(${from})}` +
      `to{clip-path:inset(${to})}}` +
      `.${hitAreaClass(side)}{animation:${hitAreaKeyframes(side)} 1s linear both;` +
      `animation-timeline:${SCROLL_TIMELINE_NAME}}`;
  }
  resetSheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, resetSheet];
}

function releaseBackdropReset() {
  mountedDrawers -= 1;
  if (mountedDrawers > 0 || !resetSheet) return;
  const sheet = resetSheet;
  resetSheet = undefined;
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
    (s) => s !== sheet
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function motionBehavior(): ScrollBehavior {
  return reducedMotion() ? 'instant' : 'smooth';
}

/** The longest `transition-duration` a consumer declared on `el`, in
 * milliseconds; 0 when none is declared (so the caller waits for
 * `transitionend` where there is a transition to end, and not at all where
 * there is none -- e.g. `prefers-reduced-motion` zeroed it in the
 * documented recipe). Comma-separated values (one per transitioned
 * property) resolve to the longest, the way the longest-running one decides
 * when a real `transitionend` for the element last fires. */
function transitionDurationMs(el: Element): number {
  const value = getComputedStyle(el).transitionDuration;
  if (!value) return 0;
  return value.split(',').reduce((longest, part) => {
    const n = Number.parseFloat(part);
    if (!Number.isFinite(n)) return longest;
    const ms = part.trim().endsWith('ms') ? n : n * 1000;
    return Math.max(longest, ms);
  }, 0);
}

interface SnapCandidate {
  /** -1 for closed; otherwise the index into the configured snap points. */
  index: number;
  px: number;
}

/** Creates the engine for one drawer. `parts` is a snapshot, read once: a
 * consumer whose DOM nodes change recreates the drawer (`@drawerdeck/react`
 * never does). */
export function createDrawer(
  parts: DrawerParts,
  options: DrawerOptions = {}
): Drawer {
  const { dialog, viewport, panel } = parts;
  const side: Side = options.side ?? 'bottom';
  const horizontal = side === 'left' || side === 'right';
  /** `top` and `left` reverse the Viewport's own DOM order
   * (`[panel][gap]`), so open sits at scroll offset 0 and closed at the
   * scroll end -- the opposite of `bottom`/`right`'s `[gap][panel]`. Every
   * function that turns a snap point's "forward" pixel offset into the
   * actual `scrollTop`/`scrollLeft` to write or compare against
   * (`scrollForSnap`, below) reads this; nothing else needs to. */
  const reversed = side === 'top' || side === 'left';
  const axis = horizontal
    ? ({
        scroll: 'scrollLeft',
        client: 'clientWidth',
        extent: 'scrollWidth',
        scrollToKey: 'left'
      } as const)
    : ({
        scroll: 'scrollTop',
        client: 'clientHeight',
        extent: 'scrollHeight',
        scrollToKey: 'top'
      } as const);
  let opts: DrawerOptions = { dismissible: true, modal: true, ...options };
  let phase: Phase = 'closed';
  let snapIndex = 0;
  /** The configured snap points' "forward" pixel offsets, nearest first:
   * the distance from the Panel's own start along its axis, independent of
   * `side` -- `scrollForSnap`, below, is what turns one of these into the
   * real `scrollTop`/`scrollLeft` to use. Excludes closed. */
  let snapPx: number[] = [];
  /** The Viewport's own maximum scroll position along its axis (its
   * `scrollHeight - clientHeight`, or the `scrollWidth`/`clientWidth`
   * equivalent), recomputed every `measure()`. What `scrollForSnap` mirrors
   * a `top`/`left` snap point's offset against, and what the non-modal hit
   * area's JS fallback and `--drawer-max-scroll` both read. */
  let maxScroll = 0;
  let pendingCloseReason: OpenChangeReason | null = null;
  let scrollEndDebounce: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  /** Turns a snap candidate's index (-1 for closed, else an index into
   * `snapPxArr`) into the actual `scrollTop`/`scrollLeft` value that
   * candidate rests at, given a snapshot of `snapPx` and `maxScroll`:
   * `bottom`/`right` read the forward offset as-is (closed at 0); `top`/
   * `left` mirror it against `maxScrollArg` instead (closed at the scroll
   * end), per this file's own top comment. Takes explicit snapshots, not
   * the live `snapPx`/`maxScroll`, so `onResize` can also use it to place
   * the *old* layout's targets before a fresh `measure()` overwrites
   * them. */
  function scrollTargetFor(
    index: number,
    snapPxArr: number[],
    maxScrollArg: number
  ): number {
    const forwardPx = index === -1 ? 0 : (snapPxArr[index] ?? 0);
    return reversed ? maxScrollArg - forwardPx : forwardPx;
  }

  /** `scrollTargetFor` against the live `snapPx`/`maxScroll`: every call
   * site but `onResize`'s own old-layout lookup uses this. */
  function scrollForSnap(index: number): number {
    return scrollTargetFor(index, snapPx, maxScroll);
  }

  // ---------- the CSS entrance and exit (#268) ----------
  // `data-starting-style` and `data-ending-style` are the only moving parts:
  // a consumer's own CSS transition on the Panel and the Backdrop does the
  // sliding and the fading, on the compositor, with nothing here running
  // per frame. See the "Animate the drawer" guide for the recipe.
  let enterRaf = 0;
  let enterTimer: ReturnType<typeof setTimeout> | undefined;
  let enterTransitionCleanup: (() => void) | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let interruptListenersAttached = false;
  /** True for a CSS exit's whole run (`beginExit` to `settleExit`): guards
   * `onScrollEnd` below the way `dragging` and `throwing` do, since this
   * exit never moves `scrollTop` and a stale `scrollend` left over from
   * whatever scroll opened the drawer must not read it as a native settle
   * back to `open` or to closed. An interruption never cancels a close
   * (#268), so this only ever clears through `settleExit`, whether the
   * exit gets there on its own or something -- a gesture, or `open()`
   * asking to resume -- finishes it early. */
  let cssExiting = false;
  /** How many native `close` events `finishClose`, just below, still owes
   * -- one per `dialog.close()` call it has made that the dialog's own
   * `close` listener has not yet seen. A count, not a flag: `close()`
   * fires that event as a queued task, not synchronously, so a flag reset
   * right after the call would already be too late once a `close`/`open`
   * cycle lands in between and the stale event finally arrives. Lets the
   * listener tell a close this engine asked for apart from one it never
   * did -- the double-Escape quirk mid-entrance (#268's second bug). */
  let pendingEngineCloses = 0;

  const gap = viewport.querySelector<HTMLElement>('[data-drawer-gap]');

  // Chromium and Safari ship `animation-timeline`, `scroll-timeline` and
  // `timeline-scope` together; Firefox stable does not yet (#236). Where
  // they resolve, the dim runs as a native scroll-driven animation with no
  // JS per scroll frame at all; `updateProgress`, below, becomes the
  // Firefox fallback only.
  const supportsScrollTimeline = CSS.supports('animation-timeline: scroll()');

  dialog.classList.add(RESET_CLASS);
  ensureBackdropReset();
  Object.assign(dialog.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100dvh',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: '0',
    padding: '0',
    border: '0',
    background: 'transparent',
    overflow: 'hidden'
  });
  Object.assign(viewport.style, {
    position: 'relative',
    height: '100%',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    willChange: 'scroll-position'
  });
  if (horizontal) {
    // `left`/`right` need the Viewport's own children laid out in a row --
    // the default block layout vertical sides use stacks them instead,
    // with no horizontal overflow at all -- `row`, never `row-reverse`:
    // `top`/`left`'s mirrored scroll math (this file's own top comment)
    // reverses the actual DOM order the caller renders, not the CSS
    // direction children flow in.
    Object.assign(viewport.style, {
      width: '100%',
      display: 'flex',
      overflowX: 'auto',
      scrollSnapType: 'x mandatory'
    });
  } else {
    Object.assign(viewport.style, {
      overflowY: 'auto',
      scrollSnapType: 'y mandatory'
    });
  }
  if (parts.backdrop) {
    Object.assign(parts.backdrop.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none'
    });
  }
  if (gap) {
    if (horizontal) {
      gap.style.width = '100%';
      // Flex's own default (`flex-shrink: 1`) would otherwise let the row
      // squeeze the gap (and the Panel, just below) below its own set
      // size once their combined width overflows the Viewport -- exactly
      // the condition that makes the Viewport scrollable at all.
      gap.style.flex = '0 0 auto';
    } else {
      gap.style.height = '100%';
    }
  }
  if (horizontal) {
    // Same reasoning as the gap's own `flex`, just above: an unstyled
    // Panel keeps its own natural width this way, the same as the default
    // block layout already gives it its own natural height for `bottom`/
    // `top`.
    panel.style.flex = '0 0 auto';
  }

  // Non-modal (#271): `showModal()`'s own top layer, focus trap and inert
  // page are what stop a click, a scroll, a hover, a text selection or a
  // focus move from reaching the page behind a modal drawer, not anything
  // here. `show()` opts out of all three, but the dialog still physically
  // covers the whole screen (`position: fixed; inset: 0`, above), so
  // without this it would still be the topmost hit-test target everywhere,
  // defeating the point. `pointer-events: none` opts the dialog itself out;
  // `pointer-events` inherits, so the Viewport needs its own `auto` back.
  // `updateHitArea`, below, then clips the Viewport to just the Panel's own
  // visible region with `clip-path`, so only a point actually over the
  // Panel still hits the Viewport at all: hit-testing respects
  // `clip-path` the same way it respects `pointer-events`. Every other
  // point falls straight through the (opted-out) dialog to the page behind,
  // a real hit there, not a forwarded one (#312: an earlier version left
  // the Viewport covering the whole screen and forwarded a real click
  // landing on its own bare surface by hand instead, which still left the
  // page's own hover, text selection and WebKit's wheel- and
  // trackpad-scrolling of the page unreachable). Modal, none of this runs:
  // the dialog keeps its default `pointer-events: auto`, with nothing
  // clipped away from it either, since its own top layer already does the
  // job.
  function applyModalStyle() {
    const nonModal = opts.modal === false;
    dialog.style.pointerEvents = nonModal ? 'none' : '';
    viewport.style.pointerEvents = 'auto';
    updateHitArea();
  }

  /** The Viewport's own hit-testable region, non-modal only (see
   * `applyModalStyle`, above, for why it needs one at all): clipped
   * (`hitAreaInset`) to exactly the portion of the Panel currently
   * scrolled into view, flush against `side`'s own edge, so a point
   * outside it falls through to the page. Driven by the `--drawer` scroll
   * timeline (`hitAreaClass(side)`, set up in `ensureBackdropReset`)
   * wherever it resolves, so nothing here runs per scroll frame; written
   * directly here only as the Firefox fallback (`onScroll`, below), the
   * same split `updateProgress` already makes for the dim.
   *
   * Suppressed entirely (the Viewport given up everywhere, to the page)
   * during the Panel's own CSS entrance and exit (`phase === 'opening'`, or
   * a programmatic close's `cssExiting`): both move the Panel with a
   * `transform`, never `scrollTop`/`scrollLeft`, so the scroll-position-
   * derived region above would already sit at the Panel's final, resting
   * place from their very first frame, ahead of the Panel's own, still-
   * animating position, and block real clicks on the page there until the
   * transition catches up. A drag-driven close keeps tracking throughout
   * instead: it moves the real scroll position itself, the same native
   * scroll the open already is, so the region above stays accurate all the
   * way down to closed. */
  function updateHitArea() {
    if (opts.modal !== false) {
      viewport.classList.remove(hitAreaClass(side));
      viewport.style.clipPath = '';
      return;
    }
    const tracking = !cssExiting && phase !== 'opening' && phase !== 'closed';
    if (!tracking) {
      viewport.classList.remove(hitAreaClass(side));
      viewport.style.clipPath = `inset(${hitAreaInset(side, '0px')})`;
    } else if (supportsScrollTimeline) {
      viewport.style.clipPath = '';
      viewport.classList.add(hitAreaClass(side));
    } else {
      viewport.classList.remove(hitAreaClass(side));
      const raw = viewport[axis.scroll];
      const v = reversed ? maxScroll - raw : raw;
      viewport.style.clipPath = `inset(${hitAreaInset(side, `${v}px`)})`;
    }
  }
  applyModalStyle();

  // The timeline plumbing only: a consumer's own `@keyframes` and
  // `animation-timeline: --drawer` on `Drawer.Backdrop` (or any other
  // descendant of the dialog) is what actually dims it (#249). `x` for
  // `left`/`right`, `y` for `bottom`/`top`: the viewport only ever scrolls
  // along its own axis.
  if (supportsScrollTimeline) {
    viewport.style.setProperty(
      'scroll-timeline',
      `${SCROLL_TIMELINE_NAME} ${horizontal ? 'x' : 'y'}`
    );
    dialog.style.setProperty('timeline-scope', SCROLL_TIMELINE_NAME);
  }

  function setPhase(next: Phase) {
    if (next === phase) return;
    phase = next;
    // Non-modal only: the hit area tracks the scroll position everywhere
    // except the Panel's own CSS entrance and exit (`updateHitArea`'s own
    // comment), both of which land here on every phase change they cause.
    updateHitArea();
    opts.onPhaseChange?.(next);
  }

  /** Reads the Viewport's extent along its own axis and the panel's
   * natural extent along the same axis, and recomputes each snap point's
   * "forward" pixel offset from them, plus the Viewport's own maximum
   * scroll position (`maxScroll`). */
  function measure() {
    const viewportExtent = viewport[axis.client];
    const points = opts.snapPoints;
    snapPx = points
      ? points.map((point) => {
          if (typeof point === 'number') return viewportExtent * point;
          const px = Number.parseFloat(point);
          return Number.isFinite(px) ? px : 0;
        })
      : [
          Math.min(
            panel.getBoundingClientRect()[horizontal ? 'width' : 'height'],
            viewportExtent
          )
        ];
    maxScroll = viewport[axis.extent] - viewportExtent;
    // The hit area's own "fully open" target (#271, #312), and what
    // `top`/`left`'s mirrored math (`scrollForSnap`) measures against.
    viewport.style.setProperty(MAX_SCROLL_VAR, `${maxScroll}px`);
    // The scroll range a native dim's `animation-range` covers (closed to
    // the first snap point), once per layout -- never per frame (#249).
    dialog.style.setProperty('--drawer-first-snap', `${scrollForSnap(0)}px`);
  }

  /** Positions every `[data-drawer-snap]` marker at its snap point's real
   * scroll offset (`scrollForSnap`): index 0 at closed, each configured
   * point after. Closed is not itself a snap target while the drawer is
   * not dismissible, so a drag or fling toward it settles on the nearest
   * open point instead. */
  function positionMarkers() {
    const markers =
      viewport.querySelectorAll<HTMLElement>('[data-drawer-snap]');
    markers.forEach((marker, i) => {
      const target = i === 0 ? scrollForSnap(-1) : scrollForSnap(i - 1);
      marker.style.position = 'absolute';
      marker.style.pointerEvents = 'none';
      marker.style.scrollSnapAlign =
        i === 0 && !opts.dismissible ? 'none' : 'start';
      if (horizontal) {
        marker.style.insetBlockStart = '0';
        marker.style.height = '100%';
        marker.style.width = '0';
        marker.style.left = `${target}px`;
      } else {
        marker.style.insetInlineStart = '0';
        marker.style.width = '100%';
        marker.style.height = '0';
        marker.style.top = `${target}px`;
      }
    });
  }

  let lastProgress: string | undefined;
  function updateProgress() {
    const st = viewport[axis.scroll];
    const closedPos = scrollForSnap(-1);
    const firstOpenPos = scrollForSnap(0);
    const denom = firstOpenPos - closedPos || (reversed ? -1 : 1);
    const progress = clamp((st - closedPos) / denom, 0, 1).toFixed(4);
    // `setProperty` on a custom property, unlike a standard one, does not
    // itself skip the write (and the style/commit work it schedules on the
    // main thread) when the value is unchanged (#267): clamped at 0 or 1,
    // most of a drag's scroll frames recompute the same value (every frame
    // beyond the first snap point, every frame at rest).
    if (progress === lastProgress) return;
    lastProgress = progress;
    dialog.style.setProperty('--drawer-progress', progress);
  }

  /** Locks the content below the top (last configured) snap point: vaul's
   * rule, ruled on in #232 (variant B). Always `overflow-y`: the Content
   * part's own scroll is independent of which edge the drawer itself opens
   * from. */
  function updateContentLock() {
    if (!parts.content) return;
    const target = scrollForSnap(snapPx.length - 1);
    const st = viewport[axis.scroll];
    const atTop = reversed
      ? st <= target + SETTLE_TOLERANCE
      : st >= target - SETTLE_TOLERANCE;
    parts.content.style.overflowY = atTop ? 'auto' : 'hidden';
  }

  /** The snap points a drag or fling may land on, as real scroll offsets:
   * closed (index -1) only while dismissible, then each configured
   * point. */
  function candidates(): SnapCandidate[] {
    const open = snapPx.map((_, index) => ({
      index,
      px: scrollForSnap(index)
    }));
    return opts.dismissible
      ? [{ index: -1, px: scrollForSnap(-1) }, ...open]
      : open;
  }

  function nearest(px: number, from: SnapCandidate[]): SnapCandidate {
    return from.reduce((best, c) =>
      Math.abs(c.px - px) < Math.abs(best.px - px) ? c : best
    );
  }

  function clampIndex(index: number) {
    return clamp(Math.trunc(index) || 0, 0, Math.max(snapPx.length - 1, 0));
  }

  function settleOpenAt(index: number) {
    // A closing scroll this interrupted (the user grabbed it, or it never
    // reached closed): back to normal, snapping, open interaction.
    viewport.style.scrollSnapType = `${horizontal ? 'x' : 'y'} mandatory`;
    if (index !== snapIndex) {
      snapIndex = index;
      opts.onSnapPointChange?.(index);
    }
    setPhase('open');
    updateContentLock();
  }

  function finishClose(reason: OpenChangeReason) {
    // Idempotent: the CSS exit's own path (`settleExit`) and the Panel
    // leaving view (`panelVisibilityObserver`, below) can both reach here
    // for the same close, with `scrollend` closely behind either. Only
    // the first call does anything -- a later one lands on an
    // already-`closed` phase and is a no-op, rather than a second
    // `onOpenChange`.
    if (phase === 'closed') return;
    panelVisibilityObserver.unobserve(panel);
    viewport.style.scrollSnapType = `${horizontal ? 'x' : 'y'} mandatory`;
    // `close()` itself restores focus to whatever had it before `open()`
    // called `showModal()` -- closed first, so a consumer's own focus
    // handling (`onPhaseChange`, below) has the last word, not the
    // dialog's own restoration.
    if (dialog.open) {
      pendingEngineCloses += 1;
      dialog.close();
    }
    setPhase('closed');
    opts.onOpenChange?.(false, reason);
  }

  /** The dialog's own native `close` -- fired by `dialog.close()` just
   * above, and, in both Chromium and WebKit, also by a close this engine
   * never asked for: a second Escape landing close enough behind the
   * first, mid-entrance, that its `cancel` event's own `preventDefault()`
   * does not actually prevent it (#268's second bug). Reconciles the
   * phase to `closed` whenever that happens, so a later `open()` is not
   * reading `dialog.open` already false as still `opening` or `open`.
   * Landing mid-exit, the same way, keeps the reason that exit already
   * carries (`pendingCloseReason`, read before `teardownExit` clears it)
   * instead of reporting 'escape': a close finished this way still keeps
   * the reason it already had (#268's design ruling). */
  function onNativeClose() {
    if (pendingEngineCloses > 0) {
      pendingEngineCloses -= 1;
      return;
    }
    if (phase === 'closed') return;
    cancelEnter();
    const reason = pendingCloseReason ?? 'escape';
    if (cssExiting) teardownExit();
    finishClose(reason);
  }
  dialog.addEventListener('close', onNativeClose);

  /** Forces the style flush that starts the transition `el`'s attribute
   * change (just above the call site) triggers -- the same flush `open()`
   * forces for the entrance's own starting value -- then finishes every
   * resulting *transition* at once, jumping `el` straight to its resting
   * value instead of letting it ease there. Only `CSSTransition`s: `el`
   * (the Backdrop) can also carry a `CSSAnimation` of its own -- the
   * scroll-timeline dim from the "Style the backdrop" recipe -- and
   * finishing that one would detach it from the scroll timeline instead of
   * leaving it to keep following the drag. */
  function finishTransition(el: Element) {
    const style = getComputedStyle(el);
    void style.transform;
    void style.opacity;
    el.getAnimations().forEach((animation) => {
      if (animation instanceof CSSTransition) animation.finish();
    });
  }

  /** Any touch, wheel or pointer down while the Panel's CSS entrance or
   * exit is still in flight ends it at once, landing the drawer wherever
   * that transition was headed -- never canceling it (#268's design
   * ruling). Mid-entrance, that is open (`finishEnter`). Mid-exit, that is
   * closed, now, with the reason the exit already carries
   * (`finishExit`): an interruption never reopens a drawer that was on its
   * way out. The gesture that interrupted it then continues natively from
   * there, same as always. */
  function onInterrupt() {
    if (phase === 'opening') {
      finishEnter();
    } else if (phase === 'closing') {
      finishExit();
    }
  }

  function attachInterruptListeners() {
    if (interruptListenersAttached) return;
    interruptListenersAttached = true;
    viewport.addEventListener('touchstart', onInterrupt, { passive: true });
    viewport.addEventListener('wheel', onInterrupt, { passive: true });
    viewport.addEventListener('pointerdown', onInterrupt);
  }

  function detachInterruptListeners() {
    if (!interruptListenersAttached) return;
    interruptListenersAttached = false;
    viewport.removeEventListener('touchstart', onInterrupt);
    viewport.removeEventListener('wheel', onInterrupt);
    viewport.removeEventListener('pointerdown', onInterrupt);
  }

  /** Cancels a Panel (and Backdrop) entrance still in flight: the
   * `data-starting-style` window and the `transitionend`/timeout wait that
   * follows it (`open`, `settleEnter`, below). Safe to call whether or not
   * one is under way. Only ever stops an entrance -- never an exit, which
   * an interruption finishes instead of cancels (`finishExit`, below). */
  function cancelEnter() {
    if (enterRaf) {
      cancelAnimationFrame(enterRaf);
      enterRaf = 0;
    }
    clearTimeout(enterTimer);
    enterTimer = undefined;
    enterTransitionCleanup?.();
    enterTransitionCleanup = undefined;
    panel.removeAttribute(STARTING_STYLE_ATTR);
    parts.backdrop?.removeAttribute(STARTING_STYLE_ATTR);
    detachInterruptListeners();
  }

  /** Ends the entrance once the Panel's own `transitionend` fires, or, at
   * the latest, once its computed transition duration plus a margin has
   * passed: only then does the entrance stop being interruptible and the
   * phase become `open`, mirroring `settleExit` below. */
  function settleEnter() {
    clearTimeout(enterTimer);
    enterTimer = undefined;
    enterTransitionCleanup?.();
    enterTransitionCleanup = undefined;
    detachInterruptListeners();
    // Re-measures now that the entrance's own transform is gone (#312): the
    // `measure()` call in `open()` ran while the Panel still carried the
    // entrance's starting style (a `translate` recipe, say), which the
    // scrollable-overflow spec folds into the Viewport's `scrollHeight`/
    // `scrollWidth`, so `--drawer-max-scroll` came out inflated. The Panel
    // now rests at its real, untransformed position, so this is the first
    // accurate reading.
    measure();
    // Arms the leave-view close (#296) only now: the entrance has actually
    // settled, so the Panel's own position reflects where it rests open,
    // not wherever a consumer's CSS transform still had it mid-flight.
    panelVisibilityObserver.observe(panel);
    setPhase('open');
    updateContentLock();
  }

  /** Finishes the Panel's (and the Backdrop's) CSS entrance immediately,
   * landing the drawer open at its snap point without waiting for the
   * transition removing `data-starting-style` started: what a touch, a
   * wheel or a pointer down arriving mid-entrance does to it (#268).
   * Escape mid-entrance does not: it starts the exit directly
   * (`beginExit`, below), reversing the entrance's own transition instead
   * of jumping it open first. */
  function finishEnter() {
    cancelEnter();
    finishTransition(panel);
    if (parts.backdrop) finishTransition(parts.backdrop);
    // Re-measures now the jump has landed the Panel at its real position
    // (`settleEnter`'s own comment: #312).
    measure();
    // Arms the leave-view close (#296): see `settleEnter`, above.
    panelVisibilityObserver.observe(panel);
    setPhase('open');
    updateContentLock();
  }

  /** Clears a Panel exit's own timer, listeners and reason without
   * settling it -- `destroy()`'s own job only: an exit in flight never
   * gets this far any other way, since an interruption finishes it
   * (`finishExit`) rather than cancels it (#268's design ruling: an
   * interruption never cancels a close). */
  function teardownExit() {
    cssExiting = false;
    clearTimeout(exitTimer);
    exitTimer = undefined;
    pendingCloseReason = null;
    panel.removeAttribute(ENDING_STYLE_ATTR);
    parts.backdrop?.removeAttribute(ENDING_STYLE_ATTR);
    detachInterruptListeners();
  }

  /** The Panel's (and the Backdrop's) CSS exit, for every programmatic
   * close -- `close()`, Escape, an outside press, `Drawer.Close` -- never
   * a drag or a flick dismissal, which stay native and unchanged. Sets
   * `data-ending-style`, waits for the Panel's own CSS transition to
   * finish (or a timeout at its computed transition duration plus a
   * margin, or not at all where no transition is defined), then closes
   * the dialog. */
  function beginExit(reason: OpenChangeReason) {
    cancelEnter();
    cssExiting = true;
    pendingCloseReason = reason;
    setPhase('closing');
    panel.setAttribute(ENDING_STYLE_ATTR, '');
    parts.backdrop?.setAttribute(ENDING_STYLE_ATTR, '');
    attachInterruptListeners();
    // Forces the flush that starts this exit's own transition -- the same
    // flush `open()` forces for the entrance's -- so `getAnimations()`
    // just below can only return this exit's own CSSTransition, never one
    // still finishing from whatever `onInterrupt` just ended (#268's
    // second bug: WebKit measured that stale `transitionend` landing right
    // after this exit's own `transitionrun`, close enough that the old
    // listener-based wait read it as this exit's own end).
    void getComputedStyle(panel).transform;
    const duration = transitionDurationMs(panel);
    if (duration <= 0) {
      settleExit(reason);
      return;
    }
    // Only a transition this attribute change itself just started:
    // `playState` tells a freshly running one apart from a stale,
    // already-`finished` CSSTransition for the same property that
    // `getAnimations()` can still be listing (a just-interrupted entrance's
    // `finishTransition` calls `Animation.finish()` on exactly that kind).
    const exitTransitions = panel
      .getAnimations()
      .filter(
        (animation): animation is CSSTransition =>
          animation instanceof CSSTransition &&
          animation.playState === 'running'
      );
    exitTransitions.forEach((transition) => {
      transition.finished.then(
        () => {
          if (cssExiting && pendingCloseReason === reason) settleExit(reason);
        },
        () => {
          // Rejects when something else finished or canceled it first --
          // already settled, or about to be, through that path.
        }
      );
    });
    exitTimer = setTimeout(
      () => settleExit(reason),
      duration + TRANSITION_TIMEOUT_MARGIN_MS
    );
  }

  function settleExit(reason: OpenChangeReason) {
    cssExiting = false;
    clearTimeout(exitTimer);
    exitTimer = undefined;
    detachInterruptListeners();
    panel.removeAttribute(ENDING_STYLE_ATTR);
    parts.backdrop?.removeAttribute(ENDING_STYLE_ATTR);
    pendingCloseReason = null;
    finishClose(reason);
  }

  /** Finishes a Panel exit still in flight immediately, closing the
   * dialog now with the reason that exit already carries, instead of
   * waiting for its transition or its timeout: what a touch, a wheel, a
   * pointer down or a fresh `open()` call does when it arrives mid-exit
   * (#268's design ruling -- an interruption never cancels a close). */
  function finishExit() {
    const reason = pendingCloseReason ?? 'programmatic';
    finishTransition(panel);
    if (parts.backdrop) finishTransition(parts.backdrop);
    settleExit(reason);
  }

  // ---------- closing as soon as the Panel leaves view (#296) ----------
  // `scrollend` only fires once the browser's own momentum and snap
  // animation fully finish, so a flick's close used to wait for the whole
  // gesture to settle rather than for the Panel to actually be gone. An
  // IntersectionObserver on the Panel, rooted on the Viewport, reports the
  // moment it has no overlap with the Viewport's own (scrolled) visible
  // area left at all -- compositor-driven, nothing here running per
  // scroll frame, the same approach React Aria's Sheet uses
  // (react-aria.adobe.com/blog/sheet). `settleEnter`/`finishEnter`, above,
  // are the only places that arm it (`observe`): the Panel starts out of
  // view before the entrance, under a consumer's own CSS transform, and
  // this must never read that as a close. `scrollend` (and its debounce
  // fallback, below) stays as the fallback for whatever this misses. Axis-
  // independent: an IntersectionObserver reads overlap, not which edge it
  // is measured from.
  const panelVisibilityObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry || entry.isIntersecting) return;
      // The CSS exit already has its own close path (`beginExit` then
      // `settleExit`): left to that instead, rather than racing it to
      // settle the reason. `finishClose`'s own idempotency is the backstop
      // if this still fires around when that path settles. A mouse drag or
      // throw still owns the scroll position itself (`onScrollEnd`'s own
      // guard, above, for the same reason): the Panel leaving view
      // mid-drag is not the user letting go, and closing here anyway, with
      // `dragging` left true, does not stop the drag's own later
      // `onPointerUp` from running its own settle right on top of it,
      // landing `phase` on a snap point while the dialog this already
      // closed stays closed underneath it (#322). Left alone, the drag's
      // own release (or the throw's own end) still reaches `finishClose`
      // the moment it actually settles at closed.
      if (
        cssExiting ||
        dragging ||
        throwing ||
        (phase !== 'open' && phase !== 'closing')
      ) {
        return;
      }
      const reason = pendingCloseReason ?? 'drag';
      pendingCloseReason = null;
      finishClose(reason);
    },
    { root: viewport }
  );

  function onScrollEnd() {
    if (destroyed) return;
    // A mouse drag drives the native scroll position itself (with
    // scroll-snap off): the browser still eventually fires a `scrollend`
    // for that, but the drag is not over, and `settleOpenAt`/`finishClose`
    // turning snapping back on now, while it rests off every snap point,
    // would fight the drag that owns it until release. The eased throw
    // back to a snap point (`throwTo`) drives it the same way, off every
    // snap point until its last frame: a `scrollend` the browser fires
    // mid-ease (it does, well before the ease is done) would turn snapping
    // back on at that in-between position too, and the resulting re-snap
    // can land on a different point than the one the throw was easing
    // toward -- the flash (#279).
    if (dragging || throwing || cssExiting) return;
    const st = viewport[axis.scroll];
    const closedPos = scrollForSnap(-1);
    const atClosed = Math.abs(st - closedPos) <= SETTLE_TOLERANCE;

    if (
      atClosed &&
      // `closing` already passed its own dismissible check, at whichever
      // call site started it (`close()`, Escape, the outside press): only
      // a spontaneous native settle at closed from `open` needs it checked
      // here.
      (phase === 'closing' || (phase === 'open' && opts.dismissible))
    ) {
      const reason = pendingCloseReason ?? 'drag';
      pendingCloseReason = null;
      finishClose(reason);
      return;
    }

    if (phase === 'open' || phase === 'closing') {
      const landed = nearest(
        st,
        snapPx.map((_, index) => ({ index, px: scrollForSnap(index) }))
      );
      settleOpenAt(landed.index);
    }
  }

  const supportsScrollEnd = 'onscrollend' in window;
  function onScrollEndDebounce() {
    clearTimeout(scrollEndDebounce);
    scrollEndDebounce = setTimeout(onScrollEnd, SCROLLEND_DEBOUNCE_MS);
  }
  if (supportsScrollEnd) {
    viewport.addEventListener('scrollend', onScrollEnd);
  } else {
    viewport.addEventListener('scroll', onScrollEndDebounce);
  }

  let progressFrame = 0;
  function onScroll() {
    if (progressFrame) return;
    progressFrame = requestAnimationFrame(() => {
      progressFrame = 0;
      updateProgress();
      if (phase !== 'opening') updateContentLock();
      // The non-modal hit area's own fallback (`updateHitArea`'s own
      // comment): where the scroll timeline this otherwise rides resolves,
      // it needs no scroll listener at all, same as the dim above.
      updateHitArea();
    });
  }
  // The native dim needs no scroll listener at all: nothing here runs per
  // scroll frame (#249). The content lock still only needs to be right at
  // a settle point (`settleOpenAt`, `open`'s own call once the scroll
  // position is set, `onResize`, `setOptions`), all of which call
  // `updateContentLock` directly, so dropping its live update here costs
  // it nothing -- a drag or fling already has the viewport's whole gesture
  // captured natively, so content's own `overflow-y` cannot take effect
  // until the gesture (and so a settle) ends anyway.
  if (!supportsScrollTimeline) {
    viewport.addEventListener('scroll', onScroll);
  }

  function onCancel(event: Event) {
    // Always handled ourselves, so the native instant close never runs
    // ahead of the Panel's own CSS exit.
    event.preventDefault();
    if (!opts.dismissible) return;
    if (phase === 'opening') {
      // Escape mid-entrance starts the exit directly, the way `close()`
      // already does mid-entrance: `beginExit` calls `cancelEnter` itself,
      // so the CSS transition reverses smoothly from wherever the
      // entrance was, never jumping the Panel open first. A second
      // Escape hard behind the first still finds the exit already
      // running, not the entrance still open to its own native instant
      // close slipping past this handler's `preventDefault()`.
      beginExit('escape');
    } else if (phase === 'open') {
      beginExit('escape');
    }
    // 'closing': already on its way out, with the dialog's native `close`
    // listener (`onNativeClose`, above) catching it even if a second
    // Escape's own `preventDefault()` does not hold. 'closed': nothing to
    // do.
  }
  dialog.addEventListener('cancel', onCancel);

  function onGapClick() {
    // An outside press never closes a non-modal drawer by default (#271),
    // following Base UI's own non-modal example (`disablePointerDismissal`):
    // a real-world click there already reaches the page itself instead
    // (the hit area clips it out of the Viewport entirely, `updateHitArea`)
    // and never reaches the gap at all, but a test (or a consumer)
    // dispatching one straight at it should see the same no-op.
    if (opts.modal === false || !opts.dismissible || phase !== 'open') return;
    beginExit('outside-press');
  }
  gap?.addEventListener('click', onGapClick);

  // ---------- non-modal Escape (#271) ----------
  // A non-modal dialog (opened with `show()`) does not dismiss on Escape,
  // and never fires `cancel`, so this engine reads it itself instead. Read
  // from `document`, not the dialog: the page behind a non-modal drawer can
  // hold focus (that is the point of it), so the dialog's own `cancel`
  // event, which only fires for a key press while focus is inside it, is
  // not enough.
  function onDocumentKeyDown(event: KeyboardEvent) {
    if (opts.modal !== false || event.key !== 'Escape') return;
    if (!opts.dismissible) return;
    if (phase !== 'opening' && phase !== 'open') return;
    event.preventDefault();
    beginExit('escape');
  }
  document.addEventListener('keydown', onDocumentKeyDown);

  function onResize() {
    // `opening` reconciles too: `open()` no longer animates the scroll
    // position (it is already at its snap point, synchronously, before
    // the entrance's own CSS transition on `transform` even starts), so
    // there is nothing left here for a resize mid-entrance to race.
    if (phase === 'closed') return;
    const oldSnapPx = snapPx;
    const oldMaxScroll = maxScroll;
    const st = viewport[axis.scroll];
    measure();
    positionMarkers();
    if (!dialog.open) return;
    // Never resize onto closed: only reposition onto an open point
    // (ADR 0001). Finds the nearest point in the *old* layout's own real
    // scroll offsets (`scrollTargetFor` against the snapshots taken
    // above, not the just-recomputed `snapPx`/`maxScroll`), then scrolls
    // to that same index's new offset.
    const landed = nearest(
      st,
      oldSnapPx.map((_, index) => ({
        index,
        px: scrollTargetFor(index, oldSnapPx, oldMaxScroll)
      }))
    );
    viewport.scrollTo({
      [axis.scrollToKey]: scrollForSnap(landed.index),
      behavior: 'instant'
    });
    updateContentLock();
  }
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  // ---------- mouse drag (#235) ----------
  // A mouse cannot drag a scroll container: it gets its own pointer
  // handler, a projected throw and a 240ms ease, along whichever axis
  // `side` scrolls. Touch, wheel and trackpad stay purely native.
  let dragging = false;
  let dragStartMain = 0;
  let dragStartScroll = 0;
  let dragMaxScroll = 0;
  let dragHistory: { t: number; st: number }[] = [];
  let throwFrame = 0;
  /** Set for `throwTo`'s whole run, including its final, synchronous
   * frame: guards `onScrollEnd` the way `dragging` does, below. */
  let throwing = false;

  function pointerMain(event: PointerEvent): number {
    return horizontal ? event.clientX : event.clientY;
  }

  function onPointerDown(event: PointerEvent) {
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      phase !== 'open'
    ) {
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest('input, button, a, textarea, select')) {
      return;
    }
    event.preventDefault();
    dragging = true;
    dragStartMain = pointerMain(event);
    dragStartScroll = viewport[axis.scroll];
    dragMaxScroll = viewport[axis.extent] - viewport[axis.client];
    dragHistory = [{ t: event.timeStamp, st: dragStartScroll }];
    cancelAnimationFrame(throwFrame);
    throwing = false;
    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      // Not an active pointer (e.g. a synthetic event): the drag still
      // works, it just cannot survive the pointer leaving the panel.
    }
    viewport.style.scrollSnapType = 'none';
    opts.onDragChange?.(true);
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerType !== 'mouse') return;
    const d = pointerMain(event) - dragStartMain;
    // Moving the pointer toward `side`'s own anchor edge (down for
    // `bottom`, up for `top`, right for `right`, left for `left`) always
    // decreases the scroll position: whether that opens or closes the
    // drawer follows from where the snap targets actually sit
    // (`scrollForSnap`), not from anything branched on here.
    viewport[axis.scroll] = clamp(dragStartScroll - d, 0, dragMaxScroll);
    dragHistory.push({ t: event.timeStamp, st: viewport[axis.scroll] });
    while (
      dragHistory.length > 1 &&
      dragHistory[dragHistory.length - 1].t - dragHistory[0].t > DRAG_HISTORY_MS
    ) {
      dragHistory.shift();
    }
  }

  function throwTo(target: number, onDone: () => void) {
    cancelAnimationFrame(throwFrame);
    throwing = true;
    const finish = () => {
      throwing = false;
      onDone();
    };
    const start = viewport[axis.scroll];
    const delta = target - start;
    if (delta === 0 || reducedMotion()) {
      viewport[axis.scroll] = target;
      finish();
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startTime) / THROW_DURATION_MS));
      const eased = 1 - Math.pow(1 - t, 3);
      viewport[axis.scroll] = start + delta * eased;
      if (t < 1) {
        throwFrame = requestAnimationFrame(tick);
      } else {
        viewport[axis.scroll] = target;
        finish();
      }
    };
    throwFrame = requestAnimationFrame(tick);
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging || event.pointerType !== 'mouse') return;
    dragging = false;
    try {
      panel.releasePointerCapture(event.pointerId);
    } catch {
      // Already released, or never captured.
    }
    opts.onDragChange?.(false);

    const first = dragHistory[0];
    const last = dragHistory[dragHistory.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? (last.st - first.st) / dt : 0;
    const projected = viewport[axis.scroll] + velocity * THROW_VELOCITY_SCALE;
    const target = nearest(projected, candidates());
    const closing = target.index === -1;
    if (closing) {
      pendingCloseReason = 'drag';
      setPhase('closing');
    }

    throwTo(target.px, () => {
      // Snapping (back on, or off toward closed) is `finishClose`'s or
      // `settleOpenAt`'s own job now.
      if (closing) finishClose('drag');
      else settleOpenAt(target.index);
    });
  }

  panel.addEventListener('pointerdown', onPointerDown);
  panel.addEventListener('pointermove', onPointerMove);
  panel.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('pointercancel', onPointerUp);

  // ---------- public API ----------

  function open(snapIndexArg = 0) {
    if (destroyed) return;
    const index = clampIndexWithMeasure(snapIndexArg);
    if (phase === 'open' || phase === 'opening') {
      snapTo(index);
      return;
    }
    if (phase === 'closing') {
      // An interruption never cancels a close (#268's design ruling): a
      // fresh `open()` call arriving mid-exit finishes it right now, with
      // the reason that exit already carries, the same way a touch, a
      // wheel or a pointer down would, then falls through to open fresh
      // below -- `finishExit` has already closed the dialog by then, so
      // `showModal()`/`show()` does not throw on one that is still open.
      finishExit();
    }
    // Before `showModal()`/`show()`, and before the layout reads below
    // (`measure`, the scroll-position write): a style recalc that sees
    // this attribute only after the dialog is already open and laid out
    // has nothing left to transition from -- the removal a frame later
    // just lands on the same computed value, and the entrance never
    // moves.
    panel.setAttribute(STARTING_STYLE_ATTR, '');
    parts.backdrop?.setAttribute(STARTING_STYLE_ATTR, '');
    if (opts.modal === false) dialog.show();
    else dialog.showModal();
    dialog.focus({ preventScroll: true });
    // Forces the recalc the attribute above needs to land as a real,
    // committed value -- not folded into whatever recalc `measure` or the
    // scroll-position write below triggers next.
    void getComputedStyle(panel).transform;
    measure();
    positionMarkers();
    // Straight to the snap point, before this task yields to a paint: no
    // scroll animation, so nothing here can race a resize or a drag the
    // way the old scrollTo-driven open did.
    viewport[axis.scroll] = scrollForSnap(index);
    snapIndex = index;
    updateContentLock();
    setPhase('opening');
    attachInterruptListeners();
    // One frame lets the browser actually paint the starting style; only
    // the frame after that removes it, which is what starts a consumer's
    // CSS transition sliding the Panel (and fading the Backdrop) in --
    // nothing here runs per frame after that. The phase stays `opening`,
    // and the interrupt listeners stay attached, until that transition
    // actually ends (`settleEnter`): ending it early, right here, is the
    // bug #268 found -- the Panel still mid-flight, and a gesture arriving
    // in between reading as a no-op instead of an interrupt.
    enterRaf = requestAnimationFrame(() => {
      enterRaf = requestAnimationFrame(() => {
        enterRaf = 0;
        panel.removeAttribute(STARTING_STYLE_ATTR);
        parts.backdrop?.removeAttribute(STARTING_STYLE_ATTR);
        const duration = transitionDurationMs(panel);
        if (duration <= 0) {
          settleEnter();
          return;
        }
        const onEnd = (event: Event) => {
          if ((event as TransitionEvent).target !== panel) return;
          settleEnter();
        };
        panel.addEventListener('transitionend', onEnd);
        enterTransitionCleanup = () =>
          panel.removeEventListener('transitionend', onEnd);
        enterTimer = setTimeout(
          () => settleEnter(),
          duration + TRANSITION_TIMEOUT_MARGIN_MS
        );
      });
    });
  }

  /** `open`'s own index needs `snapPx` measured first, since it is read
   * before the dialog (and so the panel's natural extent) has any layout
   * on the very first call. */
  function clampIndexWithMeasure(index: number) {
    if (snapPx.length === 0) {
      measure();
      positionMarkers();
    }
    return clampIndex(index);
  }

  function close(reason: OpenChangeReason = 'programmatic') {
    if (phase === 'closed' || phase === 'closing') return;
    if (
      !opts.dismissible &&
      reason !== 'close-button' &&
      reason !== 'programmatic'
    ) {
      return;
    }
    beginExit(reason);
  }

  function snapTo(index: number) {
    if (phase !== 'open') return;
    const clamped = clampIndex(index);
    viewport.scrollTo({
      [axis.scrollToKey]: scrollForSnap(clamped),
      behavior: motionBehavior()
    });
  }

  function setOptions(next: Partial<DrawerOptions>) {
    opts = { ...opts, ...next };
    measure();
    positionMarkers();
    updateContentLock();
    applyModalStyle();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    releaseBackdropReset();
    cancelEnter();
    teardownExit();
    panelVisibilityObserver.disconnect();
    clearTimeout(scrollEndDebounce);
    cancelAnimationFrame(throwFrame);
    cancelAnimationFrame(progressFrame);
    viewport.removeEventListener('scrollend', onScrollEnd);
    viewport.removeEventListener('scroll', onScrollEndDebounce);
    viewport.removeEventListener('scroll', onScroll);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('close', onNativeClose);
    document.removeEventListener('keydown', onDocumentKeyDown);
    gap?.removeEventListener('click', onGapClick);
    panel.removeEventListener('pointerdown', onPointerDown);
    panel.removeEventListener('pointermove', onPointerMove);
    panel.removeEventListener('pointerup', onPointerUp);
    panel.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
  }

  measure();
  positionMarkers();

  return {
    open,
    close,
    snapTo,
    setOptions,
    get phase() {
      return phase;
    },
    get snapIndex() {
      return snapIndex;
    },
    destroy
  };
}
