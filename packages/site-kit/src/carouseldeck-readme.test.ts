import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { comparison, fence, readCarouseldeckRelease, README, CAROUSELDECK, carouseldeckRow, carouseldeckSize } from "./carouseldeck-readme.ts";
import { fixtureReadme } from "./carouseldeck-readme.fixture.ts";

const table = [
  '| Library    | Version   | Min+gzip | Native scroll | Accessibility out of the box | API shape |',
  '| ---------- | --------- | -------- | ------------- | ---------------------------- | --------- |',
  '| `a-lib`    | this repo | 1.25 KB  | Yes: snap     | Labelled, "n of m"           | Parts     |',
  '| `b-lib`    | 2.0.0     | 3.50 KB  | No: `x(…)`    | None                         | A hook    |'
].join('\n');

const readme = (between: string) =>
  [
    '# Title',
    '',
    '## Quickstart',
    '',
    '```tsx',
    "import * as Deck from '@carouseldeck/react';",
    '',
    '<Deck.Root />',
    '```',
    '',
    '## Comparison',
    '',
    '| Not | The | Table |',
    '| --- | --- | ----- |',
    '',
    '<!-- comparison:start -->',
    between,
    '<!-- comparison:end -->'
  ].join('\n');

test('comparison reads each row between the markers, cell by cell', () => {
  expect(comparison(readme(`\n${table}\n\nMin+gzip: notes.\n`))).toEqual([
    {
      library: 'a-lib',
      version: 'this repo',
      size: '1.25 KB',
      nativeScroll: 'Yes: snap',
      accessibility: 'Labelled, "n of m"',
      api: 'Parts'
    },
    {
      library: 'b-lib',
      version: '2.0.0',
      size: '3.50 KB',
      nativeScroll: 'No: `x(…)`',
      accessibility: 'None',
      api: 'A hook'
    }
  ]);
});

test('comparison follows the table: a new size is a new value', () => {
  const [row] = comparison(readme(table.replace('1.25 KB', '9.99 KB')));
  expect(row?.size).toBe('9.99 KB');
});

test('comparison refuses a README without the markers or a table', () => {
  expect(() => comparison('# No markers')).toThrow(/comparison:start/);
  expect(() => comparison(readme('No table.'))).toThrow(/table/);
});

test('comparison refuses a table whose columns moved', () => {
  expect(() => comparison(readme(table.replace('Min+gzip', 'Size')))).toThrow(/Min\+gzip/);
});

test('comparison refuses a row whose cells do not match the header', () => {
  const short = table.replace('| A hook    |', '|');
  expect(() => comparison(readme(short))).toThrow(/b-lib.*5 cells.*6/);
});

test("carouseldeckRow finds carouseldeck's row by its name, wherever it is", () => {
  const rows = comparison(readme(table.replace('`b-lib`', `\`${CAROUSELDECK}\``)));
  expect(carouseldeckRow(rows).size).toBe('3.50 KB');
});

test("carouseldeckRow refuses a comparison without carouseldeck's row", () => {
  expect(() => carouseldeckRow(comparison(readme(table)))).toThrow(/@carouseldeck\/react/);
});

test("fence reads the first code block of a section, by the section's heading", () => {
  expect(fence(readme(table), 'Quickstart')).toBe("import * as Deck from '@carouseldeck/react';\n\n<Deck.Root />");
  expect(() => fence(readme(table), 'Install')).toThrow(/Install/);
});

test("fence closes a block of N backticks at the first unindented line of N or more", () => {
  const readme = ["## Quickstart", "", "```tsx", "<Deck.Root />", "````", "<img src=x onerror=alert(1)>", "```", ""].join("\n");
  expect(fence(readme, "Quickstart")).toBe("<Deck.Root />");
});

test("carouseldeckSize is carouseldeck's Min+gzip cell, whatever the README says", () => {
  expect(carouseldeckSize(fixtureReadme("12.34 KB"))).toBe("12.34 KB");
  expect(carouseldeckSize(fixtureReadme("7.5 KB"))).toBe("7.5 KB");
});


describe("readCarouseldeckRelease", () => {
  // A repo with a site in sites/a/, and the README at its path in the deck.
  let repo = "";
  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true });
    repo = "";
  });

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "tag.gpgSign=false", "-c", "commit.gpgSign=false", ...args], { cwd: repo });

  function makeRepo(): URL {
    repo = mkdtempSync(join(tmpdir(), "repo-"));
    git("init", "-q");
    mkdirSync(join(repo, "sites/a"), { recursive: true });
    return pathToFileURL(`${repo}/sites/a/`);
  }

  function commitReadme(size: string) {
    mkdirSync(join(repo, README, ".."), { recursive: true });
    writeFileSync(join(repo, README), fixtureReadme(size));
    git("add", "-A");
    git("commit", "-q", "-m", size);
  }

  function install(site: URL, size: string, version: string) {
    const dir = new URL(`node_modules/${CAROUSELDECK}/`, site);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL("README.md", dir), fixtureReadme(size));
    writeFileSync(new URL("package.json", dir), JSON.stringify({ name: CAROUSELDECK, version }));
  }

  test("reads the README at the latest release tag, not the working tree or the installed package", () => {
    const site = makeRepo();
    commitReadme("1.00 KB");
    git("tag", "@carouseldeck/react@1.9.0");
    commitReadme("2.00 KB");
    git("tag", "@carouseldeck/react@1.10.0");
    commitReadme("3.00 KB");
    install(site, "4.00 KB", "9.9.9");

    const release = readCarouseldeckRelease(site);
    expect(carouseldeckSize(release.readme)).toBe("2.00 KB");
    expect(release.version).toBe("1.10.0");
  });

  test("skips prerelease tags and other packages' tags", () => {
    const site = makeRepo();
    commitReadme("1.00 KB");
    git("tag", "@carouseldeck/react@1.2.0");
    commitReadme("2.00 KB");
    git("tag", "@carouseldeck/react@1.3.0-next.0");
    git("tag", "@carouseldeck/core@1.4.0");

    expect(readCarouseldeckRelease(site)).toEqual({ readme: fixtureReadme("1.00 KB"), version: "1.2.0" });
  });

  // Until the first carouseldeck release is tagged (#114).
  test("with no release tag, reads the installed package", () => {
    const site = makeRepo();
    commitReadme("1.00 KB");
    install(site, "4.00 KB", "1.1.0");

    expect(readCarouseldeckRelease(site)).toEqual({ readme: fixtureReadme("4.00 KB"), version: "1.1.0" });
  });

  test("with no release tag and nothing installed, names the package", () => {
    const site = makeRepo();
    expect(() => readCarouseldeckRelease(site)).toThrow(/no @carouseldeck\/react installed/);
  });

  test("names the site and the tag when git cannot show the README at the tag", () => {
    const site = makeRepo();
    writeFileSync(join(repo, "other.md"), "No README here.");
    git("add", "-A");
    git("commit", "-q", "-m", "no readme");
    git("tag", "@carouseldeck/react@1.2.0");

    expect(() => readCarouseldeckRelease(site)).toThrow(
      new RegExp(`site at ${site.pathname}.*@carouseldeck/react@1\\.2\\.0.*fetch-depth: 0`),
    );
  });

  test("outside a git repo, fails rather than guessing", () => {
    repo = mkdtempSync(join(tmpdir(), "site-"));
    const site = pathToFileURL(`${repo}/`);
    install(site, "4.00 KB", "1.1.0");
    expect(() => readCarouseldeckRelease(site)).toThrow(/git/);
  });
});
