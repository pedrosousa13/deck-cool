import { umbrella } from "@deck-cool/brand/decks";
import { FamilyBar } from "@deck-cool/brand/family-bar";

/** Rendered by build.chrome before <main>, so the stylesheets come before the bar. */
export default function SiteFamilyBar() {
  return (
    <>
      <link rel="stylesheet" href="/brand.css" />
      <FamilyBar current={umbrella} links={[]} />
    </>
  );
}
