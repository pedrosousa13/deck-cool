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
 * no swipe progress, no frontmost height, just a depth count and a close.
 *
 * `@drawerdeck/core` is handed the *result*, not the relationship: a
 * plain `nestedCount` number through `setOptions`, the same way
 * `snapPoints`/`dismissible`/`modal` already go in. The engine renders it
 * (`data-nested-open`, `--drawer-nested`) and uses it to yield Escape and
 * an outside press to whatever is nested above; this file is the one that
 * works out what that number is, and sequences the cascade when an outer
 * drawer closes while an inner one is still open (`closeAndWait`, in
 * `Root`, below).
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

  /** Closes this Root's own drawer and waits for it to actually finish,
   * cascading first into whatever is nested inside it (recursively, since
   * every level's own `closeAndWait` does the same check): the "closing
   * an outer drawer while an inner one is open closes the inner one first,
   * then the outer one" ruling (#272). Used by `Drawer.Close` and by a
   * controlled `open` going false -- never by Escape, a drag or an
   * outside press, which only ever reach the drawer actually acted on
   * (`@drawerdeck/core`'s own `nestedCount` guard already keeps those off
   * a drawer that is not the topmost, so there is nothing here for them to
   * cascade). */
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
  useLayoutEffect(() => {
    openRef.current = open;
    snapPointRef.current = snapPoint;
    onOpenChangeRef.current = onOpenChange;
    onSnapPointChangeRef.current = onSnapPointChange;
    snapPointsRef.current = snapPoints;
    dismissibleRef.current = dismissible;
    modalRef.current = modal;
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
  }, [initialOpen, initialSide]);

  useLayoutEffect(() => {
    drawerRef.current?.setOptions({
      snapPoints,
      dismissible,
      modal,
      nestedCount
    });
  }, [snapPoints, dismissible, modal, nestedCount]);

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

  // Nesting (#272): registers this Root's own contribution and its own
  // close-and-wait with whichever Root `parentCtx` belongs to, only while
  // this Root is itself nested inside one.
  useLayoutEffect(() => {
    if (!parentCtx) return;
    parentCtx.notifyNestedChange(childId, isOpen ? 1 + nestedCount : 0);
    return () => parentCtx.notifyNestedChange(childId, 0);
  }, [parentCtx, childId, isOpen, nestedCount]);
  useLayoutEffect(() => {
    if (!parentCtx) return;
    parentCtx.registerNestedClose(
      childId,
      isOpen ? () => closeAndWait('programmatic') : null
    );
    return () => parentCtx.registerNestedClose(childId, null);
  }, [parentCtx, childId, isOpen, closeAndWait]);

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
      registerNestedClose
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
      registerNestedClose
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
