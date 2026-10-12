import { describe, expect, test } from "vitest";
import { loadWarning } from "./load-warning.ts";

describe("loadWarning", () => {
  test("names the load, to two places, and the cores when the load is above the cores", () => {
    const warning = loadWarning(16.4501953125, 4);
    expect(warning).toContain("16.45 ");
    expect(warning).toContain("4 cores");
    expect(warning).toMatch(/browser tests may time out/);
  });

  test("is undefined when the load equals the cores", () => {
    expect(loadWarning(4, 4)).toBeUndefined();
  });

  test("is undefined when the load is below the cores", () => {
    expect(loadWarning(1.2, 4)).toBeUndefined();
  });
});
