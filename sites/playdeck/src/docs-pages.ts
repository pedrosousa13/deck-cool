import { docsNav } from "@deck-cool/docs";

// For the tests: the docs pages the build makes from the installed @playdeck/docs.

/** Each page in nav.json, in order. */
export const DOCS_NAV = docsNav({ from: import.meta.url, package: "@playdeck/docs", base: "/docs" });
