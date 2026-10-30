import type { LiveSite } from "@deck-cool/site-kit/live-check";
import { RESPONSE_HEADERS } from "./headers.ts";

/** What `pnpm check-live` fetches from drawer.deck.cool. */
export const LIVE_SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  /** The home page and the docs' first page, and a file, none content-hashed. */
  served: ["/", "/docs/", "/icons/drawerdeck/still.svg"],
  sheets: [{ page: "/", directory: "/assets/" }],
  /**
   * `/manifest.json` is proxied to the fallback 404 page, which .assetsignore
   * keeps out of the upload. `/no-such-page/` is no page, no file and no
   * redirect: with no 404 page, Cloudflare answers a bare 404.
   */
  notFound: ["/manifest.json", "/no-such-page/"],
};
