import { highlighter } from "@deck-cool/site-kit/highlight";
import { readFileSync } from "node:fs";
import { CODE_THEME } from "./code-theme.ts";

/**
 * The home page's two skins for one teaser. Each is a stylesheet the build
 * compiles into the site's sheet, and the home page shows the source file the
 * stylesheet is compiled from beside the teaser it styles.
 */
export const SKINS = [
  { name: "Paper", className: "paper", file: "styles/skins/paper.css" },
  { name: "Signal", className: "signal", file: "styles/skins/signal.css" },
] as const;

export type Skin = (typeof SKINS)[number] & { readonly css: string; readonly html: string };

const highlight = await highlighter("css", CODE_THEME);

const highlighted = await Promise.all(
  SKINS.map(async (skin) => {
    const css = readFileSync(new URL(`../${skin.file}`, import.meta.url), "utf8").trim();
    return { ...skin, css, html: await highlight(css, skin.file) };
  }),
);

/** Each skin with its stylesheet's text and the same text highlighted, read at build time. */
export function skins(): Skin[] {
  return highlighted;
}
