import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { browserHarness, islandsHydrated } from "@deck-cool/site-kit/browser-test";
import { REPOSITORY } from "../components/links.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { DEMOS } from "./demos.ts";
import { DOCS_NAV } from "./docs-pages.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file, so each page and its islands run
// under the CSP. Needs Playwright's Chromium: `pnpm exec playwright install chromium`.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
// Raises the harness's 15 s for this file: a page brings each deck into view
// before it checks, and axe reads a long page.
vi.setConfig({ testTimeout: 30_000 });
const { visit } = site;

// The docs pages, one with a demo and one without, as site.build.test.ts covers them.
const PAGES = ["/", "/examples/", "/docs/quickstart/", "/docs/install/"] as const;

/** Every docs page that marks a demo. */
const DEMO_PAGES = DOCS_NAV.filter(({ demos }) => demos.length > 0);

/**
 * Waits until every island has hydrated, the search box among them, and every
 * deck runs: its engine marks the slides in view with data-in-view.
 */
async function hydrated(page: Page) {
  await islandsHydrated(page);
  await page.locator('[aria-roledescription="carousel"]:not(:has([data-in-view]))').first().waitFor({ state: "detached" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

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
      await hydrated(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(offOrigin).toEqual([]);
      expect(await violations()).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  test.each([390, 1280])("at %ipx, the page does not scroll sideways", async (width) => {
    const { page } = await visit(path, { width, reducedMotion: "reduce" });
    await hydrated(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test("on a phone, the page lays out at the phone's width, not a desktop one", async () => {
    const { page } = await visit(path, { width: 390, reducedMotion: "reduce", isMobile: true });
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test("with prefers-reduced-motion: reduce, nothing moves and no deck plays", async () => {
    const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    await page.mouse.wheel(0, 2000);
    // A looping deck's own placement animations (ADR-0013, #145) are not motion this excludes: each is a step function of the user's own scroll, on a `ScrollTimeline`, never playing on its own.
    expect(
      await page.evaluate(() =>
        document.getAnimations().filter((animation) => !(animation.timeline instanceof ScrollTimeline)).map((animation) => animation.constructor.name),
      ),
    ).toEqual([]);
    for (const toggle of await page.locator("[data-carouseldeck-autoplay-toggle]").all()) {
      expect(await toggle.getAttribute("data-playing")).toBeNull();
    }
  });
});

describe("the decks in a browser", () => {
  // The site's deck look stops at the home page's skin stages: this keeps it on every other deck.
  test("the testimonials' Next keeps the site's deck look: a translucent grey pill", async () => {
    const { page } = await visit("/examples/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const next = page.locator(".testimonials-deck [data-carouseldeck-next]");
    expect(
      await next.evaluate((button) => {
        const style = getComputedStyle(button);
        return [style.backgroundColor, style.borderRadius, style.minHeight];
      }),
    ).toEqual(["rgba(66, 66, 69, 0.72)", "999px", "44px"]);
  });

  test("the testimonials' Next moves the deck, under the CSP", async () => {
    const { page, violations } = await visit("/examples/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const deck = page.locator(".testimonials-deck");
    const current = () => deck.locator('[data-carouseldeck-dots] [aria-current="true"]').getAttribute("data-index");
    expect(await current()).toBe("0");
    await deck.locator("[data-carouseldeck-next]").click();
    await expect.poll(current).toBe("1");
    expect(await violations()).toEqual([]);
  });

  // Reduced motion, as every visit() in this file runs under: Next cuts straight
  // to the next card, with no throw to wait out.
  test("the card stack's Next moves the top card out and the next one takes its place, under the CSP", async () => {
    const { page, violations } = await visit("/examples/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const deck = page.locator(".card-stack-deck");
    const top = () => deck.locator("[data-focal] h3").textContent();
    expect(await top()).toBe("Valley");
    await deck.locator("[data-focal] [data-carouseldeck-next]").click();
    await expect.poll(top).toBe("Waterfall");
    expect(await violations()).toEqual([]);
  });

  test("the card stack loops: five Nexts bring Valley back on top", async () => {
    const { page, violations } = await visit("/examples/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const deck = page.locator(".card-stack-deck");
    const top = () => deck.locator("[data-focal] h3").textContent();
    for (const name of ["Waterfall", "Peaks", "Shore", "Pines", "Valley"]) {
      await deck.locator("[data-focal] [data-carouseldeck-next]").click();
      await expect.poll(top).toBe(name);
    }
    expect(await violations()).toEqual([]);
  });

  // The recipe's reduced-motion block makes --exit a step at halfway: a drag
  // partway through, short of halfway, leaves the card without a throw.
  test("a partial drag shows no throw under reduced motion, where plain motion already shows one", async () => {
    const partialDragTransform = async (reducedMotion: "reduce" | "no-preference") => {
      const { page } = await visit("/examples/", { width: 1280, reducedMotion });
      await hydrated(page);
      const deck = page.locator(".card-stack-deck");
      const leaving = deck.locator(".photo-card", { hasText: "Valley" }).first();
      const viewport = deck.locator("[data-carouseldeck-viewport]");
      await viewport.scrollIntoViewIfNeeded();
      const box = await viewport.boundingBox();
      if (!box) throw new Error("the card stack's viewport has no box");
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - box.width * 0.35, y, { steps: 10 });
      const transform = await leaving.evaluate((element) => getComputedStyle(element).transform);
      await page.mouse.up();
      return transform;
    };
    expect(await partialDragTransform("reduce")).toBe("matrix(1, 0, 0, 1, 0, 0)");
    expect(await partialDragTransform("no-preference")).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
  });

  // The page's script is its islands', so a click selects the command for copying instead.
  test("one click on the home page's install command selects all of it, and nothing else", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(".home-install code").click();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("pnpm add @carouseldeck/react");
  });

  test("the home page's two skins set the same deck in two different faces and grounds, none of it the site's own look", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const looks = await page.locator(".home-skin__stage").evaluateAll((stages) =>
      stages.map((stage) => {
        const slide = getComputedStyle(stage.querySelector("[data-carouseldeck-slide] > *") ?? stage);
        const next = getComputedStyle(stage.querySelector("[data-carouseldeck-next]") ?? stage);
        return { font: slide.fontFamily, ground: slide.backgroundColor, next: next.backgroundColor, radius: next.borderRadius };
      }),
    );
    expect(looks).toHaveLength(2);
    expect(looks[0]?.font).not.toBe(looks[1]?.font);
    expect(looks[0]?.ground).not.toBe(looks[1]?.ground);
    expect(looks[0]?.next).not.toBe(looks[1]?.next);
    expect(looks[0]?.radius).not.toBe(looks[1]?.radius);
    // The site's deck controls are this translucent grey: a skin's sheet alone styles its deck.
    for (const look of looks) expect(look.next).not.toBe("rgba(66, 66, 69, 0.72)");
    // Each scrollable code block is focusable, so each is named.
    for (const name of ["Soft CSS", "Stark CSS"]) {
      expect(await page.getByLabel(name, { exact: true }).evaluate((element) => element.tagName)).toBe("PRE");
    }
  });

  test("a skin's CSS opens from the keyboard, named and in focus, and scrolls inside itself at 390px", async () => {
    const { page } = await visit("/", { width: 390, reducedMotion: "reduce" });
    const code = page.getByLabel("Soft CSS", { exact: true });
    expect(await code.isVisible()).toBe(false);
    const summary = page.locator("summary", { hasText: "Soft CSS" });
    await summary.focus();
    expect(await summary.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect.poll(() => code.isVisible()).toBe(true);
    expect(await code.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Closed, the sheet is hidden from axe: open, its highlighted tokens are checked too.
    expect((await new AxeBuilder({ page }).include(".home-skin details[open]").analyze()).violations).toEqual([]);
  }, 15_000);

  test("each skin's deck is live: its Next moves it, and only it, under the CSP", async () => {
    const { page, violations } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const current = (name: string) =>
      page
        .getByRole("region", { name: `${name} deck` })
        .locator('[data-carouseldeck-dots] [aria-current="true"]')
        .getAttribute("data-index");
    await page.getByRole("region", { name: "Stark deck" }).getByRole("button", { name: "Next" }).click();
    await expect.poll(() => current("Stark")).toBe("1");
    expect(await current("Soft")).toBe("0");
    expect(await violations()).toEqual([]);
  });
});

describe("search in a browser", () => {
  test("finds a page by its words and follows the result, under the CSP", async () => {
    const { page, violations, offOrigin } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const box = page.getByRole("combobox", { name: "Search the docs" });
    await box.fill("testimonials");
    const result = page.getByRole("option").first();
    await expect.poll(() => result.textContent()).toBe("Examples: decks built with carouseldeck");
    await box.press("ArrowDown");
    await box.press("Enter");
    await page.waitForURL(`${site.origin}/examples/`);
    expect(await violations()).toEqual([]);
    expect(offOrigin).toEqual([]);
  });

  test("says so when nothing matches", async () => {
    const { page } = await visit("/", { width: 390, reducedMotion: "reduce" });
    await hydrated(page);
    await page.getByRole("combobox", { name: "Search the docs" }).fill("zebra");
    await expect.poll(() => page.getByRole("status").textContent()).toBe("No page matches");
  });
});

describe("the docs' demos in a browser", () => {
  test("the pages visited below carry every demo the site registers", () => {
    expect(DEMO_PAGES.flatMap(({ demos }) => demos).sort()).toEqual(Object.keys(DEMOS).sort());
  });

  // Every demo island runs under the CSP, loads nothing from another origin, and no script fails.
  test.each(DEMO_PAGES)("$href's demos run, under the CSP, with nothing off the origin, and axe finds no violations", async ({ href }) => {
    const { page, offOrigin, violations, errors } = await visit(href, { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    expect(await page.locator("article [data-carouseldeck-slide][data-in-view]").count()).toBeGreaterThan(0);
    // The curve effect fades a slide with its distance from the focal one: the neighbours' faint text is the effect.
    const faded = ".example-curve [data-carouseldeck-slide]:not([data-focal]), .example-curve-size [data-carouseldeck-slide]:not([data-focal])";
    expect((await new AxeBuilder({ page }).include("article").exclude(faded).analyze()).violations).toEqual([]);
    expect(offOrigin).toEqual([]);
    expect(await violations()).toEqual([]);
    expect(errors).toEqual([]);
  });

  test.each(DEMO_PAGES)("at 390px, $href does not scroll sideways", async ({ href }) => {
    const { page } = await visit(href, { width: 390, reducedMotion: "reduce" });
    await hydrated(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  // demo-theme.css: theme.css styles the Theme demo's controls, and no other deck's.
  test("the Theme demo's Next wears carouseldeck's theme.css, and another demo's keeps the site's pill", async () => {
    const nextLook = async (path: string, deck: string) => {
      const { page } = await visit(path, { width: 1280, reducedMotion: "reduce" });
      await hydrated(page);
      return page
        .locator(`${deck} [data-carouseldeck-next]`)
        .evaluate((button) => [getComputedStyle(button).borderTopStyle, getComputedStyle(button).backgroundColor]);
    };
    expect(await nextLook("/docs/guides/theme/", ".example-theme")).toEqual(["solid", "rgb(0, 0, 0)"]);
    expect(await nextLook("/docs/quickstart/", "article")).toEqual(["none", "rgba(66, 66, 69, 0.72)"]);
  });

  // Pages guide, "a page size per breakpoint": two slides to a page below
  // 640px, three from it, both marked from data (#181). 8 slides make 4
  // pages of 2, or 3 pages of 3 (the last one short).
  test.each([
    [390, 2, 4],
    [1280, 3, 3],
  ])("at %ipx, the per-breakpoint pages demo's Next moves a page of %i (%i pages in all)", async (width, pageSize, pageCount) => {
    const { page } = await visit("/docs/guides/pages/", { width, reducedMotion: "reduce" });
    await hydrated(page);
    const deck = page.locator(".example-pages-breakpoints");
    const counter = () => deck.locator("[data-carouseldeck-counter]").textContent();
    const current = () => deck.locator("[data-current]").getAttribute("aria-label");
    await expect.poll(counter).toBe(`1 / ${pageCount}`);
    expect(await current()).toBe("1 of 8");
    await deck.locator("[data-carouseldeck-next]").click();
    await expect.poll(counter).toBe(`2 / ${pageCount}`);
    // The first slide of the second page: slide 3 of 8 at 390px (pages of
    // 2), slide 4 of 8 at 1280px (pages of 3).
    expect(await current()).toBe(`${pageSize + 1} of 8`);
  });

  // Pages guide, "one page size": an inline style wins at every breakpoint,
  // so one width proves it (#181).
  test("the one-page-size pages demo's Next moves a page of 3, to slide 4 of 8", async () => {
    const { page } = await visit("/docs/guides/pages/", { width: 1280, reducedMotion: "reduce" });
    await hydrated(page);
    const deck = page.locator(".example-pages-prop");
    const counter = () => deck.locator("[data-carouseldeck-counter]").textContent();
    const current = () => deck.locator("[data-current]").getAttribute("aria-label");
    await expect.poll(counter).toBe("1 / 3");
    expect(await current()).toBe("1 of 8");
    await deck.locator("[data-carouseldeck-next]").click();
    await expect.poll(counter).toBe("2 / 3");
    expect(await current()).toBe("4 of 8");
  });
});

// At the bar's phone breakpoint the links fold into a menu button, last in
// the row (#156).
describe("the Family bar's links menu", () => {
  const LINKS = [
    ["Docs", "/docs/"],
    ["Examples", "/examples/"],
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
