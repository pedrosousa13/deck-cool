import { docsNav } from "@deck-cool/docs";

// For the tests: the docs pages the build makes from the installed @slidedeck/docs.

/** Each page in nav.json, in order. */
export const DOCS_NAV = docsNav({ from: import.meta.url, package: "@slidedeck/docs", base: "/docs" });
