/** pagedeck's own repo. CONTEXT.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/pagedeck";

/**
 * pagedeck's live docs, on their own Worker until #53 moves them to /docs here.
 * Until the pages exist, the build's link check refuses a /docs/ link.
 */
export const DOCS_ORIGIN = "https://pagedeck-docs.pedrodsousa.workers.dev";

/** Each page this site builds. */
export const PATHS = {
  home: "/",
  interactive: "/interactive/",
  features: "/features/",
  content: "/content/",
  search: "/docs/search/",
} as const;
