import { decks, type Deck } from "@deck-cool/brand/decks";

function find(): Deck {
  const deck = decks.find(({ name }) => name === "carouseldeck");
  if (deck === undefined) throw new Error("The brand's decks module has no carouseldeck");
  return deck;
}

/** carouseldeck, as the brand kit describes it: its icons and its accent. */
export const carouseldeck = find();
