import type { HeaderField } from "@pagedeck/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Narrows away `null` and `undefined`, failing the test when the value is missing. */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`${what} is missing`);
  return value;
}

/** The element's text, with runs of white space as one space. */
export function text(element: { readonly textContent: string | null } | null | undefined): string | undefined {
  return element?.textContent?.replace(/\s+/g, " ").trim();
}

export interface ManifestPage {
  path: string;
  output: string;
  /** The page's islands, by name. */
  components: string[];
}

export interface Manifest {
  pages: ManifestPage[];
  /** Each file's path. */
  files: string[];
  /** Each routing tree's declared 404 page. */
  notFound: unknown[];
}

/** The site's built manifest.json: its pages, its files and each tree's 404 page, checked as they are read. */
export function readManifest(site: string): Manifest {
  const value: unknown = JSON.parse(readFileSync(join(site, "site/manifest.json"), "utf8"));
  if (
    !isRecord(value) ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.files) ||
    !isRecord(value.routing) ||
    !Array.isArray(value.routing.trees)
  ) {
    throw new Error("manifest.json has no pages, files or routing.trees");
  }
  return {
    pages: value.pages.map((page: unknown) => {
      if (!isRecord(page) || typeof page.path !== "string" || typeof page.output !== "string") {
        throw new Error("a manifest page has no path or output");
      }
      const components = Array.isArray(page.components) ? page.components : [];
      return {
        path: page.path,
        output: page.output,
        components: components.map((component: unknown) =>
          present(isRecord(component) && typeof component.name === "string" ? component.name : undefined, "a component's name"),
        ),
      };
    }),
    files: value.files.map((file: unknown) =>
      present(isRecord(file) && typeof file.path === "string" ? file.path : undefined, "a manifest file's path"),
    ),
    notFound: value.routing.trees.map((tree: unknown) => (isRecord(tree) ? tree.notFound : undefined)),
  };
}

/**
 * The headers every response from a site carries, page or file, given its CSP.
 * Spelled out here, not read from the site's `src/headers.ts` or from site-kit's
 * `src/headers.ts`, which builds it, so a test that checks a build against it
 * checks both. Permissions-Policy is left out: each site's build test checks it.
 */
export function everyResponse(csp: HeaderField): Record<string, string> {
  return {
    [csp.name]: csp.value,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}
