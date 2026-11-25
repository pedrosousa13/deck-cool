'use client';

import {
  cloneElement,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
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
 * A part's `render` prop, as drawerdeck's parts take it: a `ReactElement` to
 * clone the part's own props onto, or a function given them to build one.
 * Without it, the part renders its own default tag.
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
 * calls both; every other key in `b` wins. */
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
  // Called unconditionally, whichever branch below uses it (or not).
  const composed = useComposedRefs(ref, elementProps?.ref);
  if (render === undefined)
    return createElement(tag, { ...props, ref: composed });
  if (typeof render === 'function') return render({ ...props, ref: composed });
  return cloneElement(render as ReactElement<Record<string, unknown>>, {
    ...mergeProps(props, elementProps!),
    ref: composed
  });
}

function warn(message: string) {
  console.warn(message);
}

interface ItemContextValue {
  open: boolean;
  disabled: boolean;
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
  /** The Item's name in a Root's `value`. */
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
  value,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  onToggle,
  children,
  ...rest
}: ItemProps) {
  const [state, setState] = useState(defaultOpen);
  const open = openProp ?? state;
  const itemRef = useRef<HTMLDetailsElement | null>(null);
  // What the handlers below read, kept fresh each render: the state a
  // `toggle` is compared with is the one React last rendered.
  const live = useRef({ open, openControlled: openProp !== undefined });
  const onOpenChangeRef = useRef(onOpenChange);
  // An insertion effect runs first in a commit, before any layout effect
  // and ref, and unlike a layout effect React 18 does not warn about it on
  // the server.
  useInsertionEffect(() => {
    live.current = { open, openControlled: openProp !== undefined };
    onOpenChangeRef.current = onOpenChange;
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

  // A passive effect: React 18 warns about a layout effect on the server.
  // Hydration adopts what the DOM holds: a click before hydration opened it
  // with nobody to tell.
  useEffect(() => {
    const el = itemRef.current;
    if (el && el.open !== live.current.open) requestChange(el.open, true);
  }, [requestChange]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const el = itemRef.current;
    if (el && el.tagName !== 'DETAILS')
      warn(
        `Accordion.Item: it must render a <details>, and it rendered a <${el.tagName.toLowerCase()}>. Check its \`render\` prop.`
      );
  }, []);

  const handleToggle: NonNullable<ItemProps['onToggle']> = (event) => {
    onToggle?.(event);
    const next = event.currentTarget.open;
    if (next === live.current.open) return;
    const last = reported.current;
    if (last && last.next === next && last.against === live.current.open)
      return;
    requestChange(next, true);
  };

  const context: ItemContextValue = { open, disabled, itemRef, requestChange };
  return (
    <ItemContext.Provider value={context}>
      {useRenderPart('details', render, {
        ...rest,
        'data-value': value,
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

/** The Item's `<summary>`. A consumer's `onClick` runs first and can cancel
 * the change with `preventDefault()`. */
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
      warn(
        `Accordion.Trigger: it must render a <summary>, and it rendered a <${el.tagName.toLowerCase()}>. Check its \`render\` prop.`
      );
    else if (el.parentElement !== ctx.itemRef.current)
      warn(
        'Accordion.Trigger: its <summary> must be the direct child of the Accordion.Item. A <summary> inside another element is hidden, and the browser shows its default one.'
      );
  }, [ctx.itemRef]);

  return useRenderPart('summary', render, {
    ...rest,
    'aria-expanded': ctx.open,
    'aria-disabled': ctx.disabled ? true : undefined,
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
      if (!ctx.disabled) ctx.requestChange(!ctx.open);
    },
    children:
      level === undefined
        ? children
        : createElement(`h${level}`, null, children)
  });
}

export interface PanelProps extends ComponentProps<'div'> {
  render?: RenderProp;
}

/** The Item's content. Always rendered, closed or not: find-in-page and an
 * open before hydration need it in the DOM. */
export function Panel({ render, ref, ...rest }: PanelProps) {
  return useRenderPart('div', render, { ...rest, ref });
}
