import type { LiveSite } from "@deck-cool/site-kit/live-check";
import { ORIGIN } from "../components/links.ts";
import { RESPONSE_HEADERS } from "./headers.ts";

/** Every page, each of which names its own path on play.deck.cool as canonical. */
const PAGES = ["/", "/examples/", "/guides/comparison/", "/docs/search/"];

/** Fails a page whose canonical link is not its own path on play.deck.cool, playdeck's canonical address (CONTEXT.md). */
export function checkCanonical(path: string, body: string): string[] {
  if (!PAGES.includes(path)) return [];
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
  const expected = new URL(path, ORIGIN).href;
  if (canonical === undefined) return [`${path}: no canonical link, expected ${expected}`];
  if (canonical !== expected) return [`${path}: canonical is ${canonical}, expected ${expected}`];
  return [];
}

/** What `pnpm check-live` fetches from play.deck.cool. */
export const LIVE_SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  /** The pages, the captions file and the home page's posters, none content-hashed. */
  served: [...PAGES, "/archetype-captions.vtt", "/sprite-fright-poster-1024w.webp", "/sprite-fright-poster-2048w.webp"],
  sheets: [{ page: "/", directory: "/assets/" }],
  /**
   * `/manifest.json` is proxied to the fallback 404 page, which .assetsignore
   * keeps out of the upload. `/no-such-page/` is no page, no file and no
   * redirect: with no 404 page, Cloudflare answers a bare 404.
   */
  notFound: ["/manifest.json", "/no-such-page/"],
  checkPage: checkCanonical,
};
