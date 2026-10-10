import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where buildSite keeps what `pagedeck build` printed for the site, its warnings among it. */
export function buildOutput(site: string): string {
  return join(site, ".pagedeck/build-output.txt");
}

/**
 * Builds the site in `site`, its directory, once, before the test files that
 * read its output: a vitest global setup calls it.
 */
export function buildSite(site: string): void {
  execFileSync("pnpm", ["exec", "pagedeck", "sync"], { cwd: site });
  // Pagedeck prints its warnings to stderr, so both streams are kept.
  const output = execFileSync("sh", ["-c", "pnpm exec pagedeck build 2>&1"], { cwd: site, encoding: "utf8" });
  mkdirSync(join(site, ".pagedeck"), { recursive: true });
  writeFileSync(buildOutput(site), output);
}
