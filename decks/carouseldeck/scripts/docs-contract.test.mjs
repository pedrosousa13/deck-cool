import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { docsFaults } from './docs-contract.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} title */
const page = (title, body = '') =>
  `---\ntitle: ${title}\ndescription: About ${title}.\n---\n\n${body}\n`;

/**
 * A docs package in a temporary directory: a valid one, with `edits` applied.
 * @param {Record<string, string>} [edits]
 */
const docsPackage = (edits = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-contract-'));
  const files = {
    'package.json': '{ "name": "@example/docs", "version": "1.0.0" }',
    'README.md': '# @example/docs\n\n<b>Not a page.</b>\n',
    'CHANGELOG.md': '# @example/docs\n',
    'nav.json': JSON.stringify([
      { label: 'Start', pages: ['index.md', 'guides/layout.md'] }
    ]),
    'index.md': page('Example', 'Read [the layout](./guides/layout.md#grid).'),
    'guides/layout.md': page(
      'Layout',
      '![Grid](../assets/grid.svg)\n\n<!-- demo:counter -->\n\nBack [home][home].\n\n[home]: ../index.md'
    ),
    'assets/grid.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'assets/notes.md': 'Not a page.',
    ...edits
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
};

/** @param {string} root */
const messages = (root) =>
  docsFaults(root, { demos: new Set(['counter']) }).map(
    ({ file, line, message }) => `${file}:${line} ${message}`
  );

test('a package that follows the contract has no faults', () => {
  assert.deepEqual(messages(docsPackage()), []);
});

test('every page needs a title and a description', () => {
  const root = docsPackage({
    'index.md': '---\ntitle: Example\n---\n\nHello.\n',
    'guides/layout.md': '# Layout\n\nNo frontmatter.\n'
  });
  assert.deepEqual(messages(root), [
    'guides/layout.md:1 has no "title" in its frontmatter',
    'guides/layout.md:1 has no "description" in its frontmatter',
    'index.md:1 has no "description" in its frontmatter'
  ]);
});

test('nav.json lists every page once, and only pages', () => {
  const root = docsPackage({
    'nav.json': JSON.stringify([
      { label: 'Start', pages: ['index.md', 'index.md', 'gone.md'] }
    ])
  });
  assert.deepEqual(messages(root), [
    'guides/layout.md:1 is not listed in nav.json',
    'nav.json:1 lists "index.md" a second time',
    'nav.json:1 lists "gone.md", which is not a page'
  ]);
  assert.deepEqual(messages(docsPackage({ 'nav.json': '{}' })), [
    'nav.json:1 is not a list of groups, each with a label and pages'
  ]);
});

test('a relative link names a .md page that exists, and an image a file under assets/', () => {
  const root = docsPackage({
    'index.md': page(
      'Example',
      [
        '[Gone](./gone.md), [a file](./guides/layout), [site](/docs/), [npm](https://npmjs.com)',
        '',
        '![Missing](./assets/missing.png)',
        '',
        '[Bad](javascript:alert(1)) and [no scheme](//example.com/)',
        '',
        '[Ref][r] and [again][r]',
        '',
        '[r]: ./guides/layout.md',
        '[r]: ./index.md'
      ].join('\n')
    )
  });
  assert.deepEqual(messages(root), [
    'index.md:6 links to "./gone.md", which is not a page in this package',
    'index.md:6 links to "./guides/layout", which is not a .md page',
    'index.md:8 shows "./assets/missing.png", which is not a file under assets/',
    'index.md:10 links to "javascript:alert(1)", a scheme the site does not allow',
    'index.md:10 links to "//example.com/", which names no scheme',
    'index.md:15 defines [r] a second time'
  ]);
});

test('a demo marker is alone on its line and names a registered demo, and is the only HTML', () => {
  const root = docsPackage({
    'index.md': page(
      'Example',
      [
        'Inline <!-- demo:counter --> marker.',
        '',
        '<!-- demo:unknown -->',
        '',
        '<!-- a note -->',
        '',
        '<div>Hi</div>'
      ].join('\n')
    )
  });
  assert.deepEqual(messages(root), [
    'index.md:6 has a demo marker that is not on a line of its own',
    'index.md:8 marks demo "unknown", which the site does not register',
    'index.md:10 has raw HTML, <!-- a note -->',
    'index.md:12 has raw HTML, <div>Hi</div>'
  ]);
});

test('a link or image whose path the loader cannot rewrite as written is a fault', () => {
  const root = docsPackage({
    'assets/a_b.png': '',
    'index.md': page(
      'Example',
      ['![grid](assets/a\\_b.png)', '', '[Layout](./guides/layout\\.md)'].join(
        '\n'
      )
    )
  });
  assert.deepEqual(messages(root), [
    'index.md:6 shows "assets/a_b.png" in a form the loader cannot rewrite',
    'index.md:8 links to "./guides/layout.md" in a form the loader cannot rewrite'
  ]);
});

test('two files cannot share a route', () => {
  const root = docsPackage({
    'guides.md': page('Guides'),
    'guides/index.md': page('Guides'),
    'nav.json': JSON.stringify([
      {
        label: 'Start',
        pages: ['index.md', 'guides.md', 'guides/index.md', 'guides/layout.md']
      }
    ])
  });
  assert.deepEqual(messages(root), [
    'guides/index.md:1 has the route /docs/guides/, as guides.md does'
  ]);
});

// The demos a page may mark. carouseldeck's site, sites/carouseldeck,
// registers each one (sites/carouseldeck/src/demos.ts). Agree a new one with
// the site before a release uses it.
const SITE_DEMOS = [
  'autoplay',
  'centred-ends',
  'controlled',
  'curve',
  'curve-size',
  'custom-controls',
  'drag',
  'fade',
  'focal-slide',
  'hooks',
  'layout',
  'loop',
  'middle-by-progress',
  'middle-centred',
  'pages',
  'pages-breakpoints',
  'pages-prop',
  'per-breakpoint',
  'primitives',
  'progress',
  'quickstart',
  'right-to-left',
  'theme',
  'vertical',
  'viewport-bleed'
];

test('@carouseldeck/docs follows the contract, with the demos the site registers', () => {
  const demos = new Set(SITE_DEMOS.map((name) => `example-${name}`));
  assert.deepEqual(docsFaults(join(repoRoot, 'packages/docs'), { demos }), []);
});
