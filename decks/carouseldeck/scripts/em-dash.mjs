// Em dashes, and two hyphens standing in for one, in a docs package's
// markdown (pedrosousa13/deck-cool#126, #202): this repo's style avoids
// both, in prose and in a code sample's comment alike, since a sample
// renders as page text too. A code sample's actual code is not prose: a CSS
// custom property (`--deck-viewport-step`), a CLI flag (`--only`), a
// decrement (`--i`) and a shell end-of-options marker
// (`git checkout -- file`) all either butt `--` straight against the next
// word, with no space, or, for the shell marker, read as code rather than a
// comment on their line. So the two-hyphen check reads `--` as a dash only
// where it would read as English:
//
// - Outside a fenced block, every inline code span is masked first, to the
//   same length, so a span's own `--` is never read as one, while a dash
//   right outside it still has the span's closing backtick, not a space,
//   for a neighbour.
// - Inside a fence, only a comment line is read, never a line of code,
//   however much its shape looks like a sentence's. A comment line is a
//   `//` line, a line that opens or continues an open `/* ... */` block
//   comment (so a lone `*`, CSS's universal selector, is code unless a
//   block comment is actually open over it, not every line starting with
//   one), and, only in a shell-like fence (`sh`, `bash`, `shell`, `console`
//   or `zsh`; an unlabelled fence is read as code, not assumed shell), a
//   `#` line (so CSS's `#id` selector in a `css` fence is never misread as
//   a shell comment).
//
// On a comment or prose line, `--` reads as a dash in the shapes a sentence
// actually uses it in: a space on both sides (`word -- word`), a word
// character directly on both sides (`word--word`), or a dash a line ends
// or opens on, a sentence continuing onto the next line (` --` after a
// non-space, trailing the line; `-- ` before a non-space, opening the
// line). None of those is a markdown table rule, a front-matter delimiter,
// a list marker or a horizontal rule: none of those has a space or a word
// character on both sides of its hyphens in the first place.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageFiles } from './docs-contract.mjs';

/** @typedef {{ file: string; line: number; message: string }} Fault */

const EM_DASH = /—|&mdash;/;
const TWO_HYPHEN_DASH = /(?:\S -- \S)|(?:\w--\w)|(?:\S --$)|(?:^-- \S)/;
const INLINE_CODE = /`[^`\n]*`/g;
const FENCE = /^\s*```(\S*)/;
const LINE_COMMENT = /^\s*\/\//;
const BLOCK_COMMENT_START = /\/\*/;
const BLOCK_COMMENT_END = /\*\//;
const SHELL_COMMENT = /^\s*#/;
/** Fence info strings read as shell, so a `#` line in them is a comment. */
const SHELL_FENCE_LANGS = new Set(['sh', 'bash', 'shell', 'console', 'zsh']);

/**
 * Every em dash, `&mdash;` entity, or two hyphens standing in for a dash, in
 * the docs package's markdown at `root`.
 * @param {string} root
 * @returns {Fault[]}
 */
export const emDashFaults = (root) => {
  /** @type {Fault[]} */
  const faults = [];
  for (const file of pageFiles(root)) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    let inFence = false;
    let fenceLang = '';
    let inBlockComment = false;
    lines.forEach((line, index) => {
      if (EM_DASH.test(line)) {
        faults.push({ file, line: index + 1, message: 'has an em dash' });
      }
      const fence = FENCE.exec(line);
      if (fence) {
        inFence = !inFence;
        fenceLang = inFence ? fence[1].toLowerCase() : '';
        inBlockComment = false;
        return;
      }
      let prose;
      if (inFence) {
        const wasInBlockComment = inBlockComment;
        const opensBlockComment =
          !wasInBlockComment && BLOCK_COMMENT_START.test(line);
        if (wasInBlockComment || opensBlockComment) {
          inBlockComment = !BLOCK_COMMENT_END.test(line);
        }
        const isComment =
          wasInBlockComment ||
          opensBlockComment ||
          LINE_COMMENT.test(line) ||
          (SHELL_FENCE_LANGS.has(fenceLang) && SHELL_COMMENT.test(line));
        prose = isComment ? line : undefined;
      } else {
        prose = line.replace(INLINE_CODE, (span) => 'x'.repeat(span.length));
      }
      if (prose !== undefined && TWO_HYPHEN_DASH.test(prose)) {
        faults.push({ file, line: index + 1, message: 'uses -- as a dash' });
      }
    });
  }
  return faults;
};
