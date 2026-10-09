import { listEntries, openStore, syncCollection } from "@pagedeck/content";
import { describeError } from "@pagedeck/core";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { defineDocs } from "./index.ts";
import type { DocsOptions } from "./index.ts";

const FIXTURE = new URL("../fixtures/example-docs/", import.meta.url);

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A site directory holding a copy of the fixture docs package at
 * node_modules/@example/docs, with `edits` applied (a file mapped to undefined
 * is removed). Returns the URL of the site's would-be config file.
 */
function site(edits: Readonly<Record<string, string | undefined>> = {}): URL {
  const dir = mkdtempSync(join(tmpdir(), "docs-loader-"));
  made.push(dir);
  const docs = join(dir, "node_modules", "@example", "docs");
  cpSync(FIXTURE, docs, { recursive: true });
  for (const [file, text] of Object.entries(edits)) {
    if (text === undefined) rmSync(join(docs, file));
    else {
      mkdirSync(dirname(join(docs, file)), { recursive: true });
      writeFileSync(join(docs, file), text);
    }
  }
  return pathToFileURL(join(dir, "pagedeck.config.ts"));
}

function options(from: URL, overrides: Partial<DocsOptions> = {}): DocsOptions {
  return {
    from,
    package: "@example/docs",
    base: "/docs",
    layout: "docsPage",
    demos: { counter: "./components/counter.tsx" },
    languages: ["sh"],
    ...overrides,
  };
}

/** What `pagedeck sync` prints for the error a sync rejects with. */
async function failure(syncing: Promise<unknown>): Promise<string> {
  try {
    await syncing;
  } catch (error) {
    return describeError(error);
  }
  throw new Error("the sync passed");
}

async function sync(from: URL, overrides: Partial<DocsOptions> = {}) {
  const docs = defineDocs(options(from, overrides));
  const store = openStore(fileURLToPath(new URL("content.db", from)));
  try {
    await syncCollection(store, docs.collection);
    return { docs, entries: listEntries(store, docs.collection) };
  } finally {
    store.close();
  }
}

describe("a fixture that follows the contract", () => {
  test("syncs one entry per page, at its route under the base", async () => {
    const { entries } = await sync(site());
    expect(entries.map((entry) => [entry.path, entry.data.title, entry.data.href]).sort()).toEqual([
      ["docs/guides/demos", "Demos", "/docs/guides/demos/"],
      ["docs/guides/layout", "Layout", "/docs/guides/layout/"],
      ["docs/index", "Example", "/docs/"],
      ["docs/install", "Install", "/docs/install/"],
    ]);
  });

  test("gives every page the nav, in nav.json's order, with each page's title", async () => {
    const { entries } = await sync(site());
    const expected = [
      {
        label: "Start",
        pages: [
          { title: "Example", href: "/docs/" },
          { title: "Install", href: "/docs/install/" },
        ],
      },
      {
        label: "Guides",
        pages: [
          { title: "Layout", href: "/docs/guides/layout/" },
          { title: "Demos", href: "/docs/guides/demos/" },
        ],
      },
    ];
    for (const entry of entries) expect(entry.data.nav, entry.path).toEqual(expected);
  });

  test("rewrites relative .md links, inline and by reference, to routes", async () => {
    const { entries } = await sync(site());
    const html = (path: string) => entries.find((entry) => entry.path === path)?.data.body.map((part) => part.kind === "html" ? part.html : "").join("");
    expect(html("docs/index")).toContain('<a href="/docs/guides/layout/#the-grid">the layout grid</a>');
    expect(html("docs/guides/layout")).toContain('<a href="/docs/install/">first</a>');
    expect(html("docs/guides/layout")).toContain('<a href="/docs/guides/demos/">it live</a>');
  });

  test("points images at assets/ from the page's address, and copies the files to the content root", async () => {
    const from = site();
    const { docs, entries } = await sync(from);
    const layout = entries.find((entry) => entry.path === "docs/guides/layout");
    expect(layout?.data.body[0]).toMatchObject({ kind: "html" });
    expect(JSON.stringify(layout?.data.body)).toContain('<img src=\\"../../assets/grid.svg\\" alt=\\"The layout grid\\">');
    // The page is served at /docs/guides/layout/, so the image is /docs/assets/grid.svg.
    expect(readFileSync(join(docs.contentRoot, "docs/assets/grid.svg"), "utf8")).toBe(
      readFileSync(new URL("assets/grid.svg", FIXTURE), "utf8"),
    );
  });

  test("splits a page's body at each demo marker", async () => {
    const { entries } = await sync(site());
    const demos = entries.find((entry) => entry.path === "docs/guides/demos");
    expect(demos?.data.body).toEqual([
      { kind: "html", html: "<p>Press the button.</p>\n" },
      { kind: "demo", name: "counter" },
      { kind: "html", html: "<p>That was the demo.</p>\n" },
    ]);
  });
});

const LAYOUT = readFileSync(new URL("guides/layout.md", FIXTURE), "utf8");
const DEMOS = readFileSync(new URL("guides/demos.md", FIXTURE), "utf8");
const PAGE = "---\ntitle: Extra\ndescription: Not in the nav.\n---\n\nText.\n";

describe("the build fails, naming the file and line", () => {
  test.each<[string, Readonly<Record<string, string | undefined>>, Partial<DocsOptions>, string]>([
    [
      "a page with no title",
      { "install.md": "---\ndescription: How to install.\n---\n\nText.\n" },
      {},
      'install.md:1 — has no "title" in its frontmatter',
    ],
    [
      "a page with no description",
      { "install.md": "---\ntitle: Install\n---\n\nText.\n" },
      {},
      'install.md:1 — has no "description" in its frontmatter',
    ],
    ["a page nav.json does not list", { "guides/extra.md": PAGE }, {}, "guides/extra.md:1 — is not listed in nav.json"],
    [
      "a nav.json entry with no page",
      {
        "nav.json": readFileSync(new URL("nav.json", FIXTURE), "utf8").replace(
          '"guides/demos.md"',
          '"guides/demos.md", "guides/theming.md"',
        ),
      },
      {},
      'nav.json:3 — lists "guides/theming.md", which is not a page',
    ],
    ["a package with no nav.json", { "nav.json": undefined }, {}, "nav.json:1 — is missing"],
    [
      "a nav.json of another shape",
      { "nav.json": '{ "Start": ["index.md"] }\n' },
      {},
      'nav.json:1 — is not a list of groups, each written { "label": "Start", "pages": ["index.md"] }',
    ],
    [
      "a link to a missing page",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(../setup.md)") },
      {},
      'guides/layout.md:10 — links to "../setup.md", which is not a page in this package',
    ],
    [
      "a link by reference to a missing page",
      { "guides/layout.md": LAYOUT.replace("[demos]: ./demos.md", "[demos]: ./live.md") },
      {},
      'guides/layout.md:12 — links to "./live.md", which is not a page in this package',
    ],
    [
      "a relative link to a file that is not a page",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(../assets/grid.svg)") },
      {},
      'guides/layout.md:10 — links to "../assets/grid.svg", which is not a .md page — link a page by its .md file, and show a file under assets/ as an image',
    ],
    [
      "an image that is not under assets/",
      { "guides/layout.md": LAYOUT.replace("../assets/grid.svg", "../assets/missing.svg") },
      {},
      'guides/layout.md:8 — shows "../assets/missing.svg", which is not a file under assets/',
    ],
    [
      "a demo the site does not register",
      {},
      { demos: { chart: "./components/chart.tsx" } },
      'guides/demos.md:8 — marks demo "counter", which the site does not register — the site\'s demos are "chart"',
    ],
    [
      "a demo when the site registers none",
      {},
      { demos: {} },
      'guides/demos.md:8 — marks demo "counter", which the site does not register — the site\'s demos are none',
    ],
    [
      "a demo marker inside a paragraph",
      { "guides/demos.md": DEMOS.replace("Press the button.", "Press the button. <!-- demo:counter -->") },
      {},
      "guides/demos.md:6 — has a demo marker that is not on a line of its own — write it alone on its line, as <!-- demo:<name> -->",
    ],
  ])("%s", async (_name, edits, overrides, message) => {
    expect(await failure(sync(site(edits), overrides))).toBe(
      `Collection "docs": loader syncAll failed: Docs package "@example/docs": 1 problem — fix it in the docs package: ${message}`,
    );
  });

  test("names every problem in one run", async () => {
    const edits = { "install.md": "Text.\n", "guides/extra.md": PAGE };
    expect(await failure(sync(site(edits)))).toBe(
      'Collection "docs": loader syncAll failed: Docs package "@example/docs": 3 problems — fix each in the docs package: ' +
        "guides/extra.md:1 — is not listed in nav.json; " +
        'install.md:1 — has no "title" in its frontmatter; ' +
        'install.md:1 — has no "description" in its frontmatter',
    );
  });

  test("writes nothing to the store or the content root", async () => {
    const from = site();
    const docs = defineDocs(options(from));
    await syncCollection(openStore(fileURLToPath(new URL("content.db", from))), docs.collection);
    const broken = site({ "install.md": "Text.\n" });
    // Same site directory, now with a broken package.
    cpSync(new URL("node_modules/", broken), new URL("node_modules/", from), { recursive: true });
    const store = openStore(fileURLToPath(new URL("content.db", from)));
    expect(await failure(syncCollection(store, docs.collection))).toContain("install.md:1");
    expect(listEntries(store, docs.collection).map((entry) => entry.data.title)).toContain("Install");
    store.close();
    expect(readFileSync(join(docs.contentRoot, "docs/assets/grid.svg"), "utf8")).toContain("<svg");
  });
});
