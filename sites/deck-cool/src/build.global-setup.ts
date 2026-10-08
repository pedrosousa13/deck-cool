import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = fileURLToPath(new URL("..", import.meta.url));

/** Builds the site once, before the test files that read its output. */
export default function setup() {
  execFileSync("pnpm", ["exec", "pagedeck", "sync"], { cwd: SITE });
  execFileSync("pnpm", ["exec", "pagedeck", "build"], { cwd: SITE });
}
