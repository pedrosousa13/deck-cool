import { listEntries, openStore, syncCollection, syncCollectionSince } from "@pagedeck/content";
import { describeError } from "@pagedeck/core";
import type { Page } from "@pagedeck/core";
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

/**
 * The docs package's report in what `pagedeck sync` prints for a failed sync, without
 * Pagedeck's own wrapper, so a change to Pagedeck's wording does not break these tests.
 */
async function failure(syncing: Promise<unknown>): Promise<string> {
  try {
    await syncing;
  } catch (error) {
    const printed = describeError(error);
    return printed.slice(printed.indexOf('Docs package "'));
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
      ["docs/guides/index", "Guides", "/docs/guides/"],
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
          { title: "Guides", href: "/docs/guides/" },
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
    expect(html("docs/guides/index")).toContain('<a href="/docs/guides/layout/">the layout</a>');
  });

  test("keeps http:, https: and mailto: links as they are", async () => {
    const links = "[a](http://example.com/a) [b](HTTPS://example.com/b) [c](mailto:me@example.com) <https://example.com/d>";
    const { entries } = await sync(site({ "install.md": `---\ntitle: Install\ndescription: How.\n---\n\n${links}\n` }));
    const html = JSON.stringify(entries.find((entry) => entry.path === "docs/install")?.data.body);
    for (const href of ["http://example.com/a", "HTTPS://example.com/b", "mailto:me@example.com", "https://example.com/d"]) {
      expect(html).toContain(`href=\\"${href}\\"`);
    }
  });

  test("reads a page with CRLF line ends as it reads one with LF", async () => {
    const layout = readFileSync(new URL("guides/layout.md", FIXTURE), "utf8");
    const body = async (text: string) =>
      JSON.stringify((await sync(site({ "guides/layout.md": text }))).entries.find((entry) => entry.path === "docs/guides/layout")?.data.body);
    const crlf = await body(layout.replace(/\n/g, "\r\n"));
    expect(crlf).toBe(await body(layout));
    expect(crlf).toContain('<a href=\\"/docs/install/\\">first</a>');
  });

  test("drops a page's first # heading, as the contract says: the site shows the title", async () => {
    const { entries } = await sync(site({ "install.md": "---\ntitle: Install\ndescription: How.\n---\n\n# Install\n\nText.\n" }));
    const install = entries.find((entry) => entry.path === "docs/install");
    expect(install?.data.body).toEqual([{ kind: "html", html: "<p>Text.</p>\n" }]);
  });

  test("highlights code with the theme the site names", async () => {
    const { entries } = await sync(site(), { theme: "github-dark" });
    const install = entries.find((entry) => entry.path === "docs/install");
    // github-dark's background; Pagedeck's default theme, github-light, is #fff.
    expect(JSON.stringify(install?.data.body)).toContain("background-color:#24292e");
  });

  test("reads a pinned npm install and a workspace link of the same package as the same pages and nav", async () => {
    // Inside packages/docs, so Node finds @example/docs at the workspace link in its node_modules.
    mkdirSync(fileURLToPath(new URL("../.test-sites/", import.meta.url)), { recursive: true });
    const linked = mkdtempSync(fileURLToPath(new URL("../.test-sites/workspace-", import.meta.url)));
    made.push(linked);
    const workspace = await sync(pathToFileURL(join(linked, "pagedeck.config.ts")));
    // A copy laid out as npm installs a pinned version: node_modules/@example/docs.
    const pinned = await sync(site());
    const pages = (entries: typeof pinned.entries) => entries.map(({ path, data }) => ({ path, data }));
    expect(pages(workspace.entries)).toHaveLength(5);
    expect(pages(workspace.entries)).toEqual(pages(pinned.entries));
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

  test("syncs incrementally (pagedeck sync --incremental) as it syncs in full", async () => {
    const from = site();
    const docs = defineDocs(options(from));
    const store = openStore(fileURLToPath(new URL("content.db", from)));
    await syncCollection(store, docs.collection);
    await syncCollectionSince(store, docs.collection);
    expect(listEntries(store, docs.collection)).toHaveLength(5);
    store.close();
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
  const nav = readFileSync(new URL("nav.json", FIXTURE), "utf8");

  test.each<[string, Readonly<Record<string, string | undefined>>, Partial<DocsOptions>, string]>([
    [
      "a page with no title",
      { "install.md": "---\ndescription: How to install.\n---\n\nText.\n" },
      {},
      'install.md:1 — has no "title" in its frontmatter — add title: <the page\'s title> to its frontmatter',
    ],
    [
      "a page with no description",
      { "install.md": "---\ntitle: Install\n---\n\nText.\n" },
      {},
      'install.md:1 — has no "description" in its frontmatter — add description: <one sentence on the page> to its frontmatter',
    ],
    [
      "a page nav.json does not list",
      { "guides/extra.md": PAGE },
      {},
      'guides/extra.md:1 — is not listed in nav.json — add "guides/extra.md" to a group in nav.json',
    ],
    [
      "a nav.json entry with no page",
      { "nav.json": nav.replace('"guides/demos.md"', '"guides/demos.md", "guides/theming.md"') },
      {},
      'nav.json:3 — lists "guides/theming.md", which is not a page — remove it, or add the page',
    ],
    [
      "a page nav.json lists twice in one group",
      { "nav.json": nav.replace('"install.md"', '"install.md", "install.md"') },
      {},
      'nav.json:2 — lists "install.md" a second time — list each page once',
    ],
    [
      "a page nav.json lists in two groups",
      { "nav.json": nav.replace('"guides/demos.md"', '"guides/demos.md", "install.md"') },
      {},
      'nav.json:3 — lists "install.md" a second time — list each page once',
    ],
    [
      "a package with no nav.json",
      { "nav.json": undefined },
      {},
      'nav.json:1 — is missing — add nav.json at the package root: [{ "label": "Start", "pages": ["index.md"] }]',
    ],
    [
      "a nav.json of another shape",
      { "nav.json": '{ "Start": ["index.md"] }\n' },
      {},
      'nav.json:1 — is not a list of groups — write it as [{ "label": "Start", "pages": ["index.md"] }]',
    ],
    [
      "two pages with one route",
      {
        "guides.md": "---\ntitle: All guides\ndescription: Every guide.\n---\n\nText.\n",
        "nav.json": nav.replace('"guides/index.md"', '"guides.md", "guides/index.md"'),
      },
      {},
      "guides/index.md:1 — has the route /docs/guides/, as guides.md does — rename or remove one of the two",
    ],
    [
      "a link to a missing page",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(../setup.md)") },
      {},
      'guides/layout.md:10 — links to "../setup.md", which is not a page in this package — fix the link, or add the page',
    ],
    [
      "a link by reference to a missing page",
      { "guides/layout.md": LAYOUT.replace("[demos]: ./demos.md", "[demos]: ./live.md") },
      {},
      'guides/layout.md:12 — links to "./live.md", which is not a page in this package — fix the link, or add the page',
    ],
    [
      "a relative link to a file that is not a page",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(../assets/grid.svg)") },
      {},
      'guides/layout.md:10 — links to "../assets/grid.svg", which is not a .md page — link a page by its .md file, and show a file under assets/ as an image',
    ],
    [
      "a link the loader cannot rewrite",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(..\\/install.md)") },
      {},
      'guides/layout.md:10 — links to "../install.md" in a form the loader cannot rewrite — write the path plainly, with no backslash escapes or character references',
    ],
    [
      "an image that is not under assets/",
      { "guides/layout.md": LAYOUT.replace("../assets/grid.svg", "../assets/missing.svg") },
      {},
      'guides/layout.md:8 — shows "../assets/missing.svg", which is not a file under assets/ — add it under assets/, or fix the path',
    ],
    [
      "a demo the site does not register",
      {},
      { demos: { chart: "./components/chart.tsx" } },
      'guides/demos.md:8 — marks demo "counter", which the site does not register — use a demo the site registers ("chart"), or have the site register "counter"',
    ],
    [
      "a demo when the site registers none",
      {},
      { demos: {} },
      'guides/demos.md:8 — marks demo "counter", which the site does not register — the site registers no demos; remove the marker, or have the site register "counter"',
    ],
    [
      "a demo marker inside a paragraph",
      { "guides/demos.md": DEMOS.replace("Press the button.", "Press the button. <!-- demo:counter -->") },
      {},
      "guides/demos.md:6 — has a demo marker that is not on a line of its own — write it alone on its line, as <!-- demo:<name> -->",
    ],
    [
      "raw HTML in a block of its own",
      { "guides/demos.md": DEMOS.replace("Press the button.", "<script>alert(1)</script>") },
      {},
      "guides/demos.md:6 — has raw HTML, <script>alert(1)</script> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "raw HTML inside a paragraph",
      { "guides/demos.md": DEMOS.replace("Press the button.", 'Press <img src="x" onerror="alert(1)"> the button.') },
      {},
      'guides/demos.md:6 — has raw HTML, <img src="x" onerror="alert(1)"> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->',
    ],
    [
      "an HTML comment that is not a demo marker",
      { "guides/demos.md": DEMOS.replace("Press the button.", "<!-- a note -->") },
      {},
      "guides/demos.md:6 — has raw HTML, <!-- a note --> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "a javascript: link",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(javascript:alert(1))") },
      {},
      'guides/layout.md:10 — links to "javascript:alert(1)", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "a javascript: link by reference",
      { "guides/layout.md": LAYOUT.replace("[demos]: ./demos.md", "[demos]: javascript:alert(1)") },
      {},
      'guides/layout.md:12 — links to "javascript:alert(1)", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "a javascript: autolink",
      { "guides/layout.md": LAYOUT.replace("[first](../install.md)", "<javascript:alert(1)>") },
      {},
      'guides/layout.md:10 — links to "javascript:alert(1)", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "a data: image",
      { "guides/layout.md": LAYOUT.replace("../assets/grid.svg", "data:image/svg+xml,x") },
      {},
      'guides/layout.md:8 — links to "data:image/svg+xml,x", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "an HTML block in a file with CRLF line ends",
      { "guides/demos.md": DEMOS.replace("Press the button.", "<div>\n<script>alert(1)</script>\n</div>").replace(/\n/g, "\r\n") },
      {},
      "guides/demos.md:6 — has raw HTML, <div> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "a javascript: link definition over two lines, with CRLF line ends",
      { "guides/layout.md": LAYOUT.replace("[demos]: ./demos.md", "[demos]:\n  javascript:alert(1)").replace(/\n/g, "\r\n") },
      {},
      'guides/layout.md:12 — links to "javascript:alert(1)", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "raw HTML in a file with lone CR line ends",
      { "guides/demos.md": DEMOS.replace("Press the button.", "<script>alert(1)</script>").replace(/\n/g, "\r") },
      {},
      "guides/demos.md:6 — has raw HTML, <script>alert(1)</script> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "HTML over several lines of a block quote, which the loader cannot place",
      { "guides/demos.md": DEMOS.replace("Press the button.", "> <div>\n> <script>alert(1)</script>\n> </div>") },
      {},
      "guides/demos.md:6 — has HTML the loader cannot find in the file, <div> — write it on lines of its own, outside any block quote or list",
    ],
    [
      "a protocol-relative link",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(//example.com/install)") },
      {},
      'guides/layout.md:10 — links to "//example.com/install", which names no scheme — link to another host with https:, or to a page by its .md file',
    ],
    [
      "a protocol-relative link written with backslashes",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(\\\\\\\\example.com/install)") },
      {},
      'guides/layout.md:10 — links to "\\\\example.com/install", which names no scheme — link to another host with https:, or to a page by its .md file',
    ],
  ])("%s", async (_name, edits, overrides, message) => {
    expect(await failure(sync(site(edits), overrides))).toBe(
      `Docs package "@example/docs": 1 problem — fix it in the docs package: ${message}`,
    );
  });

  test("a code fence in a language the site does not load, by Pagedeck's own check", async () => {
    const printed = await sync(site(), { languages: [] }).then(() => "the sync passed", describeError);
    expect(printed).toContain('Markdown "install.md": 1 code language is not loaded');
  });

  test("names every problem in one run", async () => {
    const edits = { "install.md": "Text.\n", "guides/extra.md": PAGE };
    expect(await failure(sync(site(edits)))).toBe(
      'Docs package "@example/docs": 3 problems — fix each in the docs package: ' +
        'guides/extra.md:1 — is not listed in nav.json — add "guides/extra.md" to a group in nav.json; ' +
        'install.md:1 — has no "title" in its frontmatter — add title: <the page\'s title> to its frontmatter; ' +
        'install.md:1 — has no "description" in its frontmatter — add description: <one sentence on the page> to its frontmatter',
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

describe("the content callback", () => {
  async function synced(overrides: Partial<DocsOptions> = {}) {
    const from = site();
    const docs = defineDocs(options(from, overrides));
    const store = openStore(fileURLToPath(new URL("content.db", from)));
    await syncCollection(store, docs.collection);
    made.push(fileURLToPath(new URL(".", from)));
    return { docs, store };
  }

  function page(path: `/${string}`, entry?: string): Page {
    return {
      locale: "en",
      path,
      output: `${path}index.html`,
      dependencies: [],
      ...(entry === undefined ? {} : { collection: "docs", entry: { locale: "en", path: entry } }),
    };
  }

  test("renders the layout around the prose and the demo", async () => {
    const { docs, store } = await synced();
    const content = docs.content(page("/docs/guides/demos/", "docs/guides/demos"), store);
    expect(content.tree?.[0]).toMatchObject({
      component: "docsPage",
      props: { title: "Demos", description: "The example, live.", href: "/docs/guides/demos/" },
      children: [
        { component: "docsProse", props: { html: "<p>Press the button.</p>\n" } },
        { component: "docsDemo:counter" },
        { component: "docsProse", props: { html: "<p>That was the demo.</p>\n" } },
      ],
    });
    store.close();
  });

  test("refuses a page whose address disagrees with the loader's trailingSlash", async () => {
    const { docs, store } = await synced({ trailingSlash: "never" });
    expect(() => docs.content(page("/docs/install/", "docs/install"), store)).toThrow(
      'Docs page /docs/install/: the docs loader linked it as "/docs/install" — give defineDocs the trailingSlash the site\'s pages use',
    );
    store.close();
  });

  test("refuses a page from another source", async () => {
    const { docs, store } = await synced();
    expect(() => docs.content(page("/about/"), store)).toThrow(
      "Page /about/: is not a docs page — render it with build.content only for pages from the docs collection",
    );
    store.close();
  });
});
