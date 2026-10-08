// Writes public/icons/<name>/apple-touch-icon.png from each still.svg.
// Run after changing a still icon: pnpm --filter @deck-cool/brand render-touch-icons
import { readFileSync, writeFileSync } from "node:fs";
import { ICON_NAMES, renderTouchIcon } from "../src/touch-icon.ts";

for (const name of ICON_NAMES) {
  const dir = new URL(`../public/icons/${name}/`, import.meta.url);
  const png = renderTouchIcon(readFileSync(new URL("still.svg", dir)));
  writeFileSync(new URL("apple-touch-icon.png", dir), png);
  console.log(`icons/${name}/apple-touch-icon.png`);
}
