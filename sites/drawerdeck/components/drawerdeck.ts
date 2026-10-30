import { decks, type Deck } from "@deck-cool/brand/decks";

function find(): Deck {
  const deck = decks.find(({ name }) => name === "drawerdeck");
  if (deck === undefined) throw new Error("The brand's decks module has no drawerdeck");
  return deck;
}

/** drawerdeck, as the brand kit describes it: its icons and its accent. */
export const drawerdeck = find();
