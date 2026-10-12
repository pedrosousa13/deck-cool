import type { HeaderField } from "@pagedeck/core";

/**
 * Where each clip on /examples and /docs/examples/ plays from. The home
 * page's players reach YouTube and Vimeo instead, through EMBED_FRAMES and
 * EMBED_SCRIPTS. A player fetches nothing until a reader presses play, so
 * before that press no page reaches any of these origins.
 */
export const MEDIA_ORIGINS = [
  // The Blender Foundation's download host. Both archetype players play an
  // open-movie trailer from it through the native provider, as a plain
  // <video> source (Sintel, and Big Buck Bunny), with no CORS and no
  // redirect. A <video> loads under media-src, so this is the whole grant.
  "https://download.blender.org",
] as const;

/**
 * What the home page's YouTube player loads once it is pressed: the iframe
 * API's loader, then the widget script that loader adds, which YouTube serves
 * under /s/player/. Vimeo's SDK is bundled with its provider, so it adds none.
 */
export const EMBED_SCRIPTS = ["https://www.youtube.com/iframe_api", "https://www.youtube.com/s/player/"] as const;

/**
 * The embeds the home page's three players frame once pressed: YouTube's
 * privacy-enhanced host, playdeck's default, and Vimeo's player. Each player
 * shows this site's own still, so neither provider's image host is needed.
 */
export const EMBED_FRAMES = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"] as const;

/**
 * One policy for every page: `_headers` sends it under `/*`, and Cloudflare
 * would combine a second, overlapping CSP with it strictest-wins. So the
 * YouTube and Vimeo grants the home page needs apply site-wide, deliberately.
 *
 * Scripts, stylesheets, images, the captions and the search index come from
 * the site itself, the clips from MEDIA_ORIGINS, the embeds from EMBED_FRAMES
 * and EMBED_SCRIPTS, and everything else is refused. The docs' two demos are
 * the archetype players, so they need no grant of their own. A demo that plays
 * Wistia or HLS adds its origins here.
 * `style-src-attr 'unsafe-inline'` is for the code highlighter's `style=`
 * colours and the players' own inline styles.
 */
export const CONTENT_SECURITY_POLICY: HeaderField = {
  name: "Content-Security-Policy",
  value: [
    "default-src 'none'",
    `script-src 'self' ${EMBED_SCRIPTS.join(" ")}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self'",
    `media-src 'self' ${MEDIA_ORIGINS.join(" ")}`,
    "connect-src 'self'",
    `frame-src ${EMBED_FRAMES.join(" ")}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};
