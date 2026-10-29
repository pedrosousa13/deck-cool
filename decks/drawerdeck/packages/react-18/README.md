# @drawerdeck/react-18

`@drawerdeck/react` built for React 18, and for React 19 too. It has the
same parts, props and types, from the same source.

On React 18, install it in place of `@drawerdeck/react` and import from
`@drawerdeck/react-18`. On React 19, `@drawerdeck/react` stays the package
for an app on React 19 alone; install this one instead where a dependency
needs to run on either. It is published at the same version as
`@drawerdeck/react`.

## How it is built

The source in `packages/react/src` is written for React 19, and this package
does not change it. The React 19 package ships the same code it did before,
at the same size. This package's build (`vite.config.ts`) adapts the source to
run on React 18, and on React 19:

- `src/react.ts` stands in for `react`. `use` reads a context through its own
  `Provider`, a context renders as its own provider on React 19 or a separate
  one on React 18, and `useLayoutEffect` is `useEffect` on the server, where
  React 18 warns about it. In development, it reports a React other than 18
  or 19.
- Every part in the source is wrapped in `forwardRef` (`src/with-ref.ts`), so
  a `ref` reaches its element the way `forwardRef` passes it, on both
  versions.

The source renders no host element React 18 and 19 treat differently, so the
build needs no `react/jsx-runtime` shim.

**A known gap:** a `render` element's own `ref` (Base UI's and vaul's
convention) composes with a part's own ref by reading it off the given
element's `props`, which is where React 19 keeps it. React 18 keeps a
`ref` out of `props`, on the element's own `ref` field instead, so on React
18 a `render` element's own `ref` is not composed; the part's own ref still
reaches its node. The same read, unaffected by this package's build,
is in the source.

## Tests

`pnpm test:react-18` builds this package, then type-checks a consumer
(`test/consumer.tsx`) with React 18's types. It then runs the drawer
package's tests on React 18 against the build (`vitest.react-18.config.ts`
at the repo root), with this package's own tests in `test/`. `pnpm
test:react-19` runs the same type-check with React 19's types instead, then
the same tests on React 19 against the same build
(`vitest.react-19.config.ts`), aliased to the React 19 the workspace already
has for `@drawerdeck/react`. A test specific to one version's own sanity
check is excluded from the other's run, by name, in its config.
