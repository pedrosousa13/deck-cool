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

`pnpm build` writes each site to `sites/<name>/site/`, and its budget report to `sites/<name>/.pagedeck/budget-report.json`. Every `@pagedeck/*` package is pinned to one exact version; upgrade them together. CI runs them on every push, installing with `pnpm install --frozen-lockfile`, and lints every workflow with actionlint first. To run it locally: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12`.

`packages/brand` is the brand kit every site shares: `styles/brand.css`, the icons in `public/icons/`, the decks module (`@deck-cool/brand/decks`), and the Family bar (`@deck-cool/brand/family-bar`), styled by `styles/family-bar.css`. `styles/umbrella.css` styles deck.cool's home page. A site lists the stylesheets it needs in `build.css`, `brand.css` first, and the build compiles them into one hashed sheet under `/assets/` that every page links from `<head>`. `public/` holds only the icons and `.assetsignore`, and a site serves it from its root through `build.passthrough`. Each icon's `apple-touch-icon.png` is rendered from its `still.svg` and checked in. After you change a still icon, run `pnpm --filter @deck-cool/brand render-touch-icons`. `pnpm test` fails while a PNG is stale.

deck.cool is deployed with wrangler, as Workers Static Assets, by `.github/workflows/deploy-deck-cool.yml`: a dry run on every push, a publish only on a manual run with `apply`. `docs/deploy.md` is the runbook.

## Releasing a deck

When a deck publishes a release, `.github/workflows/bump-deck.yml` sets every `@<deck>/*` dependency in the workspace to the new version, updates the lockfile, and opens a PR titled `Bump <deck> to <version>` from the branch `bump/<deck>-<version>`. The PR merges itself, squashed, once CI passes. A second dispatch for the same version does nothing. A dispatch for a version older than one the workspace already has fails and changes nothing: the workflow never downgrades. The bump logic is `packages/bump-deck`.

The workflow runs on a `repository_dispatch` of type `deck-released`, with this payload:

```json
{ "deck": "slidedeck", "version": "1.4.0" }
```

`deck` is `slidedeck`, `playdeck` or `pagedeck`, and `version` is `MAJOR.MINOR.PATCH` with no `v`. The workflow rejects any other payload before it does anything else.

pnpm holds back a version for `minimumReleaseAge` (a day) unless `minimumReleaseAgeExclude` lists it, and the workflow keeps that hold: a dispatch for a younger version fails, says so, and pushes nothing. Send the dispatch again once the version is a day old. `@pagedeck/*` is excluded today, so a pagedeck release is bumped at once, and its PR says the hold was bypassed.

Each deck's release workflow adds one step after `npm publish`. It gets a token from the `deck-cool-releases` App, with the repo variable `DECK_APP_ID` and the repo secret `DECK_APP_PRIVATE_KEY`, and sends the dispatch:

```yaml
      - name: Get a token from the deck-cool-releases App
        id: app
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          app-id: ${{ vars.DECK_APP_ID }}
          private-key: ${{ secrets.DECK_APP_PRIVATE_KEY }}
          owner: pedrosousa13
          repositories: deck-cool
          permission-contents: write
      - name: Tell deck-cool
        env:
          GH_TOKEN: ${{ steps.app.outputs.token }}
          VERSION: <the version just published>
        run: |
          gh api repos/pedrosousa13/deck-cool/dispatches \
            -f event_type=deck-released \
            -f "client_payload[deck]=slidedeck" \
            -f "client_payload[version]=${VERSION}"
```
