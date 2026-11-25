'use client';

import {
  cloneElement,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type Ref,
  type RefObject
} from 'react';

export const version = '0.0.0';

// Left in the build for the consumer's bundler to replace: this package has
// no bundler of its own (`tsc -b` only), so `process.env.NODE_ENV` ships as
// source, not a literal.
declare const process: { env: { NODE_ENV?: string } };

/**
 * A part's `render` prop: a `ReactElement` to clone the part's own props
 * onto, or a function given them to build one. Without it, the part renders
 * its own default tag.
 */
export type RenderProp =
  ReactElement | ((props: Record<string, unknown>) => ReactElement);

function setRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) (ref as RefObject<T | null>).current = node;
}

/** Combines refs so a part's own, the consumer's, and a `render` element's
 * own all see the same node. */
function useComposedRefs<T>(
  ...refs: (Ref<T> | undefined)[]
): Ref<T> | undefined {
  const live = refs.filter((ref): ref is Ref<T> => ref != null);
  if (live.length <= 1) return live[0];
  return (node: T | null) => {
    for (const ref of live) setRef(ref, node);
  };
}

/** `className` concatenates, `style` merges, and an event handler (`onX`)
 * calls both, `a`'s first, or `b`'s first for a key in `last`; every other
 * key in `b` wins. */
function mergeProps(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  last: readonly string[] = []
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
      const [first, second] = last.includes(key) ? [bv, av] : [av, bv];
      merged[key] = (...args: unknown[]) => {
        (first as (...a: unknown[]) => void)(...args);
        (second as (...a: unknown[]) => void)(...args);
      };
    }
  }
  return merged;
}

/** Renders one primitive as `tag`, or onto `render`: a function gets this
 * part's own computed props (including its `ref`) to build an element with;
 * a `ReactElement` is cloned, merging its own props and composing its own
 * `ref` with the part's. A handler named in `last` runs after the
 * element's own, so it sees what that one did to the event. */
function useRenderPart(
  tag: string,
  render: RenderProp | undefined,
  { ref, ...props }: Record<string, unknown> & { ref?: Ref<unknown> },
  last?: readonly string[]
): ReactElement {
  const elementProps =
    render !== undefined && typeof render !== 'function'
      ? (render.props as Record<string, unknown> & { ref?: Ref<unknown> })
      : undefined;
  // Called unconditionally, whichever branch below uses it (or not).
  const composed = useComposedRefs(ref, elementProps?.ref);
  if (render === undefined)
    return createElement(tag, { ...props, ref: composed });
  if (typeof render === 'function') return render({ ...props, ref: composed });
  return cloneElement(render as ReactElement<Record<string, unknown>>, {
    ...mergeProps(props, elementProps!, last),
    ref: composed
  });
}

/** What a Root knows of one of its Items. The Item keeps it current and
 * registers it on mount: a Root finds its own Items by registration, not by
 * a DOM query, because a query for `details` would also match a nested
 * Root's Items, and one scoped by `name` would miss them in multiple mode,
 * which has none. Context stops at the nearest Root, so a nested Root's
 * Items register with it alone. Only an Item with a `value` registers. */
interface Entry {
  value: string;
  itemRef: RefObject<HTMLDetailsElement | null>;
  notify(open: boolean): void;
}

interface RootContextValue {
  name: string | undefined;
  disabled: boolean;
  alwaysOneOpen: boolean;
  isOpen(value: string | undefined): boolean;
  register(entry: Entry): () => void;
  /** Called after every commit of an Item: where the Items sit in the
   * document can change without the Root rendering. */
  refresh(): void;
  requestChange(value: string, open: boolean): void;
  adoptItems(): void;
}

const RootContext = createContext<RootContextValue | null>(null);

const sameValue = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface ItemContextValue {
  open: boolean;
  disabled: boolean;
  /** The Trigger is inert because the Root is always one open and this is
   * its open Item. */
  locked: boolean;
  itemRef: RefObject<HTMLDetailsElement | null>;
  requestChange(open: boolean): void;
}

const ItemContext = createContext<ItemContextValue | null>(null);

function useItemContext(part: string): ItemContextValue {
  const ctx = useContext(ItemContext);
  if (!ctx) throw new Error(`Accordion.${part} must be inside Accordion.Item`);
  return ctx;
}

export interface ItemProps extends Omit<ComponentProps<'details'>, 'open'> {
  render?: RenderProp;
  /** The Item's name in a Root's `value`. The Item itself does not use it. */
  value?: string;
  /** Controls the Item: it is open while this is true. */
  open?: boolean;
  /** Starts an uncontrolled Item open. */
  defaultOpen?: boolean;
  /** Called with the new state for every change, whether a click, a
   * find-in-page or fragment-link open, or a click before hydration. */
  onOpenChange?(open: boolean): void;
  /** Makes the Trigger inert. Find-in-page can still open the Item. */
  disabled?: boolean;
}

/** What `ItemView` renders from, whoever owns the state: a Root, or the
 * Item itself. */
interface ItemState {
  open: boolean;
  disabled: boolean;
  locked: boolean;
  name: string | undefined;
  requestChange(open: boolean): void;
  /** A `toggle` of this Item's own `<details>`. */
  onToggle(): void;
}

interface ItemBodyProps extends Omit<ItemProps, 'ref'> {
  /** `ref` itself is not a prop of a function component in React 18. */
  forwardedRef: ItemProps['ref'];
}

/** One collapsible: a `<details>`. The browser toggles `open` itself, so
 * this keeps React's state and the DOM in step both ways: the Trigger's
 * click is React's (`preventDefault()`, then React writes `open`), and a
 * `toggle` nobody could prevent is read back (ADR 0001, "State and the
 * browser"). Inside a Root the Root owns the state, and this Item is one of
 * its parts; on its own the Item owns it. */
export function Item({ ref, value, ...props }: ItemProps) {
  const root = useContext(RootContext);
  return root ? (
    <RootItem {...props} value={value} forwardedRef={ref} root={root} />
  ) : (
    <StandaloneItem {...props} forwardedRef={ref} />
  );
}

function RootItem({
  root,
  forwardedRef,
  value,
  open: openProp,
  defaultOpen: defaultOpenProp,
  onOpenChange,
  disabled = false,
  ...props
}: ItemBodyProps & { root: RootContextValue }) {
  const itemRef = useRef<HTMLDetailsElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const entry = useRef<Entry>({
    value: value ?? '',
    itemRef,
    notify: (next) => onOpenChangeRef.current?.(next)
  });
  // An insertion effect runs first in a commit, before any layout effect
  // and ref, and unlike a layout effect React 18 does not warn about it on
  // the server.
  useInsertionEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    entry.current.value = value ?? '';
  });

  // A passive effect: React 18 warns about a layout effect on the server.
  // The Root adopts all its Items once its Items have registered, which
  // they do in this commit's effects, before its own.
  const hasValue = value !== undefined;
  const { register, refresh } = root;
  useEffect(
    () => (hasValue ? register(entry.current) : undefined),
    [register, hasValue]
  );
  useEffect(() => {
    refresh();
  });

  const ignoresOpen = openProp !== undefined;
  const ignoresDefaultOpen = defaultOpenProp !== undefined;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!hasValue)
      console.warn(
        "Accordion.Item: an Item inside an Accordion.Root needs a `value`, which names it in the Root's `value`. Without one it takes no part in the Root's value."
      );
    if (ignoresOpen)
      console.warn(
        "Accordion.Item: `open` is ignored inside an Accordion.Root, which owns the state. Use the Root's `value`."
      );
    if (ignoresDefaultOpen)
      console.warn(
        "Accordion.Item: `defaultOpen` is ignored inside an Accordion.Root, which owns the state. Use the Root's `defaultValue`."
      );
  }, [hasValue, ignoresOpen, ignoresDefaultOpen]);

  const open = root.isOpen(value);
  return (
    <ItemView
      {...props}
      forwardedRef={forwardedRef}
      detailsRef={itemRef}
      state={{
        open,
        disabled: root.disabled || disabled,
        locked: root.alwaysOneOpen && open,
        // The Root's, which is none in multiple mode.
        name: root.name,
        requestChange: (next) => {
          if (value !== undefined) root.requestChange(value, next);
        },
        onToggle: root.adoptItems
      }}
    />
  );
}

function StandaloneItem({
  forwardedRef,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  ...props
}: ItemBodyProps) {
  const [state, setState] = useState(defaultOpen);
  const open = openProp ?? state;
  const itemRef = useRef<HTMLDetailsElement | null>(null);
  // What the handlers below read, kept fresh each render: the state a
  // `toggle` is compared with is the one React last rendered.
  const live = useRef({ open, openControlled: openProp !== undefined });
  const onOpenChangeRef = useRef(onOpenChange);
  // The change last reported and the state it was reported against: while
  // the parent has not answered, the same change is not reported again,
  // which also covers the `toggle` the write-back below causes. The parent
  // answers by moving `open`, which clears it.
  const reported = useRef<{ next: boolean; against: boolean } | null>(null);
  useInsertionEffect(() => {
    if (live.current.open !== open) reported.current = null;
    live.current = { open, openControlled: openProp !== undefined };
    onOpenChangeRef.current = onOpenChange;
  });

  /** Writes `open` back wherever the DOM disagrees with what React
   * rendered, after React's own render: a parent that declined is the only
   * thing left to disagree. */
  const settle = useCallback(() => {
    setTimeout(() => {
      const el = itemRef.current;
      if (el && el.open !== live.current.open) el.open = live.current.open;
    }, 0);
  }, []);

  const requestChange = useCallback(
    (next: boolean, fromDom = false) => {
      // A change the DOM already holds is reported once while the parent
      // has not answered, whichever of the mount and a `toggle` sees it.
      reported.current = fromDom ? { next, against: live.current.open } : null;
      if (!live.current.openControlled) setState(next);
      onOpenChangeRef.current?.(next);
      settle();
    },
    [settle]
  );

  /** A change the DOM holds and React has not rendered: reported once while
   * the parent has not answered, but the DOM is reconciled either way. */
  const adoptOpen = useCallback(
    (next: boolean) => {
      if (next === live.current.open) return;
      const last = reported.current;
      if (last && last.next === next && last.against === live.current.open) {
        settle();
        return;
      }
      requestChange(next, true);
    },
    [settle, requestChange]
  );

  // Hydration adopts what the DOM holds: a click before hydration opened it
  // with nobody to tell.
  useEffect(() => {
    const el = itemRef.current;
    if (el) adoptOpen(el.open);
  }, [adoptOpen]);

  return (
    <ItemView
      {...props}
      forwardedRef={forwardedRef}
      detailsRef={itemRef}
      state={{
        open,
        disabled,
        locked: false,
        name: props.name,
        requestChange,
        onToggle: () => {
          const el = itemRef.current;
          if (el) adoptOpen(el.open);
        }
      }}
    />
  );
}

function ItemView({
  render,
  forwardedRef,
  detailsRef,
  state,
  onToggle,
  children,
  ...rest
}: Omit<ItemBodyProps, 'open' | 'defaultOpen' | 'onOpenChange' | 'value'> & {
  detailsRef: RefObject<HTMLDetailsElement | null>;
  state: ItemState;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = detailsRef.current;
    if (el && el.tagName !== 'DETAILS')
      console.warn(
        `Accordion.Item: it must render a <details>, and it rendered a <${el.tagName.toLowerCase()}>. Check its \`render\` prop.`
      );
  }, [detailsRef]);

  const handleToggle: NonNullable<ItemProps['onToggle']> = (event) => {
    onToggle?.(event);
    // React's `onToggle` also reaches an Item from a nested one's `toggle`.
    if (event.target === event.currentTarget) state.onToggle();
  };

  const context: ItemContextValue = {
    open: state.open,
    disabled: state.disabled,
    locked: state.locked,
    itemRef: detailsRef,
    requestChange: state.requestChange
  };
  return (
    <ItemContext.Provider value={context}>
      {useRenderPart('details', render, {
        ...rest,
        name: state.name,
        open: state.open,
        // The DOM can hold what the server's HTML did not: a click before
        // hydration.
        suppressHydrationWarning: true,
        onToggle: handleToggle,
        ref: useComposedRefs(detailsRef, forwardedRef),
        children
      })}
    </ItemContext.Provider>
  );
}

export type Level = 1 | 2 | 3 | 4 | 5 | 6;

export interface TriggerProps extends ComponentProps<'summary'> {
  render?: RenderProp;
  /** Renders the text in an `<h1>` to `<h6>` inside the summary. Without
   * it, no heading. */
  level?: Level;
}

/** The Item's `<summary>`. A consumer's `onClick`, the Trigger's own or its
 * `render` element's, runs first and can cancel the change with
 * `preventDefault()`. */
export function Trigger({
  render,
  ref,
  level,
  onClick,
  children,
  ...rest
}: TriggerProps) {
  const ctx = useItemContext('Trigger');
  const triggerRef = useRef<HTMLElement | null>(null);

  // After every layout effect, so the Item's own ref is attached.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = triggerRef.current;
    if (!el) return;
    if (el.tagName !== 'SUMMARY')
      console.warn(
        `Accordion.Trigger: it must render a <summary>, and it rendered a <${el.tagName.toLowerCase()}>. Check its \`render\` prop.`
      );
    else if (el.parentElement !== ctx.itemRef.current)
      console.warn(
        'Accordion.Trigger: its <summary> must be the direct child of the Accordion.Item. A <summary> inside another element is hidden, and the browser shows its default one.'
      );
  }, [ctx.itemRef]);

  return useRenderPart(
    'summary',
    render,
    {
      ...rest,
      'aria-expanded': ctx.open,
      'aria-disabled': ctx.disabled || ctx.locked ? true : undefined,
      ref: useComposedRefs(triggerRef, ref),
      onClick: (event: MouseEvent<HTMLElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // A link, button or checkbox inside the Trigger keeps its own
        // behaviour: only the summary itself is ours.
        const target = event.target as Element;
        const nearest = target.closest(
          'a[href],button,input,select,textarea,label,summary'
        );
        if (nearest !== event.currentTarget) return;
        event.preventDefault();
        if (!ctx.disabled && !ctx.locked) ctx.requestChange(!ctx.open);
      },
      children:
        level === undefined
          ? children
          : createElement(`h${level}`, null, children)
    },
    ['onClick']
  );
}

export interface PanelProps extends ComponentProps<'div'> {
  render?: RenderProp;
}

/** The Item's content. Always rendered, closed or not: find-in-page and an
 * open before hydration need it in the DOM. */
export function Panel({ render, ref, ...rest }: PanelProps) {
  return useRenderPart('div', render, { ...rest, ref });
}

export interface RootProps extends Omit<
  ComponentProps<'div'>,
  'defaultValue' | 'onChange'
> {
  render?: RenderProp;
  /** Lets any number of Items open. Without it, one at most. */
  multiple?: boolean;
  /** The open Items, by their `value`. Controls the Root. */
  value?: string[];
  /** Starts an uncontrolled Root with these Items open. */
  defaultValue?: string[];
  /** Called with the new value for every change, whether a click, a
   * find-in-page or fragment-link open, or a click before hydration. */
  onValueChange?(value: string[]): void;
  /** Makes every Item's Trigger inert. Find-in-page can still open one. */
  disabled?: boolean;
  /** Single mode only: the open Item's Trigger is inert, and only opening
   * another Item closes it. A Root may still start with none open. */
  alwaysOneOpen?: boolean;
  /** The Root's `name`, in single mode. Two Roots rendered on the server
   * apart both get the same `useId`, so give each its own. */
  name?: string;
  orientation?: 'vertical' | 'horizontal';
}

/** The Root: it owns its Items' state. It reads all its Items at each
 * `toggle`, reports what differs from what it last reported, and writes
 * `open` back where a parent declined (ADR 0001, "State and the
 * browser"). */
export function Root({
  render,
  ref,
  multiple = false,
  value: valueProp,
  defaultValue,
  onValueChange,
  disabled = false,
  alwaysOneOpen = false,
  name: nameProp,
  orientation = 'vertical',
  children,
  ...rest
}: RootProps) {
  const generatedName = useId();
  const [state, setState] = useState(defaultValue ?? []);
  const value = valueProp ?? state;
  const single = !multiple;
  const enforcesOneOpen = single && alwaysOneOpen;
  // In single mode with several values, the one Item that stays open: the
  // first registered one in document order. Unset while no Item has said.
  const [firstOpen, setFirstOpen] = useState<string | undefined>();

  const live = useRef({
    value,
    controlled: valueProp !== undefined,
    multiple,
    enforcesOneOpen
  });
  const onValueChangeRef = useRef(onValueChange);
  const entries = useRef(new Set<Entry>());
  // The change last reported and the value it was reported against: while
  // the parent has not answered, the same change is not reported again,
  // which also covers the `toggle`s the write-back below causes. The parent
  // answers by moving `value`, which clears it.
  const reported = useRef<{ next: string[]; against: string[] } | null>(null);
  useInsertionEffect(() => {
    if (!sameValue(live.current.value, value)) reported.current = null;
    live.current = {
      value,
      controlled: valueProp !== undefined,
      multiple,
      enforcesOneOpen
    };
    onValueChangeRef.current = onValueChange;
  });

  /** The registered Items that are in the document, in document order. */
  const ordered = useCallback(() => {
    const found = [...entries.current].filter((e) => e.itemRef.current);
    return found.sort((a, b) =>
      a.itemRef.current!.compareDocumentPosition(b.itemRef.current!) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1
    );
  }, []);

  /** The values of the ordered Items that pass `test`: in single mode, the
   * first alone. */
  const valuesWhere = useCallback(
    (test: (e: Entry) => boolean) => {
      const found = ordered()
        .filter(test)
        .map((e) => e.value);
      return live.current.multiple ? found : found.slice(0, 1);
    },
    [ordered]
  );

  /** What the DOM should hold: the Items in `value`. */
  const expected = useCallback(
    () => valuesWhere((e) => live.current.value.includes(e.value)),
    [valuesWhere]
  );

  /** What the DOM holds. */
  const inDom = useCallback(
    () => valuesWhere((e) => e.itemRef.current!.open),
    [valuesWhere]
  );

  /** The next `value`. Multiple: the current one, with the Items in `added`
   * put in document order among the Items and those in `removed` taken
   * out. A value no Item is mounted for stays where it is. Single: the one
   * Item opened, or none. */
  const valueWith = useCallback(
    (added: string[], removed: string[]) => {
      const { value, multiple } = live.current;
      if (!multiple) return added.slice(0, 1);
      const order = ordered().map((e) => e.value);
      const next = value.filter((v) => !removed.includes(v));
      for (const v of added) {
        if (next.includes(v)) continue;
        const before = next.findIndex(
          (x) => order.indexOf(x) > order.indexOf(v)
        );
        next.splice(before < 0 ? next.length : before, 0, v);
      }
      return next;
    },
    [ordered]
  );

  /** Writes `open` where the DOM disagrees with what React rendered. The
   * Items to close go first, so a named group never holds two. */
  const writeBack = useCallback(() => {
    const want = expected();
    const items = ordered();
    for (const e of items)
      if (!want.includes(e.value) && e.itemRef.current!.open)
        e.itemRef.current!.open = false;
    for (const e of items)
      if (want.includes(e.value) && !e.itemRef.current!.open)
        e.itemRef.current!.open = true;
  }, [expected, ordered]);

  /** After React's own render: a parent that declined is the only thing
   * left to disagree. */
  const settle = useCallback(() => {
    setTimeout(writeBack, 0);
  }, [writeBack]);

  const report = useCallback(
    (next: string[], fromDom: boolean) => {
      const before = expected();
      reported.current = fromDom ? { next, against: before } : null;
      if (!live.current.controlled) setState(next);
      onValueChangeRef.current?.(next);
      // The same diff, to each Item that changed.
      for (const e of ordered()) {
        const was = before.includes(e.value);
        const now = next.includes(e.value);
        if (was !== now) e.notify(now);
      }
      settle();
    },
    [expected, ordered, settle]
  );

  /** Reads all the Items, and reports what differs from `value`. A `toggle`
   * and the mount both call it. The suppressed report still reconciles the
   * DOM. */
  const adoptItems = useCallback(
    (onMount = false) => {
      const opens = inDom();
      const want = expected();
      if (
        live.current.enforcesOneOpen &&
        opens.length === 0 &&
        want.length > 0
      ) {
        // Always one open: a close nobody could prevent is not reported.
        if (onMount) writeBack();
        else settle();
        return;
      }
      const added = opens.filter((v) => !want.includes(v));
      const removed = want.filter((v) => !opens.includes(v));
      if (added.length === 0 && removed.length === 0) return;
      const next = valueWith(added, removed);
      const last = reported.current;
      if (last && sameValue(last.next, next) && sameValue(last.against, want)) {
        settle();
        return;
      }
      report(next, true);
    },
    [inDom, expected, valueWith, report, settle, writeBack]
  );

  const requestChange = useCallback(
    (itemValue: string, open: boolean) =>
      report(
        valueWith(open ? [itemValue] : [], open ? [] : [itemValue]),
        false
      ),
    [valueWith, report]
  );

  const register = useCallback((entry: Entry) => {
    entries.current.add(entry);
    return () => {
      entries.current.delete(entry);
    };
  }, []);

  const refresh = useCallback(() => {
    const { value, multiple } = live.current;
    setFirstOpen(multiple || value.length < 2 ? undefined : expected()[0]);
  }, [expected]);

  // Mounted after every Item's own effect: hydration adopts what the DOM
  // holds, or under always one open with no Item open, restores `value`.
  useEffect(() => {
    adoptItems(true);
  }, [adoptItems]);

  const singleHasSeveralValues = single && value.length > 1;
  const alwaysOneOpenIgnored = multiple && alwaysOneOpen;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (singleHasSeveralValues)
      console.warn(
        'Accordion.Root: a single Root was given more than one value. Only the first Item in document order stays open. Pass `multiple` to open several.'
      );
    if (alwaysOneOpenIgnored)
      console.warn(
        'Accordion.Root: `alwaysOneOpen` applies to a single Root only, and is ignored with `multiple`.'
      );
  }, [singleHasSeveralValues, alwaysOneOpenIgnored]);

  const name = single ? (nameProp ?? generatedName) : undefined;
  // Every Item reads this, so it changes whenever what they read does. In
  // single mode the first Item in `value` takes the one open place: by
  // document order once the Items have registered (`firstOpen`), and until
  // then by render order, which is document order for the first render and
  // the server's. `firstByRenderOrder` is shared by the Items of one such
  // context.
  const context = useMemo<RootContextValue>(() => {
    let firstByRenderOrder: string | undefined;
    return {
      name,
      disabled,
      alwaysOneOpen: enforcesOneOpen,
      isOpen(itemValue) {
        if (itemValue === undefined || !value.includes(itemValue)) return false;
        if (multiple) return true;
        if (firstOpen !== undefined && value.includes(firstOpen))
          return firstOpen === itemValue;
        firstByRenderOrder ??= itemValue;
        return firstByRenderOrder === itemValue;
      },
      register,
      refresh,
      requestChange,
      adoptItems
    };
  }, [
    name,
    disabled,
    enforcesOneOpen,
    value,
    multiple,
    firstOpen,
    register,
    refresh,
    requestChange,
    adoptItems
  ]);

  return (
    <RootContext.Provider value={context}>
      {useRenderPart('div', render, {
        ...rest,
        'data-orientation': orientation,
        ref,
        children
      })}
    </RootContext.Provider>
  );
}
