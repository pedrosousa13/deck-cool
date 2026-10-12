import { realpathSync } from "node:fs";
import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection } from "@pagedeck/content";
import { defineConfig, fromCollection } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
import { defineSearch } from "@pagedeck/search";
import { defineDocs } from "@deck-cool/docs";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import { DEMOS } from "./src/demos.ts";
import { CODE_THEME } from "./src/facts.ts";
import { RESPONSE_HEADERS } from "./src/headers.ts";
import { stagePublic } from "./src/public.ts";
import { headOf, pageMetaOf, SITE_ORIGIN, socialInputsOf } from "./src/seo.ts";
import { SKINS } from "./src/skins.ts";
import { socialCard } from "./src/social-card.ts";

const brandSheet = (name: string) =>
  realpathSync(new URL(`./node_modules/@deck-cool/brand/styles/${name}`, import.meta.url));

const pages = defineCollection({
  name: "pages",
  loader: defineMarkdownLoader({ root: "./content", locale: "en", languages: [] }),
  schema: false,
});

/** The docs pages that mark a demo, in @slidedeck/docs 1.0.3. */
const DOCS_DEMO_PAGES = [
  "/docs/guides/autoplay/",
  "/docs/guides/drag/",
  "/docs/guides/effects/",
  "/docs/guides/focal-slide/",
  "/docs/guides/layout/",
  "/docs/guides/loop/",
  "/docs/guides/pages/",
  "/docs/guides/progress/",
  "/docs/guides/the-index/",
  "/docs/guides/theme/",
  "/docs/guides/vertical-and-rtl/",
  "/docs/quickstart/",
  "/docs/recipes/centred-ends/",
  "/docs/recipes/custom-controls/",
  "/docs/recipes/middle-slide/",
  "/docs/recipes/per-breakpoint/",
  "/docs/recipes/size-a-curve/",
  "/docs/reference/hooks/",
  "/docs/reference/primitives/",
];

// slidedeck's docs, from the @slidedeck/docs this site pins, under /docs.
const docs = defineDocs({
  from: import.meta.url,
  package: "@slidedeck/docs",
  base: "/docs",
  layout: "docsPage",
  demos: DEMOS,
  languages: ["css", "sh", "ts", "tsx"],
  theme: CODE_THEME,
});

export default defineConfig({
  collections: [pages, docs.collection],
  build: {
    pages: [fromCollection(pages, { layout: "layout" }), docs.pages],
    // The docs pages; content/'s pages render through their layout.
    content: docs.content,
    components: {
      layout: "./components/layout.tsx",
      // The docs layout, then the docs' prose and each demo.
      docsPage: "./components/docs-page.tsx",
      ...docs.components,
      familyBar: "./components/family-bar.tsx",
      footer: "./components/footer.tsx",
      pageMeta: "./components/page-meta.tsx",
      search: { path: "@pagedeck/search/island", hydrate: "idle" },
      landing: "./components/landing.tsx",
      examples: "./components/examples-page.tsx",
      // Each deck is an island where a page renders it.
      skinDeck: "./components/skin-deck.tsx",
      galleryDeck: "./components/showcase/gallery-deck.tsx",
      heroDeck: "./components/showcase/hero-deck.tsx",
      testimonialsDeck: "./components/showcase/testimonials-deck.tsx",
      storiesDeck: "./components/showcase/stories-deck.tsx",
      rtlDeck: "./components/showcase/rtl-deck.tsx",
      coverFlowDeck: "./components/showcase/cover-flow-deck.tsx",
    },
    // The Family bar, with search in it, before <main> and the footer after
    // it, so they are the page's banner and contentinfo landmarks.
    chrome: (page) => ({
      before: [
        { component: "pageMeta", props: pageMetaOf(page) },
        {
          component: "familyBar",
          children: [
            { component: "search", props: { locale: "en", label: "Search the docs", emptyLabel: "No page matches" } },
          ],
        },
      ],
      after: [{ component: "footer" }],
    }),
    // One hashed sheet under /assets/, linked from every page's <head>, in this
    // order: the Theme demo's sheet after the site's, the home page's two skins
    // last. The brand's sheets by their real paths: on a site with islands,
    // Pagedeck 0.2.3 puts a sheet in the core chunk only when its path is the
    // one the bundler resolves, and a path through node_modules' link is not.
    css: [
      brandSheet("brand.css"),
      brandSheet("family-bar.css"),
      brandSheet("skin-sheet.css"),
      "./styles/slidedeck.css",
      "./styles/demo-theme.css",
      ...SKINS.map((skin) => `./${skin.file}`),
    ],
    // Each page's title, description, share card and structured data: src/seo.ts.
    head: (page, store) => headOf(page, store, pages, docs.collection),
    socialImages: {
      adapter: socialCard(SITE_ORIGIN),
      inputs: (page, store) => socialInputsOf(page, store, pages, docs.collection),
    },
    origin: SITE_ORIGIN,
    sitemap: { pattern: "suffix" },
    robots: { allow: ["/"] },
    // The brand's icons and .assetsignore, and the examples' photos; and the
    // docs' images.
    passthrough: { root: stagePublic(import.meta.url), contentRoot: docs.contentRoot },
    search: defineSearch(),
    routing: {
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        { prefix: "/assets/", set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] },
      ],
    },
    // What each page transfers for first render, as `pnpm build` measured it,
    // rounded up to the next KB. A page with no budget of its own may ship none.
    // Re-measure rather than raise one.
    budget: {
      "/**": "0b",
      "/": "61kb",
      "/examples/": "61kb",
      // A docs page with no demo ships the search island alone.
      "/docs/**": "61kb",
      // A docs page with demos ships slidedeck and its demos too. Budget globs
      // cannot pick out the pages with a demo, so each is listed. They share
      // one budget, the largest one's, so a release that moves or adds a demo
      // among these pages still builds; a demo on another page needs it listed.
      ...Object.fromEntries(DOCS_DEMO_PAGES.map((path) => [path, "71kb"])),
    },
    adapter: cloudflarePages(),
  },
});
