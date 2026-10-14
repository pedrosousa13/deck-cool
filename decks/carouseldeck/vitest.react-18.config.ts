// The React package's tests, run on React 18 against @carouseldeck/react-18's
// build: the same tests, with `react`, `react-dom` and the package resolved
// to React 18 and the built package. Build it first.
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const react18 = here('./packages/react-18/');

export default defineConfig({
  ...base,
  resolve: {
    alias: [
      {
        find: /^react(-dom)?(\/.*)?$/,
        replacement: `${react18}node_modules/react$1$2`
      },
      {
        find: /^@carouseldeck\/core$/,
        replacement: here('./packages/core/src/index.ts')
      },
      {
        find: /^@carouseldeck\/react\/(fade|curve)$/,
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
    // Two tests of React 19 alone: a test component that takes `ref` as a
    // prop, and the server-component entry, which React 18 has no use for.
    // packages/react-18/test covers refs on React 18.
    testNamePattern:
      /^(?!.*(ref is the region element|count the slides a server component counted))/
  }
});
