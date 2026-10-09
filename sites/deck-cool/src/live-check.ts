import { RESPONSE_HEADERS } from "./headers.ts";

/** A page and a file, neither content-hashed, so neither may be immutable. */
const SERVED = ["/", "/brand.css"];
/** Proxied to the fallback 404 page, which .assetsignore keeps out of the upload. */
const NOT_UPLOADED = "/manifest.json";

async function get(origin: string, path: string): Promise<Response> {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  await response.body?.cancel();
  return response;
}

/** Fetches a few paths from `origin` and lists every way they differ from what the build declares. */
export async function checkSite(origin: string): Promise<string[]> {
  const failures: string[] = [];
  for (const path of SERVED) {
    const response = await get(origin, path);
    if (response.status !== 200) failures.push(`${path}: status ${response.status}, expected 200`);
    for (const { name, value } of RESPONSE_HEADERS) {
      const served = response.headers.get(name);
      if (served === null) failures.push(`${path}: ${name} missing`);
      else if (served !== value) failures.push(`${path}: ${name} is "${served}", expected "${value}"`);
    }
    if (/\bimmutable\b/.test(response.headers.get("Cache-Control") ?? "")) {
      failures.push(`${path}: Cache-Control is immutable, but ${path} is not content-hashed`);
    }
  }
  const { status } = await get(origin, NOT_UPLOADED);
  if (status !== 404) failures.push(`${NOT_UPLOADED}: status ${status}, expected 404`);
  return failures;
}
