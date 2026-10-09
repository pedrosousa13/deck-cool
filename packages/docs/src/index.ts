import { defineCollection } from "@pagedeck/content";
import type { Collection } from "@pagedeck/content";
import type { MarkdownLoaderOptions } from "@pagedeck/markdown-loader";
import type { TrailingSlash } from "@pagedeck/core";
import { contentRootOf, createDocsLoader } from "./loader.ts";
import type { DocsPage } from "./loader.ts";

export type { DocsPage } from "./loader.ts";

/** A component as `build.components` declares one: a module path, or `{ path, hydrate }`. */
export type ComponentDeclaration = string | { readonly path: string; readonly hydrate?: "load" | "idle" | "visible" | "none" };

export interface DocsOptions extends Pick<MarkdownLoaderOptions, "languages" | "theme"> {
  /** The site's `pagedeck.config.ts`, as `import.meta.url`. The package resolves from here. */
  readonly from: string | URL;
  /** The docs package's name, such as `@slidedeck/docs`. */
  readonly package: string;
  /** Where the docs live on the site, such as `/docs`. */
  readonly base: `/${string}`;
  /** The `build.components` key of the component every docs page renders into. */
  readonly layout: string;
  /** Each demo name a page may mark, and the component the site shows there. */
  readonly demos: Readonly<Record<string, ComponentDeclaration>>;
  /** The site's `trailingSlash`. Pagedeck's default is `"always"`. */
  readonly trailingSlash?: TrailingSlash;
}

export interface Docs {
  readonly collection: Collection<DocsPage>;
  /** Give it to `build.passthrough.contentRoot`, which publishes each image a page shows. */
  readonly contentRoot: string;
}

export function defineDocs(options: DocsOptions): Docs {
  const collection = defineCollection<DocsPage>({
    name: "docs",
    loader: createDocsLoader(options),
    schema: false,
  });
  return { collection, contentRoot: contentRootOf(options.from) };
}
