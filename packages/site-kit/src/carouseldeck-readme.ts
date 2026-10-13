// What the sites read about @carouseldeck/react's latest release at build time,
// its README and its version, so each page says what the README says and
// `compare:check` keeps both honest: carouseldeck's home page and deck.cool's
// carouseldeck card read the same figure (ADR 0002).
import { execFileSync } from "node:child_process";

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

/** carouseldeck's package, as the comparison and its release tags name it. */
export const CAROUSELDECK = '@carouseldeck/react';

/** The package's README, from the repo's root. */
export const README = 'decks/carouseldeck/packages/react/README.md';

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

/** carouseldeck's own row of the comparison. */
export function carouseldeckRow(libraries: readonly Library[]): Library {
  const row = libraries.find((library) => library.library === CAROUSELDECK);
  if (row === undefined) {
    throw new Error(`The README's comparison has no row for ${CAROUSELDECK}.`);
  }
  return row;
}

/**
 * The first code block under the README's `## heading`, without its fence. A
 * fence of N backticks closes at the first unindented line of N or more.
 */
export function fence(readme: string, heading: string): string {
  const section = readme
    .split(/^## /m)
    .find((part) => part.startsWith(`${heading}\n`));
  const code = section && /^(`{3,})\w*\n([^]*?)\n\1`*$/m.exec(section)?.[2];
  if (code === undefined) {
    throw new Error(`The README has no code block under "## ${heading}".`);
  }
  return code;
}

/** carouseldeck's min+gzip size, as the README's comparison measures it: "8.86 KB". */
export function carouseldeckSize(readme: string): string {
  return carouseldeckRow(comparison(readme)).size;
}

/** What a site says about the release: its README, and its version as "1.2.0". */
export interface Release {
  readme: string;
  version: string;
}

const git = (cwd: URL, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** The highest `@carouseldeck/react@MAJOR.MINOR.PATCH` tag in the repo `site` is in, or none. */
function latestTag(site: URL): string | undefined {
  return git(site, "tag", "--list", `${CAROUSELDECK}@*`, "--sort=-v:refname")
    .split("\n")
    .find((tag) => /^\d+\.\d+\.\d+$/.test(tag.slice(CAROUSELDECK.length + 1)));
}

/**
 * The latest carouseldeck release, as the repo `site` is in tags it: the
 * README at the tag, with `git show`, so a page matches npm and not unreleased
 * work. CI must fetch the tags, or this throws.
 */
export function readCarouseldeckRelease(site: URL): Release {
  const tag = latestTag(site);
  if (tag === undefined) {
    throw new Error(
      `The site at ${site.pathname} has no ${CAROUSELDECK}@X.Y.Z tag: the checkout needs its tags (fetch-depth: 0 on actions/checkout, or git fetch --tags).`,
    );
  }
  let readme: string;
  try {
    readme = git(site, "show", `${tag}:${README}`);
  } catch (error) {
    throw new Error(
      `The site at ${site.pathname} cannot read ${README} at ${tag}: the checkout needs the tag's history (fetch-depth: 0, or fetch the tags).`,
      { cause: error },
    );
  }
  return { readme, version: tag.slice(CAROUSELDECK.length + 1) };
}
