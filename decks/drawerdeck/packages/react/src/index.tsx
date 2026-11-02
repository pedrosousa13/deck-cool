'use client';

import {
  cloneElement,
  createContext,
  createElement,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject
} from 'react';
import {
  createDrawer,
  type Drawer,
  type OpenChangeReason,
  type Phase,
  type Side,
  type SnapPoint
} from '@drawerdeck/core';

export type { OpenChangeReason, Phase, Side, SnapPoint };

// Left in the build for the consumer's bundler to replace, as
// `@drawerdeck/react-18`'s own shim (`react.ts`) already does: this package
// has no bundler of its own (`tsc -b` only), so `process.env.NODE_ENV` ships
// as source, not a literal.
declare const process: { env: { NODE_ENV?: string } };

/**
 * Nesting (#272): a `Drawer.Root` finds the nearest enclosing one, if any,
 * through context (`Root`'s own `parentCtx`, below) -- never a `parent`
 * prop and never a DOM walk, since the relationship is already there in
 * the component tree, and a DOM walk would miss a `Drawer.Popup` a
 * consumer portals elsewhere (the "React portal" test in
 * `test/nested.test.tsx` exists to prove that still works). Base UI's own
 * `Drawer` does the same thing, through its own `DrawerRootContext`
 * (`useDrawerRootContext(true)`, read optionally) and a `notifyParent*`
 * family of callbacks a nested root is handed; this follows the same
 * shape, with the smaller surface drawerdeck's own CSS-only recipe needs:
 * a depth count, a live open progress, and a close.
 *
 * `@drawerdeck/core` is handed the *result*, not the relationship: a
 * plain `nestedCount` number through `setOptions`, the same way
 * `snapPoints`/`dismissible`/`modal` already go in. The engine renders it
 * (`data-nested-open`, `--drawer-nested`) and, for a non-modal drawer only,
 * reads it to yield Escape to whatever modal drawer is nested above it --
 * a modal drawer needs no such check, for Escape or an outside press,
 * since the browser's own top layer and inertness already keep both off a
 * drawer that is not topmost. This file is the one that works out what
 * that number is, and sequences the cascade when an outer drawer closes
 * while an inner one is still open (`closeAndWait`, in `Root`, below).
 *
 * The same depth count's own timing (#332's own follow-up to #272, a
 * maintainer's real-iPhone report on the "Nested drawers" guide's demo):
 * `contributesNesting` (`Root`, below) counts a nested Root as "there"
 * while it is genuinely open or opening, never while it is closing, so
 * the drawer behind it updates together with the moment the close
 * starts, not once it finishes -- a button, Escape, a drag release, a
 * flick or a parent's own cascade, any of them. `nestedCount`'s own
 * registration is split into two effects, one for mount/unmount and one
 * for the value, so a value update never reports "gone" and then "here
 * again" in the same React commit the way one effect with an
 * unconditional cleanup did (#332's own "no churn" ruling).
 *
 * The same depth count's own progress, continuously, while a drawer is
 * dragged or swiped, not only at the handful of moments it starts or
 * finishes opening or closing (also #332's own follow-up): each nested
 * Root generates its own scroll-timeline name (from its own `useId()`)
 * and registers it, while `contributesNesting`, with whichever Root
 * `parentCtx` belongs to (`notifyNestedProgressSource`); that Root hands
 * it to `@drawerdeck/core` as `nestedProgressSource`, which lifts the
 * named timeline up to its own dialog with `timeline-scope` and reads it
 * on its own Panel with no JS per frame, wherever the browser supports
 * one. Where it does not (Firefox), the nested Root's own engine instead
 * calls back (`onProgressChange`) on a real scroll frame, forwarded here
 * (`reportNestedProgressValue`) straight to the parent's own engine,
 * bypassing this file's own state entirely so a scroll frame in that
 * fallback does not re-render the parent Root for each one.
 *
 * Nesting only supports a modal inner drawer (#237, the maintainer's
 * ruling on #272 after review): a non-modal `<dialog>` is not in the top
 * layer, so nested it inherits whichever transform or stacking context the
 * Panel behind it sets up, and its own close cannot cascade the way a
 * modal inner's does. A non-modal drawer may still be the *outermost*
 * level, with modal drawers nested inside it. `Root`, below, warns once in
 * development when a non-modal drawer opens nested inside another.
 */

/**
 * A part's `render` prop (Base UI's and vaul's convention, carried over for
 * drawerdeck's own primitives): a `ReactElement` to clone the part's own
 * props onto, or a function given them to build one. Without it, the part
 * renders its own default tag.
 */
export type RenderProp =
  ReactElement | ((props: Record<string, unknown>) => ReactElement);

function setRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) (ref as RefObject<T | null>).current = node;
}

/** Combines refs so a part's own (the engine's) and the consumer's, or a
 * `render` element's own, all see the same node. */
function useComposedRefs<T>(
  ...refs: (Ref<T> | undefined)[]
): Ref<T> | undefined {
  const live = refs.filter((ref): ref is Ref<T> => ref != null);
  if (live.length <= 1) return live[0];
  return (node: T | null) => {
    for (const ref of live) setRef(ref, node);
  };
}

/** `className` concatenates, `style` and the data/aria attributes merge,
 * and an event handler (`onX`) calls both; every other key in `b` wins. */
function mergeProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const key of Object.keys(a)) {
    const av = a[key];
    const bv = b[key];
    if (av === undefined || bv === undefined) continue;
    if (key === 'className') {
      merged.className = `${av} ${bv}`;
    } else if (key === 'style') {
      merged.style = { ...(av as object), ...(bv as object) };
    } else if (
      key.startsWith('on') &&
      typeof av === 'function' &&
      typeof bv === 'function'
    ) {
      merged[key] = (...args: unknown[]) => {
        (av as (...a: unknown[]) => void)(...args);
        (bv as (...a: unknown[]) => void)(...args);
      };
    }
  }
  return merged;
}

/** Renders one primitive as `tag`, or onto `render`: a function gets this
 * part's own computed props (including its `ref`) to build an element with;
 * a `ReactElement` is cloned, merging its own props and composing its own
 * `ref` with the part's. */
function useRenderPart(
  tag: string,
  render: RenderProp | undefined,
  { ref, ...props }: Record<string, unknown> & { ref?: Ref<unknown> }
): ReactElement {
  const elementProps =
    render !== undefined && typeof render !== 'function'
      ? (render.props as Record<string, unknown> & { ref?: Ref<unknown> })
      : undefined;
  // Called unconditionally, whichever branch below uses it (or not): a
  // hook cannot be called from inside an `if`.
  const composed = useComposedRefs(ref, elementProps?.ref);
  if (render === undefined)
    return createElement(tag, { ...props, ref: composed });
  if (typeof render === 'function') return render({ ...props, ref: composed });
  return cloneElement(render as ReactElement<Record<string, unknown>>, {
    // `ref` from `elementProps` is merged in too, harmlessly: the explicit
    // `ref` below, last, always wins.
    ...mergeProps(props, elementProps!),
    ref: composed
  });
}

interface DrawerState {
  phase: Phase;
  snapIndex: number;
  dragging: boolean;
}

interface DrawerContextValue extends DrawerState {
  open: boolean;
  dismissible: boolean;
  /** Which edge the drawer opens from: read once, like the DOM nodes
   * themselves (`Side`'s own comment in `@drawerdeck/core`), never
   * reactive. */
  side: Side;
  /** How many `[data-drawer-snap]` markers `Viewport` renders: one per
   * configured snap point, plus one for closed. */
  snapCount: number;
  titleId: string;
  descriptionId: string;
  dialogRef: RefObject<HTMLDialogElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  backdropRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
  requestOpen(reason: OpenChangeReason): void;
  requestClose(reason: OpenChangeReason): void;
  requestSnap(index: number): void;
  /** Nesting (#272), for a `Drawer.Root` that finds this one through
   * context as its nearest enclosing drawer -- never called by a part, and
   * never read back by this Root's own rendering: `childId` is that
   * nested Root's own `useId()`, `contribution` is 0 while it is closed,
   * else 1 plus however many drawers are nested inside *it*. This Root
   * aggregates every registered child's contribution (the largest, since
   * only one chain is ever actually open in practice) into its own
   * `nestedCount`, fed to `@drawerdeck/core` through `setOptions` the same
   * way `snapPoints`/`dismissible`/`modal` already are. */
  notifyNestedChange(childId: string, contribution: number): void;
  /** The same nested Root's own close, so that if *this* Root closes while
   * it is still open, it closes first: `null` while it is closed, unused
   * either way. Resolves once that Root (and whatever is nested inside
   * it, recursively) has fully closed. */
  registerNestedClose(
    childId: string,
    closeFn: (() => Promise<void>) | null
  ): void;
  /** The same nested Root's own live open progress (#332's own follow-up
   * to #272), the native half: `source` is that Root's own generated
   * scroll-timeline name and `side`, while it is genuinely open or
   * opening (the same moment it starts counting toward `nestedCount`
   * above -- see `Root`'s own `contributesNesting`), or `null` once it
   * is not. This Root picks one registered source (there is normally
   * only ever one) and feeds it to `@drawerdeck/core` as
   * `nestedProgressSource`, through the same reactive `setOptions` effect
   * `nestedCount` already goes through. */
  notifyNestedProgressSource(
    childId: string,
    source: NestedProgressSource | null
  ): void;
  /** The same nested Root's own live open progress, the fallback half
   * (#249's own split): a plain number, pushed directly to
   * `@drawerdeck/core` through `setOptions` the moment it arrives --
   * never through this Root's own state, so a scroll frame in an
   * unsupported browser (Firefox) does not re-render this Root for every
   * one. Only while that child is the one currently registered through
   * `notifyNestedProgressSource`; ignored otherwise. */
  reportNestedProgressValue(childId: string, value: number): void;
}

/** One nested Root's own live open progress, the native half
 * (#332's own follow-up to #272): `timelineName` and `side` identify the
 * named scroll timeline to read from (`@drawerdeck/core`'s own
 * `nestedProgressSource` doc), and `rangePercent`, straight from that
 * Root's own `onProgressRangeChange`, is where its own resting open
 * position lands along that timeline's raw 0%-to-100% range -- what
 * scopes the parent's own `animation-range` to the child's own actual
 * open position, not wherever its raw scroll timeline happens to end. */
interface NestedProgressSource {
  timelineName: string;
  side: Side;
  rangePercent: number;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(part: string): DrawerContextValue {
  const ctx = use(DrawerContext);
  if (!ctx) throw new Error(`Drawer.${part} must be inside Drawer.Root`);
  return ctx;
}

/** The state every part carries as `data-*`, per #234's beta API. */
function dataAttrs(ctx: DrawerContextValue) {
  return {
    'data-open': ctx.open ? '' : undefined,
    'data-phase': ctx.phase,
    'data-snap-index': ctx.snapIndex,
    'data-dragging': ctx.dragging ? '' : undefined
  };
}

interface OpenControlledProps {
  open: boolean;
  defaultOpen?: never;
}
interface OpenUncontrolledProps {
  open?: never;
  defaultOpen?: boolean;
}
interface SnapControlledProps {
  snapPoint: number;
  defaultSnapPoint?: never;
}
interface SnapUncontrolledProps {
  snapPoint?: never;
  defaultSnapPoint?: number;
}

export type RootProps = (OpenControlledProps | OpenUncontrolledProps) &
  (SnapControlledProps | SnapUncontrolledProps) & {
    children?: ReactNode;
    /** Which edge the drawer opens from. Defaults to `'bottom'`. Read once,
     * on mount, like the DOM nodes themselves: changing it later recreates
     * nothing on its own, since it decides the DOM order `Drawer.Viewport`
     * itself renders (`'top'`/`'left'` reverse it to `[Panel][gap]`; see
     * the "Open from a side" guide). */
    side?: Side;
    /** Fractions of the Viewport's extent along the side's axis (height for
     * `bottom`/`top`, width for `left`/`right`), or fixed lengths (e.g.
     * `'320px'`), the drawer can rest open at, nearest first. Without it,
     * the drawer has one open point: the panel's own content extent,
     * capped by its own CSS `max-height`/`max-width`. */
    snapPoints?: readonly SnapPoint[];
    /** Whether Escape, an outside press and a drag to closed can close the
     * drawer. `Drawer.Close` always can. Defaults to true. An outside
     * press never closes a non-modal drawer (`modal={false}`), regardless
     * of this option, following Base UI's own non-modal example
     * (`modal={false}` with `disablePointerDismissal`). */
    dismissible?: boolean;
    /** Whether `Drawer.Popup` opens as a modal dialog (the top layer, a
     * focus trap, an inert page, and Escape for free) or a non-modal one:
     * the page behind stays interactive, nothing is trapped, and the
     * Backdrop is optional. Escape and focus-on-close still behave the
     * same either way. Defaults to true. */
    modal?: boolean;
    onOpenChange?(open: boolean, info: { reason: OpenChangeReason }): void;
    onSnapPointChange?(index: number): void;
  };

/** One drawer: a `<dialog>`, labelled by `Drawer.Title` and described by
 * `Drawer.Description`, holding the scroll-snap viewport the engine (in
 * `@drawerdeck/core`) drives. */
export function Root({
  open,
  defaultOpen,
  onOpenChange,
  snapPoint,
  defaultSnapPoint,
  onSnapPointChange,
  snapPoints,
  dismissible = true,
  modal = true,
  side = 'bottom',
  children
}: RootProps) {
  const [initialOpen] = useState(() => open ?? defaultOpen ?? false);
  // Locked at mount, like `initialOpen`: `Viewport`'s own DOM order
  // (`[gap][Panel]` or `[Panel][gap]`) and the engine's internal axis math
  // both read this once, so a `side` prop that changes later would
  // otherwise desync the two -- the DOM order a later render produces from
  // a live `side` would no longer match what the already-created engine
  // was built for.
  const [initialSide] = useState(() => side ?? 'bottom');
  const initialSnapIndex = snapPoint ?? defaultSnapPoint ?? 0;
  const initialSnapIndexRef = useRef(initialSnapIndex);
  const [state, setState] = useState<DrawerState>({
    phase: 'closed',
    snapIndex: initialSnapIndex,
    dragging: false
  });

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<Drawer | null>(null);
  // Read by `closeAndWait`, below, ahead of its own declaration further
  // down with the rest of this Root's ref-synced props: a controlled
  // `open` that goes back to `true` mid-cascade is what it bails out for.
  const openRef = useRef(open);

  // ---------- nesting (#272) ----------
  // Found through context, not a prop and not a DOM walk: `null` when this
  // Root is not nested inside another one at all. A stable identity
  // (`useId`) names this Root to whichever Root `parentCtx` belongs to, so
  // its own `notifyNestedChange`/`registerNestedClose` can tell this
  // Root's own contribution apart from a sibling's.
  const parentCtx = use(DrawerContext);
  const childId = useId();
  // This Root's own exposed scroll-timeline name (#332's own follow-up to
  // #272), for whichever Root registers it as `nestedProgressSource`:
  // generated from `childId` (stable for this Root's whole lifetime, like
  // `childId` itself), not a module-level counter, so `@drawerdeck/core`
  // stays the one place that knows nothing about nesting at all --
  // `@drawerdeck/react` is already the one handing it a plain `nestedCount`
  // number, and this is just one more thing it generates and hands over,
  // never asked of the engine itself. A custom ident needs no particular
  // characters `useId()` happens to produce (React's own `:r0:`-shaped
  // ids, colons included, are not themselves valid there), so every
  // character outside the safe set is replaced, not escaped: simpler, and
  // nothing here needs the original id back out of it.
  const timelineName = `--drawer-nested-${childId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  // Resolved by `onPhaseChange`, below, the moment this Root's own phase
  // actually reaches 'closed': what `closeAndWait` awaits, so a drawer
  // nested above this one (or `Drawer.Close`, or a controlled `open` going
  // false) can tell the close is really finished, not just requested.
  const closeWaitersRef = useRef<(() => void)[]>([]);
  // This Root's own nested children (zero, one, or in the unusual case of
  // two open at once, more), keyed the same way: each one's contribution
  // (`notifyNestedChange`) and its own close-and-wait (`registerNestedClose`),
  // read by `nestedCount` and `closeAndWait`, below.
  const nestedContributionsRef = useRef<Map<string, number>>(new Map());
  const nestedClosersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const [nestedCount, setNestedCount] = useState(0);
  // The same registered children's own live open progress (#332's own
  // follow-up to #272): `nestedProgressSourcesRef` is the native half
  // (each one's generated timeline name and side), read by
  // `notifyNestedProgressSource`, below, to pick the one this Root feeds
  // `@drawerdeck/core` as `nestedProgressSource`. The fallback half
  // (`reportNestedProgressValue`, below) never touches a ref or state of
  // its own at all: a plain number, pushed straight to this Root's own
  // `drawerRef` the moment it arrives, never through a re-render.
  const nestedProgressSourcesRef = useRef<Map<string, NestedProgressSource>>(
    new Map()
  );
  const [nestedProgressSource, setNestedProgressSource] =
    useState<NestedProgressSource | null>(null);

  /** Aggregates every registered child's own contribution (1 plus
   * whatever is nested inside *it*) into this Root's own `nestedCount`:
   * the largest, not the sum, of however many are currently registered --
   * in practice there is only ever one open chain, and taking the largest
   * keeps an unusual second one from double-counting the drawers really
   * stacked above this one. Exposed to a nested child through context,
   * never called by a part of this Root's own. */
  const notifyNestedChange = useCallback((id: string, contribution: number) => {
    if (contribution > 0) nestedContributionsRef.current.set(id, contribution);
    else nestedContributionsRef.current.delete(id);
    const values = [...nestedContributionsRef.current.values()];
    setNestedCount(values.length > 0 ? Math.max(...values) : 0);
  }, []);

  /** The same child's own close-and-wait, kept so this Root's own close
   * (`closeAndWait`, below) can cascade into it first. */
  const registerNestedClose = useCallback(
    (id: string, closeFn: (() => Promise<void>) | null) => {
      if (closeFn) nestedClosersRef.current.set(id, closeFn);
      else nestedClosersRef.current.delete(id);
    },
    []
  );

  /** Picks one registered child's own source (there is normally only
   * ever one; an unusual second one just keeps whichever was registered
   * first, in `Map` iteration order -- the same "only one chain is ever
   * really open" tradeoff `notifyNestedChange`'s own `Math.max` makes
   * above, just with no number to max over). */
  const notifyNestedProgressSource = useCallback(
    (id: string, source: NestedProgressSource | null) => {
      if (source) nestedProgressSourcesRef.current.set(id, source);
      else nestedProgressSourcesRef.current.delete(id);
      const first = nestedProgressSourcesRef.current.values().next();
      setNestedProgressSource(first.done ? null : first.value);
    },
    []
  );

  /** Writes straight through to this Root's own engine, bypassing state
   * (and so a re-render) entirely: the fallback (#249's own split) is a
   * plain number arriving on a real scroll frame, in a browser without a
   * named scroll timeline to drive `--drawer-nested-progress` natively,
   * and routing every one of those through `useState` would re-render
   * this whole Root for each. Only forwarded while `id` is the child
   * `notifyNestedProgressSource` currently has registered: a value from
   * one that is no longer the active source (closed, or superseded by an
   * unusual second one) is stale and must not overwrite a live one. */
  const reportNestedProgressValue = useCallback((id: string, value: number) => {
    if (!nestedProgressSourcesRef.current.has(id)) return;
    const first = nestedProgressSourcesRef.current.keys().next();
    if (first.done || first.value !== id) return;
    drawerRef.current?.setOptions({ nestedProgressValue: value });
  }, []);

  /** Closes this Root's own drawer and waits for it to actually finish,
   * cascading first into whatever is nested inside it (recursively, since
   * every level's own `closeAndWait` does the same check): the "closing
   * an outer drawer while an inner one is open closes the inner one first,
   * then the outer one" ruling (#272). Used by `Drawer.Close` and by a
   * controlled `open` going false -- never by Escape, a drag or an
   * outside press, which only ever reach the drawer actually acted on: for
   * a modal inner, the browser's own top layer and inertness keep Escape
   * and an outside press off a drawer that is not topmost, and
   * `ownsTarget` keeps a drag off it the same way (`@drawerdeck/core` no
   * longer guards any of the three with `nestedCount`; only its
   * non-modal Escape listener still reads it), so there is nothing here
   * for them to cascade. */
  const closeAndWait = useCallback(async (reason: OpenChangeReason) => {
    // Captured before the await, below, not read fresh after it: only the
    // controlled-`open`-went-false call site (the one effect that calls
    // this with `openRef.current` already `false`) can ever see this flip
    // back to `true` out from under it, during the very cascade that call
    // site itself started. `Drawer.Close` and a parent cascading into this
    // Root's own close both call this with `openRef.current` still `true`
    // (a controlled drawer's own close is reported, not yet granted) --
    // neither should bail just because it is.
    const wasOpenProp = openRef.current;
    const closers = [...nestedClosersRef.current.values()];
    if (closers.length > 0) await Promise.all(closers.map((close) => close()));
    // Re-checked now, not only at the top: a controlled outer whose `open`
    // goes back to `true` while the cascade above was still running no
    // longer wants this close at all (#237's review). Bailing out before
    // `drawer.close()` keeps this Root from ever reporting one.
    if (wasOpenProp === false && openRef.current === true) return;
    const drawer = drawerRef.current;
    if (!drawer || drawer.phase === 'closed') return;
    // The waiter goes in *before* `close()`: with no CSS transition at
    // all (nothing here declares one, or `prefers-reduced-motion`
    // zeroed it), `close()` runs synchronously all the way through to
    // `onPhaseChange('closed')` -- the very callback that resolves this
    // queue -- so pushing the resolver after the call would push it onto
    // a queue `onPhaseChange` already drained, and this would never
    // settle.
    const closed = new Promise<void>((resolve) => {
      closeWaitersRef.current.push(resolve);
    });
    drawer.close(reason);
    await closed;
  }, []);

  const snapPointRef = useRef(snapPoint);
  const onOpenChangeRef = useRef(onOpenChange);
  const onSnapPointChangeRef = useRef(onSnapPointChange);
  const snapPointsRef = useRef(snapPoints);
  const dismissibleRef = useRef(dismissible);
  const modalRef = useRef(modal);
  // Read inside the create-effect below the same way: `parentCtx` never
  // actually changes after mount (it is fixed by this Root's own position
  // in the tree, like `initialSide`), but it is a plain context value, not
  // a hook React itself guarantees stable, so a ref here -- rather than
  // listing it in that effect's own dependency array -- keeps a parent's
  // own, unrelated re-render (which gives its memoized context value a
  // fresh identity whenever *its* state changes) from recreating this
  // Root's whole engine instance for no reason.
  const parentCtxRef = useRef(parentCtx);
  // Read by `onProgressRangeChange`, below, for the same reason
  // `parentCtxRef` is: an imperative callback from the engine, created
  // once at this Root's own creation, needs a live answer to "am I
  // currently contributing to a parent's own nested state"
  // (`contributesNesting`, further down) without that callback's own
  // closure going stale. Duplicates `contributesNesting`'s own
  // expression rather than reading it from further down this component:
  // moving that declaration above the create-effect just to avoid the
  // duplication would separate it from the registration effects it
  // exists for.
  const contributesNestingRef = useRef(false);
  // The latest `onProgressRangeChange` this Root's own engine reported
  // (`@drawerdeck/core`'s own doc): read both by the registration effect
  // further down, for the value it registers the moment
  // `contributesNesting` turns true, and by `onProgressRangeChange`
  // itself, below, for a later change while already registered.
  const rangePercentRef = useRef(100);
  useLayoutEffect(() => {
    openRef.current = open;
    snapPointRef.current = snapPoint;
    onOpenChangeRef.current = onOpenChange;
    onSnapPointChangeRef.current = onSnapPointChange;
    snapPointsRef.current = snapPoints;
    dismissibleRef.current = dismissible;
    modalRef.current = modal;
    parentCtxRef.current = parentCtx;
    contributesNestingRef.current =
      state.phase === 'open' || state.phase === 'opening';
  });

  // Created once: the dialog, viewport and panel are always mounted (a
  // <dialog> is hidden, not unmounted, until shown), so their refs are
  // already set by the time this runs.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const viewport = viewportRef.current;
    const panel = panelRef.current;
    if (!dialog || !viewport || !panel) {
      throw new Error(
        'Drawer.Root must contain Drawer.Popup, Drawer.Viewport and Drawer.Panel'
      );
    }
    const drawer = createDrawer(
      {
        dialog,
        viewport,
        panel,
        content: contentRef.current,
        backdrop: backdropRef.current
      },
      {
        side: initialSide,
        snapPoints: snapPointsRef.current,
        dismissible: dismissibleRef.current,
        modal: modalRef.current,
        // Nesting's own progress (#332's own follow-up to #272): read
        // once, like `side` just above -- whether this Root is nested at
        // all is decided once, by where it sits in the tree, not
        // reactively. `undefined` (never read by the engine) for a Root
        // with no `parentCtx`: nothing will ever register it, so there is
        // nothing to expose.
        progressTimelineName: parentCtxRef.current ? timelineName : undefined,
        // The fallback half (#249's own split): forwarded to whichever
        // Root `parentCtx` belongs to, for it to feed its own engine
        // through `reportNestedProgressValue`. A no-op through
        // `parentCtxRef.current?.` where this Root is not nested -- the
        // engine calls it anyway only where a named scroll timeline is
        // unsupported.
        onProgressChange(progress) {
          parentCtxRef.current?.reportNestedProgressValue(childId, progress);
        },
        // `nestedProgressSource`'s own `rangePercent` (#332's own
        // follow-up to #272): changes far less often than `onProgressChange`
        // (only on a `setOptions` call that actually changes `snapPoints`,
        // or a resize), but can still change while this Root is already
        // registered as the active source (a resize while nested open),
        // so it is forwarded directly here too, not only read at
        // registration time -- gated by `contributesNestingRef`, the same
        // reason `onProgressChange` needs no gate of its own: this one
        // *can* fire while 'closing' (a resize mid-exit, `onResize`'s own
        // guard in `@drawerdeck/core` only excludes 'closed'), and
        // forwarding it then would re-register a source this Root no
        // longer counts as nested.
        onProgressRangeChange(rangePercent) {
          rangePercentRef.current = rangePercent;
          if (parentCtxRef.current && contributesNestingRef.current) {
            parentCtxRef.current.notifyNestedProgressSource(childId, {
              timelineName,
              side: initialSide,
              rangePercent
            });
          }
        },
        onPhaseChange(phase) {
          setState((s) => ({ ...s, phase }));
          if (phase === 'closed') {
            triggerRef.current?.focus({ preventScroll: true });
            // Nested or not: `closeAndWait`'s own promise (if anything is
            // waiting on it -- `Drawer.Close`, a controlled `open` going
            // false, or the Root this one is nested inside, cascading)
            // resolves only now, once the close is actually finished.
            const waiters = closeWaitersRef.current;
            closeWaitersRef.current = [];
            waiters.forEach((resolve) => resolve());
          }
        },
        onSnapPointChange(index) {
          setState((s) => ({ ...s, snapIndex: index }));
          if (index !== snapPointRef.current)
            onSnapPointChangeRef.current?.(index);
        },
        onDragChange(dragging) {
          setState((s) => ({ ...s, dragging }));
        },
        // The engine only ever reports a close it decided itself (drag,
        // escape, outside press): Root reports an open at the point
        // something asks for one (`requestOpen`), not from here.
        onOpenChange(nextOpen, reason) {
          if (openRef.current === undefined || nextOpen !== openRef.current) {
            onOpenChangeRef.current?.(nextOpen, { reason });
          }
        }
      }
    );
    drawerRef.current = drawer;
    if (initialOpen) drawer.open(initialSnapIndexRef.current);
    return () => {
      drawer.destroy();
      drawerRef.current = null;
    };
  }, [initialOpen, initialSide, childId, timelineName]);

  useLayoutEffect(() => {
    drawerRef.current?.setOptions({
      snapPoints,
      dismissible,
      modal,
      nestedCount,
      nestedProgressSource
    });
  }, [snapPoints, dismissible, modal, nestedCount, nestedProgressSource]);

  // Controlled `open`: follows a new value, and returns to it after a close
  // the parent's `onOpenChange` did not take (the parent kept `open` true).
  // `state.phase` is a dependency too, not just `open`, so the engine's own
  // spontaneous close -- the parent never changed `open` itself -- still
  // gets re-checked against it.
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || open === undefined) return;
    if (open && drawer.phase === 'closed') drawer.open(snapPoint);
    // `closeAndWait`, not a direct `drawer.close()`: a nested drawer still
    // open inside this one closes first (#272).
    if (!open && drawer.phase !== 'closed') void closeAndWait('programmatic');
  }, [open, snapPoint, state.phase, closeAndWait]);

  // Controlled `snapPoint`, while already open.
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || snapPoint === undefined || drawer.phase !== 'open') return;
    if (snapPoint !== drawer.snapIndex) drawer.snapTo(snapPoint);
  }, [snapPoint, state.phase]);

  const isOpen = state.phase !== 'closed';
  // This Root's own contribution to a parent's `nestedCount`
  // (`notifyNestedChange`, below) and progress source
  // (`notifyNestedProgressSource`, below): genuinely open or opening,
  // never while 'closing' (#332's own follow-up to #272, a maintainer's
  // real-iPhone report on the "Nested drawers" guide's own three-level
  // demo). `isOpen` (phase !== 'closed'), just above, stays true a little
  // longer, through 'closing' too: the native close cascade
  // (`registerNestedClose`, below) and the close button's and Escape's
  // own guards still need to wait for the close to actually finish, and
  // `data-open` (`dataAttrs`) still describes the dialog itself, which is
  // still genuinely open, mid-exit, until it is not. Only the *visual*
  // nesting state moves earlier: the moment this Root starts closing (any
  // path -- a button, Escape, a drag release, a flick, a parent's own
  // cascade), the drawer behind it stops counting this one as nested,
  // so its own scale-back transition starts together with this one's own
  // CSS exit, not after it finishes waiting for `isOpen` to catch up.
  // Reverts on its own, with no special-cased "restore", the moment
  // `state.phase` returns to 'opening' or 'open' -- an interrupted close
  // (`open()` arriving mid-exit) always passes back through here, since
  // `state.phase` is what drives it either way.
  const contributesNesting =
    state.phase === 'open' || state.phase === 'opening';

  // Nesting (#272): registers this Root's own contribution and its own
  // close-and-wait with whichever Root `parentCtx` belongs to, only while
  // this Root is itself nested inside one.
  //
  // Each pair below splits registration (mount and unmount -- or
  // `parentCtx`/`childId` themselves changing, which never actually
  // happens in practice) from the value it registers: a single effect
  // that both pushes a value *and* unconditionally clears it again on
  // *every* dependency change (not only on unmount) called the parent's
  // own `notify*` twice for the one update -- once with the stale "gone"
  // value, right before the fresh one -- which is exactly the
  // "removed and re-added within one update" churn #332's own design
  // ruling forbids, on a real device fast enough to make it a visible
  // stutter (a maintainer's own iPhone log cites the exact instant,
  // elsewhere in this round's own history). Splitting them means the
  // "gone" value is only ever reported once, for real, on an actual
  // unmount.
  useLayoutEffect(() => {
    if (!parentCtx) return;
    return () => parentCtx.notifyNestedChange(childId, 0);
  }, [parentCtx, childId]);
  useLayoutEffect(() => {
    if (!parentCtx) return;
    parentCtx.notifyNestedChange(
      childId,
      contributesNesting ? 1 + nestedCount : 0
    );
  }, [parentCtx, childId, contributesNesting, nestedCount]);

  useLayoutEffect(() => {
    if (!parentCtx) return;
    return () => parentCtx.registerNestedClose(childId, null);
  }, [parentCtx, childId]);
  useLayoutEffect(() => {
    if (!parentCtx) return;
    parentCtx.registerNestedClose(
      childId,
      isOpen ? () => closeAndWait('programmatic') : null
    );
  }, [parentCtx, childId, isOpen, closeAndWait]);

  // The same Root's own live open progress (#332's own follow-up to
  // #272): registered the same way `registerNestedClose`, above, is, but
  // gated on `isOpen`, not `contributesNesting`. The discrete `nestedCount`
  // contribution, above, is right to drop the moment this Root starts
  // closing (that is what lets the parent's own `data-nested-open` and
  // `--drawer-nested` move together with this Root's own CSS exit,
  // `contributesNesting`'s own module doc), but dropping the progress
  // source that early snaps the parent's own `--drawer-nested-progress`
  // straight to `0` the instant this Root's phase becomes 'closing',
  // before its own exit transition has even started moving: a worse jump
  // than the two-step close this round's own fix replaces, not a fix for
  // it. Kept registered through 'closing' instead, this Root's own
  // scroll position (and so the parent's own native progress, where a
  // scroll timeline is supported) stays live for the whole exit, so the
  // parent's own scale-back transition runs together with it, the same
  // moment `--drawer-nested` already does. Only once this Root is
  // genuinely `closed` does the source clear, the same point
  // `registerNestedClose` already waits for.
  useLayoutEffect(() => {
    if (!parentCtx) return;
    return () => parentCtx.notifyNestedProgressSource(childId, null);
  }, [parentCtx, childId]);
  useLayoutEffect(() => {
    if (!parentCtx) return;
    parentCtx.notifyNestedProgressSource(
      childId,
      isOpen
        ? {
            timelineName,
            side: initialSide,
            rangePercent: rangePercentRef.current
          }
        : null
    );
  }, [parentCtx, childId, isOpen, timelineName, initialSide]);

  // Nesting only supports a modal inner drawer (#237, this file's own
  // module doc): warns once, in development only, the first time this
  // Root opens non-modal while nested inside another. Never stops it from
  // opening -- this is a correctness warning, like React's own for a
  // missing `key`, not a guard.
  const warnedNestedNonModalRef = useRef(false);
  useLayoutEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!parentCtx || modal !== false || !isOpen) return;
    if (warnedNestedNonModalRef.current) return;
    warnedNestedNonModalRef.current = true;
    console.warn(
      'Drawer.Root: a non-modal drawer (modal={false}) opened nested ' +
        'inside another Drawer.Root. Nesting only supports a modal inner ' +
        'drawer: make this one modal, or move it to the outermost level.'
    );
  }, [parentCtx, modal, isOpen]);

  const requestOpen = useCallback((reason: OpenChangeReason) => {
    drawerRef.current?.open(
      snapPointRef.current ?? initialSnapIndexRef.current
    );
    onOpenChangeRef.current?.(true, { reason });
  }, []);
  // `closeAndWait`, not a direct `drawer.close()`: a nested drawer still
  // open inside this one closes first (#272).
  const requestClose = useCallback(
    (reason: OpenChangeReason) => {
      void closeAndWait(reason);
    },
    [closeAndWait]
  );
  const requestSnap = useCallback((index: number) => {
    drawerRef.current?.snapTo(index);
  }, []);

  const titleId = useId();
  const descriptionId = useId();
  const snapCount = (snapPoints?.length ?? 1) + 1;

  const context = useMemo<DrawerContextValue>(
    () => ({
      ...state,
      open: isOpen,
      dismissible,
      side: initialSide,
      snapCount,
      titleId,
      descriptionId,
      dialogRef,
      viewportRef,
      panelRef,
      contentRef,
      backdropRef,
      triggerRef,
      requestOpen,
      requestClose,
      requestSnap,
      notifyNestedChange,
      registerNestedClose,
      notifyNestedProgressSource,
      reportNestedProgressValue
    }),
    [
      state,
      isOpen,
      dismissible,
      initialSide,
      snapCount,
      titleId,
      descriptionId,
      requestOpen,
      requestClose,
      requestSnap,
      notifyNestedChange,
      registerNestedClose,
      notifyNestedProgressSource,
      reportNestedProgressValue
    ]
  );

  return <DrawerContext value={context}>{children}</DrawerContext>;
}

export interface TriggerProps extends ComponentProps<'button'> {
  render?: RenderProp;
}

/** Opens the drawer. A consumer's `onClick` runs first and can cancel the
 * open with `preventDefault()`. */
export function Trigger({ render, ref, onClick, ...rest }: TriggerProps) {
  const ctx = useDrawerContext('Trigger');
  return useRenderPart('button', render, {
    type: 'button',
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-trigger': '',
    ref: useComposedRefs(ctx.triggerRef, ref),
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) ctx.requestOpen('trigger');
    }
  });
}

export interface PopupProps extends ComponentProps<'dialog'> {
  render?: RenderProp;
}

/** The `<dialog>`: the top layer, so no portal is needed, when modal
 * (`Drawer.Root`'s default), opened with `showModal()`. `modal={false}`
 * opens it with `show()` instead, trading the top layer away for an
 * interactive page behind it: no focus trap, no inert page (see the
 * "Non-modal drawers" guide for why). Labelled by
 * `Drawer.Title` and described by `Drawer.Description`. Carries `timeline-scope`
 * for the Backdrop's native scroll-driven dim, `--drawer-first-snap` (the
 * dim's range, set once per layout), `data-side` (`Drawer.Root`'s `side`,
 * for styling per side -- see "Open from a side"), and, only where a
 * scroll timeline is unsupported (Firefox, #249), the `--drawer-progress`
 * fallback, written as the viewport scrolls. */
export function Popup({ render, ref, ...rest }: PopupProps) {
  const ctx = useDrawerContext('Popup');
  return useRenderPart('dialog', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-popup': '',
    'data-side': ctx.side,
    'aria-labelledby': ctx.titleId,
    'aria-describedby': ctx.descriptionId,
    ref: useComposedRefs(ctx.dialogRef, ref)
  });
}

export interface PartProps extends ComponentProps<'div'> {
  render?: RenderProp;
}

/** The dim: purely visual and headless -- style it with your own
 * `@keyframes` on `animation-timeline: --drawer` (native scroll-driven, no
 * JS; see the "Style the backdrop" guide), falling back to
 * `--drawer-progress` where that is unsupported (#249). Never intercepts a
 * press -- the viewport's own `[data-drawer-gap]` closes a dismissible
 * drawer on an outside press. */
export function Backdrop({ render, ref, ...rest }: PartProps) {
  const ctx = useDrawerContext('Backdrop');
  return useRenderPart('div', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-backdrop': '',
    'aria-hidden': true,
    ref: useComposedRefs(ctx.backdropRef, ref)
  });
}

/** The native scroll-snap container. Renders the gap spacer, the snap
 * markers the engine positions, and `children` (the panel) -- in
 * `[gap][markers][Panel]` order for `'bottom'`/`'right'`, reversed to
 * `[Panel][markers][gap]` for `'top'`/`'left'` (`Side`'s own comment in
 * `@drawerdeck/core`: open sits at scroll offset 0 for those two, closed at
 * the scroll end). The markers' own position in that order never matters --
 * the engine places them with `position: absolute` -- only the gap and the
 * Panel's. React owns every node here, the engine only measures and
 * positions the markers. */
export function Viewport({ render, ref, children, ...rest }: PartProps) {
  const ctx = useDrawerContext('Viewport');
  const reversed = ctx.side === 'top' || ctx.side === 'left';
  const gap = <div data-drawer-gap="" aria-hidden="true" />;
  const markers = Array.from({ length: ctx.snapCount }, (_, i) => (
    <div key={i} data-drawer-snap="" aria-hidden="true" />
  ));
  return useRenderPart('div', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-viewport': '',
    ref: useComposedRefs(ctx.viewportRef, ref),
    children: reversed ? (
      <>
        {children}
        {markers}
        {gap}
      </>
    ) : (
      <>
        {gap}
        {markers}
        {children}
      </>
    )
  });
}

/** The visible sheet: the consumer styles this. A mouse drag (#235) is
 * read from here. `data-side` mirrors `Drawer.Popup`'s own, for styling the
 * Panel's own entrance and exit per side (see "Open from a side"). */
export function Panel({ render, ref, ...rest }: PartProps) {
  const ctx = useDrawerContext('Panel');
  return useRenderPart('div', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-panel': '',
    'data-side': ctx.side,
    ref: useComposedRefs(ctx.panelRef, ref)
  });
}

/** A visual drag affordance only: decorative, never focusable, so it is
 * never a focus trap. */
export function Handle({ render, ref, ...rest }: PartProps) {
  const ctx = useDrawerContext('Handle');
  return useRenderPart('div', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-handle': '',
    'aria-hidden': true,
    ref
  });
}

export interface TitleProps extends ComponentProps<'h2'> {
  render?: RenderProp;
}

/** Labels the dialog (`aria-labelledby`, set on `Drawer.Popup`). */
export function Title({ render, ref, id, ...rest }: TitleProps) {
  const ctx = useDrawerContext('Title');
  return useRenderPart('h2', render, {
    ...rest,
    id: id ?? ctx.titleId,
    ...dataAttrs(ctx),
    'data-drawerdeck-title': '',
    ref
  });
}

export interface DescriptionProps extends ComponentProps<'p'> {
  render?: RenderProp;
}

/** Describes the dialog (`aria-describedby`, set on `Drawer.Popup`). */
export function Description({ render, ref, id, ...rest }: DescriptionProps) {
  const ctx = useDrawerContext('Description');
  return useRenderPart('p', render, {
    ...rest,
    id: id ?? ctx.descriptionId,
    ...dataAttrs(ctx),
    'data-drawerdeck-description': '',
    ref
  });
}

/** The scrollable inner content: locked (no scrolling of its own) below
 * the top snap point (#232: variant B), so a drag anywhere on it moves the
 * drawer until then. */
export function Content({ render, ref, ...rest }: PartProps) {
  const ctx = useDrawerContext('Content');
  return useRenderPart('div', render, {
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-content': '',
    ref: useComposedRefs(ctx.contentRef, ref)
  });
}

export interface CloseProps extends ComponentProps<'button'> {
  render?: RenderProp;
}

/** Closes the drawer, whether or not it is dismissible. A consumer's
 * `onClick` runs first and can cancel the close with `preventDefault()`. */
export function Close({ render, ref, onClick, ...rest }: CloseProps) {
  const ctx = useDrawerContext('Close');
  return useRenderPart('button', render, {
    type: 'button',
    ...rest,
    ...dataAttrs(ctx),
    'data-drawerdeck-close': '',
    ref,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) ctx.requestClose('close-button');
    }
  });
}
