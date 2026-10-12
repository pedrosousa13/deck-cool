import type { LiveSite } from "@deck-cool/site-kit/live-check";
import { RESPONSE_HEADERS } from "./headers.ts";

/** What `pnpm check-live` fetches from carousel.deck.cool. */
export const LIVE_SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  /** Three pages, the docs' first among them, and a file, none content-hashed. */
  served: ["/", "/examples/", "/docs/", "/icons/carouseldeck/still.svg"],
  sheets: [{ page: "/", directory: "/assets/" }],
  /**
   * `/manifest.json` is proxied to the fallback 404 page, which .assetsignore
   * keeps out of the upload. `/no-such-page/` is no page, no file and no
   * redirect: with no 404 page, Cloudflare answers a bare 404.
   */
  notFound: ["/manifest.json", "/no-such-page/"],
};
