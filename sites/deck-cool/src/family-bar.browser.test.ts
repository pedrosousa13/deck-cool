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
/** The sheet of decks, inside the panel. Below it, the panel is the shade. */
const SHEET = ".family-bar__sheet";

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} is not on screen`);
  return found;
}

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

  test("a click on the shade closes the panel and does not reach the page under it", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    const browse = await box(page, 'main a[href="#decks"]');
    await page.locator(BUTTON).click();
    expect((await box(page, SHEET)).y + (await box(page, SHEET)).height).toBeLessThan(browse.y);
    await page.mouse.click(browse.x + browse.width / 2, browse.y + browse.height / 2);
    expect(await isOpen(page)).toBe(false);
    expect(new URL(page.url()).hash).toBe("");
  });

  test("a click on the bar closes the panel, and the bar's links still work", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    await page.locator('header nav a[href="#playdeck"]').click();
    expect(await isOpen(page)).toBe(false);
    expect(new URL(page.url()).hash).toBe("#playdeck");
  });

  test("a click on a deck link follows it", async () => {
    const { page, offOrigin } = await visit({ reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const link = page.locator(`${PANEL} a`).nth(1);
    const href = await link.getAttribute("href");
    if (href === null) throw new Error("the deck link has no href");
    await link.click();
    await expect.poll(() => offOrigin).toContain(new URL(href).href);
  });

  test("the sheet sits under the bar, on the 980px measure", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const bar = await box(page, "header");
    const row = await box(page, "header nav");
    const sheet = await box(page, SHEET);
    const list = await box(page, `${SHEET} ul`);
    expect(sheet.y).toBe(bar.y + bar.height);
    expect(list.x).toBe(row.x + 22);
    expect(list.width).toBe(980 - 2 * 22);
  });

  test.each([
    [390, 1],
    [1280, 3],
  ])("at %ipx, the decks sit in %i column(s)", async (width, columns) => {
    const { page } = await visit({ width, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const lefts = await page
      .locator(`${SHEET} li`)
      .evaluateAll((items) => new Set(items.map((item) => item.getBoundingClientRect().x)).size);
    expect(lefts).toBe(columns);
  });

  test("with motion allowed, each deck's icon is there as its tile appears", async () => {
    const { page } = await visit({ reducedMotion: "no-preference" });
    const atFirstSight = await page.evaluate(
      () =>
        new Promise<boolean[]>((resolve) => {
          const panel = document.querySelector<HTMLElement>("header [popover]");
          const first = panel?.querySelector("li");
          if (!panel || !first) throw new Error("no panel or no tile");
          panel.showPopover();
          const look = () => {
            if (Number(getComputedStyle(first).opacity) > 0) {
              resolve([...panel.querySelectorAll("img")].map((img) => img.complete && img.naturalWidth > 0));
            } else requestAnimationFrame(look);
          };
          look();
        }),
    );
    expect(atFirstSight).toEqual([true, true, true]);
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
