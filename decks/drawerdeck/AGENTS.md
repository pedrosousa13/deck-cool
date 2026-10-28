# AGENTS.md

## Before landing anything

Run one command, and land only on green. From deck-cool's root:

```sh
pnpm --dir decks/drawerdeck verify
```

Or from `decks/drawerdeck/`:

```sh
pnpm verify
```

It runs every gate in order and stops at the first failure: `lint`,
`typecheck`, `test` (vitest) and `build`. The list lives in
`scripts/verify.mjs`.

Both packages are placeholders (#231): `@drawerdeck/core` and
`@drawerdeck/react` export nothing but a `version` constant, each with one
smoke test. There is no engine or primitive code yet; it waits on #230's
map.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
