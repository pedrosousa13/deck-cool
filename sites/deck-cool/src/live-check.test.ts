import { createServer, type ServerResponse } from "node:http";
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
  const failures = await checkHost((_path, response) => {
    response.writeHead(200, { "Cache-Control": "public, max-age=31536000, immutable" }).end();
  });
  for (const path of ["/", "/icons/deck-cool/still.svg"]) {
    for (const { name } of RESPONSE_HEADERS) expect(failures).toContain(`${path}: ${name} missing`);
    expect(failures).toContain(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
  }
  expect(failures).toContain("/: links no stylesheet under /assets/");
  expect(failures).toContain("/manifest.json: status 200, expected 404");
});

test("a host that serves the hashed stylesheet without immutable fails", async () => {
  const failures = await checkHost((path, response) => {
    const headers = Object.fromEntries(RESPONSE_HEADERS.map(({ name, value }) => [name, value]));
    response.writeHead(path === "/manifest.json" ? 404 : 200, headers);
    response.end(path === "/" ? '<head><link rel="stylesheet" href="/assets/fw-core-AbCd1234.css"/></head>' : "");
  });
  expect(failures).toEqual(["/assets/fw-core-AbCd1234.css: Cache-Control missing"]);
});

/** Runs the checks against a local server that answers each path with `respond`. */
async function checkHost(respond: (path: string, response: ServerResponse) => void): Promise<string[]> {
  const server = createServer((request, response) => respond(request.url ?? "/", response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("the server is not on a TCP port");
    return await checkSite(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
