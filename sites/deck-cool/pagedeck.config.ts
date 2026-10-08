import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { defineCollection } from "@pagedeck/content";
import { defineConfig, fromCollection, SECURITY_HEADERS } from "@pagedeck/core";
import { defineMarkdownLoader } from "@pagedeck/markdown-loader";

const pages = defineCollection({
  name: "pages",
  loader: defineMarkdownLoader({ root: "./content", locale: "en", languages: [] }),
  schema: false,
});

export default defineConfig({
  collections: [pages],
  build: {
    pages: [fromCollection(pages, { layout: "layout" })],
    components: { layout: "./components/layout.tsx" },
    routing: { headers: [{ prefix: "/", set: [...SECURITY_HEADERS] }] },
    // No page ships JavaScript.
    budget: { "/**": "0b" },
    adapter: cloudflarePages(),
  },
});
