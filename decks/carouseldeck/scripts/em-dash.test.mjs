import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { emDashFaults } from './em-dash.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * A docs package in a temporary directory, with `edits` applied over a
 * single page with no em dash.
 * @param {Record<string, string>} [edits]
 */
const docsPackage = (edits = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'em-dash-'));
  const files = {
    'index.md': '---\ntitle: Example\n---\n\nHello.\n',
    ...edits
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
};

test('a page with no em dash has no faults', () => {
  assert.deepEqual(emDashFaults(docsPackage()), []);
});

test('an em dash, or the &mdash; entity, is a fault, in a code sample too', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\nOne — two.\n\n```\na &mdash; b\n```\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 5, message: 'has an em dash' },
    { file: 'index.md', line: 8, message: 'has an em dash' }
  ]);
});

test('@carouseldeck/docs has no em dash', () => {
  assert.deepEqual(emDashFaults(join(repoRoot, 'packages/docs')), []);
});
