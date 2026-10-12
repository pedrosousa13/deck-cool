import { QUERY_CAP } from "@pagedeck/search";
import { Window, type Document, type Element } from "happy-dom";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildOutput } from "@deck-cool/site-kit/build";
import { everyResponse, pagesWithEmDashes, present, readManifest, text } from "@deck-cool/site-kit/build-test";
import { headersFor, parseHeaders } from "@deck-cool/site-kit/serve-site";
import { REPOSITORY } from "../components/links.ts";
import { umbrella } from "@deck-cool/brand/decks";
import { carouseldeck } from "../components/carouseldeck.ts";
import { CONTENT_SECURITY_POLICY, DECK_STYLE_HASHES } from "./csp.ts";
import { DEMOS } from "./demos.ts";
import { DOCS_NAV } from "./docs-pages.ts";
import { install, size, version } from "./facts.ts";
import { SKINS } from "./skins.ts";
import { SITE_ORIGIN } from "./seo.ts";

// Reads the build build.global-setup.ts makes.

const SITE = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${SITE}site`;
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));


/** The site's own pages, by path and file. */
const OWN_PAGES = [
  ["/", "index.html"],
  ["/examples/", "examples/index.html"],
] as const;

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
const examples = () => parse("examples/index.html");

function links(scope: Element | Document): [string | undefined, string | null][] {
  return [...scope.querySelectorAll("a")].map((a) => [text(a), a.getAttribute("href")]);
}

const manifest = readManifest(SITE);

interface BudgetPage {
  path: string;
  limit: number;
  actual: number;
}

const budget = (JSON.parse(readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8")) as { pages: BudgetPage[] })
  .pages;

describe("the JavaScript budget", () => {
  test("covers every page", () => {
    expect(budget.map((page) => page.path).sort()).toEqual([...ALL_PATHS].sort());
  });

  const pageBudget = (path: string) =>
    present(
      budget.find((each) => each.path === path),
      `${path}'s budget`,
    );
  const demoPaths = DOCS_NAV.filter(({ demos }) => demos.length > 0).map(({ href }) => href);

  // A page's budget is what it ships, rounded up to the next KB: a page that
  // ships more breaks the build, and one that ships much less needs its budget lowered.
  test.each(ALL_PATHS.filter((path) => !demoPaths.includes(path)))("%s ships the islands it renders, within a KB of its budget", (path) => {
    const page = pageBudget(path);
    expect(page.actual).toBeGreaterThan(0);
    expect(page.limit - page.actual).toBeGreaterThanOrEqual(0);
    expect(page.limit - page.actual).toBeLessThan(1024);
  });

  // So a docs release that moves a demo to another page still builds.
  test("the docs pages with demos share one budget, which the largest of them fills to within a KB", () => {
    const pages = demoPaths.map(pageBudget);
    expect(new Set(pages.map((page) => page.limit)).size).toBe(1);
    const limit = pages[0]?.limit ?? 0;
    const largest = Math.max(...pages.map((page) => page.actual));
    expect(limit - largest).toBeGreaterThanOrEqual(0);
    expect(limit - largest).toBeLessThan(1024);
  });
});

describe.each(PAGES)("%s's <head>", (path, file) => {
  const doc = () => parse(file);

  test("links the carouseldeck icons and one hashed stylesheet, and sets the viewport", () => {
    const head = [...doc().head.querySelectorAll("link")].map((link) => [link.getAttribute("rel"), link.getAttribute("href")]);
    expect(head).toEqual(
      expect.arrayContaining([
        ["icon", carouseldeck.icons.still],
        ["apple-touch-icon", carouseldeck.icons.appleTouch],
        ["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)],
      ]),
    );
    expect(head.filter(([rel]) => rel === "stylesheet")).toHaveLength(1);
    expect(doc().head.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(
      "width=device-width, initial-scale=1",
    );
  });

  test("names its canonical and og:url on its origin, and describes the page", () => {
    const head = doc().head;
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${SITE_ORIGIN}${path}`);
    expect(head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(`${SITE_ORIGIN}${path}`);
    expect(head.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe("carouseldeck");
    const description = head.querySelector('meta[name="description"]')?.getAttribute("content");
    expect(description).toMatch(/^.{60,}$/);
    expect(head.querySelector('meta[property="og:description"]')?.getAttribute("content")).toBe(description);
  });

  test("shares a 1200 by 630 social card the build drew", () => {
    const head = doc().head;
    const image = present(head.querySelector('meta[property="og:image"]')?.getAttribute("content"), "og:image");
    expect(image.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
    const png = readFileSync(`${OUT}${new URL(image).pathname}`);
    // The PNG's IHDR chunk: width, then height.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(head.querySelector('meta[property="og:image:width"]')?.getAttribute("content")).toBe("1200");
    expect(head.querySelector('meta[property="og:image:height"]')?.getAttribute("content")).toBe("630");
  });

  test("opens with the Family bar, carouseldeck's, with search in it", () => {
    const html = readFileSync(`${OUT}/${file}`, "utf8");
    const at = (needle: string) => {
      const index = html.indexOf(needle);
      expect(index, needle).toBeGreaterThanOrEqual(0);
      return index;
    };
    // Outside <main>, so the header is the page's banner landmark.
    expect(at('<header class="family-bar" data-deck="carouseldeck"')).toBeLessThan(at("<main>"));
    const bar = present(doc().querySelector("header.family-bar nav"), "the bar's row");
    expect(links(present(bar.querySelector(".family-bar__links"), "the bar's links"))).toEqual([
      ["Docs", "/docs/"],
      ["Examples", "/examples/"],
      ["GitHub", REPOSITORY],
    ]);
    expect(links(bar).filter(([label]) => label === "Install")).toEqual([["Install", "/docs/install/"]]);
    expect(bar.querySelector('input[type="search"]')).not.toBeNull();
    expect(text(bar.querySelector("label"))).toBe("Search the docs");
  });

  test("carries no inline script or handler, and no <style> but the decks', each hashed in the CSP", () => {
    const page = doc();
    for (const element of page.querySelectorAll("*")) {
      for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
    }
    // script-src 'self': every script that runs is a file, and the rest are data.
    for (const script of page.querySelectorAll("script")) {
      if (script.hasAttribute("src")) expect(script.getAttribute("src"), script.outerHTML).toMatch(/^\/[^/]/);
      else expect(script.getAttribute("type"), script.outerHTML.slice(0, 120)).toBe("application/ld+json");
    }
    const html = readFileSync(`${OUT}/${file}`, "utf8");
    for (const [style, href = "", css = ""] of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
      const name = /^ data-precedence="carouseldeck" data-href="([^"]+)"$/.exec(href)?.[1];
      expect(name, style.slice(0, 120)).toBeDefined();
      const hash = `'sha256-${createHash("sha256").update(css).digest("base64")}'`;
      expect(DECK_STYLE_HASHES[name as keyof typeof DECK_STYLE_HASHES], name).toBe(hash);
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

test("the stylesheet holds brand.css, then family-bar.css, then carouseldeck.css", () => {
  const css = stylesheet();
  // Each sheet's first or last rule.
  const brand = css.indexOf("--ground-page");
  const bar = css.indexOf("@keyframes family-bar-roll");
  const own = css.indexOf("--font-mono");
  expect(brand).toBeGreaterThanOrEqual(0);
  expect(brand).toBeLessThan(bar);
  expect(bar).toBeLessThan(own);
});

test("carouseldeck.css times every transition with the brand's one easing curve", () => {
  const css = readFileSync(`${SITE}styles/carouseldeck.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const transitions = [...css.matchAll(/\btransition(?:-timing-function)?:([^;}]+)/g)].map(([, value]) => value?.trim());
  expect(transitions).not.toHaveLength(0);
  for (const value of transitions) {
    for (const part of value?.split(",") ?? []) expect(part, value).toMatch(/var\(--ease\)/);
  }
  expect(css).not.toMatch(/cubic-bezier/);
  expect(css).not.toMatch(/\banimation:/);
});

test("the site serves no stylesheet but the hashed one", () => {
  const sheets = manifest.files.filter((path) => path.endsWith(".css"));
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toMatch(/^\/assets\//);
});

test("the social card's font is the build's alone: the site serves no font", () => {
  const font = readFileSync(`${SITE}fonts/Inter-SemiBold.woff`);
  expect(manifest.files.filter((path) => /\.(woff2?|ttf|otf)$/.test(path))).toEqual([]);
  for (const file of readdirSync(OUT, { recursive: true, encoding: "utf8" })) {
    const path = `${OUT}/${file}`;
    if (statSync(path).isFile()) expect(readFileSync(path).equals(font), file).toBe(false);
  }
  expect(readFileSync(`${SITE}fonts/OFL.txt`, "utf8")).toContain("SIL Open Font License, Version 1.1");
});

test("the icons are the brand's, byte for byte", () => {
  for (const path of [carouseldeck.icons.still, carouseldeck.icons.appleTouch]) {
    expect(readFileSync(`${OUT}${path}`).equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
  }
});

/** Each tile in a band, as [heading, body]. */
function tiles(scope: Element | undefined): [string | undefined, string | undefined][] {
  return [...(scope?.querySelectorAll(".home-tile") ?? [])].map((tile) => [
    text(tile.querySelector("h3")),
    text(tile.querySelector(".home-tile__body")),
  ]);
}

// GLOSSARY.md, "The landing pages' message", and the brief on #47.
describe("the home page", () => {
  const main = () => present(home().querySelector("main"), "<main>");
  /** The sections of <main>, in order. */
  const sections = () => [...main().querySelectorAll(":scope > section")];
  const band = (heading: string) => sections().find((section) => text(section.querySelector("h2")) === heading);

  test("is titled with the claim", () => {
    expect(home().title).toBe("carouseldeck: a carousel that lets the browser do the scrolling");
    expect(home().head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "carouseldeck is an unstyled React carousel on native CSS scroll snap: the browser scrolls, snaps and focuses, and you style every part with plain CSS.",
    );
  });

  test("runs hero, proof, the four quality sections, then the line back to deck.cool", () => {
    expect(sections().map((section) => section.className)).toEqual([
      "home-intro",
      "home-proof",
      "home-band",
      "home-band",
      "home-band",
      "home-band",
      "home-family",
    ]);
  });

  test("the hero: the version, the claim, one sentence for all three audiences, and the two calls to action", () => {
    const hero = sections()[0];
    expect(hero?.querySelector("img")?.getAttribute("src")).toBe(carouseldeck.icons.animated);
    expect(hero?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(text(hero?.querySelector("h1"))).toBe(carouseldeck.claim);
    expect([...(hero?.querySelectorAll("p") ?? [])].map(text)).toEqual([
      `carouseldeck ${version}`,
      "Compose it from a few React components, style every part with your own CSS, or hand it to your agent. The momentum, the snapping and the focus scrolling are the browser's own.",
    ]);
    expect(text(hero?.querySelector(".home-install code"))).toBe("pnpm add @carouseldeck/react");
    expect(install).toBe("pnpm add @carouseldeck/react");
    expect(links(hero)).toEqual([
      ["Read the docs", "/docs/"],
      ["See it in action ›", "/examples/"],
    ]);
  });

  // The shapes, not the values: each release of carouseldeck brings its own.
  test("reads the installed @carouseldeck/react's version and size", () => {
    expect(version).toMatch(/^\d+\.\d+$/);
    expect(size).toMatch(/^\d+\.\d\d KB$/);
  });

  // GLOSSARY.md: the "plain markdown" line waits until @carouseldeck/docs is on npm.
  test("makes no claim about markdown docs or llms.txt", () => {
    expect(main().textContent).not.toMatch(/Using an agent|markdown|llms\.txt/i);
  });

  test("the proof: the browser scrolls and carouseldeck keeps count, beside the one figure, the README's", () => {
    const proof = sections()[1];
    expect(text(proof?.querySelector("h2"))).toBe("The browser scrolls. carouseldeck keeps count.");
    expect(
      [...(proof?.querySelectorAll(".home-proof__points li") ?? [])].map((point) => [
        text(point.querySelector("h3")),
        text(point.querySelector("p")),
      ]),
    ).toEqual([
      [
        "A real scroll container",
        "Every deck is a scroll container with CSS scroll snap: touch, trackpad, wheel and keyboard move it natively, and carouseldeck adds mouse drag.",
      ],
      [
        "carouseldeck keeps count",
        "It tracks where the deck comes to rest, and Prev, Next and the dots ask the browser to scroll there.",
      ],
      ["Works with no CSS", "The quickstart is a working deck before you write a single rule."],
    ]);
    expect([...(proof?.querySelectorAll(".home-proof__figure > p") ?? [])].map(text)).toEqual([
      size,
      carouseldeck.figure.label,
      carouseldeck.figure.note,
      "Measured by pnpm compare in carouseldeck's repo, and its CI fails when the number goes stale.",
    ]);
    expect(links(proof)).toEqual([["How it is measured ›", "/docs/compare/"]]);
  });

  test("the four quality sections, in the brief's order", () => {
    expect(sections().slice(2, 6).map((section) => text(section.querySelector("h2")))).toEqual([
      "Unstyled, your look.",
      "Small, leans on the browser.",
      "Built for agents.",
      "Accessible by default.",
    ]);
  });

  describe("unstyled: one deck, two skins", () => {
    const section = () => band("Unstyled, your look.");
    const skins = () => [...(section()?.querySelectorAll(".home-skin") ?? [])];

    test("says it needs no stylesheet, any rule of yours wins, and every part has a name for your CSS", () => {
      expect(text(section()?.querySelector(".home-band__text p"))).toBe(
        "carouseldeck needs no stylesheet. Its defaults and its optional theme sit in :where(), so any rule of yours wins. Every part carries a name, like data-carouseldeck-next or data-carouseldeck-dots, for your CSS or your tokens to reach. Here is one live deck, shown twice: the markup is the same, and only the CSS changes.",
      );
    });

    test("renders the same deck twice, each in its own skin, on the server", () => {
      expect(skins().map((skin) => text(skin.querySelector("figcaption")))).toEqual(SKINS.map((skin) => skin.name));
      const stages = skins().map((skin) => present(skin.querySelector(".home-skin__stage"), "a skin's stage"));
      expect(stages.map((stage) => stage.className)).toEqual(SKINS.map((skin) => `home-skin__stage ${skin.className}`));
      const decks = stages.map((stage) => present(stage.querySelector('[aria-roledescription="carousel"]'), "a deck"));
      // Each deck is its own region, so each has its own name. Past that, the markup is the same.
      expect(decks.map((deck) => deck.getAttribute("aria-label"))).toEqual(SKINS.map((skin) => `${skin.name} deck`));
      const markup = decks.map((deck, i) => deck.outerHTML.replace(`aria-label="${SKINS[i]?.name} deck"`, ""));
      expect(markup[0]).toBe(markup[1]);
      expect([...present(decks[0], "the first deck").querySelectorAll("[data-carouseldeck-slide]")].map(text)).toEqual([
        "Momentum The browser's own.",
        "Snapping The browser's own.",
        "Focus scrolling The browser's own.",
        "The look Yours.",
      ]);
      for (const part of ["viewport", "prev", "next", "dots", "counter"]) {
        expect(decks[0]?.querySelector(`[data-carouseldeck-${part}]`), part).not.toBeNull();
      }
    });

    test("shows beside each skin the source file its CSS is compiled from, which styles it through part names", () => {
      expect(skins().map((skin) => skin.querySelector("pre code")?.textContent)).toEqual(
        SKINS.map((skin) => readFileSync(`${SITE}${skin.file}`, "utf8").trim()),
      );
      const css = stylesheet();
      for (const skin of SKINS) {
        expect(css).toContain(`.${skin.className} [data-carouseldeck-next]`);
        // Every rule is scoped to its skin, so neither sheet reaches the other deck.
        const source = readFileSync(`${SITE}${skin.file}`, "utf8");
        for (const [, list = ""] of source.matchAll(/^([^\s{}@][^{]*)\{/gm)) {
          for (const selector of list.split(",")) {
            expect(selector.trim(), skin.file).toMatch(new RegExp(`^\\.${skin.className} `));
          }
        }
      }
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

    test("links every example under the skins, as a call to action", () => {
      const more = present(section()?.querySelector(".home-skins__more"), "the link under the skins");
      expect(links(more)).toEqual([["See all examples ›", "/examples/"]]);
      expect(more.querySelector("a")?.className).toBe("home-button");
    });
  });

  test("small: native scroll snap, effects you import, and server rendering, with the README's size", () => {
    const section = band("Small, leans on the browser.");
    expect(text(section?.querySelector(".home-band__text p"))).toBe(
      `The browser already knows how to scroll. carouseldeck builds on that instead of rebuilding it, so a carousel with Prev and Next is ${size}, min+gzip, with React external.`,
    );
    expect(tiles(section)).toEqual([
      [
        "Native scroll snap",
        "Momentum, snapping and focus scrolling are the browser's own. carouseldeck tracks where the deck rests and asks the browser to move.",
      ],
      [
        "Effects you import",
        "Fade and curve each have an entry point of their own. A deck that imports neither ships none of their code.",
      ],
      [
        "Rendered on the server",
        "Slides, Prev and Next are in the HTML before any script runs, and React Server Components render the deck straight from a server file.",
      ],
    ]);
  });

  test("agents: a few named parts, typed, with mistakes that explain themselves, and the README's quickstart", () => {
    const section = band("Built for agents.");
    expect(text(section?.querySelector(".home-band__text p"))).toBe(
      "Whether you write the code or your coding agent does, carouseldeck leaves less to guess.",
    );
    expect(tiles(section)).toEqual([
      [
        "A few named parts",
        "A deck is Deck.Root, Deck.Viewport and Deck.Slide, plus the controls you pick. The quickstart below is the whole of one.",
      ],
      [
        "Typed all the way",
        "carouseldeck is written in TypeScript and ships its types, so your editor and your agent see every prop.",
      ],
      [
        "Mistakes explain themselves",
        "Pass index and defaultIndex together, or index without onIndexChange, and in development carouseldeck says what to pass instead.",
      ],
    ]);
    const code = present(section?.querySelector(".home-code pre"), "the quickstart");
    expect(code.getAttribute("tabindex")).toBe("0");
    expect(code.classList.contains("github-dark-default")).toBe(true);
    expect(code.textContent).toMatch(/^import \* as Deck from '@carouseldeck\/react';\n/);
  });

  // Only the claims a test in decks/carouseldeck proves: carouseldeck's rows of #46's PR body, word for word.
  test("accessible: carouseldeck's five tested claims", () => {
    const section = band("Accessible by default.");
    expect(text(section?.querySelector(".home-band__text p"))).toBe(
      "carouseldeck takes care of the keyboard, focus and screen readers for you. Each line below is backed by a test in carouseldeck's own repo.",
    );
    expect(tiles(section)).toEqual([
      ["Named for screen readers", 'A labelled carousel region, each slide a group labelled "n of m".'],
      ["Ready for the keyboard", "Arrow keys move the focused deck, and every dot is a button the keyboard reaches."],
      ["Focus brings it into view", "Tab into an off-screen slide and it scrolls into view."],
      ["Announced politely", "A polite live region announces your moves, never autoplay's."],
      ["Calm under reduced motion", "Under reduced motion, moves jump instead of gliding, and autoplay starts stopped."],
    ]);
    expect(links(present(section, "the section"))).toEqual([["Try the examples ›", "/examples/"]]);
  });

  test("closes with one line back to deck.cool", () => {
    const family = sections()[6];
    expect(text(family?.querySelector("p"))).toBe(
      "carouseldeck is part of deck.cool, a family of unstyled React packages that look like you and work like the browser. Meet the family ›",
    );
    expect(links(present(family, "the line"))).toEqual([["Meet the family ›", umbrella.url]]);
  });
});

test("no page uses an em dash", () => {
  // Docs-package pages: their em dashes are upstream's (pedrosousa13/slidedeck#143).
  expect(pagesWithEmDashes(SITE, DOCS_NAV.map(({ href }) => href))).toEqual([]);
});

describe("the Examples page", () => {
  test("is titled as before", () => {
    expect(examples().title).toBe("Examples: decks built with carouseldeck");
  });

  test("shows each example in order, its deck rendered on the server", () => {
    const sections = [...examples().querySelectorAll("main section.example")];
    expect(sections.map((section) => text(section.querySelector("h2")))).toEqual([
      "Product gallery",
      "Hero banner",
      "Testimonials",
      "Stories",
      "Right to left",
      "Cover flow",
    ]);
    expect(sections.map((section) => section.querySelector('[aria-roledescription="carousel"]')?.getAttribute("aria-label"))).toEqual([
      "Product photos",
      "Trips",
      "Customer reviews",
      "Travel stories",
      "وجهات للسفر",
      "Albums",
    ]);
  });

  test("credits every photo it shows, linking its page on Unsplash", () => {
    const credits = links(present(examples().querySelector(".examples-credits"), "the credits"));
    expect(credits.length).toBeGreaterThan(10);
    for (const [, href] of credits) expect(href).toMatch(/^https:\/\/unsplash\.com\/photos\/[\w-]+$/);
  });
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
    "%s links nothing on github.com but carouseldeck's repo",
    (file) => {
      const html = readFileSync(`${OUT}/${file}`, "utf8");
      for (const [, href] of html.matchAll(/href="(https?:\/\/(?:[^/"]+\.)?github\.com[^"]*)"/gi)) {
        expect(href).toBe(REPOSITORY);
      }
    },
  );
});

test("the search index holds the site's pages and every docs page, within what one keystroke may fetch", () => {
  const index = `${OUT}/search/en/`;
  const documents = JSON.parse(readFileSync(`${index}documents.json`, "utf8")) as { path: string; title?: string }[];
  expect(documents.map(({ path }) => path).sort()).toEqual([...ALL_PATHS].sort());
  const bytes = readdirSync(index).reduce((total, file) => total + statSync(`${index}${file}`).size, 0);
  expect(bytes).toBeLessThanOrEqual(QUERY_CAP);
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
    // A hashed name (`name-AbCd1234.js`) outside /assets/ would need its own rule (docs/deploy.md).
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

describe("the docs, from @carouseldeck/docs", () => {
  /** The demos a built page renders, by name, in order. */
  const demosOn = (doc: Document) =>
    [...doc.querySelectorAll("article fw-island")].map((island) => island.getAttribute("data-fw-component")?.replace(/^docsDemo:/, ""));

  // carouseldeck's READMEs link its site's /docs/.
  test("serves /docs/, the docs' first page", () => {
    expect(DOCS_NAV[0]?.href).toBe("/docs/");
    expect(existsSync(`${OUT}/docs/index.html`)).toBe(true);
  });

  test.each(DOCS_NAV)("$href renders with each demo it marks, in order, rendered on the server", ({ href, demos }) => {
    const doc = parse(`${href.slice(1)}index.html`);
    expect(demosOn(doc)).toEqual(demos);
    for (const island of doc.querySelectorAll("article fw-island")) {
      expect(island.querySelector('[aria-roledescription="carousel"] [data-carouseldeck-slide]'), island.outerHTML.slice(0, 120)).not.toBeNull();
    }
  });

  // The layout and the demos are the site's own words, unlike the prose they frame. A demo
  // writes some only once it runs, so their source is read.
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
    expect(doc.title).toBe("Install · carouseldeck docs");
    expect(text(doc.querySelector("article h1"))).toBe("Install");
  });

  test("a page with no demo ships the search island alone, and every such page ships the same", () => {
    const plain = DOCS_NAV.filter(({ demos }) => demos.length === 0);
    expect(plain.length).toBeGreaterThan(0);
    for (const { href } of plain) {
      expect([...parse(`${href.slice(1)}index.html`).querySelectorAll("fw-island")].map((island) => island.getAttribute("data-fw-component"))).toEqual(["search"]);
    }
    const sizes = new Set(plain.map(({ href }) => budget.find((each) => each.path === href)?.actual));
    expect(sizes.size).toBe(1);
  });
});
