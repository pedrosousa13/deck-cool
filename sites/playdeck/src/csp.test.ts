import { expect, test } from "vitest";
import { CONTENT_SECURITY_POLICY, EMBED_FRAMES, EMBED_SCRIPTS, MEDIA_ORIGINS } from "./csp.ts";

const directives = new Map(
  CONTENT_SECURITY_POLICY.value.split(";").map((directive) => {
    const [name = "", ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }),
);

test("is the Content-Security-Policy header", () => {
  expect(CONTENT_SECURITY_POLICY.name).toBe("Content-Security-Policy");
});

test("allows scripts from the site and YouTube's iframe API alone, and never eval or any inline script", () => {
  // The API's loader, then the widget script it adds, which YouTube serves under /s/player/.
  expect(EMBED_SCRIPTS).toEqual(["https://www.youtube.com/iframe_api", "https://www.youtube.com/s/player/"]);
  expect(directives.get("script-src")).toEqual(["'self'", ...EMBED_SCRIPTS]);
});

test("allows stylesheets from the site only, and inline style only in an attribute", () => {
  expect(directives.get("style-src")).toEqual(["'self'"]);
  for (const [name, sources] of directives) {
    if (name !== "style-src-attr") expect(sources, name).not.toContain("'unsafe-inline'");
  }
  expect(directives.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
});

test("plays media from the site and the clips' one host, over HTTPS", () => {
  expect(MEDIA_ORIGINS).toEqual(["https://download.blender.org"]);
  expect(directives.get("media-src")).toEqual(["'self'", ...MEDIA_ORIGINS]);
});

test("fetches and shows images from the site only, and frames the two embeds the home page plays", () => {
  expect(directives.get("connect-src")).toEqual(["'self'"]);
  expect(directives.get("img-src")).toEqual(["'self'"]);
  // YouTube's privacy-enhanced embed host, and Vimeo's player.
  expect(EMBED_FRAMES).toEqual(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]);
  expect(directives.get("frame-src")).toEqual([...EMBED_FRAMES]);
  expect(directives.has("child-src")).toBe(false);
  expect(directives.has("worker-src")).toBe(false);
});

test("falls back to nothing, and refuses forms, framing by others and a <base>", () => {
  expect(directives.get("default-src")).toEqual(["'none'"]);
  expect(directives.get("form-action")).toEqual(["'none'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'none'"]);
});
