// What the home page states about the package, read from @carouseldeck/react's
// latest release when the site builds: its README at the release tag; without
// one, the build fails. Never retyped: a new release, with a new `pnpm
// compare` measurement, changes the page on the next build.
import { highlighter } from "@deck-cool/site-kit/highlight";
import { carouseldeckSize, fence, readCarouseldeckRelease } from "@deck-cool/site-kit/carouseldeck-readme";

const SITE = new URL("../", import.meta.url);

const release = readCarouseldeckRelease(SITE);
const { readme } = release;

/** carouseldeck's min+gzip size, as the README's comparison measures it. deck.cool's card reads the same. */
export const size = carouseldeckSize(readme);

/** A release's `MAJOR.MINOR.PATCH` as "MAJOR.MINOR". A prerelease fails: the page would name it as the release. */
export function minorOf(version: string): string {
  const match = /^(\d+\.\d+)\.\d+$/.exec(version);
  if (match?.[1] === undefined) {
    throw new Error(`@carouseldeck/react's version is "${version}", not MAJOR.MINOR.PATCH — install a release, not a prerelease`);
  }
  return match[1];
}

/** The release's version, as "1.2". */
export const version = minorOf(release.version);

/** The README's install command. */
export const install = fence(readme, "Install");

/** The theme the site's code is highlighted in: dark, as the site is. */
export const CODE_THEME = "github-dark-default";

const highlight = await highlighter("tsx", CODE_THEME);

/** The README's quickstart, highlighted, as HTML. */
export const quickstart = await highlight(fence(readme, "Quickstart"), "@carouseldeck/react/README.md");
