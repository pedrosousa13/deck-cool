#!/usr/bin/env node
// Every gate, in order, stopping at the first failure. Mirrors
// decks/carouseldeck/scripts/verify.mjs, pared down: two packages need no
// --changed, --job or --shard logic yet.
//
//   pnpm verify   lint, typecheck, test, build, test:packages, in order

import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const STEPS = ['lint', 'typecheck', 'test', 'build', 'test:packages'];

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
