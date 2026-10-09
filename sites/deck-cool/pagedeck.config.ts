import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection } from "@pagedeck/content";
import { defineConfig, fromCollection } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";
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
    // brand.css, family-bar.css, umbrella.css and every icon, served from the site's root.
    passthrough: { root: "./node_modules/@deck-cool/brand/public" },
    routing: { headers: [{ prefix: "/", set: [...RESPONSE_HEADERS] }] },
    // No page ships JavaScript.
    budget: { "/**": "0b" },
    adapter: cloudflarePages(),
  },
});
