import { expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY, DECK_STYLE_HASHES } from "./csp.ts";

const directives = new Map(
  CONTENT_SECURITY_POLICY.value.split(";").map((directive) => {
    const [name = "", ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }),
);

test("is the Content-Security-Policy header", () => {
  expect(CONTENT_SECURITY_POLICY.name).toBe("Content-Security-Policy");
});

test("allows scripts, images and fetches from the site only", () => {
  for (const name of ["script-src", "img-src", "connect-src"]) {
    expect(directives.get(name), name).toEqual(["'self'"]);
  }
});

test("allows stylesheets from the site, and inline <style> only by the decks' hashes", () => {
  expect(directives.get("style-src")).toEqual(["'self'", ...Object.values(DECK_STYLE_HASHES)]);
  for (const hash of Object.values(DECK_STYLE_HASHES)) expect(hash).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
});

test("allows inline style attributes, and no other inline source", () => {
  expect(directives.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  for (const [name, sources] of directives) {
    if (name !== "style-src-attr") expect(sources, name).not.toContain("'unsafe-inline'");
    expect(sources, name).not.toContain("'unsafe-eval'");
  }
});

test("falls back to nothing, and refuses forms, frames and a <base>", () => {
  expect(directives.get("default-src")).toEqual(["'none'"]);
  expect(directives.get("form-action")).toEqual(["'none'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'none'"]);
});
