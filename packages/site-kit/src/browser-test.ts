import { chromium, type Browser, type Page, type Response } from "playwright";
import { afterAll, beforeAll, vi } from "vitest";
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

/** The part of React's root fiber that islandsHydrated reads. */
interface ReactRootFiber {
  stateNode: { current: { memoizedState: { isDehydrated: boolean } } };
}

/**
 * The test timeout in a file that calls browserHarness. Under load a browser
 * test can take longer than vitest's default of 5 s.
 */
const BROWSER_TEST_TIMEOUT_MS = 15_000;

/**
 * How long islandsHydrated waits before it names the islands still
 * dehydrated: under BROWSER_TEST_TIMEOUT_MS, so it fails first.
 */
const HYDRATION_DEADLINE_MS = 8_000;

/**
 * Brings each island into view in turn, so one that hydrates when visible
 * does, and waits until every island on the page has hydrated, then scrolls
 * back to the top. The island runtime hydrates each <fw-island> with React's
 * hydrateRoot, which keeps its root on the element under a __reactContainer$
 * key; the root stops being dehydrated once React commits the hydration, the
 * same check React makes before it dispatches an event. The build's HTML
 * carries neither. A wait for network idle is no such signal: once the page
 * has gone idle, it returns at once, before a late island's script arrives.
 *
 * It reads react-dom 19's private root state, the __reactContainer$ expando
 * and isDehydrated, because @pagedeck/islands' runtime sets no hydration
 * marker of its own. A React upgrade that renames them makes it throw at the
 * deadline, naming every island, rather than pass.
 */
export async function islandsHydrated(page: Page): Promise<void> {
  await page.evaluate(async (deadline) => {
    const hydrated = (island: Element) => {
      const key = Object.keys(island).find((name) => name.startsWith("__reactContainer$"));
      const root = key === undefined ? undefined : (island as unknown as Record<string, ReactRootFiber>)[key];
      return root?.stateNode.current.memoizedState.isDehydrated === false;
    };
    // To its first child with a box: the marker has none, nor has a <style> in it.
    const show = (island: Element) =>
      [...island.children].find((child) => child.getClientRects().length > 0)?.scrollIntoView({ block: "center" });
    const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const waiting = () => [...document.querySelectorAll("fw-island")].filter((island) => !hydrated(island));
    const until = performance.now() + deadline;
    // Two frames in view each, so their scripts load side by side; then each
    // one still waiting, until none is or the deadline passes.
    for (const island of document.querySelectorAll("fw-island")) {
      show(island);
      await frames();
    }
    for (let left = waiting(); left.length > 0; left = waiting()) {
      if (performance.now() > until) {
        const names = left.map((island) => island.getAttribute("data-fw-component") ?? "an unnamed island");
        throw new Error(`${String(left.length)} island(s) did not hydrate within ${String(deadline)} ms: ${names.join(", ")}`);
      }
      show(left[0] as Element);
      await frames();
    }
    window.scrollTo(0, 0);
  }, HYDRATION_DEADLINE_MS);
}

/**
 * Serves the site the build wrote under `site`, its directory, with the
 * headers in its _headers file, and launches Chromium, for the test file that
 * calls it. Both close after the file's tests. Sets that file's test timeout
 * to BROWSER_TEST_TIMEOUT_MS; vitest resets it after the file. Needs
 * Playwright's Chromium: `pnpm exec playwright install chromium`.
 */
export function browserHarness(site: string): BrowserHarness {
  vi.setConfig({ testTimeout: BROWSER_TEST_TIMEOUT_MS });
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
