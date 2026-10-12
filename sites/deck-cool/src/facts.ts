// What the home page reads about the decks when the site builds. Never
// retyped: a new release changes the page on the next build.
import type { Deck } from "@deck-cool/brand/decks";
import { carouseldeckSize, readCarouseldeckRelease } from "@deck-cool/site-kit/carouseldeck-readme";

/**
 * carouseldeck's min+gzip size, from its README at its latest release tag (ADR
 * 0002): the figure carouseldeck's home page shows.
 */
const size = carouseldeckSize(readCarouseldeckRelease(new URL("../", import.meta.url)).readme);

/** The figure the deck's card shows: the decks module's, or carouseldeck's size from its README. */
export function figureValue({ figure }: Deck): string {
  return "source" in figure ? size : figure.value;
}
