import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { CI_JOBS, ciJobs, gatesFor, plan, STEPS } from './verify.mjs';

const steps = (/** @type {string[]} */ argv) =>
  plan(argv).map(({ step }) => step);

const read = (/** @type {string} */ path) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');

test('with no arguments, every step runs, in order, with no arguments', () => {
  assert.deepEqual(
    plan([]),
    STEPS.map((step) => ({ step, args: [] }))
  );
});

test('--only runs the steps named, in the list order, not the order given', () => {
  assert.deepEqual(steps(['--only', 'lint,format:check']), [
    'format:check',
    'lint'
  ]);
  assert.deepEqual(steps(['--only=build,docs:check']), ['build', 'docs:check']);
});

test('--only refuses a step not in the list, and names it', () => {
  assert.throws(() => plan(['--only', 'lint,tset']), /unknown step `tset`/);
  assert.throws(() => plan(['--only', '']), /--only needs/);
  assert.throws(() => plan(['--only']), /--only needs/);
});

test('--project goes to test:e2e alone', () => {
  assert.deepEqual(plan(['--only', 'lint,test:e2e', '--project=webkit']), [
    { step: 'lint', args: [] },
    { step: 'test:e2e', args: ['--project=webkit'] }
  ]);
  assert.deepEqual(plan(['--project', 'firefox', '--only', 'test:e2e']), [
    { step: 'test:e2e', args: ['--project=firefox'] }
  ]);
});

test('--project with no test:e2e to take it is refused', () => {
  assert.throws(
    () => plan(['--only', 'lint', '--project=chromium']),
    /--project needs test:e2e/
  );
});

test('--shard goes to the vitest steps alone', () => {
  assert.deepEqual(
    plan(['--only', 'lint,test,test:react-18,test:react-19', '--shard=2/4']),
    [
      { step: 'lint', args: [] },
      { step: 'test', args: ['--shard=2/4'] },
      { step: 'test:react-18', args: ['--shard=2/4'] },
      { step: 'test:react-19', args: ['--shard=2/4'] }
    ]
  );
  assert.deepEqual(plan(['--job', 'unit-react-18', '--shard=3/4']), [
    { step: 'test:react-18', args: ['--shard=3/4'] }
  ]);
  assert.deepEqual(plan(['--job', 'unit-react-19', '--shard=3/4']), [
    { step: 'test:react-19', args: ['--shard=3/4'] }
  ]);
  assert.throws(
    () => plan(['--only', 'lint', '--shard=1/4']),
    /--shard needs test/
  );
  // A change that needs no vitest runs nothing, rather than fail on --shard.
  assert.deepEqual(
    plan(['--job', 'unit', '--shard=1/4', '--changed'], () => ['README.md']),
    []
  );
});

test('an unknown argument is refused', () => {
  assert.throws(() => plan(['--onyl', 'lint']), /unknown argument `--onyl`/);
});

test('--job runs that CI job’s steps', () => {
  assert.deepEqual(steps(['--job', 'next']), ['test:next']);
  assert.deepEqual(steps(['--job=e2e', '--project=webkit']), ['test:e2e']);
  assert.throws(() => plan(['--job', 'nope']), /unknown CI job `nope`/);
  assert.throws(
    () => plan(['--job', 'unit', '--only', 'lint']),
    /--job and --only/
  );
});

// Path-to-gate mapping: which gates a change to these paths needs.

const gateNames = (/** @type {string[]} */ paths) =>
  gatesFor(paths).map(({ step }) => step);

test('a change to a deck package needs every gate', () => {
  for (const path of [
    'decks/carouseldeck/packages/react/src/index.tsx',
    'decks/carouseldeck/packages/react/README.md'
  ]) {
    assert.deepEqual(
      gatesFor([path]),
      STEPS.map((step) => ({ step, args: [] })),
      path
    );
  }
});

test('a root lockfile, package.json, workspace file or ci.yml change needs every gate', () => {
  for (const path of [
    'pnpm-lock.yaml',
    'package.json',
    'pnpm-workspace.yaml',
    '.github/workflows/ci.yml'
  ]) {
    assert.deepEqual(
      gatesFor([path]),
      STEPS.map((step) => ({ step, args: [] })),
      path
    );
  }
});

test('a change only under sites/ or packages/ needs no deck gate', () => {
  for (const path of [
    'sites/deck-cool/src/index.ts',
    'packages/brand/styles/brand.css',
    '.changeset/quick-fox.md',
    'README.md'
  ]) {
    assert.deepEqual(gatesFor([path]), [], path);
  }
});

test('a path inside the deck no rule matches needs every gate', () => {
  for (const path of [
    'decks/carouseldeck/tests/compare/features.mjs',
    'decks/carouseldeck/prototypes/x/y.ts',
    'decks/carouseldeck/tsconfig.base.json',
    'decks/carouseldeck/playwright.config.ts'
  ]) {
    assert.deepEqual(gateNames([path]), STEPS, path);
  }
});

test('a change to storybook or its spec needs the build and the deck spec', () => {
  for (const path of [
    'decks/carouseldeck/apps/storybook/stories/deck.stories.tsx',
    'decks/carouseldeck/e2e/deck.spec.ts'
  ]) {
    assert.deepEqual(
      gatesFor([path]),
      [
        { step: 'format:check', args: [] },
        { step: 'lint', args: [] },
        { step: 'typecheck', args: [] },
        { step: 'build', args: [] },
        { step: 'test:e2e', args: [] }
      ],
      path
    );
  }
});

test('a change to a deck script needs the checks and the scripts’ tests', () => {
  for (const path of [
    'decks/carouseldeck/scripts/verify.mjs',
    'decks/carouseldeck/scripts/tag-releases.test.mjs'
  ]) {
    assert.deepEqual(
      gateNames([path]),
      ['format:check', 'lint', 'typecheck', 'test:scripts'],
      path
    );
  }
});

test('a change to a script a gate runs needs every gate', () => {
  for (const path of [
    'decks/carouseldeck/scripts/verify-packaging.mjs',
    'decks/carouseldeck/scripts/workspace-packages.mjs'
  ]) {
    assert.deepEqual(gateNames([path]), STEPS, path);
  }
});

test('every script a gate runs is one that needs every gate', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const step of STEPS) {
    for (const [file] of String(scripts[step]).matchAll(
      /scripts\/[\w.-]+\.mjs/g
    )) {
      assert.deepEqual(
        gateNames([`decks/carouseldeck/${file}`]),
        STEPS,
        `${step} runs ${file}`
      );
    }
  }
});

test('markdown and docs in the deck need format:check alone', () => {
  for (const path of [
    'decks/carouseldeck/README.md',
    'decks/carouseldeck/AGENTS.md',
    'decks/carouseldeck/docs/adr/0001-native-scroll-snap-is-the-engine.md'
  ]) {
    assert.deepEqual(gateNames([path]), ['format:check'], path);
  }
});

test('several paths need the union of their gates, in list order', () => {
  assert.deepEqual(
    gatesFor([
      'decks/carouseldeck/README.md',
      'decks/carouseldeck/scripts/verify.mjs',
      'decks/carouseldeck/apps/storybook/x.tsx'
    ]),
    [
      { step: 'format:check', args: [] },
      { step: 'lint', args: [] },
      { step: 'typecheck', args: [] },
      { step: 'test:scripts', args: [] },
      { step: 'build', args: [] },
      { step: 'test:e2e', args: [] }
    ]
  );
  assert.deepEqual(
    gatesFor([
      'decks/carouseldeck/apps/storybook/b.ts',
      'decks/carouseldeck/packages/core/src/a.ts'
    ]),
    STEPS.map((step) => ({ step, args: [] }))
  );
});

test('no changed paths need no gate', () => {
  assert.deepEqual(gatesFor([]), []);
});

// --changed: the gates the paths changed since a ref need.

test('--changed runs the gates the changed paths need', () => {
  /** @type {string[]} */
  const refs = [];
  const changed = (/** @type {string} */ ref) => {
    refs.push(ref);
    return [
      'decks/carouseldeck/README.md',
      'decks/carouseldeck/scripts/verify.mjs'
    ];
  };
  assert.deepEqual(
    plan(['--changed'], changed).map(({ step }) => step),
    ['format:check', 'lint', 'typecheck', 'test:scripts']
  );
  plan(['--changed=HEAD^1'], changed);
  assert.deepEqual(refs, ['main', 'HEAD^1']);
});

test('--changed with --only or --job runs what both ask for', () => {
  const changed = () => [
    'decks/carouseldeck/apps/storybook/stories/deck.stories.tsx'
  ];
  assert.deepEqual(
    plan(['--job', 'e2e', '--project=firefox', '--changed'], changed),
    [{ step: 'test:e2e', args: ['--project=firefox'] }]
  );
  assert.deepEqual(
    plan(['--only', 'lint,test', '--changed'], changed).map(({ step }) => step),
    ['lint']
  );
  // A job the change needs nothing of runs nothing, rather than fail on
  // --project.
  assert.deepEqual(
    plan(['--job', 'e2e', '--project=firefox', '--changed'], () => [
      'decks/carouseldeck/README.md'
    ]),
    []
  );
});

test('ciJobs says which CI jobs have a step to run', () => {
  assert.deepEqual(ciJobs(plan([])), {
    checks: true,
    unit: true,
    'unit-react-18': true,
    'unit-react-19': true,
    packages: true,
    next: true,
    e2e: true
  });
  assert.deepEqual(ciJobs(gatesFor(['decks/carouseldeck/README.md'])), {
    checks: true,
    unit: false,
    'unit-react-18': false,
    'unit-react-19': false,
    packages: false,
    next: false,
    e2e: false
  });
  assert.deepEqual(ciJobs(gatesFor(['decks/carouseldeck/e2e/deck.spec.ts'])), {
    checks: true,
    unit: false,
    'unit-react-18': false,
    'unit-react-19': false,
    packages: false,
    next: false,
    e2e: true
  });
  // A deck-only change needs every deck gate.
  assert.deepEqual(
    ciJobs(gatesFor(['decks/carouseldeck/packages/react/src/index.tsx'])),
    {
      checks: true,
      unit: true,
      'unit-react-18': true,
      'unit-react-19': true,
      packages: true,
      next: true,
      e2e: true
    }
  );
  // A change only under sites/ needs no deck gate: every gate job is skipped,
  // and `verify` passes.
  assert.deepEqual(ciJobs(gatesFor(['sites/deck-cool/src/index.ts'])), {
    checks: false,
    unit: false,
    'unit-react-18': false,
    'unit-react-19': false,
    packages: false,
    next: false,
    e2e: false
  });
});

test('each vitest run, test:packages and test:next each have a CI job of their own', () => {
  assert.deepEqual(CI_JOBS.unit, ['test']);
  assert.deepEqual(CI_JOBS['unit-react-18'], ['test:react-18']);
  assert.deepEqual(CI_JOBS['unit-react-19'], ['test:react-19']);
  assert.deepEqual(CI_JOBS.packages, ['test:packages']);
  assert.deepEqual(CI_JOBS.next, ['test:next']);
});

// CI runs the same list, split into jobs.

test("the union of CI's jobs is the whole list, each step once", () => {
  const all = Object.values(CI_JOBS).flat();
  assert.deepEqual(
    STEPS.filter((step) => all.includes(step)),
    STEPS,
    `no CI job runs: ${STEPS.filter((step) => !all.includes(step)).join(', ')}`
  );
  assert.equal(all.length, STEPS.length, 'a step is in two CI jobs');
});

const ci = read('../../.github/workflows/ci.yml');

test('ci.yml runs every CI job, and no other', () => {
  const jobs = [
    ...ci.matchAll(/pnpm --dir decks\/carouseldeck verify --job (\S+)/g)
  ].map((match) => /** @type {string} */ (match[1]));
  assert.deepEqual(jobs.sort(), Object.keys(CI_JOBS).sort());
});

test("ci.yml's unit matrix is every shard of one count", () => {
  const matrix = ci.match(/^\s+shard: \[([^\]]*)\]$/m)?.[1];
  assert.ok(matrix, 'ci.yml has no `shard: [...]` matrix');
  const shards = matrix.split(',').map((shard) => shard.trim());
  assert.deepEqual(
    shards,
    shards.map((_, i) => `${i + 1}/${shards.length}`)
  );
  assert.match(
    ci,
    /pnpm --dir decks\/carouseldeck verify --job unit --shard="\$SHARD"/
  );
});

test("ci.yml's e2e matrix is every Playwright project", async () => {
  const configUrl = pathToFileURL(
    fileURLToPath(new URL('../playwright.config.ts', import.meta.url))
  ).href;
  const config = (await import(configUrl)).default;
  const projects = config.projects.map(
    (/** @type {{ name: string }} */ project) => project.name
  );
  const matrix = ci.match(/^\s+project: \[([^\]]*)\]$/m)?.[1];
  assert.ok(matrix, 'ci.yml has no `project: [...]` matrix');
  assert.deepEqual(
    matrix.split(',').map((name) => name.trim()),
    projects
  );
});

/**
 * ci.yml's jobs, by id, each with its own lines: the jobs are the keys
 * indented two spaces under `jobs:`.
 */
const ciJobBlocks = () => {
  const jobs = ci.slice(ci.indexOf('\njobs:\n'));
  return Object.fromEntries(
    jobs
      .split(/^ {2}(?=[\w-]+:$)/m)
      .slice(1)
      .map((block) => [block.slice(0, block.indexOf(':')), block])
  );
};

/** The job ids in a block's `needs: [...]`. */
const needsOf = (/** @type {string} */ block) =>
  (block.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1] ?? '')
    .split(',')
    .map((job) => job.trim());

test('verify needs every other job', () => {
  const needs = needsOf(ciJobBlocks().verify ?? '');
  for (const gateJob of Object.keys(CI_JOBS)) {
    assert.ok(
      needs.includes(`carouseldeck-${gateJob}`),
      `verify does not need carouseldeck-${gateJob}`
    );
  }
  for (const job of ['sites', 'changes']) {
    assert.ok(needs.includes(job), `verify does not need ${job}`);
  }
});

test('each gate job runs on a `changes` output that `changes` declares', () => {
  const blocks = ciJobBlocks();
  const outputs = [
    ...(blocks.changes ?? '').matchAll(
      /^ {6}([\w-]+): \$\{\{ steps\.plan\.outputs\.([\w-]+) \}\}$/gm
    )
  ].map(([, key, output]) => {
    assert.equal(key, output, `changes output ${key} reads ${output}`);
    return key;
  });
  for (const job of Object.keys(CI_JOBS)) {
    assert.ok(outputs.includes(job), `changes declares no ${job} output`);
    assert.match(
      blocks[`carouseldeck-${job}`] ?? '',
      new RegExp(`^ {4}if: needs\\.changes\\.outputs\\.${job} == 'true'$`, 'm'),
      `carouseldeck-${job} does not run on needs.changes.outputs.${job}`
    );
  }
});

test("ci.yml's Playwright image is the @playwright/test in the lockfile", () => {
  const locked = read('../../pnpm-lock.yaml').match(
    /^ {2}'@playwright\/test@([\d.]+)':$/m
  )?.[1];
  assert.ok(locked, 'pnpm-lock.yaml locks no @playwright/test');
  const tags = [
    ...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-\w+@sha256:/g)
  ].map((match) => match[1]);
  assert.ok(tags.length > 0, 'ci.yml uses no Playwright image by digest');
  for (const tag of tags) assert.equal(tag, locked);
});
