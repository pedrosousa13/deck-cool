import { chromium, type Browser, type Page, type Response } from "playwright";
import { afterAll, beforeAll } from "vitest";
import { serveSite, type ServedSite } from "./serve-site.ts";

declare global {
  interface Window {
    /** CSP violations the page reported, set by the init script in visit(). */
    cspViolations?: string[];
  }
}

export interface VisitOptions {
  /** The viewport's width, 1280 unless given. Its height is 900. */
  width?: number;
  /** "reduce" unless given. */
  reducedMotion?: "reduce" | "no-preference";
  /** Lay the page out as a phone does, honouring the viewport meta tag. */
  isMobile?: boolean;
  /** Let the page read and write the clipboard. */
  clipboard?: boolean;
  /** When the visit counts as arrived: "load" unless given. */
  waitUntil?: "load" | "networkidle";
}

export interface Visit {
  page: Page;
  response: Response | null;
  /** Requests the page made to another origin, such as a deck's site. Each was aborted. */
  offOrigin: string[];
  /** Every script the page fetched from the site, by path. */
  scripts: string[];
  /** CSP violations, from the event and from the console. */
  violations: () => Promise<string[]>;
  /** Console messages about the Permissions-Policy header. */
  permissionsPolicy: string[];
  /** Uncaught errors, such as an island that failed to hydrate. */
  errors: string[];
}

export interface BrowserHarness {
  /** The served site's origin, once the file's tests have started. */
  readonly origin: string;
  /** Opens `path` in a new browser context, recording what the page does. */
  visit(path: string, options?: VisitOptions): Promise<Visit>;
}

/**
 * Serves the site the build wrote under `site`, its directory, with the
 * headers in its _headers file, and launches Chromium, for the test file that
 * calls it. Both close after the file's tests. Needs Playwright's Chromium:
 * `pnpm exec playwright install chromium`.
 */
export function browserHarness(site: string): BrowserHarness {
  let served: ServedSite | undefined;
  let browser: Browser | undefined;

  beforeAll(async () => {
    served = await serveSite(site);
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await served?.close();
  });

  const started = () => {
    if (served === undefined || browser === undefined) throw new Error("the browser harness runs only inside a test");
    return { origin: served.origin, browser };
  };

  return {
    get origin() {
      return started().origin;
    },
    async visit(path, options = {}) {
      const { origin, browser } = started();
      const context = await browser.newContext({
        viewport: { width: options.width ?? 1280, height: 900 },
        reducedMotion: options.reducedMotion ?? "reduce",
        isMobile: options.isMobile ?? false,
        ...(options.clipboard === true ? { permissions: ["clipboard-read", "clipboard-write"] } : {}),
      });
      const offOrigin: string[] = [];
      await context.route(
        (url) => url.origin !== origin,
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
      const scripts: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === origin && url.pathname.endsWith(".js")) scripts.push(url.pathname);
      });
      const logged: string[] = [];
      const permissionsPolicy: string[] = [];
      const errors: string[] = [];
      page.on("console", (message) => {
        if (/Content.Security.Policy/i.test(message.text())) logged.push(message.text());
        if (/Permissions.Policy/i.test(message.text())) permissionsPolicy.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${origin}${path}`, { waitUntil: options.waitUntil ?? "load" });
      return {
        page,
        response,
        offOrigin,
        scripts,
        permissionsPolicy,
        errors,
        violations: async () => [
          ...logged,
          ...(await page.evaluate(() => window.cspViolations ?? ["the CSP listener never ran"])),
        ],
      };
    },
  };
}
