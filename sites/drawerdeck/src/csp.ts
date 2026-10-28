import type { HeaderField } from "@pagedeck/core";

/**
 * The exact content of the one <style> tag @drawerdeck/core injects into
 * <head> (ensureBackdropReset, `createDrawer`), to neutralise a dialog's
 * native ::backdrop so Drawer.Backdrop is the only dim layer. The engine
 * should not need an inline <style> tag at all; that is a bug to report
 * upstream. Until it is fixed, this hash is the only way to let that one
 * tag through style-src without 'unsafe-inline'.
 */
const DRAWER_BACKDROP_RESET_HASH = "sha256-jkOL0hGHI4K51cPMz60FCppWKNrlHNV2XDWJmueIR0s=";

/**
 * Scripts and images come from the site itself, and everything else is
 * refused. Stylesheets come from the site too, plus the one hash above:
 * style-src-attr is inline because Pagedeck renders each island's wrapper
 * with a style attribute, and Shiki colours each highlighted token with an
 * inline `color` style.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' '${DRAWER_BACKDROP_RESET_HASH}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
