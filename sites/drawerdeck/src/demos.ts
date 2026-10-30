/**
 * The demos drawerdeck's docs mark, each as `<!-- demo:example-<name> -->`, by
 * name. Each is an island in components/demos/, in a file of the marker's
 * name.
 */
const NAMES = ["quickstart", "sides"] as const;

/** For defineDocs' `demos`: each name a page may mark, and its island, from the site's root. */
export const DEMOS: Readonly<Record<string, string>> = Object.fromEntries(
  NAMES.map((name) => [`example-${name}`, `./components/demos/example-${name}.tsx`]),
);
