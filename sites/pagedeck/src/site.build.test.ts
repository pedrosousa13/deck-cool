import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { pagedeck, umbrella } from "@deck-cool/brand/decks";
import { demoComponent } from "@deck-cool/docs";
import { everyResponse, isRecord, pagesWithEmDashes, present, readManifest, text } from "@deck-cool/site-kit/build-test";
import { headersFor, parseHeaders } from "@deck-cool/site-kit/serve-site";
import { DOCS, PATHS, REPO } from "../components/links.ts";
import { formatBytes, utf8Bytes } from "./bytes.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { DEMOS } from "./demos.ts";
import { DOCS_NAV } from "./docs-pages.ts";
import { DOCS_WITH_TABLES } from "./live-check.ts";
import { PICKER, PRODUCT } from "./product.ts";
import { SKINS } from "./skins.ts";

// Reads the build that build.global-setup.ts writes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));

interface BudgetRow {
  path: string;
  limitText?: string;
  actual: number;
}

function readBudget(): BudgetRow[] {
  const value: unknown = JSON.parse(readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8"));
  if (!isRecord(value) || !Array.isArray(value.pages)) throw new Error("the budget report has no pages");
  return value.pages.map((row: unknown) => {
    if (!isRecord(row) || typeof row.path !== "string" || typeof row.actual !== "number") {
      throw new Error("a budget row has no path or actual");
    }
    return { path: row.path, actual: row.actual, ...(typeof row.limitText === "string" ? { limitText: row.limitText } : {}) };
  });
}

const manifest = readManifest(SITE);
const budget = readBudget();
const window = new Window();

function html(path: string): string {
  const page = present(
    manifest.pages.find((row) => row.path === path),
    `the page ${path}`,
  );
  return readFileSync(`${SITE}site${page.output}index.html`, "utf8");
}

function parse(path: string): Document {
  return new window.DOMParser().parseFromString(html(path), "text/html");
}

function hrefs(scope: Element | Document): (string | null)[] {
  return [...scope.querySelectorAll("a")].map((a) => a.getAttribute("href"));
}

/** The site's own pages. */
const OWN_PAGES = [PATHS.home, PATHS.search, PATHS.features, PATHS.interactive, PATHS.cmsDemo];

/**
 * Two docs pages, the first and one with tables, which the tests of every page
 * cover too. @pagedeck/docs 0.2.3 marks no demo, so neither has one.
 */
const DOCS_PAGES = [DOCS.start, DOCS_WITH_TABLES];

const PAGES = [...OWN_PAGES, ...DOCS_PAGES];

test("the site is the landing's four pages, the docs' search page and every page in the docs' nav.json", () => {
  expect(manifest.pages.map((page) => page.path).sort()).toEqual([...OWN_PAGES, ...DOCS_NAV.map(({ path }) => path)].sort());
});

test("no page uses an em dash", () => {
  // Docs-package pages: their em dashes are upstream's (pedrosousa13/pagedeck#140).
  expect(pagesWithEmDashes(SITE, DOCS_NAV.map(({ path }) => path))).toEqual([]);
});

describe("budgets, measured and pinned", () => {
  // Spelled again rather than imported, so a limit raised in the config fails here.
  // Each is the page's measured size rounded up to a whole kilobyte, and none is
  // above the landing's own (pagedeck's packages/landing): 60kb, 62kb and 60kb.
  const PINNED: Record<string, string> = {
    [PATHS.home]: "0b",
    [PATHS.interactive]: "60kb",
    [PATHS.features]: "60kb",
    [PATHS.cmsDemo]: "59kb",
    [PATHS.search]: "59kb",
    [DOCS.start]: "0b",
    [DOCS_WITH_TABLES]: "0b",
  };

  test("every page has its pinned limit, and stays within it", () => {
    for (const path of PAGES) {
      const row = present(
        budget.find((each) => each.path === path),
        `the budget row for ${path}`,
      );
      expect(row.limitText, path).toBe(PINNED[path]);
      const limit = Number.parseInt(row.limitText ?? "", 10) * (row.limitText?.endsWith("kb") ? 1024 : 1);
      expect(row.actual, path).toBeLessThanOrEqual(limit);
      // Tight: within two kilobytes of what the page ships. Not one: a chunk's
      // name is a hash, so any change to the site moves a page by some bytes.
      if (limit > 0) expect(limit - row.actual, path).toBeLessThan(2048);
    }
  });

  test("the home page ships 0 B of JavaScript, and no script at all", () => {
    expect(budget.find((row) => row.path === PATHS.home)?.actual).toBe(0);
    expect(parse(PATHS.home).querySelectorAll("script, link[rel=modulepreload]")).toHaveLength(0);
  });

  // The layout has no search island: search is a page of its own.
  test("every docs page with no demo ships 0 B of JavaScript, and no script at all", () => {
    const plain = DOCS_NAV.filter(({ demos }) => demos.length === 0);
    expect(plain.map(({ path }) => path)).toEqual(expect.arrayContaining(DOCS_PAGES));
    for (const { path } of plain) {
      expect(budget.find((row) => row.path === path)?.actual, path).toBe(0);
      expect(parse(path).querySelectorAll("script, link[rel=modulepreload]"), path).toHaveLength(0);
    }
  });

  test("each page with islands carries only its own", () => {
    const islands = Object.fromEntries(manifest.pages.map((page) => [page.path, [...page.components].sort()]));
    expect(islands).toEqual({
      [PATHS.home]: [],
      [PATHS.interactive]: ["counter"],
      [PATHS.features]: ["consent_banner", "island_idle", "island_load", "island_visible", "search"],
      [PATHS.cmsDemo]: ["variant_picker"],
      [PATHS.search]: ["search"],
      ...Object.fromEntries(DOCS_NAV.map(({ path, demos }) => [path, demos.map(demoComponent).sort()])),
    });
  });
});

describe("every page", () => {
  test.each(PAGES)("%s links the pagedeck icons and one hashed stylesheet from <head>, and declares a viewport", (path) => {
    const doc = parse(path);
    const head = [...doc.head.querySelectorAll("link:not([rel=modulepreload])")].map((link) => [
      link.getAttribute("rel"),
      link.getAttribute("href"),
    ]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", pagedeck.icons.still],
        ["apple-touch-icon", pagedeck.icons.appleTouch],
      ]),
    );
    // Only the features page links the subset font's sheet too, for its specimen.
    const fonts = path === PATHS.features ? [["stylesheet", expect.stringMatching(/^\/fonts\/[^/]+\.css$/)]] : [];
    expect(head.filter(([rel]) => rel === "stylesheet")).toEqual([
      ...fonts,
      ["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)],
    ]);
    expect(doc.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(doc.head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")?.length).toBeGreaterThanOrEqual(50);
    expect(doc.documentElement.getAttribute("lang")).toBe("en");
  });

  test.each(PAGES)("%s opens with the Family bar, set to pagedeck, and closes with the footer", (path) => {
    const doc = parse(path);
    const bar = present(doc.querySelector("body header.family-bar"), "the Family bar");
    expect(bar.getAttribute("data-deck")).toBe("pagedeck");
    expect(doc.querySelector("header.family-bar ~ main")).not.toBeNull();
    expect(doc.querySelector("main + footer")).not.toBeNull();
    expect(text(bar.querySelector(".family-bar__name"))).toBe("pagedeck");
    expect(
      [...bar.querySelectorAll(".family-bar__links a")].map((a) => [text(a), a.getAttribute("href")]),
    ).toEqual([
      ["Docs", DOCS.start],
      ["Features", PATHS.features],
      ["Interactive demo", PATHS.interactive],
      ["Content demo", PATHS.cmsDemo],
      ["Search", PATHS.search],
      ["GitHub", REPO],
    ]);
  });

  // The docs are this site's own now, so nothing links pagedeck's old Workers.
  test.each(PAGES)("%s links the docs under /docs, at pages and anchors this build makes, and no workers.dev host", (path) => {
    const doc = parse(path);
    const built = new Set(manifest.pages.map((page) => page.path));
    expect(hrefs(present(doc.querySelector("footer"), "the footer"))).toContain(DOCS.start);
    for (const href of hrefs(doc)) {
      if (!href?.startsWith("/docs/")) continue;
      const [page = "", fragment] = href.split("#");
      expect(built.has(page), href).toBe(true);
      if (fragment !== undefined) expect(parse(page).getElementById(fragment), href).not.toBeNull();
    }
    expect(hrefs(doc).filter((href) => /workers\.dev/.test(href ?? ""))).toEqual([]);
  });

  // GLOSSARY.md: a package site links its own deck's repo, never the maintainer's profile.
  test.each(PAGES)("%s links github.com only at pagedeck's repo", (path) => {
    const github = hrefs(parse(path)).filter((href) => /^https?:\/\/([^/]+\.)?github\.com/i.test(href ?? ""));
    expect(github.length).toBeGreaterThan(0);
    for (const href of github) expect(href === REPO || href?.startsWith(`${REPO}/`), href ?? "").toBe(true);
  });

  // A placeholder host under RFC 2606's `.example` reads as a link and goes nowhere.
  test.each(PAGES)("%s links no .example host", (path) => {
    const hosts = [...html(path).matchAll(/\/\/([^/\s"'<>?#:]+)/g)].map((match) => match[1] ?? "");
    expect(hosts).not.toHaveLength(0);
    expect(hosts.filter((host) => /\.example\.?$/i.test(host))).toEqual([]);
  });

  test.each(PAGES)("%s carries no <style> and no inline handler, and a script only from the site", (path) => {
    const doc = parse(path);
    expect(doc.querySelectorAll("style")).toHaveLength(0);
    for (const element of doc.querySelectorAll("*")) {
      for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
    }
    for (const script of doc.querySelectorAll("script[src]")) expect(script.getAttribute("src")).toMatch(/^\//);
  });

  test("every inline script is one the CSP names by its hash", () => {
    const allowed = CONTENT_SECURITY_POLICY.value.match(/'sha256-[^']+'/g) ?? [];
    const inline = new Set<string>();
    for (const path of PAGES) {
      // Read from the file: happy-dom's parser keeps no script text.
      for (const [, attributes = "", body = ""] of html(path).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        if (!/\ssrc=/.test(attributes)) inline.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
      }
    }
    // Pinned both ways: a hash no page needs any more comes out of the CSP.
    expect([...inline].sort()).toEqual([...allowed].sort());
  });
});

describe("the stylesheet", () => {
  function stylesheet(): string {
    const href = present(parse(PATHS.home).head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link");
    return readFileSync(`${SITE}site${href}`, "utf8");
  }

  test("holds brand.css, then family-bar.css, then the site's own sheet", () => {
    const css = stylesheet();
    const brand = css.indexOf("--ground-page");
    const bar = css.indexOf(".family-bar");
    const site = css.indexOf(".fw-wrap");
    expect(brand).toBeGreaterThanOrEqual(0);
    expect(brand).toBeLessThan(bar);
    expect(css.lastIndexOf(".family-bar")).toBeLessThan(site);
  });

  test("sets type in the brand's system stack, names the web font only for the specimen, and eases on the brand's one curve", () => {
    const css = stylesheet();
    expect(css).not.toMatch(/@font-face|Bahnschrift/);
    expect([...css.matchAll(/([^{}]+)\{[^}]*Fira Sans/g)].map(([, selector]) => selector?.trim())).toEqual([".fw-specimen"]);
    expect(css).not.toMatch(/--fw-/);
    for (const [curve] of css.matchAll(/cubic-bezier\([^)]*\)/g)) expect(curve.replace(/\s/g, "")).toBe("cubic-bezier(.32,.72,0,1)");
  });

  test("eases a view transition on the brand's one curve, and only when motion is allowed", () => {
    const css = stylesheet();
    const query = css.indexOf("prefers-reduced-motion:no-preference");
    const group = /::view-transition-group\(\*\)\{animation-timing-function:var\(--ease\)\}/.exec(css);
    expect(query).toBeGreaterThanOrEqual(0);
    expect(group?.index ?? -1).toBeGreaterThan(query);
    expect(css.match(/::view-transition-group/g)).toHaveLength(1);
  });

  test("is the only stylesheet the site serves, but the subset font's", () => {
    const sheets = manifest.files.filter((path) => path.endsWith(".css")).sort();
    expect(sheets).toEqual([expect.stringMatching(/^\/assets\//), expect.stringMatching(/^\/fonts\//)]);
  });

  test("the icons are the brand kit's, byte for byte", () => {
    for (const path of [pagedeck.icons.still, pagedeck.icons.appleTouch]) {
      const served = readFileSync(`${SITE}site${path}`);
      expect(served.equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
    }
  });
});

describe("the served headers", () => {
  const rules = parseHeaders(readFileSync(`${SITE}site/_headers`, "utf8"));
  /** Every path the site serves: each page, and each file but the ones the host reads as configuration. */
  const served = [...PAGES, ...manifest.files.filter((path) => !/^\/_(headers|redirects)$/.test(path))];
  const EVERY_RESPONSE = everyResponse(CONTENT_SECURITY_POLICY);

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

  test("_headers caches content-hashed files as immutable, and nothing else", () => {
    const hashed = /[.-][A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
    expect(served.filter((path) => hashed.test(path))).not.toHaveLength(0);
    for (const path of served) {
      expect(headersFor(rules, path).get("Cache-Control"), path).toBe(
        hashed.test(path) ? "public, max-age=31536000, immutable" : undefined,
      );
    }
  });

  test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
    const ignored = readFileSync(`${SITE}site/.assetsignore`, "utf8")
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
    expect(manifest.notFound.map((page) => page ?? undefined)).toEqual([undefined]);
    const redirects = readFileSync(`${SITE}site/_redirects`, "utf8");
    expect(redirects).toContain("/manifest.json /404.html 200\n");
    expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
  });
});

/** Each tile in a band, as [heading, body text or list items]. */
function tiles(scope: Element | undefined): [string | undefined, (string | undefined)[]][] {
  return [...(scope?.querySelectorAll(".fw-tile") ?? [])].map((tile) => [
    text(tile.querySelector("h3")),
    [...tile.querySelectorAll(".fw-tile__body, li")].map(text),
  ]);
}

function links(scope: Element | undefined): [string | undefined, string | null][] {
  return [...(scope?.querySelectorAll("a") ?? [])].map((a) => [text(a), a.getAttribute("href")]);
}

// GLOSSARY.md, "The landing pages' message", and the maintainer's lead on #48.
describe("the home page", () => {
  const main = () => present(parse(PATHS.home).querySelector("main"), "<main>");
  /** The sections of <main>, in order. */
  const sections = () => [...main().querySelectorAll(":scope > section")];
  const band = (heading: string) =>
    sections().find((section) => text(section.querySelector("h2")) === heading);

  test("is titled with the claim, and described in plain words", () => {
    const doc = parse(PATHS.home);
    expect(doc.title).toBe("Pagedeck: Zero JavaScript until a page needs it");
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Build your site in React and it reaches visitors as plain HTML: fast pages, your own design, and JavaScript only where a page needs it.",
    );
  });

  test("runs hero, proof, the four quality sections, then the line back to deck.cool", () => {
    expect(sections().map((section) => section.className)).toEqual([
      "fw-intro",
      "fw-proof",
      "fw-band",
      "fw-band",
      "fw-band",
      "fw-band",
      "fw-family",
    ]);
  });

  test("the hero: the Astro line, the claim, one sentence for all three audiences, and the two calls to action", () => {
    const hero = sections()[0];
    expect(hero?.querySelector("img")?.getAttribute("src")).toBe(pagedeck.icons.animated);
    expect(hero?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(text(hero?.querySelector("h1"))).toBe(pagedeck.claim);
    expect([...(hero?.querySelectorAll("p") ?? [])].map(text)).toEqual([
      "Like Astro, if Astro were made for React.",
      "Build it in React, style it with your own CSS, or hand it to your agent. Every page reaches your visitors as finished HTML, and only the parts you make interactive bring any JavaScript.",
    ]);
    expect(text(hero?.querySelector(".fw-install code"))).toBe(pagedeck.install);
    expect(links(hero)).toEqual([["Read the docs", DOCS.start]]);
  });

  // GLOSSARY.md: the "plain markdown" line waits until @pagedeck/docs is on npm.
  test("makes no claim about markdown docs or llms.txt", () => {
    expect(main().textContent).not.toMatch(/Using an agent|markdown|llms\.txt/i);
  });

  test("the proof: interactive only where you need it, zero JavaScript by default and React all the way down, beside the one figure this build measured", () => {
    const proof = sections()[1];
    expect(text(proof?.querySelector("h2"))).toBe("As light as plain HTML. Built like a React app.");
    expect(
      [...(proof?.querySelectorAll(".fw-proof__points li") ?? [])].map((point) => [
        text(point.querySelector("h3")),
        text(point.querySelector("p")),
      ]),
    ).toEqual([
      [
        "Interactive only where you need it",
        'Mark a component "use client" once, in its own file. Every page that uses it comes alive there, and every page that does not stays plain HTML.',
      ],
      ["Zero JavaScript by default", "A page with nothing to click, type or play ships plain HTML and CSS, without a single script."],
      [
        "React all the way down",
        "Pages, layouts and interactive parts are all React components. There is no template language to learn and no wrapper file to write.",
      ],
    ]);
    const figure = [...(proof?.querySelectorAll(".fw-proof__figure > p") ?? [])].map(text);
    expect(figure).toEqual([
      pagedeck.figure.value,
      pagedeck.figure.label,
      "This page, measured when the site was built. One byte more and the build fails.",
    ]);
    expect(pagedeck.figure.value).toBe(formatBytes(budget.find((row) => row.path === PATHS.home)?.actual ?? Number.NaN));
    expect(links(proof)).toEqual([["See one interactive page, and what it costs ›", PATHS.interactive]]);
  });

  test("the four quality sections, in the brief's order", () => {
    expect(sections().slice(2, 6).map((section) => text(section.querySelector("h2")))).toEqual([
      "Unstyled, your look.",
      "Small, leans on the browser.",
      "Built for agents.",
      "Accessible by default.",
    ]);
  });

  describe("unstyled: one component, two skins", () => {
    const section = () => band("Unstyled, your look.");
    const skins = () => [...(section()?.querySelectorAll(".fw-skin") ?? [])];

    test("says the markup is your own", () => {
      expect(text(section()?.querySelector(".fw-band__text p"))).toBe(
        "pagedeck brings no CSS and no theme, so there is nothing to undo: the markup is your own React. Here is one product card, drawn twice from the same content. Only the stylesheet changes, and neither look costs a byte of JavaScript.",
      );
    });

    test("renders the same markup from the same entry twice, each in its own skin", () => {
      expect(skins().map((skin) => text(skin.querySelector("figcaption")))).toEqual(SKINS.map((skin) => skin.name));
      const stages = skins().map((skin) => present(skin.querySelector(".fw-skin__stage"), "a skin's stage"));
      expect(stages.map((stage) => stage.className)).toEqual(SKINS.map((skin) => `fw-skin__stage ${skin.className}`));
      expect(stages[0]?.innerHTML).toBe(stages[1]?.innerHTML);
      const teaser = present(stages[0]?.querySelector("article.teaser"), "the teaser");
      expect(text(teaser.querySelector("h3"))).toBe(PRODUCT.name);
      expect([...teaser.querySelectorAll("p")].map(text)).toEqual([PRODUCT.tagline, PICKER.price]);
      expect(links(teaser)).toEqual([["See the whole product", PATHS.cmsDemo]]);
    });

    test("shows beside each skin the source file the stylesheet is compiled from", () => {
      const css = readFileSync(`${SITE}site${present(parse(PATHS.home).head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link")}`, "utf8");
      expect(skins().map((skin) => skin.querySelector("pre code")?.textContent)).toEqual(
        SKINS.map((skin) => readFileSync(`${SITE}${skin.file}`, "utf8").trim()),
      );
      for (const skin of SKINS) expect(css).toContain(`.${skin.className} .teaser{`);
    });

    test("folds each skin's sheet, highlighted and named, into a <details> that starts closed", () => {
      for (const [i, skin] of skins().entries()) {
        const { name, file } = present(SKINS[i], "a skin");
        const fold = present(skin.querySelector("details"), `${name}'s fold`);
        expect(fold.hasAttribute("open")).toBe(false);
        // A stylesheet is no answer to a search.
        expect(fold.getAttribute("data-fw-search")).toBe("ignore");
        const lines = readFileSync(`${SITE}${file}`, "utf8").trim().split("\n").length;
        expect(text(fold.querySelector("summary"))).toBe(`${name} CSS · ${lines} lines`);
        const pre = present(fold.querySelector("pre.shiki"), `${name}'s highlighted sheet`);
        expect(pre.getAttribute("aria-label")).toBe(`${name} CSS`);
        expect(pre.getAttribute("tabindex")).toBe("0");
        const colours = new Set([...pre.querySelectorAll("code span[style]")].map((span) => span.getAttribute("style")));
        expect(colours.size).toBeGreaterThan(1);
        for (const colour of colours) expect(colour).toMatch(/^color:#[0-9a-f]{6}$/i);
      }
    });

    test("links the live demos under the skins", () => {
      expect(links(section()?.querySelector(".fw-skins__more") ?? undefined)).toEqual([
        ["See an interactive page ›", PATHS.interactive],
        ["See how content ships ›", PATHS.cmsDemo],
      ]);
    });
  });

  test("small: HTML first, budgets that hold, and send only what the page shows, with the content page's own figures", () => {
    const section = band("Small, leans on the browser.");
    const props = present(
      parse(PATHS.cmsDemo).querySelector('[data-fw-component="variant_picker"]')?.getAttribute("data-fw-props"),
      "the variant picker's props",
    );
    const read = formatBytes(utf8Bytes(JSON.stringify(PRODUCT)));
    const sent = formatBytes(utf8Bytes(props));
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "The browser already knows how to show a page. pagedeck hands it finished HTML and steps aside, so the only JavaScript on a page is the JavaScript that page asked for.",
    );
    expect(tiles(section)).toEqual([
      ["HTML first", ["Every page becomes finished HTML before anyone visits, so your words are on screen before a single script runs."]],
      [
        "Budgets that hold",
        ["Give each page a JavaScript budget, and the build fails when a page ships one byte more. This page's budget is 0 B."],
      ],
      [
        "Send only what the page shows",
        [
          `pagedeck reads your whole CMS entry while it builds the site, and sends the browser only what the page needs. On the content demo it reads ${read} and sends the browser just ${sent}, so a phone has far less to download.`,
        ],
      ],
    ]);
    expect(links(section)).toEqual([["See the content demo ›", PATHS.cmsDemo]]);
  });

  test("agents: just React, every option spelled out, and a build that stops on a mistake", () => {
    const section = band("Built for agents.");
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "Whether you write the code or your coding agent does, pagedeck leaves less to guess.",
    );
    expect(tiles(section)).toEqual([
      [
        "Just React",
        ['Pages are React components, and interactive parts use React\'s own "use client". An agent that knows React already knows how to build here.'],
      ],
      [
        "Every option spelled out",
        [
          "pagedeck is written in TypeScript and ships its types, so your editor and your agent know every option and flag a wrong one as it is written, before the page is built.",
        ],
      ],
      [
        "Mistakes stop the build",
        [
          "Ship more JavaScript than a page's budget, link to a page that does not exist, or give a page a second main area, and the build stops. Your agent hears about it before your readers do.",
        ],
      ],
    ]);
  });

  // Only the claims a test in pedrosousa13/pagedeck proves, as listed in #46.
  // No reduced-motion claim until pedrosousa13/pagedeck#121 is fixed.
  test("accessible: pagedeck's three tested claims, and nothing about motion", () => {
    const section = band("Accessible by default.");
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "pagedeck looks after page structure and search for you, for keyboard and screen reader users alike. Each line below is backed by a test in pagedeck's own repo.",
    );
    expect(tiles(section)).toEqual([
      [
        "One main area per page",
        [
          "Screen readers let people jump straight to a page's main content. Every page gets exactly one main area to jump to (its main landmark), and a component that adds a second fails the build.",
        ],
      ],
      [
        "Search from the keyboard",
        [
          "Search works from the keyboard alone: arrow keys move through the results, Enter opens one and Escape closes the list. It follows the pattern screen readers expect (a combobox).",
        ],
      ],
      ["Nothing typed is lost", ["Start typing before search is ready, and your text is kept, cursor position and all."]],
    ]);
    expect(links(section)).toEqual([["Try the search ›", `${PATHS.features}#search`]]);
    expect(section?.textContent).not.toMatch(/motion/i);
  });

  test("closes with one line back to deck.cool", () => {
    const family = sections()[6];
    expect(text(family?.querySelector("p"))).toBe(
      "pagedeck is part of deck.cool, a family of unstyled React packages that look like you and work like the browser. Meet the family ›",
    );
    expect(links(family)).toEqual([["Meet the family ›", umbrella.url]]);
  });
});

// #72: every page outside /docs is named after what it shows, in words a
// designer or someone new to React understands.
describe("the pages outside the docs", () => {
  const LANDING = [PATHS.home, PATHS.features, PATHS.interactive, PATHS.cmsDemo];

  test.each([
    [
      PATHS.features,
      "Every feature, running on this page",
      "Everything pagedeck does, each explained in a few sentences and running live: interactive parts that start when you choose, search, embeds that wait for consent, images sized for each screen, a trimmed font, a link preview and more than one language.",
    ],
    [
      PATHS.interactive,
      "Interactive only where you need it",
      "One button you can press, on a page that is otherwise plain HTML. Only this page loads the JavaScript the button needs, and pagedeck's home page still ships none.",
    ],
    [
      PATHS.cmsDemo,
      "Bring all your content. Ship only what the page shows.",
      "pagedeck reads a whole product entry from a CMS while it builds the site, writes what the page shows as plain HTML, and sends the browser only the few fields the colour and size picker needs.",
    ],
  ])("%s is titled and headed %j, and described in plain words", (path, title, description) => {
    const doc = parse(path);
    expect(doc.title).toBe(title);
    expect(text(doc.querySelector("main h1"))).toBe(title);
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(description);
  });

  test.each([
    [
      PATHS.interactive,
      "This page has one button that counts your presses. Everything else is plain HTML, finished before you arrived. The button is the only part that needs JavaScript, the code that lets a page react to you, so this page loads that code and the home page still loads none. Developers call a part like this an island: a small interactive spot in a page of plain HTML.",
    ],
    [
      PATHS.cmsDemo,
      "Your CMS, the place your team writes and edits content, can hold far more than any one page shows. This jacket's entry has variants, stock, reviews, SEO fields and private notes. pagedeck read all of it once, while it built this site, and wrote what you see as plain HTML. Your browser received only the few fields the colour and size picker needs. The figures show how much less your browser had to download, which matters most on a phone.",
    ],
    [
      PATHS.features,
      "Each section says what one feature gives you, then runs it right here. The boxes come alive, the search box searches, and the embed waits for your permission. The only JavaScript on this page is the code those demos need.",
    ],
  ])("%s opens by saying what the reader gets", (path, intro) => {
    expect(text(parse(path).querySelector("main .fw-hero__lede"))).toBe(intro);
  });

  // The words readers did not know. Body copy may use one with a plain
  // explanation beside it; a name or a heading may not use it at all.
  const JARGON = /server data|island|hydrat|build time|build-time|\bSSG\b|static site/i;

  test.each(LANDING)("%s keeps jargon out of its name, its description and its headings", (path) => {
    const doc = parse(path);
    const names = [
      doc.title,
      doc.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
      ...[...doc.querySelectorAll(".family-bar__links a, footer a")].map(text),
      ...[...doc.querySelectorAll("main h1, main h2, main h3")].map(text),
    ];
    expect(names.filter((name) => JARGON.test(name ?? ""))).toEqual([]);
  });

  // Every block of text in <main>, with no script, one string per paragraph,
  // list item, cell or heading, cut into sentences.
  const BLOCKS = "p, li, h1, h2, h3, dt, dd, th, td, legend, label, figcaption, summary, pre";
  function sentences(path: string): string[] {
    const main = present(parse(path).querySelector("main"), "<main>");
    return [...main.querySelectorAll(BLOCKS)]
      .filter((block) => block.querySelector(BLOCKS) === null)
      .flatMap((block) => (text(block) ?? "").split(/(?<=[.!?])\s+/));
  }

  // Body copy may name "island" or "hydration" only in the one sentence that
  // explains it, and never needs the words below at all.
  test.each([
    [PATHS.home, []],
    [PATHS.features, ["Developers call that start hydration."]],
    [PATHS.interactive, ["Developers call a part like this an island: a small interactive spot in a page of plain HTML."]],
    [PATHS.cmsDemo, []],
  ])("%s names an island or hydration only where it explains it", (path, explained) => {
    expect(sentences(path).filter((sentence) => /island|hydrat/i.test(sentence))).toEqual(explained);
  });

  test.each(LANDING)("%s never says server component, JSON or SKU", (path) => {
    expect(sentences(path).filter((sentence) => /server component|\bJSON\b|\bSKU\b/i.test(sentence))).toEqual([]);
  });

  test.each(LANDING)("%s keeps jargon out of its paths", (path) => {
    expect(path).not.toMatch(/server-data|island/);
  });

  test("the features page heads each section with what it gives you", () => {
    expect([...parse(PATHS.features).querySelectorAll("main section.fw-feature > .fw-feature__text > h2")].map(text)).toEqual([
      "Interactive when you choose",
      "Search",
      "Embeds that wait for consent",
      "Images sized for every screen",
      "Fonts cut to what you use",
      "Link previews, drawn for you",
      "One site, many languages",
    ]);
  });

  test("the content page keeps the entry's private notes off the page", () => {
    expect(html(PATHS.cmsDemo)).not.toContain("SENTINEL");
  });
});

describe("the features page", () => {
  test("keeps every section of the landing's", () => {
    const ids = [...parse(PATHS.features).querySelectorAll("main section.fw-feature")].map((section) => section.id);
    expect(ids).toEqual(["islands", "search", "consent", "images", "fonts", "social-cards", "i18n"]);
  });

  test("subsets the font for the specimen alone: no other page links or preloads it", () => {
    for (const path of PAGES) {
      const fonts = [...parse(path).head.querySelectorAll("link")].filter((link) => link.getAttribute("href")?.startsWith("/fonts/"));
      expect(fonts.length > 0, path).toBe(path === PATHS.features);
    }
    expect(parse(PATHS.features).querySelector("#fonts .fw-specimen")).not.toBeNull();
  });

  test("draws its social card, and names it as og:image", () => {
    const card = present(parse(PATHS.features).querySelector('meta[property="og:image"]')?.getAttribute("content"), "og:image");
    expect(manifest.files).toContain(new URL(card, "https://page.deck.cool").pathname);
  });
});

describe("the docs' search page", () => {
  test("is headed Search, under the docs layout with the docs' nav, with the search island", () => {
    const doc = parse(PATHS.search);
    expect(doc.title).toBe("Search");
    const nav = present(doc.querySelector('main .fw-docs nav[aria-label="Documentation"]'), "the docs' nav");
    expect(hrefs(nav)).toEqual(DOCS_NAV.map(({ path }) => path));
    expect(text(doc.querySelector("main .fw-docs .fw-doc > h1"))).toBe("Search");
    expect(doc.querySelector('main [data-fw-component="search"] input')).not.toBeNull();
  });

  // #53: the index holds the landing pages too, so the box names the whole site.
  test("labels its box Search pagedeck", () => {
    expect(html(PATHS.search)).toContain("&quot;label&quot;:&quot;Search pagedeck&quot;");
  });

  test("the index is built, and holds every page", () => {
    expect(manifest.files).toEqual(expect.arrayContaining(["/search/en/index.json", "/search/en/documents.json"]));
    const documents = JSON.parse(readFileSync(`${SITE}site/search/en/documents.json`, "utf8")) as { path: string }[];
    expect(documents.map(({ path }) => path).sort()).toEqual(manifest.pages.map((page) => page.path).sort());
  });
});

describe("the docs, from @pagedeck/docs", () => {
  /** The demos a built page renders, by component, in order. */
  const demosOn = (doc: Document) => [...doc.querySelectorAll("article [data-fw-component]")].map((island) => island.getAttribute("data-fw-component"));

  test("takes the docs from npm at 0.2.3, the version of every @pagedeck package", () => {
    const pkg = JSON.parse(readFileSync(`${SITE}package.json`, "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@pagedeck/docs"]).toBe("0.2.3");
    for (const [name, version] of Object.entries(pkg.dependencies)) if (name.startsWith("@pagedeck/")) expect(version, name).toBe("0.2.3");
  });

  test.each(DOCS_NAV)("$path renders with each demo it marks, in order", ({ path, demos }) => {
    expect(demosOn(parse(path))).toEqual(demos.map(demoComponent));
  });

  test("marks each demo the site registers once, and no other", () => {
    expect(DOCS_NAV.flatMap((page) => page.demos).sort()).toEqual(Object.keys(DEMOS).sort());
  });

  // The docs come from npm: no page of them may run script or load from another origin.
  test.each(DOCS_NAV)("$path carries no script, <style> or inline handler, and loads nothing from another origin", ({ path }) => {
    const doc = parse(path);
    expect(doc.querySelectorAll("script, style, iframe, object, embed"), path).toHaveLength(0);
    for (const element of doc.querySelectorAll("*")) {
      for (const { name, value } of element.attributes) {
        expect(name, element.tagName).not.toMatch(/^on/);
        // An <a> navigates; every other URL is fetched by the page itself.
        if (["src", "srcset", "poster", "data"].includes(name) || (name === "href" && element.tagName !== "A")) {
          expect(value, `${element.tagName} ${name}`).toMatch(/^\/(?!\/)/);
        }
      }
    }
  });

  test("the nav lists every page in nav.json's order, and marks the current one", () => {
    const nav = present(parse(DOCS.start).querySelector('nav[aria-label="Documentation"]'), "the docs' nav");
    expect(hrefs(nav)).toEqual(DOCS_NAV.map(({ path }) => path));
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe(DOCS.start);
  });

  test("titles each page once, as its heading", () => {
    const doc = parse(DOCS_WITH_TABLES);
    expect(doc.querySelectorAll("title")).toHaveLength(1);
    expect(doc.title).toBe("Site config");
    expect([...doc.querySelectorAll("main h1")].map(text)).toEqual(["Site config"]);
  });

  test("puts each table in a named region the keyboard can scroll, and lets it scroll each plain block", () => {
    const prose = present(parse(DOCS_WITH_TABLES).querySelector("main .fw-prose"), "the page's prose");
    const tables = [...prose.querySelectorAll("table")];
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const region = present(table.parentElement, "the table's region");
      expect([region.className, region.getAttribute("role"), region.getAttribute("tabindex")]).toEqual(["fw-table", "region", "0"]);
      expect(region.getAttribute("aria-label")).not.toBe("");
    }
    for (const pre of prose.querySelectorAll("pre")) expect(pre.getAttribute("tabindex")).toBe("0");
  });

  // The layout and the demos are the site's own words, unlike the prose they frame.
  test.each(["components/docs-page.tsx", "components/docs-nav.tsx"])("%s uses no em dash", (file) => {
    expect(readFileSync(`${SITE}${file}`, "utf8")).not.toMatch(/\u2014|&mdash;/);
  });
});

// The figures pagedeck's docs quote from this site's own build. pagedeck's
// repo checks the ones its how-to guides quote from its own starter and CMS
// example, which this site does not build.
describe("the figures the docs quote", () => {
  const source = (file: string) => readFileSync(`${SITE}node_modules/@pagedeck/docs/${file}`, "utf8").replace(/\s+/g, " ");
  const props = () =>
    present(
      parse(PATHS.cmsDemo).querySelector('[data-fw-component="variant_picker"]')?.getAttribute("data-fw-props"),
      "the variant picker's props",
    );

  // index.md and explanation/why-this-site-ships-no-javascript.md.
  test("no docs page loads JavaScript, and the search page, the one that does, loads its island when the browser is idle", () => {
    expect(source("index.md")).toContain("No page on this site loads any JavaScript.");
    expect(source("explanation/why-this-site-ships-no-javascript.md")).toContain("It loads when the browser is idle");
    for (const { path } of DOCS_NAV) expect(budget.find((row) => row.path === path)?.actual, path).toBe(0);
    const scripted = manifest.pages.filter((page) => page.path.startsWith("/docs/") && page.components.length > 0);
    expect(scripted.map((page) => page.path)).toEqual([PATHS.search]);
    expect(parse(PATHS.search).querySelector('[data-fw-component="search"]')?.getAttribute("data-fw-mode")).toBe("idle");
  });

  // reference/site-search.md, on the requests search makes.
  test("this site's policy sets connect-src 'self'", () => {
    expect(source("reference/site-search.md")).toContain("This site's policy sets `connect-src 'self'`.");
    expect(CONTENT_SECURITY_POLICY.value.split("; ")).toContain("connect-src 'self'");
  });

  // reference/javascript-budgets.md, "Island props".
  test("the content demo reads a 67 kB entry and passes its island 2.3 kB", () => {
    expect(source("reference/javascript-budgets.md")).toContain("A server component can read a 67 kB CMS entry and pass an island only the 2.3 kB it renders");
    expect(Math.round(utf8Bytes(JSON.stringify(PRODUCT)) / 1000)).toBe(67);
    expect(formatBytes(utf8Bytes(props()))).toBe("2.3 kB");
  });

  test("the variant picker's props, which set the 3kb default, are 2296 B", () => {
    expect(source("reference/javascript-budgets.md")).toContain(
      "**The default is `3kb`**, and it applies to every site that does not declare `islandPropsBudget`, with or without a `budget`. It is the largest island props on the sites in this repository, 2296 B for the landing site's variant picker",
    );
    expect(utf8Bytes(props())).toBe(2296);
  });
});
