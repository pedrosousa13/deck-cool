import { responseHeaders } from "@deck-cool/site-kit/headers";
import { CONTENT_SECURITY_POLICY } from "./csp.ts";

/** What every response from drawer.deck.cool carries, page or file: the headers every site sends, with this site's CSP. */
export const RESPONSE_HEADERS = responseHeaders(CONTENT_SECURITY_POLICY);
