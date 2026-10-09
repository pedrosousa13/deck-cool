import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// CONTEXT.md, "Motion": one easing curve, the brand's --ease.
const SHEETS = ["brand.css", "family-bar.css", "umbrella.css"];

test.each(SHEETS)("every transition and animation in %s uses the brand curve", (sheet) => {
  const css = readFileSync(new URL(`../styles/${sheet}`, import.meta.url), "utf8");
  const declarations = [...css.matchAll(/\b(transition|animation)(-[\w-]+)?\s*:\s*([^;}]+)/g)];
  expect(declarations).not.toHaveLength(0);

  for (const [declaration, , longhand, value = ""] of declarations) {
    if (longhand === "-timing-function") {
      expect(value.trim(), declaration).toBe("var(--ease)");
    } else if (longhand === undefined && !/^none\b/.test(value.trim())) {
      // A shorthand with no timing function falls back to `ease`, so each
      // item has to name the curve.
      for (const item of value.split(",")) expect(item, declaration).toContain("var(--ease)");
    }
  }
});
