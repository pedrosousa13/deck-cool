import { responseHeaders } from "@deck-cool/site-kit/headers";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/**
 * What every response from play.deck.cool carries, page or file: the headers
 * every site sends, with this site's CSP, and fullscreen allowed, which the
 * players' fullscreen buttons use, and only the site's own pages may.
 */
export const RESPONSE_HEADERS = responseHeaders(CONTENT_SECURITY_POLICY, { allow: { fullscreen: "(self)" } });

/** The directory the build names each file in by its content's hash: the stylesheet and the scripts. */
export const HASHED_PREFIXES = ["/assets/"] as const;
