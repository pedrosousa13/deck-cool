// `react/jsx-runtime` for @carouseldeck/react's source, built for React 18:
// the host elements React 18 renders differently, rendered as it does.
import { version } from 'react';
import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs
} from 'react/jsx-runtime';

export { Fragment };

const isReact18 = version.startsWith('18.');

type Props = Record<string, unknown> & { children?: unknown };
type Jsx = typeof reactJsx;

const isStyle = (node: unknown) =>
  typeof node === 'object' &&
  node !== null &&
  (node as { type?: unknown }).type === 'style';

function adapt(create: Jsx): Jsx {
  return (type, config, key) => {
    if (typeof type !== 'string') return create(type, config, key);
    let props = config as Props;
    // React 18 does not know `inert`: it sets a string, and drops a boolean.
    // A consumer's `inert=""`, as React 18 writes it, stays inert. React 19
    // knows it as a boolean already, so this is left alone there.
    if (isReact18 && 'inert' in props) {
      const inert = props.inert === '' || Boolean(props.inert);
      props = { ...props, inert: inert ? '' : undefined };
    }
    // React 18 does not hoist a style into the head, nor know `precedence`:
    // the style renders in place, one per deck. Its server renderer escapes
    // a style's text, which turns the `>` of a selector into `&gt;`: the CSS,
    // carouseldeck's own or an effect's, is set as HTML instead, with any
    // `</style` escaped as CSS, so it cannot end the element.
    if (type === 'style' && 'precedence' in props) {
      const { children, ...rest } = props;
      delete rest.href;
      delete rest.precedence;
      const css = String(children).replace(/<\/style/gi, '<\\/style');
      props = { ...rest, dangerouslySetInnerHTML: { __html: css } };
    }
    // In place in the viewport, a style would count among its slides: it
    // renders just before the viewport instead. Each child keeps its slot,
    // style or not, so a style that comes or goes, as an effect's does, never
    // moves the viewport, which would remount it and lose its scroll.
    if (
      'data-carouseldeck-viewport' in props &&
      Array.isArray(props.children)
    ) {
      const children: unknown[] = props.children;
      const styles = children.map((child) => (isStyle(child) ? child : null));
      const rest = children.map((child) => (isStyle(child) ? null : child));
      return reactJsxs(
        Fragment,
        {
          children: [...styles, reactJsxs(type, { ...props, children: rest })]
        },
        key
      );
    }
    return create(type, props, key);
  };
}

export const jsx = adapt(reactJsx);
export const jsxs = adapt(reactJsxs);
