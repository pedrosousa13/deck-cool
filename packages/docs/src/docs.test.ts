import { listEntries, openStore, syncCollection } from "@pagedeck/content";
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
