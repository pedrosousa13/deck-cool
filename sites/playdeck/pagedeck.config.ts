import { cloudflarePages } from "@pagedeck/adapter-cloudflare-pages";
import { listEntries } from "@pagedeck/content";
import type { ContentStoreReader } from "@pagedeck/content";
import { defineConfig, defineLocales, definePages } from "@pagedeck/core";
import type { Page, PageContent, PageHead, PageSource, Route } from "@pagedeck/core";
import { defineSearch } from "@pagedeck/search";
import { cpSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { codeToHtml } from "shiki";
import { defineDocs } from "@deck-cool/docs";
import { HASHED_FILE_HEADERS } from "@deck-cool/site-kit/headers";
import type { SourceFile } from "./components/examples-page.tsx";
import { DOCS, ORIGIN, PATHS, REPO } from "./components/links.ts";
import {
  components,
  COURSE_PLATFORM,
  DOCS_PAGE,
  EXAMPLES_PAGE,
  FAMILY_BAR,
  FOOTER,
  HOME_PAGE,
  SEARCH,
  SEARCH_PAGE,
  STREAMING_SERVICE,
} from "./src/catalog.ts";
import { playdeckChunkNames } from "./src/chunk-names.ts";
import { DEMOS } from "./src/demos.ts";
import { docsProse } from "./src/docs-prose.ts";
import { HASHED_PREFIXES, RESPONSE_HEADERS } from "./src/headers.ts";
import { CODE_THEME } from "./src/code-theme.ts";
import { SKINS, skins } from "./src/skins.ts";

const LOCALE = "en";

/** The home page: GLOSSARY.md's "The landing pages' message". */
const HOME = {
  title: "Playdeck: A video player you compose, not one you configure",
  description:
    "A React video player you compose from parts and style with your own CSS. One API plays your own files, HLS, YouTube, Vimeo and Wistia.",
  // The quickstart in playdeck's README at 1.3.0 (cf72813), verbatim.
  quickstart: `import * as Player from '@playdeck/react';

// One API across MP4/WebM, HLS, YouTube, Vimeo and Wistia: the source decides
// which provider loads, and nothing else changes.
export const Clip = () => (
  <Player.Root source="https://example.com/clip.mp4">
    <Player.Viewport>
      <Player.Media />
      <Player.Controls>
        <Player.PlayButton />
        <Player.SeekSlider />
        <Player.Time type="current" />
        <Player.FullscreenButton />
      </Player.Controls>
    </Player.Viewport>
  </Player.Root>
);`,
} as const;

const EXAMPLES = {
  title: "Examples — Playdeck",
  description:
    "Two players composed from playdeck's primitives for two different jobs, a streaming service and a course platform, each beside the files it is made of.",
} as const;

/** Each archetype's files, as the examples page prints them. */
const ARCHETYPES = {
  streaming: ["components/archetype-streaming-service.tsx", "styles/archetype-streaming-service.css"],
  course: ["components/archetype-course-platform.tsx", "styles/archetype-course-platform.css"],
} as const;

// The docs' search page, under /docs.
const SEARCH_COPY = {
  title: "Search",
  description:
    "Search playdeck's site by keyword, with pages that match in their title ranked above pages that match only in their body.",
  intro: "Search every page of this site. Results are ranked by where the words appear — a title match comes before a body match.",
  label: "Search the site",
  emptyLabel: "No page matches those words.",
} as const;

/** The Family bar's links, after the switcher and the name. */
const BAR_LINKS = [
  { label: "Docs", href: DOCS.start },
  { label: "Examples", href: PATHS.examples },
  { label: "Comparison", href: PATHS.comparison },
  { label: "Search", href: PATHS.search },
  { label: "GitHub", href: REPO },
];

/** The docs pages that mark a demo, in @playdeck/docs 1.3.0. */
const DOCS_DEMO_PAGES = ["/docs/examples/"];

// Measured, not chosen: each is the page's size rounded up to a whole
// kilobyte. Re-measure rather than raise one. The home page's counts its eager
// chunks only, not the chunks its players load when they come into view; the
// maintainer ruled the budget is not a constraint on that page.
const BUDGET = {
  "/**": "0b",
  [PATHS.home]: "59kb",
  [PATHS.examples]: "89kb",
  [PATHS.search]: "60kb",
  // A docs page with no demo ships nothing: search is a page of its own.
  "/docs/**": "0b",
  // A docs page with demos ships playdeck and its demos. Budget globs cannot
  // pick out the pages with a demo, so each is listed. They share one budget,
  // the largest one's, so a release that moves or adds a demo among these pages
  // still builds; a demo on another page needs it listed.
  ...Object.fromEntries(DOCS_DEMO_PAGES.map((path) => [path, "85kb"])),
};

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

// playdeck's docs, from the @playdeck/docs this site pins, under /docs.
const docs = defineDocs({
  from: import.meta.url,
  package: "@playdeck/docs",
  base: "/docs",
  layout: DOCS_PAGE,
  demos: DEMOS,
  languages: ["css", "sh", "ts", "tsx"],
  theme: CODE_THEME,
  prose: (html, page) => docsProse(html, { comparison: page.path === PATHS.comparison }),
});

/** A page with no entry behind it, at `route`. `instances` annotates its parameter, which would otherwise infer as `unknown`. */
function singlePage(route: Route): PageSource<Record<string, never>> {
  return {
    instances: (_store: ContentStoreReader) => [{ locale: LOCALE, params: {}, dependencies: [] }],
    route: () => route,
  };
}

/** `code`, highlighted as the markdown loader highlights a fence. */
function highlight(code: string, lang: string): Promise<string> {
  return codeToHtml(code, { lang, theme: CODE_THEME });
}

/** The version of @playdeck/react this site installs, which the home page's hero names. */
function playdeckVersion(): string {
  const pkg: unknown = JSON.parse(readFileSync("./node_modules/@playdeck/react/package.json", "utf8"));
  const version = typeof pkg === "object" && pkg !== null && "version" in pkg ? pkg.version : undefined;
  if (typeof version !== "string") throw new Error("@playdeck/react's package.json has no version");
  return version;
}

async function homeContent(): Promise<PageContent> {
  return {
    tree: [
      {
        component: HOME_PAGE,
        props: {
          version: playdeckVersion(),
          skins: skins(),
          quickstart: await highlight(HOME.quickstart, "tsx"),
        },
      },
    ],
  };
}

/** Each file, read from disk and highlighted, so the page prints what runs. */
function sources(paths: readonly string[]): Promise<SourceFile[]> {
  return Promise.all(
    paths.map(async (path) => ({
      path: `sites/playdeck/${path}`,
      // The final newline is the file's, not the example's.
      html: await highlight(readFileSync(path, "utf8").trimEnd(), path.endsWith(".css") ? "css" : "tsx"),
    })),
  );
}

async function examplesContent(): Promise<PageContent> {
  return {
    tree: [
      {
        component: EXAMPLES_PAGE,
        props: { streaming: await sources(ARCHETYPES.streaming), course: await sources(ARCHETYPES.course) },
        children: [
          { component: STREAMING_SERVICE },
          { component: COURSE_PLATFORM },
        ],
      },
    ],
  };
}

function contentOf(page: Page, store: ContentStoreReader): PageContent | Promise<PageContent> {
  if (page.path === PATHS.home) return homeContent();
  if (page.path === PATHS.examples) return examplesContent();
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
  return docs.content(page, store);
}

function headOf(page: Page): PageHead | undefined {
  if (page.path === PATHS.home) return { title: HOME.title, description: HOME.description };
  if (page.path === PATHS.examples) return { title: EXAMPLES.title, description: EXAMPLES.description };
  if (page.path === PATHS.search) return { title: SEARCH_COPY.title, description: SEARCH_COPY.description };
  // A docs page's title and description are the docs layout's.
  return undefined;
}

export default defineConfig({
  collections: [docs.collection],
  build: {
    adapter: cloudflarePages(),
    // Every page names its own path here as canonical: play.deck.cool is
    // playdeck's canonical address (GLOSSARY.md).
    origin: ORIGIN,
    pages: definePages({
      locales: defineLocales({ en: { label: "English", direction: "ltr" } }),
      sources: [
        docs.pages,
        ...[PATHS.home, PATHS.examples, PATHS.search].map((path) =>
          singlePage(path === "/" ? "/" : path.slice(1, -1).split("/")),
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
    // puts a sheet in the one shared sheet only when the two names match
    // (pedrosousa13/pagedeck#135). Named through pnpm's link, brand.css and
    // family-bar.css went to a second sheet that only pages with an island link.
    css: [
      "./node_modules/@deck-cool/brand/styles/brand.css",
      "./node_modules/@deck-cool/brand/styles/family-bar.css",
      "./node_modules/@deck-cool/brand/styles/skin-sheet.css",
      "./styles/playdeck.css",
      "./styles/archetype-streaming-service.css",
      "./styles/archetype-course-platform.css",
      ...SKINS.map((skin) => `./${skin.file}`),
    ].map((sheet) => realpathSync(sheet)),
    // The brand's icons and the site's own files; and the docs' images.
    passthrough: { root: stagePublic(), contentRoot: docs.contentRoot },
    routing: {
      // The docs have no index.md, so /docs/ goes to their first page.
      redirects: [{ from: "/docs/", to: DOCS.start, status: 301 }],
      headers: [
        { prefix: "/", set: [...RESPONSE_HEADERS] },
        ...HASHED_PREFIXES.map((prefix) => ({ prefix, set: [...RESPONSE_HEADERS, ...HASHED_FILE_HEADERS] })),
      ],
    },
    vite: { plugins: [playdeckChunkNames()] },
    budget: BUDGET,
    search: defineSearch(),
  },
});
