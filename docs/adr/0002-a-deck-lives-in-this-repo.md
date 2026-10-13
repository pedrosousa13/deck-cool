# A deck lives in this repo, under decks/<deck>/

deck-cool becomes the monorepo for the decks (#105). carouseldeck, slidedeck renamed, moves in first and playdeck follows. This ADR settles how a deck lives here: its directory, its tooling, its CI, its releases, and what happens to its React 18 build. #105's decisions 1 to 7 are its inputs. Written for #110 on 2026-10-12, from slidedeck's `main` at `ff73434`.

The maintainer ruled on the manual deploy and on deck.cool's carouseldeck card on 2026-10-12. Both rulings are recorded below.

## Layout

The deck's whole repo moves to `decks/carouseldeck/` with its inner layout unchanged: `packages/{core,react,react-18,docs}`, `apps/storybook`, `tests/compare`, `tests/next-rsc`, `prototypes/scroll-snap`, `e2e/`, `scripts/` and its config files. `git filter-repo --to-subdirectory-filter decks/carouseldeck` does it in one step, and every relative path in the deck's scripts and configs still resolves.

The deck's `pnpm-workspace.yaml` and `pnpm-lock.yaml` go. Its members join the root `pnpm-workspace.yaml`, one entry for each of its old ones, plus the deck's root package so its scripts and dev dependencies install:

```yaml
packages:
  - sites/*
  - packages/*
  - packages/docs/fixtures/example-docs
  - decks/carouseldeck
  - decks/carouseldeck/packages/*
  - decks/carouseldeck/apps/*
  - decks/carouseldeck/tests/compare
  - decks/carouseldeck/prototypes/scroll-snap
```

`tests/next-rsc` stays outside the workspace, with its own lockfile, as it is today. The deck's members keep their scoped names under the new scope, private ones included (`@carouseldeck/storybook`), and its root package becomes `carouseldeck`, so no name collides when playdeck brings its own.

The deck's commands run in its directory, from the repo root with `pnpm --dir decks/carouseldeck <script>`: `verify`, `test`, `build`, `changeset` and the rest. The root's `pnpm build`, `typecheck` and `test` stay the sites' and the shared packages' commands. They build the deck packages a site depends on, and run none of the deck's gates.

Rejected:

- **Spread the deck across the root's `packages/` and `apps/`.** Every path in its scripts and configs changes, and its packages mix with deck-cool's own.
- **A nested workspace with its own lockfile.** Two installs, two pnpm versions, and a site could not depend on the deck's packages as `workspace:*`.
- **A git submodule or subtree of the old repo.** #105 archives that repo.

## Tooling

**Kept, scoped to `decks/carouseldeck/`:** eslint, prettier, `tsc -b`, its vitest configs (`vitest.config.ts`, `vitest.react-18.config.ts`), its Playwright config, `scripts/verify.mjs` and the other scripts. Each runs from the deck's directory and reads that directory's config, so none of them reaches the sites. The sites do not adopt them.

**Moved to the root:** changesets. Its CLI reads `.changeset/` at the workspace root, so `.changeset/config.json` and the pending changesets move there, and `@changesets/cli` becomes a root dev dependency.

**Dropped:** turbo. Under a parent workspace, turbo 2 wants its `turbo.json` at the repo root and scopes a run to the package in the current directory. Its one task here, `build` after `^build`, is what `pnpm -r build` already does in dependency order. The deck's `build` becomes a recursive pnpm build over its own members. The cost is turbo's local cache: `test:packages` and `test:next` rebuild core and react themselves, a few seconds each.

**pnpm 11.20.0 and Node 24.** The deck builds under the root's pnpm, with the root's one lockfile and one-day `minimumReleaseAge`, and drops its own `minimumReleaseAgeExclude` for `@pagedeck/*`. `tests/next-rsc`'s lockfile is regenerated under pnpm 11. CI runs the deck on Node 24, the repo's engine, where slidedeck ran Node 22. No published package declares `engines`, so nothing a consumer sees changes.

**One version per shared tool.** The deck's `@pagedeck/markdown-loader` moves from 0.2.2 to the sites' 0.2.3: every `@pagedeck/*` package is pinned to one version (AGENTS.md). Playwright is 1.63.0 on both sides and stays one version, bumped together with the deck's CI image. The root's `allowBuilds` turns off esbuild's install script, which the deck allowed. The move checks the deck builds with it off, and allows it by exact version only if it does not.

Rejected:

- **Keep turbo, with a root `turbo.json`.** A second task runner for the whole repo, for a cache CI never restores.
- **Adopt eslint and prettier across the repo.** Not asked for, and it would reformat every site in the move's diff.

## CI

`ci.yml` stays one workflow, `on: push`, and `verify` stays the one required check. `verify` becomes the job that slidedeck's `all-gates` was: it needs every other job, runs `if: always()`, and passes only when each one passed or was skipped. main's ruleset already requires a check named `verify`, so nothing changes on GitHub.

The jobs:

- **`sites`**: today's `verify` steps, renamed, on every push: actionlint, install, `pnpm build`, `pnpm typecheck`, `pnpm test`.
- **`changes`**: runs `node decks/carouseldeck/scripts/verify.mjs --changed=<base> --ci-jobs` and outputs `<job>=true|false` for each of the deck's jobs. No install: the script uses Node's built-ins only.
- **The deck's gate jobs**, one per entry in its `CI_JOBS`, each skipped when `changes` says it has nothing to run: `carouseldeck-checks`, `carouseldeck-unit` (4 vitest shards), `carouseldeck-unit-react-18` (4 shards), `carouseldeck-packages`, `carouseldeck-next` and `carouseldeck-e2e` (Chromium, Firefox, WebKit). Each runs `pnpm --dir decks/carouseldeck verify --job <name> --changed=<base>`.

**What a change needs.** `verify.mjs`'s `RULES` stay the source, with the `decks/carouseldeck/` prefix. Two rules join them: the root's `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`, and `.github/workflows/ci.yml`, need every deck gate; any other path outside the deck needs none. A path inside the deck that no rule matches still needs every gate. `git diff --name-only` already gives paths from the repo root, and the script's `git ls-files --others` gains `--full-name` so both agree.

**The base.** On a branch push, the merge base with `origin/main`: the required check covers the whole branch, not the last push. On a push to `main`, `github.event.before`, the commit before the push. main lands squashed PRs, so that is one PR's change.

**The image.** `unit`, `unit-react-18` and `e2e` run in `mcr.microsoft.com/playwright:v1.63.0-noble`, pinned by digest, as in slidedeck's `ci.yml`. Its actions are pinned by commit SHA, as every workflow here is.

A lockfile change for a site alone runs every deck gate. That is the price of one lockfile, and it is accepted.

Rejected:

- **A separate workflow per deck with `paths:` filters.** A workflow its filter skips never reports, so a required check on it waits forever, and requiring one check per workflow is more than one check.
- **Every deck gate on every push to `main`**, as slidedeck did. Most pushes here touch only the sites, and the release workflow runs the deck's every gate before it publishes anyway.
- **Scope the `sites` job by path too.** It fits in its 15-minute timeout, a deck change can break its site, and scoping it is not asked for.

## Releases

**Changesets, one `fixed` group per deck.** `.changeset/config.json` at the root holds `["@carouseldeck/core", "@carouseldeck/react", "@carouseldeck/react-18", "@carouseldeck/docs"]` as one group, and playdeck's packages as another when it moves. The sites and the shared packages are private, never get a changeset, and the config leaves them out of every version PR.

**`release.yml`, adapted from slidedeck's**, on every push to `main`:

1. Changesets' `select-mode` says `version`, `publish` or `none`. It runs first: most pushes need nothing.
2. `version`: opens or updates the "Version packages" PR. It opens it with a token from the `deck-cool-releases` App, not the `GITHUB_TOKEN`, because a branch the `GITHUB_TOKEN` pushes runs no workflow and main requires `verify`. The maintainer merges it by hand: that merge is the release.
3. `publish`: runs the deck's whole `pnpm verify` in one job, packs the tarballs it verified, then publishes them with provenance over OIDC from a job that builds nothing and runs no install script. npm's trusted publisher for each package is `pedrosousa13` / `deck-cool` / `release.yml`. The first publish of a package uses the `NPM_TOKEN` secret (#105, before the move).
4. `tag`: tags each published version `<name>@<version>` and creates its GitHub release, from slidedeck's `scripts/tag-releases.mjs`.
5. `deploy`: starts its own run of `deploy-carouseldeck.yml`, `gh workflow run deploy-carouseldeck.yml -f apply=true`, the manual `apply` path. `tag` runs first, so the release's tag exists before the dispatch, and the dispatched run picks it up itself.

Each package's `repository.url` points at deck-cool, with `directory` set to its path under `decks/carouseldeck/`. Tags are scoped by package name, so two decks' tags never collide.

**A release deploys its site (#105, decision 4).** `sites/carouseldeck` depends on the deck's packages as `workspace:*`. The deploy builds the commit the release's tag points at, so the workspace holds exactly the released code. The deck's `deck-released` dispatch, its bump PR and `bump-deck`'s `slidedeck` case go away.

**A manual deploy publishes the latest release** (maintainer, 2026-10-12). A run of `deploy-carouseldeck.yml` by hand with `apply` builds the latest `@carouseldeck/react@*` release tag, never `main`. The cost: a change to `sites/carouseldeck` or `packages/brand` alone waits for the deck's next release, or for a patch release cut for it, where the other sites deploy from `main` today.

Rejected:

- **Trigger the deploy on `release: published`.** The `tag` job creates releases with the `GITHUB_TOKEN`, and events from that token start no workflow.
- **Dispatch the deploy on `main`.** `main` can be past the release by the time the run starts, and decision 4 forbids deploying unreleased code.
- **One release workflow per deck.** npm's trusted publisher names one workflow file, and one file is simpler to keep pinned and reviewed. Decks with nothing pending do nothing in it.
- **Run the whole `pnpm verify` on every push to `main`**, as slidedeck's `release.yml` did. Here only a publish needs it.

## The React 18 build

#105's decision 7 calls the React 18 build an unpushed prototype on slidedeck's `worktree-react18-and-size` branch. It has since landed: slidedeck's #142 (`d4b76c1`, 2026-10-12) put `packages/react-18` on `main` as `@slidedeck/react-18`, private, at 1.0.3, in the `fixed` group, with its `test:react-18` gate and CI job. Its README and slidedeck's AGENTS.md already say it is first published as `@carouseldeck/react-18` after the move.

So it moves in as it is, renamed `@carouseldeck/react-18`, in the `fixed` group, so its version keeps step with the others. Its gate moves with it as `carouseldeck-unit-react-18`.

It publishes in the first release (maintainer, 2026-10-12, on #114). #114 drops `private`, and it goes out at 1.2.0 with core, react and docs, in the same first publish with the `NPM_TOKEN` secret. So it needs no second token run. This ADR first kept it private and out of the first release, to publish later with the token back for one run.

Rejected:

- **Leave it out of the import and add it after.** The filter-repo import takes `main` whole. Cutting a directory out of the history drops its tests and its CI job, and loses its history, to be added back later.

## Consequences

- **ADR 0001 is amended for a deck that lives here.** Its first reason holds: the site shows the latest release, now because the deploy builds the release's commit. Its "Releases update the sites by PR" consequence, and the dispatch and App token behind it, apply only to the decks still outside.
- **deck.cool's carouseldeck card reads the release, not the workspace** (maintainer, 2026-10-12). At build time it reads the deck's README and size figure at the latest carouseldeck release tag, with `git show <tag>:<path>`, so the card always matches npm. That needs the tags in CI: the deck-cool build and deploy workflows check out full history or fetch the tags. #112 wires it.
- **AGENTS.md gains a section for the deck**: run its commands with `pnpm --dir decks/carouseldeck`, and `pnpm --dir decks/carouseldeck verify` before landing a change to it.
- **A deck keeps its own ADRs**, under `decks/<deck>/docs/adr/`, numbered on their own. The root's `docs/adr/` holds the repo's.
- **playdeck moves the same way**, into `decks/playdeck/`, with its own gate jobs feeding `verify` and its own `fixed` group.
