import { demoComponent } from "@deck-cool/docs";
import type { BuildSection } from "@pagedeck/core";

// Each component's name in build.components.
export const HOME_PAGE = "home_page";
export const EXAMPLES_PAGE = "examples_page";
/** The docs' two demos, which defineDocs registers from src/demos.ts under these names; the examples page renders them too. */
export const STREAMING_SERVICE = demoComponent("streaming-service");
export const COURSE_PLATFORM = demoComponent("course-platform");
/** The home page's one player, which it renders once per skin. */
export const SKIN_PLAYER = "skin_player";
export const SEARCH = "search";
export const SEARCH_PAGE = "search_page";
export const FAMILY_BAR = "familyBar";
export const FOOTER = "footer";
/** The layout every docs page renders into, through defineDocs. */
export const DOCS_PAGE = "docsPage";

export const components: BuildSection["components"] = {
  [HOME_PAGE]: "./components/home-page.tsx",
  [EXAMPLES_PAGE]: "./components/examples-page.tsx",
  [SKIN_PLAYER]: "./components/skin-player.tsx",
  // Idle: hydrating it fetches nothing, and `visible` would hydrate it the
  // moment it scrolled into view.
  [SEARCH]: { path: "@pagedeck/search/island", hydrate: "idle" },
  [SEARCH_PAGE]: "./components/search-page.tsx",
  [FAMILY_BAR]: "./components/family-bar.tsx",
  [FOOTER]: "./components/footer.tsx",
  [DOCS_PAGE]: "./components/docs-page.tsx",
};
