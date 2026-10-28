import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { browserHarness, islandsHydrated } from "@deck-cool/site-kit/browser-test";
import { REPOSITORY } from "../components/links.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file. Needs Playwright's Chromium:
// `pnpm exec playwright install chromium`.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
vi.setConfig({ testTimeout: 30_000 });
const { visit } = site;

const PAGES = ["/", "/docs/quickstart/", "/docs/install/"] as const;

describe.each(PAGES)("%s in a browser", (path) => {
  test("is served with the CSP the build writes", async () => {
    const { response } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    expect(await response?.headerValue(CONTENT_SECURITY_POLICY.name)).toBe(CONTENT_SECURITY_POLICY.value);
  });

  test("the browser recognizes every feature the Permissions-Policy names", async () => {
    const { permissionsPolicy } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    expect(permissionsPolicy).toEqual([]);
  });

  test.each([390, 1280])(
    "at %ipx, axe finds no violations, nothing leaves the origin, the CSP holds and no script fails",
    async (width) => {
      const { page, offOrigin, violations, errors } = await visit(path, { width, reducedMotion: "reduce" });
      await islandsHydrated(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(offOrigin).toEqual([]);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  test.each([390, 1280])("at %ipx, the page does not scroll sideways", async (width) => {
    const { page } = await visit(path, { width, reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test("on a phone, the page lays out at the phone's width, not a desktop one", async () => {
    const { page } = await visit(path, { width: 390, reducedMotion: "reduce", isMobile: true });
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
  });
});

describe("the home page's demo mock in a browser", () => {
  // The page's script is its islands', so a click selects the command for copying instead.
  test("one click on the install command selects all of it, and nothing else", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(".home-install code").click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("pnpm add @drawerdeck/react");
  });

  test("Open shows the mock panel, and Done hides it, under the CSP", async () => {
    const { page, violations } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const mock = page.locator(".drawer-mock");
    const popup = mock.locator(".drawer-mock__popup");
    expect(await popup.isVisible()).toBe(false);
    await mock.getByRole("button", { name: "Open" }).click();
    await expect.poll(() => popup.isVisible()).toBe(true);
    await mock.getByRole("button", { name: "Done" }).click();
    await expect.poll(() => popup.isVisible()).toBe(false);
    expect(await violations()).toEqual([]);
  });
});

// At the bar's phone breakpoint the links fold into a menu button, last in the row.
describe("the Family bar's links menu", () => {
  const LINKS = [
    ["Docs", "/docs/"],
    ["GitHub", REPOSITORY],
  ];

  test("at 390px, the menu button opens every link, each tappable", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator('header button[aria-label="Menu"]').click();
    const items = await page
      .locator("header #family-bar-links a")
      .evaluateAll((items) => items.map((a) => [a.textContent, a.getAttribute("href")]));
    expect(items).toEqual(LINKS);
    for (const link of await page.locator("header #family-bar-links a").all()) expect(await link.isEnabled()).toBe(true);
  });

  test("at 1024px, no menu button shows and the links stay in the row", async () => {
    const { page } = await visit("/", { width: 1024, reducedMotion: "reduce" });
    expect(await page.locator('header button[aria-label="Menu"]').isVisible()).toBe(false);
    expect(await page.locator("header .family-bar__links").isVisible()).toBe(true);
  });
});
