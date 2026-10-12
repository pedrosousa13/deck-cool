import type { LiveSite } from "@deck-cool/site-kit/live-check";
import { DOCS, PATHS } from "../components/links.ts";
import { RESPONSE_HEADERS } from "./headers.ts";

/** What `pnpm check-live` fetches from page.deck.cool. */
export const LIVE_SITE: LiveSite = {
  headers: RESPONSE_HEADERS,
  /** The site's own pages, two docs pages, and the embed demo's script, none content-hashed. */
  served: [...Object.values(PATHS), DOCS.start, DOCS.siteConfig, "/embed/demo-embed.js"],
  /** The one sheet, which `/` links, and the subset font's, which only `/features/` links. */
  sheets: [
    { page: "/", directory: "/assets/" },
    { page: "/features/", directory: "/fonts/" },
  ],
  /**
   * `/manifest.json` is proxied to the fallback 404 page, which .assetsignore
   * keeps out of the upload. `/no-such-page/` is no page, no file and no
   * redirect: with no 404 page, Cloudflare answers a bare 404.
   */
  notFound: ["/manifest.json", "/no-such-page/"],
};
