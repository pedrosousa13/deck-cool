import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decks, umbrella } from "./decks.ts";

const PUBLIC = new URL("../public/", import.meta.url);

test("the decks are exactly carouseldeck, playdeck and pagedeck", () => {
  expect(decks.map((deck) => deck.name)).toEqual([
    "carouseldeck",
    "playdeck",
    "pagedeck",
  ]);
});

test("each deck links to its site", () => {
  expect(decks.map((deck) => deck.url)).toEqual([
    "https://carousel.deck.cool",
    "https://play.deck.cool",
    "https://page.deck.cool",
  ]);
});

test.each([umbrella, ...decks])("$name's icon paths name files the package serves", ({ icons }) => {
  for (const path of Object.values(icons)) {
    expect(path).toMatch(/^\//);
    expect(existsSync(new URL(`.${path}`, PUBLIC)), path).toBe(true);
  }
});

// The umbrella board's copy, taken from each deck's live site on 2026-10-08.
// The board keeps it in a `const DECKS = [...]` literal; read it from there.
interface BoardDeck {
  name: string;
  kind: string;
  line: string;
  body: string;
  install: string;
  facts: [[string, string], [string, string], [string, string]];
}

const isString = (value: unknown): value is string => typeof value === "string";
const isPair = (value: unknown): value is [string, string] =>
  Array.isArray(value) && value.length === 2 && value.every(isString);

function isBoardDeck(value: unknown): value is BoardDeck {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  const { name, kind, line, body, install, facts } = record;
  return (
    [name, kind, line, body, install].every(isString) &&
    Array.isArray(facts) &&
    facts.length === 3 &&
    facts.every(isPair)
  );
}

function readBoardDecks(literal: string | undefined): BoardDeck[] {
  const value: unknown = new Function(`return ${String(literal)}`)();
  if (!Array.isArray(value) || !value.every(isBoardDeck)) {
    throw new Error("Main.dc.html's DECKS is not a list of decks with name, kind, line, body, install and three facts");
  }
  return value;
}
const board = readFileSync(new URL("../../../design/canvas/Main.dc.html", import.meta.url), "utf8");
const literal = /const DECKS = (\[[\s\S]*?\]);\n/.exec(board)?.[1];
// The board is history (design/), drawn before slidedeck was renamed
// carouseldeck (#105): read its slidedeck as carouseldeck.
const boardDecks = readBoardDecks(literal).map((deck) =>
  deck.name === "slidedeck"
    ? { ...deck, name: "carouseldeck", install: deck.install.replace("@slidedeck/", "@carouseldeck/") }
    : deck,
);

test("the board lists the same decks, in the same order", () => {
  expect(boardDecks.map((deck) => deck.name)).toEqual(decks.map((deck) => deck.name));
});

// The board shows three figures per deck. #45 cut them to one, so the figure
// is checked below instead.
test.each(decks)("$name's card copy is the board's, word for word", (deck) => {
  const copy = boardDecks.find((each) => each.name === deck.name);
  expect(copy).toBeDefined();
  expect({
    kind: deck.kind,
    claim: deck.claim,
    description: deck.description,
    install: deck.install,
  }).toEqual({
    kind: copy?.kind,
    claim: copy?.line,
    description: copy?.body,
    install: copy?.install,
  });
});

// GLOSSARY.md's "One figure per deck". carouseldeck's has no value but a source:
// each site reads its size from @carouseldeck/react's README when it builds.
test("each deck has one figure", () => {
  expect(Object.fromEntries(decks.map((deck) => [deck.name, deck.figure]))).toEqual({
    carouseldeck: { source: "carouseldeck-readme", label: "for a carousel with Prev and Next", note: "min+gzip, React external" },
    playdeck: { value: "0", label: "requests to YouTube or Vimeo before play" },
    pagedeck: { value: "0 B", label: "of JavaScript on a page with nothing interactive" },
  });
});
