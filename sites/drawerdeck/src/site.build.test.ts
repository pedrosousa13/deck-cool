import { Window, type Document, type Element } from "happy-dom";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildOutput } from "@deck-cool/site-kit/build";
import { everyResponse, pagesWithEmDashes, present, readManifest, text } from "@deck-cool/site-kit/build-test";
import { headersFor, parseHeaders } from "@deck-cool/site-kit/serve-site";
import { umbrella } from "@deck-cool/brand/decks";
import { REPOSITORY } from "../components/links.ts";
import { drawerdeck } from "../components/drawerdeck.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { DEMOS } from "./demos.ts";
import { DOCS_NAV } from "./docs-pages.ts";
import { SITE_ORIGIN } from "./seo.ts";

// Reads the build build.global-setup.ts makes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${SITE}site`;
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));

/** The site's own pages, by path and file. */
const OWN_PAGES = [["/", "index.html"]] as const;

/** Two docs pages, one with a demo and one without, which the tests of every page cover too. */
const DOCS_PAGES = [
  ["/docs/quickstart/", "docs/quickstart/index.html"],
  ["/docs/install/", "docs/install/index.html"],
] as const;

const PAGES = [...OWN_PAGES, ...DOCS_PAGES] as const;

/** Every page the site builds, by path: its own, then every docs page in nav.json's order. */
const ALL_PATHS = [...OWN_PAGES.map(([path]) => path), ...DOCS_NAV.map(({ href }) => href)];

const window = new Window();

function parse(file: string): Document {
  return new window.DOMParser().parseFromString(readFileSync(`${OUT}/${file}`, "utf8"), "text/html");
}

const home = () => parse("index.html");

function links(scope: Element | Document): [string | undefined, string | null][] {
  return [...scope.querySelectorAll("a")].map((a) => [text(a), a.getAttribute("href")]);
}

const manifest = readManifest(SITE);

describe.each(PAGES)("%s's <head>", (path, file) => {
  const doc = () => parse(file);

  test("links the drawerdeck icons and one hashed stylesheet, and sets the viewport", () => {
    const head = [...doc().head.querySelectorAll("link")].map((link) => [link.getAttribute("rel"), link.getAttribute("href")]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", drawerdeck.icons.still],
        ["apple-touch-icon", drawerdeck.icons.appleTouch],
        ["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)],
      ]),
    );
    expect(head.filter(([rel]) => rel === "stylesheet")).toHaveLength(1);
    expect(doc().head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=device-width, initial-scale=1",
    );
  });

  test("names its og:url on its origin, and describes the page", () => {
    const head = doc().head;
    expect(head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(`${SITE_ORIGIN}${path}`);
    expect(head.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("drawerdeck");
    const description = head.querySelector('meta[name="description"]')?.getAttribute("content");
    expect(description).toMatch(/^.{40,}$/);
    expect(head.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(description);
  });

  test("opens with the Family bar, drawerdeck's", () => {
    const html = readFileSync(`${OUT}/${file}`, "utf8");
    const at = (needle: string) => {
      const index = html.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    // Outside <main>, so the header is the page's banner landmark.
    expect(at('<header class="family-bar" data-deck="drawerdeck"')).toBeLessThan(at("<main>"));
    const bar = present(doc().querySelector("header.family-bar nav"), "the bar's row");
    expect(links(present(bar.querySelector(".family-bar__links"), "the bar's links"))).toEqual([
      ["Docs", "/docs/"],
      ["GitHub", REPOSITORY],
    ]);
    expect(links(bar).filter(([label]) => label === "Install")).toEqual([["Install", "/docs/install/"]]);
  });

  test("carries no inline script or handler", () => {
    const page = doc();
    for (const element of page.querySelectorAll("*")) {
      for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
    }
    // script-src 'self': every script that runs is a file.
    for (const script of page.querySelectorAll("script")) {
      expect(script.getAttribute("src"), script.outerHTML).toMatch(/^\/[^/]/);
    }
  });

  test("the footer follows <main>", () => {
    const footer = present(doc().querySelector("main + footer"), "the footer");
    expect([...footer.querySelectorAll("span")].map(text)).toEqual([
      "MIT licensed.",
      "Built with pagedeck. Served by Cloudflare.",
    ]);
  });
});

/** The text of the one stylesheet the home page links. */
function stylesheet(): string {
  const href = present(home().head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link");
  return readFileSync(`${OUT}${href}`, "utf8");
}

test("the stylesheet holds brand.css, then family-bar.css, then drawerdeck.css", () => {
  const css = stylesheet();
  const brand = css.indexOf("--ground-page");
  const bar = css.indexOf("@keyframes family-bar-roll");
  const own = css.indexOf("--font-mono");
  expect(brand).toBeGreaterThanOrEqual(0);
  expect(brand).toBeLessThan(bar);
  expect(bar).toBeLessThan(own);
});

test("the site serves no stylesheet but the hashed one", () => {
  const sheets = manifest.files.filter((path) => path.endsWith(".css"));
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toMatch(/^\/assets\//);
});

test("the icons are the brand's, byte for byte", () => {
  for (const path of [drawerdeck.icons.still, drawerdeck.icons.appleTouch]) {
    expect(readFileSync(`${OUT}${path}`).equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
  }
});

describe("the home page", () => {
  const main = () => present(home().querySelector("main"), "<main>");
  const sections = () => [...main().querySelectorAll(":scope > section")];

  test("is titled with the claim", () => {
    expect(home().title).toBe("drawerdeck: a drawer that lets the browser do the dragging");
    expect(home().head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "drawerdeck is an unstyled React bottom sheet on native scrolling: the browser drags, flings and settles it, and you style every part with plain CSS.",
    );
  });

  test("runs the hero, the demo, why native scrolling, then the line back to deck.cool", () => {
    expect(sections().map((section) => section.className)).toEqual(["home-intro", "home-band", "home-band", "home-family"]);
  });

  test("the hero: the claim, one sentence, the install command and one call to action", () => {
    const hero = sections()[0];
    expect(hero?.querySelector("img")?.getAttribute("src")).toBe(drawerdeck.icons.animated);
    expect(hero?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(text(hero?.querySelector(".home-install code"))).toBe("pnpm add @drawerdeck/react");
    expect(drawerdeck.install).toBe("pnpm add @drawerdeck/react");
    expect(links(hero)).toEqual([["Read the docs", "/docs/"]]);
  });

  test("the demo: a static mock, marked as a TODO for #240, not a performance or completeness claim", () => {
    const section = sections()[1];
    expect(text(section?.querySelector("h2"))).toBe("See the shape of it");
    expect(section?.textContent).toMatch(/placeholder/i);
    expect(section?.querySelector(".drawer-mock")).not.toBeNull();
  });

  test("why native scrolling: links the guide, and claims nothing about performance", () => {
    const section = sections()[2];
    expect(text(section?.querySelector("h2"))).toBe("Why native scrolling");
    expect(links(section)).toEqual([["Read why ›", "/docs/guides/why-native-scrolling/"]]);
    expect(section?.textContent).not.toMatch(/faster|smoother|lighter|benchmark/i);
  });

  test("closes with one line back to deck.cool", () => {
    const family = sections()[3];
    expect(text(family?.querySelector("p"))).toBe(
      "drawerdeck is part of deck.cool, a family of unstyled React packages that look like you and work like the browser. Meet the family ›",
    );
    expect(links(present(family, "the line"))).toEqual([["Meet the family ›", umbrella.url]]);
  });
});

test("no page uses an em dash", () => {
  expect(pagesWithEmDashes(SITE)).toEqual([]);
});

describe("every page", () => {
  test.each(PAGES)("%s shows only images the site serves", (_path, file) => {
    for (const img of parse(file).querySelectorAll("img")) {
      const src = present(img.getAttribute("src"), "an image's src");
      expect(existsSync(`${OUT}${src}`), src).toBe(true);
    }
  });

  test("the build warns of no link that names nothing", () => {
    expect(readFileSync(buildOutput(SITE), "utf8")).not.toContain("references name nothing this build emitted");
  });

  test.each(PAGES)("%s links only pages the site builds", (_path, file) => {
    for (const [, href] of links(parse(file))) {
      if (href === null || !href.startsWith("/")) continue;
      const path = href.split("#")[0] ?? "";
      expect(existsSync(`${OUT}${path.endsWith("/") ? `${path}index.html` : path}`), href).toBe(true);
    }
  });

  // GLOSSARY.md: each package site links its own deck's repo, never the maintainer's profile.
  test.each(readdirSync(OUT, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".html")))(
    "%s links nothing on github.com but drawerdeck's repo",
    (file) => {
      const html = readFileSync(`${OUT}/${file}`, "utf8");
      for (const [, href] of html.matchAll(/href="(https?:\/\/(?:[^/"]+\.)?github\.com[^"]*)"/gi)) {
        expect(href).toBe(REPOSITORY);
      }
    },
  );
});

test("the sitemap and robots.txt name its origin", () => {
  const sitemap = readFileSync(`${OUT}/sitemap-en.xml`, "utf8");
  expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc).sort()).toEqual(
    ALL_PATHS.map((path) => `${SITE_ORIGIN}${path}`).sort(),
  );
  expect(readFileSync(`${OUT}/robots.txt`, "utf8")).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
});

const rules = parseHeaders(readFileSync(`${OUT}/_headers`, "utf8"));
/** Every path the host serves: each page, and each file but the ones wrangler reads as configuration. */
const served = [...PAGES.map(([path]) => path), ...manifest.files.filter((path) => !/^\/_(headers|redirects)$/.test(path))];

const EVERY_RESPONSE = everyResponse(CONTENT_SECURITY_POLICY);

describe("the served headers", () => {
  test("_headers sends the CSP, the security headers and HSTS on every page and file", () => {
    for (const path of served) {
      expect(Object.fromEntries(headersFor(rules, path)), path).toMatchObject(EVERY_RESPONSE);
    }
  });

  test("_headers sends a Permissions-Policy that turns off every powerful feature", () => {
    for (const path of served) {
      const features = headersFor(rules, path).get("Permissions-Policy")?.split(", ") ?? [];
      for (const feature of features) expect(feature, path).toMatch(/^[a-z-]+=\(\)$/);
      expect(features, path).toEqual(expect.arrayContaining(["camera=()", "microphone=()", "geolocation=()", "payment=()"]));
    }
  });

  test("_headers caches /assets/, which holds only hashed names, as immutable, and nothing else", () => {
    const assets = served.filter((path) => path.startsWith("/assets/"));
    expect(assets.filter((path) => path.endsWith(".js"))).not.toHaveLength(0);
    const hashed = /[.-][A-Za-z0-9_-]{8}\.(css|js)$/;
    for (const path of served) {
      if (hashed.test(path)) expect(path.startsWith("/assets/"), path).toBe(true);
    }
    for (const path of served) {
      expect(headersFor(rules, path).get("Cache-Control"), path).toBe(
        path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : undefined,
      );
    }
  });

  test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
    const ignored = readFileSync(`${OUT}/.assetsignore`, "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
    expect(manifest.notFound.map((page) => page ?? undefined)).toEqual([undefined]);
    const redirects = readFileSync(`${OUT}/_redirects`, "utf8");
    expect(redirects).toContain("/manifest.json /404.html 200\n");
    expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
  });
});

describe("the docs, from @drawerdeck/docs", () => {
  /** The demos a built page renders, by name, in order. */
  const demosOn = (doc: Document) =>
    [...doc.querySelectorAll("article fw-island")].map((island) => island.getAttribute("data-fw-component")?.replace(/^docsDemo:/, ""));

  test("serves /docs/, the docs' first page", () => {
    expect(DOCS_NAV[0]?.href).toBe("/docs/");
    expect(existsSync(`${OUT}/docs/index.html`)).toBe(true);
  });

  test.each(DOCS_NAV)("$href renders with each demo it marks, in order, rendered on the server", ({ href, demos }) => {
    const doc = parse(`${href.slice(1)}index.html`);
    expect(demosOn(doc)).toEqual(demos);
    for (const island of doc.querySelectorAll("article fw-island")) {
      expect(island.querySelector(".drawer-mock"), island.outerHTML.slice(0, 120)).not.toBeNull();
    }
  });

  // The layout and the demos are the site's own words, unlike the prose they frame.
  test.each(["components/docs-page.tsx", ...readdirSync(`${SITE}components/demos`).map((file) => `components/demos/${file}`)])(
    "%s uses no em dash",
    (file) => {
      expect(readFileSync(`${SITE}${file}`, "utf8")).not.toMatch(/—|&mdash;/);
    },
  );

  test("marks each demo the site registers once, and no other", () => {
    expect(DOCS_NAV.flatMap((page) => page.demos).sort()).toEqual(Object.keys(DEMOS).sort());
  });

  test("the sidebar lists every page in nav.json's order, each by its label or else its title", () => {
    const sidebar = present(parse("docs/install/index.html").querySelector('nav[aria-label="Documentation"]'), "the sidebar");
    expect([...sidebar.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(DOCS_NAV.map(({ href }) => href));
    expect(text(sidebar.querySelector('a[href="/docs/"]'))).toBe("Introduction");
    expect(text(sidebar.querySelector('a[href="/docs/install/"]'))).toBe("Install");
  });

  test("titles each page for the tab, once", () => {
    const doc = parse("docs/install/index.html");
    expect(doc.querySelectorAll("title")).toHaveLength(1);
    expect(doc.title).toBe("Install · drawerdeck docs");
    expect(text(doc.querySelector("article h1"))).toBe("Install");
  });

  test("a page with no demo ships no island at all", () => {
    const plain = DOCS_NAV.filter(({ demos }) => demos.length === 0);
    expect(plain.length).toBeGreaterThan(0);
    for (const { href } of plain) {
      expect([...parse(`${href.slice(1)}index.html`).querySelectorAll("fw-island")]).toHaveLength(0);
    }
  });
});
