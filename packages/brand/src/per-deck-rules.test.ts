import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decks } from "./decks.ts";

// decks.ts lists carouseldeck, playdeck, pagedeck and drawerdeck. The
// umbrella (deck.cool) is excluded by design: FamilyBar renders no
// data-deck attribute for it (family-bar.test.tsx, "on the umbrella site no
// deck is current"), so it has no rule to carry here.

const familyBarCss = readFileSync(new URL("../styles/family-bar.css", import.meta.url), "utf8");

test.each(decks)("family-bar.css gives $name's bar its own fill", ({ name }) => {
  const rule = new RegExp(`\\.family-bar\\[data-deck="${name}"\\]\\s*\\{\\s*--bar-fill:\\s*var\\(--${name}-fill\\);?\\s*\\}`);
  expect(familyBarCss).toMatch(rule);
});

const umbrellaCss = readFileSync(new URL("../styles/umbrella.css", import.meta.url), "utf8");

test.each(decks)("umbrella.css tints $name's card and tile with its own text colour", ({ name }) => {
  const rule = new RegExp(`\\[data-deck="${name}"\\]\\s*\\{\\s*--tint:\\s*var\\(--${name}-text\\);?\\s*\\}`);
  expect(umbrellaCss).toMatch(rule);
});
