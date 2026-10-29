// The drawer package's tests, run on React 18 against
// @drawerdeck/react-18's build: the same tests, with `react`, `react-dom`
// and the package resolved to React 18 and the built package. Build it
// first. The shared shape is vitest.react-shared.ts; this config differs
// from vitest.react-19.config.ts only in the React root and the excluded
// test names.
import { fileURLToPath, URL } from 'node:url';
import { reactConfig } from './vitest.react-shared.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const react18 = here('./packages/react-18/');

export default reactConfig(react18, [
  // Covered by the sanity check that this run is on React 19 instead.
  'runs on React 19'
]);
