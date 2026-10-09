import { HASHED_FILE_HEADERS, RESPONSE_HEADERS } from "./headers.ts";

/** A page and a file, neither content-hashed, so neither may be immutable. */
const SERVED = ["/", "/icons/deck-cool/still.svg"];
/** Proxied to the fallback 404 page, which .assetsignore keeps out of the upload. */
const NOT_UPLOADED = "/manifest.json";

async function get(origin: string, path: string): Promise<{ response: Response; body: string }> {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  return { response, body: await response.text() };
}

/** Lists every response header in `expected` that `response` lacks or holds at another value. */
function headerFailures(path: string, response: Response, expected: typeof RESPONSE_HEADERS): string[] {
  const failures: string[] = [];
  for (const { name, value } of expected) {
    const served = response.headers.get(name);
    if (served === null) failures.push(`${path}: ${name} missing`);
    else if (served !== value) failures.push(`${path}: ${name} is "${served}", expected "${value}"`);
  }
  return failures;
}

/** Fetches a few paths from `origin` and lists every way they differ from what the build declares. */
export async function checkSite(origin: string): Promise<string[]> {
  const failures: string[] = [];
  let home = "";
  for (const path of SERVED) {
    const { response, body } = await get(origin, path);
    if (path === "/") home = body;
    if (response.status !== 200) failures.push(`${path}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(path, response, RESPONSE_HEADERS));
    if (/\bimmutable\b/.test(response.headers.get("Cache-Control") ?? "")) {
      failures.push(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
  }

  // The one stylesheet, which the build names by its content's hash.
  const sheet = /<link rel="stylesheet" href="(\/assets\/[^"]+)"/.exec(home)?.[1];
  if (sheet === undefined) {
    failures.push("/: links no stylesheet under /assets/");
  } else {
    const { response } = await get(origin, sheet);
    if (response.status !== 200) failures.push(`${sheet}: status ${response.status}, expected 200`);
    failures.push(...headerFailures(sheet, response, [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS]));
  }

  const { response } = await get(origin, NOT_UPLOADED);
  if (response.status !== 404) failures.push(`${NOT_UPLOADED}: status ${response.status}, expected 404`);
  return failures;
}
