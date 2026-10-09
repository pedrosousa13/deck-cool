import { readFileSync } from "node:fs";

/**
 * The home page's two skins for one player. Each is a stylesheet the build
 * compiles into the site's sheet, and the home page shows the source file the
 * stylesheet is compiled from under the player it styles, folded until opened.
 */
export const SKINS = [
  { name: "Velvet", className: "velvet", file: "styles/skins/velvet.css" },
  { name: "Broadcast", className: "broadcast", file: "styles/skins/broadcast.css" },
] as const;

export type Skin = (typeof SKINS)[number] & { readonly css: string };

/** A skin as the home page shows it: its source, highlighted at build time. */
export type ShownSkin = Skin & { readonly html: string };

/** Each skin with its stylesheet's text, read at build time. */
export function skins(): Skin[] {
  return SKINS.map((skin) => ({ ...skin, css: readFileSync(new URL(`../${skin.file}`, import.meta.url), "utf8").trim() }));
}
