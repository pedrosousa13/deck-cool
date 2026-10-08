# AGENTS.md

## Agent skills

### Issue tracker

Issues live in the repo itself — GitHub issues on pedrosousa13/deck-cool, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label names, as repo labels on pedrosousa13/deck-cool — plus `in-progress` and `P0`–`P3`, labels that stand in for a missing field. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Working in this repo

Node 24 and pnpm. Sites live in `sites/<name>`, shared code in `packages/<name>`. Run every command from the repo root:

```sh
pnpm install     # install every site and package
pnpm build       # build every site: pagedeck sync, then pagedeck build
pnpm typecheck   # tsc in every site and package
pnpm test        # vitest across the workspace
```

`pnpm build` writes each site to `sites/<name>/site/`, and its budget report to `sites/<name>/.pagedeck/budget-report.json`. Every `@pagedeck/*` package is pinned to one exact version; upgrade them together. CI runs them on every push, installing with `pnpm install --frozen-lockfile`.
