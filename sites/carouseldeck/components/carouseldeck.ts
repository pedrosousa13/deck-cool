import { decks, type Deck } from "@deck-cool/brand/decks";

function find(): Deck {
  const deck = decks.find(({ name }) => name === "slidedeck");
  if (deck === undefined) throw new Error("The brand's decks module has no slidedeck");
  return deck;
}

/** slidedeck, as the brand kit describes it: its icons and its accent. */
export const slidedeck = find();
