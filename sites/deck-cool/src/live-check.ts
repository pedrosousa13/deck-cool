import type { LiveSite } from "@deck-cool/site-kit/live-check";
import { RESPONSE_HEADERS } from "./headers.ts";

/** What `pnpm check-live` fetches from deck.cool. */
export const LIVE_SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  /** A page and a file, neither content-hashed. */
  served: ["/", "/icons/deck-cool/still.svg"],
  sheets: [{ page: "/", directory: "/assets/" }],
  /** Proxied to the fallback 404 page, which .assetsignore keeps out of the upload. */
  notFound: ["/manifest.json"],
};
