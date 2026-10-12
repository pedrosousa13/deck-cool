// A README in @carouseldeck/react's shape, for tests that must not depend on the
// release installed today. Its sizes are made up.

/** @carouseldeck/react's README, as the sites read it, with carouseldeck's size as given. */
export function fixtureReadme(size: string): string {
  return [
    "# @carouseldeck/react",
    "",
    "## Install",
    "",
    "```sh",
    "pnpm add @carouseldeck/react",
    "```",
    "",
    "## Quickstart",
    "",
    "```tsx",
    "import * as Deck from '@carouseldeck/react';",
    "",
    '<Deck.Root aria-label="Fixture">',
    "  <Deck.Viewport />",
    "</Deck.Root>",
    "```",
    "",
    "## Comparison",
    "",
    "<!-- comparison:start -->",
    "| Library            | Version   | Min+gzip | Native scroll | Accessibility out of the box | API shape  |",
    "| ------------------ | --------- | -------- | ------------- | ---------------------------- | ---------- |",
    `| \`@carouseldeck/react\` | this repo | ${size} | Yes: snap     | Labelled                     | Components |`,
    "| `other-carousel`   | 1.0.0     | 1.00 KB  | No            | None                         | A hook     |",
    "<!-- comparison:end -->",
    "",
  ].join("\n");
}
