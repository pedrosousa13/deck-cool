// The React package's tests, run on React 18 against @carouseldeck/react-18's
// build: the same tests, with `react`, `react-dom` and the package resolved
// to React 18 and the built package. Build it first. The shared shape is
// vitest.react-shared.ts; this config differs from vitest.react-19.config.ts
// only in the React root and the excluded test names.
import { fileURLToPath, URL } from 'node:url';
import { reactConfig } from './vitest.react-shared.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const react18 = here('./packages/react-18/');

export default reactConfig(react18, [
  // Tests of React 19 alone: a test component that takes `ref` as a prop,
  // and the server-component entry (`ServerSlidesProvider`), which React 18
  // has no use for. packages/react-18/test covers refs on React 18. Also
  // excluded: the sanity check that this run is on React 19.
  'ref is the region element',
  'count the slides a server component counted',
  'server entry reports its count',
  'runs on React 19'
]);
