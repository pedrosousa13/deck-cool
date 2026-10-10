import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { checkSite } from "@deck-cool/site-kit/live-check";
import { serveSite } from "@deck-cool/site-kit/serve-site";
import { LIVE_SITE } from "./live-check.ts";

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
