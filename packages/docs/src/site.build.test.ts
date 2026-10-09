import { Window } from "happy-dom";
import type { Document } from "happy-dom";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const DOCS = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = join(DOCS, "fixtures/example-docs");
const SITE = join(DOCS, "fixtures/docs-site");
const PAGEDECK = join(DOCS, "node_modules/.bin/pagedeck");

// A cold Pagedeck build of a small site, twice over.
const BUILD_TIMEOUT = 180_000;

function build(site: string): void {
  for (const dir of ["site", ".pagedeck", ".pagedeck-docs", "content.db"]) rmSync(join(site, dir), { recursive: true, force: true });
  execFileSync(PAGEDECK, ["sync"], { cwd: site, stdio: "pipe" });
  execFileSync(PAGEDECK, ["build"], { cwd: site, stdio: "pipe" });
}

interface BudgetReport {
  pages: { path: string; actual: number }[];
}

function budget(site: string): Map<string, number> {
  const report = JSON.parse(readFileSync(join(site, ".pagedeck/budget-report.json"), "utf8")) as BudgetReport;
  return new Map(report.pages.map((page) => [page.path, page.actual]));
}

const window = new Window();

function page(route: string): Document {
  const html = readFileSync(join(SITE, "site", route, "index.html"), "utf8");
  return new window.DOMParser().parseFromString(html, "text/html");
}

describe("the fixture site, built with the fixture docs package", () => {
  beforeAll(() => build(SITE), BUILD_TIMEOUT);

  test("serves each page at its route", () => {
    for (const route of ["docs", "docs/install", "docs/guides/layout", "docs/guides/demos"]) {
      expect(existsSync(join(SITE, "site", route, "index.html")), route).toBe(true);
    }
    expect(page("docs/guides/layout").title).toBe("Layout");
  });

  test("renders the nav in nav.json's order, marking the current page", () => {
    const nav = page("docs/install").querySelector('nav[aria-label="Docs"]');
    expect([...(nav?.querySelectorAll("h2") ?? [])].map((h2) => h2.textContent)).toEqual(["Start", "Guides"]);
    expect([...(nav?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Example", "/docs/"],
      ["Install", "/docs/install/"],
      ["Layout", "/docs/guides/layout/"],
      ["Demos", "/docs/guides/demos/"],
    ]);
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe("Install");
  });

  test("links pages by their routes", () => {
    const links = [...page("docs/guides/layout").querySelectorAll("article a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/docs/install/", "/docs/guides/demos/"]);
  });

  test("publishes the image a page shows, where its src reaches", () => {
    expect(page("docs/guides/layout").querySelector("article img")?.getAttribute("src")).toBe("../../assets/grid.svg");
    expect(readFileSync(join(SITE, "site/docs/assets/grid.svg"), "utf8")).toBe(readFileSync(join(FIXTURE, "assets/grid.svg"), "utf8"));
  });

  test("swaps the demo marker for the site's component, between the text around it", () => {
    const article = page("docs/guides/demos").querySelector("article");
    const text = [...(article?.querySelectorAll("p, button") ?? [])].map((element) => element.textContent?.trim());
    expect(text).toEqual(["Press the button.", "Pressed 0 times", "That was the demo."]);
    expect(article?.innerHTML).not.toContain("demo:counter");
  });

  test("ships JavaScript only to the page with the demo", () => {
    const actual = budget(SITE);
    expect(actual.get("/docs/guides/demos/")).toBeGreaterThan(0);
    for (const route of ["/docs/", "/docs/install/", "/docs/guides/layout/"]) expect(actual.get(route), route).toBe(0);
  });
});

describe("a site whose demo map is empty", () => {
  const site = join(DOCS, ".test-sites/no-demos");

  beforeAll(() => {
    rmSync(site, { recursive: true, force: true });
    // The fixture without its demo marker, which an empty map would refuse.
    const docs = join(site, "node_modules/@example/docs");
    cpSync(FIXTURE, docs, { recursive: true });
    const demos = join(docs, "guides/demos.md");
    writeFileSync(demos, readFileSync(demos, "utf8").replace("<!-- demo:counter -->\n", ""));
    mkdirSync(site, { recursive: true });
    writeFileSync(
      join(site, "pagedeck.config.ts"),
      readFileSync(join(SITE, "pagedeck.config.ts"), "utf8")
        .replace('"../../src/index.ts"', JSON.stringify(join(DOCS, "src/index.ts")))
        .replace('{ counter: "./components/counter.tsx" }', "{}")
        .replace('"./components/docs-page.tsx"', JSON.stringify(join(SITE, "components/docs-page.tsx"))),
    );
    build(site);
  }, BUILD_TIMEOUT);

  test("ships 0 B of JavaScript on every page", () => {
    const actual = budget(site);
    expect([...actual.keys()].sort()).toEqual(["/docs/", "/docs/guides/demos/", "/docs/guides/layout/", "/docs/install/"]);
    for (const [route, bytes] of actual) expect(bytes, route).toBe(0);
  });
});
