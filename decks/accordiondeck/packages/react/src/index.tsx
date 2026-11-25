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
 * Items register with it alone. */
interface Entry {
  value: string | undefined;
  itemRef: RefObject<HTMLDetailsElement | null>;
  notify(open: boolean): void;
}

interface GroupContextValue {
  name: string | undefined;
  disabled: boolean;
  alwaysOneOpen: boolean;
  isOpen(value: string | undefined): boolean;
  register(entry: Entry): () => void;
  requestChange(value: string | undefined, open: boolean): void;
  adopt(): void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

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

/** One collapsible: a `<details>`. The browser toggles `open` itself, so
 * this keeps React's state and the DOM in step both ways: the Trigger's
 * click is React's (`preventDefault()`, then React writes `open`), and a
 * `toggle` nobody could prevent is read back (ADR 0001, "State and the
 * browser"). */
export function Item({
  render,
  ref,
  // Not for the DOM: the Root reads it, through this Item's entry.
  value,
  open: openProp,
  defaultOpen: defaultOpenProp,
  onOpenChange,
  disabled: disabledProp = false,
  onToggle,
  children,
  ...rest
}: ItemProps) {
  // Inside a Root the Root owns the state; this Item is one of its parts.
  const group = useContext(GroupContext);
  const defaultOpen = defaultOpenProp ?? false;
  const [state, setState] = useState(defaultOpen);
  const open = group ? group.isOpen(value) : (openProp ?? state);
  const disabled = (group?.disabled ?? false) || disabledProp;
  const itemRef = useRef<HTMLDetailsElement | null>(null);
  // What the handlers below read, kept fresh each render: the state a
  // `toggle` is compared with is the one React last rendered.
  const live = useRef({ open, openControlled: openProp !== undefined });
  const onOpenChangeRef = useRef(onOpenChange);
  const entry = useRef<Entry>({
    value,
    itemRef,
    notify: (next) => onOpenChangeRef.current?.(next)
  });
  // An insertion effect runs first in a commit, before any layout effect
  // and ref, and unlike a layout effect React 18 does not warn about it on
  // the server.
  useInsertionEffect(() => {
    live.current = { open, openControlled: openProp !== undefined };
    onOpenChangeRef.current = onOpenChange;
    entry.current.value = value;
  });
  // The change last reported and the state it was reported against: while
  // the parent has not answered, the same change is not reported again,
  // which also covers the `toggle` the write-back below causes.
  const reported = useRef<{ next: boolean; against: boolean } | null>(null);

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
  const adopt = useCallback(
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

  // A passive effect: React 18 warns about a layout effect on the server.
  // Hydration adopts what the DOM holds: a click before hydration opened it
  // with nobody to tell.
  // In a Root, the Root adopts the whole group once its Items have
  // registered, which they do in this commit's effects, before its own.
  const register = group?.register;
  useEffect(() => {
    if (register) return register(entry.current);
    const el = itemRef.current;
    if (el) adopt(el.open);
  }, [adopt, register]);

  const inGroup = group !== null;
  const ignoresOpen = openProp !== undefined;
  const ignoresDefaultOpen = defaultOpenProp !== undefined;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !inGroup) return;
    if (ignoresOpen)
      console.warn(
        "Accordion.Item: `open` is ignored inside an Accordion.Root, which owns the state. Use the Root's `value`."
      );
    if (ignoresDefaultOpen)
      console.warn(
        "Accordion.Item: `defaultOpen` is ignored inside an Accordion.Root, which owns the state. Use the Root's `defaultValue`."
      );
  }, [inGroup, ignoresOpen, ignoresDefaultOpen]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = itemRef.current;
    if (el && el.tagName !== 'DETAILS')
      console.warn(
        `Accordion.Item: it must render a <details>, and it rendered a <${el.tagName.toLowerCase()}>. Check its \`render\` prop.`
      );
  }, []);

  const handleToggle: NonNullable<ItemProps['onToggle']> = (event) => {
    onToggle?.(event);
    if (group) group.adopt();
    else adopt(event.currentTarget.open);
  };

  const context: ItemContextValue = {
    open,
    disabled,
    locked: group !== null && group.alwaysOneOpen && open,
    itemRef,
    requestChange: group
      ? (next) => group.requestChange(value, next)
      : requestChange
  };
  return (
    <ItemContext.Provider value={context}>
      {useRenderPart('details', render, {
        ...rest,
        // The Root's, which is none in multiple mode.
        ...(group ? { name: group.name } : null),
        open,
        // The DOM can hold what the server's HTML did not: a click before
        // hydration.
        suppressHydrationWarning: true,
        onToggle: handleToggle,
        ref: useComposedRefs(itemRef, ref),
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
  /** The group's `name`, in single mode. Two Roots rendered on the server
   * apart both get the same `useId`, so give each its own. */
  name?: string;
  orientation?: 'vertical' | 'horizontal';
}

/** The group of Items. It owns their state: it reads the whole group at
 * each `toggle`, reports what differs from what it last reported, and
 * writes `open` back where a parent declined (ADR 0001, "State and the
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
  const always = single && alwaysOneOpen;

  const live = useRef({
    value,
    controlled: valueProp !== undefined,
    multiple,
    always
  });
  const onValueChangeRef = useRef(onValueChange);
  useInsertionEffect(() => {
    live.current = {
      value,
      controlled: valueProp !== undefined,
      multiple,
      always
    };
    onValueChangeRef.current = onValueChange;
  });
  const entries = useRef(new Set<Entry>());
  // The change last reported and the value it was reported against: while
  // the parent has not answered, the same change is not reported again,
  // which also covers the `toggle`s the write-back below causes.
  const reported = useRef<{ next: string[]; against: string[] } | null>(null);

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

  /** What the DOM should hold: the Items in `value`, in document order,
   * and in single mode the first alone. */
  const expected = useCallback(() => {
    const names = ordered()
      .map((e) => e.value)
      .filter(
        (v): v is string => v !== undefined && live.current.value.includes(v)
      );
    return live.current.multiple ? names : names.slice(0, 1);
  }, [ordered]);

  /** What the DOM holds, in document order. */
  const inDom = useCallback(() => {
    const names = ordered()
      .filter((e) => e.itemRef.current!.open)
      .map((e) => e.value)
      .filter((v): v is string => v !== undefined);
    return live.current.multiple ? names : names.slice(0, 1);
  }, [ordered]);

  /** Writes `open` where the DOM disagrees with what React rendered. The
   * Items to close go first, so a named group never holds two. */
  const writeBack = useCallback(() => {
    const want = expected();
    const items = ordered();
    for (const e of items)
      if (!want.includes(e.value as string) && e.itemRef.current!.open)
        e.itemRef.current!.open = false;
    for (const e of items)
      if (want.includes(e.value as string) && !e.itemRef.current!.open)
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
        const was = before.includes(e.value as string);
        const now = next.includes(e.value as string);
        if (was !== now) e.notify(now);
      }
      settle();
    },
    [expected, ordered, settle]
  );

  /** Reads the whole group, and reports what differs from `value`. A
   * `toggle` and the mount both call it. The suppressed report still
   * reconciles the DOM. */
  const adopt = useCallback(
    (onMount = false) => {
      const opens = inDom();
      const want = expected();
      if (live.current.always && opens.length === 0 && want.length > 0) {
        // Always one open: a close nobody could prevent is not reported.
        if (onMount) writeBack();
        else settle();
        return;
      }
      if (sameValue(opens, want)) return;
      const last = reported.current;
      if (
        last &&
        sameValue(last.next, opens) &&
        sameValue(last.against, want)
      ) {
        settle();
        return;
      }
      report(opens, true);
    },
    [inDom, expected, report, settle, writeBack]
  );

  const requestChange = useCallback(
    (itemValue: string | undefined, open: boolean) => {
      if (itemValue === undefined) return;
      const cur = expected();
      const next = live.current.multiple
        ? ordered()
            .map((e) => e.value)
            .filter(
              (v): v is string =>
                v !== undefined && (v === itemValue ? open : cur.includes(v))
            )
        : open
          ? [itemValue]
          : [];
      report(next, false);
    },
    [expected, ordered, report]
  );

  const register = useCallback((entry: Entry) => {
    entries.current.add(entry);
    return () => {
      entries.current.delete(entry);
    };
  }, []);

  // Mounted after every Item's own effect: hydration adopts what the DOM
  // holds, or under always one open with no Item open, restores `value`.
  useEffect(() => {
    adopt(true);
  }, [adopt]);

  const tooMany = single && value.length > 1;
  const ignoredAlways = multiple && alwaysOneOpen;
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (tooMany)
      console.warn(
        'Accordion.Root: a single Root was given more than one value. Only the first Item in document order stays open. Pass `multiple` to open several.'
      );
  }, [tooMany]);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (ignoredAlways)
      console.warn(
        'Accordion.Root: `alwaysOneOpen` applies to a single Root only, and is ignored with `multiple`.'
      );
  }, [ignoredAlways]);

  // A new object each render, on purpose: every Item reads it, so every
  // Item renders with the Root, and `claimed` below is theirs to share for
  // one render. Items render in document order, so in single mode the
  // first Item whose value is in `value` takes the one open place.
  let claimed: string | undefined;
  const group: GroupContextValue = {
    name: single ? (nameProp ?? generatedName) : undefined,
    disabled,
    alwaysOneOpen: always,
    isOpen(itemValue) {
      if (itemValue === undefined || !value.includes(itemValue)) return false;
      if (multiple) return true;
      claimed ??= itemValue;
      return claimed === itemValue;
    },
    register,
    requestChange,
    adopt
  };

  return (
    <GroupContext.Provider value={group}>
      {useRenderPart('div', render, {
        ...rest,
        'data-orientation': orientation,
        ref,
        children
      })}
    </GroupContext.Provider>
  );
}
