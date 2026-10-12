// What the home page states about the package, read from the installed
// @slidedeck/react's README and package.json when the site builds. Never
// retyped: a new release, with a new `pnpm compare` measurement, changes the
// page on the next build.
import { highlighter } from "@deck-cool/site-kit/highlight";
import { fence, readSlidedeckReadme, readSlidedeckVersion, slidedeckSize } from "@deck-cool/site-kit/slidedeck-readme";

const SITE = new URL("../", import.meta.url);

const readme = readSlidedeckReadme(SITE);

/** Slidedeck's min+gzip size, as the README's comparison measures it. deck.cool's card reads the same. */
export const size = slidedeckSize(readme);

/** A release's `MAJOR.MINOR.PATCH` as "MAJOR.MINOR". A prerelease fails: the page would name it as the release. */
export function minorOf(version: string): string {
  const match = /^(\d+\.\d+)\.\d+$/.exec(version);
  if (match?.[1] === undefined) {
    throw new Error(`@slidedeck/react's version is "${version}", not MAJOR.MINOR.PATCH — install a release, not a prerelease`);
  }
  return match[1];
}

/** The installed version, as "1.0". */
export const version = minorOf(readSlidedeckVersion(SITE));

/** The README's install command. */
export const install = fence(readme, "Install");

/** The theme the site's code is highlighted in: dark, as the site is. */
export const CODE_THEME = "github-dark-default";

const highlight = await highlighter("tsx", CODE_THEME);

/** The README's quickstart, highlighted, as HTML. */
export const quickstart = await highlight(fence(readme, "Quickstart"), "@slidedeck/react/README.md");
