import type { HeaderField } from "@pagedeck/core";

/**
 * The <style> elements @carouseldeck/react renders with a deck, by the
 * `data-href` React dedupes them by: its base rules, alone or with an
 * effect's. site.build.test.ts fails on a page with a <style> not listed here.
 */
export const DECK_STYLE_HASHES = {
  "carouseldeck-slide": "'sha256-jrtu+DT8BpejPhdZ7+RJZ6lGjfioOpBSX2FkUIwW1bU='",
  "carouseldeck-slide carouseldeck-curve": "'sha256-HvUZiCIUw4Jo2u8VQhiGcO+dij7aME2zumllFsOm96o='",
  "carouseldeck-slide carouseldeck-fade": "'sha256-jQj7ezKefFX6270bZr4IenYxedFg+2M/DwPX+/46pno='",
  "carouseldeck-slide carouseldeck-stack": "'sha256-INfuHUSN6w3e7j1dQKlI1j+Ql+mQTRViIWTRaGsq0J8='",
} as const;

/**
 * Scripts, images and the search index come from the site itself, and
 * everything else is refused. Stylesheets come from the site too, and the only
 * inline <style> elements allowed are the decks', by their hashes.
 *
 * Inline style attributes are allowed: carouseldeck ships no CSS, so a deck's
 * scroll snapping and each slide's position are style attributes on its
 * server-rendered markup; Pagedeck renders each island's wrapper with one;
 * and Shiki colours each token of highlighted code with an inline `color`
 * style. They cannot run script, and every page is built from this repo.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' ${Object.values(DECK_STYLE_HASHES).join(" ")}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    // The search island fetches the index from /search/.
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
