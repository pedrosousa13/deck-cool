# Docs arrive as an npm package

Amended by [ADR 0002](0002-a-deck-lives-in-this-repo.md) on 2026-10-12. For a deck that lives in this repo, the `deck-released` dispatch and the bump PR below go away: its site depends on its packages as `workspace:*` and deploys from the release's own commit. The first reason, that a site describes the latest release, still holds. The decks still in their own repos keep everything below.

Each deck's reference docs stay in that deck's own repo, as plain markdown with frontmatter, and the deck-cool site for that deck reads them at build time. The deck publishes them as a sibling npm package of markdown only (`@slidedeck/docs`, `@playdeck/docs`, `@pagedeck/docs`) at the same version as its code, and the site depends on that exact version. The contract the package follows is in [`docs/docs-contract.md`](../docs-contract.md). Decided with the maintainer on 2026-10-08 (#7).

## Why

- **A site describes the latest release.** The docs package has the code's version, so the docs a site shows always match a version someone can install. A docs-only fix ships with the next patch release.
- **The deck owns its reference docs, deck-cool owns the site.** Guides, API and examples live next to the code and its doc-example tests, which keep running in the deck's repo. deck-cool owns each site's landing page, the Family bar and the layout, and checks only that the docs build.
- **It survives a monorepo.** The site resolves the package through Node resolution, so if the decks and the sites become one monorepo the dependency becomes `workspace:*` and nothing else changes.
- **Demos stay out of the markdown.** A page marks a demo with `<!-- demo:<name> -->` on its own line, and the site swaps in the island it owns under that name. The docs package holds no components, and an unknown name fails the build.

## Considered options

#7 asked for one loader that covers both a pinned release and a future monorepo.

- **Fetch the repo at a pinned release tag.** Needs a second mode, a local path, once the repos are one monorepo.
- **A release artifact.** The same second mode, plus its own upload and download steps.

An npm package covers both with one resolution: a pinned version today, `workspace:*` later.

## Consequences

- **Releases update the sites by PR.** After `npm publish`, a deck's release workflow sends a `repository_dispatch` to deck-cool. A deck-cool workflow bumps that deck's packages to the exact new version and opens a PR, which merges itself once the checks pass.
- **A GitHub App supplies the tokens**, so those PRs run CI and no personal token expires.
- **`@pagedeck/docs` carries what page.deck.cool's docs show today:** `packages/docs/content/` plus the published part of pagedeck's `docs/` (`adr/`, `deploy-recipe.md`, `error-messages.md`). No files move in the pagedeck repo.
