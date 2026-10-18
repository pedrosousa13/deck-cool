// The shape vitest.react-18.config.ts and vitest.react-19.config.ts share:
// the React package's tests, run against @carouseldeck/react-18's build.
// Build it first. Each config differs only in `reactRoot` (where `react` and
// `react-dom` resolve from) and `excluded` (the test names that run only on
// the other version).
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const react18 = here('./packages/react-18/');

export function reactConfig(reactRoot: string, excluded: string[]) {
  return defineConfig({
    ...base,
    resolve: {
      alias: [
        {
          find: /^react(-dom)?(\/.*)?$/,
          replacement: `${reactRoot}node_modules/react$1$2`
        },
        {
          find: /^@carouseldeck\/core$/,
          replacement: here('./packages/core/src/index.ts')
        },
        // Not a public subpath of @carouseldeck/react-18: read directly from
        // the built dist, so a test can prove the React version this
        // build's own import saw, not only the version its own `react`
        // import sees.
        {
          find: /^@carouseldeck\/react-18\/react-version$/,
          replacement: `${react18}dist/react-version.js`
        },
        {
          find: /^@carouseldeck\/react\/([\w-]+)$/,
          replacement: `${react18}dist/$1.js`
        },
        {
          find: /^@carouseldeck\/react\/theme\.css/,
          replacement: here('./packages/react/src/theme.css')
        },
        {
          find: /^@carouseldeck\/react$/,
          replacement: `${react18}dist/index.js`
        }
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
      testNamePattern: new RegExp(`^(?!.*(${excluded.join('|')}))`)
    }
  });
}
