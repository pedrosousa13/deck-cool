// What the sites read from the installed @slidedeck/react at build time, its
// README and its version, so each page says what the README says and
// `compare:check` keeps both honest: slidedeck's home page and deck.cool's
// slidedeck card read the same figure.
import { readFileSync } from "node:fs";

/** A row of the README's comparison, its cells as the README writes them. */
export interface Library {
  /** The package name, without its backticks. */
  library: string;
  version: string;
  /** Min+gzip, as "8.62 KB". */
  size: string;
  nativeScroll: string;
  accessibility: string;
  api: string;
}

/** Slidedeck's package, as the comparison names it. */
export const SLIDEDECK = '@slidedeck/react';

const START = '<!-- comparison:start -->';
const END = '<!-- comparison:end -->';
// The columns `pnpm compare` writes (scripts/compare-libraries.mjs), in order.
const COLUMNS = [
  'Library',
  'Version',
  'Min+gzip',
  'Native scroll',
  'Accessibility out of the box',
  'API shape'
];

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** The table `pnpm compare` generates between the comparison markers. */
export function comparison(readme: string): Library[] {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end < start) {
    throw new Error(`The README needs a ${START} line, then a ${END} line.`);
  }
  const lines = readme
    .slice(start + START.length, end)
    .split('\n')
    .filter((line) => line.trim().startsWith('|'));
  const [header, , ...rows] = lines;
  if (header === undefined || rows.length === 0) {
    throw new Error('The README has no table between its comparison markers.');
  }
  if (cells(header).join('|') !== COLUMNS.join('|')) {
    throw new Error(
      `The README's comparison columns are not ${COLUMNS.join(', ')}.`
    );
  }
  return rows.map((row) => {
    const found = cells(row);
    if (found.length !== COLUMNS.length) {
      throw new Error(
        `The README's comparison row "${row.trim()}" has ${String(found.length)} cells, not ${String(COLUMNS.length)}.`
      );
    }
    const [library, version, size, nativeScroll, accessibility, api] =
      found as [string, string, string, string, string, string];
    return {
      library: library.replace(/^`|`$/g, ''),
      version,
      size,
      nativeScroll,
      accessibility,
      api
    };
  });
}

/** Slidedeck's own row of the comparison. */
export function slidedeckRow(libraries: readonly Library[]): Library {
  const row = libraries.find((library) => library.library === SLIDEDECK);
  if (row === undefined) {
    throw new Error(`The README's comparison has no row for ${SLIDEDECK}.`);
  }
  return row;
}

/** The first code block under the README's `## heading`, without its fence. */
export function fence(readme: string, heading: string): string {
  const section = readme
    .split(/^## /m)
    .find((part) => part.startsWith(`${heading}\n`));
  const code = section && /^```\w*\n([^]*?)\n```$/m.exec(section)?.[1];
  if (code === undefined) {
    throw new Error(`The README has no code block under "## ${heading}".`);
  }
  return code;
}

/** Slidedeck's min+gzip size, as the README's comparison measures it: "8.84 KB". */
export function slidedeckSize(readme: string): string {
  return slidedeckRow(comparison(readme)).size;
}

/** A file of the @slidedeck/react installed in `site`, the site's directory. */
function readInstalled(site: URL, file: string): string {
  try {
    return readFileSync(new URL(`node_modules/${SLIDEDECK}/${file}`, site), "utf8");
  } catch (error) {
    throw new Error(`The site at ${site.pathname} has no ${SLIDEDECK} installed: add it to its dependencies.`, { cause: error });
  }
}

/** The README of the @slidedeck/react installed in `site`, the site's directory. */
export function readSlidedeckReadme(site: URL): string {
  return readInstalled(site, "README.md");
}

/** The version of the @slidedeck/react installed in `site`, as its package.json gives it. */
export function readSlidedeckVersion(site: URL): string {
  return (JSON.parse(readInstalled(site, "package.json")) as { version: string }).version;
}
