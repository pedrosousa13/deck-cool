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

  const openRef = useRef(open);
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
          if (phase === 'closed')
            triggerRef.current?.focus({ preventScroll: true });
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
    drawerRef.current?.setOptions({ snapPoints, dismissible, modal });
  }, [snapPoints, dismissible, modal]);

  // Controlled `open`: follows a new value, and returns to it after a close
  // the parent's `onOpenChange` did not take (the parent kept `open` true).
  // `state.phase` is a dependency too, not just `open`, so the engine's own
  // spontaneous close -- the parent never changed `open` itself -- still
  // gets re-checked against it.
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || open === undefined) return;
    if (open && drawer.phase === 'closed') drawer.open(snapPoint);
    if (!open && drawer.phase !== 'closed') drawer.close('programmatic');
  }, [open, snapPoint, state.phase]);

  // Controlled `snapPoint`, while already open.
  useLayoutEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || snapPoint === undefined || drawer.phase !== 'open') return;
    if (snapPoint !== drawer.snapIndex) drawer.snapTo(snapPoint);
  }, [snapPoint, state.phase]);

  const requestOpen = useCallback((reason: OpenChangeReason) => {
    drawerRef.current?.open(
      snapPointRef.current ?? initialSnapIndexRef.current
    );
    onOpenChangeRef.current?.(true, { reason });
  }, []);
  const requestClose = useCallback((reason: OpenChangeReason) => {
    drawerRef.current?.close(reason);
  }, []);
  const requestSnap = useCallback((index: number) => {
    drawerRef.current?.snapTo(index);
  }, []);

  const titleId = useId();
  const descriptionId = useId();
  const snapCount = (snapPoints?.length ?? 1) + 1;
  const isOpen = state.phase !== 'closed';

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
      requestSnap
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
      requestSnap
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
