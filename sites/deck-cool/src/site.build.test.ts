import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const SITE = fileURLToPath(new URL("..", import.meta.url));

interface BudgetReport {
  pages: { path: string; actual: number }[];
}

// pagedeck build bundles the site, so it takes longer than vitest's 5 seconds.
test("every page ships 0 B of JavaScript", { timeout: 120_000 }, () => {
  execFileSync("pnpm", ["exec", "pagedeck", "sync"], { cwd: SITE });
  execFileSync("pnpm", ["exec", "pagedeck", "build"], { cwd: SITE });

  const report = JSON.parse(
    readFileSync(`${SITE}.pagedeck/budget-report.json`, "utf8"),
  ) as BudgetReport;

  expect(report.pages.map((page) => page.path)).toContain("/");
  for (const page of report.pages) {
    expect(page, page.path).toMatchObject({ actual: 0 });
  }
});
