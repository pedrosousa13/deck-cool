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

test("allows no script at all", () => {
  expect(directives.get("script-src")).toEqual(["'none'"]);
});

test("allows stylesheets from the site only, and no inline style", () => {
  expect(directives.get("style-src")).toEqual(["'self'"]);
  for (const [name, sources] of directives) {
    expect(sources, name).not.toContain("'unsafe-inline'");
  }
});

test("falls back to nothing, and refuses forms, frames and a <base>", () => {
  expect(directives.get("default-src")).toEqual(["'none'"]);
  expect(directives.get("form-action")).toEqual(["'none'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'none'"]);
});
