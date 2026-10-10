import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { browserHarness } from "./browser-test.ts";

// A site of two pages: / under a CSP that refuses anything from elsewhere, and
// /open/, with no CSP, that reaches another origin, loads a script and throws.
const dir = mkdtempSync(join(tmpdir(), "site-kit-browser-"));
mkdirSync(join(dir, "site/open"), { recursive: true });
writeFileSync(
  join(dir, "site/_headers"),
  "/*\n  Content-Security-Policy: default-src 'self'\n/open/*\n  ! Content-Security-Policy\n",
);
writeFileSync(join(dir, "site/index.html"), '<!doctype html><title>home</title><img src="https://example.com/a.png" alt="">');
writeFileSync(
  join(dir, "site/open/index.html"),
  '<!doctype html><title>open</title><img src="https://example.com/b.png" alt=""><script src="/open/app.js"></script>',
);
writeFileSync(join(dir, "site/open/app.js"), 'throw new Error("boom");');

const site = browserHarness(dir);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("records each CSP violation, and serves the page with its headers", async () => {
  const { response, violations, offOrigin } = await site.visit("/");
  expect(response?.status()).toBe(200);
  expect(await response?.headerValue("Content-Security-Policy")).toBe("default-src 'self'");
  await expect.poll(violations).toEqual(expect.arrayContaining(["img-src https://example.com/a.png"]));
  expect(offOrigin).toEqual([]);
});

test("aborts and records each request to another origin, and records scripts and uncaught errors", async () => {
  const { offOrigin, scripts, errors, violations } = await site.visit("/open/", { waitUntil: "networkidle" });
  expect(offOrigin).toEqual(["https://example.com/b.png"]);
  expect(scripts).toEqual(["/open/app.js"]);
  expect(errors).toEqual(["boom"]);
  expect(await violations()).toEqual([]);
});

test("lays the page out as a phone does in phone mode", async () => {
  // With no viewport meta tag, a phone lays the page out 980px wide.
  const phone = await site.visit("/", { width: 390, isMobile: true });
  expect(await phone.page.evaluate(() => window.innerWidth)).toBe(980);
  const desktop = await site.visit("/", { width: 390 });
  expect(await desktop.page.evaluate(() => window.innerWidth)).toBe(390);
});

test("the origin is the served site's", async () => {
  expect(site.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect((await fetch(`${site.origin}/open/`)).status).toBe(200);
});
