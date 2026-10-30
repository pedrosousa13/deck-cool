import { Window, type Document, type Element } from "happy-dom";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { decks, umbrella } from "@deck-cool/brand/decks";
import { everyResponse, pagesWithEmDashes, present, readManifest, text } from "@deck-cool/site-kit/build-test";
import { headersFor, parseHeaders } from "@deck-cool/site-kit/serve-site";
import { NPM } from "../components/links.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { figureValue } from "./facts.ts";

const SITE = fileURLToPath(new URL("..", import.meta.url));
// carouseldeck's built site, which the cross-site test below reads. The root
// vitest.config.ts's global setup builds every site first, so this file needs
// the whole workspace's run, not deck.cool's build alone.
const CAROUSELDECK_SITE = fileURLToPath(new URL("../../carouseldeck/", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));

test("no page uses an em dash", () => {
  expect(pagesWithEmDashes(SITE)).toEqual([]);
});

test("the home page's <head> links the deck-cool icons and one hashed stylesheet, and <body> no icon or stylesheet", () => {
  const doc = home();
  // React writes a preload for each image the page shows, where the page's
  // content starts. Pagedeck leaves those in <body>, where a preload is valid.
  const shown = new Set([...doc.body.querySelectorAll("img")].map((img) => img.getAttribute("src")));
  for (const link of doc.body.querySelectorAll("link")) {
    expect(link.outerHTML).toMatch(/^<link rel="preload" as="image" href="[^"]+">$/);
    expect(shown.has(link.getAttribute("href")), link.outerHTML).toBe(true);
  }
  const head = [...doc.head.querySelectorAll("link")].map((link) => [link.getAttribute("rel"), link.getAttribute("href")]);
  expect(head).toHaveLength(3);
  expect(head).toEqual(
    expect.arrayContaining([
      ["icon", umbrella.icons.still],
      ["apple-touch-icon", umbrella.icons.appleTouch],
      ["stylesheet", expect.stringMatching(/^\/assets\/[^/]+\.css$/)],
    ]),
  );
  for (const path of [umbrella.icons.still, umbrella.icons.appleTouch]) {
    const served = readFileSync(`${SITE}site${path}`);
    expect(served.equals(readFileSync(`${BRAND}${path.slice(1)}`)), path).toBe(true);
  }
});

/** The text of the one stylesheet the home page links. */
function stylesheet(): string {
  const href = present(home().head.querySelector('link[rel="stylesheet"]')?.getAttribute("href"), "the stylesheet link");
  return readFileSync(`${SITE}site${href}`, "utf8");
}

test("the stylesheet holds brand.css, then family-bar.css, then umbrella.css", () => {
  const css = stylesheet();
  const brand = css.indexOf("--ground-page");
  const bar = css.indexOf(".family-bar");
  const home = css.indexOf(".hero");
  expect(brand).toBeGreaterThanOrEqual(0);
  expect(brand).toBeLessThan(bar);
  expect(css.lastIndexOf(".family-bar")).toBeLessThan(home);
});

test("the site serves no stylesheet but the hashed one", () => {
  const sheets = manifest.files.filter((path) => path.endsWith(".css"));
  expect(sheets).toHaveLength(1);
  expect(sheets[0]).toMatch(/^\/assets\//);
});

test("the home page opens with the Family bar", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  const at = (needle: string) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };
  // Outside <main>, so the header is the page's banner landmark.
  expect(at('<header class="family-bar"')).toBeLessThan(at("<main>"));
  // The bar's deck icons sit in a closed popover, so nothing fetches them
  // early. (React preloads the page's own images, which the page shows.)
  for (const deck of decks) expect(html).not.toContain(`rel="preload" as="image" href="${deck.icons.still}"`);
});

const manifest = readManifest(SITE);
const rules = parseHeaders(readFileSync(`${SITE}site/_headers`, "utf8"));
/** Every path the Worker serves: the home page, and each file but the ones wrangler reads as configuration. */
const served = ["/", ...manifest.files.filter((path) => !/^\/_(headers|redirects)$/.test(path))];

const EVERY_RESPONSE = everyResponse(CONTENT_SECURITY_POLICY);

test("_headers sends the CSP, the security headers and HSTS on the home page and every file", () => {
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
  expect(assets).not.toHaveLength(0);
  // A hashed name (`name-AbCd1234.css`) outside /assets/ would need its own rule (docs/deploy.md).
  const hashed = /[.-][A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
  for (const path of served) expect(hashed.test(path), path).toBe(path.startsWith("/assets/"));
  for (const path of served) {
    expect(headersFor(rules, path).get("Cache-Control"), path).toBe(
      path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : undefined,
    );
  }
});

test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
  const ignored = readFileSync(`${SITE}site/.assetsignore`, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"));
  expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
  // No declared 404 page, so /404.html is only the adapter's fallback.
  expect(manifest.notFound.map((page) => page ?? undefined)).toEqual([undefined]);
  // Proxied to the 404 page, which is not uploaded, so they answer 404.
  const redirects = readFileSync(`${SITE}site/_redirects`, "utf8");
  expect(redirects).toContain("/manifest.json /404.html 200\n");
  expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
});

test("the Worker serves site/ at deck.cool alone, as a custom domain, with no 404 page", () => {
  // wrangler.jsonc allows comments; it holds whole-line ones only.
  const source = readFileSync(`${SITE}wrangler.jsonc`, "utf8").replace(/^\s*\/\/.*$/gm, "");
  expect(JSON.parse(source)).toMatchObject({
    workers_dev: false,
    routes: [{ pattern: "deck.cool", custom_domain: true }],
    assets: { directory: "./site", html_handling: "auto-trailing-slash", not_found_handling: "none" },
  });
});

const window = new Window();

function home(): Document {
  return new window.DOMParser().parseFromString(readFileSync(`${SITE}site/index.html`, "utf8"), "text/html");
}

function links(scope: Element | Document): [string | undefined, string | null][] {
  return [...scope.querySelectorAll("a")].map((a) => [text(a), a.getAttribute("href")]);
}

test("the home page carries no script, no <style> and no inline style or handler", () => {
  const doc = home();
  expect(doc.querySelectorAll("script, style, [style]")).toHaveLength(0);
  for (const element of doc.querySelectorAll("*")) {
    for (const { name } of element.attributes) expect(name, element.tagName).not.toMatch(/^on/);
  }
});

test("the home page is titled as on the board", () => {
  expect(home().title).toBe("deck.cool: unstyled React packages");
});

test("the Family bar links each deck's card", () => {
  const bar = present(home().querySelector(".family-bar__links"), "the bar's links");
  expect(links(bar)).toEqual(decks.map((deck): [string, string] => [deck.name, `#${deck.name}`]));
});

// GLOSSARY.md: the umbrella site links no GitHub profile.
test.each(readdirSync(`${SITE}site`).filter((file) => file.endsWith(".html")))("%s links nothing on github.com", (file) => {
  const html = readFileSync(`${SITE}site/${file}`, "utf8");
  expect(html).not.toMatch(/href="https?:\/\/([^/"]+\.)?github\.com/i);
});

test("the hero shows the fanned cards, the headline, the line under it and a link to the decks", () => {
  const hero = present(home().querySelector("main > section:first-of-type"), "the hero");
  expect(hero?.querySelector("img")?.getAttribute("src")).toBe(umbrella.icons.animated);
  expect(hero?.querySelector("img")?.getAttribute("alt")).toBe("");
  expect(text(hero?.querySelector("h1"))).toBe("Built on native elements. Works with the browser, not against it.");
  expect(text(hero?.querySelector("p"))).toBe(
    "React packages for carousels, video, drawers and sites, built on the browser's own scroll snap, <video> and <dialog>. The browser does the heavy lifting, so each deck ships little JavaScript, and none on a page with nothing interactive. No styles ship either: bring your tokens, your CSS, or your agent.",
  );
  expect(links(hero)).toEqual([["Browse the decks", "#decks"]]);
  expect(home().getElementById("decks")).not.toBeNull();
});

describe("each deck's card", () => {
  test("there is one per deck, in the decks module's order", () => {
    const cards = [...home().querySelectorAll("#decks article")];
    expect(cards.map((card) => card.id)).toEqual(decks.map((deck) => deck.name));
  });

  test.each(decks)("$name's card holds its icon, copy, install command and one figure", (deck) => {
    const card = home().getElementById(deck.name);
    expect(card?.querySelector("img")?.getAttribute("src")).toBe(deck.icons.animated);
    expect(card?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(text(card?.querySelector("h2"))).toBe(deck.name);
    const paragraphs = [...(card?.querySelectorAll(".card__text p") ?? [])].map(text);
    expect(paragraphs).toEqual([deck.kind, deck.claim, deck.description]);
    expect(text(card?.querySelector("code"))).toBe(deck.install);
    const figure = [...(card?.querySelectorAll(".card__figure > p") ?? [])].map(text);
    const { label, note } = deck.figure;
    const value = figureValue(deck);
    expect(figure).toEqual(note === undefined ? [value, label] : [value, label, note]);
  });

  // The format, not the value: a release brings a new size, and both pages follow it.
  test("carouseldeck's card shows the size carouseldeck's home page shows, from its README", () => {
    const card = text(home().querySelector("#carouseldeck .card__figure > p"));
    expect(card).toMatch(/^\d+(\.\d+)? (B|KB|kB|MB)$/);
    const carouseldeckHome = new window.DOMParser().parseFromString(
      readFileSync(`${CAROUSELDECK_SITE}site/index.html`, "utf8"),
      "text/html",
    );
    expect(text(carouseldeckHome.querySelector(".home-proof__figure > p"))).toBe(card);
  });

  test.each(decks)("$name's card links to its site", (deck) => {
    expect(links(present(home().getElementById(deck.name), deck.name))).toEqual([[`Visit ${deck.name} ›`, deck.url]]);
  });
});

/** Each quality section's tiles, as [deck name in the heading, heading, text or list items]. */
type Tile = [string | undefined, string | undefined, (string | undefined)[]];

function tiles(section: Element | undefined): Tile[] {
  return [...(section?.querySelectorAll(".tile") ?? [])].map((tile) => [
    text(tile.querySelector("h3 .tile__deck")),
    text(tile.querySelector("h3")),
    [...tile.querySelectorAll(".tile__body, li")].map(text),
  ]);
}

describe("the four quality sections", () => {
  /** The sections after the cards, in order. */
  const sections = () => [...home().querySelectorAll("main > section.band")];

  test("follow the cards, in the brief's order", () => {
    expect(home().querySelector("#decks ~ section.band")).not.toBeNull();
    expect(sections().map((section) => text(section.querySelector("h2")))).toEqual([
      "Unstyled, your look.",
      "Small, leans on the browser.",
      "Built for agents.",
      "Accessible by default.",
    ]);
  });

  test("unstyled: plain markup with named parts, and a part selector to style", () => {
    const section = sections()[0];
    expect(text(section?.querySelector("p"))).toBe(
      "Every deck renders plain HTML and needs no stylesheet, so there is no theme to fight. carouseldeck and playdeck give every part a stable name, and pagedeck renders your own components. Point your CSS or your tokens at the markup, and the look is yours.",
    );
    expect(section?.querySelector("pre")?.textContent).toBe("[data-playdeck-part='play-button'] {\n  border-radius: 999px;\n}");
  });

  test("small: one way each deck leans on the browser", () => {
    const section = sections()[1];
    expect(text(section?.querySelector("p"))).toBe(
      "The browser already knows how to scroll, play video and show a page. The decks build on what it does instead of rebuilding it, so there is less code to ship.",
    );
    expect(tiles(section)).toEqual([
      ["carouseldeck", "carouseldeck Native scrolling", ["Momentum, snapping and keyboard scrolling come from CSS scroll snap in a real scroll container."]],
      ["playdeck", "playdeck Native video", ["Files and HLS streams play in the browser's own video element."]],
      ["pagedeck", "pagedeck HTML first", ["Pages render to HTML when the site builds. A page with nothing interactive ships no JavaScript at all."]],
    ]);
  });

  test("agents: typed APIs, tested examples and predictable markup, and nothing about llms.txt", () => {
    const section = sections()[2];
    expect(text(section?.querySelector("p"))).toBe(
      "Whether you write the code or your coding agent does, the decks leave less to guess.",
    );
    expect(tiles(section)).toEqual([
      [undefined, "Small typed APIs", ["Every deck is written in TypeScript and ships its types, so your editor and your agent see every prop."]],
      [undefined, "Tested examples", ["Each deck's CI checks its examples, so the code you copy from the docs compiles."]],
      [undefined, "Predictable markup", ["carouseldeck and playdeck name every part, and in pagedeck the markup is your own, so an agent never has to guess."]],
    ]);
    expect(section?.textContent).not.toMatch(/llms\.txt/i);
  });

  test("accessible: each deck's claims, every one with a test in its repo (listed in the PR for #45)", () => {
    const section = sections()[3];
    expect(text(section?.querySelector("p"))).toBe(
      "The decks take care of the keyboard, focus and screen readers for you. Each line below is backed by a test in that deck's own repo.",
    );
    expect(tiles(section)).toEqual([
      [
        undefined,
        "carouseldeck",
        [
          'A labelled carousel region, each slide a group labelled "n of m".',
          "Arrow keys move the focused deck, and every dot is a button the keyboard reaches.",
          "Tab into an off-screen slide and it scrolls into view.",
          "A polite live region announces your moves, never autoplay's.",
          "Under reduced motion, moves jump instead of gliding, and autoplay starts stopped.",
        ],
      ],
      [
        undefined,
        "playdeck",
        [
          "Every control is reachable by Tab, in order.",
          "Keyboard shortcuts mute, pause and seek the video itself.",
          "The settings menu takes focus when it opens and gives it back on Escape.",
          "Live regions announce changes of state, never the ticking clock.",
          "axe finds no violations in any state of the reference player.",
          "A viewer who asks for reduced motion gets no autoplay, unless you opt out.",
        ],
      ],
      [
        undefined,
        "pagedeck",
        [
          "Every page gets exactly one main landmark. A component that renders a second fails the build.",
          "Search is a combobox: arrow keys walk the results, Enter follows one, Escape closes them.",
          "Text typed into search before it hydrates is kept, caret and all.",
        ],
      ],
    ]);
  });
});

test("the footer follows <main>, with deck.cool, the licence and npm", () => {
  const footer = present(home().querySelector("main + footer"), "the footer");
  expect([...footer.querySelectorAll("span, a")].map(text)).toEqual(["deck.cool", "MIT licensed", "npm"]);
  expect(links(footer)).toEqual([["npm", NPM]]);
});
