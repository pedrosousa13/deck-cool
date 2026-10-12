/** playdeck's own repo. GLOSSARY.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/playdeck";

/** playdeck's canonical site. Every page here names its own path on it as canonical (GLOSSARY.md). */
export const ORIGIN = "https://play.deck.cool";

/** playdeck's docs, under /docs, from @playdeck/docs. They have no index.md, so they start at start.md. */
export const DOCS = {
  start: "/docs/start/",
} as const;

/** Each page this site builds itself, and the comparison guide, a docs page the Family bar links. */
export const PATHS = {
  home: "/",
  examples: "/examples/",
  comparison: "/docs/guides/comparison/",
  search: "/docs/search/",
} as const;
