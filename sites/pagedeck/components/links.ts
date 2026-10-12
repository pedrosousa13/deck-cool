/** pagedeck's own repo. GLOSSARY.md: a package site links its deck's repo, never a GitHub profile. */
export const REPO = "https://github.com/pedrosousa13/pagedeck";

/**
 * pagedeck's docs, under /docs, from @pagedeck/docs: index.md is /docs/, and
 * the site config reference is a page with tables and plain blocks.
 */
export const DOCS = {
  start: "/docs/",
  siteConfig: "/docs/reference/site-config/",
} as const;

/** Each page this site builds. */
export const PATHS = {
  home: "/",
  interactive: "/interactive/",
  features: "/features/",
  cmsDemo: "/content/",
  search: "/docs/search/",
} as const;
