import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { RESPONSE_HEADERS } from "./headers.ts";
import { checkSite } from "./live-check.ts";
import { serveSite } from "./serve-site.ts";

test("the build, served with its _headers, passes every check but the one only the upload can pass", async () => {
  const site = await serveSite();
  try {
    // The local server serves every file in site/, .assetsignore or not.
    expect(await checkSite(site.origin)).toEqual(["/manifest.json: status 200, expected 404"]);
  } finally {
    await site.close();
  }
});

test("a host that drops the headers and caches everything as immutable fails, header by header", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Cache-Control": "public, max-age=31536000, immutable" }).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const failures = await checkSite(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    for (const path of ["/", "/brand.css"]) {
      for (const { name } of RESPONSE_HEADERS) expect(failures).toContain(`${path}: ${name} missing`);
      expect(failures).toContain(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
    expect(failures).toContain("/manifest.json: status 200, expected 404");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
