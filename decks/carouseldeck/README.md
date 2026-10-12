# Carouseldeck

A headless carousel for React 19 built on native CSS scroll snap: the browser
scrolls, and carouseldeck tracks where the deck rests and asks it to move.

```sh
pnpm add @carouseldeck/react
```

The documentation, with guides, the reference and recipes, each with a live
deck, is at [carousel.deck.cool/docs](https://carousel.deck.cool/docs/).
Its pages are markdown in [packages/docs](packages/docs), published as
`@carouseldeck/docs` with each release. The package README,
[packages/react/README.md](packages/react/README.md), has a quickstart and a
comparison with Embla and Keen.

| Package                                 | What it is                                      |
| --------------------------------------- | ----------------------------------------------- |
| [`@carouseldeck/react`](packages/react) | The React primitives. The only one to install.  |
| [`@carouseldeck/core`](packages/core)   | The framework-neutral engine `react` builds on. |
| [`@carouseldeck/docs`](packages/docs)   | The docs as markdown, for deck.cool's site.     |

Contributing: run `pnpm verify` before landing anything (see
[AGENTS.md](AGENTS.md)). Decisions are recorded in [docs/adr](docs/adr), and
the project's vocabulary in [CONTEXT.md](CONTEXT.md).

MIT licensed.
