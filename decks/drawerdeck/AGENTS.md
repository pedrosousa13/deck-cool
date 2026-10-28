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
them once with `pnpm exec playwright install chromium webkit`), `build` and
`test:packages` (publint and attw on the packed tarballs, and that
`@drawerdeck/react`'s built module starts with `'use client'`). The list
lives in `scripts/verify.mjs`.

`@drawerdeck/core` is the framework-neutral drawer engine, and
`@drawerdeck/react` the React 19 primitives built on it (#240): the beta,
bottom and modal only.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

## Releasing

`@drawerdeck/core`, `@drawerdeck/react` and `@drawerdeck/docs` are
publishable, each at `0.1.0-beta.0` (#242). They do not go through
Changesets' `fixed` group or pre mode, the way carouseldeck's packages do
(`decks/carouseldeck/AGENTS.md`, "Releasing"): entering pre mode is repo-wide
in Changesets, so it would turn carouseldeck's own next release into a
prerelease too, the first time a changeset lands for it. Instead, each
drawerdeck package's `publishConfig.tag` is `"beta"`, and its version is set
by hand, not by `changeset version`.

The root `.github/workflows/release.yml` releases every in-repo deck (ADR
0002 in deck-cool's root `docs/adr/`): `select-mode` publishes whatever
version in the tree npm does not have yet, whichever deck it belongs to, so
drawerdeck's first beta ships through the same pipeline as a carouseldeck
release, under the `beta` npm dist-tag instead of `latest`. Its `verify` job
runs `pnpm --dir decks/drawerdeck verify` too, so a beta package is built and
checked (`test:packages` among it) before it is packed and published.

A later drawerdeck version, beta or not, is published by bumping each
package's `version` by hand and landing it on `main`: nothing here runs
`changeset version` for drawerdeck yet. Moving it onto Changesets, with its
own `fixed` group, is follow-up work once the beta has shipped.

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
