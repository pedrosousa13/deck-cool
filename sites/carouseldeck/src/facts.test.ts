import { CAROUSELDECK, comparison, fence, readCarouseldeckRelease } from "@deck-cool/site-kit/carouseldeck-readme";
import { expect, test } from "vitest";
import { minorOf } from "./facts.ts";

test("names a release by its major and minor version", () => {
  expect(minorOf("1.0.3")).toBe("1.0");
  expect(minorOf("12.34.56")).toBe("12.34");
});

test("refuses a prerelease or anything but MAJOR.MINOR.PATCH, rather than cutting it short", () => {
  for (const version of ["1.1.0-beta.1", "1.1.0+build.5", "1.1", "v1.1.0"]) {
    expect(() => minorOf(version), version).toThrow(/MAJOR\.MINOR\.PATCH/);
  }
});

// The shape, not the values: a release may compare against other libraries.
test("the release's README parses, with carouseldeck's row in it", () => {
  const real = readCarouseldeckRelease(new URL("../", import.meta.url)).readme;
  const rows = comparison(real);
  expect(rows.some((row) => row.library === CAROUSELDECK)).toBe(true);
  for (const row of rows) expect(row.size).toMatch(/^\d+(\.\d+)? (B|KB|kB|MB)$/);
  expect(fence(real, "Quickstart")).toMatch(/<Deck\.Root aria-label=/);
  expect(fence(real, "Install")).toBe("pnpm add @carouseldeck/react");
});
