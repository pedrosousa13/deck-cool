import { docsHref } from "@deck-cool/docs";
import { readFileSync } from "node:fs";

// For the tests: the docs pages the build makes from the installed @slidedeck/docs.

const DOCS = new URL("../node_modules/@slidedeck/docs/", import.meta.url);

export interface DocsNavPage {
  /** The page's file in the docs package, such as `guides/layout.md`. */
  readonly file: string;
  /** Its address, such as `/docs/guides/layout/`. */
  readonly path: string;
  /** Its file in the build, such as `docs/guides/layout/index.html`. */
  readonly html: string;
  /** The demos it marks, by name, in order. */
  readonly demos: readonly string[];
}

/** Each page in nav.json, in order. */
export const DOCS_NAV: readonly DocsNavPage[] = (JSON.parse(readFileSync(new URL("nav.json", DOCS), "utf8")) as { pages: string[] }[])
  .flatMap((group) => group.pages)
  .map((file) => {
    const path = docsHref("/docs", file);
    const markdown = readFileSync(new URL(file, DOCS), "utf8");
    const demos = [...markdown.matchAll(/^<!-- demo:([\w-]+) -->$/gm)].map(([, name = ""]) => name);
    return { file, path, html: `${path.slice(1)}index.html`, demos };
  });
