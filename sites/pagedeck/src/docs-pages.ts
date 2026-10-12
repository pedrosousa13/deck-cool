import { docsHref } from "@deck-cool/docs";
import { readFileSync } from "node:fs";

// For the tests: the docs pages the build makes from the installed @pagedeck/docs.

const DOCS = new URL("../node_modules/@pagedeck/docs/", import.meta.url);

export interface DocsNavPage {
  /** The page's file in the docs package, such as `reference/fonts.md`. */
  readonly file: string;
  /** Its address, such as `/docs/reference/fonts/`. */
  readonly path: string;
  /** The demos it marks, by name, in order. */
  readonly demos: readonly string[];
}

/** Each page in nav.json, in order. */
export const DOCS_NAV: readonly DocsNavPage[] = (JSON.parse(readFileSync(new URL("nav.json", DOCS), "utf8")) as { pages: string[] }[])
  .flatMap((group) => group.pages)
  .map((file) => {
    const markdown = readFileSync(new URL(file, DOCS), "utf8");
    const demos = [...markdown.matchAll(/^<!-- demo:([\w-]+) -->$/gm)].map(([, name = ""]) => name);
    return { file, path: docsHref("/docs", file), demos };
  });
