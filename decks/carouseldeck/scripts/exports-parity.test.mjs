// @carouseldeck/react-18 ships the same entries as @carouseldeck/react, so a
// consumer's subpath import resolves the same way on both (packages/react-18/
// README.md). The one allowed difference is the `react-server` condition:
// React 18 has no server components.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} pkg */
const exportsOf = (pkg) =>
  JSON.parse(
    readFileSync(join(repoRoot, 'packages', pkg, 'package.json'), 'utf8')
  ).exports;

/** An export entry with its `react-server` condition removed.
 * @param {Record<string, string>} entry */
const withoutReactServer = (entry) =>
  Object.fromEntries(
    Object.entries(entry).filter(([condition]) => condition !== 'react-server')
  );

test('react-18 exports the same entries as react, apart from react-server', () => {
  const react = exportsOf('react');
  const react18 = exportsOf('react-18');

  assert.deepEqual(
    [...Object.keys(react18)].sort(),
    [...Object.keys(react)].sort()
  );
  for (const [subpath, entry] of Object.entries(react)) {
    assert.deepEqual(
      withoutReactServer(react18[subpath] ?? {}),
      withoutReactServer(entry),
      `${subpath} differs between react and react-18`
    );
  }
});
