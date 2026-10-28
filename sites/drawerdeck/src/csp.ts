import type { HeaderField } from "@pagedeck/core";

/**
 * Scripts and images come from the site itself, and everything else is
 * refused. Stylesheets come from the site too: style-src-attr is inline
 * because Pagedeck renders each island's wrapper with a style attribute, and
 * Shiki colours each highlighted token with an inline `color` style.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
