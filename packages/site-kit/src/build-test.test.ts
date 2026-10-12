import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { everyResponse, pagesWithEmDashes, present, readManifest, text } from "./build-test.ts";

test("present returns a value, and fails on null or undefined, naming what is missing", () => {
  expect(present(0, "zero")).toBe(0);
  expect(() => present(null, "the heading")).toThrow("the heading is missing");
  expect(() => present(undefined, "the heading")).toThrow("the heading is missing");
});

test("text collapses each run of white space to one space, and trims", () => {
  expect(text({ textContent: "\n  Read\n   the  docs \n" })).toBe("Read the docs");
  expect(text(null)).toBeUndefined();
});

test("everyResponse is the site's CSP and the headers every site sends on every response", () => {
  expect(everyResponse({ name: "Content-Security-Policy", value: "default-src 'none'" })).toEqual({
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  });
});

describe("readManifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-kit-manifest-"));
  mkdirSync(join(dir, "site"));
  const write = (manifest: unknown) => writeFileSync(join(dir, "site/manifest.json"), JSON.stringify(manifest));

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("reads the pages, their islands, the files and each tree's 404 page", () => {
    write({
      pages: [
        { path: "/", output: "index.html" },
        { path: "/a/", output: "a/index.html", components: [{ name: "counter" }] },
      ],
      files: [{ path: "/assets/site-AbCd1234.css" }],
      routing: { trees: [{ notFound: null }] },
    });
    expect(readManifest(dir)).toEqual({
      pages: [
        { path: "/", output: "index.html", components: [] },
        { path: "/a/", output: "a/index.html", components: ["counter"] },
      ],
      files: ["/assets/site-AbCd1234.css"],
      notFound: [null],
    });
  });

  test("fails on a manifest with no pages, files or routing trees", () => {
    write({ files: [], routing: { trees: [] } });
    expect(() => readManifest(dir)).toThrow("manifest.json has no pages, files or routing.trees");
  });

  test("fails on a page with no path or output, and a file with no path", () => {
    write({ pages: [{ path: "/" }], files: [], routing: { trees: [] } });
    expect(() => readManifest(dir)).toThrow("a manifest page has no path or output");
    write({ pages: [], files: [{}], routing: { trees: [] } });
    expect(() => readManifest(dir)).toThrow("a manifest file's path is missing");
  });
});

describe("pagesWithEmDashes", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-kit-em-dash-"));
  const page = (file: string, html: string) => {
    mkdirSync(join(dir, "site", file, ".."), { recursive: true });
    writeFileSync(join(dir, "site", file), html);
  };
  page("index.html", "<p>Clean, with an en dash: 1\u20132.</p>");
  page("a/index.html", "<p>One \u2014 two</p>");
  page("a/b/index.html", "<p>One &mdash; two</p>");
  page("404.html", "<title>Not found \u2014 Site</title>");
  page("examples/index.html", "<p>Kept \u2014 as ported</p>");
  page("examples.css", "/* \u2014 not a page */");

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("names each page whose HTML holds an em dash, as the character or &mdash;", () => {
    expect(pagesWithEmDashes(dir)).toEqual(["/404.html", "/a/", "/a/b/", "/examples/"]);
  });

  test("skips each exempt page, and only that page, not the pages under it", () => {
    expect(pagesWithEmDashes(dir, ["/examples/", "/a/"])).toEqual(["/404.html", "/a/b/"]);
  });
});
