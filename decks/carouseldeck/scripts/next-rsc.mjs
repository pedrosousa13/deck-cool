#!/usr/bin/env node
// Builds tests/next-rsc, a Next.js App Router app whose server component
// renders a deck, against the packed @carouseldeck tarballs, and checks that the
// prerendered HTML holds the slides and the controls. It fails if a React
// entry loses its `'use client'` directive: the server component would then
// run the deck's hooks itself.
//
// Next.js installs from the fixture's own lockfile, outside the repo's
// workspace, and pnpm's store keeps it, so only the first run downloads it.

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { publishablePackages } from './workspace-packages.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(repoRoot, 'tests/next-rsc');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  });

// Build the packages the tarballs are packed from.
run('pnpm', ['--filter', './packages/*', 'build'], repoRoot);

run(
  'pnpm',
  ['install', '--frozen-lockfile', '--prefer-offline', '--reporter=silent'],
  fixture
);

// Each tarball goes where a package manager would put it, as a consumer
// installs it: what npm would ship, not the workspace's symlinks.
const destination = mkdtempSync(join(tmpdir(), 'carouseldeck-next-'));
try {
  for (const { manifest } of publishablePackages(repoRoot)) {
    const { name } = manifest;
    const packs = join(destination, name);
    mkdirSync(packs, { recursive: true });
    run(
      'pnpm',
      ['--filter', name, 'pack', '--pack-destination', packs],
      repoRoot
    );
    const target = join(fixture, 'node_modules', name);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    execFileSync('tar', [
      '-xzf',
      join(packs, readdirSync(packs)[0] ?? ''),
      '-C',
      target,
      '--strip-components=1'
    ]);
  }
} finally {
  rmSync(destination, { recursive: true, force: true });
}

run('pnpm', ['exec', 'next', 'build'], fixture);

const html = readFileSync(join(fixture, '.next/server/app/index.html'), 'utf8');
// Dots and Counter count a page per slide, as in a client component's server
// HTML: the server component hands Deck.Root its Deck.Viewport as a client
// reference, so the slides are counted where it can still be recognised, in
// the server component render (README, "Server rendering"; ADR-0003).
const expected = [
  'Slide one',
  'Slide two',
  'Slide three',
  'data-carouseldeck-shell="1"',
  'data-carouseldeck-effect="fade"',
  'data-carouseldeck-effect="curve"',
  '<style data-precedence="carouseldeck"',
  '>Previous</button>',
  '>Next</button>',
  'data-carouseldeck-dots=""',
  'aria-label="Go to page 1" aria-current="true"',
  'aria-label="Go to page 3"',
  '>1 / 3</span>'
];
const failures = expected
  .filter((text) => !html.includes(text))
  .map((text) => `the server HTML has no ${text}`);
if (html.includes('aria-label="Go to page 4"')) {
  failures.push('the server HTML has more dots than slides');
}
// Each slide carries its progress as the deck starts, its distance from the
// starting slide, so an effect, or CSS on progress, draws from the first
// paint (#125). One instance (ADR-0013): the fade deck's own three slides
// carry it, never a loop's copies.
const fade = html.indexOf('data-carouseldeck-effect="fade"');
const curve = html.indexOf('data-carouseldeck-effect="curve"');
/**
 * @param {string} effect
 * @param {string} part the server HTML from the effect's viewport on
 * @param {string} expected
 */
const checkProgress = (effect, part, expected) => {
  const found = [...part.matchAll(/--deck-slide-progress:(-?[\d.]+)/g)]
    .map(([, progress]) => progress)
    .join();
  if (found !== expected) {
    failures.push(
      `the ${effect} deck's slides have progress ${found || 'none'}, not ${expected}`
    );
  }
};
checkProgress('fade', html.slice(fade, curve), '0,1,2');
checkProgress('curve', html.slice(curve), '-1,0,1');
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log('\nA server component renders the deck from the packed tarballs.');
