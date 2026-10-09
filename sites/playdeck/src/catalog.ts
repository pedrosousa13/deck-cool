import type { BuildSection } from "@pagedeck/core";

// Each component's name in build.components.
export const HOME_PAGE = "home_page";
export const EXAMPLES_PAGE = "examples_page";
export const STREAMING_SERVICE = "streaming_service";
export const COURSE_PLATFORM = "course_platform";
/** The home page's one player, which it renders once per skin. */
export const SKIN_PLAYER = "skin_player";
export const PROSE = "prose";
export const SEARCH = "search";
export const SEARCH_PAGE = "search_page";
export const FAMILY_BAR = "familyBar";
export const FOOTER = "footer";
/** The layout every docs page renders into: the comparison guide now, and #52's docs through defineDocs. */
export const DOCS_PAGE = "docsPage";

export const components: BuildSection["components"] = {
  [HOME_PAGE]: "./components/home-page.tsx",
  [EXAMPLES_PAGE]: "./components/examples-page.tsx",
  [STREAMING_SERVICE]: "./components/archetype-streaming-service.tsx",
  [COURSE_PLATFORM]: "./components/archetype-course-platform.tsx",
  [SKIN_PLAYER]: "./components/skin-player.tsx",
  [PROSE]: "./components/prose.tsx",
  // Idle: hydrating it fetches nothing, and `visible` would hydrate it the
  // moment it scrolled into view.
  [SEARCH]: { path: "@pagedeck/search/island", hydrate: "idle" },
  [SEARCH_PAGE]: "./components/search-page.tsx",
  [FAMILY_BAR]: "./components/family-bar.tsx",
  [FOOTER]: "./components/footer.tsx",
  [DOCS_PAGE]: "./components/docs-page.tsx",
};
