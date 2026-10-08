import type { HeaderField } from "@pagedeck/core";

/**
 * The site ships no script and no inline style: stylesheets and images come
 * from the site itself, and everything else is refused.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
