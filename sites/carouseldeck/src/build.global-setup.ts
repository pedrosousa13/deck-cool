import { buildSite } from "@deck-cool/site-kit/build";
import { fileURLToPath } from "node:url";

/** Builds the site once, before the test files that read its output. */
export default function setup() {
  buildSite(fileURLToPath(new URL("..", import.meta.url)));
}
