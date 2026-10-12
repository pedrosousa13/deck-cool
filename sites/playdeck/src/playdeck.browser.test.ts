import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import type { Locator } from "playwright";
import { describe, expect, test } from "vitest";
import { browserHarness, islandsHydrated } from "@deck-cool/site-kit/browser-test";
import { PATHS } from "../components/links.ts";
import { MEDIA_ORIGINS } from "./csp.ts";
import { DEMOS } from "./demos.ts";
import { DOCS_NAV } from "./docs-pages.ts";
import { RESPONSE_HEADERS } from "./headers.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file, so every page runs under its CSP.
// Nothing reaches another origin: every such request is recorded and aborted.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
const { visit } = site;

// The docs pages, one with a demo and one without, and the comparison guide, as site.build.test.ts covers them.
const PAGES = [PATHS.home, PATHS.examples, PATHS.search, "/docs/examples/", "/docs/start/", PATHS.comparison];

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
      await islandsHydrated(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(offOrigin).toEqual([]);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    });

    test.each(PAGES)("%s does not scroll sideways", async (path) => {
      const { page } = await visit(path, { width });
      await islandsHydrated(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });

  test.each(PAGES)("%s on a phone lays out at the phone's width, not a desktop one, and does not scroll sideways", async (path) => {
    const { page } = await visit(path, { width: 390, isMobile: true });
    await islandsHydrated(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test.each(PAGES)("%s: with prefers-reduced-motion: reduce, nothing moves", async (path) => {
    const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    await islandsHydrated(page);
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

  test("an open skin's source scrolls inside itself at 390px, never the page", async () => {
    const { page } = await visit(PATHS.home, { width: 390 });
    const source = page.getByLabel("Broadcast CSS", { exact: true });
    await page.locator("summary", { hasText: "Broadcast CSS ·" }).click();
    await expect.poll(() => source.isVisible()).toBe(true);
    expect(await source.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  // GLOSSARY.md's figure for playdeck: 0 requests to YouTube or Vimeo before
  // play. Each of the home page's three players embeds one, and this holds a
  // stronger claim that implies it: before a press, a player requests nothing
  // from any other origin, and loads no provider. After it, each frames its
  // own embed under the CSP. Every off-origin request is still aborted, so
  // YouTube's API is answered here by a stub that only defines YT.Player.
  // Sprite Fright's frame: its still is 2048x858, and Vimeo reports the same.
  const FILM_RATIO = 2048 / 858;
  const ratio = (locator: Locator) => locator.evaluate((element) => element.clientWidth / element.clientHeight);
  describe.each([
    {
      name: "showcase",
      scope: ".pd-showcase",
      provider: "youtube",
      frame: "https://www.youtube-nocookie.com/embed/_cMxraX_5RE?",
      reached: ["https://www.youtube.com/iframe_api", "https://www.youtube-nocookie.com/embed/_cMxraX_5RE?"],
    },
    {
      name: "Velvet",
      scope: ".pd-skin__stage.velvet",
      provider: "youtube",
      frame: "https://www.youtube-nocookie.com/embed/_cMxraX_5RE?",
      reached: ["https://www.youtube.com/iframe_api", "https://www.youtube-nocookie.com/embed/_cMxraX_5RE?"],
    },
    {
      name: "Broadcast",
      scope: ".pd-skin__stage.broadcast",
      provider: "vimeo",
      frame: "https://player.vimeo.com/video/640499893?",
      reached: ["https://player.vimeo.com/video/640499893?"],
    },
  ])("the home page's $name player", ({ scope, provider, frame, reached }) => {
    test.each([390, 1280])(`at %ipx, requests nothing off the origin, and loads no provider, until it is pressed; then frames ${provider} under the CSP, at the film's ratio`, { timeout: 30_000 }, async (width) => {
      const { page, offOrigin, scripts, violations, errors } = await visit(PATHS.home, { width });
      await page.route("https://www.youtube.com/iframe_api", (route) => {
        offOrigin.push(route.request().url());
        return route.fulfill({
          contentType: "text/javascript",
          body: "window.YT = { Player: function () {} }; window.onYouTubeIframeAPIReady();",
        });
      });
      // Every island hydrated, so anything that loads on sight has loaded.
      await islandsHydrated(page);
      await page.locator(scope).scrollIntoViewIfNeeded();
      await page.locator(`${scope} [data-playdeck-part="viewport"][data-idle]`).waitFor();
      expect(offOrigin).toEqual([]);
      expect(scripts.filter((path) => /_playdeck-provider-/.test(path))).toEqual([]);
      // The still is this site's, and has loaded.
      const poster = page.locator(`${scope} img[data-playdeck-part="poster-image"]`);
      await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(new URL(await poster.evaluate((img: HTMLImageElement) => img.currentSrc)).origin).toBe(site.origin);
      // The still fills the player at the film's own ratio, so nothing crops it.
      const viewport = page.locator(`${scope} [data-playdeck-part="viewport"]`);
      expect(await ratio(viewport)).toBeCloseTo(FILM_RATIO, 1);
      expect(await ratio(poster)).toBeCloseTo(FILM_RATIO, 1);

      await page.locator(scope).getByRole("button", { name: "Play video", exact: true }).click();
      const iframe = page.locator(`${scope} iframe`);
      await expect.poll(async () => (await iframe.getAttribute("src"))?.startsWith(frame)).toBe(true);
      // The embed fills the same box, so the provider draws no bars above or below the film.
      expect(await ratio(viewport)).toBeCloseTo(FILM_RATIO, 1);
      expect(await ratio(iframe)).toBeCloseTo(FILM_RATIO, 1);
      await expect.poll(() => offOrigin.map((url) => reached.find((prefix) => url.startsWith(prefix)) ?? url)).toEqual(reached);
      // Its own provider, fetched by the press.
      const own = new RegExp(`^/assets/_playdeck-provider-${provider}-[A-Za-z0-9_-]{8}\\.js$`);
      await expect.poll(() => scripts.filter((path) => own.test(path))).toHaveLength(1);
      for (const path of scripts.filter((each) => /_playdeck-provider-/.test(each))) expect(path).toMatch(own);
      // Nothing else reached: the player has no other job to do off the page.
      await page.waitForTimeout(500);
      expect(offOrigin.map((url) => reached.find((prefix) => url.startsWith(prefix)) ?? url)).toEqual(reached);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    });
  });

  const SINTEL = "/durian/trailer/sintel_trailer-720p.mp4";
  const BUNNY = "/peach/trailer/trailer_iphone.m4v";
  // The docs' two demos are the same two players, on /docs/examples/.
  describe.each([
    { name: "streaming service", path: PATHS.examples, scope: "main", press: "Play from the beginning", clip: SINTEL },
    { name: "course platform", path: PATHS.examples, scope: "main", press: "Start the lesson", clip: BUNNY },
    { name: "docs' streaming service", path: "/docs/examples/", scope: "article", press: "Play from the beginning", clip: SINTEL },
    { name: "docs' course platform", path: "/docs/examples/", scope: "article", press: "Start the lesson", clip: BUNNY },
  ])("the $name player", ({ path, scope, press, clip }) => {
    test("requests nothing off the origin, and loads no provider, until it is pressed; then plays its clip under the CSP", async () => {
      const { page, offOrigin, scripts, violations, errors } = await visit(path, { width: 1280 });
      // Every island hydrated, so anything that loads on sight has loaded.
      await islandsHydrated(page);
      // Then back to this one, until its player is ready: a viewport writes
      // data-idle from an effect, which the server's HTML does not carry.
      await page.locator(scope).first().scrollIntoViewIfNeeded();
      await page.locator(`${scope} [data-playdeck-part="viewport"][data-idle]`).first().waitFor();
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

  // The docs' tables and blocks are as wide as their content, so every page is checked, not two.
  test("at 390px, no docs page scrolls sideways", { timeout: 120_000 }, async () => {
    const wide: string[] = [];
    for (const { path } of DOCS_NAV) {
      const { page } = await visit(path, { width: 390 });
      if ((await page.evaluate(() => document.documentElement.scrollWidth)) > 390) wide.push(path);
    }
    expect(wide).toEqual([]);
  });

  // A fence with no language, or one the highlighter does not load, renders as a plain <pre>.
  test("an unhighlighted block sits on the same tile as a highlighted one", async () => {
    const { page } = await visit("/docs/providers/youtube/", { width: 1280 });
    const look = (selector: string) =>
      page.locator(selector).first().evaluate((pre) => {
        const style = getComputedStyle(pre);
        return [style.backgroundColor, style.padding, style.borderRadius, style.fontSize, style.lineHeight];
      });
    expect(await look(".pd-prose pre:not(.shiki)")).toEqual(await look(".pd-prose pre.shiki"));
  });

  test("the docs pages visited above carry every demo the site registers", () => {
    const visited = DOCS_NAV.filter(({ path }) => PAGES.includes(path));
    expect(visited.flatMap(({ demos }) => demos).sort()).toEqual(Object.keys(DEMOS).sort());
  });

  test("the docs' search finds a page, and follows it", async () => {
    const { page, violations } = await visit(PATHS.search, { width: 1280 });
    await islandsHydrated(page);
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
