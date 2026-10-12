/**
 * The demos playdeck's docs mark, each as `<!-- demo:<name> -->`, by name.
 * Each is an island in components/demos/, in a file of the marker's name.
 * playdeck's own repo lists the same names, as DEMOS in
 * scripts/docs-package.mjs: agree a new one there before a release of
 * @playdeck/docs marks it.
 */
const NAMES = ["streaming-service", "course-platform"] as const;

/** For defineDocs' `demos`: each name a page may mark, and its island, from the site's root. */
export const DEMOS: Readonly<Record<string, string>> = Object.fromEntries(NAMES.map((name) => [name, `./components/demos/${name}.tsx`]));
