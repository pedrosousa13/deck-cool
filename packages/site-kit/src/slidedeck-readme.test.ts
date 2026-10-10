import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { comparison, fence, readSlidedeckReadme, readSlidedeckVersion, SLIDEDECK, slidedeckRow, slidedeckSize } from "./slidedeck-readme.ts";
import { fixtureReadme } from "./slidedeck-readme.fixture.ts";

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
    "import * as Deck from '@slidedeck/react';",
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

test("slidedeckRow finds slidedeck's row by its name, wherever it is", () => {
  const rows = comparison(readme(table.replace('`b-lib`', `\`${SLIDEDECK}\``)));
  expect(slidedeckRow(rows).size).toBe('3.50 KB');
});

test("slidedeckRow refuses a comparison without slidedeck's row", () => {
  expect(() => slidedeckRow(comparison(readme(table)))).toThrow(/@slidedeck\/react/);
});

test("fence reads the first code block of a section, by the section's heading", () => {
  expect(fence(readme(table), 'Quickstart')).toBe("import * as Deck from '@slidedeck/react';\n\n<Deck.Root />");
  expect(() => fence(readme(table), 'Install')).toThrow(/Install/);
});

test("slidedeckSize is slidedeck's Min+gzip cell, whatever the README says", () => {
  expect(slidedeckSize(fixtureReadme("12.34 KB"))).toBe("12.34 KB");
  expect(slidedeckSize(fixtureReadme("7.5 KB"))).toBe("7.5 KB");
});

test("readSlidedeckReadme reads the README of the @slidedeck/react a site has installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    const dir = join(site, "node_modules/@slidedeck/react");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), fixtureReadme("12.34 KB"));
    const readme = readSlidedeckReadme(pathToFileURL(`${site}/`));
    expect(slidedeckSize(readme)).toBe("12.34 KB");
  } finally {
    rmSync(site, { recursive: true });
  }
});

test("readSlidedeckReadme names the package a site has not installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    expect(() => readSlidedeckReadme(pathToFileURL(`${site}/`))).toThrow(/@slidedeck\/react/);
  } finally {
    rmSync(site, { recursive: true });
  }
});

test("readSlidedeckVersion reads the version of the @slidedeck/react a site has installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    const dir = join(site, "node_modules/@slidedeck/react");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: SLIDEDECK, version: "12.34.56" }));
    expect(readSlidedeckVersion(pathToFileURL(`${site}/`))).toBe("12.34.56");
  } finally {
    rmSync(site, { recursive: true });
  }
});

test("readSlidedeckVersion names the package a site has not installed", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  try {
    expect(() => readSlidedeckVersion(pathToFileURL(`${site}/`))).toThrow(/@slidedeck\/react/);
  } finally {
    rmSync(site, { recursive: true });
  }
});
