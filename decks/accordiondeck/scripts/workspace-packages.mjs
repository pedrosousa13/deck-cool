import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every package under `packages/`, private or not. Drawerdeck's version of
 * this skips the private ones, but all three of these stay private until the
 * first release, and the gate must still pack and check them. Once one is
 * published, restore that filter for any package that stays private for good.
 * Throws if there are none, so a moved or renamed `packages/` directory
 * fails loudly instead of checking nothing.
 * @param {string} repoRoot
 * @returns {{ path: string, manifest: Record<string, any> }[]}
 */
export const publishablePackages = (repoRoot) => {
  const packages = readdirSync(join(repoRoot, 'packages'), {
    withFileTypes: true
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(repoRoot, 'packages', entry.name);
      const manifest = JSON.parse(
        readFileSync(join(path, 'package.json'), 'utf8')
      );
      return { path, manifest };
    });
  if (packages.length === 0) {
    throw new Error(`No publishable packages found under ${repoRoot}packages/`);
  }
  return packages;
};
