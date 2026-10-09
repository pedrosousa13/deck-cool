import { Window, type Document, type Element } from "happy-dom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { decks, umbrella } from "@deck-cool/brand/decks";
import { GITHUB, NPM } from "../components/links.ts";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";
import { headersFor, parseHeaders } from "./serve-site.ts";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const BRAND = fileURLToPath(new URL("../../../packages/brand/public/", import.meta.url));

interface BudgetReport {
  pages: { path: string; actual: number }[];
}

test("every page ships 0 B of JavaScript", () => {
  const report = JSON.parse(
    readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8"),
  ) as BudgetReport;

  expect(report.pages.map((page) => page.path)).toContain("/");
  for (const page of report.pages) {
    expect(page, page.path).toMatchObject({ actual: 0 });
  }
});

test("the home page links brand.css and the deck-cool icons, and serves them", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  for (const link of [
    '<link rel="stylesheet" href="/brand.css"/>',
    '<link rel="icon" type="image/svg+xml" href="/icons/deck-cool/still.svg"/>',
    '<link rel="apple-touch-icon" href="/icons/deck-cool/apple-touch-icon.png"/>',
  ]) {
    expect(html).toContain(link);
  }
  for (const path of [
    "brand.css",
    "icons/deck-cool/still.svg",
    "icons/deck-cool/apple-touch-icon.png",
  ]) {
    const served = readFileSync(`${SITE}site/${path}`);
    expect(served.equals(readFileSync(`${BRAND}${path}`)), path).toBe(true);
  }
});

test("the home page opens with the Family bar, after the stylesheets it needs", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  const at = (needle: string) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };
  const header = at('<header class="family-bar"');
  expect(at('<link rel="stylesheet" href="/brand.css"/>')).toBeLessThan(header);
  expect(at('<link rel="stylesheet" href="/family-bar.css"/>')).toBeLessThan(header);
  // Outside <main>, so the header is the page's banner landmark.
  expect(header).toBeLessThan(at("<main>"));
  // The bar's deck icons sit in a closed <details>, so nothing fetches them
  // early. (React preloads the page's own images, which the page shows.)
  for (const deck of decks) expect(html).not.toContain(`rel="preload" as="image" href="${deck.icons.still}"`);

  const served = readFileSync(`${SITE}site/family-bar.css`);
  expect(served.equals(readFileSync(`${BRAND}family-bar.css`))).toBe(true);
});

interface Manifest {
  files: { path: string }[];
  routing: { trees: { notFound: unknown }[] };
}

const manifest = JSON.parse(readFileSync(`${SITE}site/manifest.json`, "utf8")) as Manifest;
const rules = parseHeaders(readFileSync(`${SITE}site/_headers`, "utf8"));
/** Every path the Worker serves: the home page, and each file but the ones wrangler reads as configuration. */
const served = ["/", ...manifest.files.map((file) => file.path).filter((path) => !/^\/_(headers|redirects)$/.test(path))];

/** The headers every response carries, page or file. */
const EVERY_RESPONSE = {
  [CONTENT_SECURITY_POLICY.name]: CONTENT_SECURITY_POLICY.value,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

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

test("no file is cached as immutable, because the build writes no content-hashed name", () => {
  // A content-hashed name, as Pagedeck writes one: `name.AbCd1234.css`. When a
  // build first writes one, its directory gets a rule in pagedeck.config.ts
  // adding Cache-Control: public, max-age=31536000, immutable, and this test
  // changes to expect it there and nowhere else.
  for (const { path } of manifest.files) expect(path).not.toMatch(/[.-][A-Za-z0-9_-]{8}\.[a-z0-9]+$/);
  for (const path of served) expect(headersFor(rules, path).get("Cache-Control"), path).toBeUndefined();
});

test(".assetsignore keeps the deploy manifest, the deploy directory and the fallback 404 out of the upload", () => {
  const ignored = readFileSync(`${SITE}site/.assetsignore`, "utf8")
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"));
  expect(ignored).toEqual(["/manifest.json", "/.pagedeck", "/404.html"]);
  // The 404 page is only the adapter's fallback: the site declares none, which
  // is why wrangler.jsonc answers a missing path with a bare 404.
  expect(manifest.routing.trees.map((tree) => tree.notFound ?? undefined)).toEqual([undefined]);
  // A request for the manifest is proxied to the 404 page, which is not
  // uploaded, so it answers 404.
  const redirects = readFileSync(`${SITE}site/_redirects`, "utf8");
  expect(redirects).toContain("/manifest.json /404.html 200\n");
  expect(redirects).toContain("/.pagedeck/* /404.html 200\n");
});

const window = new Window();

function home(): Document {
  return new window.DOMParser().parseFromString(readFileSync(`${SITE}site/index.html`, "utf8"), "text/html");
}

/** Narrows away `null` and `undefined`, failing the test when the value is missing. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}

/** The element's text, with runs of white space as one space. */
function text(element: Element | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim();
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

test("the home page is titled as on the board, and links umbrella.css", () => {
  const html = readFileSync(`${SITE}site/index.html`, "utf8");
  expect(home().title).toBe("deck.cool: unstyled React packages");
  expect(html).toContain('<link rel="stylesheet" href="/umbrella.css"/>');
  const served = readFileSync(`${SITE}site/umbrella.css`);
  expect(served.equals(readFileSync(`${BRAND}umbrella.css`))).toBe(true);
});

test("the Family bar links each deck's card, and GitHub", () => {
  const bar = present(home().querySelector(".family-bar__links"), "the bar's links");
  expect(links(bar)).toEqual([
    ...decks.map((deck): [string, string] => [deck.name, `#${deck.name}`]),
    ["GitHub", GITHUB],
  ]);
});

test("the hero shows the fanned cards, the headline, the line under it and two links", () => {
  const hero = present(home().querySelector("main > section:first-of-type"), "the hero");
  expect(hero?.querySelector("img")?.getAttribute("src")).toBe(umbrella.icons.animated);
  expect(hero?.querySelector("img")?.getAttribute("alt")).toBe("");
  expect(text(hero?.querySelector("h1"))).toBe("React, unstyled. One deck at a time.");
  expect(text(hero?.querySelector("p"))).toBe(
    "Small React packages that lean on what the browser already does. None of them ships a stylesheet. The look is yours.",
  );
  expect(links(hero)).toEqual([
    ["Browse the decks", "#decks"],
    ["GitHub ›", GITHUB],
  ]);
  expect(home().getElementById("decks")).not.toBeNull();
});

describe("each deck's card", () => {
  test("there is one per deck, in the decks module's order", () => {
    const cards = [...home().querySelectorAll("#decks article")];
    expect(cards.map((card) => card.id)).toEqual(decks.map((deck) => deck.name));
  });

  test.each(decks)("$name's card holds its icon, copy, install command and figures", (deck) => {
    const card = home().getElementById(deck.name);
    expect(card?.querySelector("img")?.getAttribute("src")).toBe(deck.icons.animated);
    expect(card?.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(text(card?.querySelector("h2"))).toBe(deck.name);
    const paragraphs = [...(card?.querySelectorAll("p") ?? [])].map(text);
    expect(paragraphs).toEqual([deck.kind, deck.claim, deck.description]);
    expect(text(card?.querySelector("code"))).toBe(deck.install);
    const figures = [...(card?.querySelectorAll("li") ?? [])].map((li) => [
      text(li.firstElementChild),
      text(li.lastElementChild),
    ]);
    expect(figures).toEqual(deck.figures.map(({ value, label }) => [value, label]));
  });

  test.each(decks)("$name's card links to its site", (deck) => {
    expect(links(present(home().getElementById(deck.name), deck.name))).toEqual([[`Visit ${deck.name} ›`, deck.url]]);
  });
});

test("the band says no stylesheet ships, with a part selector to style", () => {
  const band = home().querySelector("main > section:last-of-type");
  expect(text(band?.querySelector("h2"))).toBe("No stylesheet ships.");
  expect(text(band?.querySelector("p"))).toBe(
    "Every deck renders plain markup with stable part names. You style it with your own CSS, in your own design system.",
  );
  expect(band?.querySelector("pre")?.textContent).toBe("[data-playdeck-part='play-button'] {\n  border-radius: 999px;\n}");
});

test("the footer follows <main>, with deck.cool, the licence, GitHub and npm", () => {
  const footer = present(home().querySelector("main + footer"), "the footer");
  expect([...footer.querySelectorAll("span, a")].map(text)).toEqual(["deck.cool", "MIT licensed", "GitHub", "npm"]);
  expect(links(footer)).toEqual([
    ["GitHub", GITHUB],
    ["npm", NPM],
  ]);
});
