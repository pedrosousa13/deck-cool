// What the home page reads from the decks' installed packages when the site
// builds. Never retyped: a new release changes the page on the next build.
import type { Deck } from "@deck-cool/brand/decks";
import { readSlidedeckReadme, slidedeckSize } from "@deck-cool/site-kit/slidedeck-readme";

/** slidedeck's min+gzip size, from its README: the figure slidedeck's home page shows. */
const size = slidedeckSize(readSlidedeckReadme(new URL("../", import.meta.url)));

/** The figure the deck's card shows: the decks module's, or slidedeck's size from its README. */
export function figureValue({ figure }: Deck): string {
  return "source" in figure ? size : figure.value;
}
