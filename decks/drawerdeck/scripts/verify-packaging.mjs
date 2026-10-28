#!/usr/bin/env node
// Packs every publishable package and checks the tarball -- what npm would
// actually ship -- with publint and attw, and that @drawerdeck/react's
// built module starts with `'use client'`, so a React Server Components
// bundler treats it as client code. A package with no code, the docs, is
// checked for what deck.cool's docs contract lets it ship instead: markdown,
// nav.json and assets/. Mirrors
// decks/carouseldeck/scripts/verify-packaging.mjs, pared down: neither
// package has a subpath export or a server entry yet.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { publishablePackages } from './workspace-packages.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Every package whose every built module must start with the directive.
const CLIENT_PACKAGES = new Set(['@drawerdeck/react']);
const USE_CLIENT = /^(['"])use client\1;?\n/;
// Every file a docs package may ship, by its path in the tarball.
const DOCS_FILE = /^package\/(?:.+\.md|nav\.json|package\.json|assets\/.+)$/;

/** @param {string[]} args */
const pnpm = (args) =>
  execFileSync('pnpm', args, { cwd: repoRoot, stdio: 'inherit' });

/** @param {string[]} args */
const passes = (args) => {
  try {
    pnpm(args);
    return true;
  } catch {
    return false;
  }
};

const packages = publishablePackages(repoRoot);
const failures = [];

// Build the packages the tarballs are packed from.
pnpm(['--filter', './packages/*', 'build']);

for (const { manifest } of packages) {
  const { name } = manifest;

  if (manifest.exports === undefined) {
    const destination = mkdtempSync(join(tmpdir(), 'drawerdeck-pack-'));
    try {
      pnpm(['--filter', name, 'pack', '--pack-destination', destination]);
      const tarball = join(destination, readdirSync(destination)[0] ?? '');
      const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
        .split('\n')
        .filter((file) => file !== '');
      for (const file of files.filter((file) => !DOCS_FILE.test(file))) {
        failures.push(`${name} ships ${file}, which is not docs`);
      }
      console.log(`\n--- publint: ${name} ---`);
      if (!passes(['exec', 'publint', 'run', '--strict', tarball])) {
        failures.push(`publint failed for ${name}`);
      }
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
    continue;
  }

  const destination = mkdtempSync(join(tmpdir(), 'drawerdeck-pack-'));
  try {
    pnpm(['--filter', name, 'pack', '--pack-destination', destination]);
    const tarball = join(destination, readdirSync(destination)[0]);

    if (CLIENT_PACKAGES.has(name)) {
      // Every built module the tarball ships.
      execFileSync('tar', ['-xzf', tarball, '-C', destination]);
      const dist = join(destination, 'package/dist');
      for (const file of readdirSync(dist).filter((f) => f.endsWith('.js'))) {
        const client = USE_CLIENT.test(readFileSync(join(dist, file), 'utf8'));
        if (!client) {
          failures.push(
            `${name}'s dist/${file} does not start with 'use client'`
          );
        }
      }
    }

    console.log(`\n--- publint: ${name} ---`);
    if (!passes(['exec', 'publint', 'run', '--strict', tarball])) {
      failures.push(`publint failed for ${name}`);
    }

    // ESM only by design: the esm-only profile stops attw reporting the
    // CommonJS and node10 resolution modes these packages do not support.
    console.log(`\n--- attw: ${name} ---`);
    if (!passes(['exec', 'attw', '--pack', tarball, '--profile', 'esm-only'])) {
      failures.push(`attw failed for ${name}`);
    }
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`\n${packages.length} packages pass publint and attw.`);
