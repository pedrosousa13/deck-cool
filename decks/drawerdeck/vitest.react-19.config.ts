// The drawer package's tests, run on React 19 against
// @drawerdeck/react-18's build: the same tests, with `react` and
// `react-dom` resolved to the workspace's own React 19 (the same copy
// @drawerdeck/react's own tests use) and the package resolved to the built
// react-18 package. Build it first. The shared shape is
// vitest.react-shared.ts; this config differs from vitest.react-18.config.ts
// only in the React root and the excluded test names.
import { fileURLToPath, URL } from 'node:url';
import { reactConfig } from './vitest.react-shared.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const root = here('./');

export default reactConfig(root, [
  // Covered by the sanity check that this run is on React 18 instead.
  'runs on React 18'
]);
