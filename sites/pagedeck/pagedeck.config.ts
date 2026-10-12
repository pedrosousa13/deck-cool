import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection, getEntry, listEntries } from "@pagedeck/content";
import type { Collection, ContentStoreReader, Entry } from "@pagedeck/content";
import { defineConfig, defineLocales, definePages, fromCollection } from "@pagedeck/core";
import type { Page, PageContent, PageHead, PageSource, Route } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
import type { MarkdownEntry } from "@pagedeck/markdown-loader";
import { defineSearch } from "@pagedeck/search";
import { cpSync, realpathSync, rmSync } from "node:fs";
import { z } from "zod";
import { defineDocs, scrollableProse } from "@deck-cool/docs";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import { DOCS, PATHS, REPO } from "./components/links.ts";
import { components, COUNTER, DOCS_PAGE, FAMILY_BAR, FOOTER, ISLAND_PAGE, SEARCH, SEARCH_PAGE } from "./src/catalog.ts";
import { CODE_THEME } from "./src/code-theme.ts";
import { DEMOS } from "./src/demos.ts";
import { FEATURES_HEAD, featuresContent, FONTS, SCRIPTS, SOCIAL_IMAGES } from "./src/features.ts";
import { HASHED_PREFIXES, RESPONSE_HEADERS } from "./src/headers.ts";
import { CMS_DEMO_HEAD, cmsDemoContent } from "./src/cms-demo.ts";
import { SKINS, skins } from "./src/skins.ts";

const LOCALE = "en";
const TEMPLATE = "landing_page";

// The interactive page: one island, charged to this page alone.
const INTERACTIVE = {
  title: "Interactive only where you need it",
  description:
    "One button you can press, on a page that is otherwise plain HTML. Only this page loads the JavaScript the button needs, and pagedeck's home page still ships none.",
  intro:
    "This page has one button that counts your presses. Everything else is plain HTML, finished before you arrived. The button is the only part that needs JavaScript, the code that lets a page react to you, so this page loads that code and the home page still loads none. Developers call a part like this an island: a small interactive spot in a page of plain HTML.",
  label: "Press me",
} as const;

// The docs' search page, under /docs. Its index holds the landing pages too
// (#53), so a search for "islands" finds the island demo as well.
const SEARCH_COPY = {
  title: "Search",
  description:
    "Search pagedeck's site and documentation by keyword, with pages that match in their title ranked above pages that match only in their body.",
  intro:
    "Search every page of this site. Results are ranked by where the words appear — a title match comes before a body match.",
  label: "Search pagedeck",
  emptyLabel: "No page matches those words.",
} as const;

/** The Family bar's links, after the switcher and the name. */
const BAR_LINKS = [
  { label: "Docs", href: DOCS.start },
  { label: "Features", href: PATHS.features },
  { label: "Interactive demo", href: PATHS.interactive },
  { label: "Content demo", href: PATHS.cmsDemo },
  { label: "Search", href: PATHS.search },
  { label: "GitHub", href: REPO },
];

// Measured, not chosen: each is the page's size rounded up to a whole
// kilobyte. Re-measure rather than raise one.
const BUDGET = {
  "/**": "0b",
  [PATHS.interactive]: "60kb",
  [PATHS.features]: "60kb",
  [PATHS.cmsDemo]: "59kb",
  [PATHS.search]: "59kb",
  // A docs page ships nothing: search is a page of its own. @pagedeck/docs
  // 0.2.3 marks no demo; a page that marks one needs its own budget here.
  "/docs/**": "0b",
} as const;

/**
 * One directory to publish from: the brand kit's icons and .assetsignore, then
 * the site's own files. Passthrough reads one root, and skips a symlink.
 */
function stagePublic(): string {
  const stage = "./.pagedeck-public";
  rmSync(stage, { recursive: true, force: true });
  cpSync("./node_modules/@deck-cool/brand/public", stage, { recursive: true });
  cpSync("./public", stage, { recursive: true });
  return stage;
}

function documentSchema() {
  return z.object({
    title: z.string().min(1),
    html: z.string(),
    file: z.string(),
    frontmatter: z
      .object({
        // Fifty characters is a floor against a placeholder, not a style rule.
        description: z.string().min(50),
      })
      .catchall(z.union([z.string(), z.array(z.string()).readonly()])),
  });
}

type DocumentEntry = z.infer<ReturnType<typeof documentSchema>>;

const pages: Collection<DocumentEntry, MarkdownEntry> = defineCollection({
  name: "pages",
  loader: defineMarkdownLoader({ root: "./content", locale: LOCALE, languages: ["tsx"], theme: CODE_THEME }),
  templates: {
    templateOf: () => TEMPLATE,
    byTemplate: { [TEMPLATE]: [{ component: TEMPLATE, count: 1, foldScore: 0, depth: 0, isRoot: true }] },
  },
  schema: documentSchema(),
});

// `"/"`, not `[]`, which assembles to an empty route that `collectPages` refuses.
function documentRoute(entry: Entry<DocumentEntry>): Route {
  return entry.path === "index" ? "/" : entry.path.split("/");
}

// pagedeck's docs, from the @pagedeck/docs this site pins, under /docs.
const docs = defineDocs({
  from: import.meta.url,
  package: "@pagedeck/docs",
  base: "/docs",
  layout: DOCS_PAGE,
  demos: DEMOS,
  languages: ["css", "html", "js", "json", "sh", "toml", "ts", "tsx"],
  theme: CODE_THEME,
  // Each table in a region that scrolls, and each plain block focusable.
  prose: (html) => scrollableProse(html, { tableClass: "fw-table" }),
});

/** A page with no entry behind it, at `route`. `instances` annotates its parameter, which would otherwise infer as `unknown`. */
function singlePage(route: Route): PageSource<Record<string, never>> {
  return {
    instances: (_store: ContentStoreReader) => [{ locale: LOCALE, params: {}, dependencies: [] }],
    route: () => route,
  };
}

/** The home page's entry. A docs page's entry is in the docs' collection, not this one. */
function entryOf(page: Page, store: ContentStoreReader): Entry<DocumentEntry> | undefined {
  return page.collection !== pages.name || page.entry === undefined ? undefined : getEntry(store, pages, page.entry);
}

function contentOf(page: Page, store: ContentStoreReader): PageContent {
  if (page.path === PATHS.features) return featuresContent(page);
  if (page.path === PATHS.cmsDemo) return cmsDemoContent();
  if (page.path === PATHS.interactive) {
    return {
      tree: [
        {
          component: ISLAND_PAGE,
          props: { title: INTERACTIVE.title, intro: INTERACTIVE.intro },
          children: [{ component: COUNTER, props: { label: INTERACTIVE.label } }],
        },
      ],
    };
  }
  if (page.path === PATHS.search) {
    return {
      tree: [
        {
          component: SEARCH_PAGE,
          props: { title: SEARCH_COPY.title, intro: SEARCH_COPY.intro, nav: listEntries(store, docs.collection)[0]?.data.nav ?? [] },
          children: [
            { component: SEARCH, props: { locale: LOCALE, label: SEARCH_COPY.label, emptyLabel: SEARCH_COPY.emptyLabel } },
          ],
        },
      ],
    };
  }
  if (page.collection !== pages.name) return docs.content(page, store);
  const entry = entryOf(page, store);
  if (entry === undefined) {
    throw new Error(`Page ${page.path}: has no stored entry — run pagedeck sync before pagedeck build`);
  }
  return { template: TEMPLATE, props: { skins: skins() } };
}

function headOf(page: Page, store: ContentStoreReader): PageHead | undefined {
  if (page.path === PATHS.features) return FEATURES_HEAD;
  if (page.path === PATHS.cmsDemo) return CMS_DEMO_HEAD;
  if (page.path === PATHS.interactive) return { title: INTERACTIVE.title, description: INTERACTIVE.description };
  if (page.path === PATHS.search) return { title: SEARCH_COPY.title, description: SEARCH_COPY.description };
  // A docs page's title and description are the docs layout's.
  const entry = entryOf(page, store);
  return entry === undefined
    ? undefined
    : { title: `Pagedeck: ${entry.data.title}`, description: entry.data.frontmatter.description };
}

export default defineConfig({
  collections: [pages, docs.collection],
  build: {
    adapter: cloudflarePages(),
    pages: definePages({
      locales: defineLocales({ en: { label: "English", direction: "ltr" } }),
      sources: [
        fromCollection(pages, { route: documentRoute }),
        docs.pages,
        ...[PATHS.interactive, PATHS.features, PATHS.cmsDemo, PATHS.search].map((path) =>
          singlePage(path.slice(1, -1).split("/")),
        ),
      ],
    }),
    components: { ...components, ...docs.components },
    content: contentOf,
    head: headOf,
    // The Family bar before <main> and the footer after it, so they are the
    // page's banner and contentinfo landmarks.
    chrome: () => ({
      before: [{ component: FAMILY_BAR, props: { links: BAR_LINKS } }],
      after: [{ component: FOOTER }],
    }),
    // One hashed sheet under /assets/, linked from every page's <head>, in this
    // order. By real path: the bundler names a module by it, and Pagedeck 0.2.3
    // puts a sheet in the one shared sheet only when the two names match. Named
    // through pnpm's link, brand.css and family-bar.css went to a second sheet
    // that only pages with an island link.
    css: [
      "./node_modules/@deck-cool/brand/styles/brand.css",
      "./node_modules/@deck-cool/brand/styles/family-bar.css",
      "./node_modules/@deck-cool/brand/styles/skin-sheet.css",
      "./styles/pagedeck.css",
      ...SKINS.map((skin) => `./${skin.file}`),
    ].map((sheet) => realpathSync(sheet)),
    // The brand's icons and the site's own files; and the docs' images.
    passthrough: { root: stagePublic(), contentRoot: docs.contentRoot },
    routing: {
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        ...HASHED_PREFIXES.map((prefix) => ({ prefix, set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] })),
      ],
    },
    budget: BUDGET,
    search: defineSearch(),
    scripts: SCRIPTS,
    socialImages: SOCIAL_IMAGES,
    fonts: FONTS,
  },
});
