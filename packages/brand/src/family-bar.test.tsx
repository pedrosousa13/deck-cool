// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { decks, umbrella } from "./decks.ts";
import { FamilyBar } from "./family-bar.tsx";

/** Narrows away `undefined` and `null`, failing the test when the value is missing. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}

const slidedeck = present(decks.find((deck) => deck.name === "slidedeck"), "slidedeck");
const links = [
  { label: "Docs", href: "/docs" },
  { label: "GitHub", href: "https://github.com/example/slidedeck" },
];

// A <template>'s content is inert, so the DOM fetches no stylesheet or image.
function render(element: React.ReactElement): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(element);
  return template.content;
}

describe("the Family bar", () => {
  test("links no stylesheet: a site loads family-bar.css through build.css", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    expect(doc.querySelector("link")).toBeNull();
    expect(doc.firstElementChild?.tagName).toBe("HEADER");
  });

  test("the switcher is a button, labelled Switch deck, that toggles an auto popover", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    expect(doc.querySelector("details, summary")).toBeNull();
    const button = present(doc.querySelector("header button[popovertarget]"), "the switcher's button");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Switch deck");
    expect(button.querySelector("svg")).not.toBeNull();
    const panel = present(doc.getElementById(button.getAttribute("popovertarget") ?? ""), "the panel");
    expect(panel.getAttribute("popover")).toBe("auto");
    // Right after the button, so Tab moves from the button into the panel.
    expect(button.nextElementSibling).toBe(panel);
  });

  test("the panel links every deck with its still icon, name and kind", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    const tiles = [...doc.querySelectorAll("header [popover] a")];
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual(decks.map((deck) => deck.url));
    tiles.forEach((tile, at) => {
      const deck = present(decks[at], `deck ${at}`);
      expect(tile.querySelector("img")?.getAttribute("src")).toBe(deck.icons.still);
      expect(tile.textContent).toContain(deck.name);
      expect(tile.textContent).toContain(deck.kind);
    });
  });

  test("only the current deck is marked aria-current", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    const current = [...doc.querySelectorAll('[aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe(slidedeck.url);
  });

  test("on a deck's site the bar names the deck after a slash and carries its accent", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    expect(doc.querySelector("header")?.dataset.deck).toBe("slidedeck");
    expect(doc.querySelector("header nav")?.textContent).toContain("/slidedeck");
  });

  test("on the umbrella site no deck is current and no slash shows", () => {
    const doc = render(<FamilyBar current={umbrella} links={[]} />);
    expect(doc.querySelectorAll("[aria-current]")).toHaveLength(0);
    expect(doc.querySelector("header")?.dataset.deck).toBeUndefined();
    expect(doc.querySelector("header nav")?.textContent).not.toContain("/");
    expect(doc.querySelector("header nav")?.textContent).toContain("deck.cool");
  });

  test("renders the site's own links", () => {
    const doc = render(<FamilyBar current={slidedeck} links={links} />);
    for (const { label, href } of links) {
      const link = doc.querySelector(`header nav a[href="${href}"]`);
      expect(link?.textContent).toBe(label);
    }
  });

  test("renders the Install pill only when given", () => {
    const without = render(<FamilyBar current={slidedeck} links={links} />);
    expect(without.textContent).not.toContain("Install");

    const withInstall = render(<FamilyBar current={slidedeck} links={links} install="/docs/install" />);
    const pills = [...withInstall.querySelectorAll("header nav a")].filter((a) => a.textContent === "Install");
    expect(pills).toHaveLength(1);
    expect(pills[0]?.getAttribute("href")).toBe("/docs/install");
  });
});
