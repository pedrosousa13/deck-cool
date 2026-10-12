// What a page tells search engines and share cards, all from the page itself:
// its title, and the `description` in its frontmatter. A docs page's comes
// from @carouseldeck/docs.

import { getEntry, type Collection, type ContentStoreReader } from "@pagedeck/content";
import type { JsonLdNode, Page, PageHead, SocialImageInputs } from "@pagedeck/core";
import type { MarkdownEntry } from "@pagedeck/markdown-loader";
import type { DocsPage } from "@deck-cool/docs";
import { REPOSITORY } from "../components/links.ts";

/**
 * Where the site is served in production (GLOSSARY.md). Every canonical,
 * og:url and sitemap entry names it, whichever host serves a build, so a
 * preview never claims to be the page.
 */
export const SITE_ORIGIN = "https://carousel.deck.cool";

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
    return doc === undefined ? undefined : { title: doc.title, tabTitle: `${doc.title} · carouseldeck docs`, description: doc.description };
  }
  if (page.collection !== pages.name) return undefined;
  const entry = getEntry(store, pages, page.entry)?.data;
  if (entry === undefined) return undefined;
  const description = entry.frontmatter["description"];
  return { title: entry.title, description: typeof description === "string" ? description : undefined };
}

const url = (path: string) => `${SITE_ORIGIN}${path}`;

/** The home page: the repository, as schema.org describes source code. */
function sourceCode(description: string | undefined): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "carouseldeck",
    ...(description === undefined ? {} : { description }),
    url: url("/"),
    codeRepository: REPOSITORY,
    programmingLanguage: "TypeScript",
    runtimePlatform: "React 19",
    license: "https://opensource.org/licenses/MIT",
  };
}

/** build.head: the title, the description and, on the home page, the structured data. */
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
    ...(page.path === "/" ? { jsonLd: sourceCode(description) } : {}),
  };
}

/** build.socialImages' inputs: the card's headline. */
export function socialInputsOf(
  page: Page,
  store: ContentStoreReader,
  pages: Collection<MarkdownEntry>,
  docs: Collection<DocsPage>,
): SocialImageInputs | undefined {
  const described = describe(page, store, pages, docs);
  return described === undefined ? undefined : { headline: described.title };
}

/** The props of the chrome's `pageMeta`: what build.head has no field for. */
export const pageMetaOf = (page: Page) => ({ url: url(page.path) });
