// `react` for @carouseldeck/react's source, built for React 18. The source is
// written for React 19; each export here is React 18's own, or stands in for
// the React 19 API the source uses. A name the source imports and this
// module does not export fails the build.
import {
  createContext as createReactContext,
  useContext,
  useEffect,
  useLayoutEffect as useReactLayoutEffect,
  version,
  type Context
} from 'react';

export {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';

// Left in the build for the consumer's bundler to replace, as in the source.
declare const process: { env: { NODE_ENV?: string } };

if (
  process.env.NODE_ENV !== 'production' &&
  !version.startsWith('18.') &&
  !version.startsWith('19.')
) {
  console.error(
    `@carouseldeck/react-18 is for React 18 and 19, and this is React ${version}. ` +
      'Use @carouseldeck/react for React 19 alone.'
  );
}

/** The real context a shimmed one stands in for, so `use` can read it: a
 * context is its own provider on React 19 (`Provider` is the context
 * itself), but a separate object on React 18, so neither version's own
 * shape is read here. */
const REAL_CONTEXT = Symbol('realContext');

/** A context the source renders as its own provider, as React 19 does:
 * here, its `Provider`, which `use` reads the context through. On React 19
 * that already is the context; on React 18 a separate object. */
export const createContext = <T>(value: T) => {
  const context = createReactContext(value);
  (context.Provider as unknown as Record<symbol, Context<T>>)[REAL_CONTEXT] =
    context;
  return context.Provider as unknown as Context<T>;
};

/** React 18 has no `use`; the source reads contexts with it, and nothing
 * else. */
export const use = <T>(context: Context<T>): T =>
  useContext((context as unknown as Record<symbol, Context<T>>)[REAL_CONTEXT]);

/** React 18 warns about a layout effect on the server; React 19 does not. */
export const useLayoutEffect =
  typeof window === 'undefined' ? useEffect : useReactLayoutEffect;
