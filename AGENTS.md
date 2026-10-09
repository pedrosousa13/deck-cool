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

`pnpm test` builds deck-cool once, in a global setup, and drives the built site in Playwright's Chromium. Install it once with `pnpm exec playwright install chromium`.

`pnpm build` writes each site to `sites/<name>/site/`, and its budget report to `sites/<name>/.pagedeck/budget-report.json`. Every `@pagedeck/*` package is pinned to one exact version; upgrade them together. CI runs them on every push, installing with `pnpm install --frozen-lockfile`.

`packages/brand` is the brand kit every site shares: `public/brand.css`, the icons in `public/icons/`, the decks module (`@deck-cool/brand/decks`), and the Family bar (`@deck-cool/brand/family-bar`), styled by `public/family-bar.css`. `public/umbrella.css` styles deck.cool's home page; it is here because a site serves files from one passthrough root. A site serves `public/` from its root through `build.passthrough`. Each icon's `apple-touch-icon.png` is rendered from its `still.svg` and checked in. After you change a still icon, run `pnpm --filter @deck-cool/brand render-touch-icons`. `pnpm test` fails while a PNG is stale.

deck.cool is deployed with wrangler, as Workers Static Assets, by `.github/workflows/deploy-deck-cool.yml`: a dry run on every push, a publish only on a manual run with `apply`. `docs/deploy.md` is the runbook.
