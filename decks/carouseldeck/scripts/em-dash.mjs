// Em dashes in a docs package's markdown (pedrosousa13/deck-cool#126): this
// repo's style avoids them, in prose and in a code sample alike, since a
// sample renders as page text too.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageFiles } from './docs-contract.mjs';

/** @typedef {{ file: string; line: number; message: string }} Fault */

const EM_DASH = /—|&mdash;/;

/**
 * Every em dash, or `&mdash;` entity, in the docs package's markdown at
 * `root`.
 * @param {string} root
 * @returns {Fault[]}
 */
export const emDashFaults = (root) => {
  /** @type {Fault[]} */
  const faults = [];
  for (const file of pageFiles(root)) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (EM_DASH.test(line)) {
        faults.push({ file, line: index + 1, message: 'has an em dash' });
      }
    });
  }
  return faults;
};
