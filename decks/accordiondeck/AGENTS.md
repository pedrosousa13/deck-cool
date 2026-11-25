# AGENTS.md

## Before landing anything

Run one command, and land only on green. From deck-cool's root:

```sh
pnpm --dir decks/accordiondeck verify
```

Or from `decks/accordiondeck/`:

```sh
pnpm verify
```

It runs every gate in order and stops at the first failure: `lint`,
`typecheck`, `test` (vitest, in Chromium, Firefox and WebKit via Playwright:
install them once with `pnpm exec playwright install chromium firefox
webkit`), `test:react-18` (the same tests on React 18, against
`@accordiondeck/react-18`'s build), `test:react-19` (the same, on React 19),
`build` and `test:packages` (publint and attw on the packed tarballs, and
that `@accordiondeck/react`'s and `@accordiondeck/react-18`'s built modules
start with `'use client'`). The list lives in `scripts/verify.mjs`.

The unit tests run in all three engines because ADR 0001 records `<details>`
behaving differently in each.

`@accordiondeck/react` has `Item`, `Trigger` and `Panel` (#365); Root and the
groups are the next issue. `@accordiondeck/react-18` builds the same source,
and `@accordiondeck/docs` is still a placeholder. All three are private at
`0.0.0`. The v1 work is in the milestone
accordion.deck.cool, map #360. There is no `@accordiondeck/core`: the browser
is the engine (ADR 0001, "The packages").

`@accordiondeck/react-18` builds `@accordiondeck/react`'s source for React 18:
a Vite build with a `'use client'` banner, and `src/with-ref.ts`, which gives
each component `ref` through `forwardRef`, since React 18 does not pass `ref`
as a prop. When the source uses another React 19-only API (`use`, a context as
its own provider), add the `react` shim `decks/drawerdeck/packages/react-18/`
has.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
