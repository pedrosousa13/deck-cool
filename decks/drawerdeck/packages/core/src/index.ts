/**
 * The framework-neutral drawer engine. A bottom sheet built on native
 * scrolling (ADR 0001): the viewport is a scroll-snap container, closed and
 * every snap point are places it can rest, and the browser drags, flings and
 * settles it the way it already does for a page. `<dialog>` gives the top
 * layer, focus trapping, an inert page and Escape.
 *
 * The caller (`@drawerdeck/react`) owns every DOM node, including the
 * viewport's `[data-drawer-gap]` spacer and `[data-drawer-snap]` markers:
 * this engine only reads them, positions the markers and sets the
 * structural styles the mechanics need. Ported from the throwaway
 * prototype's variant B (`decks/sheetdeck-prototype/index.html`,
 * `prototype/sheetdeck`), ruled on in #232: the inner content stays locked
 * until the drawer reaches its top snap point.
 */

/** A snap point: a fraction of the viewport's height the panel shows (0 to
 * 1), or a fixed height such as `'320px'`. */
export type SnapPoint = number | `${number}px`;

export type Phase = 'closed' | 'opening' | 'open' | 'closing';

export type OpenChangeReason =
  | 'trigger'
  | 'drag'
  | 'escape'
  | 'outside-press'
  | 'close-button'
  | 'programmatic';

export interface DrawerParts {
  dialog: HTMLDialogElement;
  /** The native scroll-snap container: contains a `[data-drawer-gap]`
   * spacer, one `[data-drawer-snap]` marker per snap point plus one for
   * closed, and the panel, in that order. */
  viewport: HTMLElement;
  panel: HTMLElement;
  /** The inner scroller, locked (no `overflow-y: auto` of its own) below
   * the top snap point. */
  content?: HTMLElement | null;
  backdrop?: HTMLElement | null;
}

export interface DrawerOptions {
  /** Fractions of the viewport height, or fixed heights, the panel can
   * rest open at, nearest first. Without it, the drawer has one open
   * point: the panel's own content height, capped by its own CSS
   * `max-height`. */
  snapPoints?: readonly SnapPoint[];
  /** Whether Escape, an outside press and a drag to closed can close the
   * drawer. `close()` and a close button still can. Defaults to true. */
  dismissible?: boolean;
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
/** Shared by every eased, programmatic `scrollTop` move: the mouse throw's
 * release, `open`, `close`/Escape/the outside press/`Drawer.Close`, and
 * `snapTo` (#268). */
const EASE_DURATION_MS = 240;
const THROW_VELOCITY_SCALE = 200;
/** How close a scroll position must land to a snap point's to count as
 * resting there. */
const SETTLE_TOLERANCE = 4;
const SCROLLEND_DEBOUNCE_MS = 120;
/** A scroll into the opening position that never ends (e.g. `scrollend`
 * never fires) still reaches `open` after this long. */
const OPEN_SAFETY_MS = 1000;

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

/** The reset rule's sheet, once constructed, kept alive while any drawer is
 * mounted (ref-counted by `mountedDrawers`, below) and dropped from
 * `document.adoptedStyleSheets` when the last one is destroyed. A
 * constructed sheet, not a `<style>` element: `style-src` governs an
 * injected tag, but not `CSSStyleSheet.replaceSync` (#252). */
let resetSheet: CSSStyleSheet | undefined;
let mountedDrawers = 0;

function ensureBackdropReset() {
  mountedDrawers += 1;
  if (resetSheet) return;
  resetSheet = new CSSStyleSheet();
  resetSheet.replaceSync(`.${RESET_CLASS}::backdrop{background:transparent}`);
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

// ---------- the family curve (GLOSSARY, Motion; #268) ----------
// `cubic-bezier(.32,.72,0,1)` drives every eased, programmatic scrollTop
// move (open, close, snapTo and the mouse throw): the same curve
// `packages/brand/styles/brand.css`'s `--ease` ships, resolved the way CSS
// itself does, since a `<dialog>`'s scroll position has no CSS transition
// to drive it natively.
const EASE_X1 = 0.32;
const EASE_Y1 = 0.72;
const EASE_X2 = 0;
const EASE_Y2 = 1;

/** The polynomial coefficients for a cubic bezier's X or Y component, given
 * its two control points (the curve's start and end are fixed at (0,0) and
 * (1,1)): `f(t) = ((a*t + b)*t + c)*t`. */
function bezierCoefficients(p1: number, p2: number) {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  const a = 1 - c - b;
  return { a, b, c };
}

const EASE_X = bezierCoefficients(EASE_X1, EASE_X2);
const EASE_Y = bezierCoefficients(EASE_Y1, EASE_Y2);

function sampleCurve(
  t: number,
  { a, b, c }: { a: number; b: number; c: number }
) {
  return ((a * t + b) * t + c) * t;
}

function sampleCurveDerivative(t: number, { a, b }: { a: number; b: number }) {
  return (3 * a * t + 2 * b) * t + EASE_X.c;
}

/** Solves `cubic-bezier(.32,.72,0,1)` for the output at elapsed-time
 * fraction `x` (0 to 1): Newton-Raphson for the parameter `t` whose curve
 * X matches `x`, then reads curve Y at that `t`, the way a browser resolves
 * the same curve for a CSS transition. */
function familyEase(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const dx = sampleCurve(t, EASE_X) - x;
    if (Math.abs(dx) < 1e-5) break;
    const derivative = sampleCurveDerivative(t, EASE_X);
    if (Math.abs(derivative) < 1e-6) break;
    t -= dx / derivative;
  }
  return sampleCurve(t, EASE_Y);
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
  let opts: DrawerOptions = { dismissible: true, ...options };
  let phase: Phase = 'closed';
  let snapIndex = 0;
  /** The configured snap points' pixel offsets, nearest first; excludes
   * closed (always 0). */
  let snapPx: number[] = [];
  let pendingCloseReason: OpenChangeReason | null = null;
  let openSafetyTimer: ReturnType<typeof setTimeout> | undefined;
  let scrollEndDebounce: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

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
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    willChange: 'scroll-position'
  });
  if (parts.backdrop) {
    Object.assign(parts.backdrop.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none'
    });
  }
  if (gap) gap.style.height = '100%';

  // The timeline plumbing only: a consumer's own `@keyframes` and
  // `animation-timeline: --drawer` on `Drawer.Backdrop` (or any other
  // descendant of the dialog) is what actually dims it (#249). `y`: the
  // viewport only ever scrolls vertically.
  if (supportsScrollTimeline) {
    viewport.style.setProperty('scroll-timeline', `${SCROLL_TIMELINE_NAME} y`);
    dialog.style.setProperty('timeline-scope', SCROLL_TIMELINE_NAME);
  }

  function setPhase(next: Phase) {
    if (next === phase) return;
    phase = next;
    opts.onPhaseChange?.(next);
  }

  /** Reads the viewport's height and the panel's natural height, and
   * recomputes each snap point's pixel offset from them. */
  function measure() {
    const viewportHeight = viewport.clientHeight;
    const points = opts.snapPoints;
    snapPx = points
      ? points.map((point) => {
          if (typeof point === 'number') return viewportHeight * point;
          const px = Number.parseFloat(point);
          return Number.isFinite(px) ? px : 0;
        })
      : [Math.min(panel.getBoundingClientRect().height, viewportHeight)];
    // The scroll range a native dim's `animation-range` covers (closed to
    // the first snap point), once per layout -- never per frame (#249).
    dialog.style.setProperty('--drawer-first-snap', `${snapPx[0] ?? 0}px`);
  }

  /** Positions every `[data-drawer-snap]` marker at its snap point's
   * offset: index 0 at 0 (closed), each configured point after. Closed is
   * not itself a snap target while the drawer is not dismissible, so a
   * drag or fling toward it settles on the nearest open point instead. */
  function positionMarkers() {
    const markers =
      viewport.querySelectorAll<HTMLElement>('[data-drawer-snap]');
    markers.forEach((marker, i) => {
      const px = i === 0 ? 0 : (snapPx[i - 1] ?? 0);
      Object.assign(marker.style, {
        position: 'absolute',
        insetInlineStart: '0',
        width: '100%',
        height: '0',
        pointerEvents: 'none',
        scrollSnapAlign: i === 0 && !opts.dismissible ? 'none' : 'start',
        top: `${px}px`
      });
    });
  }

  let lastProgress: string | undefined;
  function updateProgress() {
    const first = snapPx[0] || 1;
    const progress = clamp(viewport.scrollTop / first, 0, 1).toFixed(4);
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
   * rule, ruled on in #232 (variant B). */
  function updateContentLock() {
    if (!parts.content) return;
    const top = snapPx[snapPx.length - 1] ?? 0;
    const atTop = viewport.scrollTop >= top - SETTLE_TOLERANCE;
    parts.content.style.overflowY = atTop ? 'auto' : 'hidden';
  }

  /** The snap points a drag or fling may land on: closed (index -1) only
   * while dismissible, then each configured point. */
  function candidates(): SnapCandidate[] {
    const open = snapPx.map((px, index) => ({ index, px }));
    return opts.dismissible ? [{ index: -1, px: 0 }, ...open] : open;
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
    // reached 0): back to normal, snapping, open interaction.
    viewport.style.scrollSnapType = 'y mandatory';
    if (index !== snapIndex) {
      snapIndex = index;
      opts.onSnapPointChange?.(index);
    }
    setPhase('open');
    updateContentLock();
  }

  function finishClose(reason: OpenChangeReason) {
    clearTimeout(openSafetyTimer);
    viewport.style.scrollSnapType = 'y mandatory';
    // `close()` itself restores focus to whatever had it before `open()`
    // called `showModal()` -- closed first, so a consumer's own focus
    // handling (`onPhaseChange`, below) has the last word, not the
    // dialog's own restoration.
    if (dialog.open) dialog.close();
    setPhase('closed');
    opts.onOpenChange?.(false, reason);
  }

  function beginClosingScroll(reason: OpenChangeReason) {
    pendingCloseReason = reason;
    setPhase('closing');
    // Not dismissible, the closed marker is not a snap target (see
    // `positionMarkers`): mandatory snapping would otherwise fight this
    // scroll, pulling it straight back to the nearest open point. This is
    // always a deliberate close (every call site already checked
    // `dismissible` for the reasons that need it), so snapping stays off
    // for its whole scroll, however it ends.
    viewport.style.scrollSnapType = 'none';
    animateScrollTo(0, () => finishClose(reason));
  }

  function onScrollEnd() {
    if (destroyed) return;
    // A mouse drag drives the native scrollTop itself (with scroll-snap
    // off): the browser still eventually fires a `scrollend` for that, but
    // the drag is not over, and `settleOpenAt`/`finishClose` turning
    // snapping back on now, while it rests off every snap point, would
    // fight the drag that owns it until release. The eased, programmatic
    // move (`animateScrollTo`: the mouse throw's release, `open`, `close`
    // and `snapTo`, #268) drives `scrollTop` the same way, off every snap
    // point until its last frame: a `scrollend` the browser fires mid-ease
    // (it does, well before the ease is done) would turn snapping back on
    // at that in-between position too, and the resulting re-snap can land
    // on a different point than the one the move was easing toward -- the
    // flash (#279).
    if (dragging || animating) return;
    const st = viewport.scrollTop;

    if (
      st <= SETTLE_TOLERANCE &&
      // `closing` already passed its own dismissible check, at whichever
      // call site started it (`close()`, Escape, the outside press): only
      // a spontaneous native settle at 0 from `open` needs it checked here.
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
        snapPx.map((px, index) => ({ index, px }))
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
    });
  }
  // The native dim needs no scroll listener at all: nothing here runs per
  // scroll frame (#249). The content lock still only needs to be right at
  // a settle point (`settleOpenAt`, `finishOpen`, `onResize`, `setOptions`),
  // all of which call `updateContentLock`
  // directly, so dropping its live update here costs it nothing -- a drag
  // or fling already has the viewport's whole gesture captured natively,
  // so content's own `overflow-y` cannot take effect until the gesture
  // (and so a settle) ends anyway.
  if (!supportsScrollTimeline) {
    viewport.addEventListener('scroll', onScroll);
  }

  function onCancel(event: Event) {
    // Always handled ourselves, so the native instant close never runs
    // ahead of the closing scroll.
    event.preventDefault();
    if (!opts.dismissible || phase !== 'open') return;
    beginClosingScroll('escape');
  }
  dialog.addEventListener('cancel', onCancel);

  function onGapClick() {
    if (!opts.dismissible || phase !== 'open') return;
    beginClosingScroll('outside-press');
  }
  gap?.addEventListener('click', onGapClick);

  function onResize() {
    if (phase === 'opening' || phase === 'closed') return;
    const oldSnapPx = snapPx;
    const st = viewport.scrollTop;
    measure();
    positionMarkers();
    if (!dialog.open) return;
    // Never resize onto closed: only reposition onto an open point
    // (ADR 0001).
    const landed = nearest(
      st,
      oldSnapPx.map((px, index) => ({ index, px }))
    );
    viewport.scrollTo({ top: snapPx[landed.index] ?? 0, behavior: 'instant' });
    updateContentLock();
  }
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  // ---------- mouse drag (#235) ----------
  // A mouse cannot drag a scroll container: it gets its own pointer
  // handler, a projected throw and a 240ms ease. Touch, wheel and
  // trackpad stay purely native.
  let dragging = false;
  let dragStartY = 0;
  let dragStartTop = 0;
  let dragMaxTop = 0;
  let dragHistory: { t: number; st: number }[] = [];
  let animFrame = 0;
  /** Set for `animateScrollTo`'s whole run, including its final,
   * synchronous frame: guards `onScrollEnd` the way `dragging` does,
   * below. */
  let animating = false;

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
    dragging = true;
    dragStartY = event.clientY;
    dragStartTop = viewport.scrollTop;
    dragMaxTop = viewport.scrollHeight - viewport.clientHeight;
    dragHistory = [{ t: event.timeStamp, st: dragStartTop }];
    cancelAnimationFrame(animFrame);
    animating = false;
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
    const dy = event.clientY - dragStartY;
    viewport.scrollTop = clamp(dragStartTop - dy, 0, dragMaxTop);
    dragHistory.push({ t: event.timeStamp, st: viewport.scrollTop });
    while (
      dragHistory.length > 1 &&
      dragHistory[dragHistory.length - 1].t - dragHistory[0].t > DRAG_HISTORY_MS
    ) {
      dragHistory.shift();
    }
  }

  /** Animates `scrollTop` to `target` on the family curve (#268): every
   * programmatic move shares this, not just the mouse throw's release.
   * Instant, in one synchronous frame, under `prefers-reduced-motion`. */
  function animateScrollTo(target: number, onDone: () => void) {
    cancelAnimationFrame(animFrame);
    animating = true;
    const finish = () => {
      animating = false;
      onDone();
    };
    const start = viewport.scrollTop;
    const delta = target - start;
    if (delta === 0 || reducedMotion()) {
      viewport.scrollTop = target;
      finish();
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startTime) / EASE_DURATION_MS));
      viewport.scrollTop = start + delta * familyEase(t);
      if (t < 1) {
        animFrame = requestAnimationFrame(tick);
      } else {
        viewport.scrollTop = target;
        finish();
      }
    };
    animFrame = requestAnimationFrame(tick);
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
    const projected = viewport.scrollTop + velocity * THROW_VELOCITY_SCALE;
    const target = nearest(projected, candidates());
    const closing = target.index === -1;
    if (closing) {
      pendingCloseReason = 'drag';
      setPhase('closing');
    }

    animateScrollTo(target.px, () => {
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
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    measure();
    positionMarkers();
    setPhase('opening');
    viewport.scrollTop = 0;
    // Native smooth scrolling and mandatory snap both want to drive this
    // same scroll together, which is where the rest of the native open's
    // time went (#244): the engine's own ease owns it alone instead, the
    // way it already does a mouse throw's release (#268).
    viewport.style.scrollSnapType = 'none';
    // Stored in `animFrame`, the same id `animateScrollTo`, `destroy()` and
    // a mouse `pointerdown` already cancel: unguarded, this queued frame
    // used to fire after a `close()` or `destroy()` that happened before it
    // ran, restarting the opening ease underneath them.
    animFrame = requestAnimationFrame(() => {
      if (destroyed || phase !== 'opening') return;
      animateScrollTo(snapPx[index] ?? 0, () => finishOpen(index));
    });
    clearTimeout(openSafetyTimer);
    openSafetyTimer = setTimeout(() => {
      if (phase !== 'opening') return;
      cancelAnimationFrame(animFrame);
      animating = false;
      finishOpen(index);
    }, OPEN_SAFETY_MS);
  }

  /** Settles `open`'s eased move: reconciles a resize that landed mid-open
   * (ignored until now, ADR 0001), restores mandatory snapping, and moves
   * the phase to `'open'`. Shared by the eased move's own completion and
   * `OPEN_SAFETY_MS`'s fallback. */
  function finishOpen(index: number) {
    clearTimeout(openSafetyTimer);
    measure();
    positionMarkers();
    const target = snapPx[index] ?? 0;
    if (Math.abs(viewport.scrollTop - target) > SETTLE_TOLERANCE) {
      viewport.scrollTop = target;
    }
    viewport.style.scrollSnapType = 'y mandatory';
    snapIndex = index;
    setPhase('open');
    updateContentLock();
  }

  /** `open`'s own index needs `snapPx` measured first, since it is read
   * before the dialog (and so the panel's natural height) has any layout
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
    clearTimeout(openSafetyTimer);
    beginClosingScroll(reason);
  }

  function snapTo(index: number) {
    if (phase !== 'open') return;
    const clamped = clampIndex(index);
    viewport.style.scrollSnapType = 'none';
    animateScrollTo(snapPx[clamped] ?? 0, () => settleOpenAt(clamped));
  }

  function setOptions(next: Partial<DrawerOptions>) {
    opts = { ...opts, ...next };
    measure();
    positionMarkers();
    updateContentLock();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    releaseBackdropReset();
    clearTimeout(openSafetyTimer);
    clearTimeout(scrollEndDebounce);
    cancelAnimationFrame(animFrame);
    cancelAnimationFrame(progressFrame);
    viewport.removeEventListener('scrollend', onScrollEnd);
    viewport.removeEventListener('scroll', onScrollEndDebounce);
    viewport.removeEventListener('scroll', onScroll);
    dialog.removeEventListener('cancel', onCancel);
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
