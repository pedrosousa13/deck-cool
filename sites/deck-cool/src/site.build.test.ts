import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));

interface BudgetReport {
  pages: { path: string; actual: number }[];
}

test("every page ships 0 B of JavaScript", () => {
  const report = JSON.parse(
    readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8"),
  ) as BudgetReport;

  expect(report.pages.map((page) => page.path)).toContain("/");
  for (const page of report.pages) {
    expect(page, page.path).toMatchObject({ actual: 0 });
  }
});

test("the home page links brand.css and the deck-cool icons, and serves them", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  for (const link of [
    '<link rel="stylesheet" href="/brand.css"/>',
    '<link rel="icon" type="image/svg+xml" href="/icons/deck-cool/still.svg"/>',
    '<link rel="apple-touch-icon" href="/icons/deck-cool/apple-touch-icon.png"/>',
  ]) {
    expect(html).toContain(link);
  }
  for (const path of [
    "brand.css",
    "icons/deck-cool/still.svg",
    "icons/deck-cool/apple-touch-icon.png",
  ]) {
    const served = readFileSync(`${SITE}site/${path}`);
    expect(served.equals(readFileSync(`${BRAND}${path}`)), path).toBe(true);
  }
});

test("the home page opens with the Family bar, after the stylesheets it needs", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  const at = (needle: string) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };
  const header = at('<header class="family-bar"');
  expect(at('<link rel="stylesheet" href="/brand.css"/>')).toBeLessThan(header);
  expect(at('<link rel="stylesheet" href="/family-bar.css"/>')).toBeLessThan(header);
  // Outside <main>, so the header is the page's banner landmark.
  expect(header).toBeLessThan(at("<main>"));
  // The deck icons sit in a closed <details>, so nothing fetches them early.
  expect(html).not.toContain('rel="preload"');

  const served = readFileSync(`${SITE}site/family-bar.css`);
  expect(served.equals(readFileSync(`${BRAND}family-bar.css`))).toBe(true);
});
