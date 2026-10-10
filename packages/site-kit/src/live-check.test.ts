import type { HeaderField } from "@pagedeck/core";
import { createServer, type ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { responseHeaders } from "./headers.ts";
import { checkSite, type LiveSite } from "./live-check.ts";

const RESPONSE_HEADERS = responseHeaders({ name: "Content-Security-Policy", value: "default-src 'none'" });
const SHEETS = ["/assets/fw-core-AbCd1234.css", "/fonts/fonts.ab12cd34.css"];
const PAGES = ["/", "/features/"];

/** A site with two pages, a file, two hashed sheets, two paths that must 404 and a check of its own on each page. */
const SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  served: [...PAGES, "/icons/still.svg"],
  sheets: [
    { page: "/", directory: "/assets/" },
    { page: "/features/", directory: "/fonts/" },
  ],
  notFound: ["/manifest.json", "/no-such-page/"],
  checkPage: (path, body) => (PAGES.includes(path) && !body.includes("<title>") ? [`${path}: no title`] : []),
};

/** What a page answers with: a title, and the main sheet's link on `/` and the font sheet's on `/features/`. */
function bodyOf(path: string): string {
  if (path === "/") return `<head><title>Home</title><link rel="stylesheet" href="${SHEETS[0]}"/></head>`;
  if (path === "/features/") return `<head><title>Features</title><link rel="stylesheet" href="${SHEETS[1]}"></head>`;
  return "";
}

const hashed = (path: string) => path.startsWith("/assets/") || path.startsWith("/fonts/");

/** Serves every path as the site should, but with `change` applied to each response's status and headers. */
function serveWith(change: (path: string, headers: Record<string, string>) => number | void = () => {}): Respond {
  return (path, response) => {
    const headers = Object.fromEntries(RESPONSE_HEADERS.map(({ name, value }) => [name, value]));
    if (hashed(path)) headers["Cache-Control"] = "public, max-age=31536000, immutable";
    const status = change(path, headers) ?? (SITE.notFound.includes(path) ? 404 : 200);
    response.writeHead(status, headers).end(bodyOf(path));
  };
}

test("a host that serves the site as it should passes", async () => {
  expect(await checkHost(serveWith())).toEqual([]);
});

test("a host that drops the headers, caches everything as immutable and serves every path fails, header by header", async () => {
  const failures = await checkHost((_path, response) => {
    response.writeHead(200, { "Cache-Control": "public, max-age=31536000, immutable" }).end();
  });
  for (const path of SITE.served) {
    for (const { name } of RESPONSE_HEADERS) expect(failures).toContain(`${path}: ${name} missing`);
    expect(failures).toContain(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
  }
  for (const path of PAGES) expect(failures).toContain(`${path}: no title`);
  expect(failures).toContain("/: links no stylesheet under /assets/");
  expect(failures).toContain("/features/: links no stylesheet under /fonts/");
  for (const path of SITE.notFound) expect(failures).toContain(`${path}: status 200, expected 404`);
});

test("a host that serves a page as 404 fails", async () => {
  const failures = await checkHost(serveWith((path) => (path === "/features/" ? 404 : undefined)));
  expect(failures).toEqual(["/features/: status 404, expected 200"]);
});

test("a host whose HSTS leaves out the subdomains fails", async () => {
  const failures = await checkHost(
    serveWith((_path, headers) => {
      headers["Strict-Transport-Security"] = "max-age=31536000";
    }),
  );
  const expected = 'Strict-Transport-Security is "max-age=31536000", expected "max-age=31536000; includeSubDomains"';
  expect(failures).toEqual([...SITE.served, ...SHEETS].map((path) => `${path}: ${expected}`));
});

test("a host that serves the hashed stylesheets without immutable fails", async () => {
  const failures = await checkHost(
    serveWith((_path, headers) => {
      delete headers["Cache-Control"];
    }),
  );
  expect(failures).toEqual(SHEETS.map((path) => `${path}: Cache-Control missing`));
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

test("a site's own headers are the ones it checks", async () => {
  const extra: HeaderField = { name: "X-Site", value: "1" };
  const failures = await checkHost(serveWith(), { ...SITE, headers: [...RESPONSE_HEADERS, extra] });
  expect(failures).toEqual([...SITE.served, ...SHEETS].map((path) => `${path}: X-Site missing`));
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
  const site = await listen(serveWith());
  const http = await listen((_path, response) => respond(site.origin, response));
  try {
    return { failures: await checkSite(SITE, site.origin, http.origin), origin: site.origin, httpOrigin: http.origin };
  } finally {
    await Promise.all([site.close(), http.close()]);
  }
}

/** Runs the checks against a local server that answers each path with `respond`, plain HTTP included. */
async function checkHost(respond: Respond, site: LiveSite = SITE): Promise<string[]> {
  const host = await listen(respond);
  try {
    // The same server answers the plain-HTTP request: drop that failure to keep each test to its subject.
    return (await checkSite(site, host.origin)).filter((failure) => !failure.startsWith(`${host.origin}/:`));
  } finally {
    await host.close();
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
