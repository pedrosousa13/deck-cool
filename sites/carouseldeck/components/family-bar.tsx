import { FamilyBar } from "@deck-cool/brand/family-bar";
import type { ReactNode } from "react";
import { REPOSITORY } from "./links.ts";
import { carouseldeck } from "./carouseldeck.ts";

const links = [
  { label: "Docs", href: "/docs/" },
  { label: "Examples", href: "/examples/" },
  { label: "GitHub", href: REPOSITORY },
];

/** Rendered by build.chrome before <main>. Its children, the search island, end the row. */
export default function SiteFamilyBar({ children }: { children?: ReactNode }) {
  return (
    <FamilyBar current={carouseldeck} links={links} install="/docs/install/">
      {children}
    </FamilyBar>
  );
}
