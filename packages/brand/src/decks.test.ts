import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { decks, umbrella } from "./decks.ts";

const PUBLIC = new URL("../public/", import.meta.url);

test("the decks are exactly slidedeck, playdeck and pagedeck", () => {
  expect(decks.map((deck) => deck.name)).toEqual([
    "slidedeck",
    "playdeck",
    "pagedeck",
  ]);
});

test("each deck links to its site", () => {
  expect(decks.map((deck) => deck.url)).toEqual([
    "https://slide.deck.cool",
    "https://playdeck.video",
    "https://page.deck.cool",
  ]);
});

test.each([umbrella, ...decks])("$name's icon paths name files the package serves", ({ icons }) => {
  for (const path of Object.values(icons)) {
    expect(path).toMatch(/^\//);
    expect(existsSync(new URL(`.${path}`, PUBLIC)), path).toBe(true);
  }
});
