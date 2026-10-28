#!/usr/bin/env node
// The release workflow's `tag` job. Every package version on npm without a
// GitHub release gets one, tagged `<name>@<version>` at `GITHUB_SHA`, as
// Changesets tags, with its changelog section as the notes.
//
// npm can answer 404 for minutes after a publish (#63). A version the
// `publish` job published in this run, named in `PUBLISHED_PACKAGES` (its
// `published-packages` output), is polled with backoff for up to ten minutes
// and tagged as soon as npm shows it; a 429, a 5xx or a timeout meanwhile
// counts as "not yet". One npm still lacks when the wait runs out fails the
// job, by name, with npm's last answer. Any other version is checked once,
// and skipped if npm lacks it.
//
// Node's built-ins only, so the job installs nothing. It reads npm anonymously
// and holds no npm credential.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { publishablePackagesInDecks } from './workspace-packages.mjs';

// This script releases every in-repo deck, not carouseldeck alone, so it
// reads the monorepo root, two levels above this file's own deck.
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * @typedef {{ name: string; version: string }} Version
 * @typedef {Version & { changelog: string }} Release
 */

/**
 * The waits between polls: `first`, doubling, capped at `max`, adding up to
 * `total` exactly.
 * @param {{ first: number; max: number; total: number }} options
 * @returns {number[]}
 */
export const backoff = ({ first, max, total }) => {
  const delays = [];
  let spent = 0;
  for (let next = first; spent < total; next *= 2) {
    const delay = Math.min(next, max, total - spent);
    delays.push(delay);
    spent += delay;
  }
  return delays;
};

/**
 * The text under `## <version>` in a Changesets changelog, up to the next
 * version's heading, trimmed. Empty if the version has no section.
 * @param {string} changelog
 * @param {string} version
 */
export const changelogSection = (changelog, version) => {
  const lines = changelog.split('\n');
  const start = lines.indexOf(`## ${version}`);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

/**
 * Releases every one of `releases` that npm has. Waits through `delays` for
 * those in `published`, and throws, naming them, if npm still lacks any after
 * the last wait. For those, an error from `isOnNpm` (a 429, a 5xx, a timeout)
 * counts as "not yet"; for any other version it throws at once.
 * @param {{
 *   releases: Release[];
 *   published: Version[];
 *   delays: number[];
 *   isOnNpm: (name: string, version: string) => Promise<boolean>;
 *   hasRelease: (tag: string) => boolean;
 *   createRelease: (tag: string, notes: string) => void;
 *   sleep: (ms: number) => Promise<void>;
 *   log: (line: string) => void;
 * }} options
 */
export const tagReleases = async ({
  releases,
  published,
  delays,
  isOnNpm,
  hasRelease,
  createRelease,
  sleep,
  log
}) => {
  /** @param {Version} v */
  const tagOf = (v) => `${v.name}@${v.version}`;
  const publishedTags = new Set(published.map(tagOf));
  /** @param {Release} release */
  const tagAndRelease = (release) => {
    const tag = tagOf(release);
    if (hasRelease(tag)) {
      log(`${tag} already has a release.`);
      return;
    }
    createRelease(tag, changelogSection(release.changelog, release.version));
  };
  /**
   * `true` once npm shows `release`, otherwise npm's last answer.
   * @param {Release} release
   * @returns {Promise<true | string>}
   */
  const poll = async (release) => {
    try {
      return (await isOnNpm(release.name, release.version)) || 'not found';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  /** @type {{ release: Release; last: string }[]} */
  let waiting = [];
  for (const release of releases) {
    if (publishedTags.has(tagOf(release))) {
      const answer = await poll(release);
      if (answer === true) tagAndRelease(release);
      else waiting.push({ release, last: answer });
    } else if (await isOnNpm(release.name, release.version)) {
      tagAndRelease(release);
    } else {
      log(`${tagOf(release)} is not on npm; not tagged.`);
    }
  }

  for (const delay of delays) {
    if (waiting.length === 0) break;
    log(
      `Published in this run, not on npm yet: ${waiting.map((w) => `${tagOf(w.release)} (${w.last})`).join(', ')}. Checking again in ${delay / 1000}s.`
    );
    await sleep(delay);
    /** @type {{ release: Release; last: string }[]} */
    const still = [];
    for (const { release } of waiting) {
      const answer = await poll(release);
      if (answer === true) tagAndRelease(release);
      else still.push({ release, last: answer });
    }
    waiting = still;
  }

  if (waiting.length > 0) {
    throw new Error(
      `Published in this run, but still not on npm after the wait, so not tagged: ${waiting.map((w) => `${tagOf(w.release)} (npm's last answer: ${w.last})`).join(', ')}. Re-run the tag job once npm shows them.`
    );
  }
};

/**
 * Whether npm serves `name@version`. Anything but found or not found throws,
 * as does no answer within 15 seconds.
 * @param {string} name
 * @param {string} version
 */
const isOnNpm = async (name, version) => {
  let response;
  try {
    response = await fetch(`https://registry.npmjs.org/${name}/${version}`, {
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    // fetch's own message is "fetch failed"; the cause says why.
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause
        : error;
    throw new Error(
      `no answer: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause: error }
    );
  }
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return true;
};

const main = async () => {
  const sha = process.env.GITHUB_SHA;
  if (!sha) throw new Error('GITHUB_SHA is not set.');
  /** @type {Version[]} */
  const published = JSON.parse(process.env.PUBLISHED_PACKAGES || '[]');
  // A package Changesets has never versioned yet, such as a deck's first
  // hand-set beta, has no CHANGELOG.md: its release notes are empty, not a
  // crash.
  const releases = publishablePackagesInDecks(repoRoot).map(
    ({ path, manifest }) => {
      const changelogPath = join(path, 'CHANGELOG.md');
      return {
        name: manifest.name,
        version: manifest.version,
        changelog: existsSync(changelogPath)
          ? readFileSync(changelogPath, 'utf8')
          : ''
      };
    }
  );

  await tagReleases({
    releases,
    published,
    delays: backoff({ first: 10_000, max: 60_000, total: 10 * 60_000 }),
    isOnNpm,
    hasRelease: (tag) => {
      try {
        execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    createRelease: (tag, notes) => {
      execFileSync(
        'gh',
        [
          'release',
          'create',
          tag,
          '--target',
          sha,
          '--title',
          tag,
          '--notes-file',
          '-'
        ],
        { input: notes, stdio: ['pipe', 'inherit', 'inherit'] }
      );
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(line)
  });
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
