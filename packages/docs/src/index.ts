import { defineCollection, getEntry } from "@pagedeck/content";
import type { Collection, Entry } from "@pagedeck/content";
import { fromCollection } from "@pagedeck/core";
import type { defineConfig } from "@pagedeck/core";
import type { EntryNode, Page, PageContent, PageSource, TrailingSlash } from "@pagedeck/core";
import type { MarkdownLoaderOptions } from "@pagedeck/markdown-loader";
import { fileURLToPath } from "node:url";
import { contentRootOf, createDocsLoader } from "./loader.ts";
import type { DocsPage } from "./loader.ts";

export type { DocsPage, NavGroup } from "./loader.ts";

/** A component as `build.components` declares one: a module path, or `{ path, hydrate }`. */
export type ComponentDeclaration = NonNullable<Parameters<typeof defineConfig>[0]["build"]>["components"][string];

export interface DocsOptions extends Pick<MarkdownLoaderOptions, "languages" | "theme"> {
  /**
   * The site's `pagedeck.config.ts`, as `import.meta.url`. The package resolves from here,
   * and its images are staged in `.pagedeck-docs/` beside it.
   */
  readonly from: string | URL;
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

/** What the layout component gets; the page's body arrives as its children. */
export type DocsLayoutProps = Pick<DocsPage, "title" | "description" | "href" | "nav">;

/** The pieces a site's `pagedeck.config.ts` wires in. */
export interface Docs {
  readonly collection: Collection<DocsPage>;
  /** For `build.pages`: one page per docs page, rendered by `content`. */
  readonly pages: PageSource<Entry<DocsPage>>;
  /** For `build.components`, spread in: the prose between demos, and each demo. */
  readonly components: Readonly<Record<string, ComponentDeclaration>>;
  /** For `build.content`: a docs page's tree, the layout around its prose and demos. */
  readonly content: (page: Page, store: Parameters<typeof getEntry>[0]) => PageContent;
  /** For `build.passthrough.contentRoot`, which publishes each image a page shows. */
  readonly contentRoot: string;
}

const COLLECTION = "docs";
const PROSE = "docsProse";

function demoComponent(name: string): string {
  return `docsDemo:${name}`;
}

export function defineDocs(options: DocsOptions): Docs {
  const collection = defineCollection<DocsPage>({
    name: COLLECTION,
    loader: createDocsLoader(options),
    schema: false,
  });

  const content: Docs["content"] = (page, store) => {
    const entry = page.collection === COLLECTION && page.entry !== undefined ? getEntry(store, collection, page.entry) : undefined;
    if (entry === undefined) {
      throw new Error(`Page ${page.path}: is not a docs page — render it with build.content only for pages from the docs collection`);
    }
    const { title, description, href, nav, body } = entry.data;
    if (href !== page.path) {
      throw new Error(
        `Docs page ${page.path}: the docs loader linked it as "${href}" — give defineDocs the trailingSlash the site's pages use`,
      );
    }
    const children = body.map(
      (part): EntryNode =>
        part.kind === "html" ? { component: PROSE, props: { html: part.html } } : { component: demoComponent(part.name) },
    );
    const props: DocsLayoutProps = { title, description, href, nav };
    return { tree: [{ component: options.layout, props, children }] };
  };

  return {
    collection,
    pages: fromCollection(collection),
    components: {
      [PROSE]: fileURLToPath(new URL("./prose.tsx", import.meta.url)),
      ...Object.fromEntries(Object.entries(options.demos).map(([name, component]) => [demoComponent(name), component])),
    },
    content,
    contentRoot: contentRootOf(options.from),
  };
}
