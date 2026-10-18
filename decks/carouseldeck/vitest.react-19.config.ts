// The React package's tests, run on React 19 against @carouseldeck/react-18's
// build: the same tests, with `react` and `react-dom` resolved to the
// workspace's own React 19 (the same copy @carouseldeck/react's own tests use)
// and the package resolved to the built react-18 package. Build it first.
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const root = here('./');
const react18 = here('./packages/react-18/');

export default defineConfig({
  ...base,
  resolve: {
    alias: [
      {
        find: /^react(-dom)?(\/.*)?$/,
        replacement: `${root}node_modules/react$1$2`
      },
      {
        find: /^@carouseldeck\/core$/,
        replacement: here('./packages/core/src/index.ts')
      },
      {
        find: /^@carouseldeck\/react\/([\w-]+)$/,
        replacement: `${react18}dist/$1.js`
      },
      {
        find: /^@carouseldeck\/react\/theme\.css/,
        replacement: here('./packages/react/src/theme.css')
      },
      { find: /^@carouseldeck\/react$/, replacement: `${react18}dist/index.js` }
    ]
  },
  test: {
    ...base.test,
    include: [
      'packages/react/test/**/*.test.{ts,tsx}',
      'packages/react-18/test/**/*.test.{ts,tsx}'
    ],
    // Not the base config's, which leaves this package's tests to this one.
    exclude: ['**/node_modules/**'],
    // Tests of React 19 alone, already covered by `test` against
    // @carouseldeck/react itself: a test component that takes `ref` as a
    // prop (the react-18 build always wraps components in `forwardRef`,
    // version or not) and the server-component entry (`ServerSlidesProvider`).
    // packages/react-18/test covers refs through forwardRef. Also excluded:
    // the sanity check that this run is on React 18, and a consumer's
    // `inert=""` written the way React 18's own quirk needs it, which React
    // 19 does not share (it knows `inert` as a boolean already).
    testNamePattern:
      /^(?!.*(ref is the region element|count the slides a server component counted|server entry reports its count|runs on React 18|as React 18 writes it, stays inert))/
  }
});
