import { forwardRef, type FunctionComponent, type ReactNode } from 'react';

const REACT_ELEMENT = Symbol.for('react.element');

/** A `render` element's own `ref`, React 18's own field (`props` never has
 * one), or `undefined` when `element` is not an element, or has none. */
function elementRef(element: unknown): unknown {
  if (
    typeof element !== 'object' ||
    element === null ||
    (element as { $$typeof?: symbol }).$$typeof !== REACT_ELEMENT
  )
    return undefined;
  return (element as { ref?: unknown }).ref;
}

/** The source reads a `render` element's own ref off its `props`
 * (`render.props.ref`), where React 19 keeps it. React 18 keeps it on the
 * element's own `ref` field instead, off `props`, so copy it in before the
 * source ever reads `props.render`: a shallow copy of the element, with a
 * shallow copy of its `props` that now includes the ref. The copy's `ref` is
 * non-enumerable, so `render.props.ref` still reads it, but the source's
 * `cloneElement` (which copies `element.props` into the new element, and
 * treats only its own `config.ref` as reserved) never copies it into the
 * cloned element's props, where React DOM would render it as a plain
 * attribute. */
function withRenderRef(props: object): object {
  const element = (props as { render?: unknown }).render;
  const ref = elementRef(element);
  if (ref == null) return props;
  const elementProps = { ...(element as { props: object }).props };
  Object.defineProperty(elementProps, 'ref', {
    value: ref,
    enumerable: false,
    configurable: true
  });
  return {
    ...props,
    render: { ...(element as object), props: elementProps }
  };
}

/** A primitive of the source, which takes `ref` as a prop, as React 19
 * passes it. React 18 keeps `ref` out of a function component's props, so
 * forwardRef passes it back in, and only when there is one: a primitive
 * that sets its own `ref` before spreading its props keeps it. Called as a
 * function, the primitive's hooks are the forwardRef render's own. */
export function withRef(
  render: (props: object) => ReactNode,
  name: string
): FunctionComponent {
  const component = forwardRef<unknown, object>((props, ref) =>
    render(withRenderRef(ref === null ? props : { ...props, ref }))
  );
  component.displayName = name;
  return component as unknown as FunctionComponent;
}
