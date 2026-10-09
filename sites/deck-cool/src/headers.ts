import { SECURITY_HEADERS, type HeaderField } from "@pagedeck/core";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/** No page uses a powerful feature, so each one is off, for the page and for anything it embeds. */
const PERMISSIONS_POLICY = [
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
]
  .map((feature) => `${feature}=()`)
  .join(", ");

/**
 * What every response from deck.cool carries, page or file. HSTS covers the
 * subdomains because every package site is served over HTTPS at one of them.
 */
export const RESPONSE_HEADERS: readonly HeaderField[] = [
  ...SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  { name: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { name: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];
