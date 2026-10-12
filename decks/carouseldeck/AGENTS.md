# AGENTS.md

## Before landing anything

Run one command, from the repo root, and land only on green:

```sh
pnpm verify
```

It runs every gate in order and stops at the first failure: `format:check`,
`lint`, `typecheck`, `test` (vitest in browser mode), `test:react-18` (the
same tests on React 18, against `@carouseldeck/react-18`'s build), `test:scripts`
(the scripts' own tests), `build`, `docs:check` (the code blocks in
the package README and the docs type-check), `compare:check` (the
README's and the docs' comparison table is fresh), `test:packages` (publint and attw on the
packed tarballs, and the React entries' `'use client'`), `test:next` (a Next.js
server component renders a deck from the packed tarballs), `size` and
`test:e2e` (Playwright with axe against storybook, in Chromium, Firefox and
WebKit). The list lives in `scripts/verify.mjs`.

On its first run, `test:next` installs Next.js into `tests/next-rsc` from
that fixture's own lockfile, so it needs the network once; later runs install
from the pnpm store.

`pnpm verify --changed` runs only the gates the diff against `main` needs
(committed, uncommitted and untracked files; `--changed=<ref>` diffs against
another ref). `RULES` in `scripts/verify.mjs` maps each changed path to the
gates it needs, first match wins, and a path no rule matches needs every gate.

`--only lint,typecheck` runs those gates, `--project=webkit` runs `test:e2e`
in one browser, `--shard=1/4` runs `test` and `test:react-18` in one vitest
shard of four, and `--dry-run` lists the gates without running them. With no
arguments, `pnpm verify` runs every gate, as before.

CI (deck-cool's root `.github/workflows/ci.yml`) runs the same list, split
into parallel jobs by `CI_JOBS` in `scripts/verify.mjs`: `changes` works out
which gates the change needs, then `checks` (the gates with no browser but
the next two), `packages` (`test:packages`), `next` (`test:next`), `unit`
(vitest, one job per shard of four), `unit-react-18` (`test:react-18`, the
same way) and `e2e` (one job per browser) each run `pnpm verify --job
<name>`. On a pull request they run with `--changed` against its base, and a
job with nothing to run is skipped; a push to `main` runs every gate. `unit`,
`unit-react-18` and `e2e` run in Playwright's container image, pinned by
digest in the root `ci.yml`: bump it with `@playwright/test`, as the comment
there says.
`scripts/verify.test.mjs` fails if the jobs do not cover every gate, so a gate
added to the list runs in CI with no second list to update. CI does not
replace running `pnpm verify` locally; it catches the time you forgot.

`verify` is the one check main requires: it fails if a
gate job failed or was cancelled, and passes if each passed or was skipped as
the change did not need it. `release.yml` still runs the whole `pnpm verify`
in one job before it publishes.

Both browser suites drive Playwright's Chromium, and the e2e suite also
drives its Firefox and WebKit, and vitest its WebKit for the tests of what
WebKit alone does. Install them once with
`pnpm exec playwright install chromium firefox webkit`. On Linux, Firefox and
WebKit also need system libraries: run `pnpm exec playwright install-deps
firefox webkit` once, or install with `--with-deps`.

`size` prints each package's gzipped size and never fails: bundle size is an
aim, not a gate (ADR-0001). Read the numbers; do not add a budget.

`compare:check` fails when the comparison in `packages/react/README.md`, or
the same table at the end of `packages/docs/compare.md`, no longer matches a
fresh measurement: after a bump of a compared library in `tests/compare`, or
any change to `packages/*/src` that moves carouseldeck's gzipped size. Run
`pnpm build && pnpm compare` and commit the new tables. The size is
reported, never budgeted (ADR-0001): a bigger number is not a failure, only a
stale one is. A release does not stale it: carouseldeck's row has no version.

Formatting is checked, never written by the gate. Run
`pnpm exec prettier --write <files>` on the files you changed.

## React 18

`packages/react-18` builds `packages/react/src`, unchanged, for React 18, so
the React 19 package ships nothing for it: its README says how. Write the
source for React 19 alone. When the source uses a React API or a host element
prop that React 18 handles differently, `test:react-18` fails: adapt it in
`packages/react-18/src`, never in the source.

## Releasing

`@carouseldeck/core`, `@carouseldeck/react`, `@carouseldeck/react-18` and
`@carouseldeck/docs` release together at one version (`fixed` in
`.changeset/config.json`, at deck-cool's root).

**A change that a consumer of either package can see needs a changeset**: a
fix, a feature, a changed prop or type, a changed package file. Run
`pnpm changeset`, pick the bump, write what changed for the consumer, and
commit the file with the change. Tests, docs outside the packages, CI and
scripts need none. A breaking change is a `major`. A change to
`packages/docs` alone needs none either: the docs are published at the
version of the code they describe, so the change ships with the next release.

**A release** is deck-cool's `.github/workflows/release.yml`, on every push to
`main` (ADR 0002 in deck-cool). It asks Changesets first, so most pushes do
nothing, then:

- with changesets pending, it opens or updates the "Version packages" PR,
  which bumps the versions and writes the changelogs. Nothing is published.
  It opens the PR with a token from the `deck-cool-releases` App, so CI runs
  on it.
- after that PR merges, it runs the whole `pnpm verify`, publishes the
  versions npm does not have yet, with provenance, from the tarballs the
  verify job packed, then tags them `<name>@<version>` and creates the GitHub
  releases. Then it deploys carousel.deck.cool at the released commit, with
  `deploy-carouseldeck.yml`.

**The first publish**, 1.2.0, uses the `NPM_TOKEN` secret: npm sets a trusted
publisher per package, so a package must exist first. After it, on
npmjs.com add a trusted publisher to each of the four packages: GitHub
Actions, `pedrosousa13` / `deck-cool` / `release.yml`, no environment. Then
delete the `NPM_TOKEN` secret. Later releases publish over OIDC. Without the
secret, a run that would publish a package not yet on npm fails at "Check a
credential can publish", before anything is published.

## Docs

The docs are `packages/docs`, published as `@carouseldeck/docs`: markdown,
`nav.json` and `assets/`, no code. deck.cool builds carouseldeck's docs site
from the published package, so every page follows deck.cool's docs contract
(`docs/docs-contract.md` in pedrosousa13/deck-cool):

- every page has a `title` and a `description` in its frontmatter, and no
  `#` heading. A `label` is the site's shorter sidebar name for it.
- `nav.json` lists every page, in reading order, under its group.
- a link to another page is a relative link to its `.md` file.
- a live example is `<!-- demo:example-<name> -->` on its own line, where
  `<name>` is a demo the site registers, listed in `SITE_DEMOS` in
  `scripts/docs-contract.test.mjs`. It is the only HTML a page may hold.
- a code block that must match a file in the repo follows an unused link
  definition to the file,
  `[example: <name>]: https://github.com/pedrosousa13/deck-cool/blob/main/decks/carouseldeck/<path>`.

`scripts/docs-contract.test.mjs`, in `test:scripts`, checks the package
against the contract with the rules deck.cool's docs loader applies.

## Site

The site lives in this repo, as `sites/carouseldeck`, and is served at
https://carousel.deck.cool. It builds its docs pages from the workspace's
`@carouseldeck/docs`. A release deploys it: `release.yml` calls
`deploy-carouseldeck.yml` with the released commit (ADR 0002).

## Agent skills

### Issue tracker

Issues live in the repo itself — GitHub issues on pedrosousa13/deck-cool, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label names, as repo labels on pedrosousa13/deck-cool — plus `in-progress` and `P0`–`P3`, labels that stand in for a missing field. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
