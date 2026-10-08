import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { serveSite, type ServedSite } from "./serve-site.ts";

// Drives the built site (build.global-setup.ts) in Chromium. Needs Playwright's
// Chromium: `pnpm exec playwright install chromium`.

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

async function open(options: { reducedMotion: "reduce" | "no-preference" }): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  // Anything off this origin, such as a deck's site, is not loaded.
  await context.route((url) => url.origin !== site.origin, (route) => route.abort());
  await page.goto(`${site.origin}/`);
  return page;
}

const isOpen = (page: Page) => page.locator("header details").evaluate((details: HTMLDetailsElement) => details.open);
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active?.tagName === "SUMMARY" ? "summary" : active?.getAttribute("href");
  });

describe("the Family bar in a browser", () => {
  test("axe finds no violations, closed or open", async () => {
    const page = await open({ reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator("header summary").click();
    expect(await isOpen(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("the switcher opens and closes from the keyboard, and Tab reaches every deck", async () => {
    const page = await open({ reducedMotion: "reduce" });
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("summary");

    await page.keyboard.press("Enter");
    expect(await isOpen(page)).toBe(true);
    await page.keyboard.press("Enter");
    expect(await isOpen(page)).toBe(false);
    await page.keyboard.press("Space");
    expect(await isOpen(page)).toBe(true);

    const decks = await page.locator("header details a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(decks).toHaveLength(3);
    for (const href of decks) {
      await page.keyboard.press("Tab");
      expect(await focused(page)).toBe(href);
    }

    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    expect(await focused(page)).toBe("summary");
    await page.keyboard.press("Space");
    expect(await isOpen(page)).toBe(false);
  });

  test("with motion allowed, the bar animates on load and on opening", async () => {
    const page = await open({ reducedMotion: "no-preference" });
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
    await page.locator("header summary").click();
    const names = await page.evaluate(() =>
      document
        .getAnimations()
        .map((animation) => (animation instanceof CSSAnimation ? animation.animationName : "transition")),
    );
    expect(names).toEqual(expect.arrayContaining(["family-bar-sheet", "family-bar-fade", "family-bar-drop"]));

    // The fan and the chevron move by transition, both ways.
    const durations = await page
      .locator(".family-bar__fan rect, .family-bar__chevron")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transitionDuration));
    expect(durations).toHaveLength(4);
    for (const duration of durations) expect(duration).not.toBe("0s");
  });

  test("with prefers-reduced-motion: reduce, nothing animates", async () => {
    const page = await open({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.getAnimations())).toEqual([]);
    await page.locator("header summary").click();
    expect(await isOpen(page)).toBe(true);
    expect(await page.evaluate(() => document.getAnimations())).toEqual([]);

    const timings = await page.locator("header, header *").evaluateAll((elements) =>
      elements.flatMap((element) =>
        [getComputedStyle(element), getComputedStyle(element, "::before"), getComputedStyle(element, "::after")].map(
          (style) => [style.animationName, style.transitionDuration],
        ),
      ),
    );
    for (const [animation, transition] of timings) {
      expect(animation).toBe("none");
      expect(transition?.split(", ").every((duration) => duration === "0s")).toBe(true);
    }
  });
});
