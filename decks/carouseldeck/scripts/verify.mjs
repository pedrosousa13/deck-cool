#!/usr/bin/env node
// Every gate, in one command that stops at the first failure and names it.
// CI runs this same list (deck-cool's root .github/workflows/ci.yml), split
// across parallel jobs by CI_JOBS below, so a gate added here runs in CI too,
// and there is no second list to keep in step with it: verify.test.mjs fails
// if CI_JOBS do not cover the whole list, or if ci.yml does not run every one
// of them.
//
//   pnpm verify                         every step, in order
//   pnpm verify --changed               the steps the diff against main needs
//   pnpm verify --changed=<ref>         ... against <ref> instead
//   pnpm verify --only lint,typecheck   those steps, in list order
//   pnpm verify --job unit              one CI job's steps
//   pnpm verify --project=webkit ...    test:e2e in one Playwright project
//   pnpm verify --shard=1/4 ...         test, test:react-18 and test:react-19
//                                       (vitest) in one shard of four
//   pnpm verify --dry-run ...           print the steps, run none
//   pnpm verify --ci-jobs ...           print `<job>=true|false` for each CI
//                                       job: whether it has a step to run
//
// Assumes `pnpm install` has run and Playwright's browsers are installed
// (`pnpm exec playwright install chromium firefox webkit`): vitest's browser
// mode drives chromium, and webkit for a few tests, and the e2e suite all
// three.

import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export const STEPS = [
  'format:check',
  'lint',
  'typecheck',
  'test',
  // The React package's tests again, on React 18, against
  // @carouseldeck/react-18's build.
  'test:react-18',
  // The same, on React 19.
  'test:react-19',
  'test:scripts',
  // A consumer-visible change to a released package is named in a
  // changeset added since the diff's base (AGENTS.md, "Releasing").
  'changeset:check',
  'build',
  // The README's and the docs package's code blocks against the built
  // packages.
  'docs:check',
  // The README's comparison table against a fresh measurement.
  'compare:check',
  'test:packages',
  // A Next.js server component renders a deck from the packed tarballs.
  'test:next',
  // A report, never a failure: see scripts/bundle-size.mjs.
  'size',
  'test:e2e'
];

/** The vitest steps, which `--shard` splits. */
const SHARDED = ['test', 'test:react-18', 'test:react-19'];

/**
 * CI's parallel jobs, by the steps each runs: `pnpm verify --job <name>` in
 * the ci.yml job of that name. Each step is in one job. test:packages and
 * test:next build what they need themselves, and the e2e suite's web server
 * serves storybook from source, so only `checks` builds.
 *
 * @type {Record<string, string[]>}
 */
export const CI_JOBS = {
  // No browser.
  checks: [
    'format:check',
    'lint',
    'typecheck',
    'test:scripts',
    'changeset:check',
    'build',
    'docs:check',
    'compare:check',
    'size'
  ],
  // In Playwright's container, once per vitest shard: vitest drives chromium
  // and webkit.
  unit: ['test'],
  // The same, for test:react-18: its own job, so `unit` takes no longer.
  'unit-react-18': ['test:react-18'],
  // The same, for test:react-19: its own job too.
  'unit-react-19': ['test:react-19'],
  // No browser. Apart from `unit`, whose vitest run is CI's longest job.
  packages: ['test:packages'],
  next: ['test:next'],
  // In Playwright's container, once per Playwright project.
  e2e: ['test:e2e']
};

/**
 * The gates a change needs, by path, first match wins. A path outside the
 * deck needs every gate if it is the root's package.json, pnpm-lock.yaml,
 * pnpm-workspace.yaml or .github/workflows/ci.yml, and none otherwise. A path
 * inside the deck that no rule matches needs every gate.
 *
 * @type {{ match: RegExp, steps: string[] }[]}
 */
const RULES = [
  {
    match:
      /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.github\/workflows\/ci\.yml)$/,
    steps: STEPS
  },
  // A changeset needs checking whether it names every package it covers
  // (changeset:check), wherever else it lives outside the deck.
  { match: /^\.changeset\//, steps: ['changeset:check'] },
  { match: /^(?!decks\/carouseldeck\/)/, steps: [] },
  { match: /^decks\/carouseldeck\/packages\//, steps: STEPS },
  {
    match:
      /^decks\/carouseldeck\/apps\/storybook\/|^decks\/carouseldeck\/e2e\/deck\.spec\.ts$/,
    steps: ['format:check', 'lint', 'typecheck', 'build', 'test:e2e']
  },
  // What a gate runs, and what those scripts import, is that gate: a change to
  // it needs every gate. verify.test.mjs checks each script package.json runs
  // for a step is here.
  {
    match:
      /^decks\/carouseldeck\/scripts\/(bundle-size|changeset-check|compare-libraries|docs-examples|next-rsc|verify-packaging|workspace-packages)\.mjs$/,
    steps: STEPS
  },
  {
    match: /^decks\/carouseldeck\/scripts\//,
    steps: ['format:check', 'lint', 'typecheck', 'test:scripts']
  },
  {
    match: /^decks\/carouseldeck\/docs\/|^decks\/carouseldeck\/.*\.md$/,
    steps: ['format:check']
  }
];

/**
 * The steps a change to `paths` needs, in list order, each with no arguments.
 *
 * @param {string[]} paths repo-relative, `/`-separated
 * @returns {{ step: string, args: string[] }[]}
 */
export function gatesFor(paths) {
  const steps = new Set();
  for (const path of paths) {
    const rule = RULES.find(({ match }) => match.test(path));
    for (const step of rule?.steps ?? STEPS) steps.add(step);
  }
  return STEPS.filter((step) => steps.has(step)).map((step) => ({
    step,
    args: /** @type {string[]} */ ([])
  }));
}

/**
 * Which CI jobs have a step to run in `steps`.
 *
 * @param {{ step: string }[]} steps
 * @returns {Record<string, boolean>}
 */
export function ciJobs(steps) {
  return Object.fromEntries(
    Object.entries(CI_JOBS).map(([job, jobSteps]) => [
      job,
      steps.some(({ step }) => jobSteps.includes(step))
    ])
  );
}

/**
 * The paths changed since `ref`'s merge base with HEAD: committed, staged,
 * unstaged and untracked.
 *
 * @param {string} ref
 * @returns {string[]}
 */
export function changedSince(ref) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  const [base] = git(['merge-base', ref, 'HEAD']);
  return [
    ...git([
      'diff',
      '--name-only',
      '--no-renames',
      /** @type {string} */ (base)
    ]),
    // ls-files, unlike diff, scopes an untracked-file scan to the given
    // pathspec, defaulting to cwd: ':/' asks for the whole repo, not only
    // decks/carouseldeck/ below it.
    ...git([
      'ls-files',
      '--others',
      '--exclude-standard',
      '--full-name',
      '--',
      ':/'
    ])
  ];
}

/**
 * The steps `argv` asks for, each with the arguments it is run with.
 *
 * @param {string[]} argv `pnpm verify`'s arguments, `--dry-run` and
 *   `--ci-jobs` aside
 * @param {(ref: string) => string[]} changed the paths changed since `ref`
 * @returns {{ step: string, args: string[] }[]}
 */
export function plan(argv, changed = changedSince) {
  /** @type {string[] | undefined} */
  let only;
  /** @type {string | undefined} */
  let job;
  /** @type {string | undefined} */
  let project;
  /** @type {string | undefined} */
  let shard;
  /** @type {string | undefined} */
  let since;
  for (let i = 0; i < argv.length; i++) {
    const arg = /** @type {string} */ (argv[i]);
    const [flag, inline] = arg.split(/=(.*)/s);
    const value = () => (inline === undefined ? argv[++i] : inline) ?? '';
    if (flag === '--only') {
      only = value().split(',').filter(Boolean);
      if (only.length === 0) {
        throw new Error('--only needs a comma-separated list of steps');
      }
      for (const step of only) {
        if (!STEPS.includes(step)) {
          throw new Error(
            `unknown step \`${step}\`; the steps are ${STEPS.join(', ')}`
          );
        }
      }
    } else if (flag === '--job') {
      job = value();
      if (!Object.hasOwn(CI_JOBS, job)) {
        throw new Error(
          `unknown CI job \`${job}\`; the jobs are ${Object.keys(CI_JOBS).join(', ')}`
        );
      }
    } else if (flag === '--project') {
      project = value();
    } else if (flag === '--shard') {
      shard = value();
    } else if (flag === '--changed') {
      since = inline ?? 'main';
    } else {
      throw new Error(`unknown argument \`${arg}\``);
    }
  }
  if (only && job) throw new Error('--job and --only cannot be used together');
  const wanted = only ?? (job ? CI_JOBS[job] : undefined) ?? STEPS;
  if (project !== undefined && !wanted.includes('test:e2e')) {
    throw new Error('--project needs test:e2e among the steps');
  }
  if (shard !== undefined && !wanted.some((step) => SHARDED.includes(step))) {
    throw new Error(
      '--shard needs test, test:react-18 or test:react-19 among the steps'
    );
  }
  const steps = (
    since === undefined
      ? STEPS.map((step) => ({ step, args: /** @type {string[]} */ ([]) }))
      : gatesFor(changed(since))
  ).filter(({ step }) => wanted.includes(step));
  return steps.map(({ step, args }) => ({
    step,
    args:
      step === 'test:e2e' && project
        ? [...args, `--project=${project}`]
        : SHARDED.includes(step) && shard
          ? [...args, `--shard=${shard}`]
          : // changeset:check always needs the base it diffs against, not
            // only when --changed picked which steps to run.
            step === 'changeset:check'
            ? [...args, `--changed=${since ?? 'main'}`]
            : args
  }));
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const printJobs = argv.includes('--ci-jobs');
  /** @type {ReturnType<typeof plan>} */
  let steps;
  try {
    steps = plan(
      argv.filter((arg) => arg !== '--dry-run' && arg !== '--ci-jobs')
    );
  } catch (error) {
    console.error(`verify: ${/** @type {Error} */ (error).message}`);
    process.exit(2);
  }
  if (printJobs) {
    for (const [job, run] of Object.entries(ciJobs(steps))) {
      console.log(`${job}=${run}`);
    }
    return;
  }
  for (const { step, args } of steps) {
    console.log(`\n> ${[step, ...args].join(' ')}`);
    if (dryRun) continue;
    try {
      execFileSync('pnpm', [step, ...args], {
        cwd: repoRoot,
        stdio: 'inherit'
      });
    } catch (error) {
      const code = /** @type {{ status?: unknown } | undefined} */ (error)
        ?.status;
      const status = typeof code === 'number' ? code : 1;
      console.error(`\nverify: step \`${step}\` failed (exit ${status})`);
      process.exit(status);
    }
  }
  console.log(
    dryRun
      ? `\n${steps.length} verify steps listed; none run (--dry-run).`
      : `\nAll ${steps.length} verify steps passed.`
  );
}

// Run as a script, not when verify.test.mjs imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
