import { forwardRef, type FunctionComponent, type ReactNode } from 'react';

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
    render(ref === null ? props : { ...props, ref })
  );
  component.displayName = name;
  return component as unknown as FunctionComponent;
}
