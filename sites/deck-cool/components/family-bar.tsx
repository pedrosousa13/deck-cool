import { decks, umbrella } from "@deck-cool/brand/decks";
import { FamilyBar } from "@deck-cool/brand/family-bar";
import { GITHUB } from "./links.ts";

// Each deck's card on the home page, then GitHub.
const links = [...decks.map((deck) => ({ label: deck.name, href: `#${deck.name}` })), { label: "GitHub", href: GITHUB }];

/** Rendered by build.chrome before <main>, so the stylesheets come before the bar. */
export default function SiteFamilyBar() {
  return (
    <>
      <link rel="stylesheet" href="/brand.css" />
      <link rel="stylesheet" href="/umbrella.css" />
      <FamilyBar current={umbrella} links={links} />
    </>
  );
}
