import { expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

const directives = new Map(
  CONTENT_SECURITY_POLICY.value.split(";").map((directive) => {
    const [name = "", ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }),
);

test("is the Content-Security-Policy header", () => {
  expect(CONTENT_SECURITY_POLICY.name).toBe("Content-Security-Policy");
});

test("allows scripts and images from the site only", () => {
  for (const name of ["script-src", "img-src"]) {
    expect(directives.get(name), name).toEqual(["'self'"]);
  }
});

test("allows stylesheets from the site, and one exact hash for the drawer engine's injected reset", () => {
  expect(directives.get("style-src")).toEqual(["'self'", "'sha256-jkOL0hGHI4K51cPMz60FCppWKNrlHNV2XDWJmueIR0s='"]);
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
