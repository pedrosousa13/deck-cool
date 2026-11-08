#!/usr/bin/env node
// Every gate, in order, stopping at the first failure. Mirrors
// decks/carouseldeck/scripts/verify.mjs, pared down: three packages need no
// --changed, --job or --shard logic yet.
//
//   pnpm verify   lint, typecheck, test, test:react-18, test:react-19,
//                 build, test:packages, in order
//
// `build` also builds @drawerdeck/storybook (apps/storybook, #278): the
// workspace filter below has nothing excluding it by name, the way it does
// @drawerdeck/bench, so a story that no longer compiles fails here.

import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const STEPS = [
  'lint',
  'typecheck',
  'test',
  // The drawer package's tests again, on React 18, against
  // @drawerdeck/react-18's build.
  'test:react-18',
  // The same, on React 19.
  'test:react-19',
  // Builds every package, including @drawerdeck/storybook: the check that
  // the storybook still compiles (see this file's own top comment).
  'build',
  'test:packages'
];

function main() {
  for (const step of STEPS) {
    console.log(`\n> ${step}`);
    try {
      execFileSync('pnpm', [step], { cwd: repoRoot, stdio: 'inherit' });
    } catch (error) {
      const code = /** @type {{ status?: unknown } | undefined} */ (error)
        ?.status;
      const status = typeof code === 'number' ? code : 1;
      console.error(`\nverify: step \`${step}\` failed (exit ${status})`);
      process.exit(status);
    }
  }
  console.log(`\nAll ${STEPS.length} verify steps passed.`);
}

main();
