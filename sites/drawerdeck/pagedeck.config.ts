import { realpathSync } from "node:fs";
import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection } from "@pagedeck/content";
import { defineConfig, fromCollection } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
import { defineDocs } from "@deck-cool/docs";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import { DEMOS } from "./src/demos.ts";
import { CODE_THEME } from "./src/facts.ts";
import { RESPONSE_HEADERS } from "./src/headers.ts";
import { stagePublic } from "./src/public.ts";
import { headOf, pageMetaOf, SITE_ORIGIN } from "./src/seo.ts";

const brandSheet = (name: string) =>
  realpathSync(new URL(`./node_modules/@deck-cool/brand/styles/${name}`, import.meta.url));

const pages = defineCollection({
  name: "pages",
  loader: defineMarkdownLoader({ root: "./content", locale: "en", languages: [] }),
  schema: false,
});

// drawerdeck's docs, from the workspace's @drawerdeck/docs, under /docs.
const docs = defineDocs({
  from: import.meta.url,
  package: "@drawerdeck/docs",
  base: "/docs",
  layout: "docsPage",
  demos: DEMOS,
  languages: ["sh", "tsx"],
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
      landing: "./components/landing.tsx",
    },
    // The Family bar before <main>, and the footer after it, so they are the
    // page's banner and contentinfo landmarks.
    chrome: (page) => ({
      before: [
        { component: "pageMeta", props: pageMetaOf(page) },
        { component: "familyBar" },
      ],
      after: [{ component: "footer" }],
    }),
    // One hashed sheet under /assets/, linked from every page's <head>.
    css: [brandSheet("brand.css"), brandSheet("family-bar.css"), "./styles/drawerdeck.css"],
    // Each page's title and description: src/seo.ts.
    head: (page, store) => headOf(page, store, pages, docs.collection),
    origin: SITE_ORIGIN,
    sitemap: { pattern: "suffix" },
    robots: { allow: ["/"] },
    // The brand's icons and .assetsignore; and the docs' images.
    passthrough: { root: stagePublic(import.meta.url), contentRoot: docs.contentRoot },
    routing: {
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        { prefix: "/assets/", set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] },
      ],
    },
    adapter: cloudflarePages(),
  },
});
