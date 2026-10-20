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

test('two hyphens used as a dash in prose is a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\nThe bled viewport -- wider than the column -- is odd.\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 5, message: 'uses -- as a dash' }
  ]);
});

test('a CSS custom property, a CLI flag and a table rule are not faults', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      'Set `--deck-viewport-step` and `var(--x, 0)`, then run ' +
      '`verify --only test`.\n\n' +
      '| A | B |\n' +
      '|---|---|\n' +
      '| 1 | 2 |\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test('a dash only inside an inline code span is not a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\nRun `git checkout -- file` to restore it.\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test('a BEM-like class name in a code span is not a fault', () => {
  const root = docsPackage({
    'index.md': '---\ntitle: Example\n---\n\nAdd the `card--featured` class.\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test('a double hyphen with no space between two words is a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      'The bled viewport is wider--than the column.\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 5, message: 'uses -- as a dash' }
  ]);
});

test('a dash ending a prose line, the sentence continuing on the next, is a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      'The corrected read overwrites it with the true one --\n' +
      'both within the same task, so neither paints.\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 5, message: 'uses -- as a dash' }
  ]);
});

test('a dash opening a prose line, continued from the one before, is a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      'The corrected read overwrites it with the true one\n' +
      '-- both within the same task, so neither paints.\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 6, message: 'uses -- as a dash' }
  ]);
});

test('a horizontal rule and a list marker are not faults', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      'Section one.\n\n---\n\n- item one\n- item two\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test("a shell sample's end-of-options marker is not a fault", () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      '```sh\ngit checkout -- file\npnpm exec prettier -- file\n```\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test('a code comment using -- as a dash is a fault, since it reads as page text', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      '```js\n// this gap -- the margin -- comes from the step\nconst x = 1;\n```\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 6, message: 'uses -- as a dash' }
  ]);
});

test('a CSS id selector and a universal selector are not faults', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      '```css\n#nav -- unused {\n  color: red;\n}\n\n* -- reset {\n  margin: 0;\n}\n```\n'
  });
  assert.deepEqual(emDashFaults(root), []);
});

test('a dash inside a multi-line block comment is a fault', () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      '```css\n/* this gap\n   wider than the margin -- the step\n   comes from it */\n.x {\n  color: red;\n}\n```\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 7, message: 'uses -- as a dash' }
  ]);
});

test("a shell comment's -- is a fault only in a shell-like fence", () => {
  const root = docsPackage({
    'index.md':
      '---\ntitle: Example\n---\n\n' +
      '```sh\n# this step -- the margin -- comes first\npnpm build\n```\n'
  });
  assert.deepEqual(emDashFaults(root), [
    { file: 'index.md', line: 6, message: 'uses -- as a dash' }
  ]);
});

test('@carouseldeck/docs has no em dash', () => {
  assert.deepEqual(emDashFaults(join(repoRoot, 'packages/docs')), []);
});

test("carouseldeck's ADRs have no em dash", () => {
  assert.deepEqual(emDashFaults(join(repoRoot, 'docs/adr')), []);
});

test("the scroll-snap prototype's findings have no em dash", () => {
  assert.deepEqual(emDashFaults(join(repoRoot, 'prototypes/scroll-snap')), []);
});

test("the viewport-bleed prototype's findings have no em dash", () => {
  assert.deepEqual(
    emDashFaults(join(repoRoot, 'prototypes/viewport-bleed')),
    []
  );
});
