import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
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

describe("the home page's install command in a browser", () => {
  // The page's script is its islands', so a click selects the command for copying instead.
  test("one click on the install command selects all of it, and nothing else", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(".home-install code").click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("pnpm add @drawerdeck/react");
  });
});

// The live drawer (components/demos/example-quickstart.tsx) on the home page
// and the Quickstart docs page: the same island, so a thorough pass on one
// plus a lighter check on the other covers both.
describe("the live drawer in a browser", () => {
  const LIVE_DRAWER_PAGES = ["/", "/docs/quickstart/"] as const;

  // A close or an open settles on the engine's own scrollend (or, lacking
  // native support, its 120ms debounce): longer than expect.poll's default
  // 1s, so a slow frame under load does not flake this.
  const SETTLE = { timeout: 5000 };

  // Escape and a drag both no-op outside the engine's 'open' phase (not
  // 'opening'): wait for that, not just the <dialog>'s own open attribute,
  // which the engine sets as soon as the opening scroll starts.
  const openDrawer = async (page: Page) => {
    const drawer = page.locator(".drawer-demo--quickstart");
    const panel = drawer.locator("[data-drawerdeck-panel]");
    await drawer.getByRole("button", { name: "Open" }).click();
    await expect.poll(() => panel.getAttribute("data-phase"), SETTLE).toBe("open");
    return drawer;
  };

  test.each(LIVE_DRAWER_PAGES)("%s: Open shows the drawer, open at its first snap point, under the CSP", async (path) => {
    const { page, violations } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const popup = page.locator(".drawer-demo--quickstart [data-drawerdeck-popup]");
    expect(await popup.getAttribute("open")).toBeNull();
    const drawer = await openDrawer(page);
    expect(await popup.getAttribute("open")).not.toBeNull();
    expect(await drawer.locator("[data-drawerdeck-panel]").getAttribute("data-snap-index")).toBe("0");
    expect(await violations()).toEqual([]);
  });

  test.each(LIVE_DRAWER_PAGES)("%s: Escape closes the drawer", async (path) => {
    const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const popup = page.locator(".drawer-demo--quickstart [data-drawerdeck-popup]");
    await openDrawer(page);
    await page.keyboard.press("Escape");
    await expect.poll(() => popup.getAttribute("open"), SETTLE).toBeNull();
  });

  test("Done closes the drawer", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const popup = page.locator(".drawer-demo--quickstart [data-drawerdeck-popup]");
    const drawer = await openDrawer(page);
    await drawer.getByRole("button", { name: "Done" }).click();
    await expect.poll(() => popup.getAttribute("open"), SETTLE).toBeNull();
  });

  test("dragging the handle up snaps the drawer from half to full", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const drawer = await openDrawer(page);
    const panel = drawer.locator("[data-drawerdeck-panel]");
    const handle = await drawer.locator("[data-drawerdeck-handle]").boundingBox();
    if (!handle) throw new Error("the handle has no box");
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 500, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => panel.getAttribute("data-snap-index"), SETTLE).toBe("1");
  });

  test("dragging the handle down past the lowest snap point closes the drawer", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
    const popup = page.locator(".drawer-demo--quickstart [data-drawerdeck-popup]");
    const drawer = await openDrawer(page);
    const handle = await drawer.locator("[data-drawerdeck-handle]").boundingBox();
    if (!handle) throw new Error("the handle has no box");
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 500, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => popup.getAttribute("open"), SETTLE).toBeNull();
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
