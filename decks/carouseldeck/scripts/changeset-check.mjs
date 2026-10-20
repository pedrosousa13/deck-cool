#!/usr/bin/env node
// A consumer-visible change to a released carouseldeck package needs a
// changeset naming it (AGENTS.md, "Releasing"): a fix, a feature, a changed
// prop or type, or a changed package file -- its package.json, anything
// under its src/ (built into dist, which isn't in git), or its README* or
// LICENSE* (npm ships those regardless of `files`). @carouseldeck/react-18
// builds @carouseldeck/react's source unchanged and ships its CHANGELOG
// entries too (AGENTS.md, "React 18"), so a change under react's src/ needs
// naming react-18 as well. Tests, docs outside the packages, CI and scripts
// are under none of this, so they need no changeset, and nor does a change
// to @carouseldeck/docs, which ships at the version of the code it
// describes.
//
// Run as a verify step (`pnpm changeset:check`), so `--changed=<ref>` is
// whatever base verify.mjs resolved, 'main' by default.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { changedSince } from './verify.mjs';
import { publishablePackages } from './workspace-packages.mjs';

const deckRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// @carouseldeck/react-18 builds this, unchanged (AGENTS.md, "React 18").
const REACT_SRC = 'decks/carouseldeck/packages/react/src/';

/**
 * The published packages a consumer-visible change needs a changeset
 * naming, each with the repo-relative path prefixes that change it.
 * `@carouseldeck/docs` ships at the version of the code it describes
 * (AGENTS.md, "Releasing"): a change to it, alone or alongside another
 * package's, needs none, so it is left out.
 * @param {string} deckRoot decks/carouseldeck/, absolute
 * @returns {{ name: string; prefixes: string[] }[]}
 */
export const packagesNeedingChangesets = (deckRoot) =>
  publishablePackages(deckRoot)
    .filter((pkg) => pkg.manifest.name !== '@carouseldeck/docs')
    .map((pkg) => {
      const dir = `decks/carouseldeck/packages/${basename(pkg.path)}`;
      // What npm ships: package.json, src/ (built into dist, which isn't in
      // git), and README* and LICENSE*, which npm ships regardless of
      // `files`.
      const prefixes = [
        `${dir}/package.json`,
        `${dir}/src/`,
        `${dir}/README`,
        `${dir}/LICENSE`
      ];
      if (pkg.manifest.name === '@carouseldeck/react-18') {
        prefixes.push(REACT_SRC);
      }
      return { name: pkg.manifest.name, prefixes };
    });

/**
 * The names, from `packages`, a consumer can see changed: `paths` holds a
 * path under one of a package's prefixes.
 * @param {string[]} paths repo-relative, `/`-separated
 * @param {{ name: string; prefixes: string[] }[]} packages
 * @returns {Set<string>}
 */
export const changedPackages = (paths, packages) => {
  const names = new Set();
  for (const { name, prefixes } of packages) {
    const changed = paths.some((path) =>
      prefixes.some((prefix) => path.startsWith(prefix))
    );
    if (changed) names.add(name);
  }
  return names;
};

/**
 * The package names a changeset's frontmatter names, one per line as
 * Changesets writes them, between the two `---` lines: `"<name>": <bump>`.
 * The frontmatter is YAML, so the key is quoted, single or double (a bare
 * `@scope/pkg:` is invalid YAML, and Changesets never writes one).
 * @param {string[]} contents each changeset file's contents
 * @returns {Set<string>}
 */
export const namedPackages = (contents) => {
  const names = new Set();
  for (const file of contents) {
    const frontmatter = file.split(/^---$/m)[1] ?? '';
    for (const match of frontmatter.matchAll(/^["'](@\S+?)["']:\s*\S+\s*$/gm)) {
      names.add(/** @type {string} */ (match[1]));
    }
  }
  return names;
};

/**
 * The names in `packages` that changed, per `changedPackages`, with no
 * changeset in `changesetContents` naming them.
 * @param {{
 *   paths: string[];
 *   packages: { name: string; prefixes: string[] }[];
 *   changesetContents: string[];
 * }} options
 * @returns {string[]}
 */
export const missingChangesets = ({ paths, packages, changesetContents }) => {
  const named = namedPackages(changesetContents);
  return [...changedPackages(paths, packages)].filter(
    (name) => !named.has(name)
  );
};

/**
 * Whether `ref` is a release diff that names no package either way it
 * lands (AGENTS.md, "Releasing"): `changeset-release/main`, whose only diff
 * is the version bump that consumes the pending changesets, and `main`,
 * where the diff -- that same bump, once the Version Packages PR merges --
 * was already checked on the branch it merged from.
 * @param {string | undefined} ref `GITHUB_REF`
 * @returns {boolean}
 */
export const skipsRelease = (ref) =>
  ref === 'refs/heads/main' || ref === 'refs/heads/changeset-release/main';

/**
 * The changesets among `paths` added since the base: under `.changeset/`,
 * ending `.md`, not `.changeset/README.md`, and still on disk (a deleted
 * changeset does not count as added).
 * @param {string[]} paths repo-relative, `/`-separated
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export const addedChangesets = (
  paths,
  exists = (path) => existsSync(join(repoRoot, path))
) =>
  paths.filter(
    (path) =>
      path.startsWith('.changeset/') &&
      path.endsWith('.md') &&
      path !== '.changeset/README.md' &&
      exists(path)
  );

const main = () => {
  const ref = process.env.GITHUB_REF;
  if (skipsRelease(ref)) {
    console.log(
      `changeset-check: skipped on ${ref} -- a release diff names no package (AGENTS.md, "Releasing").`
    );
    return;
  }
  const since =
    process.argv
      .find((arg) => arg.startsWith('--changed='))
      ?.slice('--changed='.length) || 'main';
  const paths = changedSince(since);
  const changesetContents = addedChangesets(paths).map((path) =>
    readFileSync(join(repoRoot, path), 'utf8')
  );
  const missing = missingChangesets({
    paths,
    packages: packagesNeedingChangesets(deckRoot),
    changesetContents
  });
  if (missing.length > 0) {
    console.log(
      `::error::${missing.join(', ')} changed since ${since} with no changeset naming ${missing.length === 1 ? 'it' : 'them'}. Run \`pnpm changeset\` (AGENTS.md, "Releasing").`
    );
    process.exit(1);
  }
  console.log(
    `changeset-check: every package changed since ${since} is named in a changeset.`
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.log(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}
