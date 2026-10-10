import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

export interface ServedSite {
  readonly origin: string;
  close(): Promise<void>;
}

export interface HeaderRule {
  readonly pattern: RegExp;
  readonly set: [string, string][];
  readonly detach: string[];
}

/**
 * Reads Cloudflare Pages' `_headers` format, as far as the build writes it: a
 * path pattern, where `*` matches anything, then indented `Name: value` and
 * `! Name` lines. Every rule that matches applies, in file order.
 */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    if (!/^\s/.test(line)) {
      const source = line.trim().split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      rules.push({ pattern: new RegExp(`^${source}$`), set: [], detach: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (rule === undefined) throw new Error(`_headers: a header before any path: ${line}`);
    const field = line.trim();
    if (field.startsWith("!")) {
      rule.detach.push(field.slice(1).trim());
    } else {
      const colon = field.indexOf(":");
      rule.set.push([field.slice(0, colon).trim(), field.slice(colon + 1).trim()]);
    }
  }
  return rules;
}

/** The headers a response for `path` carries, by the rules `parseHeaders` read. */
export function headersFor(rules: readonly HeaderRule[], path: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const rule of rules.filter(({ pattern }) => pattern.test(path))) {
    for (const [name, value] of rule.set) headers.set(name, value);
    for (const name of rule.detach) headers.delete(name);
  }
  return headers;
}

/**
 * Serves the site the build wrote to `site/` under the site's directory, from
 * 127.0.0.1, with the headers its `_headers` file sets.
 */
export async function serveSite(site: string): Promise<ServedSite> {
  const out = join(site, "site");
  const rules = parseHeaders(await readFile(join(out, "_headers"), "utf8"));
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = join(out, normalize(path.endsWith("/") ? `${path}index.html` : path));
    const headers = headersFor(rules, path);
    try {
      const body = await readFile(file);
      headers.set("content-type", TYPES[extname(file)] ?? "application/octet-stream");
      response.writeHead(200, Object.fromEntries(headers));
      response.end(body);
    } catch {
      response.writeHead(404, Object.fromEntries(headers)).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
