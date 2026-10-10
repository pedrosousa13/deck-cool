import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { checkSite } from "@deck-cool/site-kit/live-check";
import { serveSite } from "@deck-cool/site-kit/serve-site";
import { checkCanonical, LIVE_SITE } from "./live-check.ts";

// packages/site-kit/src/live-check.test.ts tests the checks themselves, against hosts that fail each one.
test("the build, served with its _headers, passes every check but the ones only the upload and the zone can pass", async () => {
  const site = await serveSite(fileURLToPath(new URL("..", import.meta.url)));
  try {
    // The local server serves every file in site/, .assetsignore or not, and
    // answers plain HTTP itself, where the zone's Always Use HTTPS would redirect.
    expect(await checkSite(LIVE_SITE, site.origin)).toEqual([
      "/manifest.json: status 200, expected 404",
      `${site.origin}/: status 200, expected 301 to ${site.origin}/`,
    ]);
  } finally {
    await site.close();
  }
});

test("a page whose canonical link is its own path on playdeck.video passes", () => {
  expect(checkCanonical("/examples/", '<link rel="canonical" href="https://playdeck.video/examples/">')).toEqual([]);
});

test("a page with no canonical link fails", () => {
  expect(checkCanonical("/examples/", "<head></head>")).toEqual([
    "/examples/: no canonical link, expected https://playdeck.video/examples/",
  ]);
});

test("a page that names itself as canonical, not playdeck.video, fails", () => {
  expect(checkCanonical("/examples/", '<link rel="canonical" href="https://play.deck.cool/examples/">')).toEqual([
    "/examples/: canonical is https://play.deck.cool/examples/, expected https://playdeck.video/examples/",
  ]);
});

test("a file that is not a page needs no canonical link", () => {
  expect(checkCanonical("/archetype-captions.vtt", "")).toEqual([]);
});
