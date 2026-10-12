import type { BuildSection } from "@pagedeck/core";

// Each component's name in build.components. Only the probes and search
// declare `hydrate`, because fold tuning never promotes a declared mode.
export const LANDING_PAGE = "landing_page";
export const ISLAND_PAGE = "island_page";
export const COUNTER = "counter";
export const FEATURES_PAGE = "features_page";
export const FEATURE_SECTION = "feature_section";
export const ISLAND_LOAD = "island_load";
export const ISLAND_IDLE = "island_idle";
export const ISLAND_VISIBLE = "island_visible";
export const STATIC_PROBE = "static_probe";
export const SEARCH = "search";
export const CONSENT_BANNER = "consent_banner";
export const EMBED_FRAME = "embed_frame";
export const RESPONSIVE_IMAGE = "responsive_image";
export const FONT_SPECIMEN = "font_specimen";
export const SOCIAL_CARD = "social_card";
// Registered, because a client-reference proxy stands in only for a registered
// "use client" module.
export const CONTENT_PAGE = "content_page";
export const VARIANT_PICKER = "variant_picker";
export const SEARCH_PAGE = "search_page";
export const FAMILY_BAR = "familyBar";
export const FOOTER = "footer";
/** The layout every docs page renders into, which pagedeck.config.ts hands to defineDocs. */
export const DOCS_PAGE = "docsPage";

export const components: BuildSection["components"] = {
  [LANDING_PAGE]: "./components/landing_page.tsx",
  [ISLAND_PAGE]: "./components/island_page.tsx",
  [COUNTER]: "./components/counter.tsx",
  [FEATURES_PAGE]: "./components/features_page.tsx",
  [FEATURE_SECTION]: "./components/feature_section.tsx",
  [ISLAND_LOAD]: { path: "./components/island_load.tsx", hydrate: "load" },
  [ISLAND_IDLE]: { path: "./components/island_idle.tsx", hydrate: "idle" },
  [ISLAND_VISIBLE]: { path: "./components/island_visible.tsx", hydrate: "visible" },
  [STATIC_PROBE]: "./components/static_probe.tsx",
  // Idle: hydrating it fetches nothing, and `visible` would hydrate it the
  // moment it scrolled into view.
  [SEARCH]: { path: "@pagedeck/search/island", hydrate: "idle" },
  [CONSENT_BANNER]: "./components/consent_banner.tsx",
  [EMBED_FRAME]: "./components/embed_frame.tsx",
  [RESPONSIVE_IMAGE]: "./components/responsive_image.tsx",
  [FONT_SPECIMEN]: "./components/font_specimen.tsx",
  [SOCIAL_CARD]: "./components/social_card.tsx",
  [CONTENT_PAGE]: "./components/content_page.tsx",
  [VARIANT_PICKER]: "./components/variant_picker.tsx",
  [SEARCH_PAGE]: "./components/search-page.tsx",
  [FAMILY_BAR]: "./components/family-bar.tsx",
  [FOOTER]: "./components/footer.tsx",
  [DOCS_PAGE]: "./components/docs-page.tsx",
};
