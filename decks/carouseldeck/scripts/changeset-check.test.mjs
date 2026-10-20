import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import {
  addedChangesets,
  changedPackages,
  missingChangesets,
  namedPackages,
  packagesNeedingChangesets,
  skipsRelease
} from './changeset-check.mjs';

const deckRoot = fileURLToPath(new URL('..', import.meta.url));

const PACKAGES = [
  {
    name: '@carouseldeck/core',
    prefixes: [
      'decks/carouseldeck/packages/core/package.json',
      'decks/carouseldeck/packages/core/src/'
    ]
  },
  {
    name: '@carouseldeck/react',
    prefixes: [
      'decks/carouseldeck/packages/react/package.json',
      'decks/carouseldeck/packages/react/src/'
    ]
  },
  {
    name: '@carouseldeck/react-18',
    prefixes: [
      'decks/carouseldeck/packages/react-18/package.json',
      'decks/carouseldeck/packages/react-18/src/',
      // react-18 builds react's source unchanged (AGENTS.md, "React 18").
      'decks/carouseldeck/packages/react/src/'
    ]
  }
];

test('a change under a package’s src/ is a consumer-visible change', () => {
  assert.deepEqual(
    changedPackages(
      ['decks/carouseldeck/packages/core/src/index.ts'],
      PACKAGES
    ),
    new Set(['@carouseldeck/core'])
  );
});

test('a change to a package’s package.json is a consumer-visible change', () => {
  assert.deepEqual(
    changedPackages(
      ['decks/carouseldeck/packages/react/package.json'],
      PACKAGES
    ),
    new Set(['@carouseldeck/react'])
  );
});

test('a change under a package’s test/ is not a consumer-visible change', () => {
  assert.deepEqual(
    changedPackages(
      ['decks/carouseldeck/packages/react/test/fade.test.tsx'],
      PACKAGES
    ),
    new Set()
  );
});

test('a change outside the packages is not a consumer-visible change', () => {
  assert.deepEqual(
    changedPackages(
      [
        'decks/carouseldeck/docs/adr/0001-x.md',
        'decks/carouseldeck/scripts/verify.mjs',
        'sites/deck-cool/src/index.ts'
      ],
      PACKAGES
    ),
    new Set()
  );
});

test('several changed packages are all reported', () => {
  assert.deepEqual(
    changedPackages(
      [
        'decks/carouseldeck/packages/core/src/index.ts',
        'decks/carouseldeck/packages/react-18/src/index.tsx'
      ],
      PACKAGES
    ),
    new Set(['@carouseldeck/core', '@carouseldeck/react-18'])
  );
});

test('a change under react’s src/ is a consumer-visible change to react-18 too', () => {
  assert.deepEqual(
    changedPackages(
      ['decks/carouseldeck/packages/react/src/index.tsx'],
      PACKAGES
    ),
    new Set(['@carouseldeck/react', '@carouseldeck/react-18'])
  );
});

// namedPackages: Changesets frontmatter is YAML, so a key is quoted, either
// way, never bare (an unquoted `@scope/pkg:` is invalid YAML).

test('a double-quoted key in a changeset’s frontmatter is named', () => {
  assert.deepEqual(
    namedPackages(['---\n"@carouseldeck/react": minor\n---\n\nSummary.\n']),
    new Set(['@carouseldeck/react'])
  );
});

test('a single-quoted key in a changeset’s frontmatter is named', () => {
  assert.deepEqual(
    namedPackages(["---\n'@carouseldeck/react': minor\n---\n\nSummary.\n"]),
    new Set(['@carouseldeck/react'])
  );
});

test('a changeset names every package in its frontmatter', () => {
  assert.deepEqual(
    namedPackages([
      '---\n"@carouseldeck/react": minor\n\'@carouseldeck/react-18\': minor\n---\n\nSummary.\n'
    ]),
    new Set(['@carouseldeck/react', '@carouseldeck/react-18'])
  );
});

test('names from several changesets are all reported', () => {
  assert.deepEqual(
    namedPackages([
      '---\n"@carouseldeck/core": patch\n---\n\nOne.\n',
      '---\n"@carouseldeck/react": minor\n---\n\nTwo.\n'
    ]),
    new Set(['@carouseldeck/core', '@carouseldeck/react'])
  );
});

test('no changesets names no package', () => {
  assert.deepEqual(namedPackages([]), new Set());
});

test('a changed package with no changeset naming it is missing', () => {
  assert.deepEqual(
    missingChangesets({
      paths: ['decks/carouseldeck/packages/core/src/index.ts'],
      packages: PACKAGES,
      changesetContents: []
    }),
    ['@carouseldeck/core']
  );
});

test('a changed package named in a changeset is not missing', () => {
  assert.deepEqual(
    missingChangesets({
      paths: ['decks/carouseldeck/packages/core/src/index.ts'],
      packages: PACKAGES,
      changesetContents: ['---\n"@carouseldeck/core": patch\n---\n\nFix.\n']
    }),
    []
  );
});

test('a changeset naming a different package does not cover the one that changed', () => {
  assert.deepEqual(
    missingChangesets({
      paths: ['decks/carouseldeck/packages/core/src/index.ts'],
      packages: PACKAGES,
      changesetContents: [
        '---\n"@carouseldeck/react": patch\n---\n\nUnrelated.\n'
      ]
    }),
    ['@carouseldeck/core']
  );
});

test('a test-only or docs-only change needs no changeset', () => {
  assert.deepEqual(
    missingChangesets({
      paths: [
        'decks/carouseldeck/packages/react/test/fade.test.tsx',
        'decks/carouseldeck/docs/adr/0001-x.md'
      ],
      packages: PACKAGES,
      changesetContents: []
    }),
    []
  );
});

test('a react change named for react alone still misses react-18', () => {
  assert.deepEqual(
    missingChangesets({
      paths: ['decks/carouseldeck/packages/react/src/index.tsx'],
      packages: PACKAGES,
      changesetContents: ['---\n"@carouseldeck/react": patch\n---\n\nFix.\n']
    }),
    ['@carouseldeck/react-18']
  );
});

test('a react change named for both react and react-18 is covered', () => {
  assert.deepEqual(
    missingChangesets({
      paths: ['decks/carouseldeck/packages/react/src/index.tsx'],
      packages: PACKAGES,
      changesetContents: [
        '---\n"@carouseldeck/react": patch\n"@carouseldeck/react-18": patch\n---\n\nFix.\n'
      ]
    }),
    []
  );
});

// packagesNeedingChangesets: the real repo.

test('the real deck lists core, react and react-18, and leaves docs out', () => {
  const names = packagesNeedingChangesets(deckRoot)
    .map((pkg) => pkg.name)
    .sort();
  assert.deepEqual(names, [
    '@carouseldeck/core',
    '@carouseldeck/react',
    '@carouseldeck/react-18'
  ]);
});

test('each package’s prefixes are rooted under its own dir', () => {
  for (const pkg of packagesNeedingChangesets(deckRoot)) {
    assert.ok(pkg.prefixes.length > 0, `${pkg.name} has no prefixes`);
    for (const prefix of pkg.prefixes) {
      assert.ok(
        prefix.startsWith('decks/carouseldeck/packages/'),
        `${pkg.name} has an unexpected prefix: ${prefix}`
      );
    }
  }
});

test('a README-only change trips its package, npm ships it regardless of `files`', () => {
  const packages = packagesNeedingChangesets(deckRoot);
  assert.deepEqual(
    changedPackages(['decks/carouseldeck/packages/core/README.md'], packages),
    new Set(['@carouseldeck/core'])
  );
});

test('a LICENSE-only change trips its package', () => {
  const packages = packagesNeedingChangesets(deckRoot);
  assert.deepEqual(
    changedPackages(['decks/carouseldeck/packages/react/LICENSE'], packages),
    new Set(['@carouseldeck/react'])
  );
});

test('a change under react’s src/ trips react-18 too, in the real repo', () => {
  const packages = packagesNeedingChangesets(deckRoot);
  assert.deepEqual(
    changedPackages(
      ['decks/carouseldeck/packages/react/src/index.tsx'],
      packages
    ),
    new Set(['@carouseldeck/react', '@carouseldeck/react-18'])
  );
});

// skipsRelease: a release diff names no package either way it lands
// (AGENTS.md, "Releasing").

test('skipsRelease is true on main and changeset-release/main', () => {
  assert.equal(skipsRelease('refs/heads/main'), true);
  assert.equal(skipsRelease('refs/heads/changeset-release/main'), true);
});

test('skipsRelease is false on a feature branch or with no ref', () => {
  assert.equal(skipsRelease('refs/heads/pedrosousa13/issue-203-x'), false);
  assert.equal(skipsRelease(undefined), false);
});

// addedChangesets: a changeset is "added since base" if it is among the
// changed paths, under .changeset/, ends .md, and exists on disk now.

test('a changed changeset that still exists is added', () => {
  assert.deepEqual(
    addedChangesets(['.changeset/quick-fox.md'], () => true),
    ['.changeset/quick-fox.md']
  );
});

test('a deleted changeset does not count as added', () => {
  assert.deepEqual(
    addedChangesets(['.changeset/quick-fox.md'], () => false),
    []
  );
});

test('a non-.changeset path is not a changeset', () => {
  assert.deepEqual(
    addedChangesets(
      ['decks/carouseldeck/packages/core/src/index.ts'],
      () => true
    ),
    []
  );
});

test('a non-.md file under .changeset is not a changeset', () => {
  assert.deepEqual(
    addedChangesets(['.changeset/config.json'], () => true),
    []
  );
});

test('.changeset’s own README.md is never a changeset', () => {
  assert.deepEqual(
    addedChangesets(['.changeset/README.md'], () => true),
    []
  );
});
