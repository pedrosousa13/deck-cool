// The React version @drawerdeck/react-18's shim reads, and the development
// check it drives: react.ts imports this, instead of parsing `version` on
// its own. Not in the package's `exports` map, so a consumer cannot import
// it; the workspace's own vitest configs alias `@drawerdeck/react-18/react-version`
// to this module's own built file, so a test can read the version this
// build's dist itself saw, not only the version its own `react` import sees.
import { version } from 'react';

export { version };

export const isReact18 = (v: string) => v.startsWith('18.');

const isSupported = (v: string) => isReact18(v) || v.startsWith('19.');

/** Takes a version string, rather than always reading `react`'s own, so a
 * test can call it with one React has never shipped. */
export const warnIfUnsupportedReactVersion = (v: string) => {
  if (isSupported(v)) return;
  console.error(
    `@drawerdeck/react-18 is for React 18 and 19, and this is React ${v}. ` +
      'Use @drawerdeck/react for React 19 alone.'
  );
};
