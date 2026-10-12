import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { browserHarness, islandsHydrated } from "@deck-cool/site-kit/browser-test";
import { DOCS, PATHS } from "../components/links.ts";
import { DOCS_NAV } from "./docs-pages.ts";
import { RESPONSE_HEADERS } from "./headers.ts";
import { DOCS_WITH_TABLES } from "./live-check.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file, so every page runs under its CSP.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
const { visit } = site;

// Two docs pages, the first and one with tables, as site.build.test.ts covers
// them. @pagedeck/docs 0.2.3 marks no demo, so no docs page has one.
const PAGES = [PATHS.home, PATHS.interactive, PATHS.features, PATHS.cmsDemo, PATHS.search, DOCS.start, DOCS_WITH_TABLES];

describe("the pagedeck site in a browser", () => {
  test.each(PAGES)("%s is served with every header the build writes", async (path) => {
    const { response } = await visit(path, { width: 1280 });
    expect(response?.status()).toBe(200);
    for (const { name, value } of RESPONSE_HEADERS) expect(await response?.headerValue(name), name).toBe(value);
  });

  test("the harness sees a CSP violation when there is one", async () => {
    const { page, violations } = await visit(PATHS.home, { width: 1280 });
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "body { color: red }";
      document.head.append(style);
    });
    await expect.poll(violations).not.toEqual([]);
  });

  describe.each([390, 1280])("at %ipx", (width) => {
    test.each(PAGES)("%s: axe finds no violations, nothing leaves the origin, the CSP holds and no error is thrown", async (path) => {
      const { page, offOrigin, violations, errors } = await visit(path, { width });
      // Let every island hydrate before axe reads the page.
      await islandsHydrated(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(offOrigin).toEqual([]);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    });

    test.each(PAGES)("%s does not scroll sideways", async (path) => {
      const { page } = await visit(path, { width });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });

  test.each(PAGES)("%s on a phone lays out at the phone's width, not a desktop one, and does not scroll sideways", async (path) => {
    const { page } = await visit(path, { width: 390, isMobile: true });
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test.each(PAGES)("%s: with prefers-reduced-motion: reduce, nothing moves", async (path) => {
    const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.getAnimations().map((animation) => animation.constructor.name))).toEqual([]);
  });

  // The page ships no script, so a click selects the command for copying instead.
  test("one click on the home page's install command selects all of it, and nothing else", async () => {
    const { page } = await visit(PATHS.home, { width: 1280 });
    await page.locator(".fw-install code").click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("npm create pagedeck");
  });

  test("the home page's two skins set the same teaser in two different faces and grounds", async () => {
    const { page } = await visit(PATHS.home, { width: 1280 });
    const looks = await page.locator(".fw-skin__stage .teaser").evaluateAll((teasers) =>
      teasers.map((teaser) => {
        const style = getComputedStyle(teaser);
        return [style.fontFamily, style.backgroundColor];
      }),
    );
    expect(looks).toHaveLength(2);
    expect(looks[0]?.[0]).not.toBe(looks[1]?.[0]);
    expect(looks[0]?.[1]).not.toBe(looks[1]?.[1]);
    // Each scrollable code block is focusable, so each is named.
    for (const name of ["Paper CSS", "Signal CSS"]) {
      expect(await page.getByLabel(name, { exact: true }).evaluate((element) => element.tagName)).toBe("PRE");
    }
  });

  test("a skin's CSS opens from the keyboard, named and in focus, and scrolls inside itself at 390px", async () => {
    const { page } = await visit(PATHS.home, { width: 390 });
    const code = page.getByLabel("Paper CSS", { exact: true });
    expect(await code.isVisible()).toBe(false);
    const summary = page.locator("summary", { hasText: "Paper CSS" });
    await summary.focus();
    expect(await summary.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect.poll(() => code.isVisible()).toBe(true);
    expect(await code.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Closed, the sheet is hidden from axe: open, its highlighted tokens are checked too.
    expect((await new AxeBuilder({ page }).include(".fw-skin details[open]").analyze()).violations).toEqual([]);
  }, 15_000);

  test("the island page's counter hydrates under the CSP and counts presses", async () => {
    const { page, violations } = await visit(PATHS.interactive, { width: 1280 });
    const output = page.locator("main output");
    await islandsHydrated(page);
    await page.getByRole("button", { name: "Press me" }).click();
    await expect.poll(() => output.textContent()).toBe("Pressed 1 times");
    expect(await violations()).toEqual([]);
  });

  // The docs' tables and blocks are as wide as their content, so every page is checked, not two.
  test("at 390px, no docs page scrolls sideways", { timeout: 120_000 }, async () => {
    const wide: string[] = [];
    for (const { path } of DOCS_NAV) {
      const { page } = await visit(path, { width: 390 });
      if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 390) wide.push(path);
    }
    expect(wide).toEqual([]);
  });

  // A fence with no language renders as a plain <pre>.
  test("an unhighlighted block sits on the same tile as a highlighted one", async () => {
    const { page } = await visit(DOCS_WITH_TABLES, { width: 1280 });
    const look = (selector: string) =>
      page.locator(selector).first().evaluate((pre) => {
        const style = getComputedStyle(pre);
        return [style.backgroundColor, style.padding, style.borderRadius, style.fontSize, style.lineHeight, style.overflowX];
      });
    expect(await look(".fw-prose pre:not(.shiki)")).toEqual(await look(".fw-prose pre.shiki"));
  });

  test("the docs' search finds a page, and follows it", async () => {
    const { page, violations } = await visit(PATHS.search, { width: 1280 });
    await islandsHydrated(page);
    const box = page.getByRole("combobox", { name: "Search pagedeck" });
    await box.fill("island");
    const results = page.getByRole("option");
    await expect.poll(() => results.count()).toBeGreaterThan(0);
    const href = await results.first().getAttribute("href");
    expect(href).toMatch(/^\//);
    await results.first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(href);
    expect(await violations()).toEqual([]);
  });

  test("the features page loads the subset font for its specimen, under the CSP", async () => {
    const { page, violations } = await visit(PATHS.features, { width: 1280 });
    await page.locator(".fw-specimen").scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Fira Sans"'))).toBe(true);
    expect(await page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family))).toContain("Fira Sans");
    expect(await violations()).toEqual([]);
  });

  test("the features page's embed loads only after consent, under the CSP", async () => {
    const { page, violations } = await visit(PATHS.features, { width: 1280 });
    await islandsHydrated(page);
    const loaded = page.locator('[data-embed="loaded"]');
    await page.getByRole("button", { name: "Load the embed" }).click();
    expect(await loaded.count()).toBe(0);
    await page.getByRole("button", { name: "Accept" }).click();
    await page.getByRole("button", { name: "Load the embed" }).click();
    await expect.poll(() => loaded.count()).toBe(1);
    expect(await violations()).toEqual([]);
  });
});
