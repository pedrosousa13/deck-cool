import type { HeaderField } from "@pagedeck/core";
import { HASHED_FILE_HEADERS } from "./headers.ts";

/** What a site's live check fetches, and what it expects back. */
export interface LiveSite {
  /** What every response carries, page or file: the site's `RESPONSE_HEADERS`. */
  headers: readonly HeaderField[];
  /** Pages and files, none content-hashed, each of which must answer 200 with `headers` and no `immutable`. */
  served: readonly string[];
  /** Each stylesheet the build names by its content's hash: the one `page` links under `directory`. */
  sheets: readonly { page: string; directory: string }[];
  /** Paths that must answer 404. */
  notFound: readonly string[];
  /** Any further failures of a served path, given its body. */
  checkPage?: (path: string, body: string) => string[];
}

async function get(origin: string, path: string): Promise<{ response: Response; body: string }> {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  return { response, body: await response.text() };
}

/** Lists every response header in `expected` that `response` lacks or holds at another value. */
function headerFailures(path: string, response: Response, expected: readonly HeaderField[]): string[] {
  const failures: string[] = [];
  for (const { name, value } of expected) {
    const served = response.headers.get(name);
    if (served === null) failures.push(`${path}: ${name} missing`);
    else if (served !== value) failures.push(`${path}: ${name} is "${served}", expected "${value}"`);
  }
  return failures;
}

/**
 * Fetches `site`'s paths from `origin` and lists every way they differ from
 * what the build declares. `httpOrigin` is the same host over plain HTTP, which
 * the zone's Always Use HTTPS must answer with a 301 to the same path at `origin`.
 */
export async function checkSite(
  site: LiveSite,
  origin: string,
  httpOrigin = origin.replace(/^https:/, "http:"),
): Promise<string[]> {
  const failures: string[] = [];
  const bodies = new Map<string, string>();
  for (const path of site.served) {
    const { response, body } = await get(origin, path);
    bodies.set(path, body);
    if (response.status !== 200) failures.push(`${path}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(path, response, site.headers));
    if (/\bimmutable\b/.test(response.headers.get("Cache-Control") ?? "")) {
      failures.push(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
    failures.push(...(site.checkPage?.(path, body) ?? []));
  }

  for (const { page, directory } of site.sheets) {
    const pattern = new RegExp(`<link rel="stylesheet" href="(${directory}[^"]+)"`);
    const sheet = pattern.exec(bodies.get(page) ?? "")?.[1];
    if (sheet === undefined) {
      failures.push(`${page}: links no stylesheet under ${directory}`);
      continue;
    }
    const { response } = await get(origin, sheet);
    if (response.status !== 200) failures.push(`${sheet}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(sheet, response, [...site.headers, ...HASHED_FILE_HEADERS]));
  }

  for (const path of site.notFound) {
    const { response } = await get(origin, path);
    if (response.status !== 404) failures.push(`${path}: status ${response.status}, expected 404`);
  }

  const plain = new URL("/", httpOrigin).href;
  const secure = new URL("/", origin).href;
  const redirect = await fetch(plain, { redirect: "manual" });
  const location = redirect.headers.get("Location");
  if (redirect.status !== 301) failures.push(`${plain}: status ${redirect.status}, expected 301 to ${secure}`);
  else if (location !== secure) failures.push(`${plain}: redirects to ${location ?? "nowhere"}, expected ${secure}`);
  return failures;
}

/**
 * Checks `site` at `origin`, prints each failure and a summary, and sets the
 * exit code: what each site's `pnpm check-live` runs.
 */
export async function reportLiveCheck(site: LiveSite, origin: string): Promise<void> {
  const failures = await checkSite(site, origin);
  for (const failure of failures) console.error(failure);
  console.log(failures.length === 0 ? `${origin}: every check passed` : `${origin}: ${failures.length} failed`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}
