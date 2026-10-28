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
`typecheck`, `test` (vitest, in Chromium and WebKit via Playwright: install
them once with `pnpm exec playwright install chromium webkit`) and `build`.
The list lives in `scripts/verify.mjs`.

`@drawerdeck/core` is the framework-neutral drawer engine, and
`@drawerdeck/react` the React 19 primitives built on it (#240): the beta,
bottom and modal only. Both packages stay `private` at `0.0.0`; the release
is #242.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
