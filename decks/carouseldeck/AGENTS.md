# AGENTS.md

## Before landing anything

Run one command, and land only on green. From deck-cool's root:

```sh
pnpm --dir decks/carouseldeck verify
```

Or from `decks/carouseldeck/`:

```sh
pnpm verify
```

It runs every gate in order and stops at the first failure: `format:check`,
`lint`, `typecheck`, `test` (vitest in browser mode), `test:react-18` (the
same tests on React 18, against `@carouseldeck/react-18`'s build),
`test:react-19` (the same, on React 19), `test:scripts`
(the scripts' own tests), `changeset:check` (a package changed since the
diff's base is named in a changeset, AGENTS.md "Releasing"), `build`,
`docs:check` (the code blocks in
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
in one browser, `--shard=1/4` runs `test`, `test:react-18` and `test:react-19`
in one vitest shard of four, and `--dry-run` lists the gates without running
them. With no arguments, `pnpm verify` runs every gate, as before.

CI (deck-cool's root `.github/workflows/ci.yml`) runs the same list, split
into parallel jobs by `CI_JOBS` in `scripts/verify.mjs`: `changes` works out
which gates the change needs, then `checks` (the gates with no browser but
the next two), `packages` (`test:packages`), `next` (`test:next`), `unit`
(vitest, one job per shard of four), `unit-react-18` and `unit-react-19`
(`test:react-18` and `test:react-19`, the same way) and `e2e` (one job per
browser) each run `pnpm verify --job
<name>`. `ci.yml` runs on every push, not on a pull request: on a branch, the base
is the merge base with `origin/main`; on `main`, the commit before the push.
A job with nothing to run in that diff is skipped. `unit`,
`unit-react-18`, `unit-react-19` and `e2e` run in Playwright's container
image, pinned by digest in the root `ci.yml`: bump it with `@playwright/test`,
as the comment there says.
`scripts/verify.test.mjs` fails if the jobs do not cover every gate, so a gate
added to the list runs in CI with no second list to update. CI does not
replace running `pnpm verify` locally; it catches the time you forgot.

`verify` is the one check main requires: it fails if a
gate job failed or was cancelled, and passes if each passed or was skipped as
the change did not need it. A push to `main` runs no gate when CI already
passed on the head of the PR it merged and that head has the same tree, and
`release.yml` runs no gate again: it waits for CI to pass on the commit, then
builds and packs. A diff that only bumps package versions and writes
changelogs, as the Version packages PR does, runs `format:check`,
`changeset:check` and `test:packages` alone. The React 18 and React 19 runs
use Chromium alone: the WebKit tests check the engine, which `unit` runs.

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

Green is not enough on its own: `CODING_STANDARDS.md` holds the judgement
rules a reviewer checks the diff against too, past what these gates enforce.

## React 18

`packages/react-18` builds `packages/react/src`, unchanged, for React 18 and
19, so the React 19 package ships nothing for it: its README says how. Write
the source for React 19 alone. When the source uses a React API or a host
element prop that React 18 or 19 handles differently, `test:react-18` or
`test:react-19` fails: adapt it in `packages/react-18/src`, never in the
source.

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
- after that PR merges, it waits for CI to pass on the merge, publishes the
  versions npm does not have yet, with provenance, from the tarballs the
  verify job built and packed, then tags every version npm has but GitHub does not yet,
  however it reached npm, and creates its GitHub release. Once that succeeds,
  it dispatches a run of `deploy-carouseldeck.yml` with `apply`, which
  deploys carousel.deck.cool at the latest `@carouseldeck/react` release.
  Once npm has every version in the tree, `select` picks "none" on the next
  push, and nothing after it runs: a version published by hand is not tagged
  or deployed by a later push to `main`. What tags and deploys it is
  re-running the failed Release run's failed jobs, `gh run rerun <run-id> -R
pedrosousa13/deck-cool --failed`: `publish` then finds every version
  already on npm and skips them, `tag` tags them, and `deploy` deploys. A
  re-run that tags nothing new still deploys: it deploys the same release
  again, which changes nothing.

**The first publish**, 1.2.0, used the `NPM_TOKEN` secret: npm sets a trusted
publisher per package, so a package has to exist first. Each of the four
packages now has a trusted publisher on npmjs.com: GitHub Actions,
`pedrosousa13` / `deck-cool` / `release.yml`, no environment, and the
`NPM_TOKEN` secret is gone. But CI cannot publish over OIDC yet: deck-cool
was created after GitHub's 2026-07-15 cutoff, so its OIDC tokens use the
immutable subject format (`repo:pedrosousa13@4235827/deck-cool@1410811933:…`),
and npm's trusted-publishing exchange rejects it with "OIDC token exchange
error - package not found" (npm/cli#9969, open; tracked in #161). Until it is
fixed, the `publish` job fails and a release is published by hand, without
provenance, as 1.2.0 and 1.3.0 were. A run that would publish a package not
yet on npm still fails at "Check a credential can publish", before anything
is published.

**Publishing by hand**, when the `publish` job fails on OIDC:

1. Check the npm login first: `npm whoami` prints the maintainer's npm
   account. If it errors or prints another account, the maintainer runs
   `npm login`, in a real terminal, the way publishing itself needs
   for 2FA.
2. Download the tarballs the run's `verify` job packed: `gh run
download <run-id> -R pedrosousa13/deck-cool -D <dir>` (the artifact holds
   `publish-plan.json` and `packages/*.tgz`).
3. From `<dir>/<artifact>/packages`, publish in the plan's order, core and
   docs first, then react and react-18, each with `npm publish ./<file>.tgz
--access public --tag latest --provenance=false`, run in a real terminal
   so npm can wait for its browser 2FA approval (from a non-interactive
   shell npm prints the approval link and exits).
4. npm's registry can take a few minutes to show every version. Wait until
   `npm view @carouseldeck/<pkg>@<version> version` prints the version for
   all four (core, docs, react and react-18) before going on: re-running
   earlier fails at `publish` the way the first attempt did, because npm
   has not served the new versions yet.
   ```sh
   for pkg in core docs react react-18; do npm view "@carouseldeck/$pkg@<version>" version; done
   ```
5. Re-run the failed jobs of that Release run: `gh run rerun <run-id> -R
pedrosousa13/deck-cool --failed`. It tags the release and deploys
   carousel.deck.cool.

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
`@carouseldeck/docs`. A release deploys it: `release.yml` dispatches a run of
`deploy-carouseldeck.yml` with `apply` (ADR 0002).

For the issue tracker, triage labels and the domain docs, see the root
`AGENTS.md`.
