import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { decks, umbrella } from "@deck-cool/brand/decks";
import { everyResponse, isRecord, present, readManifest, text } from "@deck-cool/site-kit/build-test";
import { headersFor, parseHeaders } from "@deck-cool/site-kit/serve-site";
import { DOCS_ORIGIN, PATHS, REPO } from "../components/links.ts";
import { formatBytes, utf8Bytes } from "./bytes.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { PICKER, PRODUCT } from "./product.ts";
import { SKINS } from "./skins.ts";

// Reads the build that build.global-setup.ts writes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));
const pagedeck = decks.find((deck) => deck.name === "pagedeck");
if (pagedeck === undefined) throw new Error("the decks module has no pagedeck");

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

const PAGES = [PATHS.home, PATHS.search, PATHS.features, PATHS.interactive, PATHS.content];

test("the site is the landing's four pages and the docs' search page", () => {
  expect(manifest.pages.map((page) => page.path).sort()).toEqual([...PAGES].sort());
});

describe("budgets, measured and pinned", () => {
  // Spelled again rather than imported, so a limit raised in the config fails here.
  // Each is the page's measured size rounded up to a whole kilobyte, and none is
  // above the landing's own (pagedeck's packages/landing): 60kb, 62kb and 60kb.
  const PINNED: Record<string, string> = {
    [PATHS.home]: "0b",
    [PATHS.interactive]: "60kb",
    [PATHS.features]: "60kb",
    [PATHS.content]: "59kb",
    [PATHS.search]: "59kb",
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

  test("each page with islands carries only its own", () => {
    const islands = Object.fromEntries(manifest.pages.map((page) => [page.path, [...page.components].sort()]));
    expect(islands).toEqual({
      [PATHS.home]: [],
      [PATHS.interactive]: ["counter"],
      [PATHS.features]: ["consent_banner", "island_idle", "island_load", "island_visible", "search"],
      [PATHS.content]: ["variant_picker"],
      [PATHS.search]: ["search"],
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
      ["Docs", `${DOCS_ORIGIN}/`],
      ["Features", PATHS.features],
      ["Island demo", PATHS.interactive],
      ["Server data", PATHS.content],
      ["Search", PATHS.search],
      ["GitHub", REPO],
    ]);
  });

  // CONTEXT.md: a package site links its own deck's repo, never the maintainer's profile.
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

// CONTEXT.md, "The landing pages' message", and the maintainer's lead on #48.
describe("the home page", () => {
  const main = () => present(parse(PATHS.home).querySelector("main"), "<main>");
  /** The sections of <main>, in order. */
  const sections = () => [...main().querySelectorAll(":scope > section")];
  const band = (heading: string) =>
    sections().find((section) => text(section.querySelector("h2")) === heading);

  test("is titled with the claim, and described by the Astro line", () => {
    const doc = parse(PATHS.home);
    expect(doc.title).toBe("Pagedeck: Zero JavaScript until a page needs it");
    expect(doc.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Like Astro, if Astro were made for React: islands, zero JavaScript by default, and React components all the way down.",
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
      'Write it in React, style it with your own CSS, or hand it to your agent: every page ships as plain HTML, and only the components you mark "use client" wake up in the browser.',
    ]);
    expect(text(hero?.querySelector(".fw-install code"))).toBe(pagedeck.install);
    // The docs link goes to the docs' own Worker until #53.
    expect(links(hero)).toEqual([["Read the docs", `${DOCS_ORIGIN}/`]]);
  });

  // CONTEXT.md: the "plain markdown" line waits until @pagedeck/docs is on npm.
  test("makes no claim about markdown docs or llms.txt", () => {
    expect(main().textContent).not.toMatch(/Using an agent|markdown|llms\.txt/i);
  });

  test("the proof: islands, zero JavaScript by default and React all the way down, beside the one figure this build measured", () => {
    const proof = sections()[1];
    expect(text(proof?.querySelector("h2"))).toBe("Islands, like Astro. React all the way down.");
    expect(
      [...(proof?.querySelectorAll(".fw-proof__points li") ?? [])].map((point) => [
        text(point.querySelector("h3")),
        text(point.querySelector("p")),
      ]),
    ).toEqual([
      [
        "Islands",
        'Start a component with "use client" once, in its own file, not at every place you use it. Each page that renders it gets it as an island, and no other page pays for it.',
      ],
      ["Zero JavaScript by default", "A page with nothing interactive ships plain HTML and CSS, without one script tag."],
      [
        "React all the way down",
        "Pages, layouts and islands are all React components. There is no template language to learn and no wrapper file to write.",
      ],
    ]);
    const figure = [...(proof?.querySelectorAll(".fw-proof__figure > p") ?? [])].map(text);
    expect(figure).toEqual([
      pagedeck.figure.value,
      pagedeck.figure.label,
      "This page, measured by its own build. One byte more fails the build.",
    ]);
    expect(pagedeck.figure.value).toBe(formatBytes(budget.find((row) => row.path === PATHS.home)?.actual ?? Number.NaN));
    expect(links(proof)).toEqual([["See what one island costs ›", PATHS.interactive]]);
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
        "pagedeck ships no CSS, no theme and no part names to learn: the markup is your own React. Here is one component, rendered twice from the same CMS entry. Only the stylesheet changes, and neither one costs a byte of JavaScript.",
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
      expect(links(teaser)).toEqual([["See the whole entry", PATHS.content]]);
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
        ["See an island ›", PATHS.interactive],
        ["See the server data ›", PATHS.content],
      ]);
    });
  });

  test("small: HTML first, budgets that hold, and data that stays on the server, with /content's own figures", () => {
    const section = band("Small, leans on the browser.");
    const props = present(
      parse(PATHS.content).querySelector('[data-fw-component="variant_picker"]')?.getAttribute("data-fw-props"),
      "the variant picker's props",
    );
    const read = formatBytes(utf8Bytes(JSON.stringify(PRODUCT)));
    const sent = formatBytes(utf8Bytes(props));
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "The browser already knows how to show a page. pagedeck hands it finished HTML and steps aside, so the only JavaScript on a page is the JavaScript that page asked for.",
    );
    expect(tiles(section)).toEqual([
      ["HTML first", ["Every page renders to HTML when the site builds, so your words are on screen before a single script runs."]],
      [
        "Budgets that hold",
        ["Give each page a JavaScript budget, and the build fails when a page ships one byte more. This page's budget is 0 B."],
      ],
      [
        "Your data stays on the server",
        [
          `A server component reads the whole CMS entry when the site builds. On /content it reads ${read} and sends the browser ${sent}.`,
        ],
      ],
    ]);
    expect(links(section)).toEqual([["See it on /content ›", PATHS.content]]);
  });

  test("agents: just React, typed, and a build that stops on a mistake", () => {
    const section = band("Built for agents.");
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "Whether you write the code or your coding agent does, pagedeck leaves less to guess.",
    );
    expect(tiles(section)).toEqual([
      [
        "Just React",
        ['Pages are React components, and islands use React\'s own "use client". An agent that knows React already knows how to build here.'],
      ],
      [
        "Typed from the config down",
        ["pagedeck is written in TypeScript and ships its types, so your editor and your agent see every option."],
      ],
      [
        "Mistakes stop the build",
        [
          "Ship more JavaScript than a page's budget, link to a page that does not exist, or render a second main landmark, and the build stops. Your agent hears about it before your readers do.",
        ],
      ],
    ]);
  });

  // Only the claims a test in pedrosousa13/pagedeck proves, as listed in #46.
  // No reduced-motion claim until pedrosousa13/pagedeck#121 is fixed.
  test("accessible: pagedeck's three tested claims, and nothing about motion", () => {
    const section = band("Accessible by default.");
    expect(text(section?.querySelector(".fw-band__text p"))).toBe(
      "pagedeck looks after landmarks and search for you, for the keyboard and the screen reader alike. Each line below is backed by a test in pagedeck's own repo.",
    );
    expect(tiles(section)).toEqual([
      ["One main landmark", ["Every page gets exactly one main landmark. A component that renders a second fails the build."]],
      ["Search from the keyboard", ["Search is a combobox: arrow keys walk the results, Enter follows one, Escape closes them."]],
      ["Nothing typed is lost", ["Text typed into search before it hydrates is kept, caret and all."]],
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

  test("uses no em dash anywhere", () => {
    expect(html(PATHS.home)).not.toMatch(/\u2014|&mdash;/);
  });
});

describe("the features page", () => {
  test("keeps every section of the landing's", () => {
    const ids = [...parse(PATHS.features).querySelectorAll("main section.fw-feature")].map((section) => section.id);
    expect(ids).toEqual(["islands", "search", "consent", "images", "fonts", "social-cards", "i18n"]);
  });

  test("keeps the landing's description, which names the subset font", () => {
    expect(parse(PATHS.features).head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Pagedeck's features, each explained in a few sentences and running live: islands under three hydration strategies, search, a consent-gated embed, responsive images, a subset font, a social card and locales.",
    );
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
  test("is headed Search, under the docs layout, with the search island", () => {
    const doc = parse(PATHS.search);
    expect(doc.title).toBe("Search");
    // The docs' grid, with no nav until #53 brings the docs.
    expect(doc.querySelector('main .fw-docs nav[aria-label="Documentation"]')).toBeNull();
    expect(text(doc.querySelector("main .fw-docs .fw-doc > h1"))).toBe("Search");
    expect(doc.querySelector('main [data-fw-component="search"] input')).not.toBeNull();
  });

  test("the index is built", () => {
    expect(manifest.files).toEqual(expect.arrayContaining(["/search/en/index.json", "/search/en/documents.json"]));
  });
});
