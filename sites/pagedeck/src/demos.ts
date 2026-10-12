/**
 * The demos pagedeck's docs mark, each as `<!-- demo:<name> -->`, by name.
 * @pagedeck/docs 0.2.3 marks none, so the site registers none, and a release
 * that marks one fails the build until its island is in components/demos/,
 * in a file of the marker's name, and its name is here.
 */
const NAMES = [] as const;

/** For defineDocs' `demos`: each name a page may mark, and its island, from the site's root. */
export const DEMOS: Readonly<Record<string, string>> = Object.fromEntries(NAMES.map((name) => [name, `./components/demos/${name}.tsx`]));
