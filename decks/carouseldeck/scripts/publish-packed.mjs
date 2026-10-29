#!/usr/bin/env node
// The release workflow's `publish` job. Publishes the tarballs `verify`
// packed, with npm, in the Changesets publish plan's dependency order:
// `@carouseldeck/core` before the packages that depend on it. Skips any
// name@version npm already has (an idempotent re-run), stops at the first
// failure, and sends `--access public --provenance` explicitly on every
// publish -- npm does not read a tarball's own `publishConfig` on its own.
//
// pnpm 11 publishes natively instead of spawning npm, and its own OIDC
// exchange fails only as a warning, after which it falls back to an
// anonymous publish that fails with E404. This script runs the npm this
// workflow pins, over the credential `~/.npmrc` or OIDC gives it, so a
// failed OIDC exchange fails loudly instead.
//
// Node's built-ins only.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{
 *   kind: 'publish';
 *   name: string;
 *   version: string;
 *   access?: string;
 *   tag?: string;
 *   tarball: { path: string };
 * }} PublishRelease
 * @typedef {{ kind: 'tag-only'; name: string; version: string }} TagOnlyRelease
 */

/**
 * @param {PublishRelease | TagOnlyRelease} release
 * @returns {release is PublishRelease}
 */
const isPublishRelease = (release) => release.kind === 'publish';

/**
 * The publish releases in a Changesets publish plan (`publish-plan.json`,
 * from `changesets/action/pack`), in the dependency order its chunks are
 * already in: flattening them keeps a package after everything it depends
 * on. `kind: "tag-only"` entries (private packages) are dropped; this
 * workflow publishes no private package.
 * @param {{ plan: (PublishRelease | TagOnlyRelease)[][] }} planFile
 * @returns {PublishRelease[]}
 */
export const releasesFromPlan = (planFile) =>
  planFile.plan.flat().filter(isPublishRelease);

/**
 * The same, read from each tarball's own `package.json`, for when no
 * publish plan is available. Orders packages with a plain topological sort
 * on `dependencies`: a package that depends on another package in the set
 * publishes after it. Throws on a cycle, which a fixed-version release group
 * should never have.
 * @param {{ path: string; readManifest: () => { name: string; version: string; dependencies?: Record<string, string> } }[]} tarballs
 * @returns {PublishRelease[]}
 */
export const releasesFromTarballs = (tarballs) => {
  const entries = tarballs.map((tarball) => ({
    tarball,
    manifest: tarball.readManifest()
  }));
  const remaining = new Map(
    entries.map((entry) => [entry.manifest.name, entry])
  );
  /** @type {PublishRelease[]} */
  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter(
      ({ manifest }) =>
        !Object.keys(manifest.dependencies ?? {}).some((dep) =>
          remaining.has(dep)
        )
    );
    if (ready.length === 0) {
      throw new Error(
        `Cannot order the packed tarballs for publish: a dependency cycle among ${[...remaining.keys()].join(', ')}.`
      );
    }
    for (const { tarball, manifest } of ready) {
      ordered.push({
        kind: 'publish',
        name: manifest.name,
        version: manifest.version,
        access: 'public',
        tag: 'latest',
        tarball: { path: tarball.path }
      });
      remaining.delete(manifest.name);
    }
  }
  return ordered;
};

/**
 * `releases` with each one's `tag` read from its own tarball's
 * `package.json#publishConfig.tag`, defaulting to `latest`. A Changesets
 * publish plan has no notion of `publishConfig.tag` and writes `"tag":
 * "latest"` for every entry, so its `tag` cannot be trusted; the tarball is
 * what npm actually publishes, so its own manifest decides the dist-tag.
 * @param {{
 *   releases: PublishRelease[];
 *   readManifest: (release: PublishRelease) => { publishConfig?: { tag?: string } };
 * }} options
 * @returns {PublishRelease[]}
 */
export const releasesWithPublishConfigTags = ({ releases, readManifest }) =>
  releases.map((release) => ({
    ...release,
    tag: readManifest(release).publishConfig?.tag ?? 'latest'
  }));

/**
 * Publishes `releases` in order, skipping any already on npm, and stops at
 * the first failure.
 * @param {{
 *   releases: PublishRelease[];
 *   isOnNpm: (name: string, version: string) => Promise<boolean>;
 *   publish: (release: PublishRelease) => Promise<{ ok: true } | { ok: false; message: string }>;
 *   log: (line: string) => void;
 * }} options
 * @returns {Promise<{
 *   published: boolean;
 *   publishedPackages: { name: string; version: string }[];
 *   failure?: string;
 * }>}
 */
export const publishReleases = async ({ releases, isOnNpm, publish, log }) => {
  /** @type {{ name: string; version: string }[]} */
  const publishedPackages = [];
  for (const release of releases) {
    const tag = `${release.name}@${release.version}`;
    if (await isOnNpm(release.name, release.version)) {
      log(`${tag} is already on npm; not publishing it again.`);
      continue;
    }
    const result = await publish(release);
    if (!result.ok) {
      return {
        published: publishedPackages.length > 0,
        publishedPackages,
        failure: `${tag}: ${result.message}`
      };
    }
    log(`Published ${tag}.`);
    publishedPackages.push({ name: release.name, version: release.version });
  }
  return { published: publishedPackages.length > 0, publishedPackages };
};

/**
 * Whether npm already serves `name@version`: `npm view` prints its version
 * when it does, and fails (E404) when it does not.
 * @param {string} name
 * @param {string} version
 */
const isOnNpm = async (name, version) => {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8'
    }).trim();
    return out === version;
  } catch {
    return false;
  }
};

/**
 * Publishes one packed tarball with npm, with explicit provenance and
 * access, at verbose logging so an OIDC exchange failure's reason reaches
 * the job log -- npm redacts credentials from its own verbose output.
 * Inherits stdio: the log is the evidence, not this function's return value.
 * @param {string} packDir
 * @param {PublishRelease} release
 * @returns {Promise<{ ok: true } | { ok: false; message: string }>}
 */
const npmPublish = async (packDir, release) => {
  const tarballPath = join(packDir, release.tarball.path);
  try {
    execFileSync(
      'npm',
      [
        'publish',
        tarballPath,
        '--access',
        release.access || 'public',
        '--tag',
        release.tag || 'latest',
        '--provenance',
        '--loglevel',
        'verbose'
      ],
      { stdio: 'inherit' }
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * A tarball's own `package.json`, extracted straight from it -- the
 * manifest that actually gets published, not the one in the working tree.
 * @param {string} tarballPath
 */
const readManifestFromTarball = (tarballPath) =>
  JSON.parse(
    execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
      encoding: 'utf8'
    })
  );

/**
 * The tarballs in `<packDir>/packages/`, for `releasesFromTarballs`.
 * @param {string} packDir
 */
const tarballsIn = (packDir) => {
  const packagesDir = join(packDir, 'packages');
  return readdirSync(packagesDir)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => ({
      path: join('packages', name),
      readManifest: () => readManifestFromTarball(join(packagesDir, name))
    }));
};

const main = async () => {
  const packDir = process.env.PACK_DIR;
  if (!packDir) throw new Error('PACK_DIR is not set.');

  const planPath = join(packDir, 'publish-plan.json');
  const releases = releasesWithPublishConfigTags({
    releases: existsSync(planPath)
      ? releasesFromPlan(JSON.parse(readFileSync(planPath, 'utf8')))
      : releasesFromTarballs(tarballsIn(packDir)),
    readManifest: (release) =>
      readManifestFromTarball(join(packDir, release.tarball.path))
  });

  const result = await publishReleases({
    releases,
    isOnNpm,
    publish: (release) => npmPublish(packDir, release),
    log: (line) => console.log(line)
  });

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `published-packages=${JSON.stringify(result.publishedPackages)}\n`
    );
  }

  if (result.failure) {
    const publishedSoFar =
      result.publishedPackages.length > 0
        ? `, after publishing: ${result.publishedPackages.map((p) => `${p.name}@${p.version}`).join(', ')}`
        : '';
    throw new Error(
      `npm publish failed for ${result.failure}${publishedSoFar}.`
    );
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.log(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
