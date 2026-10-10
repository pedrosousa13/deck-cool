import { SECURITY_HEADERS, type HeaderField } from "@pagedeck/core";
import { describe, expect, test } from "vitest";
import { HASHED_FILE_HEADERS, responseHeaders } from "./headers.ts";

const CSP: HeaderField = { name: "Content-Security-Policy", value: "default-src 'none'" };

const OFF = [
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
];

const value = (headers: readonly HeaderField[], name: string) => headers.find((field) => field.name === name)?.value;

describe("responseHeaders", () => {
  test("is Pagedeck's security headers, the site's CSP, then Permissions-Policy, COOP and HSTS, in that order", () => {
    expect(responseHeaders(CSP).map(({ name }) => name)).toEqual([
      ...SECURITY_HEADERS.map(({ name }) => name),
      "Content-Security-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Strict-Transport-Security",
    ]);
    expect(value(responseHeaders(CSP), "Content-Security-Policy")).toBe("default-src 'none'");
    expect(value(responseHeaders(CSP), "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(value(responseHeaders(CSP), "Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });

  test("turns off every powerful feature, for the page and for anything it embeds", () => {
    expect(value(responseHeaders(CSP), "Permissions-Policy")).toBe(OFF.map((feature) => `${feature}=()`).join(", "));
  });

  test("allows a feature the site names, last, with the allowlist it gives", () => {
    expect(value(responseHeaders(CSP, { allow: { fullscreen: "(self)" } }), "Permissions-Policy")).toBe(
      [...OFF.filter((feature) => feature !== "fullscreen").map((feature) => `${feature}=()`), "fullscreen=(self)"].join(", "),
    );
  });

  test("allows only a powerful feature it knows, so a misspelt one fails typecheck", () => {
    // @ts-expect-error "fulscreen" is no powerful feature.
    expect(value(responseHeaders(CSP, { allow: { fulscreen: "(self)" } }), "Permissions-Policy")).toContain("fullscreen=()");
  });
});

test("a content-hashed file is cached for a year, as immutable", () => {
  expect(HASHED_FILE_HEADERS).toEqual([{ name: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
});
