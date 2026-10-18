# @carouseldeck/react-18

`@carouseldeck/react` built for React 18, and for React 19 too. It has the
same components, props and types, from the same source.

On React 18, install it in place of `@carouseldeck/react` and import from
`@carouseldeck/react-18`. On React 19, `@carouseldeck/react` stays the package
for an app on React 19 alone; install this one instead where a dependency
needs to run on either. It is published at the same version as
`@carouseldeck/react`, from 1.2.0.

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
- `src/jsx-runtime.ts` stands in for `react/jsx-runtime`. `inert` renders as
  React 18 needs it, left alone on React 19, which knows it as a boolean
  already. The deck's `<style>` elements render just before the viewport, one
  per deck, because neither build hoists them through React's own resource
  API, and its CSS is set as HTML, so neither version's server renderer
  escapes `>`.
- Every component in the source is wrapped in `forwardRef` (`src/with-ref.ts`),
  so a `ref` reaches its element the way `forwardRef` passes it, on both
  versions.

The package has no `react-server` entry: this build does not ship React 19's
server components either.

## Tests

`pnpm test:react-18` builds this package, then type-checks a consumer
(`test/consumer.tsx`) with React 18's types. It then runs the React package's
tests on React 18 against the build (`vitest.react-18.config.ts` at the repo
root), with this package's own tests in `test/`. `pnpm test:react-19` runs the
same tests on React 19 against the same build (`vitest.react-19.config.ts`),
aliased to the React 19 the workspace already has for `@carouseldeck/react`.
A test specific to one version's own quirks is excluded from the other's run,
by name, in its config.
