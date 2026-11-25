# Accordiondeck

A headless accordion and collapsible for React, built on `<details>` and
`<summary>`.

| Package                                        | What it is                                  |
| ---------------------------------------------- | ------------------------------------------- |
| [`@accordiondeck/react`](packages/react)       | The React 19 primitives. Not published yet. |
| [`@accordiondeck/react-18`](packages/react-18) | The same primitives, built for React 18.    |
| [`@accordiondeck/docs`](packages/docs)         | The docs, as markdown, for deck.cool.       |

No package has behaviour yet: each exports a placeholder, and all three stay
`private` at `0.0.0` until the first release. The map is
pedrosousa13/deck-cool#360.

Contributing: run `pnpm verify` before landing anything (see
[AGENTS.md](AGENTS.md)). Decisions are recorded in [docs/adr](docs/adr), and
the project's vocabulary in the root [GLOSSARY.md](../../GLOSSARY.md).

MIT licensed.
