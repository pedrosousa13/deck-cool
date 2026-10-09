import { createServer, type ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { RESPONSE_HEADERS } from "./headers.ts";
import { checkSite } from "./live-check.ts";
import { serveSite } from "./serve-site.ts";

test("the build, served with its _headers, passes every check but the ones only the upload and the zone can pass", async () => {
  const site = await serveSite();
  try {
    // The local server serves every file in site/, .assetsignore or not, and
    // answers plain HTTP itself, where the zone's Always Use HTTPS would redirect.
    expect(await checkSite(site.origin)).toEqual([
      "/manifest.json: status 200, expected 404",
      `${site.origin}/: status 200, expected 301 to ${site.origin}/`,
    ]);
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

test("an origin whose plain HTTP serves the page instead of redirecting fails", async () => {
  const { failures, origin, httpOrigin } = await checkHttp((_origin, response) => {
    response.writeHead(200).end("<html></html>");
  });
  expect(failures).toEqual([`${httpOrigin}/: status 200, expected 301 to ${origin}/`]);
});

test("an origin whose plain HTTP redirects to another place fails", async () => {
  const { failures, origin, httpOrigin } = await checkHttp((_origin, response) => {
    response.writeHead(301, { Location: "https://example.com/" }).end();
  });
  expect(failures).toEqual([`${httpOrigin}/: redirects to https://example.com/, expected ${origin}/`]);
});

test("an origin whose plain HTTP answers 301 to the same path at the origin passes", async () => {
  const { failures } = await checkHttp((origin, response) => {
    response.writeHead(301, { Location: `${origin}/` }).end();
  });
  expect(failures).toEqual([]);
});

type Respond = (path: string, response: ServerResponse) => void;

/**
 * Runs the checks against a host that serves the site correctly, plus a
 * second server that stands in for its plain-HTTP side and answers with
 * `respond`, given the origin it should redirect to.
 */
async function checkHttp(
  respond: (origin: string, response: ServerResponse) => void,
): Promise<{ failures: string[]; origin: string; httpOrigin: string }> {
  const headers = Object.fromEntries(RESPONSE_HEADERS.map(({ name, value }) => [name, value]));
  const sheetHeaders = { ...headers, "Cache-Control": "public, max-age=31536000, immutable" };
  const site = await listen((path, response) => {
    if (path === "/manifest.json") return response.writeHead(404, headers).end();
    if (path.startsWith("/assets/")) return response.writeHead(200, sheetHeaders).end();
    response.writeHead(200, headers);
    response.end(path === "/" ? '<head><link rel="stylesheet" href="/assets/fw-core-AbCd1234.css"/></head>' : "");
  });
  const http = await listen((_path, response) => respond(site.origin, response));
  try {
    return { failures: await checkSite(site.origin, http.origin), origin: site.origin, httpOrigin: http.origin };
  } finally {
    await Promise.all([site.close(), http.close()]);
  }
}

/** Runs the checks against a local server that answers each path with `respond`, plain HTTP included. */
async function checkHost(respond: Respond): Promise<string[]> {
  const site = await listen(respond);
  try {
    // The same server answers the plain-HTTP request: drop that failure to keep each test to its subject.
    return (await checkSite(site.origin)).filter((failure) => !failure.startsWith(`${site.origin}/:`));
  } finally {
    await site.close();
  }
}

async function listen(respond: Respond): Promise<{ origin: string; close(): Promise<unknown> }> {
  const server = createServer((request, response) => respond(request.url ?? "/", response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the server is not on a TCP port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
