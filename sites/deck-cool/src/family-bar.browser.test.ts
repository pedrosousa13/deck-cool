import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { describe, expect, test } from "vitest";
import { decks } from "@deck-cool/brand/decks";
import { browserHarness } from "@deck-cool/site-kit/browser-test";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file. Needs Playwright's Chromium:
// `pnpm exec playwright install chromium`.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
const { visit } = site;

const SWITCH_BUTTON = 'header button[aria-label="Switch deck"]';
const SWITCH_PANEL = "#family-bar-decks";
const MENU_BUTTON = 'header button[aria-label="Menu"]';
const MENU_PANEL = "#family-bar-links";

const sheetOf = (panel: string) => `${panel} .family-bar__sheet`;
const shadeOf = (panel: string) => `${panel} .family-bar__shade`;

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} is not on screen`);
  return found;
}

const isOpen = (page: Page, panel: string) => page.locator(panel).evaluate((element) => element.matches(":popover-open"));
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
/**
 * Waits until nothing moves, such as the name rolling in on load. A
 * scroll-driven animation counts as running for as long as it is there, and
 * moves only as its element scrolls, so it is left out.
 */
const settled = (page: Page) =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.timeline !== document.timeline || animation.playState !== "running"),
  );

interface Frame {
  sheet: { top: number; left: number; width: number; height: number };
  shade: { top: number; left: number; width: number; height: number };
}

interface Close {
  /** The sheet's and the shade's boxes, sampled on every frame until the panel is hidden. */
  frames: Frame[];
  /** performance.now() from the keydown or click that started the close to the panel going hidden. */
  ms: number;
}

declare global {
  interface Window {
    /** What a close did, set by recordClose(). */
    closeFrames?: Promise<Close>;
  }
}

/**
 * Records the switcher's sheet's and shade's boxes on every frame, from now
 * until its panel is hidden, and how long that close took: from the keydown
 * or click that starts it to the panel going hidden, not the gap between the
 * first and last sampled frame. A loaded runner samples rAF sparsely, which
 * shrinks that gap well under the exit's real length even though the close
 * runs at its usual speed (#207).
 */
const recordClose = (page: Page) =>
  page.evaluate(() => {
    window.closeFrames = new Promise((resolve) => {
      const frames: Frame[] = [];
      let startedAt: number | null = null;
      const start = (event: Event) => {
        if (startedAt === null && (event.type === "click" || (event as KeyboardEvent).key === "Escape")) {
          startedAt = performance.now();
        }
      };
      document.addEventListener("keydown", start, { capture: true });
      document.addEventListener("click", start, { capture: true });
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`${selector} is missing`);
        const { top, left, width, height } = element.getBoundingClientRect();
        return { top, left, width, height };
      };
      const panel = document.querySelector("#family-bar-decks");
      const look = () => {
        if (panel === null || getComputedStyle(panel).display === "none") {
          document.removeEventListener("keydown", start, { capture: true });
          document.removeEventListener("click", start, { capture: true });
          return resolve({ frames, ms: startedAt === null ? 0 : performance.now() - startedAt });
        }
        frames.push({
          sheet: rect("#family-bar-decks .family-bar__sheet"),
          shade: rect("#family-bar-decks .family-bar__shade"),
        });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
  });

describe("the Family bar's switcher in a browser", () => {
  test.each([390, 1280])("at %ipx, axe finds no violations and the CSP holds, closed or open", async (width) => {
    const { page } = await visit("/", { width, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator(SWITCH_BUTTON).click();
    expect(await isOpen(page, SWITCH_PANEL)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  });

  test("the button opens the panel with Enter and with Space, and toggles it", async () => {
    const { page } = await visit("/", { reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).focus();
    await page.keyboard.press("Enter");
    expect(await isOpen(page, SWITCH_PANEL)).toBe(true);
    await page.keyboard.press("Enter");
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    await page.keyboard.press("Space");
    expect(await isOpen(page, SWITCH_PANEL)).toBe(true);
    await page.locator(SWITCH_BUTTON).click();
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
  });

  test("Tab moves from the button through every deck link, in order", async () => {
    const { page } = await visit("/", { reducedMotion: "reduce" });
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("Switch deck");
    await page.keyboard.press("Enter");

    const decksLinked = await page
      .locator(`${SWITCH_PANEL} a`)
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(decksLinked).toHaveLength(4);
    for (const href of decksLinked) {
      await page.keyboard.press("Tab");
      expect(await focused(page)).toBe(href);
    }
  });

  test("Escape closes the panel and focus returns to the button", async () => {
    const { page } = await visit("/", { reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(await focused(page)).not.toBe("Switch deck");
    await page.keyboard.press("Escape");
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    expect(await focused(page)).toBe("Switch deck");
  });

  test("a click on the shade closes the panel and does not reach the page under it", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    const browse = await box(page, 'main a[href="#decks"]');
    await page.locator(SWITCH_BUTTON).click();
    expect((await box(page, sheetOf(SWITCH_PANEL))).y + (await box(page, sheetOf(SWITCH_PANEL))).height).toBeLessThan(browse.y);
    await page.mouse.click(browse.x + browse.width / 2, browse.y + browse.height / 2);
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    expect(new URL(page.url()).hash).toBe("");
  });

  test("a click on the bar closes the panel, and the bar's links still work", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).click();
    await page.locator('.family-bar__links a[href="#playdeck"]').click();
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    expect(new URL(page.url()).hash).toBe("#playdeck");
  });

  test("a click on a deck link follows it", async () => {
    const { page, offOrigin } = await visit("/", { reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).click();
    const link = page.locator(`${SWITCH_PANEL} a`).nth(1);
    const href = await link.getAttribute("href");
    if (href === null) throw new Error("the deck link has no href");
    await link.click();
    await expect.poll(() => offOrigin).toContain(new URL(href).href);
  });

  test("the sheet sits under the bar, on the 980px measure", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).click();
    const bar = await box(page, "header");
    const row = await box(page, "header nav");
    const sheet = await box(page, sheetOf(SWITCH_PANEL));
    const list = await box(page, `${sheetOf(SWITCH_PANEL)} ul`);
    expect(sheet.y).toBe(bar.y + bar.height);
    expect(list.x).toBe(row.x + 22);
    expect(list.width).toBe(980 - 2 * 22);
  });

  test.each([
    [390, 1],
    [1280, 3],
  ])("at %ipx, the decks sit in %i column(s)", async (width, columns) => {
    const { page } = await visit("/", { width, reducedMotion: "reduce" });
    await page.locator(SWITCH_BUTTON).click();
    const lefts = await page
      .locator(`${sheetOf(SWITCH_PANEL)} li`)
      .evaluateAll((items) => new Set(items.map((item) => item.getBoundingClientRect().x)).size);
    expect(lefts).toBe(columns);
  });

  test("with motion allowed, each deck's icon is there as its tile appears", async () => {
    const { page } = await visit("/", { reducedMotion: "no-preference" });
    const atFirstSight = await page.evaluate(
      () =>
        new Promise<boolean[]>((resolve) => {
          const panel = document.querySelector<HTMLElement>("#family-bar-decks");
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
    expect(atFirstSight).toEqual([true, true, true, true]);
  });

  test("with motion allowed, opening and closing both animate, and the fan follows", async () => {
    const { page } = await visit("/", { reducedMotion: "no-preference" });
    await settled(page);

    await page.locator(SWITCH_BUTTON).click();
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "opacity", "transform", "background-color"]));
    const fan = () =>
      page.locator(".family-bar__fan-left").evaluate((rect) => getComputedStyle(rect).transform);
    await settled(page);
    const open = await fan();

    await page.keyboard.press("Escape");
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    // The panel stays on screen while it animates closed.
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "display", "overlay"]));
    expect(await page.locator(SWITCH_PANEL).isVisible()).toBe(true);
    await settled(page);
    expect(await page.locator(SWITCH_PANEL).isVisible()).toBe(false);
    expect(await fan()).not.toBe(open);
  });

  test("with prefers-reduced-motion: reduce, nothing animates, opening or closing", async () => {
    const { page } = await visit("/", { reducedMotion: "reduce" });
    expect(await running(page)).toEqual([]);
    await page.locator(SWITCH_BUTTON).click();
    expect(await isOpen(page, SWITCH_PANEL)).toBe(true);
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
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    expect(await running(page)).toEqual([]);
    expect(await page.locator(SWITCH_PANEL).isVisible()).toBe(false);
  });

  // Closing is the opening played backwards: the sheet and the shade keep their
  // open boxes on every frame until the panel is hidden (#35).
  test.each([
    [1280, "Escape"],
    [390, "Escape"],
    [1280, "a click on the shade"],
    [390, "a click on the shade"],
  ])("at %ipx, the sheet keeps its place under the bar while it closes on %s", async (width, how) => {
    const { page } = await visit("/", { width, reducedMotion: "no-preference" });
    await page.locator(SWITCH_BUTTON).click();
    await settled(page);
    const bar = await box(page, "header");
    const sheet = await box(page, sheetOf(SWITCH_PANEL));
    const shade = await box(page, shadeOf(SWITCH_PANEL));
    expect(sheet).toMatchObject({ x: 0, y: bar.y + bar.height, width });

    await recordClose(page);
    if (how === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(width / 2, shade.y + shade.height / 2);
    const { frames, ms } = await page.evaluate(() => window.closeFrames ?? Promise.reject(new Error("not recording")));

    // The exit runs for .45s. A loaded runner samples it on fewer frames, and
    // sparsely, so measure the close itself, from the keydown or click to
    // the panel going hidden, not the gap between the first and last sampled
    // frame: that gap shrinks well under the exit's real length once frames
    // land unevenly, even though the close still runs at its usual speed.
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(ms).toBeGreaterThanOrEqual(300);
    for (const frame of frames) {
      expect(frame.sheet).toEqual({ top: sheet.y, left: sheet.x, width: sheet.width, height: sheet.height });
      expect(frame.shade).toEqual({ top: shade.y, left: shade.x, width: shade.width, height: shade.height });
    }
  });
});

// At the phone breakpoint the links leave the row for a menu panel of their
// own, opened by a button last in the row (#156). Above it the bar is
// unchanged: the links stay inline and no menu button shows. The menu is a
// popover its button toggles, the same way the switcher is, so only one of
// the two is ever open, and its look and motion follow the switcher's panel.
describe("the Family bar's links menu", () => {
  test("on a phone at 390px, the menu button opens every link, each tappable", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator(MENU_BUTTON).click();
    expect(await isOpen(page, MENU_PANEL)).toBe(true);
    const items = await page
      .locator(`${MENU_PANEL} a`)
      .evaluateAll((links) => links.map((a) => [a.textContent, a.getAttribute("href")]));
    expect(items).toEqual(decks.map((deck) => [deck.name, `#${deck.name}`]));
    for (const link of await page.locator(`${MENU_PANEL} a`).all()) expect(await link.isEnabled()).toBe(true);
  });

  test("at 1024px, the bar renders as now: the links stay in the row and no menu button shows", async () => {
    const { page } = await visit("/", { width: 1024, reducedMotion: "reduce" });
    expect(await page.locator(MENU_BUTTON).isVisible()).toBe(false);
    expect(await page.locator(".family-bar__links").isVisible()).toBe(true);
    expect(await page.locator(".family-bar__links a").count()).toBe(decks.length);
  });

  test("Escape closes the menu and focus returns to the button", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator(MENU_BUTTON).focus();
    await page.keyboard.press("Enter");
    expect(await isOpen(page, MENU_PANEL)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await focused(page)).not.toBe("Menu");
    await page.keyboard.press("Escape");
    expect(await isOpen(page, MENU_PANEL)).toBe(false);
    expect(await focused(page)).toBe("Menu");
  });

  test("a click on the shade closes the menu and does not reach the page under it", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator(MENU_BUTTON).click();
    const shade = await box(page, shadeOf(MENU_PANEL));
    await page.mouse.click(shade.x + shade.width / 2, shade.y + shade.height / 2);
    expect(await isOpen(page, MENU_PANEL)).toBe(false);
    expect(new URL(page.url()).hash).toBe("");
  });

  test("opening the switcher closes the menu, and the reverse", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator(MENU_BUTTON).click();
    expect(await isOpen(page, MENU_PANEL)).toBe(true);
    await page.locator(SWITCH_BUTTON).click();
    expect(await isOpen(page, MENU_PANEL)).toBe(false);
    expect(await isOpen(page, SWITCH_PANEL)).toBe(true);
    await page.locator(MENU_BUTTON).click();
    expect(await isOpen(page, SWITCH_PANEL)).toBe(false);
    expect(await isOpen(page, MENU_PANEL)).toBe(true);
  });

  test("Tab moves from the menu button through every link, in order", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    await page.locator(MENU_BUTTON).focus();
    await page.keyboard.press("Enter");
    const hrefs = await page.locator(`${MENU_PANEL} a`).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    for (const href of hrefs) {
      await page.keyboard.press("Tab");
      expect(await focused(page)).toBe(href);
    }
  });

  test("with motion allowed, opening and closing the menu both animate, following the switcher's panel", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "no-preference" });
    await settled(page);

    await page.locator(MENU_BUTTON).click();
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "opacity", "transform", "background-color"]));
    await settled(page);

    await page.keyboard.press("Escape");
    expect(await isOpen(page, MENU_PANEL)).toBe(false);
    expect(await running(page)).toEqual(expect.arrayContaining(["clip-path", "display", "overlay"]));
    expect(await page.locator(MENU_PANEL).isVisible()).toBe(true);
    await settled(page);
    expect(await page.locator(MENU_PANEL).isVisible()).toBe(false);
  });

  test("at 390px, with prefers-reduced-motion: reduce, nothing animates, opening or closing", async () => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "reduce" });
    expect(await running(page)).toEqual([]);
    await page.locator(MENU_BUTTON).click();
    expect(await isOpen(page, MENU_PANEL)).toBe(true);
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
    expect(await isOpen(page, MENU_PANEL)).toBe(false);
    expect(await running(page)).toEqual([]);
    expect(await page.locator(MENU_PANEL).isVisible()).toBe(false);
  });
});
