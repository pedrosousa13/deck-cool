/** pagedeck's own repo. GLOSSARY.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/pagedeck";

/** pagedeck's docs, under /docs, from @pagedeck/docs: index.md is /docs/. */
export const DOCS = {
  start: "/docs/",
} as const;

/** Each page this site builds. */
export const PATHS = {
  home: "/",
  interactive: "/interactive/",
  features: "/features/",
  cmsDemo: "/content/",
  search: "/docs/search/",
} as const;
