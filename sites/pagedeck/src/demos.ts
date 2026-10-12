/**
 * The demos pagedeck's docs mark, each as `<!-- demo:<name> -->`, by name.
 * Each is an island in components/demos/, in a file of the marker's name.
 * @pagedeck/docs 0.2.3 marks none, so the site registers none, and a marker
 * fails the build. pagedeck's own repo checks only a marker's form
 * (packages/docs/src/contract.test.ts) and keeps no list of names, so agree a
 * new name here, as docs/docs-contract.md's "Demos" says, before a release of
 * @pagedeck/docs marks it. The page that marks it then needs its own budget
 * in pagedeck.config.ts: "/docs/**" allows 0 B.
 */
const NAMES = [] as const;

/** For defineDocs' `demos`: each name a page may mark, and its island, from the site's root. */
export const DEMOS: Readonly<Record<string, string>> = Object.fromEntries(NAMES.map((name) => [name, `./components/demos/${name}.tsx`]));
