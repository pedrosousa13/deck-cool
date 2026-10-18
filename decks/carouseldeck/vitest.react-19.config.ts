// The React package's tests, run on React 19 against @carouseldeck/react-18's
// build: the same tests, with `react` and `react-dom` resolved to the
// workspace's own React 19 (the same copy @carouseldeck/react's own tests use)
// and the package resolved to the built react-18 package. Build it first.
// The shared shape is vitest.react-shared.ts; this config differs from
// vitest.react-18.config.ts only in the React root and the excluded test
// names.
import { fileURLToPath, URL } from 'node:url';
import { reactConfig } from './vitest.react-shared.js';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const root = here('./');

export default reactConfig(root, [
  // Tests of React 19 alone, already covered by `test` against
  // @carouseldeck/react itself: the server-component entry
  // (`ServerSlidesProvider`). Also excluded: the sanity check that this run
  // is on React 18, and a consumer's `inert=""` written the way React 18's
  // own quirk needs it, which React 19 does not share (it knows `inert` as a
  // boolean already).
  'count the slides a server component counted',
  'server entry reports its count',
  'runs on React 18',
  'as React 18 writes it, stays inert'
]);
