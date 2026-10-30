import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every package under `packages/` whose manifest does not set `private` --
 * what this repo publishes. Throws if there are none, so a moved or renamed
 * `packages/` directory fails loudly instead of checking nothing.
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
    })
    .filter((pkg) => !pkg.manifest.private);
  if (packages.length === 0) {
    throw new Error(`No publishable packages found under ${repoRoot}packages/`);
  }
  return packages;
};

/**
 * The same, across every deck's own `packages/` directory
 * (`decks/<deck>/packages/<name>`), for the release workflow's own scripts,
 * which release every deck, not one. Throws if there are none.
 * @param {string} repoRoot the monorepo root, not a deck's own root
 * @returns {{ path: string, manifest: Record<string, any> }[]}
 */
export const publishablePackagesInDecks = (repoRoot) => {
  const decksDir = join(repoRoot, 'decks');
  const packages = readdirSync(decksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((deck) => {
      const packagesDir = join(decksDir, deck.name, 'packages');
      if (!existsSync(packagesDir)) return [];
      return readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const path = join(packagesDir, entry.name);
          const manifest = JSON.parse(
            readFileSync(join(path, 'package.json'), 'utf8')
          );
          return { path, manifest };
        });
    })
    .filter((pkg) => !pkg.manifest.private);
  if (packages.length === 0) {
    throw new Error(
      `No publishable packages found under ${decksDir}/*/packages/`
    );
  }
  return packages;
};
