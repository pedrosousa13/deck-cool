import { decks, umbrella } from "@deck-cool/brand/decks";
import { FamilyBar } from "@deck-cool/brand/family-bar";

// Each deck's card on the home page.
const links = decks.map((deck) => ({ label: deck.name, href: `#${deck.name}` }));

/** Rendered by build.chrome before <main>. */
export default function SiteFamilyBar() {
  return <FamilyBar current={umbrella} links={links} />;
}
