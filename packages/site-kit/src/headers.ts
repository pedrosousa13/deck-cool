import { SECURITY_HEADERS, type HeaderField } from "@pagedeck/core";

/** Every powerful feature. No site needs one but those it allows, so each other one is off. */
const POWERFUL_FEATURES = [
  "accelerometer",
  "camera",
  "display-capture",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "hid",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "usb",
  "xr-spatial-tracking",
] as const;

/** A powerful feature, which a site may allow. */
type PowerfulFeature = (typeof POWERFUL_FEATURES)[number];

/**
 * Turns each powerful feature off, for the page and for anything it embeds,
 * but each one `allow` names, which goes last with the allowlist it gives.
 */
function permissionsPolicy(allow: Readonly<Partial<Record<PowerfulFeature, string>>>): string {
  return POWERFUL_FEATURES.filter((feature) => !(feature in allow))
    .map((feature) => `${feature}=()`)
    .concat(Object.entries(allow).map(([feature, allowlist]) => `${feature}=${allowlist}`))
    .join(", ");
}

/**
 * What every response from a site carries, page or file: Pagedeck's security
 * headers, the site's CSP, then the fields every site shares. HSTS covers the
 * subdomains because every package site is served over HTTPS at one of
 * deck.cool's.
 */
export function responseHeaders(
  csp: HeaderField,
  options: {
    /** Powerful features the site uses, each with its allowlist, such as `{ fullscreen: "(self)" }`. */
    allow?: Readonly<Partial<Record<PowerfulFeature, string>>>;
  } = {},
): readonly HeaderField[] {
  return [
    ...SECURITY_HEADERS,
    csp,
    { name: "Permissions-Policy", value: permissionsPolicy(options.allow ?? {}) },
    { name: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}

/**
 * What a content-hashed file carries besides the response headers. The build
 * names each such file by its content's hash, so a cached copy never goes stale.
 */
export const HASHED_FILE_HEADERS: readonly HeaderField[] = [
  { name: "Cache-Control", value: "public, max-age=31536000, immutable" },
];
