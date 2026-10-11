import { AxeBuilder } from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { describe, expect, test } from "vitest";
import { browserHarness } from "@deck-cool/site-kit/browser-test";

// Drives the built site (build.global-setup.ts) in Chromium, served with the
// headers in the build's _headers file. Needs Playwright's Chromium:
// `pnpm exec playwright install chromium`.

const site = browserHarness(fileURLToPath(new URL("..", import.meta.url)));
const { visit } = site;

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
/**
 * Waits until nothing moves, such as the name rolling in on load. A
 * scroll-driven animation, such as the links' fade, counts as running for as
 * long as it is there, and moves only as its element scrolls, so it is left out.
 */
const settled = (page: Page) =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .every((animation) => animation.timeline !== document.timeline || animation.playState !== "running"),
  );

interface Frame {
  /** performance.now() when the frame was recorded, in ms. */
  at: number;
  sheet: { top: number; left: number; width: number; height: number };
  shade: { top: number; left: number; width: number; height: number };
}

declare global {
  interface Window {
    /** The time and the sheet's and the shade's boxes on each frame of a close, set by recordClose(). */
    closeFrames?: Promise<Frame[]>;
  }
}

/** Records the time and the sheet's and the shade's boxes on every frame, from now until the panel is hidden. */
const recordClose = (page: Page) =>
  page.evaluate(() => {
    window.closeFrames = new Promise((resolve) => {
      const frames: Frame[] = [];
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) throw new Error(`${selector} is missing`);
        const { top, left, width, height } = element.getBoundingClientRect();
        return { top, left, width, height };
      };
      const panel = document.querySelector("header [popover]");
      const look = () => {
        if (panel === null || getComputedStyle(panel).display === "none") return resolve(frames);
        frames.push({ at: performance.now(), sheet: rect(".family-bar__sheet"), shade: rect(".family-bar__shade") });
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
  });

describe("the Family bar's switcher in a browser", () => {
  test.each([390, 1280])("at %ipx, axe finds no violations and the CSP holds, closed or open", async (width) => {
    const { page } = await visit("/", { width, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator(BUTTON).click();
    expect(await isOpen(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  });

  test("the button opens the panel with Enter and with Space, and toggles it", async () => {
    const { page } = await visit("/", { reducedMotion: "reduce" });
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
    const { page } = await visit("/", { reducedMotion: "reduce" });
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
    const { page } = await visit("/", { reducedMotion: "reduce" });
    await page.locator(BUTTON).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(await focused(page)).not.toBe("Switch deck");
    await page.keyboard.press("Escape");
    expect(await isOpen(page)).toBe(false);
    expect(await focused(page)).toBe("Switch deck");
  });

  test("a click on the shade closes the panel and does not reach the page under it", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    const browse = await box(page, 'main a[href="#decks"]');
    await page.locator(BUTTON).click();
    expect((await box(page, SHEET)).y + (await box(page, SHEET)).height).toBeLessThan(browse.y);
    await page.mouse.click(browse.x + browse.width / 2, browse.y + browse.height / 2);
    expect(await isOpen(page)).toBe(false);
    expect(new URL(page.url()).hash).toBe("");
  });

  test("a click on the bar closes the panel, and the bar's links still work", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    await page.locator('header nav a[href="#playdeck"]').click();
    expect(await isOpen(page)).toBe(false);
    expect(new URL(page.url()).hash).toBe("#playdeck");
  });

  test("a click on a deck link follows it", async () => {
    const { page, offOrigin } = await visit("/", { reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const link = page.locator(`${PANEL} a`).nth(1);
    const href = await link.getAttribute("href");
    if (href === null) throw new Error("the deck link has no href");
    await link.click();
    await expect.poll(() => offOrigin).toContain(new URL(href).href);
  });

  test("the sheet sits under the bar, on the 980px measure", async () => {
    const { page } = await visit("/", { width: 1280, reducedMotion: "reduce" });
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
    const { page } = await visit("/", { width, reducedMotion: "reduce" });
    await page.locator(BUTTON).click();
    const lefts = await page
      .locator(`${SHEET} li`)
      .evaluateAll((items) => new Set(items.map((item) => item.getBoundingClientRect().x)).size);
    expect(lefts).toBe(columns);
  });

  test("with motion allowed, each deck's icon is there as its tile appears", async () => {
    const { page } = await visit("/", { reducedMotion: "no-preference" });
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
    const { page } = await visit("/", { reducedMotion: "no-preference" });
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
    const { page } = await visit("/", { reducedMotion: "reduce" });
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

  // Closing is the opening played backwards: the sheet and the shade keep their
  // open boxes on every frame until the panel is hidden (#35).
  test.each([
    [1280, "Escape"],
    [390, "Escape"],
    [1280, "a click on the shade"],
    [390, "a click on the shade"],
  ])("at %ipx, the sheet keeps its place under the bar while it closes on %s", async (width, how) => {
    const { page } = await visit("/", { width, reducedMotion: "no-preference" });
    await page.locator(BUTTON).click();
    await settled(page);
    const bar = await box(page, "header");
    const sheet = await box(page, SHEET);
    const shade = await box(page, ".family-bar__shade");
    expect(sheet).toMatchObject({ x: 0, y: bar.y + bar.height, width });

    await recordClose(page);
    if (how === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(width / 2, shade.y + shade.height / 2);
    const frames = await page.evaluate(() => window.closeFrames ?? Promise.reject(new Error("not recording")));

    // The exit runs for .45s. A loaded runner renders fewer frames, so count
    // time, not frames: the frames seen must span most of the exit, 300ms,
    // which leaves 150ms for a late first frame and an early last one.
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect((frames.at(-1)?.at ?? 0) - (frames[0]?.at ?? 0)).toBeGreaterThanOrEqual(300);
    for (const frame of frames) {
      expect(frame.sheet).toEqual({ top: sheet.y, left: sheet.x, width: sheet.width, height: sheet.height });
      expect(frame.shade).toEqual({ top: shade.y, left: shade.x, width: shade.width, height: shade.height });
    }
  });
});

const LINKS = ".family-bar__links";

/**
 * How far in from each edge the links' mask fades, in px: 0 where that edge
 * does not fade, and null when the links carry no mask at all.
 */
const fades = (page: Page) =>
  page.locator(LINKS).evaluate((links) => {
    const { maskImage, maskPosition } = getComputedStyle(links);
    if (maskImage === "none") return null;
    // Only the right edge fades, by the gradient's width.
    if (maskImage.split("linear-gradient").length === 2) {
      const width = /rgb\(0, 0, 0\) ([\d.]+)px/.exec(maskImage);
      if (width === null) throw new Error(`unexpected mask: ${maskImage}`);
      return { start: 0, end: Number(width[1]) };
    }
    // A fade per edge, each in a layer 24px wider than the links, moved by up
    // to 24px to bring its fade into view.
    const [start = NaN, end = NaN] = maskPosition.split(", ").map((position) => parseFloat(position));
    return { start: 24 + start, end: 0 - end };
  });
const overflows = (page: Page) => page.locator(LINKS).evaluate((links) => links.scrollWidth > links.clientWidth);
const toEnd = (page: Page) => page.locator(LINKS).evaluate((links) => links.scrollTo({ left: links.scrollWidth }));
/** Whether the link's focus ring, 4px around it, lies inside the links' box and clear of either fade. */
const clearOfFades = async (page: Page, link: string) => {
  const { start, end } = (await fades(page)) ?? { start: 0, end: 0 };
  const box = await page.locator(LINKS).evaluate((links) => links.getBoundingClientRect().toJSON() as DOMRect);
  const ring = await page.locator(link).evaluate((a) => a.getBoundingClientRect().toJSON() as DOMRect);
  return ring.left - 4 >= box.left + start && ring.right + 4 <= box.right - end;
};

/**
 * Whether the focused link's whole focus ring, its outline and the offset
 * inside it, lies inside the box the links scroll in.
 */
const ringShows = (page: Page) =>
  page.locator(LINKS).evaluate((links) => {
    const a = document.activeElement;
    if (a === null || !links.contains(a)) throw new Error("no link has focus");
    const { outlineWidth, outlineOffset } = getComputedStyle(a);
    const ring = parseFloat(outlineWidth) + parseFloat(outlineOffset);
    const link = a.getBoundingClientRect();
    const left = links.getBoundingClientRect().left + links.clientLeft;
    const right = left + links.clientWidth;
    return ring > 0 && link.left - ring >= left && link.right + ring <= right;
  });

// On a phone the links scroll sideways. The edge they scroll toward fades out,
// so a link cut off at the edge reads as more to scroll, not as a layout bug
// (#55). With motion allowed the fades follow the scroll; under reduced
// motion only the right edge fades, and the last link scrolls clear of it.
describe("the Family bar's links", () => {
  const motions = ["no-preference", "reduce"] as const;

  test.each(motions)("on a phone at 390px, with %s motion, they overflow and the right edge fades", async (motion) => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: motion });
    expect(await overflows(page)).toBe(true);
    // A scroll-driven fade can take a frame after load to apply its mask.
    await expect.poll(() => fades(page)).toEqual({ start: 0, end: 24 });
  });

  test.each(motions)("at 1280px, with %s motion, they fit and carry no mask", async (motion) => {
    const { page } = await visit("/", { width: 1280, reducedMotion: motion });
    expect(await overflows(page)).toBe(false);
    expect(await fades(page)).toBeNull();
  });

  test("on a phone with motion allowed, scrolled to the end, the end fade is gone and the start fades", async ({ skip }) => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: "no-preference" });
    if (!(await page.evaluate(() => CSS.supports("animation-timeline", "scroll()")))) {
      skip("this browser has no scroll-driven animations");
    }
    await toEnd(page);
    await expect.poll(() => fades(page)).toEqual({ start: 24, end: 0 });
  });

  test.each(motions)("on a phone with %s motion, scrolled to the end, the last link is clear of the fade", async (motion) => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: motion });
    await toEnd(page);
    await expect.poll(() => clearOfFades(page, `${LINKS} li:last-child a`)).toBe(true);
  });

  // Chromium does not scroll a focused link that is mostly in view, so the
  // fade gives way to the ring instead.
  test.each(motions)("on a phone with %s motion, a link focused from the keyboard drops the fade", async (motion) => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: motion });
    const links = page.locator(`${LINKS} a`);
    await links.first().focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await fades(page)).toBeNull();
    for (let n = 1; n < (await links.count()); n++) await page.keyboard.press("Tab");
    expect(await links.last().evaluate((a) => a.matches(":focus-visible"))).toBe(true);
    expect(await fades(page)).toBeNull();
    await page.keyboard.press("Tab");
    await expect.poll(() => fades(page)).not.toBeNull();
  });

  // Chromium does not scroll a focused link that is partly in view, so the
  // last link, cut off at the right edge before any scroll, would keep its
  // ring cut off too.
  test.each(motions)("on a phone with %s motion, each link Tab reaches shows its whole focus ring", async (motion) => {
    const { page } = await visit("/", { width: 390, isMobile: true, reducedMotion: motion });
    const links = page.locator(`${LINKS} a`);
    await page.locator(".family-bar__name").focus();
    for (let n = 0; n < (await links.count()); n++) {
      await page.keyboard.press("Tab");
      expect(await links.nth(n).evaluate((a) => a === document.activeElement)).toBe(true);
      await expect.poll(() => ringShows(page)).toBe(true);
    }
  });
});
