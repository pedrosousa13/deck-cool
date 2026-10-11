/** playdeck's own repo. CONTEXT.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/playdeck";

/** playdeck's canonical site. Every page here names its own path on it as canonical (CONTEXT.md). */
export const ORIGIN = "https://play.deck.cool";

/**
 * playdeck's docs, where they are today: the Astro site at playdeck.video.
 * They move to /docs in #52, which points these links there. Until those
 * pages exist, the build's link check refuses a /docs/ link.
 */
export const DOCS = {
  start: "https://playdeck.video/start/",
} as const;

/** Each page this site builds, at the path playdeck.video serves it at today. */
export const PATHS = {
  home: "/",
  examples: "/examples/",
  comparison: "/guides/comparison/",
  search: "/docs/search/",
} as const;
