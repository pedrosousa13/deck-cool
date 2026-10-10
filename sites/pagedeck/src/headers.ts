import { responseHeaders } from "@deck-cool/site-kit/headers";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/** What every response from page.deck.cool carries, page or file: the headers every site sends, with this site's CSP. */
export const RESPONSE_HEADERS = responseHeaders(CONTENT_SECURITY_POLICY);

/** The directories the build names each file in by its content's hash: the stylesheet and scripts, the subset font, and the social card. */
export const HASHED_PREFIXES = ["/assets/", "/fonts/", "/social/"] as const;
