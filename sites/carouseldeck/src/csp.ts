import type { HeaderField } from "@pagedeck/core";

/**
 * The <style> elements @slidedeck/react 1.0.3 renders with a deck, by the
 * `data-href` React dedupes them by: its base rules, alone or with an
 * effect's. site.build.test.ts fails on a page with a <style> not listed here.
 */
export const DECK_STYLE_HASHES = {
  "slidedeck-slide": "'sha256-27tsD7IAHNKKdm97Pb+mN7y8p4RrpTyHv2pd5Yv6b3Y='",
  "slidedeck-slide slidedeck-curve": "'sha256-o8ClCv6cXWCQ58PwZTnPP04Xjm2bM5ffe8Uen8FNPEU='",
  "slidedeck-slide slidedeck-fade": "'sha256-B3wFKR5JG1hSJjhJ6p5f3MXQcfrk0DrGO5FA9WGHPbs='",
} as const;

/**
 * Scripts, images and the search index come from the site itself, and
 * everything else is refused. Stylesheets come from the site too, and the only
 * inline <style> elements allowed are the decks', by their hashes.
 *
 * Inline style attributes are allowed: slidedeck ships no CSS, so a deck's
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
