/**
 * The demos carouseldeck's docs mark, each as `<!-- demo:example-<name> -->`, by
 * name. Each is an island in components/demos/, in a file of the marker's
 * name. The deck lists the same names, as SITE_DEMOS in
 * decks/carouseldeck/scripts/docs-contract.test.mjs: agree a new one there before a release of
 * @carouseldeck/docs marks it.
 */
const NAMES = [
  "autoplay",
  "centred-ends",
  "controlled",
  "curve",
  "curve-size",
  "custom-controls",
  "drag",
  "fade",
  "focal-slide",
  "hooks",
  "layout",
  "loop",
  "middle-by-progress",
  "middle-centred",
  "pages",
  "pages-breakpoints",
  "pages-prop",
  "per-breakpoint",
  "primitives",
  "progress",
  "quickstart",
  "right-to-left",
  "theme",
  "vertical",
] as const;

/** For defineDocs' `demos`: each name a page may mark, and its island, from the site's root. */
export const DEMOS: Readonly<Record<string, string>> = Object.fromEntries(
  NAMES.map((name) => [`example-${name}`, `./components/demos/example-${name}.tsx`]),
);
