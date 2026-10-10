import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection } from "@pagedeck/content";
import { defineConfig, fromCollection } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import { RESPONSE_HEADERS } from "./src/headers.ts";

const pages = defineCollection({
  name: "pages",
  loader: defineMarkdownLoader({ root: "./content", locale: "en", languages: [] }),
  schema: false,
});

export default defineConfig({
  collections: [pages],
  build: {
    pages: [fromCollection(pages, { layout: "layout" })],
    components: {
      layout: "./components/layout.tsx",
      familyBar: "./components/family-bar.tsx",
      footer: "./components/footer.tsx",
    },
    // The Family bar before <main> and the footer after it, so they are the
    // page's banner and contentinfo landmarks.
    chrome: () => ({ before: [{ component: "familyBar" }], after: [{ component: "footer" }] }),
    // One hashed sheet under /assets/, linked from every page's <head>, in this order.
    css: [
      "./node_modules/@deck-cool/brand/styles/brand.css",
      "./node_modules/@deck-cool/brand/styles/family-bar.css",
      "./node_modules/@deck-cool/brand/styles/umbrella.css",
    ],
    // Every icon, served from the site's root.
    passthrough: { root: "./node_modules/@deck-cool/brand/public" },
    routing: {
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        { prefix: "/assets/", set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] },
      ],
    },
    // No page ships JavaScript.
    budget: { "/**": "0b" },
    adapter: cloudflarePages(),
  },
});
