import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ICON_NAMES } from "./icons.ts";
import { renderTouchIcon } from "./touch-icon.ts";

const ICONS = new URL("../public/icons/", import.meta.url);

test.each(ICON_NAMES)("%s's apple-touch-icon is a 180×180 PNG", (name) => {
  const png = readFileSync(new URL(`${name}/apple-touch-icon.png`, ICONS));
  // The IHDR chunk follows the 8-byte signature: width, then height.
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
});

test.each(ICON_NAMES)(
  "%s's apple-touch-icon is rendered from the current still icon",
  (name) => {
    const png = readFileSync(new URL(`${name}/apple-touch-icon.png`, ICONS));
    const svg = readFileSync(new URL(`${name}/still.svg`, ICONS));
    expect(
      png.equals(renderTouchIcon(svg)),
      "stale: run pnpm --filter @deck-cool/brand render-touch-icons",
    ).toBe(true);
  },
);
