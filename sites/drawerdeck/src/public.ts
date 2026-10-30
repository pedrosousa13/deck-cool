import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Pagedeck passes one directory through, and the site serves two: the brand's
 * `public/` (the icons and `.assetsignore`) and its own, if it has one.
 * Copies both into `.pagedeck-public/`, beside the config, and returns that
 * directory. A name in both fails, so neither hides the other.
 */
export function stagePublic(from: string | URL): string {
  const brand = fileURLToPath(new URL("./node_modules/@deck-cool/brand/public/", from));
  const own = fileURLToPath(new URL("./public/", from));
  const staged = fileURLToPath(new URL("./.pagedeck-public/", from));
  const shared = existsSync(own) ? readdirSync(own).filter((name) => existsSync(`${brand}${name}`)) : [];
  if (shared.length > 0) {
    throw new Error(`public/ and the brand's public/ both hold ${shared.join(", ")} — rename the site's own`);
  }
  rmSync(staged, { recursive: true, force: true });
  cpSync(brand, staged, { recursive: true });
  if (existsSync(own)) cpSync(own, staged, { recursive: true });
  return staged;
}
