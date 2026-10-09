import { defineConfig } from "@pagedeck/core";
import { defineDocs } from "../../src/index.ts";

// A package site in miniature: the fixture docs package under /docs, with one demo.
const docs = defineDocs({
  from: import.meta.url,
  package: "@example/docs",
  base: "/docs",
  layout: "docsPage",
  demos: { counter: "./components/counter.tsx" },
  languages: ["sh"],
});

export default defineConfig({
  collections: [docs.collection],
  build: {
    pages: [docs.pages],
    components: { ...docs.components, docsPage: "./components/docs-page.tsx" },
    content: docs.content,
    passthrough: { contentRoot: docs.contentRoot },
    // Only the page with the demo ships JavaScript.
    budget: { "/**": "0b", "/docs/guides/demos/": "100kb" },
  },
});
