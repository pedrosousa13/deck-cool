# Its own repo, MIT, with playdeck's tooling

Slidedeck began as an empty `apps/slidedeck` inside Fieldday, which is
AGPL-3.0 and gated on a migrated Postgres. A UI library adopted by companies
needs a permissive license and release cadence of its own, so slidedeck lives
in its own repo under MIT, published as `@slidedeck/core` and
`@slidedeck/react` (the bare `slidedeck` npm name is taken).

Tooling is copied from playdeck (turbo, changesets, storybook, a docs site,
bundle and library-comparison scripts, one `pnpm verify`) rather than shared
through a monorepo with it. The two share no code; a merged repo would tangle
their CI and releases for nothing. Revisit if real code becomes shared.

A feature checklist was taken from a private company carousel built on
keen-slider. Only the feature list carries over; none of its code does.
