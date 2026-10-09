import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { serveSite, type ServedSite } from "./serve-site.ts";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file. Needs Playwright's Chromium:
// `pnpm exec playwright install chromium`.

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
  /** Requests the page made to another origin, such as a deck's site. Each was aborted. */
  offOrigin: string[];
}

async function visit(options: { width?: number; reducedMotion: "reduce" | "no-preference" }): Promise<Visit> {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: 900 },
    reducedMotion: options.reducedMotion,
  });
  const offOrigin: string[] = [];
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
  await page.goto(`${site.origin}/`, { waitUntil: "load" });
  return { page, offOrigin };
}

const BUTTON = 'header button[aria-label="Switch deck"]';
const PANEL = "header [popover]";

const isOpen = (page: Page) => page.locator(PANEL).evaluate((panel) => panel.matches(":popover-open"));
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active?.tagName === "BUTTON" ? active.getAttribute("aria-label") : active?.getAttribute("href");
  });
/** The CSS transitions and animations running now, by property or name. */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) =>
        animation instanceof CSSTransition
          ? animation.transitionProperty
          : animation instanceof CSSAnimation
            ? animation.animationName
            : "other",
      ),
  );
/** Waits until nothing moves, such as the name rolling in on load. */
const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));

describe("the Family bar's switcher in a browser", () => {
  test.each([390, 1280])("at %ipx, axe finds no violations and the CSP holds, closed or open", async (width) => {
    const { page } = await visit({ width, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator(BUTTON).click();
    expect(await isOpen(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  });

  test("the button opens the panel with Enter and with Space, and toggles it", async () => {
    const { page } = await visit({ reducedMotion: "reduce" });
    await page.locator(BUTTON).focus();
    await page.keyboard.press("Enter");
    expect(await isOpen(page)).toBe(true);
    await page.keyboard.press("Enter");
    expect(await isOpen(page)).toBe(false);
    await page.keyboard.press("Space");
    expect(await isOpen(page)).toBe(true);
    await page.locator(BUTTON).click();
    expect(await isOpen(page)).toBe(false);
  });

  test("Tab moves from the button through every deck link, in order", async () => {
    const { page } = await visit({ reducedMotion: "reduce" });
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("Switch deck");
    await page.keyboard.press("Enter");

    const decks = await page.locator(`${PANEL} a`).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(decks).toHaveLength(3);
    for (const href of decks) {
      await page.keyboard.press("Tab");
      expect(await focused(page)).toBe(href);
    }
  });

  test("Escape closes the panel and focus returns to the button", async () => {
    const { page } = await visit({ reducedMotion: "reduce" });
    await page.locator(BUTTON).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(await focused(page)).not.toBe("Switch deck");
    await page.keyboard.press("Escape");
    expect(await isOpen(page)).toBe(false);
    expect(await focused(page)).toBe("Switch deck");
  });

  test("a click outside the panel closes it", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const panel = await page.locator(PANEL).boundingBox();
    if (panel === null) throw new Error("the open panel is not on screen");
    // Below the panel, over the page.
    await page.mouse.click(640, panel.y + panel.height + 100);
    expect(await isOpen(page)).toBe(false);
  });

  test("a click on a deck link follows it", async () => {
    const { page, offOrigin } = await visit({ reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const link = page.locator(`${PANEL} a`).nth(1);
    const href = await link.getAttribute("href");
    await link.click();
    await expect.poll(() => offOrigin).toContain(new URL(href ?? "").href);
  });

  test("the panel sits under the bar, on the 980px measure", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const bar = await page.locator("header").boundingBox();
    const panel = await page.locator(PANEL).boundingBox();
    const list = await page.locator(`${PANEL} ul`).boundingBox();
    const row = await page.locator("header nav").boundingBox();
    expect(panel?.y).toBe((bar?.y ?? NaN) + (bar?.height ?? NaN));
    expect(list?.x).toBe((row?.x ?? NaN) + 22);
    expect(list?.width).toBe(980 - 2 * 22);
  });

  test("with motion allowed, opening and closing both animate, and the fan follows", async () => {
    const { page } = await visit({ reducedMotion: "no-preference" });
    await settled(page);

    await page.locator(BUTTON).click();
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "opacity", "transform", "background-color"]));
    const fan = () =>
      page.locator(".family-bar__fan-left").evaluate((rect) => getComputedStyle(rect).transform);
    await settled(page);
    const open = await fan();

    await page.keyboard.press("Escape");
    expect(await isOpen(page)).toBe(false);
    // The panel stays on screen while it animates closed.
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "display", "overlay"]));
    expect(await page.locator(PANEL).isVisible()).toBe(true);
    await settled(page);
    expect(await page.locator(PANEL).isVisible()).toBe(false);
    expect(await fan()).not.toBe(open);
  });

  test("with prefers-reduced-motion: reduce, nothing animates, opening or closing", async () => {
    const { page } = await visit({ reducedMotion: "reduce" });
    expect(await running(page)).toEqual([]);
    await page.locator(BUTTON).click();
    expect(await isOpen(page)).toBe(true);
    expect(await running(page)).toEqual([]);

    const timings = await page.locator("header, header *").evaluateAll((elements) =>
      elements.flatMap((element) =>
        ["", "::before", "::after", "::backdrop"].map((pseudo) => {
          const style = getComputedStyle(element, pseudo || null);
          return [style.animationName, style.transitionDuration];
        }),
      ),
    );
    for (const [animation, transition] of timings) {
      expect(animation).toBe("none");
      expect(transition?.split(", ").every((duration) => duration === "0s")).toBe(true);
    }

    await page.keyboard.press("Escape");
    expect(await isOpen(page)).toBe(false);
    expect(await running(page)).toEqual([]);
    expect(await page.locator(PANEL).isVisible()).toBe(false);
  });
});
