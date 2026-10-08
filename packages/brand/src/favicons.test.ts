import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { ICON_NAMES } from "./icons.ts";

const DESIGN = new URL("../../../design/favicons/", import.meta.url);
const ICONS = new URL("../public/icons/", import.meta.url);

test.each(ICON_NAMES.flatMap((name) => [
  [name, "still"],
  [name, "animated"],
]))("%s's %s icon is byte-identical to its design source", (name, kind) => {
  const shipped = readFileSync(new URL(`${name}/${kind}.svg`, ICONS));
  const source = readFileSync(new URL(`${kind}/${name}.svg`, DESIGN));
  expect(shipped.equals(source)).toBe(true);
});
