import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type Page, type Response } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { PATHS } from "../components/links.ts";
import { MEDIA_ORIGINS } from "./csp.ts";
import { RESPONSE_HEADERS } from "./headers.ts";
import { serveSite, type ServedSite } from "./serve-site.ts";
import { SKINS } from "./skins.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file, so every page runs under its CSP.
// Nothing reaches another origin: every such request is recorded and aborted.

declare global {
  interface Window {
    /** CSP violations the page reported, set by the init script in visit(). */
    cspViolations?: string[];
  }
}

let site: ServedSite;
let browser: Browser;

beforeAll(async () => {
  site = await serveSite();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

interface Visit {
  page: Page;
  response: Response | null;
  /** Requests the page made to another origin. Each was aborted. */
  offOrigin: string[];
  /** Every script the page fetched from the site, by path. */
  scripts: string[];
  /** CSP violations, from the event and from the console. */
  violations: () => Promise<string[]>;
  /** Uncaught errors, such as an island that failed to hydrate. */
  errors: string[];
}

async function visit(
  path: string,
  options: { width: number; reducedMotion?: "reduce" | "no-preference"; isMobile?: boolean; clipboard?: boolean },
): Promise<Visit> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: 900 },
    reducedMotion: options.reducedMotion ?? "reduce",
    isMobile: options.isMobile ?? false,
    ...(options.clipboard === true ? { permissions: ["clipboard-read", "clipboard-write"] } : {}),
  });
  const offOrigin: string[] = [];
  const scripts: string[] = [];
  await context.route(
    (url) => url.origin !== site.origin,
    (route) => {
      offOrigin.push(route.request().url());
      return route.abort();
    },
  );
  // An init script is not subject to the page's CSP.
  await context.addInitScript(() => {
    const seen: string[] = [];
    window.cspViolations = seen;
    window.addEventListener("securitypolicyviolation", (event) => {
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === site.origin && url.pathname.endsWith(".js")) scripts.push(url.pathname);
  });
  const logged: string[] = [];
  const errors: string[] = [];
  page.on("console", (message) => {
    if (/Content.Security.Policy/i.test(message.text())) logged.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${site.origin}${path}`, { waitUntil: "load" });
  return {
    page,
    response,
    offOrigin,
    scripts,
    errors,
    violations: async () => [...logged, ...(await page.evaluate(() => window.cspViolations ?? ["the CSP listener never ran"]))],
  };
}

const PAGES = [PATHS.home, PATHS.examples, PATHS.comparison, PATHS.search];

describe("the playdeck site in a browser", () => {
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
    // Longer than the default: axe takes about 16 s over the comparison guide's
    // 192 notes and wide tables on an idle machine, and twice that under the full suite.
    test.each(PAGES)("%s: axe finds no violations, nothing leaves the origin, the CSP holds and no error is thrown", { timeout: 90_000 }, async (path) => {
      const { page, offOrigin, violations, errors } = await visit(path, { width });
      // Let the islands hydrate before axe reads the page.
      await page.waitForLoadState("networkidle");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(offOrigin).toEqual([]);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    });

    test.each(PAGES)("%s does not scroll sideways", async (path) => {
      const { page } = await visit(path, { width });
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });

  test.each(PAGES)("%s on a phone lays out at the phone's width, not a desktop one, and does not scroll sideways", async (path) => {
    const { page } = await visit(path, { width: 390, isMobile: true });
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test.each(PAGES)("%s: with prefers-reduced-motion: reduce, nothing moves", async (path) => {
    const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    await page.waitForLoadState("networkidle");
    await page.locator(".family-bar__links a").first().hover();
    expect(await page.evaluate(() => document.getAnimations().map((animation) => animation.constructor.name))).toEqual([]);
  });

  test("with motion allowed, a link's colour change eases on the brand's curve", async () => {
    const { page } = await visit(PATHS.home, { width: 1280, reducedMotion: "no-preference" });
    const timing = await page.locator(".pd-intro .pd-button").evaluate((button) => getComputedStyle(button).transitionTimingFunction);
    expect(timing).toContain("cubic-bezier(0.32, 0.72, 0, 1)");
    expect(timing.replaceAll("cubic-bezier(0.32, 0.72, 0, 1)", "").replace(/[\s,]/g, "")).toBe("");
  });

  // No copy island: the command selects whole in one click.
  test("the home page's install command is selected whole by one click", async () => {
    const { page } = await visit(PATHS.home, { width: 1280 });
    await page.locator(".pd-install__command").click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("pnpm add @playdeck/react");
  });

  test("the home page's two skins set the same player in two different faces and grounds", async () => {
    const { page } = await visit(PATHS.home, { width: 1280 });
    const looks = await page.locator('.pd-skin__stage [data-playdeck-part="viewport"]').evaluateAll((viewports) =>
      viewports.map((viewport) => {
        const style = getComputedStyle(viewport);
        return [style.fontFamily, style.backgroundImage, style.backgroundColor, style.borderRadius];
      }),
    );
    expect(looks).toHaveLength(2);
    expect(looks[0]?.[0]).not.toBe(looks[1]?.[0]);
    expect(looks[0]?.slice(1, 3)).not.toEqual(looks[1]?.slice(1, 3));
    expect(looks[0]?.[3]).not.toBe(looks[1]?.[3]);
  });

  // Longer than the default: it runs axe, which is slow under the full suite.
  test("each skin's source opens from the keyboard, folded until then, and keeps its name open", { timeout: 30_000 }, async () => {
    const { page, violations } = await visit(PATHS.home, { width: 1280 });
    for (const name of ["Velvet", "Broadcast"]) {
      const source = page.getByLabel(`${name} CSS`, { exact: true });
      expect(await source.evaluate((element) => element.tagName)).toBe("PRE");
      expect(await source.isVisible()).toBe(false);
      const summary = page.locator("summary", { hasText: `${name} CSS ·` });
      await summary.focus();
      expect(await summary.evaluate((element) => element === document.activeElement)).toBe(true);
      await page.keyboard.press("Enter");
      await expect.poll(() => source.isVisible()).toBe(true);
      // Open, the scrolling block is still a named stop for the keyboard.
      await page.keyboard.press("Tab");
      expect(await source.evaluate((element) => element === document.activeElement)).toBe(true);
    }
    expect((await new AxeBuilder({ page }).include(".pd-skins").analyze()).violations).toEqual([]);
    expect(await violations()).toEqual([]);
  });

  // Pagedeck's budget counts only the chunks a page loads eagerly, and the home
  // page's players hydrate on "visible". This counts what the budget cannot:
  // every script the page has loaded once both players have hydrated, before a
  // press, weighed as the budget weighs a chunk (brotli at its default quality).
  // Measured, then rounded up to a whole kilobyte: re-measure rather than raise it.
  test("the home page ships 84kb of JavaScript before a press, its players hydrated", async () => {
    const { page, scripts } = await visit(PATHS.home, { width: 1280 });
    await page.waitForLoadState("networkidle");
    for (const skin of SKINS) {
      await page.locator(`.pd-skin__stage.${skin.className}`).scrollIntoViewIfNeeded();
      await page.locator(`.pd-skin__stage.${skin.className} [data-playdeck-part="viewport"][data-idle]`).waitFor();
    }
    await page.waitForLoadState("networkidle");
    const bytes = [...new Set(scripts)]
      .map((path) => brotliCompressSync(readFileSync(fileURLToPath(new URL(`../site${path}`, import.meta.url)))).byteLength)
      .reduce((sum, each) => sum + each, 0);
    const limit = 84 * 1024;
    expect(bytes).toBeLessThanOrEqual(limit);
    expect(limit - bytes).toBeLessThan(2048);
  });

  test("an open skin's source scrolls inside itself at 390px, never the page", async () => {
    const { page } = await visit(PATHS.home, { width: 390 });
    const source = page.getByLabel("Broadcast CSS", { exact: true });
    await page.locator("summary", { hasText: "Broadcast CSS ·" }).click();
    await expect.poll(() => source.isVisible()).toBe(true);
    expect(await source.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  // CONTEXT.md's figure for playdeck: 0 requests to YouTube or Vimeo before
  // play. No page here mounts either provider yet (#52's demos do), so this
  // holds the stronger claim, the one the home page's figure makes: before a
  // press, a player requests nothing from any other origin, and loads no
  // provider.
  const SINTEL = "/durian/trailer/sintel_trailer-720p.mp4";
  describe.each([
    { name: "home page's Velvet", path: PATHS.home, scope: ".pd-skin__stage.velvet", press: "Play video", clip: SINTEL },
    { name: "home page's Broadcast", path: PATHS.home, scope: ".pd-skin__stage.broadcast", press: "Play video", clip: SINTEL },
    { name: "streaming service", path: PATHS.examples, scope: "main", press: "Play from the beginning", clip: SINTEL },
    { name: "course platform", path: PATHS.examples, scope: "main", press: "Start the lesson", clip: "/peach/trailer/trailer_iphone.m4v" },
  ])("the $name player", ({ path, scope, press, clip }) => {
    test("requests nothing off the origin, and loads no provider, until it is pressed; then plays its clip under the CSP", async () => {
      const { page, offOrigin, scripts, violations, errors } = await visit(path, { width: 1280 });
      await page.waitForLoadState("networkidle");
      // Scrolled past both players, so anything that loads on sight has loaded.
      await page.mouse.wheel(0, 4000);
      await page.waitForLoadState("networkidle");
      // Then back to this one, until it has hydrated: a viewport writes
      // data-idle from an effect, which the server's HTML does not carry.
      await page.locator(scope).first().scrollIntoViewIfNeeded();
      await page.locator(`${scope} [data-playdeck-part="viewport"][data-idle]`).first().waitFor();
      await page.waitForLoadState("networkidle");
      expect(offOrigin).toEqual([]);
      const before = [...scripts];
      const provider = /^\/assets\/_playdeck-provider-native-[A-Za-z0-9_-]{8}\.js$/;
      // The page's own chunks are there, and the provider is not one of them.
      expect(before.length).toBeGreaterThan(0);
      expect(before.filter((path) => provider.test(path))).toEqual([]);

      await page.locator(scope).getByRole("button", { name: press, exact: true }).click();
      await expect.poll(() => offOrigin).toContain(`${MEDIA_ORIGINS[0]}${clip}`);
      // Only the player's own clip: no provider, no other host.
      for (const url of offOrigin) expect(new URL(url).origin).toBe(MEDIA_ORIGINS[0]);
      // The provider is code the press fetched, not code the page loaded.
      await expect.poll(() => scripts.filter((path) => provider.test(path))).toHaveLength(1);
      for (const path of scripts.filter((each) => /_playdeck-provider-/.test(each))) expect(path).toMatch(provider);
      expect(await violations()).toEqual([]);
      // The request is aborted, so the player reports a media error, not a script one.
      expect(errors).toEqual([]);
    });
  });

  test("the docs' search finds a page, and follows it", async () => {
    const { page, violations } = await visit(PATHS.search, { width: 1280 });
    const box = page.getByRole("combobox", { name: "Search the site" });
    await box.fill("vidstack");
    const results = page.getByRole("option");
    await expect.poll(() => results.count()).toBeGreaterThan(0);
    const href = await results.first().getAttribute("href");
    expect(href).toBe(PATHS.comparison);
    await results.first().click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(href);
    expect(await violations()).toEqual([]);
  });
});
