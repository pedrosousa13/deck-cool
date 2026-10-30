import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// docs-quickstart-example.tsx is the Quickstart page's tsx block, copied here.
// It sits under src/ like the site's other source, so `pnpm typecheck`
// compiles it against the real @drawerdeck/react. This test only checks that
// the copy still matches the markdown, byte for byte.

const QUICKSTART_MD = fileURLToPath(
  new URL("../../../decks/drawerdeck/packages/docs/quickstart.md", import.meta.url),
);
const EXAMPLE = fileURLToPath(new URL("./docs-quickstart-example.tsx", import.meta.url));

test("the Quickstart page's tsx block is this file, which pnpm typecheck compiles", () => {
  const markdown = readFileSync(QUICKSTART_MD, "utf8");
  const block = /```tsx\n([\s\S]*?)```\n/.exec(markdown);
  expect(block, "a tsx code block in quickstart.md").not.toBeNull();
  expect(block?.[1]).toBe(readFileSync(EXAMPLE, "utf8"));
});
