# @carouseldeck/react-18

`@carouseldeck/react` built for React 18. It has the same components, props and
types, from the same source.

On React 18, install it in place of `@carouseldeck/react` and import from
`@carouseldeck/react-18`. It is published at the same version as
`@carouseldeck/react`, from 1.2.0.

## How it is built

The source in `packages/react/src` is written for React 19, and this package
does not change it. The React 19 package ships the same code it did before,
at the same size. This package's build (`vite.config.ts`) adapts the source to
React 18:

- `src/react.ts` stands in for `react`. `use` reads a context with
  `useContext`, a context renders as React 18's provider, and
  `useLayoutEffect` is `useEffect` on the server, where React 18 warns about
  it. In development, it reports a React other than 18.
- `src/jsx-runtime.ts` stands in for `react/jsx-runtime`. `inert` renders as
  React 18 needs it. The deck's `<style>` elements render just before the
  viewport, one per deck, because React 18 does not hoist them, and its CSS
  is set as HTML, because React 18's server renderer escapes `>`.
- Every component in the source is wrapped in `forwardRef` (`src/with-ref.ts`),
  so a `ref` reaches its element as it does in React 19.

The package has no `react-server` entry: React 18 has no server components.

## Tests

`pnpm test:react-18` builds this package, then type-checks a consumer
(`test/consumer.tsx`) with React 18's types. It then runs the React package's
tests on React 18 against the build (`vitest.react-18.config.ts` at the repo
root), with this package's own tests in `test/`.
