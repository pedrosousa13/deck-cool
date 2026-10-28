import { FamilyBar } from "@deck-cool/brand/family-bar";
import type { ReactNode } from "react";
import { REPOSITORY } from "./links.ts";
import { drawerdeck } from "./drawerdeck.ts";

const links = [
  { label: "Docs", href: "/docs/" },
  { label: "GitHub", href: REPOSITORY },
];

/** Rendered by build.chrome before <main>. */
export default function SiteFamilyBar({ children }: { children?: ReactNode }) {
  return (
    <FamilyBar current={drawerdeck} links={links} install="/docs/install/">
      {children}
    </FamilyBar>
  );
}
