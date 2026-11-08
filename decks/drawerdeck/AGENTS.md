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
them once with `pnpm exec playwright install chromium webkit`),
`test:react-18` (the same tests on React 18, against `@drawerdeck/react-18`'s
build), `test:react-19` (the same, on React 19), `build` (every package,
`@drawerdeck/storybook` among them: the check that the storybook still
compiles) and `test:packages` (publint and attw on the packed tarballs, and
that `@drawerdeck/react`'s and `@drawerdeck/react-18`'s built modules start
with `'use client'`). The list lives in `scripts/verify.mjs`.

## The storybook

`apps/storybook` (`@drawerdeck/storybook`, #278) holds a recipe story per
guide: basic use, snap points, a controlled open and snap state, scrolling
content, `dismissible={false}`, a styled Backdrop dim, a mouse drag, each
side, and nested drawers. `pnpm --dir decks/drawerdeck storybook` runs it,
at http://localhost:6007; from `decks/drawerdeck/`, `pnpm storybook`. It
runs the packages' source, not their built `dist` (`.storybook/main.ts`'s
own alias), so editing a story or the source reflects without a rebuild.
Not part of `pnpm verify`'s own gates beyond `build`, which packs it the
same as every other package: a true end-to-end suite against it, the way
`decks/carouseldeck/apps/storybook` gets from carouseldeck's own
`test:e2e`, is follow-up work.

## The bench

`bench/` is the interleaved motion and cost bench against vaul, Base UI's
Drawer and React Aria's Sheet (#266, #283): its own private workspace
package, depending on `@drawerdeck/react` via `workspace:*` so it always
measures the commit under test. Not part of `pnpm verify` or `ci.yml` --
`eslint .` still lints it for free, since it's nested under this directory,
but nothing here typechecks, tests or builds it (the deck's own `build`
script filters it out by name). `.github/workflows/drawer-bench.yml` runs
it on six parallel `ubuntu-latest` shards, on `workflow_dispatch` and
weekly; `bench/RESULTS.md` explains the method and points at that
workflow's own report artifact for actual numbers, which this repo does not
check in.

`@drawerdeck/core` is the framework-neutral drawer engine, and
`@drawerdeck/react` the React 19 primitives built on it (#240): the beta,
every side, modal or non-modal. `@drawerdeck/react-18` builds the same
source for React 18 too (#275), the way
`decks/carouseldeck/packages/react-18` does for carouseldeck.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

## Releasing

`@drawerdeck/core`, `@drawerdeck/react`, `@drawerdeck/react-18` and
`@drawerdeck/docs` are publishable, each at `0.1.0-beta.0` (#242), each with
`publishConfig.tag` `"beta"`. `0.1.0-beta.0` and `0.1.0-beta.1` were hand-set
versions, not `changeset version`'s doing: entering Changesets' pre mode is
repo-wide, so it would turn carouseldeck's own next release into a
prerelease too, the first time a changeset lands for it, and there is no way
to scope pre mode to one `fixed` group.

From `0.1.0-beta.2` on, drawerdeck has its own `fixed` group in the root
`.changeset/config.json`, alongside carouseldeck's, and its own changesets:
**a change a consumer of any of the four packages can see needs one**, the
same rule as carouseldeck's. Getting another `0.1.0-beta.N` out of
`changeset version`, rather than it dropping the prerelease and shipping
`0.1.0` stable, needs Changesets' pre mode: `.changeset/pre.json`, entered
with `pnpm changeset pre enter beta`. That repo-wide reach is still real with
`pre.json` committed: any changeset that lands for _any_ package while it is
there, carouseldeck's included, versions as a prerelease too (`1.5.5-beta.0`,
not `1.5.5`).

So treat pre mode as a one-release-at-a-time tool, not a standing state:
enter it in the same PR as the beta's changeset, land it, let the
"Version Packages" PR version and the maintainer's merge of it publish that
one `beta.N`, then exit pre mode (`pnpm changeset pre exit`) in its own PR,
landed on `main` by itself right after, before any other changeset can
reach it. No carouseldeck changeset may be merged while `.changeset/pre.json`
exists on `main`; check it is absent before landing one. The next drawerdeck
beta repeats the same enter-release-exit cycle. Exit the same way, for the
last time, once drawerdeck is ready to ship `1.0.0`: the next changeset then
versions as a normal release, with no `-beta.N`, same as carouseldeck's
always have.

The root `.github/workflows/release.yml` releases every in-repo deck (ADR
0002 in deck-cool's root `docs/adr/`): `select-mode` publishes whatever
version in the tree npm does not have yet, whichever deck it belongs to, so
drawerdeck's first beta ships through the same pipeline as a carouseldeck
release, under the `beta` npm dist-tag instead of `latest`. Its `verify` job
runs `pnpm --dir decks/drawerdeck verify` too, so a beta package is built and
checked (`test:packages` among it) before it is packed and published.

A version already on npm with the wrong dist-tag, or one that just needs a
second tag, gets one from `.github/workflows/npm-dist-tag.yml` (#285): a
manual run with `packages`, `version` and `tag` inputs, from `main`, using
the `NPM_TOKEN` secret to run `npm dist-tag add` -- never `dist-tag rm`,
never `publish`. Its first use added `beta` to `@drawerdeck/core`,
`@drawerdeck/react` and `@drawerdeck/docs` at `0.1.0-beta.0`, published under
`latest` only (#281, before `publish-packed.mjs` read `publishConfig.tag`).
The same workflow promotes a later version to `latest` at 1.0: run it with
`tag: latest` once the 1.0 tarballs are on npm under `beta`.

A later drawerdeck version, beta or not, is published by bumping each
package's `version` by hand and landing it on `main`: nothing here runs
`changeset version` for drawerdeck yet. Moving it onto Changesets, with its
own `fixed` group, is follow-up work once the beta has shipped.

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
