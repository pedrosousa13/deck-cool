import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { headersFor, parseHeaders, serveSite, type ServedSite } from "./serve-site.ts";

const HEADERS = `/*
  X-Frame-Options: DENY
  Cache-Control: no-store
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/open/*
  ! X-Frame-Options
`;

describe("parseHeaders and headersFor", () => {
  const rules = parseHeaders(HEADERS);

  test("apply every rule whose pattern matches, in file order, a later value replacing an earlier", () => {
    expect(Object.fromEntries(headersFor(rules, "/"))).toEqual({ "X-Frame-Options": "DENY", "Cache-Control": "no-store" });
    expect(Object.fromEntries(headersFor(rules, "/assets/site-AbCd1234.css"))).toEqual({
      "X-Frame-Options": "DENY",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  test("a `! Name` line detaches a header an earlier rule set", () => {
    expect(Object.fromEntries(headersFor(rules, "/open/"))).toEqual({ "Cache-Control": "no-store" });
  });

  test("`*` matches anything, and every other character only itself", () => {
    expect(parseHeaders("/a.b/*\n  X: 1\n").map(({ pattern }) => pattern.source)).toEqual(["^\\/a\\.b\\/.*$"]);
    expect(headersFor(parseHeaders("/a.b/*\n  X: 1\n"), "/aXb/c").size).toBe(0);
  });

  test("a header before any path is an error", () => {
    expect(() => parseHeaders("  X: 1\n")).toThrow("_headers: a header before any path:   X: 1");
  });
});

describe("serveSite", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-kit-serve-"));
  let site: ServedSite;

  beforeAll(async () => {
    mkdirSync(join(dir, "site/assets"), { recursive: true });
    writeFileSync(join(dir, "site/_headers"), HEADERS);
    writeFileSync(join(dir, "site/index.html"), "<p>home</p>");
    writeFileSync(join(dir, "site/assets/app-AbCd1234.js"), "export {};");
    site = await serveSite(dir);
  });

  afterAll(async () => {
    await site?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("serves a directory's index.html, with its type and the headers _headers sets", async () => {
    const response = await fetch(`${site.origin}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(await response.text()).toBe("<p>home</p>");
  });

  test("serves a file with its type", async () => {
    const response = await fetch(`${site.origin}/assets/app-AbCd1234.js`);
    expect(response.headers.get("content-type")).toBe("text/javascript");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("answers a missing file 404, with the headers its path gets", async () => {
    const response = await fetch(`${site.origin}/no-such-page/`);
    expect(response.status).toBe(404);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
