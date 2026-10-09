import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type Page, type Response } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { serveSite, type ServedSite } from "./serve-site.ts";

// Drives the built home page (build.global-setup.ts) in Chromium, served with
// the headers in the build's _headers file, so the page runs under its CSP.

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
  /** CSP violations, from the event and from the console. */
  violations: () => Promise<string[]>;
}

async function visit(options: { width: number; reducedMotion: "reduce" | "no-preference" }): Promise<Visit> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: 900 },
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
  const logged: string[] = [];
  page.on("console", (message) => {
    if (/Content.Security.Policy/i.test(message.text())) logged.push(message.text());
  });
  const response = await page.goto(`${site.origin}/`, { waitUntil: "load" });
  return {
    page,
    response,
    offOrigin,
    violations: async () => [
      ...logged,
      ...(await page.evaluate(() => window.cspViolations ?? ["the CSP listener never ran"])),
    ],
  };
}

describe("the umbrella site in a browser", () => {
  test("the home page is served with the CSP the build writes", async () => {
    const { response } = await visit({ width: 1280, reducedMotion: "reduce" });
    expect(await response?.headerValue(CONTENT_SECURITY_POLICY.name)).toBe(CONTENT_SECURITY_POLICY.value);
  });

  test("the harness sees a CSP violation when there is one", async () => {
    const { page, violations } = await visit({ width: 1280, reducedMotion: "reduce" });
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "body { color: red }";
      document.head.append(style);
    });
    await expect.poll(violations).not.toEqual([]);
  });

  test.each([390, 1280])("at %ipx, axe finds no violations, nothing leaves the origin and the CSP holds", async (width) => {
    const { page, offOrigin, violations } = await visit({ width, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(offOrigin).toEqual([]);
    expect(await violations()).toEqual([]);
  });

  test.each([390, 1280])("at %ipx, the page does not scroll sideways", async (width) => {
    const { page } = await visit({ width, reducedMotion: "reduce" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test("with prefers-reduced-motion: reduce, nothing on the page moves, hovered or not", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "reduce" });
    const card = page.locator("main article").first();
    await card.hover();
    expect(await page.evaluate(() => document.getAnimations())).toEqual([]);
    expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  });

  test("with the system set to reduce motion, the icons hold still", async () => {
    // Each icon animates inside its own SVG document, which Playwright's
    // emulated media does not reach, so this browser has the setting itself.
    // getAnimations() cannot see in either, so compare pictures over time.
    const still = await chromium.launch({ args: ["--force-prefers-reduced-motion"] });
    try {
      const page = await still.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${site.origin}/`, { waitUntil: "load" });
      const icons = await page.locator("main img").all();
      expect(icons).toHaveLength(4);
      const pictures = async () => {
        const shots: string[] = [];
        for (const icon of icons) shots.push((await icon.screenshot()).toString("base64"));
        return shots;
      };
      const first = await pictures();
      await page.waitForTimeout(700);
      expect(await pictures()).toEqual(first);
    } finally {
      await still.close();
    }
  });

  test("with motion allowed, the icons animate", async () => {
    const { page } = await visit({ width: 1280, reducedMotion: "no-preference" });
    // playdeck's bars never hold still, so two pictures apart differ.
    const playdeck = page.locator("#playdeck img");
    const first = (await playdeck.screenshot()).toString("base64");
    await page.waitForTimeout(300);
    expect((await playdeck.screenshot()).toString("base64")).not.toBe(first);
  });
});
