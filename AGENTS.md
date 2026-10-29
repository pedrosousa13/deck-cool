# AGENTS.md

## Agent skills

### Issue tracker

Issues live in the repo itself — GitHub issues on pedrosousa13/deck-cool, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label names, as repo labels on pedrosousa13/deck-cool — plus `in-progress` and `P0`–`P3`, labels that stand in for a missing field. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Working in this repo

Node 24 and pnpm. Sites live in `sites/<name>`, shared code in `packages/<name>`. Run every command from the repo root:

```sh
pnpm install     # install every site and package
pnpm build       # build every site, and the deck packages a site uses: pagedeck sync, then pagedeck build
pnpm typecheck   # tsc in every site and package
pnpm test        # vitest across the workspace
```

`pnpm test` builds each site once, in a global setup, and drives the built sites in Playwright's Chromium. Install it once with `pnpm exec playwright install chromium`.

`pnpm build` writes each site to `sites/<name>/site/`. No site declares a JavaScript budget. Every `@pagedeck/*` package is pinned to one exact version; upgrade them together. CI runs them on every push, installing with `pnpm install --frozen-lockfile`, and lints every workflow first with actionlint 1.7.12, downloaded from its GitHub release and checked by sha256. To run it locally: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12`.

`packages/brand` is the brand kit every site shares: `styles/brand.css`, the icons in `public/icons/`, the decks module (`@deck-cool/brand/decks`), and the Family bar (`@deck-cool/brand/family-bar`), styled by `styles/family-bar.css`. `styles/umbrella.css` styles deck.cool's home page. A site lists the stylesheets it needs in `build.css`, `brand.css` first, and the build compiles them into one hashed sheet under `/assets/` that every page links from `<head>`. `public/` holds only the icons and `.assetsignore`, and a site serves it from its root through `build.passthrough`. Each icon's `apple-touch-icon.png` is rendered from its `still.svg` and checked in. After you change a still icon, run `pnpm --filter @deck-cool/brand render-touch-icons`. `pnpm test` fails while a PNG is stale.

`packages/site-kit` is the plumbing every site shares: the response headers (`@deck-cool/site-kit/headers`), which a site gives its own CSP, the local server for a built site, the build that each site's `src/build.global-setup.ts` runs, the checks `pnpm check-live` runs against a deployed site (`@deck-cool/site-kit/live-check`), the reader of @carouseldeck/react's README and version at its latest release tag that carouseldeck's home page and deck.cool's card share (`@deck-cool/site-kit/carouseldeck-readme`, with a fixture README in `./carouseldeck-readme.fixture`; it throws when the checkout has no release tag), the highlighter that renders a skin's stylesheet and the README's quickstart as one `<pre>` (`@deck-cool/site-kit/highlight`), the helpers its build and browser tests use, and the load warning the root `vitest.config.ts` prints before `pnpm test`. A site keeps its own CSP in `src/csp.ts`; a short `src/headers.ts` that gives it to site-kit, with any powerful feature the site allows and, in pagedeck's and playdeck's, the `HASHED_PREFIXES` their `_headers` marks immutable; a `src/live-check.ts` that lists the paths its live check fetches; and its pages.

`packages/docs` (`@deck-cool/docs`) renders a deck's `@<deck>/docs` package under a site's `/docs`, per `docs/docs-contract.md` and ADR 0001. A site's `pagedeck.config.ts` calls its `defineDocs`, and can pass a rewrite of the docs' HTML as its `prose` option, such as `scrollableProse`. `demoComponent` gives a demo's component name, and `docsHref` a docs page's path. A site's tests read its docs pages, and the demos each marks, through `docsNav`.

deck.cool is deployed with wrangler, as Workers Static Assets, by `.github/workflows/deploy-deck-cool.yml`: a dry run on every push, a publish only on a manual run with `apply`. carouseldeck's site is deployed the same way to carousel.deck.cool, as the Worker `carouseldeck`, by `.github/workflows/deploy-carouseldeck.yml`, but only from a carouseldeck release: release.yml dispatches a run of it after tagging the release, and a manual run with `apply` does the same by hand, each publishing the latest `@carouseldeck/react@X.Y.Z` tag (ADR 0002). pagedeck's to page.deck.cool, as the Worker `pagedeck`, by `.github/workflows/deploy-pagedeck.yml`; playdeck's to play.deck.cool, as the Worker `play-deck-cool`, by `.github/workflows/deploy-playdeck.yml`; and drawerdeck's to drawer.deck.cool, as the Worker `drawerdeck`, by `.github/workflows/deploy-drawerdeck.yml`, a manual run with `apply` deploying `main` directly, as pagedeck's and playdeck's do, since drawerdeck is an in-repo deck with no release yet. Each one's dry run runs on a push that changes its site, `packages/` or the install, and carouseldeck's and drawerdeck's also on one that changes their deck's packages (`decks/carouseldeck/packages/`, `decks/drawerdeck/packages/`). The `drawerdeck` Worker does not exist yet, so only its dry run can pass today. CI and deck.cool's deploy check out every tag, for the card. `docs/deploy.md` is the runbook.

## carouseldeck

Its source lives in `decks/carouseldeck/`. Run its commands from the repo
root with `pnpm --dir decks/carouseldeck <script>`, and
`pnpm --dir decks/carouseldeck verify` before landing a change to it (ADR
0002). Its own ADRs are at `decks/carouseldeck/docs/adr/`, numbered on their
own. `decks/carouseldeck/AGENTS.md` covers what's specific to working in it.

## drawerdeck

Its source lives in `decks/drawerdeck/`. Run its commands from the repo
root with `pnpm --dir decks/drawerdeck <script>`, and
`pnpm --dir decks/drawerdeck verify` before landing a change to it. Its own
ADRs are at `decks/drawerdeck/docs/adr/`, numbered on their own.
`decks/drawerdeck/AGENTS.md` covers what's specific to working in it. The
engine (`@drawerdeck/core`) and the React 19 primitives (`@drawerdeck/react`)
are the beta (#240): bottom, modal only. `@drawerdeck/react-18` builds the
same source for React 18 too (#275). All three packages, and
`@drawerdeck/docs`, are publishable at `0.1.0-beta.0`, under the npm dist-tag
`beta` (#242); the maintainer still has to create the `@drawerdeck` npm scope
before the release workflow can publish them (`decks/drawerdeck/AGENTS.md`,
"Releasing").

## Releasing a deck

This section is for the decks that live in their own repos. carouseldeck lives in this repo, and its sites use it from the workspace, so it sends no dispatch and gets no bump PR (ADR 0002). It releases with Changesets, from `.changeset/` at the root, and `.github/workflows/release.yml`: a consumer-visible change to its packages needs a changeset (`pnpm changeset`), and the release runbook is `decks/carouseldeck/AGENTS.md`, "Releasing".

`.github/workflows/bump-deck.yml` sets every `@<deck>/*` dependency in the workspace to a deck's new version, updates the lockfile, and opens a PR titled `Bump <deck> to <version>` from the branch `bump/<deck>-<version>`. The PR merges itself, squashed, once CI passes. When a deck publishes a release, its dispatch tries this at once, and that first try usually fails on pnpm's one-day hold. The daily run bumps the release once it is a day old. A second dispatch for the same version does nothing. A dispatch for a version older than one the workspace already has fails and changes nothing: the workflow never downgrades. The bump logic is `packages/bump-deck`.

The workflow runs on a `repository_dispatch` of type `deck-released`, with this payload:

```json
{ "deck": "playdeck", "version": "1.4.0" }
```

`deck` is `playdeck` or `pagedeck`, and `version` is `MAJOR.MINOR.PATCH` with no `v`. The payload is untrusted. The workflow checks out the repo and sets up Node and pnpm first, none of which reads the payload. The payload then reaches only the check step, through env, and the workflow stops there on any other payload. Every later step reads the checked values.

pnpm holds back a version for `minimumReleaseAge` (a day), and the workflow keeps that hold: a dispatch for a younger version fails, says so, and pushes nothing. So the dispatch a release sends straight after `npm publish` fails on purpose.

The workflow also runs once a day, at 06:17 UTC, and on `gh workflow run bump-deck.yml` with no inputs. That run reads npm's latest version of every `@<deck>/*` package the workspace depends on, takes each deck's highest, and bumps each deck in turn, with the same checks as a dispatch. A version still inside the hold is skipped with a notice, and the run stays green. A later daily run bumps it.

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
            -f "client_payload[deck]=playdeck" \
            -f "client_payload[version]=${VERSION}"
```
