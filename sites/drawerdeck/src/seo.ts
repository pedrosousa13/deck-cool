// What a page tells search engines: its title, and the `description` in its
// frontmatter. A docs page's comes from @drawerdeck/docs.

import { getEntry, type Collection, type ContentStoreReader } from "@pagedeck/content";
import type { Page, PageHead } from "@pagedeck/core";
import type { MarkdownEntry } from "@pagedeck/markdown-loader";
import type { DocsPage } from "@deck-cool/docs";

/**
 * Where the site is served in production (GLOSSARY.md). Every canonical and
 * og:url names it, whichever host serves a build, so a preview never claims
 * to be the page.
 */
export const SITE_ORIGIN = "https://drawer.deck.cool";

interface Described {
  title: string;
  /** What the tab and search results show, where it differs from the title. */
  tabTitle?: string;
  description: string | undefined;
}

function describe(
  page: Page,
  store: ContentStoreReader,
  pages: Collection<MarkdownEntry>,
  docs: Collection<DocsPage>,
): Described | undefined {
  if (page.entry === undefined) return undefined;
  if (page.collection === docs.name) {
    const doc = getEntry(store, docs, page.entry)?.data;
    return doc === undefined ? undefined : { title: doc.title, tabTitle: `${doc.title} · drawerdeck docs`, description: doc.description };
  }
  if (page.collection !== pages.name) return undefined;
  const entry = getEntry(store, pages, page.entry)?.data;
  if (entry === undefined) return undefined;
  const description = entry.frontmatter["description"];
  return { title: entry.title, description: typeof description === "string" ? description : undefined };
}

const url = (path: string) => `${SITE_ORIGIN}${path}`;

/** build.head: the title and the description. */
export function headOf(
  page: Page,
  store: ContentStoreReader,
  pages: Collection<MarkdownEntry>,
  docs: Collection<DocsPage>,
): PageHead | undefined {
  const described = describe(page, store, pages, docs);
  if (described === undefined) return undefined;
  const { title, tabTitle, description } = described;
  return {
    title: tabTitle ?? title,
    ...(description === undefined ? {} : { description }),
  };
}

/** The props of the chrome's `pageMeta`: what build.head has no field for. */
export const pageMetaOf = (page: Page) => ({ url: url(page.path) });
