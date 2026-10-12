import { listEntries, openStore, syncCollection, syncCollectionSince } from "@pagedeck/content";
import { describeError } from "@pagedeck/core";
import type { Page } from "@pagedeck/core";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { defineDocs, demoComponent, docsHref, docsNav } from "./index.ts";
import type { DocsOptions } from "./index.ts";
import { rewriteProse, unsafeMarkup } from "./page.ts";

const FIXTURE = new URL("../fixtures/example-docs/", import.meta.url);

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A site directory holding a copy of the fixture docs package at
 * node_modules/@example/docs, with `edits` applied (a file or directory mapped
 * to undefined is removed). Returns the URL of the site's would-be config file.
 */
function site(edits: Readonly<Record<string, string | undefined>> = {}): URL {
  const dir = mkdtempSync(join(tmpdir(), "docs-loader-"));
  made.push(dir);
  const docs = join(dir, "node_modules", "@example", "docs");
  cpSync(FIXTURE, docs, { recursive: true });
  for (const [file, text] of Object.entries(edits)) {
    if (text === undefined) rmSync(join(docs, file), { recursive: true });
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

describe("docsHref", () => {
  test("gives a page's address from its file, as the contract's routes table does", () => {
    expect(docsHref("/docs", "index.md")).toBe("/docs/");
    expect(docsHref("/docs", "guides/layout.md")).toBe("/docs/guides/layout/");
    expect(docsHref("/docs", "guides/index.md")).toBe("/docs/guides/");
    expect(docsHref("/docs", "guides/layout.md", "never")).toBe("/docs/guides/layout");
    expect(docsHref("/", "index.md")).toBe("/");
  });
});

describe("docsNav", () => {
  test("gives each page in nav.json's order, with its address and the demos it marks", () => {
    expect(docsNav({ from: site(), package: "@example/docs", base: "/docs" })).toEqual([
      { file: "index.md", href: "/docs/", demos: [] },
      { file: "install.md", href: "/docs/install/", demos: [] },
      { file: "guides/index.md", href: "/docs/guides/", demos: [] },
      { file: "guides/layout.md", href: "/docs/guides/layout/", demos: [] },
      { file: "guides/demos.md", href: "/docs/guides/demos/", demos: ["counter"] },
    ]);
  });

  test("gives each page's address under the site's trailingSlash", () => {
    const pages = docsNav({ from: site(), package: "@example/docs", base: "/docs", trailingSlash: "never" });
    expect(pages.map(({ href }) => href)).toEqual(["/docs", "/docs/install", "/docs/guides", "/docs/guides/layout", "/docs/guides/demos"]);
  });

  test("gives a page's demos in order, as the build cuts the page, and not a marker in a code block", () => {
    const from = site({
      "guides/demos.md": `${DEMOS}\n<!-- demo:second -->\n\n\`\`\`html\n<!-- demo:quoted -->\n\`\`\`\n`,
    });
    const page = docsNav({ from, package: "@example/docs", base: "/docs" }).find(({ file }) => file === "guides/demos.md");
    expect(page?.demos).toEqual(["counter", "second"]);
  });

  test("fails on a nav.json the build would refuse", () => {
    expect(() => docsNav({ from: site({ "nav.json": undefined }), package: "@example/docs", base: "/docs" })).toThrow(
      'Docs package "@example/docs": 1 problem — fix it in the docs package: nav.json:1 — is missing',
    );
  });
});

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

  test("names a page in the nav by its label, when it has one, and keeps its title", async () => {
    const { entries } = await sync(site({ "install.md": "---\ntitle: Install slidedeck\nlabel: Install\ndescription: How.\n---\n\nText.\n" }));
    const install = entries.find((entry) => entry.path === "docs/install");
    expect(install?.data.title).toBe("Install slidedeck");
    expect(install?.data.nav[0]?.pages).toEqual([
      { title: "Example", href: "/docs/" },
      { title: "Install", href: "/docs/install/" },
    ]);
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
    const links =
      "[a](http://example.com/a) [b](HTTPS://example.com/b) [c](mailto:me@example.com) <https://example.com/d> " +
      "https://example.com/e www.example.com/f me@example.org";
    const { entries } = await sync(site({ "install.md": `---\ntitle: Install\ndescription: How.\n---\n\n${links}\n` }));
    const html = JSON.stringify(entries.find((entry) => entry.path === "docs/install")?.data.body);
    const hrefs = ["http://example.com/a", "HTTPS://example.com/b", "mailto:me@example.com", "https://example.com/d"];
    for (const href of [...hrefs, "https://example.com/e", "http://www.example.com/f", "mailto:me@example.org"]) {
      expect(html).toContain(`href=\\"${href}\\"`);
    }
  });

  test("keeps links to /…, #… and https:, inline and by reference, as they are", async () => {
    const links = "[a](/t.png) [b](#a) [c](https://example.com/t.png) [d][e]\n\n[e]: https://example.com/e.png";
    const { entries } = await sync(site({ "install.md": `---\ntitle: Install\ndescription: How.\n---\n\n${links}\n` }));
    const html = JSON.stringify(entries.find((entry) => entry.path === "docs/install")?.data.body);
    for (const href of ["/t.png", "#a", "https://example.com/t.png", "https://example.com/e.png"]) {
      expect(html).toContain(`href=\\"${href}\\"`);
    }
  });

  test.each([
    ["a list item", "- See the [install\n  guide](./install.md#a) first."],
    ["a block quote", "> See the [install\n> guide](./install.md#a) first."],
    ["a nested list in a block quote", "> - See the [install\n>   guide][install] first.\n\n[install]: ./install.md#a"],
  ])("rewrites a link wrapped across lines in %s", async (_name, text) => {
    const { entries } = await sync(site({ "index.md": `---\ntitle: Example\ndescription: Home.\n---\n\n${text}\n` }));
    const html = JSON.stringify(entries.find((entry) => entry.path === "docs/index")?.data.body);
    expect(html).toContain('<a href=\\"/docs/install/#a\\">install\\nguide</a>');
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

  test("makes the content root for a package with no images, which build.passthrough needs to exist", async () => {
    const layout = LAYOUT.replace("![The layout grid](../assets/grid.svg)\n", "");
    const from = site({ assets: undefined, "guides/layout.md": layout });
    const { docs } = await sync(from);
    expect(existsSync(docs.contentRoot)).toBe(true);
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
    ...([
      ["an https: image", "https://example.com/t.png"],
      ["an http: image", "http://example.com/t.png"],
      ["an image at a root path", "/t.png"],
      ["an image that is only a fragment", "#a"],
      ["an image with no destination", ""],
    ] as const).map(([name, href]): [string, Readonly<Record<string, string | undefined>>, Partial<DocsOptions>, string] => [
      name,
      { "guides/layout.md": LAYOUT.replace("(../assets/grid.svg)", `(${href})`) },
      {},
      `guides/layout.md:8 — shows "${href}", which is not a file under assets/ — add it under assets/, or fix the path`,
    ]),
    [
      "an image at the root path of a file under assets/",
      { "index.md": "---\ntitle: Example\ndescription: Home.\n---\n\n![The layout grid](/assets/grid.svg)\n" },
      {},
      'index.md:6 — shows "/assets/grid.svg", which is not a file under assets/ — add it under assets/, or fix the path',
    ],
    [
      "an image by reference to an https: URL",
      {
        "guides/layout.md": LAYOUT.replace("(../assets/grid.svg)", "[grid]") + "[grid]: https://example.com/t.png\n",
      },
      {},
      'guides/layout.md:8 — shows "https://example.com/t.png", which is not a file under assets/ — add it under assets/, or fix the path',
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
      "HTML over several lines of a block quote",
      { "guides/demos.md": DEMOS.replace("Press the button.", "> <div>\n> <script>alert(1)</script>\n> </div>") },
      {},
      "guides/demos.md:6 — has raw HTML, <div> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "HTML the loader cannot find in the file: a list item's line indented with a tab",
      { "guides/demos.md": DEMOS.replace("Press the button.", "- a\n\t<script>alert(1)</script>") },
      {},
      "guides/demos.md:6 — has HTML the loader cannot find in the file, <script>alert(1)</script> — write it on lines of its own, outside any block quote or list",
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
    [
      "a link with the character reference &#47;",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(/&#47;evil.com)") },
      {},
      'guides/layout.md:10 — links to "/&#47;evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a link with the character reference &sol;",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(/&sol;evil.com)") },
      {},
      'guides/layout.md:10 — links to "/&sol;evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a link with the character reference &#92;",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(/&#92;evil.com)") },
      {},
      'guides/layout.md:10 — links to "/&#92;evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a link with the character reference &#9;/",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(/&#9;/evil.com)") },
      {},
      'guides/layout.md:10 — links to "/&#9;/evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a link with the character reference &#10;/",
      { "guides/layout.md": LAYOUT.replace("(../install.md)", "(/&#10;/evil.com)") },
      {},
      'guides/layout.md:10 — links to "/&#10;/evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a link definition with a character reference",
      { "guides/layout.md": LAYOUT.replace("[demos]: ./demos.md", "[demos]: /&#47;evil.com") },
      {},
      'guides/layout.md:12 — links to "/&#47;evil.com", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "an image with a character reference",
      { "guides/layout.md": LAYOUT.replace("../assets/grid.svg", "/&#47;evil.com/grid.svg") },
      {},
      'guides/layout.md:8 — links to "/&#47;evil.com/grid.svg", which holds a character reference — write the path or URL with no "&": the character itself, or percent-encoded (%26 for &)',
    ],
    [
      "a bare ftp:// autolink",
      { "guides/demos.md": DEMOS.replace("Press the button.", "See ftp://evil.com for it.") },
      {},
      'guides/demos.md:6 — links to "ftp://evil.com", a scheme the site does not allow — link with http:, https: or mailto:, or to a page by its .md file',
    ],
    [
      "a second definition of one label",
      { "guides/layout.md": `${LAYOUT}[Demos]: https://example.com/\n` },
      {},
      "guides/layout.md:13 — defines [demos] a second time — give each definition its own label",
    ],
    [
      "HTML in a link's text",
      { "guides/layout.md": LAYOUT.replace("[first](../install.md)", "[<img src=x onerror=alert(1)>](../install.md)") },
      {},
      "guides/layout.md:10 — has raw HTML, <img src=x onerror=alert(1)> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
    ],
    [
      "HTML in an image's alt text",
      { "guides/layout.md": LAYOUT.replace("![The layout grid]", "![<img src=x>]") },
      {},
      "guides/layout.md:8 — has raw HTML, <img src=x> — write it in markdown: the only HTML a page may hold is a demo marker, <!-- demo:<name> -->",
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

  test("runs each stretch of prose through the site's `prose`, with its page, and leaves the demos", async () => {
    const seen: string[] = [];
    const { docs, store } = await synced({
      prose: (html, page) => {
        seen.push(page.path);
        return html.replace("<p>", '<p class="site">');
      },
    });
    const content = docs.content(page("/docs/guides/demos/", "docs/guides/demos"), store);
    expect(content.tree?.[0]?.children).toEqual([
      { component: "docsSiteProse", props: { html: '<p class="site">Press the button.</p>\n' } },
      { component: "docsDemo:counter" },
      { component: "docsSiteProse", props: { html: '<p class="site">That was the demo.</p>\n' } },
    ]);
    expect(seen).toEqual(["/docs/guides/demos/", "/docs/guides/demos/"]);
    expect(Object.keys(docs.components)).toContain("docsSiteProse");
    store.close();
  });

  test("registers the site's prose component only when the site passes `prose`", async () => {
    const { docs, store } = await synced();
    expect(Object.keys(docs.components)).not.toContain("docsSiteProse");
    store.close();
  });

  test("names each demo's component as demoComponent gives it", async () => {
    const { docs, store } = await synced();
    expect(demoComponent("counter")).toBe("docsDemo:counter");
    expect(Object.keys(docs.components)).toContain(demoComponent("counter"));
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

// Docs HTML reaches the page through dangerouslySetInnerHTML, and the docs come from npm.
// The scan refuses raw HTML in the markdown, and DocsProse checks the rendered HTML again, so a
// page cannot inject script even where the scan and the renderer read the markdown differently.
describe("the rendered HTML", () => {
  test("a page with <script>, an onerror= attribute and a javascript: link fails the build and stores none of them", async () => {
    const hostile = "<script>alert(1)</script>\n\nPress <img src=x onerror=alert(2)> it.\n\n[go](javascript:alert(3))\n";
    const from = site({ "guides/demos.md": DEMOS.replace("Press the button.", hostile) });
    const docs = defineDocs(options(from));
    const store = openStore(fileURLToPath(new URL("content.db", from)));
    const report = await failure(syncCollection(store, docs.collection));
    expect(report).toContain("<script>alert(1)</script>");
    expect(report).toContain("onerror=alert(2)");
    expect(report).toContain("javascript:alert(3)");
    expect(listEntries(store, docs.collection)).toEqual([]);
    store.close();
  });

  test("allows everything the renderer writes from markdown, and the demo marker", async () => {
    const markdown = [
      "## A heading",
      "",
      "Some *em*, **strong**, ~~gone~~, `code`, a [link](https://example.com/ \"Title\") and https://example.com/bare.",
      "",
      "![An image](../assets/grid.svg \"Grid\")",
      "",
      "> A quote,\n> over two lines.",
      "",
      "3. three\n4. four",
      "",
      "- [x] done\n- [ ] not yet",
      "",
      "| Left | Right |\n| :--- | ----: |\n| a | b |",
      "",
      "---",
      "",
      "Line  \nbreak.",
      "",
      "<!-- demo:counter -->",
      "",
      "```sh\nnpm install example\n```",
      "",
      "```\n<script>plain</script>\n```",
    ].join("\n");
    const { entries } = await sync(site({ "guides/layout.md": `---\ntitle: Layout\ndescription: All of it.\n---\n\n${markdown}\n` }));
    const layout = entries.find((entry) => entry.path === "docs/guides/layout");
    expect(layout?.data.body.map((part) => part.kind)).toEqual(["html", "demo", "html"]);
  });

  test.each([
    ["a script element", "<p>a</p><script>alert(1)</script>", "<script>"],
    ["an element markdown does not write", '<iframe src="https://example.com/"></iframe>', '<iframe src="https://example.com/">'],
    ["an event handler", '<img src="x.png" onerror="alert(1)">', '<img src="x.png" onerror="alert(1)">'],
    ["an unquoted event handler", "<img src=x onerror=alert(1)>", "<img src=x onerror=alert(1)>"],
    ["a javascript: link", '<a href="javascript:alert(1)">go</a>', '<a href="javascript:alert(1)">'],
    ["a javascript: link behind a space", '<a href=" javascript:alert(1)">go</a>', '<a href=" javascript:alert(1)">'],
    ["a scheme spelled with a character reference", '<a href="javascript&#58;alert(1)">go</a>', '<a href="javascript&#58;alert(1)">'],
    ["a data: image", '<img src="data:image/svg+xml,x" alt="">', '<img src="data:image/svg+xml,x" alt="">'],
    ["a comment that is not a demo marker", "<!-- a note --><p>a</p>", "<!-- a note -->"],
    ["a tag the check cannot read", '<p class="a"b>x</p>', '<p class="a"b>'],
  ])("refuses %s", (_name, html, markup) => {
    expect(unsafeMarkup(html)).toBe(markup);
  });

  // The site's rewrite may add markup markdown does not write, so the docs' HTML is checked before it.
  test("checks the docs' HTML before the site's rewrite, and not after it", () => {
    const addSvg = (html: string) => `${html}<svg aria-hidden="true"></svg>`;
    expect(rewriteProse("<p>a</p>", addSvg)).toBe('<p>a</p><svg aria-hidden="true"></svg>');
    expect(() => rewriteProse("<p>a</p><script>alert(1)</script>", addSvg)).toThrow(/<script>/);
    expect(() => rewriteProse('<img src=x onerror="alert(1)">', addSvg)).toThrow(/onerror/);
  });

  test("passes Shiki's highlighted code and plain markdown", () => {
    const html =
      '<h2 id="a">A</h2>\n<p><a href="/docs/install/#x" title="T">x</a> <a href="mailto:me@example.com">m</a></p>\n' +
      '<pre class="shiki github-dark" style="background-color:#24292e" tabindex="0"><code><span class="line"><span style="color:#E1E4E8">&#x3C;b></span></span></code></pre>\n' +
      "<!-- demo:counter -->\n";
    expect(unsafeMarkup(html)).toBeUndefined();
  });
});
